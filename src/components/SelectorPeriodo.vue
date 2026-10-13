<script setup>
import { useContexto } from '@/stores/contexto';
import { mesActualLima } from '@/utils/fechas';

/** Período de trabajo global (cabecera): lo usan asientos, libros, estados, PLE y declaraciones */
const contexto = useContexto();
const alCambiar = (e) => e.target.value && contexto.fijarMes(e.target.value);
</script>

<template>
  <label class="flex shrink-0 items-center gap-2 text-sm text-slate-500">
    <span class="hidden 2xl:inline">Período</span>
    <input :value="contexto.mes" type="month" class="input h-10 w-48" :max="mesActualLima()" aria-label="Período de trabajo" @change="alCambiar" />
  </label>
</template>
