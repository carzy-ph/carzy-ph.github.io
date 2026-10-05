<script setup lang="ts">
// One co-maker's details: the same as the applicant's, plus how they're related.
// The parent calls validate() before moving on; field ids are prefixed per co-maker.
import { computed, nextTick, reactive, ref } from 'vue';
import type { CivilStatus, CoMakerInput, EmploymentType, Relationship, ResidenceType } from '@/types';
import { CIVIL_STATUS, EMPLOYMENT, PH_BANKS, RELATIONSHIP, RESIDENCE } from '@/lib/constants';
import { age, isPhMobile } from '@/lib/format';
import BirthdayInput from './BirthdayInput.vue';

const props = defineProps<{ index: number }>();
const c = defineModel<CoMakerInput>({ required: true });

const pre = `cm${props.index}-`;
const errors = reactive<Partial<Record<keyof CoMakerInput, string>>>({});
const birthFilled = ref(Boolean(c.value.birth_date));
const emp = computed(() => EMPLOYMENT[c.value.employment_type]);
const relationships = Object.entries(RELATIONSHIP) as [Relationship, string][];
const civil = Object.entries(CIVIL_STATUS) as [CivilStatus, string][];
const residence = Object.entries(RESIDENCE) as [ResidenceType, string][];
const employment = Object.entries(EMPLOYMENT).map(([k, v]) => [k, v.label]) as [EmploymentType, string][];
const money = (s: string) => /^\d[\d,]*(\.\d{1,2})?$/.test(s.replace(/[₱\s]/g, ''));

function validate(): boolean {
  for (const k of Object.keys(errors) as (keyof CoMakerInput)[]) delete errors[k];
  const need = (k: keyof CoMakerInput, msg: string) => { if (!String(c.value[k]).trim()) errors[k] = msg; };
  need('relationship', 'Choose how they’re related to you.');
  need('first_name', 'Enter their first name.');
  need('last_name', 'Enter their last name.');
  if (!birthFilled.value) errors.birth_date = 'Enter their birthday as MM / DD / YYYY.';
  else if (!c.value.birth_date) errors.birth_date = 'Check the date: use MM / DD / YYYY.';
  else if (age(c.value.birth_date) < 18) errors.birth_date = 'Co-makers must be at least 18.';
  need('birth_place', 'Enter their birthplace.');
  need('mothers_maiden_name', 'Enter their mother’s maiden name.');
  need('civil_status', 'Choose their civil status.');
  if (!isPhMobile(c.value.mobile)) errors.mobile = 'Use a PH mobile number, for example 0917 123 4567.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.value.email.trim())) errors.email = 'Enter a valid email address.';
  need('address', 'Enter their complete address.');
  need('employer_name', `Enter the ${emp.value.nameLabel.toLowerCase()}.`);
  if (!money(c.value.monthly_income)) errors.monthly_income = 'Enter their monthly income in pesos.';
  if (c.value.other_income && !money(c.value.other_income)) errors.other_income = 'Enter an amount in pesos, or leave it blank.';
  const first = Object.keys(errors)[0];
  if (first) nextTick(() => document.getElementById(pre + first)?.focus());
  return !first;
}
defineExpose({ validate });
</script>

<template>
  <div class="co-maker">
    <div class="field" :class="{ invalid: errors.relationship }">
      <span :id="`${pre}lbl-rel`" class="lbl">Relationship to you</span>
      <div class="chips" role="radiogroup" :aria-labelledby="`${pre}lbl-rel`">
        <label v-for="([v, l], i) in relationships" :key="v">
          <input :id="i === 0 ? `${pre}relationship` : undefined" v-model="c.relationship" type="radio" :name="`${pre}relationship`" :value="v"><span>{{ l }}</span>
        </label>
      </div>
      <span class="err">{{ errors.relationship }}</span>
    </div>

    <h4>Personal</h4>
    <div class="field" :class="{ invalid: errors.first_name }">
      <label :for="`${pre}first_name`">First name</label>
      <input :id="`${pre}first_name`" v-model="c.first_name" type="text" autocomplete="off">
      <span class="err">{{ errors.first_name }}</span>
    </div>
    <div class="field">
      <label :for="`${pre}middle_name`">Middle name <span class="opt">(optional)</span></label>
      <input :id="`${pre}middle_name`" v-model="c.middle_name" type="text" autocomplete="off">
    </div>
    <div class="field" :class="{ invalid: errors.last_name }">
      <label :for="`${pre}last_name`">Last name</label>
      <input :id="`${pre}last_name`" v-model="c.last_name" type="text" autocomplete="off">
      <span class="err">{{ errors.last_name }}</span>
    </div>
    <div class="row2">
      <div class="field" :class="{ invalid: errors.birth_date }">
        <label :for="`${pre}birth_date`">Birthday</label>
        <BirthdayInput :id="`${pre}birth_date`" v-model="c.birth_date" v-model:filled="birthFilled" autocomplete="off" />
        <span class="err">{{ errors.birth_date }}</span>
      </div>
      <div class="field" :class="{ invalid: errors.birth_place }">
        <label :for="`${pre}birth_place`">Birthplace</label>
        <input :id="`${pre}birth_place`" v-model="c.birth_place" type="text" placeholder="City / province">
        <span class="err">{{ errors.birth_place }}</span>
      </div>
    </div>
    <div class="field" :class="{ invalid: errors.mothers_maiden_name }">
      <label :for="`${pre}mothers_maiden_name`">Mother’s maiden name</label>
      <input :id="`${pre}mothers_maiden_name`" v-model="c.mothers_maiden_name" type="text">
      <span class="err">{{ errors.mothers_maiden_name }}</span>
    </div>
    <div class="field" :class="{ invalid: errors.civil_status }">
      <span :id="`${pre}lbl-civil`" class="lbl">Civil status</span>
      <div class="chips" role="radiogroup" :aria-labelledby="`${pre}lbl-civil`">
        <label v-for="([v, l], i) in civil" :key="v">
          <input :id="i === 0 ? `${pre}civil_status` : undefined" v-model="c.civil_status" type="radio" :name="`${pre}civil`" :value="v"><span>{{ l }}</span>
        </label>
      </div>
      <span class="err">{{ errors.civil_status }}</span>
    </div>

    <h4>Contact &amp; address</h4>
    <div class="row2">
      <div class="field" :class="{ invalid: errors.mobile }">
        <label :for="`${pre}mobile`">Mobile number</label>
        <input :id="`${pre}mobile`" v-model="c.mobile" type="tel" inputmode="tel" placeholder="0917 123 4567" autocomplete="off">
        <span class="err">{{ errors.mobile }}</span>
      </div>
      <div class="field">
        <label :for="`${pre}landline`">Landline <span class="opt">(optional)</span></label>
        <input :id="`${pre}landline`" v-model="c.landline" type="tel" inputmode="tel">
      </div>
    </div>
    <div class="field" :class="{ invalid: errors.email }">
      <label :for="`${pre}email`">Email address</label>
      <input :id="`${pre}email`" v-model="c.email" type="email" autocomplete="off">
      <span class="err">{{ errors.email }}</span>
    </div>
    <div class="field" :class="{ invalid: errors.address }">
      <label :for="`${pre}address`">Complete address</label>
      <textarea :id="`${pre}address`" v-model="c.address" rows="3" placeholder="House no., street, barangay, city / municipality, province"></textarea>
      <span class="err">{{ errors.address }}</span>
    </div>
    <div class="field">
      <label :for="`${pre}years_at_address`">Years staying at this address</label>
      <input :id="`${pre}years_at_address`" v-model="c.years_at_address" type="text" inputmode="decimal" class="short">
    </div>
    <div class="field">
      <span :id="`${pre}lbl-res`" class="lbl">This home is</span>
      <div class="chips" role="radiogroup" :aria-labelledby="`${pre}lbl-res`">
        <label v-for="[v, l] in residence" :key="v"><input v-model="c.residence_type" type="radio" :name="`${pre}res`" :value="v"><span>{{ l }}</span></label>
      </div>
    </div>

    <h4>Work or business</h4>
    <div class="field">
      <span :id="`${pre}lbl-emp`" class="lbl">Source of main income</span>
      <div class="chips" role="radiogroup" :aria-labelledby="`${pre}lbl-emp`">
        <label v-for="[v, l] in employment" :key="v"><input v-model="c.employment_type" type="radio" :name="`${pre}emp`" :value="v"><span>{{ l }}</span></label>
      </div>
    </div>
    <div class="field" :class="{ invalid: errors.employer_name }">
      <label :for="`${pre}employer_name`">{{ emp.nameLabel }}</label>
      <input :id="`${pre}employer_name`" v-model="c.employer_name" type="text">
      <span class="err">{{ errors.employer_name }}</span>
    </div>
    <div class="row2">
      <div class="field">
        <label :for="`${pre}position`">Position</label>
        <input :id="`${pre}position`" v-model="c.position" type="text">
      </div>
      <div class="field">
        <label :for="`${pre}years_employed`">{{ emp.yearsLabel }}</label>
        <input :id="`${pre}years_employed`" v-model="c.years_employed" type="text" inputmode="decimal">
      </div>
    </div>
    <div class="field" :class="{ invalid: errors.monthly_income }">
      <label :for="`${pre}monthly_income`">Monthly income</label>
      <div class="money"><span aria-hidden="true">₱</span><input :id="`${pre}monthly_income`" v-model="c.monthly_income" type="text" inputmode="decimal" placeholder="45,000"></div>
      <span class="err">{{ errors.monthly_income }}</span>
    </div>
    <div class="field">
      <label :for="`${pre}employer_address`">{{ emp.addressLabel }}</label>
      <textarea :id="`${pre}employer_address`" v-model="c.employer_address" rows="2"></textarea>
    </div>
    <div class="field">
      <label :for="`${pre}employer_phone`">{{ emp.phoneLabel }}</label>
      <input :id="`${pre}employer_phone`" v-model="c.employer_phone" type="tel" inputmode="tel">
    </div>

    <h4>Other income &amp; bank</h4>
    <div class="field">
      <label :for="`${pre}other_income_source`">Other source of income <span class="opt">(optional)</span></label>
      <input :id="`${pre}other_income_source`" v-model="c.other_income_source" type="text">
    </div>
    <div v-if="c.other_income_source.trim()" class="field" :class="{ invalid: errors.other_income }">
      <label :for="`${pre}other_income`">Average monthly income from it</label>
      <div class="money"><span aria-hidden="true">₱</span><input :id="`${pre}other_income`" v-model="c.other_income" type="text" inputmode="decimal"></div>
      <span class="err">{{ errors.other_income }}</span>
    </div>
    <div class="row2">
      <div class="field">
        <label :for="`${pre}bank`">Bank</label>
        <input :id="`${pre}bank`" v-model="c.bank" type="text" placeholder="e.g. BDO" autocomplete="off">
      </div>
      <div class="field">
        <label :for="`${pre}bank_branch`">Branch</label>
        <input :id="`${pre}bank_branch`" v-model="c.bank_branch" type="text">
      </div>
    </div>
    <div class="quick-banks" aria-label="Common banks">
      <button v-for="b in PH_BANKS.slice(0, 8)" :key="b" type="button" :class="{ on: c.bank === b }" @click="c.bank = b">{{ b }}</button>
    </div>
  </div>
</template>
