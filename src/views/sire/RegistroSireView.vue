<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, mensajeError } from '@/services/api';
import { useContexto } from '@/stores/contexto';
import { useToast } from '@/stores/toast';
import { useListado } from '@/composables/useListado';
import { useTiempoReal } from '@/composables/useTiempoReal';
import { fecha, fechaHora, soles } from '@/utils/formato';
import { REGISTROS_SIRE, RESOLUCIONES, TIPOS_DIFERENCIA } from '@/utils/sire';
import { confirmar, pedirTexto } from '@/utils/dialogos';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import TablaResponsiva from '@/components/TablaResponsiva.vue';
import Paginacion from '@/components/Paginacion.vue';
import CampoBusqueda from '@/components/CampoBusqueda.vue';
import BotonColumnas from '@/components/BotonColumnas.vue';
import MenuAcciones from '@/components/MenuAcciones.vue';
import InsigniaSire from '@/components/InsigniaSire.vue';
import Icono from '@/components/Icono.vue';

/**
 * Conciliación de un registro SIRE de un período: propuesta de SUNAT frente a lo registrado
 * en el sistema, resolución de cada diferencia y generación del registro.
 */
const route = useRoute();
const router = useRouter();
const contexto = useContexto();
const toast = useToast();
const registro = route.params.registro;
const periodo = route.params.periodo;
const base = `/sire/registros/${registro}/${periodo}`;

const r = ref(null);
const ocupado = ref(false);
async function cargarResumen() {
  try {
    r.value = (await api.get(base, { params: { empresaId: contexto.empresaActivaId } })).data;
  } catch (e) {
    toast.error(mensajeError(e));
    if (e.response?.status === 404 || e.response?.status === 400) router.replace('/sire');
  }
}

// Mientras SUNAT procesa (ticket), se consulta cada 4 segundos
const procesando = computed(() => r.value?.operacion?.estado === 'PROCESANDO');
let sondeo = null;
watch(procesando, (v, antes) => {
  clearInterval(sondeo);
  if (v) sondeo = setInterval(cargarResumen, 4000);
  else if (antes) recargarTodo();
});
onBeforeUnmount(() => clearInterval(sondeo));
useTiempoReal('sire:operacion', (x) => x.periodo === periodo && x.registro === registro && cargarResumen());

// ── Pestañas ──
const vista = computed(() => (['diferencias', 'sunat', 'sistema'].includes(route.query.vista) ? route.query.vista : 'diferencias'));
const irA = (v) => router.replace({ query: { ...route.query, vista: v } });

const empresaId = () => contexto.empresaActivaId;
const dif = useListado(`${base}/diferencias`, { empresaId: empresaId(), tipo: '', resolucion: '' });
const sunat = useListado(`${base}/comprobantes`, { empresaId: empresaId(), origen: 'sunat' });
const sistema = useListado(`${base}/comprobantes`, { empresaId: empresaId(), origen: 'sistema' });
const listados = { diferencias: dif, sunat, sistema };
watch(vista, (v) => listados[v].cargar(), { immediate: true });
function recargarTodo() {
  cargarResumen();
  listados[vista.value].cargar();
}
cargarResumen();

// ── Acciones del período ──
async function descargar() {
  ocupado.value = true;
  try {
    const { data } = await api.post(`${base}/propuesta`, { empresaId: contexto.empresaActivaId });
    if (data.estado === 'TERMINADO') toast.exito('Propuesta descargada y conciliada');
    else if (data.estado === 'PROCESANDO') toast.info('SUNAT está preparando la propuesta; se actualizará sola');
    else toast.error('No se pudo descargar la propuesta');
    recargarTodo();
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    ocupado.value = false;
  }
}
async function generar() {
  const ok = await confirmar({
    titulo: `¿Generar el ${REGISTROS_SIRE[registro].nombre.toLowerCase()} de ${r.value.etiqueta}?`,
    texto: 'Se acepta la propuesta de SUNAT tal como está y SUNAT genera el registro. Después ya no se puede modificar desde aquí.',
    confirmar: 'Generar registro',
  });
  if (!ok) return;
  ocupado.value = true;
  try {
    const { data } = await api.post(`${base}/generar`, { empresaId: contexto.empresaActivaId });
    if (data.estado === 'TERMINADO') toast.exito('Registro generado en SUNAT');
    else if (data.estado === 'PROCESANDO') toast.info('SUNAT está generando el registro; se actualizará solo');
    else toast.error('SUNAT no generó el registro');
    recargarTodo();
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    ocupado.value = false;
  }
}

// ── Resolver diferencias ──
async function resolver(d, resolucion) {
  let nota = null;
  if (resolucion === 'JUSTIFICADA') {
    nota = await pedirTexto({
      titulo: `Justificar ${d.serie}-${d.numero}`,
      texto: d.tipo === 'SOLO_SISTEMA' ? 'La propuesta se acepta tal cual: este comprobante NO figurará en el registro.' : 'Explique por qué se deja así.',
      etiqueta: 'Justificación', confirmar: 'Justificar', minimo: 5,
    });
    if (!nota) return;
  }
  if (resolucion === 'EXCLUIDA') {
    nota = await pedirTexto({
      titulo: `Excluir ${d.serie}-${d.numero} del registro`,
      texto: 'Solo si la compra no corresponde a la empresa (no se recibió, no es gasto del negocio, emitida por error…). Quedará anotado el motivo.',
      etiqueta: 'Motivo', confirmar: 'Excluir', minimo: 5,
    });
    if (!nota) return;
  }
  try {
    const { data } = await api.post(`${base}/diferencias/${d.id}/resolver`, { empresaId: contexto.empresaActivaId, resolucion, nota });
    toast.exito(data.pendientes ? `Quedan ${data.pendientes} por resolver` : 'Todo conciliado: ya puede generar el registro');
    recargarTodo();
  } catch (e) {
    toast.error(mensajeError(e));
  }
}
/** Texto e ícono de cada resolución posible (el backend dice cuáles aplican a cada diferencia) */
const OPCIONES = {
  ACEPTADA: { texto: 'Aceptar lo de SUNAT', icono: 'check' },
  INCLUIDA: { texto: 'Incluir en el registro', icono: 'agregar' },
  EXCLUIDA: { texto: 'Excluir del registro…', icono: 'eliminar' },
  JUSTIFICADA: { texto: 'Justificar…', icono: 'editar' },
};
const accionesDif = (d) => [
  d.comprobanteId && { texto: 'Ver comprobante', icono: 'comprobante', to: `/comprobantes/${d.comprobanteId}`, nuevaPestana: true },
  d.documentoId && { texto: esRce ? 'Ver compra' : 'Ver venta registrada', icono: 'comprobante', to: `/${esRce ? 'compras' : 'ventas'}/${d.documentoId}`, nuevaPestana: true },
  ...(r.value?.acciones.resolver && d.resolucion === 'PENDIENTE'
    ? (d.resoluciones ?? []).map((k) => ({ ...OPCIONES[k], alHacer: () => resolver(d, k) }))
    : []),
  r.value?.acciones.resolver && d.resolucion !== 'PENDIENTE' && { texto: 'Volver a pendiente', icono: 'atras', alHacer: () => resolver(d, 'PENDIENTE') },
];

// Ventas o compras: cambian los textos y el lado del tercero
const esRce = registro === 'RCE';
const TXT = esRce
  ? { tercero: 'Proveedor', sistema: 'Compras del sistema', tarjeta: 'Compras en el sistema', vacio: 'No hay compras registradas en el período' }
  : { tercero: 'Cliente', sistema: 'Ventas del sistema', tarjeta: 'Ventas en el sistema', vacio: 'No hay ventas registradas en el período' };

const colDif = [
  { clave: 'comprobante', titulo: 'Comprobante' },
  { clave: 'nombre', titulo: TXT.tercero },
  { clave: 'tipo', titulo: 'Diferencia' },
  { clave: 'totalSunat', titulo: 'SUNAT', clase: 'text-right' },
  { clave: 'totalSistema', titulo: 'Sistema', clase: 'text-right' },
  { clave: 'resolucion', titulo: 'Resolución' },
];
const colCp = [
  { clave: 'fechaEmision', titulo: 'Emisión' },
  { clave: 'comprobante', titulo: 'Comprobante' },
  { clave: 'nombre', titulo: TXT.tercero },
  { clave: 'baseGravada', titulo: 'Base gravada', clase: 'text-right', ocultarEnTarjeta: true },
  { clave: 'igv', titulo: 'IGV', clase: 'text-right', ocultarEnTarjeta: true },
  { clave: 'total', titulo: 'Total', clase: 'text-right' },
];
const columnas = computed(() => (vista.value === 'diferencias' ? colDif : colCp));
const diferenciaTotales = computed(() => (r.value?.propuesta ? Number(r.value.propuesta.total) - Number(r.value.sistema.total) : null));
const signo = (x) => (x.tipoCp === '07' ? '−' : '');
</script>

<template>
  <EncabezadoPagina :titulo="`${registro} · ${r?.etiqueta ?? periodo}`" :subtitulo="`${REGISTROS_SIRE[registro]?.nombre ?? ''}${r ? ` · ${r.empresa.razonSocial} · RUC ${r.empresa.ruc}` : ''}`">
    <template #antes>
      <RouterLink to="/sire" class="mb-1 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"><Icono nombre="atras" clase="size-4" /> Períodos SIRE</RouterLink>
      <InsigniaSire v-if="r" class="mb-1 ml-2" :estado="r.estado" />
    </template>
    <button v-if="r?.acciones.descargar" class="btn-secundario" :disabled="ocupado" @click="descargar">
      <Icono nombre="descargar" clase="size-4" /> {{ r.propuesta ? 'Volver a descargar propuesta' : 'Descargar propuesta de SUNAT' }}
    </button>
    <button v-if="r && r.estado !== 'GENERADO'" class="btn-primario" :disabled="ocupado || !r.acciones.generar" :title="r.acciones.generar ? '' : 'Resuelva todas las diferencias para generar'" @click="generar">
      <Icono nombre="check" clase="size-4" /> Generar registro
    </button>
  </EncabezadoPagina>

  <template v-if="r">
    <!-- Estado de la operación con SUNAT -->
    <div class="mb-4 space-y-2">
      <p v-if="procesando" class="flex items-center gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">
        <Icono nombre="sincronizar" clase="size-4 animate-spin" /> SUNAT está procesando el pedido ({{ r.operacion.tipo === 'PROPUESTA' ? 'descarga de la propuesta' : 'generación del registro' }}). Esta página se actualiza sola.
      </p>
      <p v-else-if="r.operacion?.estado === 'ERROR'" class="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        <Icono nombre="alerta" clase="mt-0.5 size-4 shrink-0" /> El último pedido a SUNAT falló: {{ r.operacion.mensaje }}
      </p>
      <p v-if="r.estado === 'GENERADO'" class="flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        <Icono nombre="check" clase="size-4 shrink-0" /> Registro generado en SUNAT
        <template v-if="r.generacion">· {{ fechaHora(r.generacion.terminadoEn) }}<template v-if="r.generacion.constancia"> · Constancia <span class="font-mono">{{ r.generacion.constancia }}</span></template></template>
      </p>
      <p v-else-if="!r.propuesta && !procesando" class="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
        Descargue la propuesta que SUNAT armó con los comprobantes electrónicos del período para compararla con las {{ esRce ? 'compras' : 'ventas' }} del sistema.
      </p>
      <p v-else-if="r.estado === 'CONCILIADO'" class="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
        Todo conciliado. Revise los totales y genere el registro antes del vencimiento.
      </p>
    </div>

    <!-- Totales lado a lado -->
    <section class="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Resumen de la conciliación">
      <div class="tarjeta p-4">
        <p class="text-xs text-slate-500 sm:text-sm">Propuesta SUNAT</p>
        <template v-if="r.propuesta">
          <p class="mt-2 text-xl font-semibold tracking-tight tabular-nums">{{ soles(r.propuesta.total) }}</p>
          <p class="mt-0.5 text-xs text-slate-500">{{ r.propuesta.cantidad }} comprobantes · IGV {{ soles(r.propuesta.igv) }}</p>
          <p class="text-xs text-slate-400">Descargada {{ fechaHora(r.propuesta.descargadaEn) }}</p>
        </template>
        <p v-else class="mt-2 text-xl font-semibold text-slate-400">Sin descargar</p>
      </div>
      <div class="tarjeta p-4">
        <p class="text-xs text-slate-500 sm:text-sm">{{ TXT.tarjeta }}</p>
        <p class="mt-2 text-xl font-semibold tracking-tight tabular-nums">{{ soles(r.sistema.total) }}</p>
        <p class="mt-0.5 text-xs text-slate-500">{{ r.sistema.cantidad }} comprobantes · IGV {{ soles(r.sistema.igv) }}</p>
      </div>
      <div class="tarjeta p-4">
        <p class="text-xs text-slate-500 sm:text-sm">Diferencia de totales</p>
        <p class="mt-2 text-xl font-semibold tracking-tight tabular-nums" :class="diferenciaTotales && Math.abs(diferenciaTotales) > 0.009 ? 'text-amber-700' : 'text-slate-900'">
          {{ diferenciaTotales == null ? '—' : soles(diferenciaTotales) }}
        </p>
        <p class="mt-0.5 text-xs text-slate-500">SUNAT menos sistema</p>
      </div>
      <button type="button" class="tarjeta p-4 text-left transition hover:shadow-md" @click="irA('diferencias')">
        <span class="flex items-center justify-between gap-2">
          <span class="text-xs text-slate-500 sm:text-sm">Diferencias por resolver</span>
          <span class="flex size-8 items-center justify-center rounded-lg" :class="r.diferencias.pendientes ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'">
            <Icono :nombre="r.diferencias.pendientes ? 'alerta' : 'check'" clase="size-5" />
          </span>
        </span>
        <span class="mt-2 block text-xl font-semibold tracking-tight tabular-nums">{{ r.diferencias.pendientes }} <span class="text-sm font-normal text-slate-400">/ {{ r.diferencias.total }}</span></span>
        <span class="mt-1 flex flex-wrap gap-1">
          <span v-for="(n, t) in r.diferencias.porTipo" :key="t" class="insignia" :class="TIPOS_DIFERENCIA[t].clase">{{ TIPOS_DIFERENCIA[t].texto }}: {{ n }}</span>
        </span>
      </button>
    </section>

    <!-- Compras: detracción sin depositar y no domiciliados -->
    <section v-if="r.compras && (r.compras.detraccionesPendientes.length || r.compras.noDomiciliados)" class="mb-5 space-y-2">
      <details v-if="r.compras.detraccionesPendientes.length" class="tarjeta border-amber-200 bg-amber-50/40 p-4">
        <summary class="flex cursor-pointer list-none items-start gap-2 text-sm text-amber-900">
          <Icono nombre="alerta" clase="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>{{ r.compras.detraccionesPendientes.length }} compra(s) con detracción sin depositar.</strong>
            Su IGV ({{ soles(r.compras.igvSinCredito) }}) recién da crédito fiscal en el período en que se deposite. Ver detalle
          </span>
        </summary>
        <ul class="mt-3 divide-y divide-amber-100 text-sm">
          <li v-for="c in r.compras.detraccionesPendientes" :key="c.id" class="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              <RouterLink :to="`/compras/${c.id}`" class="font-mono font-medium text-marca-700 hover:underline">{{ c.serie }}-{{ c.numero }}</RouterLink>
              <span class="ml-2 text-slate-600">{{ c.terceroNombre }}</span>
            </span>
            <span class="tabular-nums text-slate-600">Detracción {{ soles(c.detraccionMonto) }} · IGV {{ soles(c.igv) }}</span>
          </li>
        </ul>
        <p class="mt-2 text-xs text-slate-500">Registre la constancia en el detalle de cada compra cuando haga el depósito.</p>
      </details>
      <p v-if="r.compras.noDomiciliados" class="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
        {{ r.compras.noDomiciliados }} compra(s) a proveedores sin RUC peruano (no domiciliados) no entran en esta conciliación: SUNAT las lleva en un registro aparte.
      </p>
    </section>
  </template>

  <!-- Pestañas -->
  <div class="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
    <button
      v-for="[k, t] in [['diferencias', 'Diferencias'], ['sunat', 'Propuesta SUNAT'], ['sistema', TXT.sistema]]"
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

  <!-- Diferencias -->
  <template v-if="vista === 'diferencias'">
    <div class="mb-4 grid gap-2 sm:grid-cols-[12rem_12rem_1fr] sm:justify-items-start">
      <select v-model="dif.filtros.tipo" class="input" aria-label="Tipo de diferencia">
        <option value="">Todo tipo</option>
        <option v-for="(t, k) in TIPOS_DIFERENCIA" :key="k" :value="k">{{ t.texto }}</option>
      </select>
      <select v-model="dif.filtros.resolucion" class="input" aria-label="Resolución">
        <option value="">Toda resolución</option>
        <option v-for="[k, t] in Object.entries(RESOLUCIONES).filter(([x]) => esRce || !['INCLUIDA', 'EXCLUIDA'].includes(x))" :key="k" :value="k">{{ t.texto }}</option>
      </select>
      <BotonColumnas class="sm:justify-self-end" :columnas="columnas" />
    </div>
    <TablaResponsiva :columnas="columnas" :filas="dif.filas.value" :cargando="dif.cargando.value" :vacio="r?.propuesta ? 'Sin diferencias: la propuesta coincide con el sistema' : 'Primero descargue la propuesta'">
      <template #celda-comprobante="{ fila }">
        <span class="font-mono text-sm font-medium">{{ fila.serie }}-{{ fila.numero }}</span>
        <p class="text-xs text-slate-500">{{ fila.tipoNombre }}<template v-if="fila.fechaEmision"> · {{ fecha(fila.fechaEmision) }}</template></p>
      </template>
      <template #celda-nombre="{ fila }">
        <span class="text-sm">{{ fila.nombre ?? '—' }}</span>
        <p v-if="esRce && fila.docNumero" class="font-mono text-xs text-slate-500">RUC {{ fila.docNumero }}</p>
      </template>
      <template #celda-tipo="{ fila }">
        <span class="insignia" :class="TIPOS_DIFERENCIA[fila.tipo].clase" :title="TIPOS_DIFERENCIA[fila.tipo].ayuda">{{ TIPOS_DIFERENCIA[fila.tipo].texto }}</span>
        <p v-if="fila.tipo === 'SOLO_SISTEMA' && fila.estadoSunatSistema" class="mt-0.5 text-xs text-slate-500">En el sistema: {{ fila.estadoSunatSistema.toLowerCase() }}</p>
      </template>
      <template #celda-totalSunat="{ fila }"><span class="tabular-nums">{{ fila.totalSunat == null ? '—' : soles(fila.totalSunat) }}</span></template>
      <template #celda-totalSistema="{ fila }"><span class="tabular-nums">{{ fila.totalSistema == null ? '—' : soles(fila.totalSistema) }}</span></template>
      <template #celda-resolucion="{ fila }">
        <span class="insignia" :class="RESOLUCIONES[fila.resolucion].clase">{{ RESOLUCIONES[fila.resolucion].texto }}</span>
        <p v-if="fila.nota" class="mt-0.5 max-w-64 text-xs text-slate-500">{{ fila.nota }}</p>
      </template>
      <template #acciones="{ fila }"><MenuAcciones :acciones="accionesDif(fila)" :etiqueta="`Acciones de ${fila.serie}-${fila.numero}`" /></template>
    </TablaResponsiva>
    <Paginacion :pag="dif.pag" />
    <p v-if="esRce" class="mt-3 text-xs text-slate-500">
      <strong>Falta en SUNAT:</strong> una compra registrada que SUNAT no trae (p. ej. comprobante físico): inclúyala en el registro. <strong>Solo en SUNAT:</strong>
      si la compra es de la empresa, acéptela; si no lo es (no se recibió, no es gasto del negocio), exclúyala indicando el motivo. Lo que ya resolvió se conserva al volver a descargar.
    </p>
    <p v-else class="mt-3 text-xs text-slate-500">
      <strong>Falta en SUNAT:</strong> envíe el comprobante desde su detalle y vuelva a descargar la propuesta. <strong>Solo en SUNAT:</strong> si la venta es real
      (p. ej. emitida desde el portal de SUNAT), acéptela. Lo que ya resolvió se conserva al volver a descargar.
    </p>
  </template>

  <!-- Comprobantes de SUNAT o del sistema -->
  <template v-else>
    <div class="mb-4 grid gap-2 sm:grid-cols-[1fr_auto]">
      <CampoBusqueda v-model="listados[vista].filtros.q" :placeholder="`Serie, número, ${TXT.tercero.toLowerCase()} o documento`" />
      <BotonColumnas :columnas="columnas" />
    </div>
    <TablaResponsiva
      :columnas="columnas"
      :filas="listados[vista].filas.value"
      :cargando="listados[vista].cargando.value"
      :vacio="vista === 'sunat' ? (r?.propuesta ? 'Sin resultados' : 'Primero descargue la propuesta') : TXT.vacio"
    >
      <template #celda-fechaEmision="{ fila }"><span class="whitespace-nowrap">{{ fecha(fila.fechaEmision) }}</span></template>
      <template #celda-comprobante="{ fila }">
        <span class="font-mono text-sm font-medium">{{ fila.serie }}-{{ fila.numero }}</span>
        <span v-if="fila.anulado" class="insignia ml-1 bg-red-50 text-red-700">Anulado</span>
        <p class="text-xs text-slate-500">{{ fila.tipoNombre }}<template v-if="fila.refSerie"> · modifica {{ fila.refSerie }}-{{ fila.refNumero }}</template></p>
      </template>
      <template #celda-nombre="{ fila }">
        <span class="text-sm">{{ fila.nombre ?? '—' }}</span>
        <p v-if="fila.docNumero" class="font-mono text-xs text-slate-500">{{ fila.docNumero }}</p>
      </template>
      <template #celda-baseGravada="{ fila }"><span class="tabular-nums">{{ signo(fila) }}{{ soles(fila.baseGravada) }}</span></template>
      <template #celda-igv="{ fila }"><span class="tabular-nums">{{ signo(fila) }}{{ soles(fila.igv) }}</span></template>
      <template #celda-total="{ fila }"><span class="font-medium tabular-nums">{{ signo(fila) }}{{ soles(fila.total) }}</span></template>
    </TablaResponsiva>
    <Paginacion :pag="listados[vista].pag" />
  </template>
</template>
