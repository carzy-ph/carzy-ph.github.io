<script setup lang="ts">
// Add or edit an agent's card. Admins can edit any agent; agents edit their own card,
// minus the fields the admin controls (the database enforces this too).
import { computed, ref, watch } from 'vue';
import { RouterLink, onBeforeRouteLeave, useRouter } from 'vue-router';
import type { Agent, SocialType } from '@/types';
import { CONFIG, cardUrl } from '@/config';
import { SOCIAL, THEMES } from '@/lib/constants';
import { initials, relTime } from '@/lib/format';
import { COVER, PHOTO_ACCEPT, PHOTO_HINT, PROFILE, checkPhoto, optimizePhoto, photoPath } from '@/lib/image';
import { catalogFor } from '@/lib/catalog';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { confirmDialog } from '@/lib/confirm';
import { agentById, agentColor, areaUrl, brandName, friendly, isAdmin, loadAll, store } from '../store';
import CardView from '@/components/card/CardView.vue';
import SelectMenu from '@/components/SelectMenu.vue';

const props = defineProps<{ id: string | null }>();
const router = useRouter();

const blankAgent = (): Agent => ({
  id: crypto.randomUUID(), slug: '', brand_id: null, name: '', title: 'Sales Consultant',
  dealership: CONFIG.dealership.name, branch: '', hours: 'Available · 9AM–6PM', phone: '', email: '',
  photo_url: null, cover_url: null, theme: THEMES[store.agents.length % THEMES.length]!.color, active: true,
  links: [{ type: 'facebook', label: '', url: '' }, { type: 'viber', label: '', url: '' }],
  stats: [{ v: '', l: 'Yrs selling' }, { v: '', l: 'Units released' }, { v: '', l: 'Client rating' }]
});

const draft = ref<Agent>(blankAgent());
const loginEmail = ref('');
const origSlug = ref('');
const slugTouched = ref(false);
const photoFile = ref<File | null>(null);
const photoPreview = ref<string | null>(null);
const coverFile = ref<File | null>(null);
const coverPreview = ref<string | null>(null);
const saved = ref('');
const saving = ref(false);
const showPreview = ref(false);
const missing = ref(false);
let leaving = false;

const isNew = computed(() => !props.id);
const agentPortalUrl = location.origin + areaUrl('agent');
const admin = computed(() => isAdmin.value);
const snapshot = () => JSON.stringify([draft.value, loginEmail.value]);
const dirty = computed(() => saved.value !== snapshot() || Boolean(photoFile.value) || Boolean(coverFile.value));
const stats = computed(() => (props.id ? store.stats[props.id] : undefined));
const color = computed(() => agentColor(draft.value));
const brandColorName = computed(() => (color.value !== draft.value.theme ? brandName(draft.value.brand_id) : ''));
const previewCatalog = computed(() => catalogFor(draft.value.brand_id, store.brands, store.models));
const previewAgent = computed<Agent>(() => ({
  ...draft.value,
  photo_url: photoPreview.value ?? draft.value.photo_url,
  cover_url: coverPreview.value ?? draft.value.cover_url
}));
const nfcLink = computed(() => cardUrl(draft.value.slug || '…') + '?src=nfc');
const slugChanged = computed(() => Boolean(origSlug.value) && origSlug.value !== draft.value.slug);
const platformOptions = (Object.entries(SOCIAL) as [SocialType, (typeof SOCIAL)[SocialType]][])
  .map(([value, s]) => ({ value, label: s.name, color: s.color }));
const brandOptions = computed(() => [
  { value: null, label: 'All brands', hint: 'Clients can apply for any brand' },
  ...store.brands.map(b => ({ value: b.id as string | null, label: b.name, color: b.color, hint: b.active ? undefined : 'Hidden from cards' }))
]);

function load() {
  const a = props.id ? agentById(props.id) : null;
  missing.value = Boolean(props.id && !a);
  const d: Agent = a ? JSON.parse(JSON.stringify(a)) : blankAgent();
  d.links = d.links ?? [];
  d.stats = [0, 1, 2].map(i => d.stats?.[i] ?? { v: '', l: '' });
  draft.value = d;
  loginEmail.value = a ? store.team.find(t => t.agent_id === a.id)?.email ?? '' : '';
  origSlug.value = a?.slug ?? '';
  slugTouched.value = Boolean(a);
  if (photoPreview.value) URL.revokeObjectURL(photoPreview.value);
  photoFile.value = null;
  photoPreview.value = null;
  if (coverPreview.value) URL.revokeObjectURL(coverPreview.value);
  coverFile.value = null;
  coverPreview.value = null;
  saved.value = snapshot();
}
watch(() => props.id, load, { immediate: true });

// New agents get a card address from their first name until the admin types one.
watch(() => draft.value.name, n => {
  if (isNew.value && !slugTouched.value) draft.value.slug = (n.trim().toLowerCase().split(/\s+/)[0] || '').replace(/[^a-z0-9-]/g, '');
});

function onSlug(e: Event) {
  const input = e.target as HTMLInputElement;
  input.value = input.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
  draft.value.slug = input.value;
  slugTouched.value = true;
}

/** Validates a picked photo; clears the file input either way so picking the same file again still works. */
function pickPhoto(e: Event): File | null {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  input.value = '';
  if (!file) return null;
  const problem = checkPhoto(file);
  if (problem) { toast(problem); return null; }
  return file;
}

function onPhoto(e: Event) {
  const file = pickPhoto(e);
  if (!file) return;
  if (photoPreview.value) URL.revokeObjectURL(photoPreview.value);
  photoFile.value = file;
  photoPreview.value = URL.createObjectURL(file);
}

function onCover(e: Event) {
  const file = pickPhoto(e);
  if (!file) return;
  if (coverPreview.value) URL.revokeObjectURL(coverPreview.value);
  coverFile.value = file;
  coverPreview.value = URL.createObjectURL(file);
}
function removeCover() {
  if (coverPreview.value) URL.revokeObjectURL(coverPreview.value);
  coverFile.value = null;
  coverPreview.value = null;
  draft.value.cover_url = null;
}

function addLink() { draft.value.links.push({ type: 'instagram', label: '', url: '' }); }
function moveLink(i: number, by: number) {
  const l = draft.value.links;
  [l[i], l[i + by]] = [l[i + by]!, l[i]!];
}

async function copyLink() {
  try { await navigator.clipboard.writeText(nfcLink.value); toast('Link copied. Paste it into your NFC writer app.'); }
  catch { toast('Copy didn’t work here. Select the link and copy it manually.'); }
}

async function save() {
  const a = draft.value;
  const login = loginEmail.value.trim().toLowerCase();
  if (!a.name.trim()) return toast('Add the agent’s full name.');
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(a.slug)) return toast('Card address: 2–40 lowercase letters, numbers or dashes.');
  if (admin.value && login) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(login)) return toast('Enter a valid portal login email.');
    const clash = store.team.find(t => t.email === login);
    if (clash?.role === 'admin') return toast('That email is an admin login. Use a different email for the agent.');
    if (clash?.agent_id && clash.agent_id !== a.id) return toast(`That email is already linked to ${agentById(clash.agent_id)?.name ?? 'another agent'}.`);
  }

  saving.value = true;
  const bucket = supabase.storage.from('agent-photos');
  const before = agentById(a.id);
  const uploaded: string[] = [];
  // Unique file names never change, so browsers and Supabase's CDN can keep them for a year.
  const upload = async (file: File, target: typeof PROFILE, prefix: string) => {
    const { blob, ext } = await optimizePhoto(file, target);
    const path = `${a.id}/${prefix}${Date.now()}.${ext}`;
    const up = await bucket.upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
    if (up.error) throw up.error;
    uploaded.push(path);
    return bucket.getPublicUrl(path).data.publicUrl;
  };
  try {
    if (photoFile.value) a.photo_url = await upload(photoFile.value, PROFILE, '');
    if (coverFile.value) a.cover_url = await upload(coverFile.value, COVER, 'cover-');
    const own = {
      name: a.name.trim(), title: a.title.trim(), hours: a.hours.trim(), phone: a.phone.trim(), email: a.email.trim(),
      photo_url: a.photo_url, cover_url: a.cover_url, theme: a.theme,
      links: a.links.filter(l => l.url.trim() || l.label.trim()).map(l => ({ type: l.type, label: l.label.trim(), url: l.url.trim() })),
      stats: a.stats.map(s => ({ v: s.v.trim(), l: s.l.trim() }))
    };
    const row = admin.value
      ? { ...own, id: a.id, slug: a.slug, brand_id: a.brand_id, dealership: a.dealership.trim(), branch: a.branch.trim(), active: a.active }
      : own;
    const res = isNew.value
      ? await supabase.from('agents').insert(row)
      : await supabase.from('agents').update(row).eq('id', a.id);
    if (res.error) throw res.error;

    if (admin.value) {
      const current = store.team.find(t => t.agent_id === a.id);
      if (current?.email !== (login || undefined)) {
        if (current) { const d = await supabase.from('team').delete().eq('email', current.email); if (d.error) throw d.error; }
        if (login) { const i = await supabase.from('team').insert({ email: login, role: 'agent', agent_id: a.id }); if (i.error) throw i.error; }
      }
    }

    // Delete photos this save replaced or removed, so storage only holds what cards use.
    const stale = [before?.photo_url, before?.cover_url]
      .filter(u => u && u !== a.photo_url && u !== a.cover_url)
      .map(photoPath).filter((p): p is string => Boolean(p));
    if (stale.length) await bucket.remove(stale); // best effort: a leftover file doesn't affect the card

    await loadAll();
    if (isNew.value) {
      leaving = true;
      await router.replace(`/agents/${a.id}`);
      leaving = false;
      toast('Agent created. Copy the NFC card link below and write it to their card.');
    } else {
      load();
      toast('Saved. The card shows your changes right away.');
    }
  } catch (e) {
    if (uploaded.length) await bucket.remove(uploaded); // don't keep photos from a save that failed
    toast(friendly(e));
  } finally {
    saving.value = false;
  }
}

onBeforeRouteLeave(async () => {
  if (leaving || !dirty.value) return true;
  return confirmDialog({
    title: 'Leave without saving?',
    message: 'Your changes to this card haven’t been saved yet.',
    confirmLabel: 'Discard changes',
    cancelLabel: 'Keep editing',
    danger: true
  });
});
</script>

<template>
  <section v-if="missing" class="page">
    <h1>Agent not found</h1>
    <RouterLink class="btn" to="/agents">Back to agents</RouterLink>
  </section>

  <section v-else class="page">
    <div class="page-head">
      <div>
        <RouterLink v-if="admin" class="btn small" to="/agents" style="margin-bottom:8px">‹ Agents</RouterLink>
        <span class="eyebrow" style="display:block">{{ admin ? (isNew ? 'New agent' : 'Edit agent') : 'My card' }}</span>
        <h1>{{ draft.name || 'New agent' }}</h1>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <div class="seg" role="tablist">
          <button :class="{ on: !showPreview }" role="tab" :aria-selected="!showPreview" @click="showPreview = false">Edit</button>
          <button :class="{ on: showPreview }" role="tab" :aria-selected="showPreview" @click="showPreview = true">Preview</button>
        </div>
        <a v-if="!isNew" class="btn" :href="cardUrl(origSlug)" target="_blank" rel="noopener">Open card</a>
        <button class="btn primary" :disabled="saving" @click="save">{{ saving ? 'Saving…' : isNew ? 'Create agent' : 'Save changes' }}</button>
      </div>
    </div>

    <div class="edit-grid" :class="{ pv: showPreview }">
      <div class="edit-form">
        <section v-if="admin" class="block">
          <div class="toggle">
            <span class="t"><b>Card is live</b><span class="hint">Turn off when the agent leaves. The card then shows the dealership’s main contact instead.</span></span>
            <span class="switch"><input id="t-active" v-model="draft.active" type="checkbox" aria-label="Card is live"><span></span></span>
          </div>
        </section>

        <section class="block">
          <div class="block-h"><h2>Profile</h2></div>
          <div class="photo-row">
            <span class="av" :style="previewAgent.photo_url ? { background: `${color} url('${previewAgent.photo_url}') center/cover` } : { background: color }">{{ previewAgent.photo_url ? '' : initials(draft.name) }}</span>
            <div style="display:flex;flex-direction:column;gap:4px">
              <label class="btn small" for="photo" style="cursor:pointer">{{ previewAgent.photo_url ? 'Change photo' : 'Upload photo' }}</label>
              <input id="photo" type="file" :accept="PHOTO_ACCEPT" hidden @change="onPhoto">
              <span class="hint">Cropped to a square. {{ PHOTO_HINT }}</span>
            </div>
          </div>
          <div class="field">
            <span class="lbl">Cover photo</span>
            <div class="cover-pick" :style="previewAgent.cover_url ? { backgroundImage: `url('${previewAgent.cover_url}')` } : { background: color }">
              <span v-if="!previewAgent.cover_url">No cover: the card uses its color</span>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <label class="btn small" for="cover" style="cursor:pointer">{{ previewAgent.cover_url ? 'Change cover' : 'Upload cover' }}</label>
              <input id="cover" type="file" :accept="PHOTO_ACCEPT" hidden @change="onCover">
              <button v-if="previewAgent.cover_url" class="btn small" type="button" @click="removeCover">Remove</button>
            </div>
            <span class="hint">A landscape photo of a car or the showroom, shown behind the name. It fades to black behind the name so the text stays readable. {{ PHOTO_HINT }}</span>
          </div>
          <div class="grid2">
            <div class="field"><label for="f-name">Full name</label><input id="f-name" v-model="draft.name" class="inp" autocomplete="off"></div>
            <div class="field"><label for="f-title">Title</label><input id="f-title" v-model="draft.title" class="inp"></div>
            <div class="field"><label for="f-dealership">Dealership</label><input id="f-dealership" v-model="draft.dealership" class="inp" :readonly="!admin"></div>
            <div class="field"><label for="f-branch">Branch</label><input id="f-branch" v-model="draft.branch" class="inp" :readonly="!admin"></div>
          </div>
          <div class="field">
            <label for="f-brand">Brand</label>
            <SelectMenu v-if="admin" id="f-brand" v-model="draft.brand_id" :options="brandOptions" aria-label="Brand" />
            <input v-else id="f-brand" class="inp" readonly :value="brandName(draft.brand_id) || 'All brands'">
            <span class="hint">{{ draft.brand_id ? `Clients can only apply for ${brandName(draft.brand_id)} units on this card.` : 'Clients can apply for any brand’s units on this card.' }}<template v-if="admin && !store.brands.length"> Add brands under Units.</template></span>
          </div>
          <div class="field"><label for="f-hours">Availability line</label><input id="f-hours" v-model="draft.hours" class="inp" placeholder="e.g. Available · 9AM–6PM"></div>
        </section>

        <section class="block">
          <div class="block-h"><h2>Contact</h2><span class="hint">Used by Call, Text, Email and Save contact</span></div>
          <div class="grid2">
            <div class="field"><label for="f-phone">Mobile</label><input id="f-phone" v-model="draft.phone" class="inp" type="tel" placeholder="0917 123 4567"></div>
            <div class="field"><label for="f-email">Email</label><input id="f-email" v-model="draft.email" class="inp" type="email"></div>
          </div>
        </section>

        <section class="block">
          <div class="block-h"><h2>Social links</h2><span class="hint">{{ draft.links.length }} {{ draft.links.length === 1 ? 'link' : 'links' }}</span></div>
          <div class="links-ed">
            <div v-for="(l, i) in draft.links" :key="i" class="link-row">
              <span class="gl" :style="{ background: SOCIAL[l.type].color }">{{ SOCIAL[l.type].glyph }}</span>
              <div class="fields">
                <SelectMenu :id="`l-t${i}`" v-model="l.type" :options="platformOptions" aria-label="Platform" />
                <input :id="`l-l${i}`" v-model="l.label" class="inp" placeholder="Short line, e.g. @handle or 0917 123 4567" aria-label="Label">
                <input :id="`l-u${i}`" v-model="l.url" class="inp url" placeholder="https://… or viber://chat?number=%2B639171234567" aria-label="Link">
              </div>
              <div class="ctl">
                <button class="btn icon" :disabled="i === 0" aria-label="Move up" @click="moveLink(i, -1)">↑</button>
                <button class="btn icon" :disabled="i === draft.links.length - 1" aria-label="Move down" @click="moveLink(i, 1)">↓</button>
                <button class="btn icon" aria-label="Remove" @click="draft.links.splice(i, 1)">✕</button>
              </div>
            </div>
            <p v-if="!draft.links.length" class="hint" style="margin:0">No links yet. Add Facebook, Viber or any other channel.</p>
          </div>
          <button class="btn" @click="addLink">+ Add link</button>
        </section>

        <section class="block">
          <div class="block-h"><h2>Highlights</h2><span class="hint">3 numbers on the card. Leave blank to hide.</span></div>
          <div class="stats-ed">
            <div v-for="(s, i) in draft.stats" :key="i" class="stat">
              <input :id="`s-v${i}`" v-model="s.v" class="inp" placeholder="7" :aria-label="`Highlight ${i + 1} number`">
              <input :id="`s-l${i}`" v-model="s.l" class="inp" placeholder="Yrs selling" :aria-label="`Highlight ${i + 1} label`">
            </div>
          </div>
        </section>

        <section class="block">
          <div class="block-h"><h2>Card color</h2></div>
          <p v-if="brandColorName" class="brand-color">
            <span class="dot" :style="{ background: color }"></span>
            <span>Uses {{ brandColorName }}’s color, so every {{ brandColorName }} agent matches.<template v-if="admin"> Change it under Units.</template></span>
          </p>
          <div v-else class="swatches">
            <button v-for="t in THEMES" :key="t.color" class="sw" :class="{ on: draft.theme === t.color }" :style="{ background: t.color }" :aria-label="t.name" :title="t.name" @click="draft.theme = t.color"></button>
          </div>
        </section>

        <section v-if="admin" class="block">
          <div class="block-h"><h2>Portal login</h2></div>
          <div class="field">
            <label for="f-login">Portal login email (Google account)</label>
            <input id="f-login" v-model="loginEmail" class="inp" type="email" placeholder="agent@gmail.com" autocomplete="off">
            <span class="hint">The agent signs in at <b>{{ agentPortalUrl }}</b> with this Google account to see their applications and edit their card. It must be a Gmail or Google Workspace address. Leave blank for no portal access.</span>
          </div>
        </section>

        <section class="block">
          <div class="block-h"><h2>NFC card link</h2><span v-if="!admin" class="lock">Set by admin</span></div>
          <div class="field">
            <label for="f-slug">Card address</label>
            <div class="slug-wrap"><span>/cards/</span><input id="f-slug" :value="draft.slug" :readonly="!admin" autocomplete="off" spellcheck="false" placeholder="firstname" @input="onSlug"></div>
            <span class="hint">2–40 lowercase letters, numbers or dashes.</span>
            <span v-if="slugChanged" class="warn">If this card is already written, changing the address breaks the link on the physical card.</span>
          </div>
          <div class="field">
            <span class="lbl">Link to write on the card</span>
            <div class="url-row"><input id="f-url" class="inp" readonly :value="nfcLink" aria-label="Card link"><button class="btn" :disabled="isNew" @click="copyLink">Copy</button></div>
          </div>
          <ol class="nfc-steps">
            <li v-if="isNew">Create the agent first.</li>
            <li>Open an NFC writer app (e.g. NFC Tools) on your phone.</li>
            <li>Add a record → URL → paste this link → write it to the card.</li>
            <li>Write it once. Edits here update the page; the card never needs rewriting.</li>
          </ol>
          <div v-if="!isNew" class="tapinfo">
            <span>Taps this week <b>{{ stats?.taps_week ?? 0 }}</b></span>
            <span>Last tap <b>{{ relTime(stats?.last_tap) }}</b></span>
          </div>
        </section>
      </div>

      <aside class="preview-col">
        <span class="eyebrow">Live preview</span>
        <div class="phone"><div class="screen"><div v-if="!draft.active" class="pv-off">Card is off · visitors see the dealership contact</div><CardView :agent="previewAgent" :catalog="previewCatalog" source="nfc" preview /></div></div>
      </aside>
    </div>
  </section>
</template>
