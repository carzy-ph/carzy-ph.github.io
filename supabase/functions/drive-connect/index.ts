// "Connect Google Drive" / "Disconnect" for an agent, from their portal (requires their sign-in).
// Connect: exchanges the Google pop-up code for a lasting (refresh) token, creates the agent's
// "Carzy requirements" folder, and stores the connection. The token never leaves the server.
import { admin, json, serve } from '../_shared/http.ts';
import { DRIVE_SCOPE, UserError, emailFromIdToken, exchangeCode, revoke, rootFolder } from '../_shared/google.ts';

serve(async req => {
  const db = admin();
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await db.auth.getUser(jwt);
  const email = auth?.user?.email?.toLowerCase();
  if (!email) throw new UserError('Sign in to the portal again, then try once more.');

  // Only the agent themselves (or an admin linked to that card) connects their own Drive.
  const { data: me } = await db.from('team').select('agent_id').eq('email', email).maybeSingle();
  if (!me?.agent_id) throw new UserError('Only agents can connect Google Drive, from their own card in the Agent Portal.');
  const agentId = me.agent_id as string;

  const body = await req.json().catch(() => ({}));

  if (body.action === 'disconnect') {
    const { data: row } = await db.from('agent_drive').select('refresh_token').eq('agent_id', agentId).maybeSingle();
    if (row?.refresh_token) await revoke(row.refresh_token);
    await db.from('agent_drive').delete().eq('agent_id', agentId);
    return json({ ok: true });
  }

  if (body.action !== 'connect' || typeof body.code !== 'string') throw new UserError('Missing the Google sign-in code.');
  const tokens = await exchangeCode(body.code);
  if (!String(tokens.scope ?? '').includes(DRIVE_SCOPE)) {
    throw new UserError('Please allow Carzy to save files in your Google Drive (tick the box on Google’s screen), then try again.');
  }

  const { data: existing } = await db.from('agent_drive').select('refresh_token, folder_id').eq('agent_id', agentId).maybeSingle();
  const refresh = tokens.refresh_token ?? existing?.refresh_token;
  if (!refresh) {
    throw new UserError('Google didn’t give Carzy lasting access. Remove Carzy at myaccount.google.com/permissions, then connect again.');
  }

  const folderId = await rootFolder(tokens.access_token, existing?.folder_id ?? null);
  const account = emailFromIdToken(tokens.id_token);
  const { error } = await db.from('agent_drive').upsert({
    agent_id: agentId, account, folder_id: folderId, refresh_token: refresh, connected_at: new Date().toISOString()
  });
  if (error) throw error;
  return json({ ok: true, account, folder_id: folderId });
});
