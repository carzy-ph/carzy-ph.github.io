<script setup lang="ts">
// Car loan application, in four short steps so it is manageable on a phone.
// Progress is kept in sessionStorage (cleared when the tab closes or the form is sent),
// so a client can switch apps to look up details like their HR's number without losing it.
import { computed, nextTick, reactive, ref, watch } from 'vue';
import type { ApplicationInput, Catalog, CivilStatus, EmploymentType, ResidenceType } from '@/types';
import { CIVIL_STATUS, EMPLOYMENT, PH_BANKS, RESIDENCE } from '@/lib/constants';
import { age, isPhMobile } from '@/lib/format';

const props = defineProps<{
  agentName: string;
  dealership: string;
  /** Units this card offers. When empty, the form asks for the unit as free text. */
  catalog: Catalog;
  /** sessionStorage key for the in-progress draft. Leave out in the portal preview. */
  draftKey?: string;
  /** Sends the application and resolves to its reference number. Leave out in the portal preview. */
  submit?: (p: ApplicationInput) => Promise<string>;
}>();

const blank = (): ApplicationInput => ({
  brand_id: '', model_id: '', variant: '', unit: '', first_name: '', middle_name: '', last_name: '', birth_date: '', birth_place: '',
  mothers_maiden_name: '', civil_status: '', mobile: '', landline: '', email: '', address: '',
  years_at_address: '', residence_type: '', employment_type: 'employed', employer_name: '', position: '',
  years_employed: '', employer_address: '', employer_phone: '', monthly_income: '',
  other_income_source: '', other_income: '', bank: '', bank_branch: '', consent: false, website: ''
});

function loadDraft(): ApplicationInput {
  if (props.draftKey) {
    try {
      const saved = sessionStorage.getItem(props.draftKey);
      if (saved) return { ...blank(), ...JSON.parse(saved), consent: false, website: '' };
    } catch { /* storage blocked: start fresh */ }
  }
  return blank();
}

const form = reactive<ApplicationInput>(loadDraft());
watch(form, v => {
  if (!props.draftKey) return;
  try { sessionStorage.setItem(props.draftKey, JSON.stringify({ ...v, consent: false })); } catch { /* ignore */ }
}, { deep: true });

const STEPS = ['Unit & you', 'Contact', 'Work', 'Bank'];
const step = ref(0);
const root = ref<HTMLElement>();
const errors = reactive<Partial<Record<keyof ApplicationInput, string>>>({});
const sending = ref(false);
const formError = ref('');
const doneRef = ref('');

const emp = computed(() => EMPLOYMENT[form.employment_type]);

// Unit pickers cascade: brand -> model -> variant. One brand on offer means no brand picker.
const hasCatalog = computed(() => props.catalog.models.length > 0);
const singleBrand = computed(() => (props.catalog.brands.length === 1 ? props.catalog.brands[0]! : null));
const brandModels = computed(() => props.catalog.models.filter(m => m.brand_id === form.brand_id));
const model = computed(() => brandModels.value.find(m => m.id === form.model_id) ?? null);
const unitName = computed(() => {
  if (!hasCatalog.value) return form.unit;
  const brand = props.catalog.brands.find(b => b.id === form.brand_id);
  return [brand?.name, model.value?.name, form.variant].filter(Boolean).join(' ');
});
watch(singleBrand, b => { if (b) form.brand_id = b.id; }, { immediate: true });
watch(() => form.brand_id, (now, before) => { if (before !== undefined && now !== before) form.model_id = ''; });
watch(() => form.model_id, (now, before) => { if (before !== undefined && now !== before) form.variant = ''; });
const firstAgentName = computed(() => props.agentName.split(' ')[0]);
// Birthday is typed as MM / DD / YYYY (faster than scrolling a calendar back decades) and kept as YYYY-MM-DD.
const toBirthText = (iso: string) => (iso ? `${iso.slice(5, 7)} / ${iso.slice(8, 10)} / ${iso.slice(0, 4)}` : '');
const birthText = ref(toBirthText(form.birth_date));
function onBirth(e: Event) {
  const input = e.target as HTMLInputElement;
  const d = input.value.replace(/\D/g, '').slice(0, 8);
  birthText.value = [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join(' / ');
  input.value = birthText.value;
  const [mm, dd, yyyy] = [Number(d.slice(0, 2)), Number(d.slice(2, 4)), Number(d.slice(4, 8))];
  const date = new Date(yyyy, mm - 1, dd);
  const real = d.length === 8 && yyyy > 1900 && date.getMonth() === mm - 1 && date.getDate() === dd;
  form.birth_date = real ? `${d.slice(4, 8)}-${d.slice(0, 2)}-${d.slice(2, 4)}` : '';
}

const civilOptions = Object.entries(CIVIL_STATUS) as [CivilStatus, string][];
const residenceOptions = Object.entries(RESIDENCE) as [ResidenceType, string][];
const employmentOptions = Object.entries(EMPLOYMENT).map(([k, v]) => [k, v.label]) as [EmploymentType, string][];
const money = (s: string) => /^\d[\d,]*(\.\d{1,2})?$/.test(s.replace(/[₱\s]/g, ''));

function check(i: number): boolean {
  for (const k of Object.keys(errors) as (keyof ApplicationInput)[]) delete errors[k];
  const need = (k: keyof ApplicationInput, msg: string) => { if (!String(form[k]).trim()) errors[k] = msg; };

  if (i === 0) {
    if (!hasCatalog.value) need('unit', 'Enter the unit you want, for example the model and variant.');
    else if (!form.brand_id) errors.brand_id = 'Choose a brand.';
    else if (!model.value) errors.model_id = 'Choose a model.';
    else if (model.value.variants.length && !model.value.variants.includes(form.variant)) errors.variant = 'Choose a variant.';
    need('first_name', 'Enter your first name.');
    need('last_name', 'Enter your last name.');
    if (!birthText.value) errors.birth_date = 'Enter your birthday as MM / DD / YYYY.';
    else if (!form.birth_date) errors.birth_date = 'Check the date: use MM / DD / YYYY, for example 05 / 14 / 1990.';
    else if (age(form.birth_date) < 18) errors.birth_date = 'You must be at least 18 to apply.';
    need('birth_place', 'Enter your birthplace.');
    need('mothers_maiden_name', 'Enter your mother’s maiden name.');
    need('civil_status', 'Choose your civil status.');
  }
  if (i === 1) {
    if (!isPhMobile(form.mobile)) errors.mobile = 'Use a PH mobile number, for example 0917 123 4567.';
    if (form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) errors.email = 'Check the email address.';
    need('address', 'Enter your complete address.');
  }
  if (i === 2) {
    need('employer_name', `Enter the ${emp.value.nameLabel.toLowerCase()}.`);
    if (!money(form.monthly_income)) errors.monthly_income = 'Enter your monthly income in pesos, for example 45,000.';
  }
  if (i === 3) {
    if (form.other_income && !money(form.other_income)) errors.other_income = 'Enter an amount in pesos, or leave it blank.';
    if (!form.consent) errors.consent = 'Please tick the box so we can process your application.';
  }

  const first = Object.keys(errors)[0];
  if (first) nextTick(() => document.getElementById('app-' + first)?.focus());
  return !first;
}

// In the portal preview the form sits inside a phone frame, so don't scroll the whole page.
const scrollTop = () => { if (props.submit) nextTick(() => root.value?.scrollIntoView({ block: 'start' })); };

function go(i: number) {
  step.value = i;
  formError.value = '';
  scrollTop();
}
function next() { if (check(step.value)) go(step.value + 1); }

async function send() {
  if (!check(3)) return;
  if (!props.submit) { formError.value = 'Preview only. Applications are sent from the live card page.'; return; }
  sending.value = true;
  formError.value = '';
  try {
    doneRef.value = await props.submit({ ...form });
    if (props.draftKey) try { sessionStorage.removeItem(props.draftKey); } catch { /* ignore */ }
    scrollTop();
  } catch (e) {
    formError.value = (e as Error).message || 'Your application did not go through. Check your connection and try again.';
  } finally {
    sending.value = false;
  }
}

const prepare = computed(() => {
  const income = {
    employed: 'Latest 3 months’ payslips and a Certificate of Employment',
    business: 'DTI or SEC registration, latest ITR, and 6 months’ bank statements',
    ofw: 'Employment contract and proof of remittances'
  }[form.employment_type];
  return ['Two valid government IDs', income, 'Proof of billing at your current address'];
});
</script>

<template>
  <div ref="root" class="app-form">
    <div v-if="doneRef" class="done" role="status">
      <h3>Application sent</h3>
      <p>Thanks, {{ form.first_name }}! {{ firstAgentName }} will contact you within 1 business day about the next steps for your {{ unitName }}.</p>
      <span class="ref">Reference {{ doneRef }}</span>
      <div class="prep">
        <b>Documents to prepare</b>
        <ul><li v-for="p in prepare" :key="p">{{ p }}</li></ul>
        <span class="hint">Banks may ask for more, depending on your application.</span>
      </div>
    </div>

    <form v-else novalidate @submit.prevent="step === 3 ? send() : next()">
      <ol class="steps" aria-label="Application steps">
        <li v-for="(s, i) in STEPS" :key="s" :class="{ on: i <= step }" :aria-current="i === step ? 'step' : undefined">{{ s }}</li>
      </ol>

      <!-- Step 1: Unit & applicant -->
      <fieldset v-show="step === 0">
        <legend>Unit &amp; applicant</legend>
        <template v-if="hasCatalog">
          <div v-if="!singleBrand" class="field" :class="{ invalid: errors.brand_id }">
            <span class="lbl" id="lbl-brand">Brand</span>
            <div class="chips" role="radiogroup" aria-labelledby="lbl-brand">
              <label v-for="(b, i) in catalog.brands" :key="b.id">
                <input :id="i === 0 ? 'app-brand_id' : undefined" v-model="form.brand_id" type="radio" name="brand_id" :value="b.id">
                <span><i v-if="b.color" class="dot" :style="{ background: b.color }"></i>{{ b.name }}</span>
              </label>
            </div>
            <span class="err">{{ errors.brand_id }}</span>
          </div>
          <div v-if="form.brand_id" class="field" :class="{ invalid: errors.model_id }">
            <span class="lbl" id="lbl-model">{{ singleBrand ? `${singleBrand.name} model` : 'Model' }}</span>
            <div class="chips" role="radiogroup" aria-labelledby="lbl-model">
              <label v-for="(m, i) in brandModels" :key="m.id">
                <input :id="i === 0 ? 'app-model_id' : undefined" v-model="form.model_id" type="radio" name="model_id" :value="m.id"><span>{{ m.name }}</span>
              </label>
            </div>
            <span class="err">{{ errors.model_id }}</span>
          </div>
          <div v-if="model?.variants.length" class="field" :class="{ invalid: errors.variant }">
            <span class="lbl" id="lbl-variant">{{ model.name }} variant</span>
            <div class="chips" role="radiogroup" aria-labelledby="lbl-variant">
              <label v-for="(v, i) in model.variants" :key="v">
                <input :id="i === 0 ? 'app-variant' : undefined" v-model="form.variant" type="radio" name="variant" :value="v"><span>{{ v }}</span>
              </label>
            </div>
            <span class="err">{{ errors.variant }}</span>
          </div>
        </template>
        <div v-else class="field" :class="{ invalid: errors.unit }">
          <label for="app-unit">Unit applying for</label>
          <input id="app-unit" v-model="form.unit" type="text" placeholder="e.g. 2026 sedan 1.5 G CVT, white">
          <span class="err">{{ errors.unit }}</span>
        </div>
        <div class="field" :class="{ invalid: errors.first_name }">
          <label for="app-first_name">First name</label>
          <input id="app-first_name" v-model="form.first_name" type="text" autocomplete="given-name">
          <span class="err">{{ errors.first_name }}</span>
        </div>
        <div class="field">
          <label for="app-middle_name">Middle name <span class="opt">(optional)</span></label>
          <input id="app-middle_name" v-model="form.middle_name" type="text" autocomplete="additional-name">
        </div>
        <div class="field" :class="{ invalid: errors.last_name }">
          <label for="app-last_name">Last name</label>
          <input id="app-last_name" v-model="form.last_name" type="text" autocomplete="family-name">
          <span class="err">{{ errors.last_name }}</span>
        </div>
        <div class="row2">
          <div class="field" :class="{ invalid: errors.birth_date }">
            <label for="app-birth_date">Birthday</label>
            <input id="app-birth_date" :value="birthText" type="text" inputmode="numeric" autocomplete="bday" placeholder="MM / DD / YYYY" maxlength="14" @input="onBirth">
            <span class="err">{{ errors.birth_date }}</span>
          </div>
          <div class="field" :class="{ invalid: errors.birth_place }">
            <label for="app-birth_place">Birthplace</label>
            <input id="app-birth_place" v-model="form.birth_place" type="text" placeholder="City / province">
            <span class="err">{{ errors.birth_place }}</span>
          </div>
        </div>
        <div class="field" :class="{ invalid: errors.mothers_maiden_name }">
          <label for="app-mothers_maiden_name">Mother’s maiden name</label>
          <input id="app-mothers_maiden_name" v-model="form.mothers_maiden_name" type="text" placeholder="First, middle and last name before marriage">
          <span class="hint">Banks use this to verify your identity.</span>
          <span class="err">{{ errors.mothers_maiden_name }}</span>
        </div>
        <div class="field" :class="{ invalid: errors.civil_status }">
          <span class="lbl" id="lbl-civil">Civil status</span>
          <div class="chips" role="radiogroup" aria-labelledby="lbl-civil">
            <label v-for="[v, l] in civilOptions" :key="v">
              <input :id="v === 'single' ? 'app-civil_status' : undefined" v-model="form.civil_status" type="radio" name="civil_status" :value="v"><span>{{ l }}</span>
            </label>
          </div>
          <span class="err">{{ errors.civil_status }}</span>
        </div>
      </fieldset>

      <!-- Step 2: Contact & residence -->
      <fieldset v-show="step === 1">
        <legend>Contact &amp; address</legend>
        <div class="row2">
          <div class="field" :class="{ invalid: errors.mobile }">
            <label for="app-mobile">Mobile number</label>
            <input id="app-mobile" v-model="form.mobile" type="tel" inputmode="tel" autocomplete="tel" placeholder="0917 123 4567">
            <span class="err">{{ errors.mobile }}</span>
          </div>
          <div class="field">
            <label for="app-landline">Landline <span class="opt">(optional)</span></label>
            <input id="app-landline" v-model="form.landline" type="tel" inputmode="tel" placeholder="(02) 8123 4567">
          </div>
        </div>
        <div class="field" :class="{ invalid: errors.email }">
          <label for="app-email">Email address <span class="opt">(optional)</span></label>
          <input id="app-email" v-model="form.email" type="email" autocomplete="email" placeholder="you@email.com">
          <span class="err">{{ errors.email }}</span>
        </div>
        <div class="field" :class="{ invalid: errors.address }">
          <label for="app-address">Complete address</label>
          <textarea id="app-address" v-model="form.address" rows="3" autocomplete="street-address" placeholder="House no., street, barangay, city / municipality, province"></textarea>
          <span class="err">{{ errors.address }}</span>
        </div>
        <div class="field">
          <label for="app-years_at_address">Years staying at this address</label>
          <input id="app-years_at_address" v-model="form.years_at_address" type="text" inputmode="decimal" placeholder="e.g. 5" class="short">
        </div>
        <div class="field">
          <span class="lbl" id="lbl-res">This home is</span>
          <div class="chips" role="radiogroup" aria-labelledby="lbl-res">
            <label v-for="[v, l] in residenceOptions" :key="v">
              <input v-model="form.residence_type" type="radio" name="residence_type" :value="v"><span>{{ l }}</span>
            </label>
          </div>
        </div>
      </fieldset>

      <!-- Step 3: Work or business -->
      <fieldset v-show="step === 2">
        <legend>Work or business</legend>
        <div class="field">
          <span class="lbl" id="lbl-emp">Source of main income</span>
          <div class="chips" role="radiogroup" aria-labelledby="lbl-emp">
            <label v-for="[v, l] in employmentOptions" :key="v">
              <input v-model="form.employment_type" type="radio" name="employment_type" :value="v"><span>{{ l }}</span>
            </label>
          </div>
        </div>
        <div class="field" :class="{ invalid: errors.employer_name }">
          <label for="app-employer_name">{{ emp.nameLabel }}</label>
          <input id="app-employer_name" v-model="form.employer_name" type="text" autocomplete="organization">
          <span class="err">{{ errors.employer_name }}</span>
        </div>
        <div class="row2">
          <div class="field">
            <label for="app-position">Position</label>
            <input id="app-position" v-model="form.position" type="text" autocomplete="organization-title" :placeholder="form.employment_type === 'business' ? 'e.g. Owner' : ''">
          </div>
          <div class="field">
            <label for="app-years_employed">{{ emp.yearsLabel }}</label>
            <input id="app-years_employed" v-model="form.years_employed" type="text" inputmode="decimal" placeholder="e.g. 3">
          </div>
        </div>
        <div class="field" :class="{ invalid: errors.monthly_income }">
          <label for="app-monthly_income">Monthly income</label>
          <div class="money"><span aria-hidden="true">₱</span><input id="app-monthly_income" v-model="form.monthly_income" type="text" inputmode="decimal" placeholder="45,000"></div>
          <span class="hint">Gross, before deductions.</span>
          <span class="err">{{ errors.monthly_income }}</span>
        </div>
        <div class="field">
          <label for="app-employer_address">{{ emp.addressLabel }}</label>
          <textarea id="app-employer_address" v-model="form.employer_address" rows="2"></textarea>
        </div>
        <div class="field">
          <label for="app-employer_phone">{{ emp.phoneLabel }}</label>
          <input id="app-employer_phone" v-model="form.employer_phone" type="tel" inputmode="tel">
        </div>
      </fieldset>

      <!-- Step 4: Other income & bank -->
      <fieldset v-show="step === 3">
        <legend>Other income &amp; bank</legend>
        <div class="field">
          <label for="app-other_income_source">Other source of income <span class="opt">(optional)</span></label>
          <input id="app-other_income_source" v-model="form.other_income_source" type="text" placeholder="e.g. rental, remittance, side business">
        </div>
        <div v-if="form.other_income_source.trim()" class="field" :class="{ invalid: errors.other_income }">
          <label for="app-other_income">Average monthly income from it</label>
          <div class="money"><span aria-hidden="true">₱</span><input id="app-other_income" v-model="form.other_income" type="text" inputmode="decimal" placeholder="10,000"></div>
          <span class="err">{{ errors.other_income }}</span>
        </div>
        <div class="row2">
          <div class="field">
            <label for="app-bank">Bank</label>
            <input id="app-bank" v-model="form.bank" type="text" placeholder="e.g. BDO" autocomplete="off">
          </div>
          <div class="field">
            <label for="app-bank_branch">Branch</label>
            <input id="app-bank_branch" v-model="form.bank_branch" type="text">
          </div>
        </div>
        <div class="quick-banks" aria-label="Common banks">
          <button v-for="b in PH_BANKS.slice(0, 8)" :key="b" type="button" :class="{ on: form.bank === b }" @click="form.bank = b">{{ b }}</button>
        </div>
        <span class="hint">The bank where you have an account. This is not the financing bank.</span>
        <div class="hp" aria-hidden="true"><label for="app-website">Website</label><input id="app-website" v-model="form.website" tabindex="-1" autocomplete="off"></div>
        <div class="field" :class="{ invalid: errors.consent }">
          <label class="consent">
            <input id="app-consent" v-model="form.consent" type="checkbox">
            <span>I certify that the information above is true and correct. I authorize {{ dealership }} and {{ agentName }} to process it and share it with partner banks and financing companies to evaluate my car loan application, in line with the Data Privacy Act of 2012 (RA 10173).</span>
          </label>
          <span class="err">{{ errors.consent }}</span>
        </div>
      </fieldset>

      <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>

      <div class="nav">
        <button v-if="step > 0" type="button" class="btn" @click="go(step - 1)">Back</button>
        <button v-if="step < 3" type="submit" class="btn primary">Next</button>
        <button v-else type="submit" class="btn primary" :disabled="sending">{{ sending ? 'Sending…' : 'Send application' }}</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.app-form { scroll-margin-top: 16px; }
form { display: flex; flex-direction: column; gap: 16px; }
.steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.steps li { display: flex; flex-direction: column; gap: 6px; font-size: 11px; color: var(--muted); font-weight: 600; }
.steps li::before { content: ""; height: 4px; border-radius: 2px; background: var(--line); }
.steps li.on { color: var(--ink); }
.steps li.on::before { background: var(--brand); }
fieldset { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
legend { font-family: var(--display); font-size: 22px; font-weight: 600; text-transform: uppercase; padding: 0; margin-bottom: 4px; }
.field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.field > label, .field > .lbl { font-size: 13px; font-weight: 600; }
.opt { font-weight: 400; color: var(--muted); }
.hint { font-size: 12px; color: var(--muted); }
input[type=text], input[type=tel], input[type=email], textarea {
  width: 100%; font: inherit; font-size: 16px; color: var(--ink); background: var(--surface-2);
  border: 1px solid var(--line); border-radius: 10px; padding: 12px; min-width: 0;
}
input.short { max-width: 140px; }
textarea { resize: vertical; }
input:focus, textarea:focus { outline: 2px solid var(--accent); outline-offset: 0; border-color: transparent; }
.money { display: flex; align-items: center; background: var(--surface-2); border: 1px solid var(--line); border-radius: 10px; }
.money span { padding-left: 12px; color: var(--muted); font-weight: 600; }
.money input { border: 0; background: none; font-variant-numeric: tabular-nums; }
.money input:focus { outline: none; }
.money:focus-within { outline: 2px solid var(--accent); }
.err { font-size: 12px; color: var(--err); display: none; }
.field.invalid .err { display: block; }
.field.invalid input:not([type=radio]), .field.invalid textarea, .field.invalid .money { border-color: var(--err); }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chips label { position: relative; }
.chips input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
.chips span { display: inline-block; padding: 9px 13px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface-2); font-size: 14px; font-weight: 500; }
.chips input:checked + span { background: var(--brand); border-color: var(--brand); color: #fff; }
.chips .dot { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 7px; vertical-align: 0; }
.field.invalid .chips span { border-color: var(--err); }
.quick-banks { display: flex; flex-wrap: wrap; gap: 6px; margin-top: -4px; }
.quick-banks button { border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 999px; padding: 6px 11px; font-size: 13px; font-weight: 500; cursor: pointer; }
.quick-banks button.on { background: var(--brand); border-color: var(--brand); color: #fff; }
.chips input:focus-visible + span { outline: 2px solid var(--signal); outline-offset: 2px; }
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
@media (max-width: 360px) { .row2 { grid-template-columns: 1fr; } }
.consent { display: flex; gap: 10px; align-items: flex-start; font-size: 13px; color: var(--muted); font-weight: 400 !important; }
.consent input { margin-top: 3px; width: 18px; height: 18px; accent-color: var(--brand); flex: none; }
.hp { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
.nav { display: flex; gap: 10px; margin-top: 4px; }
.btn { flex: 1; padding: 14px; border-radius: 12px; font: 600 15px/1 var(--body); cursor: pointer; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); }
.btn.primary { background: var(--brand); border-color: var(--brand); color: #fff; }
.btn:disabled { opacity: .6; cursor: default; }
.form-error { font-size: 13px; color: var(--err); border: 1px solid var(--err); border-radius: 10px; padding: 10px 12px; margin: 0; }
.done { display: flex; flex-direction: column; gap: 10px; }
.done h3 { font-size: 28px; text-transform: uppercase; color: var(--ok); }
.done p { margin: 0; }
.ref { font-family: var(--mono); font-size: 13px; color: var(--muted); }
.prep { border-top: 1px solid var(--line); padding-top: 12px; margin-top: 4px; display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
.prep ul { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
</style>
