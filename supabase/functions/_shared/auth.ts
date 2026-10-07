// Who is calling, for functions used from the portal: their team row (role and agent card).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { UserError } from './google.ts';

export interface Member { email: string; role: 'admin' | 'agent'; agent_id: string | null }

export async function member(req: Request, db: SupabaseClient): Promise<Member> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await db.auth.getUser(jwt);
  const email = auth?.user?.email?.toLowerCase();
  if (!email) throw new UserError('Sign in to the portal again, then try once more.');
  const { data: me } = await db.from('team').select('role, agent_id').eq('email', email).maybeSingle();
  if (!me) throw new UserError('You don’t have access to this application.');
  return { email, role: me.role, agent_id: me.agent_id };
}

/** Admins may act on any application; agents only on applications from their own card. */
export const canManage = (me: Member, agentId: string) => me.role === 'admin' || me.agent_id === agentId;
