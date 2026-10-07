<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, descargar, mensajeError } from '@/services/api';
import { useContexto } from '@/stores/contexto';
import { useToast } from '@/stores/toast';
import { useListado } from '@/composables/useListado';
import { usePaginacionLocal } from '@/composables/usePaginacionLocal';
import { fecha, soles } from '@/utils/formato';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import TablaResponsiva from '@/components/TablaResponsiva.vue';
import Paginacion from '@/components/Paginacion.vue';
import CampoBusqueda from '@/components/CampoBusqueda.vue';
import BotonColumnas from '@/components/BotonColumnas.vue';
import BaseModal from '@/components/BaseModal.vue';
import Icono from '@/components/Icono.vue';

/** Libro Diario y Libro Mayor del período, con exportación a Excel. */
const route = useRoute();
const router = useRouter();
const contexto = useContexto();
const toast = useToast();

const mesActual = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date()).slice(0, 7);
const mes = ref(typeof route.query.periodo === 'string' && /^\d{6}$/.test(route.query.periodo) ? `${route.query.periodo.slice(0, 4)}-${route.query.periodo.slice(4)}` : mesActual);
const periodo = computed(() => mes.value.replace('-', ''));
const vista = computed(() => (route.query.libro === 'mayor' ? 'mayor' : 'diario'));
const irA = (v) => router.replace({ query: { ...route.query, libro: v } });
const numeroAsiento = (n) => `${periodo.value.slice(4)}-${String(n).padStart(4, '0')}`;
// Saldo: positivo deudor, negativo acreedor
const saldo = (v) => (Number(v) === 0 ? '—' : `${soles(Math.abs(v))} ${v > 0 ? 'D' : 'A'}`);

// ── Diario (paginado por asiento en el servidor) ──
const diario = useListado('/contabilidad/libros/diario', { empresaId: contexto.empresaActivaId, periodo: periodo.value });

// ── Mayor ──
const mayor = ref(null);
const buscarCuenta = ref('');
async function cargarMayor() {
  try {
    mayor.value = (await api.get('/contabilidad/libros/mayor', { params: { empresaId: contexto.empresaActivaId, periodo: periodo.value } })).data;
  } catch (e) {
    toast.error(mensajeError(e));
  }
}
const cuentasFiltradas = computed(() => {
  const q = buscarCuenta.value.trim().toLowerCase();
  return (mayor.value?.cuentas ?? []).filter((c) => !q || c.cuenta.startsWith(q) || (c.nombre ?? '').toLowerCase().includes(q));
});
const { pag: pagMayor, visibles: cuentasVisibles } = usePaginacionLocal(cuentasFiltradas, 50);
const colMayor = [
  { clave: 'cuenta', titulo: 'Cuenta' },
  { clave: 'anterior', titulo: 'Saldo anterior', clase: 'text-right', ocultarEnTarjeta: true },
  { clave: 'debe', titulo: 'Debe', clase: 'text-right' },
  { clave: 'haber', titulo: 'Haber', clase: 'text-right' },
  { clave: 'saldo', titulo: 'Saldo final', clase: 'text-right' },
];

let primera = true;
watch([() => contexto.empresaActivaId, periodo, vista], ([empresaId, p, v]) => {
  router.replace({ query: { ...route.query, periodo: p } });
  if (v === 'diario') {
    Object.assign(diario.filtros, { empresaId, periodo: p });
    if (primera) diario.cargar();
  } else cargarMayor();
  primera = false;
}, { immediate: true });

// Detalle de una cuenta: ?cuenta=<código>
const cuentaSel = computed(() => (typeof route.query.cuenta === 'string' ? route.query.cuenta : null));
const detalle = ref(null);
watch([cuentaSel, periodo], async ([c]) => {
  detalle.value = null;
  if (!c) return;
  try {
    detalle.value = (await api.get('/contabilidad/libros/mayor/cuenta', { params: { empresaId: contexto.empresaActivaId, periodo: periodo.value, cuenta: c } })).data;
  } catch (e) {
    toast.error(mensajeError(e));
  }
}, { immediate: true });
const verCuenta = (c) => router.push({ query: { ...route.query, cuenta: c } });
const cerrarCuenta = () => router.replace({ query: { ...route.query, cuenta: undefined } });

const exportando = ref(false);
async function exportar() {
  exportando.value = true;
  try {
    await descargar(`/contabilidad/libros/${vista.value}/excel`, { empresaId: contexto.empresaActivaId, periodo: periodo.value }, `libro-${vista.value}-${periodo.value}.xlsx`);
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    exportando.value = false;
  }
}
</script>

<template>
  <EncabezadoPagina titulo="Libros contables" :subtitulo="contexto.empresaActiva?.razonSocial">
    <input v-model="mes" type="month" class="input w-44" :max="mesActual" aria-label="Período" />
    <button class="btn-secundario" :disabled="exportando" @click="exportar"><Icono nombre="descargar" clase="size-4" /> {{ exportando ? 'Exportando…' : 'Exportar Excel' }}</button>
  </EncabezadoPagina>

  <div class="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
    <button
      v-for="[k, t] in [['diario', 'Libro Diario'], ['mayor', 'Libro Mayor']]"
      :key="k"
      role="tab"
      :aria-selected="vista === k"
      class="-mb-px min-h-11 border-b-2 px-3 text-sm font-medium whitespace-nowrap"
      :class="vista === k ? 'border-marca-700 text-marca-700' : 'border-transparent text-slate-500 hover:text-slate-700'"
      @click="irA(k)"
    >
      {{ t }}
    </button>
  </div>

  <!-- Libro Diario -->
  <template v-if="vista === 'diario'">
    <p v-if="!diario.cargando.value && !diario.filas.value.length" class="tarjeta p-8 text-center text-sm text-slate-500">
      No hay asientos en el período. <RouterLink :to="`/contabilidad/asientos?periodo=${periodo}`" class="font-medium text-marca-700 hover:underline">Contabilizar</RouterLink>
    </p>
    <div v-else class="tarjeta overflow-x-auto">
      <table class="min-w-full text-sm">
        <thead class="bg-slate-50 text-xs text-slate-500 uppercase">
          <tr>
            <th class="px-3 py-2 text-left font-semibold">Asiento</th>
            <th class="px-3 py-2 text-left font-semibold">Cuenta</th>
            <th class="px-3 py-2 text-left font-semibold">Denominación</th>
            <th class="px-3 py-2 text-right font-semibold">Debe</th>
            <th class="px-3 py-2 text-right font-semibold">Haber</th>
          </tr>
        </thead>
        <tbody v-for="a in diario.filas.value" :key="a.id" class="border-b border-slate-200">
          <tr class="bg-slate-50/60">
            <td class="px-3 py-1.5 font-mono text-xs font-semibold whitespace-nowrap">{{ numeroAsiento(a.numero) }}</td>
            <td class="px-3 py-1.5 text-xs text-slate-600" colspan="4">{{ fecha(a.fecha) }} · {{ a.glosa }}</td>
          </tr>
          <tr v-for="l in a.lineas" :key="l.id">
            <td />
            <td class="px-3 py-1 font-mono" :class="l.haber ? 'pl-8' : ''">
              <button class="hover:underline" @click="router.push({ query: { ...route.query, libro: 'mayor', cuenta: l.cuenta } })">{{ l.cuenta }}</button>
            </td>
            <td class="px-3 py-1 text-slate-600">{{ l.cuentaNombre }}<template v-if="l.terceroNombre"> <span class="text-xs text-slate-400">· {{ l.terceroNombre }}</span></template></td>
            <td class="px-3 py-1 text-right tabular-nums">{{ l.debe ? soles(l.debe) : '' }}</td>
            <td class="px-3 py-1 text-right tabular-nums">{{ l.haber ? soles(l.haber) : '' }}</td>
          </tr>
        </tbody>
        <tfoot v-if="diario.extra.value?.totales" class="border-t-2 border-slate-300 font-semibold">
          <tr>
            <td class="px-3 py-2" colspan="3">Totales del período</td>
            <td class="px-3 py-2 text-right tabular-nums">{{ soles(diario.extra.value.totales.debe) }}</td>
            <td class="px-3 py-2 text-right tabular-nums">{{ soles(diario.extra.value.totales.haber) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <Paginacion :pag="diario.pag" />
  </template>

  <!-- Libro Mayor -->
  <template v-else>
    <div class="mb-4 grid gap-2 sm:grid-cols-[1fr_auto]">
      <CampoBusqueda v-model="buscarCuenta" placeholder="Código o nombre de la cuenta" />
      <BotonColumnas :columnas="colMayor" />
    </div>
    <TablaResponsiva :columnas="colMayor" :filas="cuentasVisibles" :cargando="!mayor" vacio="Sin movimientos en el período">
      <template #celda-cuenta="{ fila }">
        <button class="text-left hover:underline" @click="verCuenta(fila.cuenta)"><span class="font-mono font-medium text-marca-700">{{ fila.cuenta }}</span> <span class="text-slate-700">{{ fila.nombre }}</span></button>
      </template>
      <template #celda-anterior="{ fila }"><span class="tabular-nums whitespace-nowrap">{{ saldo(fila.anterior) }}</span></template>
      <template #celda-debe="{ fila }"><span class="tabular-nums">{{ fila.debe ? soles(fila.debe) : '—' }}</span></template>
      <template #celda-haber="{ fila }"><span class="tabular-nums">{{ fila.haber ? soles(fila.haber) : '—' }}</span></template>
      <template #celda-saldo="{ fila }"><span class="font-medium tabular-nums whitespace-nowrap">{{ saldo(fila.saldo) }}</span></template>
    </TablaResponsiva>
    <Paginacion :pag="pagMayor" />
    <p v-if="mayor" class="mt-2 text-xs text-slate-500">
      D = saldo deudor, A = saldo acreedor. Las cuentas de balance (1 a 5) arrastran el saldo de períodos anteriores; las de gastos e ingresos (6 a 9), solo el del año.
      Movimientos del período: debe {{ soles(mayor.totales.debe) }} · haber {{ soles(mayor.totales.haber) }}.
    </p>
  </template>

  <!-- Mayor de una cuenta -->
  <BaseModal :abierto="!!cuentaSel" :titulo="detalle ? `Mayor de la cuenta ${detalle.cuenta.codigo} ${detalle.cuenta.nombre ?? ''}` : 'Mayor de la cuenta'" ancho="sm:max-w-4xl" @cerrar="cerrarCuenta">
    <p v-if="!detalle" class="py-8 text-center text-sm text-slate-500">Cargando…</p>
    <div v-else class="overflow-x-auto rounded-xl border border-slate-200">
      <table class="min-w-full text-sm">
        <thead class="bg-slate-50 text-xs text-slate-500 uppercase">
          <tr>
            <th class="px-3 py-2 text-left font-semibold">Fecha</th><th class="px-3 py-2 text-left font-semibold">Asiento</th><th class="px-3 py-2 text-left font-semibold">Glosa</th>
            <th class="px-3 py-2 text-right font-semibold">Debe</th><th class="px-3 py-2 text-right font-semibold">Haber</th><th class="px-3 py-2 text-right font-semibold">Saldo</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr class="bg-slate-50/60"><td class="px-3 py-1.5 text-slate-600" colspan="5">Saldo anterior</td><td class="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{{ saldo(detalle.anterior) }}</td></tr>
          <tr v-for="(m, i) in detalle.movimientos" :key="i">
            <td class="px-3 py-1.5 whitespace-nowrap">{{ fecha(m.fecha) }}</td>
            <td class="px-3 py-1.5 font-mono text-xs">
              <RouterLink :to="`/contabilidad/asientos?periodo=${periodo}&asiento=${m.asientoId}`" class="text-marca-700 hover:underline">{{ numeroAsiento(m.numero) }}</RouterLink>
            </td>
            <td class="px-3 py-1.5">{{ m.glosa }}<p v-if="m.tercero || m.documento" class="text-xs text-slate-500">{{ [m.tercero, m.documento].filter(Boolean).join(' · ') }}</p></td>
            <td class="px-3 py-1.5 text-right tabular-nums">{{ m.debe ? soles(m.debe) : '' }}</td>
            <td class="px-3 py-1.5 text-right tabular-nums">{{ m.haber ? soles(m.haber) : '' }}</td>
            <td class="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{{ saldo(m.saldo) }}</td>
          </tr>
        </tbody>
        <tfoot class="border-t-2 border-slate-200 font-semibold">
          <tr><td class="px-3 py-2" colspan="3">Totales</td><td class="px-3 py-2 text-right tabular-nums">{{ soles(detalle.totales.debe) }}</td><td class="px-3 py-2 text-right tabular-nums">{{ soles(detalle.totales.haber) }}</td><td class="px-3 py-2 text-right tabular-nums whitespace-nowrap">{{ saldo(detalle.totales.saldo) }}</td></tr>
        </tfoot>
      </table>
    </div>
    <template #pie><button class="btn-primario" @click="cerrarCuenta">Cerrar</button></template>
  </BaseModal>
</template>
