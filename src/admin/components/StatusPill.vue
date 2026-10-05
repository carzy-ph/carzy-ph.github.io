<script setup lang="ts">
defineProps<{ label: string; cssVar: string }>();
</script>

<template>
  <span class="pill" :style="{ '--c': `var(${cssVar})` }">{{ label }}</span>
</template>
