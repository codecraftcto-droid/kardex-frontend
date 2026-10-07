<script setup>
import { computed } from 'vue';
import { ESTADOS_SUNAT } from '@/utils/pos';

/** Estado SUNAT de un comprobante. "Rechazado" late para llamar la atención. */
const props = defineProps({ estado: { type: String, required: true }, corto: Boolean });
const e = computed(() => ESTADOS_SUNAT[props.estado] ?? ESTADOS_SUNAT.PENDIENTE);
</script>

<template>
  <span class="insignia gap-1.5 whitespace-nowrap" :class="e.clase" :title="e.texto">
    <span class="relative flex size-2" aria-hidden="true">
      <span v-if="estado === 'RECHAZADO'" class="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75 motion-reduce:hidden" />
      <span class="relative inline-flex size-2 rounded-full" :class="e.punto" />
    </span>
    {{ corto ? e.corto : e.texto }}
  </span>
</template>
