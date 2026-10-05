<script setup lang="ts">
// The page a client sees from their private upload link: their agent, and the requirements checklist.
import { computed, onMounted, ref } from 'vue';
import type { Agent, Catalog, UploadInfo } from '@/types';
import { rpc } from '@/lib/rest';
import { cardColor } from '@/lib/catalog';
import { initials } from '@/lib/format';
import '@/styles/form.css';
import DocumentUpload from './DocumentUpload.vue';

const props = defineProps<{ agent: Agent; catalog: Catalog; appRef: string; token: string }>();

const info = ref<UploadInfo | null>(null);
const error = ref('');
const color = computed(() => cardColor(props.agent, props.catalog.brands));
const until = computed(() => (info.value ? new Date(info.value.expires).toLocaleDateString('en-PH', { month: 'long', day: 'numeric' }) : ''));

onMounted(async () => {
  try { info.value = await rpc<UploadInfo>('upload_info', { p_ref: props.appRef, p_token: props.token }); }
  catch (e) { error.value = (e as Error).message; }
});
</script>

<template>
  <div class="upload-view" :style="{ '--brand': color }">
    <header class="who">
      <span class="av" :style="agent.photo_url ? { backgroundImage: `url('${agent.photo_url}')` } : { background: color }">{{ agent.photo_url ? '' : initials(agent.name) }}</span>
      <span><b>{{ agent.name }}</b><span class="muted">{{ agent.title }}</span></span>
    </header>

    <section class="card">
      <h1>Requirements</h1>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <p v-else-if="!info" class="muted">Loading…</p>
      <template v-else>
        <p>Hi {{ info.first_name }}! Upload the documents for your <b>{{ info.unit }}</b> application ({{ info.ref }}). This link works until {{ until }}.</p>
        <div v-if="info.upload_url" class="app-form">
          <DocumentUpload :upload-url="info.upload_url" :app-ref="info.ref" :token="token" :employment-type="info.employment_type" :co-makers="info.co_makers" :existing="info.documents" />
        </div>
        <p v-else class="form-error">Uploading isn’t set up for this agent yet. Send your documents to {{ agent.name.split(' ')[0] }} directly for now.</p>
      </template>
    </section>
  </div>
</template>

<style scoped>
.upload-view { max-width: 440px; margin: 0 auto; padding-inline: 16px; padding-block: 24px 40px; display: flex; flex-direction: column; gap: 16px; }
.who { display: flex; gap: 12px; align-items: center; }
.who > span:last-child { display: flex; flex-direction: column; }
.av { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; color: #fff; background-size: cover; background-position: center; font-family: var(--display); font-weight: 700; font-size: 18px; flex: none; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 18px 16px; display: flex; flex-direction: column; gap: 10px; }
h1 { font-size: 28px; text-transform: uppercase; }
p { margin: 0; }
.muted { color: var(--muted); font-size: 13px; }
</style>
