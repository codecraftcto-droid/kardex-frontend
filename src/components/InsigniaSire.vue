<script setup>
import { computed } from 'vue';
import { ESTADOS_SIRE } from '@/utils/sire';

/** Avance de un registro SIRE. "Con diferencias" late para llamar la atención. */
const props = defineProps({ estado: { type: String, required: true } });
const e = computed(() => ESTADOS_SIRE[props.estado] ?? ESTADOS_SIRE.PENDIENTE);
</script>

<template>
  <span class="insignia gap-1.5 whitespace-nowrap" :class="e.clase">
    <span class="relative flex size-2" aria-hidden="true">
      <span v-if="estado === 'CON_DIFERENCIAS'" class="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-75 motion-reduce:hidden" />
      <span class="relative inline-flex size-2 rounded-full" :class="e.punto" />
    </span>
    {{ e.texto }}
  </span>
</template>
