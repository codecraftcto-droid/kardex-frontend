<script setup>
import { computed } from 'vue';
import { cant, fecha, num, soles } from '@/utils/formato';
import { MOTIVOS, columnasKardex } from '@/utils/kardex';
import { useColumnasVisibles } from '@/composables/useColumnasVisibles';

/**
 * Kardex de un producto en formato clásico (entradas / salidas / saldo), en tabla para
 * escritorio y tarjetas en móvil. Lo usan la página "Kardex por producto" y el modal del inventario.
 */
const props = defineProps({
  datos: { type: Object, required: true },
  costos: Boolean,
  cargando: Boolean,
  /** El saldo inicial solo se muestra en la primera página */
  primeraPagina: { type: Boolean, default: true },
});
// Columnas ocultas con el botón "Columnas" de la pantalla (estado compartido, clave 'kardex')
const cols = useColumnasVisibles('kardex', () => columnasKardex(props.costos));
const ver = (clave) => !cols.ocultas.value.includes(clave);
const cu = computed(() => props.costos && ver('cunit'));
const tot = computed(() => props.costos && ver('total'));
const ancho = computed(() => 1 + (cu.value ? 1 : 0) + (tot.value ? 1 : 0));
const entrada = (l) => l.movimiento.tipo === 'ENTRADA';
const doc = (m) => (m.documentoNumero ? `${m.documentoSerie ?? ''}-${m.documentoNumero}` : '');
</script>

<template>
  <div>
    <!-- Móvil: tarjetas por movimiento -->
    <ul class="space-y-3 md:hidden" :class="{ 'opacity-60': cargando }">
      <li v-for="l in datos.datos" :key="l.id" class="tarjeta p-4">
        <div class="flex items-center justify-between">
          <RouterLink :to="`/movimientos/${l.movimiento.id}`" class="font-mono font-medium text-marca-700">{{ l.movimiento.numero }}</RouterLink>
          <span class="text-xs text-slate-500">{{ fecha(l.movimiento.fecha) }}</span>
        </div>
        <p class="text-sm text-slate-600">{{ MOTIVOS[l.movimiento.motivo] }} <span class="text-slate-400">{{ doc(l.movimiento) }}</span></p>
        <div class="mt-2 grid grid-cols-2 gap-2 text-sm">
          <div class="rounded-lg p-2" :class="entrada(l) ? 'bg-emerald-50' : 'bg-orange-50'">
            <p class="text-xs text-slate-500">{{ entrada(l) ? 'Entrada' : 'Salida' }}</p>
            <p class="font-semibold tabular-nums">{{ entrada(l) ? '+' : '−' }}{{ cant(l.cantidad) }}</p>
            <p v-if="costos" class="text-xs tabular-nums">{{ soles(l.costoTotal) }}</p>
          </div>
          <div class="rounded-lg bg-slate-50 p-2">
            <p class="text-xs text-slate-500">Saldo</p>
            <p class="font-semibold tabular-nums">{{ cant(l.saldoCantidad) }}</p>
            <p v-if="costos" class="text-xs tabular-nums">{{ soles(l.saldoValor) }}</p>
          </div>
        </div>
      </li>
    </ul>

    <!-- Tablet/escritorio: formato clásico de kardex -->
    <div class="tarjeta relative hidden overflow-x-auto md:block" :class="{ 'opacity-60': cargando }">
      <table class="min-w-full text-sm tabular-nums">
        <thead class="bg-slate-50 text-slate-600">
          <tr class="border-b border-slate-200">
            <th rowspan="2" class="px-3 py-2 text-left font-medium">Fecha</th>
            <th rowspan="2" class="px-3 py-2 text-left font-medium">
              Movimiento
            </th>
            <th :colspan="ancho" class="border-l border-slate-200 bg-emerald-50/60 px-3 py-2 text-center font-medium">Entradas</th>
            <th :colspan="ancho" class="border-l border-slate-200 bg-orange-50/60 px-3 py-2 text-center font-medium">Salidas</th>
            <th :colspan="ancho" class="border-l border-slate-200 px-3 py-2 text-center font-medium">Saldo</th>
          </tr>
          <tr class="border-b border-slate-200 text-xs">
            <template v-for="g in 3" :key="g">
              <th class="border-l border-slate-200 px-3 py-1 text-right font-medium">Cant.</th>
              <th v-if="cu" class="px-3 py-1 text-right font-medium">C. unit.</th>
              <th v-if="tot" class="px-3 py-1 text-right font-medium">Total</th>
            </template>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-if="datos.saldoInicial && primeraPagina" class="bg-slate-50/60 text-slate-500">
            <td colspan="2" class="px-3 py-2 italic">Saldo inicial</td>
            <td :colspan="ancho * 2" class="border-l border-slate-200" />
            <td class="border-l border-slate-200 px-3 py-2 text-right">{{ cant(datos.saldoInicial.cantidad) }}</td>
            <td v-if="cu" class="px-3 py-2 text-right">{{ num(datos.saldoInicial.saldoCostoUnitario, 4) }}</td>
            <td v-if="tot" class="px-3 py-2 text-right">{{ num(datos.saldoInicial.saldoValor) }}</td>
          </tr>
          <tr v-for="l in datos.datos" :key="l.id" class="hover:bg-slate-50">
            <td class="px-3 py-2 whitespace-nowrap">{{ fecha(l.movimiento.fecha) }}</td>
            <td class="px-3 py-2 whitespace-nowrap">
              <RouterLink :to="`/movimientos/${l.movimiento.id}`" class="font-mono text-marca-700 hover:underline">{{ l.movimiento.numero }}</RouterLink>
              <span v-if="ver('detalle')" class="ml-1 text-xs text-slate-500">{{ MOTIVOS[l.movimiento.motivo] }} {{ doc(l.movimiento) }}</span>
            </td>
            <template v-for="lado in ['ENTRADA', 'SALIDA']" :key="lado">
              <template v-if="l.movimiento.tipo === lado">
                <td class="border-l border-slate-200 px-3 py-2 text-right">{{ cant(l.cantidad) }}</td>
                <td v-if="cu" class="px-3 py-2 text-right">{{ num(l.costoUnitario, 4) }}</td>
                <td v-if="tot" class="px-3 py-2 text-right">{{ num(l.costoTotal) }}</td>
              </template>
              <td v-else :colspan="ancho" class="border-l border-slate-200" />
            </template>
            <td class="border-l border-slate-200 px-3 py-2 text-right font-medium">{{ cant(l.saldoCantidad) }}</td>
            <td v-if="cu" class="px-3 py-2 text-right">{{ num(l.saldoCostoUnitario, 4) }}</td>
            <td v-if="tot" class="px-3 py-2 text-right font-medium">{{ num(l.saldoValor) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
