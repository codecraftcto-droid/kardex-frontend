<script setup>
/**
 * Vistas dentro de una pantalla (p. ej. Diario / Mayor). Estilo segmentado, distinto de las
 * pestañas del área (arriba, subrayadas), para que no se confundan los dos niveles.
 * opciones: [[clave, texto, insignia?]]
 */
defineProps({
  opciones: { type: Array, required: true },
  activa: { type: String, required: true },
  etiqueta: { type: String, default: 'Vistas' },
});
const emit = defineEmits(['cambiar']);
</script>

<template>
  <div class="mb-4 max-w-full overflow-x-auto">
    <div class="inline-flex gap-1 rounded-xl bg-slate-100 p-1" role="tablist" :aria-label="etiqueta">
      <button
        v-for="[clave, texto, insignia] in opciones"
        :key="clave"
        type="button"
        role="tab"
        :aria-selected="activa === clave"
        class="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition"
        :class="activa === clave ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'"
        @click="emit('cambiar', clave)"
      >
        {{ texto }}
        <span v-if="insignia" class="insignia bg-amber-50 text-amber-800">{{ insignia }}</span>
      </button>
    </div>
  </div>
</template>
