// Requirements upload from a client (no sign-in; protected by their application's private link).
//   start  → checks the link, finds/creates "<ref> - <name>" in the agent's "Carzy requirements"
//            folder, and returns a one-time Google upload address. The browser then sends the file
//            straight to Google, so large files never pass through this function.
//   finish → confirms the file landed in that folder and records it on the application.
import { admin, json, serve } from '../_shared/http.ts';
import { UserError, accessToken, drive, findFolder, findOrCreateFolder, rootFolder } from '../_shared/google.ts';

const TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 20;

serve(async req => {
  const db = admin();
  const b = await req.json().catch(() => ({}));
  if (typeof b.ref !== 'string' || typeof b.token !== 'string' || !b.token) throw new UserError('This upload link isn’t valid. Ask your agent for a new one.');

  const { data: app } = await db.from('applications')
    .select('id, ref, full_name, agent_id, upload_expires, documents')
    .eq('ref', b.ref).eq('upload_token', b.token).maybeSingle();
  if (!app || !app.upload_expires || new Date(app.upload_expires) < new Date()) {
    throw new UserError('This upload link has expired or isn’t valid. Ask your agent for a new one.');
  }
  if ((app.documents ?? []).length >= MAX_FILES) throw new UserError(`This application already has ${MAX_FILES} files.`);

  const { data: conn } = await db.from('agent_drive').select('refresh_token, folder_id').eq('agent_id', app.agent_id).maybeSingle();
  if (!conn?.refresh_token) throw new UserError('Your agent hasn’t connected Google Drive yet. Send your documents to them directly for now.');

  let token: string;
  try {
    token = await accessToken(conn.refresh_token);
  } catch (e) {
    if (e instanceof UserError && e.message === 'invalid_grant') {
      // The agent removed Carzy's access in their Google account: mark it disconnected.
      await db.from('agent_drive').update({ refresh_token: null }).eq('agent_id', app.agent_id);
      throw new UserError('Your agent’s Google Drive connection has ended. Ask them to reconnect it in their portal.');
    }
    throw e;
  }

  const root = await rootFolder(token, conn.folder_id);
  if (root !== conn.folder_id) await db.from('agent_drive').update({ folder_id: root }).eq('agent_id', app.agent_id);
  const subName = `${app.ref} - ${app.full_name}`;

  if (b.action === 'start') {
    if (!TYPES.includes(b.mime)) throw new UserError('Upload a PDF, JPG, PNG or WebP file.');
    const size = Number(b.size);
    if (!(size > 0) || size > MAX_BYTES) throw new UserError('Files must be 10 MB or smaller.');
    const sub = await findOrCreateFolder(token, subName, root);
    const type = String(b.type || 'Document').slice(0, 60);
    const name = `${type} - ${String(b.name || 'file').slice(0, 120)}`.replace(/[\\/:*?"<>|]/g, '_');

    // Resumable upload session. Passing the site's Origin lets the browser send the file directly.
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': b.mime,
        'X-Upload-Content-Length': String(size),
        ...(req.headers.get('origin') ? { Origin: req.headers.get('origin')! } : {})
      },
      body: JSON.stringify({ name, parents: [sub] })
    });
    const uploadUrl = res.headers.get('location');
    if (!res.ok || !uploadUrl) throw new Error(`Couldn't start the Drive upload (${res.status}): ${await res.text()}`);
    return json({ ok: true, upload_url: uploadUrl, name });
  }

  if (b.action === 'finish') {
    if (typeof b.file_id !== 'string') throw new UserError('Missing the uploaded file.');
    const sub = await findFolder(token, subName, root);
    const file = await drive(token, `files/${encodeURIComponent(b.file_id)}?fields=id,name,size,parents,webViewLink,trashed`);
    if (!file || file.trashed || !sub || !(file.parents ?? []).includes(sub)) throw new UserError('That upload didn’t finish. Try again.');
    const { data: count, error } = await db.rpc('add_application_document', {
      p_ref: b.ref, p_token: b.token,
      p_doc: { name: file.name, type: String(b.type || 'Document').slice(0, 60), url: file.webViewLink, size: Number(file.size ?? 0) }
    });
    if (error) throw new UserError(error.message);
    return json({ ok: true, name: file.name, count });
  }

  throw new UserError('Unknown request.');
});
