<script setup>
import { computed } from 'vue';
import { estadoStock } from '@/utils/kardex';

/**
 * Estado del stock con punto de color. Solo "Bajo mínimo" late (animación), porque es lo que
 * pide atención: si todo latiera, nada destacaría. Respeta "reducir movimiento" del sistema.
 */
const props = defineProps({ fila: { type: Object, required: true } });
const PUNTO = { 'Bajo mínimo': 'bg-red-500', 'Sobre máximo': 'bg-amber-500', 'Sin stock': 'bg-slate-400', Normal: 'bg-emerald-500' };
const e = computed(() => estadoStock(props.fila));
const alerta = computed(() => e.value.texto === 'Bajo mínimo');
</script>

<template>
  <span class="insignia gap-1.5 whitespace-nowrap" :class="e.clase">
    <span class="relative flex size-2" aria-hidden="true">
      <span v-if="alerta" class="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75 motion-reduce:hidden" />
      <span class="relative inline-flex size-2 rounded-full" :class="PUNTO[e.texto]" />
    </span>
    {{ e.texto }}
  </span>
</template>
