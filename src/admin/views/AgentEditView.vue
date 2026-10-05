<script setup lang="ts">
// Add or edit an agent's card. Admins can edit any agent; agents edit their own card,
// minus the fields the admin controls (the database enforces this too).
import { computed, ref, watch } from 'vue';
import { RouterLink, onBeforeRouteLeave, useRouter } from 'vue-router';
import type { Agent, SocialType, TeamMember } from '@/types';
import { cardUrl } from '@/config';
import { SOCIAL, THEMES } from '@/lib/constants';
import { initials, relTime } from '@/lib/format';
import { COVER, PHOTO_ACCEPT, PHOTO_HINT, PROFILE, checkPhoto, optimizePhoto, photoPath } from '@/lib/image';
import { catalogFor } from '@/lib/catalog';
import { LINK_HINT, resolveLink, toLink } from '@/lib/links';
import { connectDrive, disconnectDrive } from '@/lib/drive';
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
  dealership: '', branch: '', hours: 'Available · 9AM–6PM', phone: '', email: '',
  photo_url: null, cover_url: null, theme: THEMES[store.agents.length % THEMES.length]!.color, active: true,
  links: [{ type: 'facebook', label: '', url: '' }, { type: 'viber', label: '', url: '' }],
  stats: [{ v: '', l: 'Yrs selling' }, { v: '', l: 'Units released' }, { v: '', l: 'Client rating' }]
});

const draft = ref<Agent>(blankAgent());
const loginEmail = ref('');
const origSlug = ref('');
const slugTouched = ref(false);
/** The card address is read-only until an admin chooses Customize. */
const editingSlug = ref(false);
/** Portal sign-in is the contact email unless an admin picks a different Google account. */
const customLogin = ref(false);
/** Requirements upload: the agent's connected Google Drive. */
const driveBusy = ref(false);
const drive = computed(() => (props.id ? store.drives[props.id] ?? null : null));
const ownCard = computed(() => Boolean(props.id) && props.id === store.me?.agent_id);
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
const snapshot = () => JSON.stringify([draft.value, loginEmail.value, customLogin.value]);
const effectiveLogin = computed(() => (customLogin.value ? loginEmail.value : draft.value.email).trim().toLowerCase());
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
  editingSlug.value = false;
  customLogin.value = Boolean(loginEmail.value && loginEmail.value !== (a?.email ?? '').trim().toLowerCase());
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
// The card address is made automatically from the name and is always unique:
// "marco", then "marco-villanueva", then "marco-villanueva-2", and so on.
const slugTaken = (slug: string) => store.agents.some(x => x.slug === slug && x.id !== draft.value.id);
function autoSlug(name: string): string {
  const words = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/).filter(Boolean);
  if (!words.length) return '';
  const first = words[0]!, full = words.join('-').slice(0, 36).replace(/-+$/, '');
  const candidates = [first, `${first}-${words[words.length - 1]}`, full].filter(c => c.length >= 2);
  for (const c of candidates) if (!slugTaken(c)) return c;
  const base = candidates[candidates.length - 1] || 'agent';
  for (let n = 2; ; n++) if (!slugTaken(`${base}-${n}`)) return `${base}-${n}`;
}
watch(() => draft.value.name, n => {
  if (isNew.value && !slugTouched.value) draft.value.slug = autoSlug(n);
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

async function refreshDrive() {
  const { data } = await supabase.from('agent_drive').select('agent_id, account, folder_id, connected_at');
  store.drives = Object.fromEntries((data ?? []).map(d => [d.agent_id, d]));
}
async function onConnectDrive() {
  driveBusy.value = true;
  try {
    const account = await connectDrive(store.email);
    await refreshDrive();
    toast(`Google Drive connected${account ? ` (${account})` : ''}. Clients can now upload their requirements.`);
  } catch (e) {
    toast((e as Error).message);
  } finally {
    driveBusy.value = false;
  }
}
async function onDisconnectDrive() {
  const ok = await confirmDialog({
    title: 'Disconnect Google Drive?',
    message: 'Clients won’t be able to upload until you connect again. Files already in your Drive stay there.',
    confirmLabel: 'Disconnect', danger: true
  });
  if (!ok) return;
  driveBusy.value = true;
  try { await disconnectDrive(); await refreshDrive(); toast('Google Drive disconnected.'); }
  catch (e) { toast((e as Error).message); }
  finally { driveBusy.value = false; }
}

async function copyLink() {
  try { await navigator.clipboard.writeText(nfcLink.value); toast('Link copied. Paste it into your NFC writer app.'); }
  catch { toast('Copy didn’t work here. Select the link and copy it manually.'); }
}

async function save() {
  const a = draft.value;
  const login = effectiveLogin.value;
  if (!a.name.trim()) return toast('Add the agent’s full name.');
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(a.slug)) return toast('Card address: 2–40 lowercase letters, numbers or dashes.');
  const brokenLink = a.links.find(l => (l.url.trim() || l.label.trim()) && !toLink(l.type, l.url) && !resolveLink(l));
  if (brokenLink) return toast(`Add the ${SOCIAL[brokenLink.type].name} link, handle or number, or remove that row.`);
  if (slugTaken(a.slug)) return toast(`The card address “${a.slug}” is already used by another agent. Pick a different one.`);
  if (admin.value && login) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(login)) return toast('Enter a valid portal login email.');
    const clash = store.team.find(t => t.email === login);
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
      links: a.links.flatMap(l => {
        const url = toLink(l.type, l.url) || resolveLink(l)?.url || '';
        return url ? [{ type: l.type, label: l.url.trim() ? l.label.trim() : (resolveLink(l)?.text ?? ''), url }] : [];
      }),
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
      // Link the portal login. Read the team list fresh: saving the agent may have just linked their
      // contact email automatically (database trigger). An admin's own email can be linked too; it
      // keeps admin access, and unlinking it later never removes the admin.
      const fresh = await supabase.from('team').select('*');
      if (fresh.error) throw fresh.error;
      const team = (fresh.data ?? []) as TeamMember[];
      const current = team.find(t => t.agent_id === a.id);
      if (current?.email !== (login || undefined)) {
        if (current) {
          const r = current.role === 'admin'
            ? await supabase.from('team').update({ agent_id: null }).eq('email', current.email)
            : await supabase.from('team').delete().eq('email', current.email);
          if (r.error) throw r.error;
        }
        if (login) {
          const owner = team.find(t => t.email === login);
          const r = owner
            ? await supabase.from('team').update({ agent_id: a.id }).eq('email', login)
            : await supabase.from('team').insert({ email: login, role: 'agent', agent_id: a.id });
          if (r.error) throw r.error;
        }
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
          <p class="public-note" role="note">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></svg>
            <span><b>This profile is public.</b> Everything below (photos, name, contact numbers, links) appears on the card page, which anyone with the link can open. The portal login email is never shown. Turning the card off hides the profile from the public.</span>
          </p>
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
            <div class="field"><label for="f-dealership">Dealership</label><input id="f-dealership" v-model="draft.dealership" class="inp" :readonly="!admin" placeholder="e.g. Toyota Quezon Avenue"></div>
            <div class="field"><label for="f-branch">Branch</label><input id="f-branch" v-model="draft.branch" class="inp" :readonly="!admin" placeholder="e.g. Quezon City"></div>
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
            <div class="field"><label for="f-email">Email <span class="opt">(public)</span></label><input id="f-email" v-model="draft.email" class="inp" type="email"></div>
          </div>
          <div v-if="admin" class="field signin">
            <span class="lbl">Portal sign-in <span class="opt">(private)</span></span>
            <template v-if="!customLogin">
              <p v-if="effectiveLogin" class="signin-line">Signs in at <b>{{ agentPortalUrl }}</b> with <b>{{ effectiveLogin }}</b>, the email above, using Google.</p>
              <p v-else class="warn signin-line">Add an email above to give this agent portal access.</p>
              <button class="btn small" type="button" style="align-self:flex-start" @click="customLogin = true; loginEmail = loginEmail || ''">Use a different Google account</button>
            </template>
            <template v-else>
              <div class="slug-row">
                <input id="f-login" v-model="loginEmail" class="inp" type="email" placeholder="agent@gmail.com" autocomplete="off">
                <button class="btn small" type="button" @click="customLogin = false">Use the email above</button>
              </div>
              <span class="hint">The agent signs in at <b>{{ agentPortalUrl }}</b> with this Google account instead. Leave it blank for no portal access.</span>
            </template>
            <span class="hint">Must be a Gmail or Google Workspace account. It’s never shown on the card.</span>
          </div>
        </section>

        <section class="block">
          <div class="block-h"><h2>Social links</h2><span class="hint">{{ draft.links.length }} {{ draft.links.length === 1 ? 'link' : 'links' }}</span></div>
          <div class="links-ed">
            <div v-for="(l, i) in draft.links" :key="i" class="link-row">
              <span class="gl" :style="{ background: SOCIAL[l.type].color }">{{ SOCIAL[l.type].glyph }}</span>
              <div class="fields">
                <SelectMenu :id="`l-t${i}`" v-model="l.type" :options="platformOptions" aria-label="Platform" />
                <input :id="`l-u${i}`" v-model="l.url" class="inp" :placeholder="LINK_HINT[l.type]" aria-label="Link, handle or number" autocomplete="off" spellcheck="false" @blur="l.url = toLink(l.type, l.url) || l.url.trim()">
                <input :id="`l-l${i}`" v-model="l.label" class="inp url" placeholder="Text on the card (optional), e.g. Latest units & promos" aria-label="Text on the card">
                <span class="link-check" :class="{ bad: Boolean(l.url.trim()) && !toLink(l.type, l.url) }">
                  {{ !l.url.trim() ? 'Add the link, handle or number above.' : toLink(l.type, l.url) ? `Opens ${toLink(l.type, l.url).replace(/^https?:\/\//, '')}` : 'That doesn’t look like a link for this platform.' }}
                </span>
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


        <section v-if="!isNew" class="block">
          <div class="block-h"><h2>Requirements upload</h2><span class="hint">Google Drive</span></div>
          <template v-if="drive">
            <p class="ok-line" style="margin:0;font-size:14px">✓ Connected{{ drive.account ? `: ${drive.account}` : '' }}</p>
            <p class="hint" style="margin:0">Clients’ documents go into the <b>Carzy requirements</b> folder in that Google Drive, one subfolder per application. Carzy can only see files it saved there.</p>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <a v-if="drive.folder_id" class="btn small" :href="`https://drive.google.com/drive/folders/${drive.folder_id}`" target="_blank" rel="noopener">Open folder</a>
              <button v-if="ownCard" class="btn small" type="button" :disabled="driveBusy" @click="onDisconnectDrive">Disconnect</button>
            </div>
          </template>
          <template v-else-if="ownCard">
            <p class="hint" style="margin:0">Let clients upload their requirements (IDs, payslips…) straight into your own Google Drive. Carzy creates a <b>Carzy requirements</b> folder and can only see files it saves there.</p>
            <button class="btn primary" type="button" style="align-self:flex-start" :disabled="driveBusy" @click="onConnectDrive">{{ driveBusy ? 'Connecting…' : 'Connect Google Drive' }}</button>
          </template>
          <p v-else class="hint" style="margin:0">Not connected yet. {{ draft.name.split(' ')[0] || 'The agent' }} connects their own Google Drive from <b>My card</b> in the Agent Portal.</p>
        </section>

        <section class="block">
          <div class="block-h"><h2>NFC card link</h2><span v-if="!admin" class="lock">Set by admin</span></div>
          <div class="field">
            <label for="f-slug">Card address</label>
            <div class="slug-row">
              <div class="slug-wrap" :class="{ locked: !editingSlug }"><span>/cards/</span><input id="f-slug" :value="draft.slug" :readonly="!editingSlug" autocomplete="off" spellcheck="false" :placeholder="isNew ? 'made from the name' : ''" @input="onSlug"></div>
              <button v-if="admin && !editingSlug" class="btn small" type="button" @click="editingSlug = true">Customize</button>
            </div>
            <span class="hint">{{ editingSlug ? '2–40 lowercase letters, numbers or dashes.' : isNew ? 'Created automatically from the name, and always unique.' : 'Fixed once the link is written to a card.' }}</span>
            <span v-if="slugChanged" class="warn">If this card is already written, changing the address breaks the link on the physical card.</span>
          </div>
          <div class="field">
            <span class="lbl">Link to write on the card <span class="opt">(public)</span></span>
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
