<script setup lang="ts">
import { isDark, toggleTheme } from '@/lib/theme';
</script>

<template>
  <button class="theme-toggle" type="button" :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'" :title="isDark ? 'Light mode' : 'Dark mode'" @click="toggleTheme">
    <svg v-if="isDark" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
    <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  </button>
</template>

<style scoped>
.theme-toggle {
  flex: none; width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center;
  border: 1px solid var(--line); background: var(--surface); color: var(--ink); cursor: pointer;
}
.theme-toggle:hover { background: var(--surface-2); }
</style>
