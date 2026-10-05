<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { CONFIG } from '@/config';
import { initials } from '@/lib/format';
import { agentColor, brandName, store } from '../store';
import StatusPill from '../components/StatusPill.vue';

const q = ref('');

const kpis = computed(() => {
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  return {
    live: store.agents.filter(a => a.active).length,
    taps: Object.values(store.stats).reduce((s, r) => s + Number(r.taps_week || 0), 0),
    fresh: store.applications.filter(a => a.status === 'new').length,
    released: store.applications.filter(a => a.status === 'released' && new Date(a.updated_at) >= monthStart).length
  };
});

const list = computed(() => {
  const s = q.value.trim().toLowerCase();
  return store.agents.filter(a => !s || `${a.name} ${a.branch} ${a.slug} ${brandName(a.brand_id)}`.toLowerCase().includes(s));
});
</script>

<template>
  <section class="page">
    <div class="page-head">
      <div><span class="eyebrow">{{ CONFIG.brand }}</span><h1>Agents</h1></div>
      <RouterLink class="btn primary" to="/agents/new">+ Add agent</RouterLink>
    </div>

    <div class="kpis">
      <div class="kpi"><strong>{{ kpis.live }}<span class="muted" style="font-size:18px"> / {{ store.agents.length }}</span></strong><span>Cards live</span></div>
      <div class="kpi"><strong>{{ kpis.taps }}</strong><span>Card taps this week</span></div>
      <div class="kpi"><strong style="color:var(--st-new)">{{ kpis.fresh }}</strong><span>New applications, not yet contacted</span></div>
      <div class="kpi"><strong>{{ kpis.released }}</strong><span>Units released this month</span></div>
    </div>

    <input v-if="store.agents.length" id="q" v-model="q" class="search" type="search" placeholder="Search name, brand, branch or card address" aria-label="Search agents">

    <ul class="list">
      <li v-for="a in list" :key="a.id">
        <RouterLink class="row" :to="`/agents/${a.id}`">
          <span class="av" :style="a.photo_url ? { background: `${agentColor(a)} url('${a.photo_url}') center/cover` } : { background: agentColor(a) }">{{ a.photo_url ? '' : initials(a.name) }}</span>
          <span class="main-t">
            <b>{{ a.name }}</b>
            <span class="sub">{{ brandName(a.brand_id) || 'All brands' }} · {{ a.title }}<template v-if="a.branch"> · {{ a.branch }}</template></span>
            <span class="slug">/{{ a.slug }} · {{ store.stats[a.id]?.taps_week ?? 0 }} taps this week</span>
          </span>
          <span class="side">
            <StatusPill v-if="a.active" label="Live" css-var="--st-released" />
            <StatusPill v-else label="Off" css-var="--st-declined" />
            <span v-if="!store.team.some(t => t.agent_id === a.id)" class="nologin">No sign-in</span>
            <span v-if="Number(store.stats[a.id]?.new_applications)" class="newcount">{{ store.stats[a.id]?.new_applications }} new</span>
          </span>
        </RouterLink>
      </li>
      <li v-if="!list.length" class="empty">{{ store.agents.length ? 'No agents match that search.' : 'No agents yet. Add your first agent to create their card.' }}</li>
    </ul>
  </section>
</template>

<style scoped>
.row { text-decoration: none; color: inherit; }
</style>
