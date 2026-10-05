<script setup lang="ts">
// Birthday typed as MM / DD / YYYY (faster on a phone than scrolling a calendar back decades).
// v-model is the date as YYYY-MM-DD, or '' while incomplete or impossible (e.g. 02 / 30);
// v-model:filled tells whether anything was typed, so the form can say "enter" vs "check the date".
import { ref } from 'vue';

const props = defineProps<{ id: string }>();
const iso = defineModel<string>({ required: true });
const filled = defineModel<boolean>('filled', { default: false });

const toText = (v: string) => (v ? `${v.slice(5, 7)} / ${v.slice(8, 10)} / ${v.slice(0, 4)}` : '');
const text = ref(toText(iso.value));
filled.value = Boolean(text.value);

function onInput(e: Event) {
  const input = e.target as HTMLInputElement;
  const d = input.value.replace(/\D/g, '').slice(0, 8);
  text.value = [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join(' / ');
  input.value = text.value;
  filled.value = Boolean(text.value);
  const [mm, dd, yyyy] = [Number(d.slice(0, 2)), Number(d.slice(2, 4)), Number(d.slice(4, 8))];
  const date = new Date(yyyy, mm - 1, dd);
  const real = d.length === 8 && yyyy > 1900 && date.getMonth() === mm - 1 && date.getDate() === dd;
  iso.value = real ? `${d.slice(4, 8)}-${d.slice(0, 2)}-${d.slice(2, 4)}` : '';
}
</script>

<template>
  <input :id="props.id" :value="text" type="text" inputmode="numeric" autocomplete="bday" placeholder="MM / DD / YYYY" maxlength="14" @input="onInput">
</template>
