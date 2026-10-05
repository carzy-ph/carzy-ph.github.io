<script setup lang="ts">
// Renders the dialog requested by confirmDialog(). Mounted once, in the portal's App.vue.
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { pendingConfirm, settleConfirm } from '@/lib/confirm';

const cancelBtn = ref<HTMLButtonElement>();
const confirmBtn = ref<HTMLButtonElement>();
let returnFocus: HTMLElement | null = null;

watch(pendingConfirm, (now, before) => {
  if (now && !before) {
    returnFocus = document.activeElement as HTMLElement | null;
    // Destructive actions start on Cancel so Enter doesn't delete by accident.
    nextTick(() => (now.danger ? cancelBtn : confirmBtn).value?.focus());
  } else if (!now && before) {
    returnFocus?.focus?.();
  }
});

function onKey(e: KeyboardEvent) {
  if (!pendingConfirm.value) return;
  if (e.key === 'Escape') { e.preventDefault(); settleConfirm(false); }
  if (e.key === 'Tab') {
    // Keep focus inside the dialog.
    const [first, last] = [cancelBtn.value, confirmBtn.value];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }
}
document.addEventListener('keydown', onKey);
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <div v-if="pendingConfirm" class="dlg-scrim" @click.self="settleConfirm(false)">
      <div class="dlg" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" :aria-describedby="pendingConfirm.message ? 'dlg-msg' : undefined">
        <h2 id="dlg-title">{{ pendingConfirm.title }}</h2>
        <p v-if="pendingConfirm.message" id="dlg-msg">{{ pendingConfirm.message }}</p>
        <div class="dlg-actions">
          <button ref="cancelBtn" class="btn" type="button" @click="settleConfirm(false)">{{ pendingConfirm.cancelLabel || 'Cancel' }}</button>
          <button ref="confirmBtn" class="btn" :class="pendingConfirm.danger ? 'danger-solid' : 'primary'" type="button" @click="settleConfirm(true)">
            {{ pendingConfirm.confirmLabel || 'OK' }}
          </button>
        </div>
      </div>
  </div>
</template>

<style scoped>
.dlg-scrim {
  position: fixed; inset: 0; z-index: 60; background: rgba(8, 12, 16, .5);
  display: flex; align-items: flex-end; justify-content: center; padding: 16px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
}
@media (min-width: 560px) { .dlg-scrim { align-items: center; } }
.dlg {
  width: 100%; max-width: 420px; background: var(--surface); color: var(--ink);
  border: 1px solid var(--line); border-radius: 18px; padding: 20px;
  display: flex; flex-direction: column; gap: 10px; box-shadow: 0 24px 48px -16px rgba(0, 0, 0, .45);
}
h2 { font-size: 24px; text-transform: uppercase; line-height: 1.1; }
p { margin: 0; color: var(--muted); font-size: 14px; }
.dlg-actions { display: flex; gap: 10px; margin-top: 8px; }
.dlg-actions .btn { flex: 1; padding: 12px; }
.danger-solid { background: #C0362C; border-color: #C0362C; color: #fff; }
.danger-solid:hover { background: #A82E25; }
/* Plain CSS animation: shows immediately even if the tab isn't painting frames. */
.dlg-scrim { animation: dlg-fade .15s ease-out; }
.dlg { animation: dlg-rise .15s ease-out; }
@keyframes dlg-fade { from { background: rgba(8, 12, 16, 0); } }
@keyframes dlg-rise { from { transform: translateY(8px); } }
@media (prefers-reduced-motion: reduce) { .dlg-scrim, .dlg { animation: none; } }
</style>
