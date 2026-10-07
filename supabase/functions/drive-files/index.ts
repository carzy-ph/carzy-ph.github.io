// Fetches one uploaded requirement from the agent's Google Drive, for the "Export PDF" in the portal.
// Only admins and the application's own agent may fetch; the agent's Google token stays on the server.
import { admin, cors, serve } from '../_shared/http.ts';
import { UserError, accessToken } from '../_shared/google.ts';
import { canManage, member } from '../_shared/auth.ts';

serve(async req => {
  const db = admin();
  const me = await member(req, db);

  const body = await req.json().catch(() => ({}));
  const { data: app } = await db.from('applications').select('id, agent_id, documents')
    .eq('id', String(body.application_id ?? '')).maybeSingle();
  if (!app || !canManage(me, app.agent_id)) throw new UserError('You don’t have access to this application.');

  const doc = (app.documents ?? [])[Number(body.index)];
  if (!doc) throw new UserError('That file isn’t on this application.');
  const fileId = doc.id || /\/file\/d\/([A-Za-z0-9_-]+)/.exec(doc.url ?? '')?.[1];
  if (!fileId) throw new UserError(`Couldn’t find “${doc.name}” in Google Drive.`);

  const { data: conn } = await db.from('agent_drive').select('refresh_token').eq('agent_id', app.agent_id).maybeSingle();
  if (!conn?.refresh_token) throw new UserError('The agent’s Google Drive isn’t connected, so the files can’t be added. Reconnect it under My card.');
  let token: string;
  try { token = await accessToken(conn.refresh_token); }
  catch { throw new UserError('The agent’s Google Drive connection has ended. Reconnect it under My card.'); }

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: 'Bearer ' + token }
  });
  if (!res.ok) throw new UserError(`Couldn’t get “${doc.name}” from Google Drive. It may have been deleted or moved.`);
  // Binary body; the real type goes in a header (supabase-js would mangle non-binary content types).
  return new Response(res.body, {
    headers: { ...cors, 'Access-Control-Expose-Headers': 'x-file-type', 'Content-Type': 'application/octet-stream', 'x-file-type': res.headers.get('content-type') ?? '' }
  });
});
