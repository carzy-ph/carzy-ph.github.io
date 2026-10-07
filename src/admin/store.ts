// Portal state: who is signed in and the data they're allowed to see.
// The database rules decide what each query returns, so agents only ever receive their own rows.
import { computed, reactive } from 'vue';
import type { Agent, AgentDrive, AgentStats, Application, Brand, TeamMember, UnitModel } from '@/types';
import { isConfigured } from '@/config';
import { supabase } from '@/lib/supabase';
import { cardColor } from '@/lib/catalog';

type Phase = 'setup' | 'loading' | 'signed-out' | 'no-access' | 'error' | 'ready';
/** Which address the app was opened at: /admin/ (admins) or /portal/ (agents). */
export type Area = 'admin' | 'agent';

export const areaUrl = (area: Area) => import.meta.env.BASE_URL + (area === 'admin' ? 'admin/' : 'portal/');

export const store = reactive({
  phase: 'loading' as Phase,
  area: 'admin' as Area,
  email: '',
  error: '',
  /** Message from a failed Google / email-link sign-in, shown on the sign-in screen. */
  authError: '',
  me: null as TeamMember | null,
  agents: [] as Agent[],
  brands: [] as Brand[],
  models: [] as UnitModel[],
  stats: {} as Record<string, AgentStats>,
  applications: [] as Application[],
  team: [] as TeamMember[],
  /** Each agent's own upload service, by agent id (admins see all; agents their own). */
  drives: {} as Record<string, AgentDrive>
});

/** Admin screens and powers apply only at /admin/. At /portal/ everyone, admins included, works as an agent. */
export const isAdmin = computed(() => store.me?.role === 'admin' && store.area === 'admin');
/** This login can open the other area too (an admin who is also linked to an agent card). */
export const canSwitchArea = computed(() => store.me?.role === 'admin' && Boolean(store.me?.agent_id));
export const myAgent = computed(() => store.agents.find(a => a.id === store.me?.agent_id) ?? null);
export const agentById = (id: string | null | undefined) => store.agents.find(a => a.id === id) ?? null;
export const brandName = (id: string | null | undefined) => store.brands.find(b => b.id === id)?.name ?? '';
/** Card color as clients see it (hidden brands don't lend their color, same as the card page). */
export const agentColor = (a: Pick<Agent, 'brand_id' | 'theme'>) => cardColor(a, store.brands.filter(b => b.active));
export const newCount = computed(() => store.applications.filter(a => a.status === 'new' && !a.archived_at).length);

export function friendly(e: unknown): string {
  const err = e as { code?: string; message?: string } | null;
  if (err?.code === '23505') return 'That card address is already used by another agent. Pick a different one.';
  if (err?.code === '42501') return 'You don’t have permission to do that.';
  return err?.message || 'Something went wrong. Try again.';
}

let booting: Promise<void> | null = null;

// After Google (or an email link) sends someone back, the address carries ?code=… or ?error=….
// Supabase exchanges the code while starting up; afterwards we tidy the address and keep any error.
function takeAuthResult() {
  const url = new URL(location.href);
  const keys = ['code', 'error', 'error_code', 'error_description', 'state'];
  if (!keys.some(k => url.searchParams.has(k))) return;
  const desc = url.searchParams.get('error_description');
  if (desc) store.authError = desc;
  keys.forEach(k => url.searchParams.delete(k));
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);
}

export function boot(): Promise<void> {
  if (!isConfigured) { store.phase = 'setup'; return Promise.resolve(); }
  booting ??= (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      takeAuthResult();
      if (!session) { store.phase = 'signed-out'; return; }
      store.authError = '';
      store.email = (session.user.email || '').toLowerCase();
      const { data: me, error } = await supabase.from('team').select('*').eq('email', store.email).maybeSingle<TeamMember>();
      if (error) throw error;
      if (!me || (me.role === 'agent' && !me.agent_id)) { store.phase = 'no-access'; return; }
      // Signed in at the other area's address: go there (the session carries over, no new sign-in).
      // Admins may use both addresses if they're also linked to an agent card; agents only /portal/.
      const allowed: Area[] = me.role === 'admin' ? (me.agent_id ? ['admin', 'agent'] : ['admin']) : ['agent'];
      if (!allowed.includes(store.area)) { location.replace(areaUrl(allowed[0]!)); return; }
      store.me = me;
      await loadAll();
      store.phase = 'ready';
    } catch (e) {
      store.error = friendly(e);
      store.phase = 'error';
    } finally {
      booting = null;
    }
  })();
  return booting;
}

export async function loadAll() {
  const admin = isAdmin.value;
  const [ag, br, md, st, ap, tm, dr] = await Promise.all([
    supabase.from('agents').select('*').order('name'),
    supabase.from('brands').select('*').order('sort').order('name'),
    supabase.from('models').select('*').order('sort').order('name'),
    supabase.rpc('agent_stats'),
    supabase.from('applications').select('*').order('created_at', { ascending: false }).limit(2000),
    admin ? supabase.from('team').select('*') : Promise.resolve({ data: [], error: null }),
    supabase.from('agent_drive').select('agent_id, account, folder_id, connected_at')
  ]);
  for (const r of [ag, br, md, st, ap, tm]) if (r.error) throw r.error;
  // Uploads are optional: if the database hasn't been updated for them yet, the portal still works.
  if (dr.error) console.warn('Requirements upload settings unavailable:', dr.error.message);
  store.drives = Object.fromEntries(((dr.error ? [] : dr.data ?? []) as AgentDrive[]).map(d => [d.agent_id, d]));
  store.brands = (br.data ?? []) as Brand[];
  store.models = (md.data ?? []) as UnitModel[];
  const agents = (ag.data ?? []) as Agent[];
  store.agents = admin ? agents : agents.filter(a => a.id === store.me?.agent_id);
  store.stats = Object.fromEntries(((st.data ?? []) as AgentStats[]).map(r => [r.agent_id, r]));
  // The database lets admins read everything; at /portal/ an admin sees only their own card's applications.
  const apps = (ap.data ?? []) as Application[];
  store.applications = admin ? apps : apps.filter(a => a.agent_id === store.me?.agent_id);
  store.team = (tm.data ?? []) as TeamMember[];
  // Pick up changes to your own login (e.g. you just linked yourself to an agent card).
  const mine = store.team.find(t => t.email === store.email);
  if (mine) store.me = mine;
}

export async function signOut() {
  await supabase.auth.signOut();
  Object.assign(store, { phase: 'signed-out', me: null, email: '', agents: [], brands: [], models: [], stats: {}, applications: [], team: [], drives: {} });
}

// A magic-link click signs in on page load.
supabase.auth.onAuthStateChange(event => {
  if (event === 'SIGNED_IN' && store.phase === 'signed-out') setTimeout(boot, 0);
});
