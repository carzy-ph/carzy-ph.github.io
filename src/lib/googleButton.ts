// Google's own "Sign in with Google" button (Google Identity Services), shown on the portal page.
// Google's screen then names this site (e.g. samplemotors-ph.github.io) instead of the Supabase address.
// The ID token it returns is handed to Supabase, which checks it against the Google provider settings.
import { CONFIG } from '@/config';
import { supabase } from './supabase';

interface GoogleId {
  initialize(o: { client_id: string; callback: (r: { credential: string }) => void; nonce: string; ux_mode?: 'popup'; itp_support?: boolean; use_fedcm_for_button?: boolean }): void;
  renderButton(el: HTMLElement, o: Record<string, string | number>): void;
}
declare global { interface Window { google?: { accounts: { id: GoogleId } } } }

let scriptLoad: Promise<void> | null = null;
export function loadGsi(): Promise<void> {
  scriptLoad ??= new Promise((resolve, reject) => {
    const s = Object.assign(document.createElement('script'), { src: 'https://accounts.google.com/gsi/client', async: true });
    s.onload = () => resolve();
    s.onerror = () => { scriptLoad = null; reject(new Error('Couldn’t reach Google. Check your connection and reload the page.')); };
    document.head.appendChild(s);
  });
  return scriptLoad;
}

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export const googleButtonAvailable = () => Boolean(CONFIG.googleClientId);

/**
 * Renders Google's button into `el`. `onSignedIn` runs after Supabase accepts the Google sign-in;
 * `onError` gets a message to show. Call again to re-render (e.g. after a light/dark switch).
 */
export async function renderGoogleButton(
  el: HTMLElement,
  opts: { dark: boolean; onSignedIn: () => void; onError: (msg: string) => void }
) {
  await loadGsi();
  // A fresh nonce per render: Google signs the hashed one into the token, Supabase checks the raw one.
  const raw = crypto.randomUUID();
  const hashed = await sha256Hex(raw);
  const gid = window.google!.accounts.id;
  gid.initialize({
    client_id: CONFIG.googleClientId,
    nonce: hashed,
    ux_mode: 'popup',
    itp_support: true,
    use_fedcm_for_button: true,
    callback: async ({ credential }) => {
      const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: credential, nonce: raw });
      if (error) opts.onError(error.message);
      else opts.onSignedIn();
    }
  });
  el.innerHTML = '';
  gid.renderButton(el, {
    type: 'standard',
    // Google's black button in dark mode, white in light mode. Google's brand rules keep the G on a white
    // tile in every style; the pill shape makes that a neat circle instead of a square.
    theme: opts.dark ? 'filled_black' : 'outline',
    size: 'large',
    text: 'continue_with',
    shape: 'pill',
    logo_alignment: 'center',
    locale: 'en', // match the rest of the site instead of the browser's language
    width: Math.min(400, Math.max(200, Math.round(el.clientWidth || 320)))
  });
}
