<script setup>
/**
 * Tabla en escritorio y tarjetas en móvil. Nunca genera scroll horizontal de la página:
 * en tablet el scroll queda contenido en el propio contenedor.
 * Slots: `celda-<clave>` ({ fila }) y `acciones` ({ fila }).
 */
defineProps({
  columnas: { type: Array, required: true }, // [{ clave, titulo, clase?, ocultarEnTarjeta? }]
  filas: { type: Array, default: () => [] },
  cargando: Boolean,
  vacio: { type: String, default: 'No hay registros' },
  claveFila: { type: String, default: 'id' },
});
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

      <!-- Tablet/escritorio: tabla con scroll contenido. "relative" contiene también los
           elementos absolutos (p. ej. textos sr-only), que si no ensancharían la página -->
      <div class="tarjeta relative hidden overflow-x-auto md:block" :class="{ 'opacity-60': cargando }">
        <table class="min-w-full divide-y divide-slate-200 text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th v-for="c in columnas" :key="c.clave" class="px-4 py-3 text-left font-medium whitespace-nowrap text-slate-600" :class="c.clase">
                {{ c.titulo }}
              </th>
              <th v-if="$slots.acciones" class="px-4 py-3"><span class="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="fila in filas" :key="fila[claveFila]" class="hover:bg-slate-50">
              <td v-for="c in columnas" :key="c.clave" class="px-4 py-3 align-middle" :class="c.clase">
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
