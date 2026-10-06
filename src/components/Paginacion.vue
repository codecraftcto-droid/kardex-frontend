<script setup>
import { computed } from 'vue';
import Icono from './Icono.vue';

/**
 * Paginación de cualquier listado. Recibe el objeto reactivo `pag`
 * ({ pagina, porPagina, total, paginas }) y lo modifica; el listado recarga al cambiar
 * `pagina` o `porPagina`. Se muestra siempre que haya registros.
 */
const props = defineProps({
  pag: { type: Object, required: true },
  opciones: { type: Array, default: () => [10, 20, 50, 100] },
});
const paginas = computed(() => Math.max(1, props.pag.paginas || Math.ceil((props.pag.total || 0) / (props.pag.porPagina || 1))));
const desde = computed(() => (props.pag.total ? (props.pag.pagina - 1) * props.pag.porPagina + 1 : 0));
const hasta = computed(() => Math.min(props.pag.total, props.pag.pagina * props.pag.porPagina));
const ir = (n) => (props.pag.pagina = Math.min(Math.max(1, n), paginas.value));
function cambiarTamano(e) {
  props.pag.porPagina = Number(e.target.value);
  props.pag.pagina = 1;
}
/** 1 … 4 5 [6] 7 8 … 20 */
const botones = computed(() => {
  const n = paginas.value;
  const p = props.pag.pagina;
  if (n <= 7) return Array.from({ length: n }, (_, i) => i + 1);
  const centro = [p - 1, p, p + 1].filter((x) => x > 1 && x < n);
  const lista = [1];
  if (centro[0] > 2) lista.push('…');
  lista.push(...centro);
  if (centro.at(-1) < n - 1) lista.push('…');
  lista.push(n);
  return lista;
});
const opcionesTamano = computed(() => [...new Set([...props.opciones, props.pag.porPagina])].sort((a, b) => a - b));
</script>

<template>
  <nav v-if="pag.total > 0" class="mt-4 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between" aria-label="Paginación">
    <div class="flex items-center justify-between gap-3 text-slate-500 sm:justify-start">
      <span>
        Mostrando <strong class="font-medium text-slate-700 tabular-nums">{{ desde }}–{{ hasta }}</strong>
        de <strong class="font-medium text-slate-700 tabular-nums">{{ pag.total.toLocaleString('es-PE') }}</strong>
      </span>
      <label class="flex items-center gap-2">
        <span class="hidden sm:inline">Filas</span>
        <select class="input h-9 min-h-9 w-auto py-0 pr-8 text-sm" :value="pag.porPagina" aria-label="Filas por página" @change="cambiarTamano">
          <option v-for="o in opcionesTamano" :key="o" :value="o">{{ o }}</option>
        </select>
      </label>
    </div>

    <div class="flex items-center justify-between gap-1 sm:justify-end">
      <button class="pag-btn" :disabled="pag.pagina <= 1" aria-label="Página anterior" @click="ir(pag.pagina - 1)">
        <Icono nombre="atras" clase="size-4" /><span class="sm:hidden">Anterior</span>
      </button>
      <!-- Escritorio: números -->
      <span class="hidden items-center gap-1 sm:flex">
        <template v-for="(b, i) in botones" :key="`${b}-${i}`">
          <span v-if="b === '…'" class="w-8 text-center text-slate-400" aria-hidden="true">…</span>
          <button
            v-else
            class="pag-btn min-w-9"
            :class="{ activo: b === pag.pagina }"
            :aria-current="b === pag.pagina ? 'page' : undefined"
            :aria-label="`Página ${b}`"
            @click="ir(b)"
          >{{ b }}</button>
        </template>
      </span>
      <!-- Móvil: compacto -->
      <span class="px-2 text-slate-500 tabular-nums sm:hidden">{{ pag.pagina }} / {{ paginas }}</span>
      <button class="pag-btn" :disabled="pag.pagina >= paginas" aria-label="Página siguiente" @click="ir(pag.pagina + 1)">
        <span class="sm:hidden">Siguiente</span><Icono nombre="atras" clase="size-4 rotate-180" />
      </button>
    </div>
  </nav>
</template>

<style scoped>
@reference "../assets/main.css";
.pag-btn {
  @apply inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-700 tabular-nums transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca-600;
}
.pag-btn.activo { @apply border-marca-700 bg-marca-700 text-white hover:bg-marca-700; }
</style>
