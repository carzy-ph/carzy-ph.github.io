// Light/dark switch. Follows the device until someone taps the switch, then remembers the choice.
// Each page's <head> applies the saved choice before first paint, so there's no flash.
import { ref } from 'vue';

const KEY = 'theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

function saved(): 'light' | 'dark' | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

export const isDark = ref((saved() ?? (media.matches ? 'dark' : 'light')) === 'dark');

media.addEventListener('change', e => { if (!saved()) isDark.value = e.matches; });

export function toggleTheme() {
  const next = isDark.value ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem(KEY, next); } catch { /* storage blocked: still switches for this visit */ }
  isDark.value = next === 'dark';
}
