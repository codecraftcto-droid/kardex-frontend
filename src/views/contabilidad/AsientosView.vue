<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, mensajeError } from '@/services/api';
import { useContexto } from '@/stores/contexto';
import { useToast } from '@/stores/toast';
import { useListado } from '@/composables/useListado';
import { fecha, soles } from '@/utils/formato';
import { confirmar, pedirTexto } from '@/utils/dialogos';
import ModalAsientoManual from '@/components/ModalAsientoManual.vue';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import TablaResponsiva from '@/components/TablaResponsiva.vue';
import Paginacion from '@/components/Paginacion.vue';
import CampoBusqueda from '@/components/CampoBusqueda.vue';
import BotonColumnas from '@/components/BotonColumnas.vue';
import MenuAcciones from '@/components/MenuAcciones.vue';
import BaseModal from '@/components/BaseModal.vue';
import Icono from '@/components/Icono.vue';

/**
 * Asientos contables del período: se contabiliza con un clic (solo lo que falta) y se revisa cada
 * asiento con sus cuentas, el tercero y el documento. Lo que no se pudo contabilizar muestra el motivo.
 */
const route = useRoute();
const router = useRouter();
const contexto = useContexto();
const toast = useToast();

const ORIGENES = {
  VENTA: { texto: 'Venta', clase: 'bg-emerald-50 text-emerald-700' },
  COBRO: { texto: 'Cobro', clase: 'bg-sky-50 text-sky-700' },
  NOTA_CREDITO: { texto: 'Nota de crédito', clase: 'bg-amber-50 text-amber-800' },
  REEMBOLSO: { texto: 'Reembolso', clase: 'bg-amber-50 text-amber-800' },
  COBRANZA: { texto: 'Cobranza', clase: 'bg-sky-50 text-sky-700' },
  COMPRA: { texto: 'Compra', clase: 'bg-indigo-50 text-indigo-700' },
  VENTA_COMERCIAL: { texto: 'Venta registrada', clase: 'bg-emerald-50 text-emerald-700' },
  COSTO_VENTA: { texto: 'Costo de venta', clase: 'bg-violet-50 text-violet-700' },
  MANUAL: { texto: 'Manual', clase: 'bg-slate-100 text-slate-700' },
};

const mesActual = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date()).slice(0, 7);
const mes = ref(typeof route.query.periodo === 'string' && /^\d{6}$/.test(route.query.periodo) ? `${route.query.periodo.slice(0, 4)}-${route.query.periodo.slice(4)}` : mesActual);
const periodo = computed(() => mes.value.replace('-', ''));

const resumen = ref(null);
const ocupado = ref(false);
async function cargarResumen() {
  if (!contexto.empresaActivaId || !mes.value) return;
  try {
    resumen.value = (await api.get('/contabilidad/asientos/resumen', { params: { empresaId: contexto.empresaActivaId, periodo: periodo.value } })).data;
  } catch (e) {
    resumen.value = null;
    toast.error(mensajeError(e));
  }
}
const lista = useListado('/contabilidad/asientos', { empresaId: contexto.empresaActivaId, periodo: periodo.value, origen: '' });
let primeraCarga = true;
watch([() => contexto.empresaActivaId, periodo], ([empresaId, p]) => {
  Object.assign(lista.filtros, { empresaId, periodo: p });
  // Después, el listado se recarga solo al cambiar sus filtros
  if (primeraCarga) lista.cargar();
  primeraCarga = false;
  router.replace({ query: { ...route.query, periodo: p } });
  cargarResumen();
}, { immediate: true });
const recargar = () => {
  cargarResumen();
  lista.cargar();
};

async function contabilizar(regenerar = false) {
  if (regenerar && !(await confirmar({
    titulo: `¿Regenerar los asientos de ${resumen.value.etiqueta}?`,
    texto: 'Se borran los asientos automáticos del período y se vuelven a generar con la configuración de cuentas actual. Úselo si cambió las cuentas por operación.',
    confirmar: 'Regenerar', peligro: true,
  }))) return;
  ocupado.value = true;
  try {
    const { data } = await api.post(`/contabilidad/asientos/${regenerar ? 'regenerar' : 'generar'}`, { empresaId: contexto.empresaActivaId, periodo: periodo.value });
    const msg = `${data.creados} asiento(s) generado(s)${data.errores.length ? `; ${data.errores.length} operación(es) con observaciones` : ''}`;
    (data.errores.length ? toast.aviso : toast.exito)(msg);
    recargar();
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    ocupado.value = false;
  }
}
// ── Cierre del período ──
async function cerrarPeriodo() {
  if (!(await confirmar({
    titulo: `¿Cerrar ${resumen.value.etiqueta}?`,
    texto: 'Cerrado, no se podrán contabilizar, registrar, editar ni eliminar asientos del período hasta reabrirlo.',
    confirmar: 'Cerrar período',
  }))) return;
  try {
    await api.post('/contabilidad/periodos/cerrar', { empresaId: contexto.empresaActivaId, periodo: periodo.value });
    toast.exito(`${resumen.value.etiqueta} cerrado`);
    recargar();
  } catch (e) {
    toast.error(mensajeError(e));
  }
}
async function reabrirPeriodo() {
  const motivo = await pedirTexto({ titulo: `Reabrir ${resumen.value.etiqueta}`, texto: 'Quedará registrado en la auditoría.', etiqueta: 'Motivo', confirmar: 'Reabrir', minimo: 5 });
  if (!motivo) return;
  try {
    await api.post('/contabilidad/periodos/reabrir', { empresaId: contexto.empresaActivaId, periodo: periodo.value, motivo });
    toast.exito(`${resumen.value.etiqueta} reabierto`);
    recargar();
  } catch (e) {
    toast.error(mensajeError(e));
  }
}
const accionesPeriodo = computed(() => [
  resumen.value?.acciones.generar && { texto: 'Regenerar el período…', icono: 'sincronizar', alHacer: () => contabilizar(true) },
  resumen.value?.acciones.cerrar && { texto: 'Cerrar el período…', icono: 'candado', alHacer: cerrarPeriodo },
  resumen.value?.acciones.reabrir && { texto: 'Reabrir el período…', icono: 'candado', peligro: true, alHacer: reabrirPeriodo },
].filter(Boolean));

// ── Asiento manual: nuevo o edición ──
const manual = reactive({ abierto: false, asiento: null });
const nuevoManual = () => Object.assign(manual, { abierto: true, asiento: null });
const editarManual = () => Object.assign(manual, { abierto: true, asiento: detalle.value });
function manualGuardado(a) {
  manual.abierto = false;
  recargar();
  router.replace({ query: { ...route.query, asiento: a.id } });
}
async function eliminarManual() {
  if (!(await confirmar({ titulo: '¿Eliminar este asiento manual?', texto: detalle.value.glosa, confirmar: 'Eliminar asiento', peligro: true }))) return;
  try {
    await api.delete(`/contabilidad/asientos/manual/${detalle.value.id}`, { params: { empresaId: contexto.empresaActivaId } });
    toast.exito('Asiento eliminado');
    cerrar();
    recargar();
  } catch (e) {
    toast.error(mensajeError(e));
  }
}
// Fecha sugerida para un asiento nuevo: hoy si es el mes elegido, si no el último día de ese mes
const fechaSugerida = computed(() => {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
  if (hoy.startsWith(mes.value)) return hoy;
  const [a, m] = mes.value.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
});
const cuadra = computed(() => resumen.value && Number(resumen.value.totalDebe).toFixed(2) === Number(resumen.value.totalHaber).toFixed(2));

const columnas = [
  { clave: 'numero', titulo: 'N.º' },
  { clave: 'fecha', titulo: 'Fecha' },
  { clave: 'glosa', titulo: 'Glosa' },
  { clave: 'origen', titulo: 'Origen', ocultarEnTarjeta: true },
  { clave: 'totalDebe', titulo: 'Importe', clase: 'text-right' },
];
const numeroAsiento = (a) => `${periodo.value.slice(4)}-${String(a.numero).padStart(4, '0')}`;

// ── Detalle en modal: ?asiento=<id> ──
const asientoId = computed(() => (typeof route.query.asiento === 'string' ? route.query.asiento : null));
const detalle = ref(null);
watch(asientoId, async (id) => {
  detalle.value = null;
  if (!id) return;
  try {
    detalle.value = (await api.get(`/contabilidad/asientos/${id}`, { params: { empresaId: contexto.empresaActivaId } })).data;
  } catch (e) {
    toast.error(mensajeError(e));
    cerrar();
  }
}, { immediate: true });
const ver = (id) => router.push({ query: { ...route.query, asiento: id } });
const cerrar = () => router.replace({ query: { ...route.query, asiento: undefined } });
</script>

<template>
  <EncabezadoPagina titulo="Asientos contables" :subtitulo="contexto.empresaActiva?.razonSocial">
    <input v-model="mes" type="month" class="input w-44" :max="mesActual" aria-label="Período" />
    <button v-if="resumen?.acciones.registrar" class="btn-secundario" @click="nuevoManual"><Icono nombre="agregar" clase="size-4" /> Asiento manual</button>
    <button v-if="resumen?.acciones.generar && !resumen.sinPlan" class="btn-primario" :disabled="ocupado" @click="contabilizar()">
      <Icono nombre="check" clase="size-4" /> {{ ocupado ? 'Contabilizando…' : 'Contabilizar período' }}
    </button>
    <MenuAcciones v-if="accionesPeriodo.length && !resumen?.sinPlan" :acciones="accionesPeriodo" etiqueta="Más acciones del período" />
  </EncabezadoPagina>

  <template v-if="resumen">
    <p v-if="resumen.cerrado" class="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
      <Icono nombre="candado" clase="size-4" /> Período cerrado el {{ fecha(resumen.cerradoEn) }}: no admite cambios.
      <button v-if="resumen.acciones.reabrir" class="font-medium underline" @click="reabrirPeriodo">Reabrir</button>
    </p>
    <p v-if="resumen.sinPlan" class="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">
      <Icono nombre="alerta" clase="size-4" /> La empresa aún no tiene plan contable.
      <RouterLink to="/contabilidad/plan" class="font-medium underline">Cargar el plan</RouterLink>
    </p>

    <!-- Indicadores -->
    <section class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumen de la contabilización">
      <div class="tarjeta p-4">
        <p class="text-xs text-slate-500 sm:text-sm">Asientos de {{ resumen.etiqueta }}</p>
        <p class="mt-2 text-xl font-semibold tabular-nums sm:text-2xl">{{ resumen.asientos }}</p>
        <p class="mt-0.5 text-xs text-slate-500">{{ Object.keys(resumen.porOrigen).length }} tipos de operación</p>
      </div>
      <div class="tarjeta p-4">
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs text-slate-500 sm:text-sm">Debe = Haber</p>
          <span class="flex size-8 items-center justify-center rounded-lg" :class="cuadra ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'"><Icono :nombre="cuadra ? 'check' : 'alerta'" clase="size-5" /></span>
        </div>
        <p class="mt-2 text-xl font-semibold tabular-nums sm:text-2xl">{{ soles(resumen.totalDebe) }}</p>
        <p class="mt-0.5 text-xs text-slate-500">{{ cuadra ? 'El período cuadra' : `Haber: ${soles(resumen.totalHaber)}` }}</p>
      </div>
      <div class="tarjeta p-4">
        <p class="text-xs text-slate-500 sm:text-sm">Por contabilizar</p>
        <p class="mt-2 text-xl font-semibold tabular-nums sm:text-2xl" :class="resumen.pendientes.length ? 'text-amber-700' : ''">{{ resumen.pendientes.length }}</p>
        <p class="mt-0.5 text-xs text-slate-500">{{ resumen.pendientes.length ? 'operaciones sin asiento' : 'todo contabilizado' }}</p>
      </div>
      <div class="tarjeta p-4">
        <p class="text-xs text-slate-500 sm:text-sm">Con observaciones</p>
        <p class="mt-2 text-xl font-semibold tabular-nums sm:text-2xl" :class="resumen.errores.length ? 'text-red-700' : ''">{{ resumen.errores.length }}</p>
        <p class="mt-0.5 text-xs text-slate-500">{{ resumen.errores.length ? 'no se pueden contabilizar' : 'sin problemas' }}</p>
      </div>
    </section>

    <!-- Observaciones y pendientes -->
    <details v-if="resumen.errores.length" class="tarjeta mb-3 border-red-200 bg-red-50/40 p-4" open>
      <summary class="cursor-pointer text-sm font-medium text-red-800">{{ resumen.errores.length }} operación(es) no se pueden contabilizar</summary>
      <ul class="mt-2 divide-y divide-red-100 text-sm">
        <li v-for="e in resumen.errores" :key="e.clave" class="py-2">
          <span class="text-slate-700">{{ e.fecha ? fecha(e.fecha) : '' }} · {{ e.glosa ?? e.clave }}</span>
          <p class="text-red-700">{{ e.error }}</p>
        </li>
      </ul>
      <RouterLink to="/contabilidad/plan?vista=operaciones" class="mt-2 inline-block text-sm font-medium text-marca-700 hover:underline">Revisar las cuentas por operación</RouterLink>
    </details>
    <details v-if="resumen.pendientes.length" class="tarjeta mb-4 p-4">
      <summary class="cursor-pointer text-sm font-medium text-amber-800">{{ resumen.pendientes.length }} operación(es) por contabilizar · ver lista</summary>
      <ul class="mt-2 max-h-64 divide-y divide-slate-100 overflow-y-auto text-sm">
        <li v-for="p in resumen.pendientes" :key="p.clave" class="flex items-center gap-2 py-1.5">
          <span class="insignia shrink-0" :class="ORIGENES[p.origen].clase">{{ ORIGENES[p.origen].texto }}</span>
          <span class="truncate text-slate-700">{{ fecha(p.fecha) }} · {{ p.glosa }}</span>
        </li>
      </ul>
    </details>
  </template>

  <!-- Libro de asientos -->
  <div class="mb-4 grid gap-2 sm:grid-cols-[1fr_14rem_auto]">
    <CampoBusqueda v-model="lista.filtros.q" placeholder="Glosa, número de asiento o cuenta" />
    <select v-model="lista.filtros.origen" class="input" aria-label="Origen">
      <option value="">Todo origen</option>
      <option v-for="(o, k) in ORIGENES" :key="k" :value="k">{{ o.texto }}</option>
    </select>
    <BotonColumnas :columnas="columnas" />
  </div>
  <TablaResponsiva :columnas="columnas" :filas="lista.filas.value" :cargando="lista.cargando.value" vacio="No hay asientos en el período: contabilícelo para generarlos">
    <template #celda-numero="{ fila }">
      <button class="font-mono font-medium text-marca-700 hover:underline" @click="ver(fila.id)">{{ numeroAsiento(fila) }}</button>
    </template>
    <template #celda-fecha="{ fila }"><span class="whitespace-nowrap">{{ fecha(fila.fecha) }}</span></template>
    <template #celda-glosa="{ fila }">
      <span class="text-sm">{{ fila.glosa }}</span>
      <span v-if="fila.extornoDeId" class="insignia ml-1 bg-red-50 text-red-700">Extorno</span>
    </template>
    <template #celda-origen="{ fila }"><span class="insignia" :class="ORIGENES[fila.origen].clase">{{ ORIGENES[fila.origen].texto }}</span></template>
    <template #celda-totalDebe="{ fila }"><span class="tabular-nums">{{ soles(fila.totalDebe) }}</span></template>
    <template #acciones="{ fila }"><MenuAcciones :acciones="[{ texto: 'Ver asiento', icono: 'comprobante', alHacer: () => ver(fila.id) }]" :etiqueta="`Acciones del asiento ${numeroAsiento(fila)}`" /></template>
  </TablaResponsiva>
  <Paginacion :pag="lista.pag" />

  <!-- Detalle del asiento -->
  <BaseModal :abierto="!!asientoId" :titulo="detalle ? `Asiento ${detalle.periodo.slice(4)}-${String(detalle.numero).padStart(4, '0')}` : 'Asiento'" ancho="sm:max-w-4xl" @cerrar="cerrar">
    <p v-if="!detalle" class="py-8 text-center text-sm text-slate-500">Cargando…</p>
    <div v-else class="space-y-4">
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <span class="insignia" :class="ORIGENES[detalle.origen].clase">{{ ORIGENES[detalle.origen].texto }}</span>
        <span v-if="detalle.extornoDe" class="insignia bg-red-50 text-red-700">Extorno del asiento {{ detalle.extornoDe.periodo.slice(4) }}-{{ String(detalle.extornoDe.numero).padStart(4, '0') }}</span>
        <span v-for="x in detalle.extornos" :key="x.id" class="insignia bg-slate-100 text-slate-600">Extornado por {{ x.periodo.slice(4) }}-{{ String(x.numero).padStart(4, '0') }}</span>
        <span class="text-slate-500">{{ fecha(detalle.fecha) }}</span>
      </div>
      <p class="font-medium">{{ detalle.glosa }}</p>
      <div class="overflow-x-auto rounded-xl border border-slate-200">
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr><th class="px-3 py-2 text-left font-semibold">Cuenta</th><th class="px-3 py-2 text-left font-semibold">Detalle</th><th class="px-3 py-2 text-right font-semibold">Debe</th><th class="px-3 py-2 text-right font-semibold">Haber</th></tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="l in detalle.lineas" :key="l.id">
              <td class="px-3 py-2" :class="Number(l.haber) ? 'pl-8' : ''"><span class="font-mono">{{ l.cuenta }}</span> <span class="text-slate-600">{{ l.cuentaNombre }}</span></td>
              <td class="px-3 py-2 text-xs text-slate-500">
                <template v-if="l.terceroNombre">{{ l.terceroNombre }}<template v-if="l.terceroDoc"> ({{ l.terceroDoc }})</template></template>
                <template v-if="l.docSerie"> · {{ l.docSerie }}-{{ l.docNumero }}</template>
                <template v-if="l.glosa">{{ l.terceroNombre || l.docSerie ? ' · ' : '' }}{{ l.glosa }}</template>
              </td>
              <td class="px-3 py-2 text-right tabular-nums">{{ Number(l.debe) ? soles(l.debe) : '' }}</td>
              <td class="px-3 py-2 text-right tabular-nums">{{ Number(l.haber) ? soles(l.haber) : '' }}</td>
            </tr>
          </tbody>
          <tfoot class="border-t-2 border-slate-200 font-semibold">
            <tr><td class="px-3 py-2" colspan="2">Total</td><td class="px-3 py-2 text-right tabular-nums">{{ soles(detalle.totalDebe) }}</td><td class="px-3 py-2 text-right tabular-nums">{{ soles(detalle.totalHaber) }}</td></tr>
          </tfoot>
        </table>
      </div>
    </div>
    <template #pie>
      <RouterLink v-if="detalle?.enlace" :to="detalle.enlace.ruta" target="_blank" class="btn-secundario mr-auto">{{ detalle.enlace.texto }}</RouterLink>
      <template v-if="detalle?.editable">
        <button class="btn-secundario mr-auto text-red-600 hover:bg-red-50" @click="eliminarManual"><Icono nombre="eliminar" clase="size-4" /> Eliminar</button>
        <button class="btn-secundario" @click="editarManual"><Icono nombre="editar" clase="size-4" /> Editar</button>
      </template>
      <button class="btn-primario" @click="cerrar">Cerrar</button>
    </template>
  </BaseModal>

  <ModalAsientoManual
    :abierto="manual.abierto"
    :empresa-id="contexto.empresaActivaId"
    :asiento="manual.asiento"
    :fecha-inicial="fechaSugerida"
    @cerrar="manual.abierto = false"
    @guardado="manualGuardado"
  />
</template>
