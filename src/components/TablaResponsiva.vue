<script setup>
import { useRoute } from 'vue-router';
import { useColumnasVisibles } from '@/composables/useColumnasVisibles';
import BotonColumnas from './BotonColumnas.vue';

/**
 * Tabla en escritorio y tarjetas en móvil. Nunca genera scroll horizontal de la página:
 * en tablet el scroll queda contenido en el propio contenedor.
 * Slots: `celda-<clave>` ({ fila }) y `acciones` ({ fila }).
 * Las columnas que el usuario ocultó con el botón "Columnas" (BotonColumnas, en la barra de
 * filtros) no se muestran en escritorio; ambos comparten la clave (por defecto, el nombre de la ruta).
 */
const props = defineProps({
  columnas: { type: Array, required: true }, // [{ clave, titulo, clase?, ocultarEnTarjeta? }]
  filas: { type: Array, default: () => [] },
  cargando: Boolean,
  vacio: { type: String, default: 'No hay registros' },
  claveFila: { type: String, default: 'id' },
  tituloAcciones: { type: String, default: 'Acciones' },
  claveColumnas: { type: String, default: null },
  /** Muestra el botón "Columnas" sobre la tabla (para pantallas sin barra de filtros) */
  selector: Boolean,
});
const route = useRoute();
const cols = useColumnasVisibles(() => props.claveColumnas ?? String(route.name ?? 'tabla'), () => props.columnas);
const columnasTabla = () => cols.visibles.value;
const valor = (fila, clave) => clave.split('.').reduce((o, k) => o?.[k], fila);
</script>

<template>
  <div>
    <div v-if="cargando && !filas.length" class="tarjeta p-8 text-center text-sm text-slate-500">Cargando…</div>
    <div v-else-if="!filas.length" class="tarjeta p-8 text-center text-sm text-slate-500">{{ vacio }}</div>

    <template v-else>
      <!-- Móvil: tarjetas -->
      <ul class="space-y-3 md:hidden" :class="{ 'opacity-60': cargando }">
        <li v-for="fila in filas" :key="fila[claveFila]" class="tarjeta p-4">
          <div class="mb-2 font-medium text-slate-900">
            <slot :name="`celda-${columnas[0].clave}`" :fila="fila">{{ valor(fila, columnas[0].clave) }}</slot>
          </div>
          <dl class="space-y-1 text-sm">
            <div v-for="c in columnas.slice(1).filter((c) => !c.ocultarEnTarjeta)" :key="c.clave" class="flex justify-between gap-3">
              <dt class="shrink-0 text-slate-500">{{ c.titulo }}</dt>
              <dd class="min-w-0 truncate text-right text-slate-800">
                <slot :name="`celda-${c.clave}`" :fila="fila">{{ valor(fila, c.clave) ?? '—' }}</slot>
              </dd>
            </div>
          </dl>
          <div v-if="$slots.acciones" class="mt-3 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
            <slot name="acciones" :fila="fila" />
          </div>
        </li>
      </ul>

      <div v-if="selector && columnas.length > 2" class="mb-2 hidden justify-end md:flex">
        <BotonColumnas :columnas="columnas" :clave="claveColumnas" />
      </div>
      <!-- Tablet/escritorio: tabla con scroll contenido. "relative" contiene también los
           elementos absolutos (p. ej. textos sr-only), que si no ensancharían la página -->
      <div class="tarjeta relative hidden overflow-x-auto md:block" :class="{ 'opacity-60': cargando }">
        <table class="min-w-full divide-y divide-slate-200 text-sm">
          <thead class="bg-slate-50/80">
            <tr>
              <th v-for="c in columnasTabla()" :key="c.clave" class="px-4 py-3 text-left text-xs font-semibold tracking-wide whitespace-nowrap text-slate-500 uppercase" :class="c.clase">
                {{ c.titulo }}
              </th>
              <th v-if="$slots.acciones" class="px-4 py-3 text-right text-xs font-semibold tracking-wide whitespace-nowrap text-slate-500 uppercase">{{ tituloAcciones }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="fila in filas" :key="fila[claveFila]" class="transition-colors hover:bg-slate-50/70">
              <td v-for="c in columnasTabla()" :key="c.clave" class="px-4 py-3 align-middle" :class="c.clase">
                <slot :name="`celda-${c.clave}`" :fila="fila">{{ valor(fila, c.clave) ?? '—' }}</slot>
              </td>
              <td v-if="$slots.acciones" class="px-4 py-2 text-right whitespace-nowrap">
                <div class="flex justify-end gap-1"><slot name="acciones" :fila="fila" /></div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
