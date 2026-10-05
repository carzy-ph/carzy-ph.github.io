<script setup lang="ts">
// Public card page. Shows the profile copy built into the page right away (works even if
// Supabase is paused), then loads the latest profile so admin edits appear immediately.
import { onMounted, ref, watchEffect } from 'vue';
import type { Agent, ApplicationInput, Brand, Catalog, Source, SubmitResult, UnitModel } from '@/types';
import { CONFIG, isConfigured } from '@/config';
import { rest, rpc } from '@/lib/rest';
import { catalogFor, emptyCatalog } from '@/lib/catalog';
import CardView from '@/components/card/CardView.vue';
import CardFallback from '@/components/card/CardFallback.vue';
import UploadView from '@/components/card/UploadView.vue';

interface Snapshot { agent: Agent; catalog: Catalog }
function readSnapshot(): Snapshot | null {
  try { return JSON.parse(document.getElementById('agent-snapshot')?.textContent || 'null'); } catch { return null; }
}

const params = new URLSearchParams(location.search);
const source: Source = params.get('src') === 'nfc' ? 'nfc' : params.get('src') === 'qr' ? 'qr' : 'link';
const snapshot = readSnapshot();
// /cards/<slug>/ in production; ?slug=<slug> while developing (npm run dev → /card.html?slug=marco).
const slug = snapshot?.agent.slug || location.pathname.match(/\/cards\/([a-z0-9-]+)\/?/)?.[1] || params.get('slug') || '';

const agent = ref<Agent | null>(snapshot?.agent ?? null);
const catalog = ref<Catalog>(snapshot?.catalog ?? emptyCatalog());
const state = ref<'loading' | 'ready' | 'missing' | 'offline'>(snapshot ? 'ready' : 'loading');

watchEffect(() => {
  const a = agent.value;
  document.title = a?.active ? `${a.name} · ${a.title || 'Sales Consultant'}` : CONFIG.brand;
});

async function refresh() {
  if (!slug) { state.value = 'missing'; return; }
  if (!isConfigured) {
    // No Supabase yet: show the sample agents so the page can be previewed locally.
    if (!snapshot) {
      const [{ default: samples }, { default: sampleCatalog }] = await Promise.all([import('@/sample/agents.json'), import('@/sample/catalog.json')]);
      agent.value = (samples as Agent[]).find(s => s.slug === slug) ?? null;
      if (agent.value) catalog.value = catalogFor(agent.value.brand_id, sampleCatalog.brands, sampleCatalog.models);
      state.value = agent.value ? 'ready' : 'missing';
    }
    return;
  }
  try {
    const [rows, brands, models] = await Promise.all([
      rest<Agent[]>(`agents?slug=eq.${encodeURIComponent(slug)}&select=*`),
      rest<Brand[]>('brands?active=is.true&select=*'),
      rest<UnitModel[]>('models?active=is.true&select=*')
    ]);
    const live = rows[0];
    if (!live) { agent.value = null; state.value = 'missing'; return; }
    catalog.value = catalogFor(live.brand_id, brands, models);
    if (!agent.value || live.updated_at !== agent.value.updated_at || live.active !== agent.value.active) agent.value = live;
    state.value = 'ready';
  } catch {
    if (!snapshot) state.value = 'offline';
  }
}

function logTap() {
  if (!isConfigured || !slug) return;
  const key = 'tap-' + slug;
  try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* private mode */ }
  rpc('log_tap', { p_slug: slug, p_source: source }).catch(() => {});
}

async function submit(p: ApplicationInput): Promise<SubmitResult> {
  if (!isConfigured) throw new Error('Preview mode: connect Supabase (see README) to receive applications.');
  return rpc<SubmitResult>('submit_application', { p_slug: slug, p, p_source: source });
}

// A client's private upload link: /cards/<agent>/?upload=<ref>&t=<token>
const uploadRef = params.get('upload');
const uploadToken = params.get('t');

onMounted(() => { refresh(); logTap(); });
</script>

<template>
  <p v-if="state === 'loading'" class="loading">Loading…</p>
  <UploadView v-else-if="uploadRef && uploadToken && state === 'ready' && agent && agent.active" :agent="agent" :catalog="catalog" :app-ref="uploadRef" :token="uploadToken" />
  <CardView v-else-if="state === 'ready' && agent && agent.active" :agent="agent" :catalog="catalog" :source="source" :submit="submit" />
  <CardFallback v-else :reason="state === 'offline' ? 'offline' : agent && !agent.active ? 'off' : 'missing'" :agent-name="agent?.name" />
</template>

<style scoped>
.loading { padding: 80px 16px; text-align: center; color: var(--muted); }
</style>
