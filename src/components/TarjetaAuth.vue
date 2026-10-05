<script setup>
defineProps({ titulo: String, subtitulo: String });
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center bg-gradient-to-br from-marca-50 to-slate-100 px-4 py-10">
    <div class="w-full max-w-sm">
      <div class="mb-6 flex flex-col items-center text-center">
        <img src="/favicon.svg" alt="" class="mb-3 size-12" />
        <h1 class="text-xl font-semibold text-slate-900">{{ titulo }}</h1>
        <p v-if="subtitulo" class="mt-1 text-sm text-slate-500">{{ subtitulo }}</p>
      </div>
      <div class="tarjeta p-5 sm:p-6"><slot /></div>
      <div class="mt-4 text-center text-sm"><slot name="pie" /></div>
    </div>
  </div>
</template>
