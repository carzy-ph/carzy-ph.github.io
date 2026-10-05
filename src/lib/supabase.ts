import { createClient } from '@supabase/supabase-js';
import { CONFIG } from '@/config';

// When Supabase isn't configured yet the portal shows a setup notice and never calls this client;
// the placeholder values only keep createClient from throwing.
export const supabase = createClient(
  CONFIG.supabaseUrl || 'http://localhost:54321',
  CONFIG.supabaseKey || 'not-configured',
  // PKCE returns sign-ins (Google, email links) as ?code=… instead of #access_token=…,
  // which would collide with the portal's #/hash routes.
  { auth: { flowType: 'pkce' } }
);
