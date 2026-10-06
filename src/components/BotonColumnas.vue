<script setup>
import { useRoute } from 'vue-router';
import { useColumnasVisibles } from '@/composables/useColumnasVisibles';
import SelectorColumnas from './SelectorColumnas.vue';

/**
 * Botón "Columnas" para la barra de filtros de un módulo. Comparte el estado con la tabla
 * (misma clave: por defecto el nombre de la ruta), que oculta las columnas sola.
 * Solo en escritorio: en el celular las tablas se ven como tarjetas.
 */
const props = defineProps({
  columnas: { type: Array, required: true },
  clave: { type: String, default: null },
});
const route = useRoute();
const cols = useColumnasVisibles(() => props.clave ?? String(route.name ?? 'tabla'), () => props.columnas);
</script>

<template>
  <div class="hidden md:block">
    <SelectorColumnas :columnas="cols.todas.value" :ocultas="cols.ocultas.value" @alternar="cols.alternar" @restablecer="cols.restablecer" />
  </div>
</template>
