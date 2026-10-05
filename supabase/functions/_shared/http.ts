import { createClient } from 'npm:@supabase/supabase-js@2';
import { UserError } from './google.ts';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** Database access with the service key (bypasses row rules; every function checks access itself). */
export const admin = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
);

/** Runs a handler with CORS and turns errors into { ok: false, error } responses. */
export function serve(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async req => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    try {
      return await handler(req);
    } catch (e) {
      if (e instanceof UserError) return json({ ok: false, error: e.message }, 400);
      console.error(e);
      return json({ ok: false, error: 'Something went wrong on our side. Try again in a moment.' }, 500);
    }
  });
}
