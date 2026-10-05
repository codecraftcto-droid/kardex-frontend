<script setup>
defineProps({ titulo: String, subtitulo: String });
</script>

<template>
  <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div class="min-w-0">
      <slot name="antes" />
      <h1 class="truncate text-xl font-semibold text-slate-900 sm:text-2xl">{{ titulo }}</h1>
      <p v-if="subtitulo" class="mt-0.5 text-sm text-slate-500">{{ subtitulo }}</p>
    </div>
    <div v-if="$slots.default" class="flex flex-wrap gap-2"><slot /></div>
  </div>
</template>
