<script setup lang="ts" generic="T extends string | null">
// In-app dropdown (replaces the browser's native <select> list, which can't be styled).
// Keyboard: Enter/Space/↓ opens, ↑/↓ moves, Enter picks, Esc closes, typing jumps to a match.
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

export interface MenuOption<V> { value: V; label: string; hint?: string; color?: string | null }

const props = defineProps<{
  modelValue: T;
  options: MenuOption<T>[];
  id?: string;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: T] }>();

const open = ref(false);
const active = ref(0);
const root = ref<HTMLElement>();
const list = ref<HTMLElement>();
const listId = `${props.id || 'menu'}-list`;
const current = computed(() => props.options.find(o => o.value === props.modelValue) ?? null);

function show() {
  if (props.disabled) return;
  open.value = true;
  active.value = Math.max(0, props.options.findIndex(o => o.value === props.modelValue));
  nextTick(scrollActive);
}
function hide() { open.value = false; }
function pick(i: number) {
  const o = props.options[i];
  if (o) emit('update:modelValue', o.value);
  hide();
  (root.value?.querySelector('button.trigger') as HTMLElement | null)?.focus();
}
function scrollActive() {
  list.value?.querySelector<HTMLElement>(`[data-i="${active.value}"]`)?.scrollIntoView({ block: 'nearest' });
}

let typed = '', typedAt = 0;
function onKey(e: KeyboardEvent) {
  const n = props.options.length;
  if (!open.value) {
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); show(); }
    return;
  }
  if (e.key === 'Escape' || e.key === 'Tab') { if (e.key === 'Escape') e.preventDefault(); hide(); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); active.value = (active.value + 1) % n; scrollActive(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); active.value = (active.value - 1 + n) % n; scrollActive(); }
  else if (e.key === 'Home') { e.preventDefault(); active.value = 0; scrollActive(); }
  else if (e.key === 'End') { e.preventDefault(); active.value = n - 1; scrollActive(); }
  else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(active.value); }
  else if (e.key.length === 1) {
    typed = Date.now() - typedAt < 700 ? typed + e.key.toLowerCase() : e.key.toLowerCase();
    typedAt = Date.now();
    const i = props.options.findIndex(o => o.label.toLowerCase().startsWith(typed));
    if (i >= 0) { active.value = i; scrollActive(); }
  }
}

function onOutside(e: Event) { if (!root.value?.contains(e.target as Node)) hide(); }
watch(open, o => {
  if (o) document.addEventListener('pointerdown', onOutside);
  else document.removeEventListener('pointerdown', onOutside);
});
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside));
</script>

<template>
  <div ref="root" class="menu" :class="{ open, disabled }">
    <button
      :id="id" class="trigger inp" type="button" role="combobox"
      :aria-label="ariaLabel" aria-haspopup="listbox" :aria-expanded="open" :aria-controls="listId"
      :aria-activedescendant="open ? `${listId}-${active}` : undefined" :disabled="disabled"
      @click="open ? hide() : show()" @keydown="onKey">
      <span v-if="current?.color" class="dot" :style="{ background: current.color }"></span>
      <span class="label" :class="{ placeholder: !current }">{{ current?.label ?? placeholder ?? 'Choose' }}</span>
      <svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    <ul v-if="open" :id="listId" ref="list" class="list" role="listbox" :aria-label="ariaLabel">
      <li
        v-for="(o, i) in options" :id="`${listId}-${i}`" :key="String(o.value)" :data-i="i" role="option"
        :aria-selected="o.value === modelValue" :class="{ active: i === active, selected: o.value === modelValue }"
        @pointerenter="active = i" @click="pick(i)">
        <span v-if="o.color" class="dot" :style="{ background: o.color }"></span>
        <span class="text"><span>{{ o.label }}</span><small v-if="o.hint">{{ o.hint }}</small></span>
        <svg v-if="o.value === modelValue" class="tick" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
      </li>
      <li v-if="!options.length" class="empty" role="presentation">Nothing to choose yet</li>
    </ul>
  </div>
</template>

<style scoped>
.menu { position: relative; min-width: 0; }
.trigger {
  width: 100%; display: flex; align-items: center; gap: 8px; text-align: left; cursor: pointer;
  font: inherit; font-size: 16px; color: var(--ink); background: var(--surface-2);
  border: 1px solid var(--line); border-radius: 10px; padding: 10px 11px;
}
.trigger:disabled { opacity: .55; cursor: default; }
.open .trigger { outline: 2px solid var(--accent); outline-offset: 0; border-color: transparent; }
.label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.placeholder { color: var(--muted); }
.chev { flex: none; color: var(--muted); transition: transform .15s; }
.open .chev { transform: rotate(180deg); }
.dot { flex: none; width: 12px; height: 12px; border-radius: 4px; }
.list {
  position: absolute; z-index: 40; left: 0; right: 0; top: calc(100% + 6px); margin: 0; padding: 6px;
  list-style: none; max-height: 280px; overflow-y: auto; overscroll-behavior: contain;
  background: var(--surface); border: 1px solid var(--line); border-radius: 12px;
  box-shadow: 0 16px 32px -12px rgba(0, 0, 0, .35); animation: menu-in .12s ease-out;
}
.list li { display: flex; align-items: center; gap: 10px; padding: 10px 10px; border-radius: 8px; cursor: pointer; font-size: 15px; }
.list li.active { background: var(--surface-2); }
.list li.selected { font-weight: 600; }
.text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.text small { color: var(--muted); font-size: 12px; font-weight: 400; }
.tick { flex: none; color: var(--accent); }
.empty { color: var(--muted); cursor: default; }
@keyframes menu-in { from { transform: translateY(-4px); opacity: .6; } }
@media (prefers-reduced-motion: reduce) { .list { animation: none; } .chev { transition: none; } }
</style>
