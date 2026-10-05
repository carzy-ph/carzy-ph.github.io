<script setup lang="ts">
import { watch } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { areaUrl, canSwitchArea, isAdmin, myAgent, newCount, signOut, store } from './store';
import { toastMessage } from '@/lib/toast';
import { CONFIG } from '@/config';
import LoginView from './views/LoginView.vue';
import ThemeToggle from '@/components/ThemeToggle.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';

const route = useRoute();
const reload = () => location.reload();
const router = useRouter();

// The first route is resolved before we know who signed in; correct it once we do.
watch(() => store.phase, phase => {
  if (phase !== 'ready') return;
  if (isAdmin.value && route.path === '/my-card') router.replace('/agents');
  else if (!isAdmin.value && route.meta.admin) router.replace('/my-card');
}, { immediate: true });

const tabs = () => isAdmin.value
  ? [{ to: '/agents', label: 'Agents', icon: 'users', match: '/agents' }, { to: '/applications', label: 'Applications', icon: 'inbox', match: '/applications' }, { to: '/units', label: 'Units', icon: 'car', match: '/units' }]
  : [{ to: '/my-card', label: 'My card', icon: 'card', match: '/my-card' }, { to: '/applications', label: 'My applications', icon: 'inbox', match: '/applications' }];
</script>

<template>
  <header class="top">
    <div class="brand">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M14 10a3 3 0 0 1 0 4M16.5 8.5a6 6 0 0 1 0 7"/></svg>
      {{ CONFIG.brand }} <span class="brand-tag">{{ store.area === 'admin' ? 'Admin' : 'Agent Portal' }}</span>
    </div>
    <div class="who">
      <ThemeToggle />
      <a v-if="store.phase === 'ready' && canSwitchArea" class="btn small switch-area" :href="areaUrl(store.area === 'admin' ? 'agent' : 'admin')">
        {{ store.area === 'admin' ? 'My card portal' : 'Admin' }} →
      </a>
      <span v-if="store.phase === 'ready'" class="chip">{{ isAdmin ? 'Admin' : myAgent?.name || 'Agent' }}</span>
      <button v-if="['ready', 'no-access', 'error'].includes(store.phase)" class="btn small" @click="signOut">Sign out</button>
    </div>
  </header>

  <div v-if="store.phase === 'ready'" class="shell">
    <nav class="tabs" aria-label="Sections">
      <RouterLink v-for="t in tabs()" :key="t.to" :to="t.to" class="tab" :class="{ on: route.path.startsWith(t.match) }">
        <svg v-if="t.icon === 'users'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>
        <svg v-else-if="t.icon === 'inbox'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/></svg>
        <svg v-else-if="t.icon === 'car'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 17H3v-5l2-5h14l2 5v5h-2"/><path d="M3 12h18"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/><path d="M9.5 17h5"/></svg>
        <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M14 10a3 3 0 0 1 0 4M16.5 8.5a6 6 0 0 1 0 7"/></svg>
        <span>{{ t.label }}</span>
        <span v-if="t.icon === 'inbox' && newCount" class="count">{{ newCount }}</span>
      </RouterLink>
    </nav>
    <main class="main"><RouterView /></main>
  </div>

  <main v-else class="main">
    <section v-if="store.phase === 'loading'" class="login"><p class="muted">Loading…</p></section>

    <section v-else-if="store.phase === 'setup'" class="login">
      <span class="eyebrow">Setup needed</span>
      <h1>Connect Supabase</h1>
      <div class="notice">
        <p>Copy <code>.env.example</code> to <code>.env.local</code>, fill in your Supabase project URL and publishable key, then restart <code>npm run dev</code>.</p>
        <p class="muted">For the live site, add the same two values as repository variables on GitHub. See <code>README.md</code>.</p>
      </div>
    </section>

    <section v-else-if="store.phase === 'no-access'" class="login">
      <span class="eyebrow">Signed in as {{ store.email }}</span>
      <h1>No access yet</h1>
      <div class="notice">
        <p v-if="store.area === 'agent'">This account isn’t linked to an agent card yet. Ask your admin to set <b>{{ store.email }}</b> as the <b>Portal login email</b> on your agent profile, then sign in again.</p>
        <p v-else>This account isn’t on the admin list. Agents sign in at the Agent Portal instead.</p>
        <p class="muted">Signed in with the wrong Google account? Sign out and choose another one.</p>
      </div>
    </section>

    <section v-else-if="store.phase === 'error'" class="login">
      <h1>Couldn’t load</h1>
      <div class="notice"><p>{{ store.error }}</p><button class="btn" @click="reload">Try again</button></div>
    </section>

    <LoginView v-else />
  </main>

  <ConfirmDialog />
  <div v-if="toastMessage" class="toast" role="status">{{ toastMessage }}</div>
</template>
