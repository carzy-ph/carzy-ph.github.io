// Runs after `vite build`. Turns dist/card.html into one page per agent at
// dist/cards/<slug>/index.html, plus dist/404.html for agents added since the last deploy.
// Each page carries a copy of the agent's profile, so the card opens even if Supabase is
// slow or paused, and link previews (Messenger, Viber) show the agent's name and photo.
//
//   node scripts/build-cards.mjs           # agents from Supabase (what the deploy workflow runs)
//   node scripts/build-cards.mjs --sample  # agents from src/sample/agents.json
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';

for (const f of ['.env.local', '.env']) { try { process.loadEnvFile(f); } catch { /* file not present */ } }

const dist = new URL('../dist/', import.meta.url);
const sample = process.argv.includes('--sample');
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_KEY;

async function get(path) {
  const headers = { apikey: key };
  if (!key.startsWith('sb_')) headers.Authorization = 'Bearer ' + key;
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${path}`, { headers });
  if (!res.ok) throw new Error(`Supabase returned ${res.status} for ${path}: ${await res.text()}`);
  return res.json();
}
const readJson = async p => JSON.parse(await readFile(new URL(p, import.meta.url), 'utf8'));

let agents, brands, models;
if (sample) {
  agents = await readJson('../src/sample/agents.json');
  ({ brands, models } = await readJson('../src/sample/catalog.json'));
} else if (url && key) {
  [agents, brands, models] = await Promise.all([
    get('agents?select=*&order=slug'), get('brands?active=is.true&select=*'), get('models?active=is.true&select=*')
  ]);
} else {
  console.warn('VITE_SUPABASE_URL / VITE_SUPABASE_KEY not set: building only 404.html (cards load live).');
  [agents, brands, models] = [[], [], []];
}

// Same rule as src/lib/catalog.ts: active units, limited to the agent's brand when they have one.
const bySort = (a, b) => a.sort - b.sort || a.name.localeCompare(b.name);
function catalogFor(brandId) {
  const b = brands.filter(x => x.active && (!brandId || x.id === brandId)).sort(bySort);
  const ids = new Set(b.map(x => x.id));
  return { brands: b, models: models.filter(m => m.active && ids.has(m.brand_id)).sort(bySort) };
}

const template = await readFile(new URL('card.html', dist), 'utf8');
const attr = s => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// JSON inside <script>: escape "<" so a value can never close the tag.
const json = v => JSON.stringify(v).replace(/</g, '\\u003c');

function page({ title, description, image, theme, snapshot }) {
  const meta = [
    `<meta name="description" content="${attr(description)}">`,
    '<meta property="og:type" content="profile">',
    `<meta property="og:title" content="${attr(title)}">`,
    `<meta property="og:description" content="${attr(description)}">`,
    image ? `<meta property="og:image" content="${attr(image)}">` : ''
  ].filter(Boolean).join('\n');
  return template
    .replace('<!--META-->', meta)
    .replace('<title>Agent card</title>', `<title>${attr(title)}</title>`)
    .replace('<meta name="theme-color" content="#0F4C5C">', `<meta name="theme-color" content="${attr(theme)}">`)
    .replace('<!--SNAPSHOT-->', snapshot ? `<script id="agent-snapshot" type="application/json">${json(snapshot)}</script>` : '');
}

await rm(new URL('cards/', dist), { recursive: true, force: true });

for (const a of agents) {
  const dir = new URL(`cards/${a.slug}/`, dist);
  await mkdir(dir, { recursive: true });
  const where = [a.dealership, a.branch].filter(Boolean).join(', ');
  await writeFile(new URL('index.html', dir), page({
    title: a.active ? `${a.name} · ${a.title}` : a.dealership || 'Agent card',
    description: a.active ? `${a.title} at ${where}. Call, message, or apply for your car loan online.` : `Contact ${a.dealership}.`,
    image: a.active ? a.photo_url : null,
    // Same rule as cardColor() in src/lib/catalog.ts.
    theme: brands.find(b => b.id === a.brand_id)?.color || a.theme,
    snapshot: { agent: a, catalog: catalogFor(a.brand_id) }
  }));
}

await writeFile(new URL('404.html', dist), page({
  title: 'Agent card', description: 'Car dealer agent card.', image: null, theme: '#0F4C5C', snapshot: null
}));

console.log(`Built ${agents.length} card page(s)${sample ? ' from sample data' : ''}.`);
