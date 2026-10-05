// Google OAuth + Drive helpers for the Carzy functions.
// Uses the "drive.file" permission: Carzy can only see and edit files it created in the agent's Drive.

const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const ROOT_FOLDER = 'Carzy requirements';
const FOLDER = 'application/vnd.google-apps.folder';

export class UserError extends Error {}

function needSecrets() {
  if (!CLIENT_ID || !CLIENT_SECRET) throw new UserError('Google Drive isn’t set up on the server yet (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).');
}

async function tokenRequest(params: Record<string, string>) {
  needSecrets();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params })
  });
  const data = await res.json();
  if (!res.ok) {
    if (data.error === 'invalid_grant') throw new UserError('invalid_grant');
    throw new Error(`Google token error: ${data.error_description || data.error || res.status}`);
  }
  return data as { access_token: string; refresh_token?: string; id_token?: string; scope?: string };
}

/** Code from the portal's "Connect Google Drive" pop-up → tokens. */
export const exchangeCode = (code: string) =>
  tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: 'postmessage' });

/** A fresh access token from the agent's stored refresh token. Throws UserError('invalid_grant') if revoked. */
export async function accessToken(refreshToken: string) {
  return (await tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' })).access_token;
}

export async function revoke(token: string) {
  await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(token), { method: 'POST' }).catch(() => {});
}

/** Email inside Google's id_token (it comes straight from Google over HTTPS, so no signature check needed). */
export function emailFromIdToken(idToken?: string): string {
  try {
    const part = idToken!.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/');
    return String(JSON.parse(atob(part)).email ?? '').toLowerCase();
  } catch { return ''; }
}

export async function drive(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch('https://www.googleapis.com/drive/v3/' + path, {
    ...init,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
  });
  if (res.status === 404) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(`Google Drive error: ${data.error?.message ?? res.status}`);
  return data;
}

const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** A folder Carzy created (by name, inside `parent` or the Drive root), or null. */
export async function findFolder(token: string, name: string, parent?: string): Promise<string | null> {
  const query = `mimeType='${FOLDER}' and name='${q(name)}' and trashed=false and '${parent ?? 'root'}' in parents`;
  const data = await drive(token, `files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1&spaces=drive`);
  return data?.files?.[0]?.id ?? null;
}

export async function findOrCreateFolder(token: string, name: string, parent?: string): Promise<string> {
  const found = await findFolder(token, name, parent);
  if (found) return found;
  const created = await drive(token, 'files?fields=id', {
    method: 'POST',
    body: JSON.stringify({ name, mimeType: FOLDER, parents: parent ? [parent] : undefined })
  });
  return created.id;
}

/** The agent's "Carzy requirements" folder, recreated if they deleted or trashed it. */
export async function rootFolder(token: string, savedId: string | null): Promise<string> {
  if (savedId) {
    const f = await drive(token, `files/${savedId}?fields=id,trashed`);
    if (f && !f.trashed) return savedId;
  }
  return findOrCreateFolder(token, ROOT_FOLDER);
}
