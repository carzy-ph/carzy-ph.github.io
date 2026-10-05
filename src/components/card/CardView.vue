<script setup lang="ts">
// The agent's public card. Used as-is by the card page and by the portal's live preview,
// so the preview always matches what clients see.
import { computed } from 'vue';
import type { Agent, ApplicationInput, Catalog, Source } from '@/types';
import { SOCIAL } from '@/lib/constants';
import { initials, safeUrl, toIntl } from '@/lib/format';
import { saveContact } from '@/lib/vcard';
import { resolveLink } from '@/lib/links';
import { cardColor } from '@/lib/catalog';
import ApplicationForm from './ApplicationForm.vue';
import ThemeToggle from '../ThemeToggle.vue';

const props = defineProps<{
  agent: Agent;
  /** Units this card offers (see catalogFor). */
  catalog: Catalog;
  source?: Source;
  /** Portal preview: links don't navigate, the form doesn't send, the action bar stays in the frame. */
  preview?: boolean;
  submit?: (p: ApplicationInput) => Promise<string>;
}>();

const a = computed(() => props.agent);
const tel = computed(() => toIntl(a.value.phone));
// A highlight shows only once it has a number; a label alone looks broken.
const stats = computed(() => (a.value.stats || []).filter(s => s && s.v?.trim()));
const heroStyle = computed(() => (a.value.cover_url ? { '--cover': `url('${a.value.cover_url}')` } : undefined));
// Each link resolved to a working address and display text; incomplete links are left off the card.
const links = computed(() => (a.value.links || []).flatMap(l => {
  const r = SOCIAL[l.type] ? resolveLink(l) : null;
  return r ? [{ type: l.type, ...r }] : [];
}));
const color = computed(() => cardColor(a.value, props.catalog.brands));
const brandName = computed(() => props.catalog.brands.find(b => b.id === a.value.brand_id)?.name);
const dealerLine = computed(() => [brandName.value, a.value.dealership, a.value.branch].filter(Boolean).join(' · '));

function onSave() {
  if (!props.preview) saveContact(a.value, location.origin + location.pathname);
}
// In the preview, links shouldn't leave the portal; form controls still work.
function blockLinksInPreview(e: MouseEvent) {
  if (props.preview && (e.target as HTMLElement).closest('a')) e.preventDefault();
}
</script>

<template>
  <div class="card-view" :class="{ preview }" :style="{ '--brand': color }" @click.capture="blockLinksInPreview">
    <div v-if="!preview || source === 'nfc'" class="top-row">
    <div v-if="source === 'nfc'" class="nfc" role="note">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 8.5a5 5 0 0 1 0 7"/><path d="M9.5 6a9 9 0 0 1 0 12"/><path d="M13 3.5a13 13 0 0 1 0 17"/></svg>
      <span><b>You tapped my card.</b> Save my contact or apply for your car below.</span>
    </div>
    <ThemeToggle v-if="!preview" class="theme" />
    </div>

    <header class="hero" :class="{ 'has-cover': agent.cover_url }" :style="heroStyle">
      <div class="hero-top">
        <div class="avatar" :style="agent.photo_url ? { backgroundImage: `url('${agent.photo_url}')` } : undefined" aria-hidden="true">
          {{ agent.photo_url ? '' : initials(agent.name) }}
        </div>
        <span v-if="agent.hours" class="status"><i></i>{{ agent.hours }}</span>
      </div>
      <h1>{{ agent.name || 'Agent name' }}</h1>
      <p v-if="agent.title" class="role">{{ agent.title }}</p>
      <span v-if="dealerLine" class="dealer">{{ dealerLine }}</span>
      <div v-if="stats.length" class="spec">
        <div v-for="(s, i) in stats" :key="i"><strong>{{ s.v }}</strong><span>{{ s.l }}</span></div>
      </div>
    </header>

    <nav class="quick" aria-label="Contact">
      <template v-if="tel">
        <a class="qa" :href="`tel:${tel}`">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>Call</a>
        <a class="qa" :href="`sms:${tel}`">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Text</a>
      </template>
      <a v-if="agent.email" class="qa" :href="`mailto:${agent.email}`">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>Email</a>
      <button class="qa" type="button" @click="onSave">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>Save</button>
    </nav>

    <a class="cta" href="#apply">Apply for a car loan
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>

    <section v-if="links.length" class="section" aria-labelledby="h-social">
      <h2 id="h-social">Find me on</h2>
      <ul class="links">
        <li v-for="(l, i) in links" :key="i">
          <a :href="safeUrl(l.url)" target="_blank" rel="noopener">
            <span class="badge" :style="{ background: SOCIAL[l.type].color }">{{ SOCIAL[l.type].glyph }}</span>
            <span class="txt"><b>{{ SOCIAL[l.type].name }}</b><span v-if="l.text">{{ l.text }}</span></span>
            <span class="arr" aria-hidden="true">›</span>
          </a>
        </li>
      </ul>
    </section>

    <section id="apply" class="section" aria-labelledby="h-apply">
      <div class="section-head"><h2 id="h-apply">Car loan application</h2><span class="eyebrow">About 5 min</span></div>
      <div class="form-card">
        <ApplicationForm
          :agent-name="agent.name"
          :dealership="agent.dealership"
          :catalog="catalog"
          :draft-key="preview ? undefined : `application-${agent.slug}`"
          :submit="preview ? undefined : submit" />
      </div>
    </section>

    <footer>
      <span>{{ agent.dealership }}</span>
      <span class="eyebrow">Tap my card on any phone to open this page</span>
    </footer>

    <div class="bar"><div class="bar-in">
      <a v-if="tel" class="call" :href="`tel:${tel}`">Call</a>
      <a v-else class="call" href="#h-social">Message</a>
      <a class="quote" href="#apply">Apply now</a>
    </div></div>
  </div>
</template>

<style scoped>
.card-view { max-width: 440px; margin: 0 auto; padding-inline: 16px; padding-block: 16px 112px; display: flex; flex-direction: column; gap: 20px; }
@media (min-width: 700px) { .card-view:not(.preview) { padding-block: 40px 120px; } }

.top-row { display: flex; align-items: center; gap: 10px; }
.top-row .theme { margin-left: auto; }
.nfc { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; background: var(--surface); border: 1px dashed var(--line); border-radius: 999px; padding: 8px 14px; font-size: 13px; color: var(--muted); }
.nfc svg { flex: none; color: var(--signal); }
.nfc b { color: var(--ink); font-weight: 600; }

.hero { position: relative; overflow: hidden; border-radius: 22px; color: #F2F6F7; padding: 22px 20px 20px;
  background: linear-gradient(160deg, var(--brand), color-mix(in srgb, var(--brand) 55%, #000)); }
/* With a cover photo, fade to neutral black instead of the card color: a tint muddies most photos.
   The card color still carries the buttons, form and action bar. */
.hero.has-cover {
  background:
    linear-gradient(180deg,
      rgba(8,10,12,.35) 0%, rgba(8,10,12,0) 22%, rgba(8,10,12,0) 40%,
      rgba(8,10,12,.82) 64%, rgba(8,10,12,.96) 100%),
    var(--cover) center 30% / cover no-repeat,
    #0E1114;
}
.hero.has-cover::before { display: none; }
.hero.has-cover .hero-top { margin-bottom: 120px; }
.hero.has-cover h1 { text-shadow: 0 2px 12px rgba(0,0,0,.35); }
.hero::before { content: ""; position: absolute; inset: auto -20% -30px -20%; height: 120px;
  background: repeating-linear-gradient(90deg, transparent 0 26px, rgba(255,255,255,.14) 26px 52px);
  transform: perspective(160px) rotateX(58deg); transform-origin: bottom; pointer-events: none; }
.hero-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; position: relative; }
.avatar { width: 76px; height: 76px; flex: none; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,.1) center/cover no-repeat;
  border: 2px solid rgba(255,255,255,.35); font-family: var(--display); font-size: 30px; font-weight: 700; letter-spacing: .04em; }
.status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; background: rgba(255,255,255,.12); padding: 5px 10px; border-radius: 999px; }
.status i { flex: none; width: 7px; height: 7px; border-radius: 50%; background: #53D28F; box-shadow: 0 0 0 3px rgba(83,210,143,.25); }
.hero h1 { font-size: 40px; line-height: 1; text-transform: uppercase; font-weight: 700; margin-top: 16px; position: relative; overflow-wrap: anywhere; }
.role { margin: 6px 0 0; font-size: 15px; opacity: .85; position: relative; }
.dealer { display: inline-block; margin-top: 10px; font-family: var(--mono); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; border: 1px solid rgba(255,255,255,.35); border-radius: 6px; padding: 4px 8px; position: relative; }
.spec { position: relative; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 18px; border-top: 1px solid rgba(255,255,255,.2); padding-top: 14px; }
.spec div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.spec div + div { border-left: 1px solid rgba(255,255,255,.2); padding-left: 12px; }
.spec strong { font-family: var(--display); font-size: 24px; font-weight: 600; line-height: 1; font-variant-numeric: tabular-nums; }
.spec span { font-size: 11px; opacity: .75; text-transform: uppercase; letter-spacing: .06em; }

.quick { display: grid; grid-template-columns: repeat(auto-fit, minmax(64px, 1fr)); gap: 8px; }
.qa { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 4px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); text-decoration: none; font-size: 12px; font-weight: 600; color: var(--ink); cursor: pointer; }
.qa svg { color: var(--accent); }
.qa:active { transform: scale(.97); }

.cta { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 16px; border-radius: var(--r); background: var(--brand); color: #fff; font: 700 20px/1 var(--display); letter-spacing: .06em; text-transform: uppercase; text-decoration: none; }

.section { display: flex; flex-direction: column; gap: 10px; scroll-margin-top: 16px; }
.section-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.section h2 { font-size: 24px; text-transform: uppercase; font-weight: 600; }
.links { list-style: none; margin: 0; padding: 0; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; }
.links li + li { border-top: 1px solid var(--line); }
.links a { display: flex; align-items: center; gap: 12px; padding: 12px 14px; text-decoration: none; }
.links a:hover { background: var(--surface-2); }
.badge { flex: none; width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; color: #fff; font: 700 15px/1 var(--body); }
.txt { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.txt b { font-weight: 600; }
.txt span { font-size: 13px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.arr { color: var(--muted); }

.form-card { background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 18px 16px; }

footer { text-align: center; font-size: 12px; color: var(--muted); display: flex; flex-direction: column; gap: 4px; }

.bar { position: fixed; left: 0; right: 0; bottom: 0; padding: 10px 16px calc(10px + env(safe-area-inset-bottom, 0px)); background: var(--surface); border-top: 1px solid var(--line); z-index: 5; }
.bar-in { max-width: 408px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1.6fr; gap: 10px; }
.bar a { display: flex; align-items: center; justify-content: center; padding: 13px; border-radius: 12px; font-weight: 700; text-decoration: none; }
.call { border: 1px solid var(--line); color: var(--ink); }
.quote { background: var(--brand); color: #fff; }

/* Inside the portal's phone frame */
.preview { padding-inline: 12px; padding-block: 12px 0; }
.preview .bar { position: sticky; margin-inline: -12px; padding-bottom: 10px; }
</style>
