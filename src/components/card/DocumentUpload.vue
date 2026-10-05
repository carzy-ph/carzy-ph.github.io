<script setup lang="ts">
// Requirements checklist: the client uploads each document type into their agent's Google Drive folder.
// Files go through the upload service, which only accepts them for this application's private link.
import { computed, reactive, ref } from 'vue';
import type { EmploymentType } from '@/types';
import { requirementTypes } from '@/lib/constants';
import { DOC_ACCEPT, DOC_MAX_MB, checkDocument, uploadDocument } from '@/lib/upload';

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
const busy = ref<string | null>(null);
const progress = ref('');
const error = ref('');
const countFor = (type: string) => uploaded.filter(u => u.type === type).length;

async function onPick(type: string, e: Event) {
  const input = e.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = '';
  if (!files.length) return;
  error.value = '';
  const problems = files.map(checkDocument).filter(Boolean);
  if (problems.length) { error.value = problems.join(' '); return; }
  if (uploaded.length + files.length > MAX_FILES) { error.value = `You can upload up to ${MAX_FILES} files in total.`; return; }

  busy.value = type;
  try {
    for (const [i, file] of files.entries()) {
      progress.value = files.length > 1 ? `Uploading ${i + 1} of ${files.length}…` : 'Uploading…';
      const r = await uploadDocument({ ref: props.appRef, token: props.token, type, file });
      uploaded.push({ name: r.name, type });
    }
  } catch (err) {
    error.value = (err as Error).message || 'That upload didn’t go through. Check your connection and try again.';
  } finally {
    busy.value = null;
    progress.value = '';
  }
}
</script>

<template>
  <div class="docs">
    <b>Upload your requirements</b>
    <p class="hint" style="margin:0">They go straight to your agent’s secure folder. PDF or photos, up to {{ DOC_MAX_MB }} MB each. You can also come back later with the link your agent sends you.</p>
    <ul class="doc-list">
      <li v-for="r in rows" :key="r.type">
        <span class="doc-text">
          <b>{{ r.type }} <span v-if="countFor(r.type)" class="doc-ok">✓ {{ countFor(r.type) }} uploaded</span></b>
          <span class="hint">{{ r.hint }}</span>
        </span>
        <label class="btn small doc-btn" :class="{ disabled: busy }" :for="`doc-${r.type}`">
          {{ busy === r.type ? progress : countFor(r.type) ? 'Add more' : 'Upload' }}
        </label>
        <input :id="`doc-${r.type}`" type="file" :accept="DOC_ACCEPT" multiple hidden :disabled="Boolean(busy)" @change="onPick(r.type, $event)">
      </li>
    </ul>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <p v-if="uploaded.length" class="hint" style="margin:0">{{ uploaded.length }} {{ uploaded.length === 1 ? 'file' : 'files' }} sent to your agent.</p>
  </div>
</template>

<style scoped>
.docs { border-top: 1px solid var(--line); padding-top: 12px; margin-top: 4px; display: flex; flex-direction: column; gap: 10px; font-size: 14px; }
.doc-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.doc-list li { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; }
.doc-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.doc-ok { color: var(--ok); font-weight: 600; font-size: 12px; margin-left: 4px; }
.doc-btn { cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; }
.doc-btn.disabled { opacity: .6; pointer-events: none; }
</style>
