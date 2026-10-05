<script setup>
import { useContexto } from '@/stores/contexto';
import Icono from './Icono.vue';
const contexto = useContexto();
</script>

<template>
  <!-- Varias empresas: selector. Una sola: se muestra como texto (no como campo deshabilitado). -->
  <label v-if="contexto.empresas.length > 1" class="block min-w-0">
    <span class="sr-only">Empresa activa</span>
    <select class="input font-medium" :value="contexto.empresaActivaId" @change="contexto.seleccionar($event.target.value)">
      <option v-for="e in contexto.empresas" :key="e.id" :value="e.id">{{ e.razonSocial }}</option>
    </select>
  </label>
  <p v-else-if="contexto.empresaActiva" class="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-800">
    <Icono nombre="empresa" clase="size-5 shrink-0 text-marca-700" />
    <span class="truncate">{{ contexto.empresaActiva.razonSocial }}</span>
  </p>
  <span v-else class="text-sm text-slate-500">Sin empresas asignadas</span>
</template>
