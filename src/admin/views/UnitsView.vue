<script setup lang="ts">
// Units catalog: Brand -> Model -> Variant. Changes save immediately and show on cards right away.
// Turning a brand or model off hides it from the card form; past applications keep their unit name.
import { computed, ref, watch } from 'vue';
import type { Brand, UnitModel } from '@/types';
import { supabase } from '@/lib/supabase';
import { confirmDialog } from '@/lib/confirm';
import { THEMES } from '@/lib/constants';
import { isTooLight } from '@/lib/catalog';
import { toast } from '@/lib/toast';
import { friendly, store } from '../store';

const selectedId = ref<string | null>(store.brands[0]?.id ?? null);
const newBrand = ref('');
const newModel = ref('');
const newVariant = ref<Record<string, string>>({});

const brand = computed(() => store.brands.find(b => b.id === selectedId.value) ?? null);
const models = computed(() => store.models.filter(m => m.brand_id === selectedId.value).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)));
const agentsOn = (brandId: string) => store.agents.filter(a => a.brand_id === brandId).length;
const modelCount = (brandId: string) => store.models.filter(m => m.brand_id === brandId).length;
watch(() => store.brands.length, () => { if (!brand.value) selectedId.value = store.brands[0]?.id ?? null; });

const nextSort = (list: { sort: number }[]) => list.reduce((m, x) => Math.max(m, x.sort), -1) + 1;

async function addBrand() {
  const name = newBrand.value.trim();
  if (!name) return;
  const { data, error } = await supabase.from('brands').insert({ name, sort: nextSort(store.brands) }).select().single<Brand>();
  if (error) return toast(error.code === '23505' ? `${name} is already in the list.` : friendly(error));
  store.brands.push(data);
  selectedId.value = data.id;
  newBrand.value = '';
  toast(`${name} added. Now add its models.`);
}

async function updateBrand(b: Brand, patch: Partial<Brand>, msg: string) {
  if (patch.name !== undefined && !patch.name.trim()) return toast('Brand name can’t be empty.');
  const { error } = await supabase.from('brands').update(patch).eq('id', b.id);
  if (error) return toast(error.code === '23505' ? 'Another brand already has that name.' : friendly(error));
  Object.assign(b, patch);
  toast(msg);
}

async function deleteBrand(b: Brand) {
  const n = agentsOn(b.id);
  const models = modelCount(b.id);
  const ok = await confirmDialog({
    title: `Delete ${b.name}?`,
    message: (models ? `Its ${models} ${models === 1 ? 'model' : 'models'} will be deleted too. ` : '') +
      (n ? `${n} assigned ${n === 1 ? 'agent goes' : 'agents go'} back to all brands. ` : '') +
      'Past applications keep their unit name. To only hide it from cards, turn off “Shown on cards” instead.',
    confirmLabel: 'Delete brand',
    danger: true
  });
  if (!ok) return;
  const { error } = await supabase.from('brands').delete().eq('id', b.id);
  if (error) return toast(friendly(error));
  store.brands = store.brands.filter(x => x.id !== b.id);
  store.models = store.models.filter(m => m.brand_id !== b.id);
  store.agents.forEach(a => { if (a.brand_id === b.id) a.brand_id = null; });
  selectedId.value = store.brands[0]?.id ?? null;
  toast(`${b.name} deleted.`);
}

async function addModel() {
  const name = newModel.value.trim();
  if (!name || !brand.value) return;
  const { data, error } = await supabase.from('models')
    .insert({ brand_id: brand.value.id, name, sort: nextSort(models.value) }).select().single<UnitModel>();
  if (error) return toast(error.code === '23505' ? `${name} is already under ${brand.value.name}.` : friendly(error));
  store.models.push(data);
  newModel.value = '';
  toast(`${name} added. Add its variants, or leave them empty if clients don’t need to choose one.`);
}

async function updateModel(m: UnitModel, patch: Partial<UnitModel>, msg?: string) {
  if (patch.name !== undefined && !patch.name.trim()) return toast('Model name can’t be empty.');
  const { error } = await supabase.from('models').update(patch).eq('id', m.id);
  if (error) return toast(error.code === '23505' ? 'Another model of this brand already has that name.' : friendly(error));
  Object.assign(m, patch);
  if (msg) toast(msg);
}

async function deleteModel(m: UnitModel) {
  const ok = await confirmDialog({
    title: `Delete ${m.name}?`,
    message: 'Past applications keep their unit name. To only hide it from cards, turn it off instead.',
    confirmLabel: 'Delete model',
    danger: true
  });
  if (!ok) return;
  const { error } = await supabase.from('models').delete().eq('id', m.id);
  if (error) return toast(friendly(error));
  store.models = store.models.filter(x => x.id !== m.id);
  toast(`${m.name} deleted.`);
}

async function moveModel(i: number, by: number) {
  const list = models.value.map((m, k) => ({ m, sort: k }));
  const a = list[i]!, b = list[i + by]!;
  await Promise.all([updateModel(a.m, { sort: b.sort }), updateModel(b.m, { sort: a.sort })]);
  // Normalize the rest so every model has a distinct position.
  await Promise.all(list.filter(x => x !== a && x !== b && x.m.sort !== x.sort).map(x => updateModel(x.m, { sort: x.sort })));
}

function addVariant(m: UnitModel) {
  const v = (newVariant.value[m.id] || '').trim();
  if (!v) return;
  if (m.variants.includes(v)) return toast(`${v} is already listed.`);
  newVariant.value[m.id] = '';
  updateModel(m, { variants: [...m.variants, v] }, `${v} added to ${m.name}.`);
}
const removeVariant = (m: UnitModel, v: string) => updateModel(m, { variants: m.variants.filter(x => x !== v) }, `${v} removed.`);
function setColor(b: Brand, color: string | null) {
  if (color === b.color) return;
  if (color && isTooLight(color)) toast('That color is light, so the white name on cards may be hard to read. A darker shade works better.');
  updateBrand(b, { color }, color ? `${b.name} cards now use this color.` : `${b.name} agents pick their own card color again.`);
}
const renameOnChange = (e: Event) => (e.target as HTMLInputElement).value;
</script>

<template>
  <section class="page">
    <div class="page-head">
      <div><span class="eyebrow">Catalog</span><h1>Units</h1></div>
    </div>
    <p class="hint" style="margin:0">Clients pick from these on the card’s loan application: brand, then model, then variant. Agents assigned to a brand only offer that brand’s units.</p>

    <form class="add-row" @submit.prevent="addBrand">
      <input id="new-brand" v-model="newBrand" class="inp" placeholder="New brand, e.g. Toyota" aria-label="New brand name">
      <button class="btn primary" type="submit" :disabled="!newBrand.trim()">Add brand</button>
    </form>

    <div v-if="store.brands.length" class="filters" role="tablist" aria-label="Brands">
      <button v-for="b in store.brands" :key="b.id" class="fchip" :class="{ on: b.id === selectedId, off: !b.active }" role="tab" :aria-selected="b.id === selectedId" @click="selectedId = b.id">
        {{ b.name }} <b>{{ modelCount(b.id) }}</b>
      </button>
    </div>
    <div v-else class="list"><p class="empty">No brands yet. Until you add units, the card form asks clients to type the unit they want.</p></div>

    <template v-if="brand">
      <section class="block">
        <div class="grid2">
          <div class="field">
            <label for="brand-name">Brand name</label>
            <input id="brand-name" class="inp" :value="brand.name" @change="updateBrand(brand, { name: renameOnChange($event).trim() }, 'Brand renamed.')">
          </div>
          <div class="toggle" style="align-self:end">
            <span class="t"><b>Shown on cards</b><span class="hint">{{ agentsOn(brand.id) }} agent(s) assigned</span></span>
            <span class="switch"><input id="brand-active" type="checkbox" :checked="brand.active" aria-label="Shown on cards"
              @change="updateBrand(brand, { active: ($event.target as HTMLInputElement).checked }, ($event.target as HTMLInputElement).checked ? `${brand.name} is shown on cards.` : `${brand.name} is hidden from cards.`)"><span></span></span>
          </div>
        </div>
        <div class="field">
          <span class="lbl">Card color</span>
          <div class="swatches">
            <button class="sw none" :class="{ on: !brand.color }" title="No brand color" aria-label="No brand color: agents pick their own" @click="setColor(brand, null)">Own</button>
            <button v-for="t in THEMES" :key="t.color" class="sw" :class="{ on: brand.color === t.color }" :style="{ background: t.color }" :title="t.name" :aria-label="t.name" @click="setColor(brand, t.color)"></button>
            <label class="sw custom" :class="{ on: brand.color && !THEMES.some(t => t.color === brand!.color) }" :style="brand.color ? { background: brand.color } : undefined" title="Exact brand color">
              <input type="color" :value="brand.color || '#0F4C5C'" aria-label="Exact brand color" @change="setColor(brand, ($event.target as HTMLInputElement).value.toUpperCase())">
              <span>+</span>
            </label>
          </div>
          <span class="hint">Every agent assigned to {{ brand.name }} gets this color on their card. Choose <b>Own</b> to let each agent pick. Use <b>+</b> for the brand’s exact color.</span>
        </div>
        <button class="btn small danger" @click="deleteBrand(brand)">Delete brand</button>
      </section>

      <section v-for="(m, i) in models" :key="m.id" class="block model" :class="{ off: !m.active }">
        <div class="model-head">
          <input :id="`model-${m.id}`" class="inp model-name" :value="m.name" aria-label="Model name" @change="updateModel(m, { name: renameOnChange($event).trim() }, 'Model renamed.')">
          <span class="switch"><input :id="`model-active-${m.id}`" type="checkbox" :checked="m.active" :aria-label="`Show ${m.name} on cards`"
            @change="updateModel(m, { active: ($event.target as HTMLInputElement).checked }, ($event.target as HTMLInputElement).checked ? `${m.name} is shown on cards.` : `${m.name} is hidden from cards.`)"><span></span></span>
        </div>
        <div class="variants">
          <span v-for="v in m.variants" :key="v" class="vchip">{{ v }}<button :aria-label="`Remove ${v}`" @click="removeVariant(m, v)">✕</button></span>
          <span v-if="!m.variants.length" class="hint">No variants: clients only choose the model.</span>
        </div>
        <form class="add-row" @submit.prevent="addVariant(m)">
          <input :id="`variant-${m.id}`" v-model="newVariant[m.id]" class="inp" placeholder="Add variant, e.g. 1.5 G CVT" aria-label="New variant">
          <button class="btn" type="submit">Add</button>
        </form>
        <div class="model-actions">
          <button class="btn icon" :disabled="i === 0" aria-label="Move up" @click="moveModel(i, -1)">↑</button>
          <button class="btn icon" :disabled="i === models.length - 1" aria-label="Move down" @click="moveModel(i, 1)">↓</button>
          <button class="btn small danger" @click="deleteModel(m)">Delete model</button>
        </div>
      </section>

      <form class="block add-row" @submit.prevent="addModel">
        <input id="new-model" v-model="newModel" class="inp" :placeholder="`New ${brand.name} model, e.g. Vios`" aria-label="New model name">
        <button class="btn primary" type="submit" :disabled="!newModel.trim()">Add model</button>
      </form>
    </template>
  </section>
</template>

<style scoped>
.add-row { display: flex; gap: 8px; }
.add-row .inp { flex: 1; min-width: 0; }
.block.add-row { flex-direction: row; }
.fchip.off { opacity: .55; }
.model.off { opacity: .7; }
.model-head { display: flex; gap: 12px; align-items: center; }
.model-name { font-family: var(--display); font-size: 20px; font-weight: 600; text-transform: uppercase; }
.variants { display: flex; flex-wrap: wrap; gap: 6px; }
.vchip { display: inline-flex; align-items: center; gap: 4px; padding: 5px 6px 5px 11px; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--line); font-size: 13px; font-weight: 500; }
.vchip button { border: 0; background: none; cursor: pointer; color: var(--muted); padding: 0 4px; font-size: 11px; }
.model-actions { display: flex; gap: 6px; justify-content: flex-end; }
.sw.none { background: var(--surface-2); color: var(--muted); font-size: 11px; font-weight: 700; display: grid; place-items: center; }
.sw.none.on::after { content: none; }
.sw.custom { position: relative; display: grid; place-items: center; background: var(--surface-2); color: var(--muted); font-size: 20px; cursor: pointer; overflow: hidden; }
.sw.custom.on span { display: none; }
.sw.custom input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
.danger { color: var(--err); border-color: color-mix(in srgb, var(--err) 40%, var(--line)); }
</style>
