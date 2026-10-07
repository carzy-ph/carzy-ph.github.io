// "Delete" on an application in the portal: admins, or the agent whose card it came from.
// Moves the client's uploaded requirements to the trash in the agent's Google Drive (the agent can
// restore them from there for 30 days), then deletes the application for good.
import { admin, json, serve } from '../_shared/http.ts';
import { UserError, accessToken, drive, findFolder } from '../_shared/google.ts';
import { canManage, member } from '../_shared/auth.ts';

type Doc = { id?: string; url?: string };

/** Trashes the application's Drive folder (or its files one by one). Returns false if any are left. */
async function trashFiles(token: string, rootId: string | null, folderName: string, docs: Doc[]): Promise<boolean> {
  const trash = (id: string) => drive(token, `files/${encodeURIComponent(id)}?fields=id`, { method: 'PATCH', body: JSON.stringify({ trashed: true }) });
  const folder = rootId ? await findFolder(token, folderName, rootId) : null;
  if (folder) { await trash(folder); return true; }
  // Folder renamed or moved: trash each file Carzy saved.
  let ok = true;
  for (const d of docs) {
    const id = d.id || /\/file\/d\/([A-Za-z0-9_-]+)/.exec(d.url ?? '')?.[1];
    if (!id) { ok = false; continue; }
    try { await trash(id); } catch { ok = false; }
  }
  return ok;
}

serve(async req => {
  const db = admin();
  const me = await member(req, db);
  const body = await req.json().catch(() => ({}));

  const { data: app } = await db.from('applications').select('id, ref, full_name, agent_id, documents')
    .eq('id', String(body.application_id ?? '')).maybeSingle();
  if (!app || !canManage(me, app.agent_id)) throw new UserError('You don’t have access to this application.');

  // Files first, so nothing is left behind silently. If Drive can't be reached the application is
  // still deleted and the agent is told to remove the folder themselves.
  const docs: Doc[] = app.documents ?? [];
  let files: 'none' | 'trashed' | 'kept' = docs.length ? 'kept' : 'none';
  if (docs.length) {
    const { data: conn } = await db.from('agent_drive').select('refresh_token, folder_id').eq('agent_id', app.agent_id).maybeSingle();
    if (conn?.refresh_token) {
      try {
        const token = await accessToken(conn.refresh_token);
        if (await trashFiles(token, conn.folder_id, `${app.ref} - ${app.full_name}`, docs)) files = 'trashed';
      } catch (e) {
        console.error('trash failed', e);
      }
    }
  }

  const { error } = await db.from('applications').delete().eq('id', app.id);
  if (error) throw new Error(error.message);
  return json({ ok: true, files, folder: `${app.ref} - ${app.full_name}` });
});
