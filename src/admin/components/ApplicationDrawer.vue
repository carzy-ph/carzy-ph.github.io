<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Application, AppStatus } from '@/types';
import { SOURCE, STATUS } from '@/lib/constants';
import { longDate, relTime, toIntl } from '@/lib/format';
import { cardUrl } from '@/config';
import { asText, sections } from '@/lib/applications';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { agentById, friendly, isAdmin, store } from '../store';
import SelectMenu from '@/components/SelectMenu.vue';

const props = defineProps<{ app: Application }>();
const emit = defineEmits<{ close: [] }>();

const note = ref(props.app.internal_note ?? '');
watch(() => props.app.id, () => (note.value = props.app.internal_note ?? ''));

const tel = computed(() => toIntl(props.app.mobile));
const digits = computed(() => tel.value.replace(/\D/g, ''));
const statusOptions = (Object.entries(STATUS) as [AppStatus, (typeof STATUS)[AppStatus]][])
  .map(([value, s]) => ({ value, label: s.label, color: `var(${s.cssVar})` }));
const agentOptions = computed(() => store.agents.map(a => ({ value: a.id, label: a.name })));

async function update(patch: Partial<Application>, msg: string) {
  const { error } = await supabase.from('applications').update(patch).eq('id', props.app.id);
  if (error) { toast(friendly(error)); return; }
  Object.assign(store.applications.find(a => a.id === props.app.id)!, patch);
  toast(msg);
}

function setStatus(s: AppStatus) {
  if (s !== props.app.status) update({ status: s }, `Status set to ${STATUS[s].label}.`);
}
function setAgent(id: string) {
  if (id !== props.app.agent_id) update({ agent_id: id }, `Reassigned to ${agentById(id)?.name ?? 'another agent'}.`);
}

// Requirements: files the client uploaded to the agent's Drive, and the private link to send them.
const drive = computed(() => store.drives[props.app.agent_id] ?? null);
const expired = computed(() => !props.app.upload_expires || new Date(props.app.upload_expires) < new Date());
const uploadLink = computed(() => {
  const slug = agentById(props.app.agent_id)?.slug;
  return slug && props.app.upload_token ? `${cardUrl(slug)}?upload=${props.app.ref}&t=${props.app.upload_token}` : '';
});
const renewing = ref(false);
async function renewLink() {
  renewing.value = true;
  const { data, error } = await supabase.rpc('renew_upload_link', { p_id: props.app.id });
  renewing.value = false;
  if (error) { toast(friendly(error)); return; }
  Object.assign(store.applications.find(a => a.id === props.app.id)!, data as Pick<Application, 'upload_token' | 'upload_expires'>);
  toast('New upload link ready. The old one no longer works.');
}
async function copyUploadLink() {
  try { await navigator.clipboard.writeText(uploadLink.value); toast('Upload link copied. Send it to the client by text, Viber or Messenger.'); }
  catch { toast('Copy didn’t work here. Select the link and copy it manually.'); }
}

function saveNote() {
  const v = note.value.trim() || null;
  if (v !== (props.app.internal_note ?? null)) update({ internal_note: v }, 'Note saved.');
}

async function copyDetails() {
  try { await navigator.clipboard.writeText(asText(props.app)); toast('Details copied. Paste them into the bank’s form or a chat.'); }
  catch { toast('Copy didn’t work here.'); }
}

const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') emit('close'); };
onMounted(() => document.addEventListener('keydown', onKey));
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="scrim" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="ap-name">
      <div class="sheet-h">
        <div>
          <span class="eyebrow">{{ app.ref }} · {{ SOURCE[app.source] }} · {{ relTime(app.created_at) }}</span>
          <h2 id="ap-name">{{ app.full_name }}</h2>
        </div>
        <button class="btn icon" aria-label="Close" @click="emit('close')">✕</button>
      </div>

      <div class="grid2">
        <div class="field">
          <label for="ap-status">Status</label>
          <SelectMenu id="ap-status" :model-value="app.status" :options="statusOptions" aria-label="Status"
            @update:model-value="setStatus" />
        </div>
        <div v-if="isAdmin" class="field">
          <label for="ap-agent">Assigned to</label>
          <SelectMenu id="ap-agent" :model-value="app.agent_id" :options="agentOptions" aria-label="Assigned to"
            @update:model-value="setAgent" />
        </div>
      </div>

      <div class="contact-line"><span>{{ app.mobile }}</span><span class="income">{{ app.unit }}</span></div>
      <div class="contact-actions">
        <a class="btn" :href="`tel:${tel}`">Call</a>
        <a class="btn" :href="`sms:${tel}`">SMS</a>
        <a class="btn" :href="`viber://chat?number=%2B${digits}`">Viber</a>
        <a class="btn" :href="`https://wa.me/${digits}`" target="_blank" rel="noopener">WhatsApp</a>
      </div>

      <div v-for="s in sections(app)" :key="s.title" class="sect">
        <h3>{{ s.title }}</h3>
        <dl class="kv"><template v-for="[k, v] in s.rows" :key="k"><dt>{{ k }}</dt><dd>{{ v }}</dd></template></dl>
      </div>

      <div class="sect">
        <h3>Requirements <span class="count-pill">{{ app.documents?.length ?? 0 }}</span></h3>
        <ul v-if="app.documents?.length" class="doc-links">
          <li v-for="d in app.documents" :key="d.url"><a :href="d.url" target="_blank" rel="noopener">{{ d.name }}</a><span class="hint">{{ relTime(d.at) }}</span></li>
        </ul>
        <p v-else class="hint" style="margin:0">No documents uploaded yet.</p>
        <template v-if="drive">
          <div v-if="uploadLink && !expired" class="url-row">
            <input class="inp" readonly :value="uploadLink" aria-label="Client upload link">
            <button class="btn" type="button" @click="copyUploadLink">Copy</button>
          </div>
          <span class="hint">{{ uploadLink && !expired ? `Send this link to the client to upload documents. It works until ${longDate(app.upload_expires)}.` : 'The client’s upload link has expired.' }}</span>
          <button class="btn small" type="button" style="align-self:flex-start" :disabled="renewing" @click="renewLink">{{ uploadLink && !expired ? 'Make a new link' : 'Create upload link' }}</button>
        </template>
        <p v-else class="hint" style="margin:0">Uploads aren’t set up for this agent yet: see <b>Requirements upload</b> on their card.</p>
      </div>

      <button class="btn" @click="copyDetails">Copy details</button>
      <p class="sens">Contains personal data covered by the Data Privacy Act. Share only with the financing bank.</p>

      <div class="field">
        <label for="ap-note">Internal note</label>
        <textarea id="ap-note" v-model="note" class="inp" rows="3" placeholder="Only the team can see this" @blur="saveNote"></textarea>
        <span class="hint">Saves when you leave the box.</span>
      </div>
      <button class="btn primary" @click="emit('close')">Done</button>
    </div>
  </div>
</template>
