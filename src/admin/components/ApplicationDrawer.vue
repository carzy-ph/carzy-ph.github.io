<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import type { Application, AppStatus, Deal } from '@/types';
import { SOURCE, STATUS } from '@/lib/constants';
import { longDate, relTime, toIntl } from '@/lib/format';
import { cardUrl } from '@/config';
import { asText, sections } from '@/lib/applications';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { financed, money } from '@/lib/deal';
import { exportApplicationPdf } from '@/lib/exportPdf';
import { deleteApplication } from '@/lib/drive';
import { confirmDialog } from '@/lib/confirm';
import { agentById, brandName, friendly, isAdmin, store } from '../store';
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

async function update(patch: Partial<Application>, msg: string): Promise<boolean> {
  const { error } = await supabase.from('applications').update(patch).eq('id', props.app.id);
  if (error) { toast(friendly(error)); return false; }
  Object.assign(store.applications.find(a => a.id === props.app.id)!, patch);
  toast(msg);
  return true;
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

// Loan details: the dealer-side fields of the bank form (GRM, price, down payment, terms, AOR).
const DEAL_KEYS = ['grm', 'unit_price', 'down_payment', 'amount_financed', 'terms', 'aor'] as const;
const deal = reactive<Required<Deal>>({ grm: '', unit_price: '', down_payment: '', amount_financed: '', terms: '', aor: '' });
const loadDeal = () => DEAL_KEYS.forEach(k => (deal[k] = props.app.deal?.[k] ?? ''));
loadDeal();
watch(() => props.app.id, loadDeal);
const autoFinanced = computed(() => money(financed({ ...deal, amount_financed: '' })));
function saveDeal() {
  const next: Deal = {};
  DEAL_KEYS.forEach(k => { const v = deal[k].trim(); if (v) next[k] = v.slice(0, 40); });
  const prev = props.app.deal ?? {};
  if (DEAL_KEYS.some(k => (prev[k] ?? '') !== (next[k] ?? ''))) return update({ deal: next }, 'Loan details saved.');
}

// Export PDF: the bank's application form filled in, plus every uploaded requirement.
const exporting = ref<{ msg: string; fraction: number } | null>(null);
async function exportPdf() {
  const agent = agentById(props.app.agent_id);
  if (!agent || exporting.value) return;
  exporting.value = { msg: 'Preparing…', fraction: 0 };
  try {
    await saveDeal();
    const { missing, fileName } = await exportApplicationPdf({
      app: props.app, agent,
      brand: brandName(props.app.brand_id) || brandName(agent.brand_id),
      onStep: (msg, fraction) => (exporting.value = { msg, fraction })
    });
    toast(missing
      ? `${fileName} saved. ${missing} ${missing === 1 ? 'requirement' : 'requirements'} couldn’t be added: see the note pages inside.`
      : `${fileName} saved.`);
  } catch (e) {
    toast((e as Error).message || 'The PDF couldn’t be made. Try again.');
  } finally {
    exporting.value = null;
  }
}

// Archive hides the application from the main list (it can be restored); Delete removes it for good.
async function toggleArchive() {
  const archiving = !props.app.archived_at;
  const done = await update({ archived_at: archiving ? new Date().toISOString() : null },
    archiving ? 'Archived. You’ll find it under Archived.' : 'Restored to your applications.');
  if (done) emit('close');
}

const deleting = ref(false);
async function remove() {
  const n = props.app.documents?.length ?? 0;
  const owner = agentById(props.app.agent_id);
  const whose = owner && owner.id !== store.me?.agent_id ? `${owner.name}’s` : 'your';
  const ok = await confirmDialog({
    title: `Delete ${props.app.full_name}’s application?`,
    message: (n ? `Its ${n} uploaded ${n === 1 ? 'file' : 'files'} will be moved to the trash in ${whose} Google Drive. ` : '') +
      'This can’t be undone. To only hide it from your list, archive it instead.',
    confirmLabel: 'Delete', danger: true
  });
  if (!ok) return;
  deleting.value = true;
  try {
    const r = await deleteApplication(props.app.id);
    store.applications = store.applications.filter(a => a.id !== props.app.id);
    emit('close');
    toast(r.files === 'kept'
      ? `Application deleted. Its files couldn’t be removed from Google Drive: delete the folder “${r.folder}” there.`
      : 'Application deleted.');
  } catch (e) {
    toast((e as Error).message);
  } finally {
    deleting.value = false;
  }
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
          <span class="eyebrow">{{ app.ref }} · {{ SOURCE[app.source] }} · {{ relTime(app.created_at) }}<template v-if="app.archived_at"> · Archived</template></span>
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
        <p v-else class="hint" style="margin:0">This agent hasn’t connected Google Drive yet, so clients can’t upload. They connect it from <b>My card</b> in the Agent Portal.</p>
      </div>

      <div class="sect">
        <h3>Loan details</h3>
        <span class="hint">For the bank’s application form. The client doesn’t see these.</span>
        <div class="grid2">
          <div class="field"><label for="dl-price">Unit price</label><input id="dl-price" v-model="deal.unit_price" class="inp" inputmode="decimal" placeholder="1,430,000" @blur="saveDeal"></div>
          <div class="field"><label for="dl-dp">Down payment</label><input id="dl-dp" v-model="deal.down_payment" class="inp" placeholder="286,000 or 20%" @blur="saveDeal"></div>
          <div class="field"><label for="dl-af">Amount financed</label><input id="dl-af" v-model="deal.amount_financed" class="inp" inputmode="decimal" :placeholder="autoFinanced ? `${autoFinanced} (auto)` : 'Price less down payment'" @blur="saveDeal"></div>
          <div class="field"><label for="dl-terms">Terms</label><input id="dl-terms" v-model="deal.terms" class="inp" placeholder="60 months" @blur="saveDeal"></div>
          <div class="field"><label for="dl-aor">AOR</label><input id="dl-aor" v-model="deal.aor" class="inp" placeholder="Add-on rate, e.g. 1.25%" @blur="saveDeal"></div>
          <div class="field"><label for="dl-grm">GRM</label><input id="dl-grm" v-model="deal.grm" class="inp" placeholder="Group / branch manager" @blur="saveDeal"></div>
        </div>
      </div>

      <div class="export">
        <button class="btn primary" type="button" :disabled="Boolean(exporting)" @click="exportPdf">
          {{ exporting ? 'Exporting…' : 'Export PDF' }}
        </button>
        <div v-if="exporting" class="progress" role="status" aria-live="polite">
          <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(exporting.fraction * 100)" aria-label="Exporting PDF">
            <i :style="{ width: Math.round(exporting.fraction * 100) + '%' }"></i>
          </div>
          <span class="hint">{{ exporting.msg }}</span>
        </div>
        <span v-else class="hint">The filled-in application form, then each uploaded requirement on its own page.</span>
      </div>
      <button class="btn" @click="copyDetails">Copy details</button>
      <p class="sens">Contains personal data covered by the Data Privacy Act. Share only with the financing bank.</p>

      <div class="field">
        <label for="ap-note">Internal note</label>
        <textarea id="ap-note" v-model="note" class="inp" rows="3" placeholder="Only the team can see this" @blur="saveNote"></textarea>
        <span class="hint">Saves when you leave the box.</span>
      </div>
      <div class="manage">
        <button class="btn" type="button" @click="toggleArchive">{{ app.archived_at ? 'Restore' : 'Archive' }}</button>
        <button class="btn danger" type="button" :disabled="deleting" @click="remove">{{ deleting ? 'Deleting…' : 'Delete' }}</button>
      </div>
      <button class="btn primary" @click="emit('close')">Done</button>
    </div>
  </div>
</template>

<style scoped>
.export { display: flex; flex-direction: column; gap: 8px; }
.manage { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; border-top: 1px solid var(--line); padding-top: 14px; }
.danger { color: var(--err); border-color: color-mix(in srgb, var(--err) 40%, var(--line)); }
.progress { display: flex; flex-direction: column; gap: 6px; }
.bar { height: 6px; border-radius: 999px; background: var(--surface-2); overflow: hidden; }
.bar i { display: block; height: 100%; border-radius: 999px; background: var(--brand); transition: width .25s ease-out; }
@media (prefers-reduced-motion: reduce) { .bar i { transition: none; } }
</style>
