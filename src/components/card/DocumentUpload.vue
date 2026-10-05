<script setup lang="ts">
// Requirements checklist: the client uploads each document type into their agent's Google Drive folder,
// with progress for the file being sent and a list of what's already uploaded under each requirement.
import { computed, reactive, ref } from 'vue';
import type { EmploymentType } from '@/types';
import { requirementTypes } from '@/lib/constants';
import { DOC_ACCEPT, DOC_MAX_MB, checkDocument, uploadDocument, type UploadPhase } from '@/lib/upload';

const props = defineProps<{
  appRef: string;
  token: string;
  employmentType: EmploymentType;
  coMakers: number;
  /** Files already uploaded (when reopening the upload link). */
  existing?: { name: string; type: string }[];
}>();

const MAX_FILES = 20;
const rows = computed(() => requirementTypes(props.employmentType, props.coMakers));
const uploaded = reactive<{ name: string; type: string }[]>([...(props.existing ?? [])]);
const error = ref('');

/** The file being uploaded right now (one at a time), or null. */
const active = ref<{ type: string; name: string; size: number; index: number; total: number; phase: UploadPhase; fraction: number } | null>(null);
let controller: AbortController | null = null;

const pct = computed(() => Math.round((active.value?.fraction ?? 0) * 100));
const stage = computed(() => {
  const a = active.value;
  if (!a) return '';
  if (a.phase === 'preparing') return 'Preparing…';
  if (a.phase === 'saving') return 'Saving…';
  return `${pct.value}%`;
});
const sizeLabel = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
/** Drive names files "<type> - <original name>"; show just the original name. */
const shortName = (type: string, name: string) => (name.startsWith(type + ' - ') ? name.slice(type.length + 3) : name);
const filesFor = (type: string) => uploaded.filter(u => u.type === type);

async function onPick(type: string, e: Event) {
  const input = e.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = '';
  if (!files.length || active.value) return;
  error.value = '';
  const problems = files.map(checkDocument).filter(Boolean);
  if (problems.length) { error.value = problems.join(' '); return; }
  if (uploaded.length + files.length > MAX_FILES) { error.value = `You can upload up to ${MAX_FILES} files in total.`; return; }

  controller = new AbortController();
  try {
    for (const [i, file] of files.entries()) {
      active.value = { type, name: file.name, size: file.size, index: i + 1, total: files.length, phase: 'preparing', fraction: 0 };
      const r = await uploadDocument({
        ref: props.appRef, token: props.token, type, file, signal: controller.signal,
        onProgress: (phase, fraction) => { if (active.value) Object.assign(active.value, { phase, fraction }); }
      });
      uploaded.push({ name: r.name, type });
    }
  } catch (err) {
    error.value = (err as Error).name === 'AbortError'
      ? 'Upload cancelled. Files already sent are kept.'
      : (err as Error).message || 'That upload didn’t go through. Check your connection and try again.';
  } finally {
    active.value = null;
    controller = null;
  }
}

function cancel() { controller?.abort(); }
</script>

<template>
  <div class="docs">
    <b>Upload your requirements</b>
    <p class="hint" style="margin:0">They go straight to your agent’s secure folder. PDF or photos, up to {{ DOC_MAX_MB }} MB each. You can also come back later with the link your agent sends you.</p>
    <ul class="doc-list">
      <li v-for="r in rows" :key="r.type" :class="{ busy: active?.type === r.type }">
        <div class="doc-row">
          <span class="doc-text">
            <b>{{ r.type }} <span v-if="filesFor(r.type).length" class="doc-ok">✓ {{ filesFor(r.type).length }} uploaded</span></b>
            <span class="hint">{{ r.hint }}</span>
          </span>
          <label class="btn small doc-btn" :class="{ disabled: active }" :for="`doc-${r.type}`" :aria-disabled="Boolean(active)">
            {{ filesFor(r.type).length ? 'Add more' : 'Upload' }}
          </label>
          <input :id="`doc-${r.type}`" type="file" :accept="DOC_ACCEPT" multiple hidden :disabled="Boolean(active)" @change="onPick(r.type, $event)">
        </div>

        <div v-if="active && active.type === r.type" class="progress" role="status" aria-live="polite">
          <div class="progress-top">
            <span class="file">{{ active.name }} <span class="size">· {{ sizeLabel(active.size) }}</span></span>
            <span class="pct">{{ stage }}</span>
          </div>
          <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="pct" :aria-label="`Uploading ${active.name}`">
            <i :class="{ indeterminate: active.phase !== 'uploading' }" :style="{ width: (active.phase === 'uploading' ? pct : 100) + '%' }"></i>
          </div>
          <div class="progress-foot">
            <span>{{ active.total > 1 ? `File ${active.index} of ${active.total}` : '' }}</span>
            <button type="button" class="cancel" @click="cancel">Cancel</button>
          </div>
        </div>

        <ul v-if="filesFor(r.type).length" class="done-files">
          <li v-for="f in filesFor(r.type)" :key="f.name">✓ {{ shortName(r.type, f.name) }}</li>
        </ul>
      </li>
    </ul>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <p v-if="uploaded.length" class="hint" style="margin:0">{{ uploaded.length }} {{ uploaded.length === 1 ? 'file' : 'files' }} sent to your agent.</p>
  </div>
</template>

<style scoped>
.docs { border-top: 1px solid var(--line); padding-top: 12px; margin-top: 4px; display: flex; flex-direction: column; gap: 10px; font-size: 14px; }
.doc-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.doc-list > li { display: flex; flex-direction: column; gap: 10px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; }
.doc-list > li.busy { border-color: var(--brand); }
.doc-row { display: flex; align-items: center; gap: 10px; }
.doc-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.doc-ok { color: var(--ok); font-weight: 600; font-size: 12px; margin-left: 4px; }
.doc-btn { cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; }
.doc-btn.disabled { opacity: .5; pointer-events: none; }

.progress { display: flex; flex-direction: column; gap: 6px; }
.progress-top, .progress-foot { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; }
.file { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.size { color: var(--muted); font-weight: 400; }
.pct { flex: none; font-variant-numeric: tabular-nums; font-weight: 600; color: var(--brand); }
.progress-foot { color: var(--muted); }
.bar { height: 6px; border-radius: 999px; background: var(--surface-2); overflow: hidden; }
.bar i { display: block; height: 100%; border-radius: 999px; background: var(--brand); transition: width .2s ease-out; }
.bar i.indeterminate { animation: pulse 1.1s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: .35; } 50% { opacity: .9; } }
.cancel { border: 0; background: none; padding: 0; color: var(--muted); text-decoration: underline; cursor: pointer; font: inherit; font-size: 12px; }
.done-files { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--muted); }
.done-files li { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (prefers-reduced-motion: reduce) { .bar i { transition: none; } .bar i.indeterminate { animation: none; } }
</style>
