<script setup lang="ts">
// Shown when a card is turned off, not found, or can't load.
import { CONFIG } from '@/config';
import { safeUrl, toIntl } from '@/lib/format';
import ThemeToggle from '../ThemeToggle.vue';

defineProps<{ agentName?: string; reason: 'off' | 'missing' | 'offline' }>();
const d = CONFIG.dealership;
const tel = toIntl(d.phone);
</script>

<template>
  <div class="wrap">
    <div class="top-row"><ThemeToggle /></div>
    <section class="fallback">
      <span class="eyebrow">{{ d.name }}</span>
      <h1>Our sales team is ready to help</h1>
      <p v-if="reason === 'off'">{{ agentName }} is no longer taking applications through this card.</p>
      <p v-else-if="reason === 'offline'">This card could not load right now. Please try again in a moment, or contact the showroom.</p>
      <p v-else>This card link is not set up yet.</p>
      <div class="actions">
        <a v-if="tel" class="cta" :href="`tel:${tel}`">Call {{ d.phone }}</a>
        <a v-if="d.facebook" class="out" :href="safeUrl(d.facebook)" target="_blank" rel="noopener">Message us on Facebook</a>
        <a v-if="d.email" class="out" :href="`mailto:${d.email}`">{{ d.email }}</a>
      </div>
    </section>
  </div>
</template>

<style scoped>
.wrap { max-width: 440px; margin: 0 auto; padding-inline: 16px; padding-block: 16px 40px; }
.top-row { display: flex; justify-content: flex-end; margin-bottom: 6vh; }
.fallback { background: var(--surface); border: 1px solid var(--line); border-radius: 22px; padding: 24px 20px; display: flex; flex-direction: column; gap: 12px; }
h1 { font-size: 34px; text-transform: uppercase; line-height: 1.05; }
p { margin: 0; color: var(--muted); }
.actions { display: flex; flex-direction: column; gap: 10px; margin-top: 6px; }
.cta { display: flex; justify-content: center; padding: 15px; border-radius: var(--r); background: var(--accent); color: var(--accent-ink); font: 700 18px/1 var(--display); letter-spacing: .06em; text-transform: uppercase; text-decoration: none; }
.out { display: flex; justify-content: center; padding: 14px; border-radius: var(--r); border: 1px solid var(--line); background: var(--surface); font-weight: 600; text-decoration: none; }
</style>
