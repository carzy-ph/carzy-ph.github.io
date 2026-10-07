// "Connect Google Drive" for agents: Google's pop-up asks the agent to let Carzy save files in their
// Drive (only files Carzy creates), then the drive-connect function stores the connection.
import { CONFIG } from '@/config';
import { loadGsi } from './googleButton';
import { supabase } from './supabase';

const SCOPE = 'openid email https://www.googleapis.com/auth/drive.file';

interface CodeClient { requestCode(): void }
type CodeResponse = { code?: string; error?: string; error_description?: string };
type GsiOauth2 = {
  initCodeClient(o: {
    client_id: string; scope: string; ux_mode: 'popup'; select_account?: boolean; login_hint?: string;
    callback: (r: CodeResponse) => void; error_callback?: (e: { type: string }) => void;
  }): CodeClient;
};

async function call(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('drive-connect', { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const detail = ctx ? await ctx.json().catch(() => null) as { error?: string } | null : null;
    throw new Error(detail?.error || 'Couldn’t reach Carzy. Try again in a moment.');
  }
  return data as { ok: boolean; account?: string };
}

/** Opens Google's pop-up, then saves the connection. Resolves to the connected Google account. */
export async function connectDrive(loginHint?: string): Promise<string> {
  if (!CONFIG.googleClientId) throw new Error('Google sign-in isn’t set up for this site.');
  await loadGsi();
  const oauth2 = (window as unknown as { google: { accounts: { oauth2: GsiOauth2 } } }).google.accounts.oauth2;
  const code = await new Promise<string>((resolve, reject) => {
    oauth2.initCodeClient({
      client_id: CONFIG.googleClientId,
      scope: SCOPE,
      ux_mode: 'popup',
      select_account: true,
      login_hint: loginHint,
      callback: r => (r.code ? resolve(r.code) : reject(new Error(r.error_description || 'Google didn’t connect. Try again.'))),
      error_callback: e => reject(new Error(e.type === 'popup_closed'
        ? 'The Google window was closed before connecting.'
        : 'Couldn’t open Google’s window. Allow pop-ups for this site and try again.'))
    }).requestCode();
  });
  const r = await call({ action: 'connect', code });
  return r.account ?? '';
}

export async function disconnectDrive() {
  await call({ action: 'disconnect' });
}

/**
 * Deletes an application for good (admins, or the agent whose card it came from). Its uploaded files
 * go to the trash in the agent's Google Drive. files: 'kept' means they couldn't be, so the agent
 * should delete the Drive folder named `folder` themselves.
 */
export async function deleteApplication(id: string): Promise<{ files: 'none' | 'trashed' | 'kept'; folder: string }> {
  const { data, error } = await supabase.functions.invoke('delete-application', { body: { application_id: id } });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const detail = ctx ? await ctx.json().catch(() => null) as { error?: string } | null : null;
    throw new Error(detail?.error || 'Couldn’t reach Carzy. Try again in a moment.');
  }
  return data as { files: 'none' | 'trashed' | 'kept'; folder: string };
}
