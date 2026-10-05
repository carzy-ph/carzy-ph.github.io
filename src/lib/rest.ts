// Minimal Supabase REST client for the public card page. The full supabase-js library is only
// loaded by the portal, which keeps the card page small for clients on mobile data.
import { CONFIG } from '@/config';

function headers(): Record<string, string> {
  const h: Record<string, string> = { apikey: CONFIG.supabaseKey, 'Content-Type': 'application/json' };
  // Legacy anon keys are JWTs and also go in Authorization; new sb_publishable_ keys must not.
  if (!CONFIG.supabaseKey.startsWith('sb_')) h.Authorization = 'Bearer ' + CONFIG.supabaseKey;
  return h;
}

export async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(CONFIG.supabaseUrl.replace(/\/$/, '') + '/rest/v1/' + path, {
    ...init,
    headers: { ...headers(), ...(init.headers as Record<string, string> | undefined) }
  });
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg = (body as { message?: string } | null)?.message;
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return body as T;
}

export const rpc = <T>(fn: string, args: Record<string, unknown> = {}) =>
  rest<T>('rpc/' + fn, { method: 'POST', body: JSON.stringify(args) });
