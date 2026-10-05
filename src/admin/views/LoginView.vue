<script setup lang="ts">
// Sign in with Google. Access is decided by the team list: the Google account's email must be
// an admin, or an agent's Portal login email.
import { nextTick, onMounted, ref, watch } from 'vue';
import { CONFIG } from '@/config';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { googleButtonAvailable, renderGoogleButton } from '@/lib/googleButton';
import { boot, store } from '../store';

const state = ref<'checking' | 'ready' | 'off'>('checking');
const googleBusy = ref(false);
// Google's own button (when a client ID is configured) names this site on Google's screen.
// Without a client ID, a plain button sends people to Google through Supabase instead.
const useGisButton = googleButtonAvailable();
const gisSlot = ref<HTMLElement>();

async function showGisButton() {
  if (!useGisButton || !gisSlot.value) return;
  try {
    await renderGoogleButton(gisSlot.value, {
      onSignedIn: () => { store.authError = ''; boot(); },
      onError: msg => (store.authError = msg)
    });
  } catch (e) {
    store.authError = (e as Error).message;
  }
}
watch(state, () => { if (state.value === 'ready') nextTick(showGisButton); });

// Google must be switched on in Supabase (Authentication → Sign In / Providers).
onMounted(async () => {
  let googleOn = false;
  try {
    const res = await fetch(`${CONFIG.supabaseUrl.replace(/\/$/, '')}/auth/v1/settings`, { headers: { apikey: CONFIG.supabaseKey } });
    googleOn = res.ok && Boolean((await res.json())?.external?.google);
  } catch { /* offline */ }
  state.value = googleOn ? 'ready' : 'off';
});

async function google() {
  googleBusy.value = true;
  store.authError = '';
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    // Back to this page (without any #/route), where the portal finishes signing in.
    options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' } }
  });
  // On success the browser is already leaving for Google.
  if (error) {
    googleBusy.value = false;
    toast(error.message);
  }
}
</script>

<template>
  <section class="login">
    <span class="eyebrow">{{ CONFIG.brand }}</span>
    <h1>{{ store.area === 'admin' ? 'Admin sign in' : 'Agent sign in' }}</h1>

    <p v-if="store.authError" class="auth-error" role="alert">Sign-in didn’t finish: {{ store.authError }}</p>

    <p v-if="state === 'checking'" class="muted">Loading…</p>

    <div v-else-if="state === 'off'" class="notice">
      <p>Sign-in isn’t available right now. Check your connection and reload the page.</p>
      <p class="muted">If this keeps happening, Google sign-in may be switched off in Supabase (Authentication → Sign In / Providers → Google).</p>
    </div>

    <template v-else>
      <p class="muted">{{ store.area === 'admin' ? 'Use your admin Google account.' : 'Use the Google account your admin linked to your agent card.' }}</p>
      <div class="login-form">
        <div v-if="useGisButton" ref="gisSlot" class="gis-slot" aria-label="Sign in with Google"></div>
        <button v-else class="btn google" type="button" :disabled="googleBusy" @click="google">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
          </svg>
          {{ googleBusy ? 'Opening Google…' : 'Continue with Google' }}
        </button>
      </div>
    </template>
  </section>
</template>

<style scoped>
/* Google's sign-in button style: white with the multicolor G, dark text (also in dark mode). */
.google { background: #fff; color: #1F1F1F; border-color: #DADCE0; gap: 10px; font-weight: 600; }
.google:hover { background: #F7F8F8; }
.gis-slot { min-height: 44px; display: flex; justify-content: center; }
/* Google's button is a light-themed embedded frame. In dark mode the browser would paint it an opaque
   white box; declaring it light lets it stay transparent so only the button itself shows. */
.gis-slot :deep(iframe) { color-scheme: light; }
.auth-error { margin: 0; padding: 10px 12px; border: 1px solid var(--err); border-radius: 10px; color: var(--err); font-size: 14px; }
</style>
