<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import type { AppStatus } from '@/types';
import { EMPLOYMENT, STATUS } from '@/lib/constants';
import { peso, relTime, shortName } from '@/lib/format';
import { exportCsv } from '@/lib/applications';
import { agentById, isAdmin, myAgent, store } from '../store';
import StatusPill from '../components/StatusPill.vue';
import ApplicationDrawer from '../components/ApplicationDrawer.vue';
import SelectMenu from '@/components/SelectMenu.vue';

const props = defineProps<{ id?: string }>();
const router = useRouter();

const status = ref<AppStatus | 'all'>('all');
const agentFilter = ref('all');
const brandFilter = ref('all');
const q = ref('');
/** Showing archived applications instead of active ones. */
const archived = ref(false);

const scoped = computed(() => store.applications.filter(a =>
  (!isAdmin.value || agentFilter.value === 'all' || a.agent_id === agentFilter.value) &&
  (brandFilter.value === 'all' || a.brand_id === brandFilter.value)));
const base = computed(() => scoped.value.filter(a => Boolean(a.archived_at) === archived.value));
const archivedCount = computed(() => scoped.value.filter(a => a.archived_at).length);

const list = computed(() => {
  const s = q.value.trim().toLowerCase();
  return base.value.filter(a =>
    (status.value === 'all' || a.status === status.value) &&
    (!s || `${a.full_name} ${a.ref} ${a.mobile} ${a.unit}`.toLowerCase().includes(s)));
});

const chips = computed(() => [
  { key: 'all' as const, label: 'All', n: base.value.length },
  ...(Object.entries(STATUS) as [AppStatus, (typeof STATUS)[AppStatus]][]).map(([k, s]) => ({ key: k, label: s.label, n: base.value.filter(a => a.status === k).length }))
]);

const open = computed(() => (props.id ? store.applications.find(a => a.id === props.id) ?? null : null));
const close = () => router.push('/applications');
const agentName = (id: string) => agentById(id)?.name ?? '';
const agentOptions = computed(() => [{ value: 'all', label: 'All agents' }, ...store.agents.map(a => ({ value: a.id, label: a.name }))]);
const brandOptions = computed(() => [{ value: 'all', label: 'All brands' }, ...store.brands.map(b => ({ value: b.id, label: b.name, color: b.color }))]);
</script>

<template>
  <section class="page">
    <div class="page-head">
      <div>
        <span class="eyebrow">{{ isAdmin ? 'All agents' : myAgent?.name }}</span>
        <h1>{{ isAdmin ? 'Applications' : 'My applications' }}</h1>
      </div>
      <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
        <div v-if="isAdmin" class="field" style="min-width:180px">
          <label class="lbl" for="agentF">Agent</label>
          <SelectMenu id="agentF" v-model="agentFilter" :options="agentOptions" aria-label="Filter by agent" />
        </div>
        <div v-if="store.brands.length > 1" class="field" style="min-width:150px">
          <label class="lbl" for="brandF">Brand</label>
          <SelectMenu id="brandF" v-model="brandFilter" :options="brandOptions" aria-label="Filter by brand" />
        </div>
        <button class="btn" :disabled="!list.length" @click="exportCsv(list, agentName)">Export CSV</button>
      </div>
    </div>

    <p v-if="!isAdmin" class="hint" style="margin:0">You only see applications sent from your own card.</p>

    <input v-if="store.applications.length" id="q" v-model="q" class="search" type="search" placeholder="Search name, reference, mobile or unit" aria-label="Search applications">

    <div class="filters" role="tablist">
      <button v-for="c in chips" :key="c.key" class="fchip" :class="{ on: status === c.key }" role="tab" :aria-selected="status === c.key" @click="status = c.key">
        {{ c.label }} <b>{{ c.n }}</b>
      </button>
      <button v-if="archivedCount || archived" class="fchip archive" :class="{ on: archived }" :aria-pressed="archived" @click="archived = !archived; status = 'all'">
        {{ archived ? '← Active' : 'Archived' }} <b v-if="!archived">{{ archivedCount }}</b>
      </button>
    </div>
    <p v-if="archived" class="hint" style="margin:0">Archived applications. Open one to restore or delete it.</p>

    <ul class="list">
      <li v-for="a in list" :key="a.id">
        <RouterLink class="row lead" :to="`/applications/${a.id}`">
          <span class="main-t">
            <b>{{ a.full_name }}</b>
            <span class="vehicle">{{ a.unit }}</span>
            <span class="meta">{{ EMPLOYMENT[a.employment_type].label }} · {{ peso(a.monthly_income) }}/mo · {{ relTime(a.created_at) }}</span>
          </span>
          <span class="side">
            <StatusPill :label="STATUS[a.status].label" :css-var="STATUS[a.status].cssVar" />
            <span v-if="isAdmin" class="ag">{{ shortName(agentName(a.agent_id)) }}</span>
          </span>
        </RouterLink>
      </li>
      <li v-if="!list.length" class="empty">
        {{ archived ? 'No archived applications.' : store.applications.length ? 'No applications match.' : 'No applications yet. They appear here as soon as a client sends the form on a card.' }}
      </li>
    </ul>

    <ApplicationDrawer v-if="open" :app="open" @close="close" />
  </section>
</template>

<style scoped>
.row { text-decoration: none; color: inherit; }
.fchip.archive { margin-left: auto; }
</style>
