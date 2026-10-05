<script setup>
import Icono from './Icono.vue';
const modelo = defineModel({ type: String, default: '' });
defineProps({ placeholder: { type: String, default: 'Buscar…' } });
</script>

<template>
  <label class="relative block">
    <span class="sr-only">{{ placeholder }}</span>
    <Icono nombre="buscar" clase="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
    <input v-model="modelo" type="search" class="input pl-9" :placeholder="placeholder" />
  </label>
</template>
