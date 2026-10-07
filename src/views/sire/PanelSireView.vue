<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, descargar, mensajeError } from '@/services/api';
import { useContexto } from '@/stores/contexto';
import { useToast } from '@/stores/toast';
import { useListado } from '@/composables/useListado';
import { usePaginacionLocal } from '@/composables/usePaginacionLocal';
import { fecha, fechaHora } from '@/utils/formato';
import { ESTADOS_SIRE } from '@/utils/sire';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import TablaResponsiva from '@/components/TablaResponsiva.vue';
import Paginacion from '@/components/Paginacion.vue';
import CampoBusqueda from '@/components/CampoBusqueda.vue';
import BotonColumnas from '@/components/BotonColumnas.vue';
import BaseModal from '@/components/BaseModal.vue';
import Icono from '@/components/Icono.vue';

/**
 * Panel SIRE del estudio: todas las empresas cliente a la vez, con el avance de sus registros de
 * ventas y compras por período, las alertas (vencidos, por vencer, diferencias, conexión) y el
 * historial de lo que se hizo.
 */
const route = useRoute();
const router = useRouter();
const contexto = useContexto();
const toast = useToast();

const n = ref(6);
const datos = ref(null);
const cargando = ref(false);
async function cargar() {
  cargando.value = true;
  try {
    datos.value = (await api.get('/sire/panel', { params: { n: n.value } })).data;
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    cargando.value = false;
  }
}
watch(n, cargar, { immediate: true });

// ── Pestañas ──
const vista = computed(() => (['empresas', 'alertas', 'historial'].includes(route.query.vista) ? route.query.vista : 'empresas'));
const irA = (v) => router.replace({ query: { ...route.query, vista: v } });

// ── Empresas × períodos ──
const filtro = reactive({ q: '', mostrar: '' });
const urgente = (e) => e.periodos.some((p) => !p.enCurso && p.diasParaVencer != null && p.diasParaVencer <= 5 && (p.RVIE !== 'GENERADO' || p.RCE !== 'GENERADO'));
const empresas = computed(() =>
  (datos.value?.empresas ?? []).filter((e) => {
    const q = filtro.q.trim().toUpperCase();
    if (q && !e.razonSocial.toUpperCase().includes(q) && !e.ruc.includes(q)) return false;
    if (filtro.mostrar === 'urgentes') return urgente(e);
    if (filtro.mostrar === 'diferencias') return e.periodos.some((p) => p.RVIE === 'CON_DIFERENCIAS' || p.RCE === 'CON_DIFERENCIAS');
    if (filtro.mostrar === 'sinConfigurar') return !e.config?.activo;
    return true;
  }),
);
const { pag, visibles } = usePaginacionLocal(empresas, 20);
const columnas = computed(() => [
  { clave: 'razonSocial', titulo: 'Empresa' },
  ...(datos.value?.periodos ?? []).map((p) => ({ clave: `p${p.periodo}`, titulo: p.etiqueta.replace(/^(\w{3})\w*\s(\d{4})$/, '$1 $2') })),
]);
const periodoDe = (e, clave) => e.periodos.find((p) => `p${p.periodo}` === clave);
/** Aviso bajo la celda: vencido o por vencer (≤ 5 días), si falta generar alguno de los dos registros */
function avisoCelda(p) {
  if (!p || p.enCurso || p.diasParaVencer == null || (p.RVIE === 'GENERADO' && p.RCE === 'GENERADO')) return null;
  if (p.diasParaVencer < 0) return { texto: 'Vencido', clase: 'text-red-700' };
  if (p.diasParaVencer <= 5) return { texto: `Vence ${fecha(p.vencimiento).slice(0, 5)}`, clase: 'text-amber-700' };
  return null;
}

/** Abre el registro de una empresa: primero la deja activa (las pantallas trabajan con la empresa activa) */
async function abrirRegistro(empresaId, registro, periodo) {
  if (contexto.empresaActivaId !== empresaId) {
    contexto.seleccionar(empresaId);
    await nextTick();
  }
  router.push(`/sire/${registro}/${periodo}`);
}
const conexion = (e) => (!e.config ? { texto: 'Sin configurar', clase: 'bg-slate-100 text-slate-600' }
  : !e.config.activo ? { texto: 'Desactivado', clase: 'bg-slate-100 text-slate-600' }
    : e.config.ultimoError ? { texto: 'Con error', clase: 'bg-red-50 text-red-700' }
      : e.config.modo === 'SIMULADO' ? { texto: 'Simulado', clase: 'bg-sky-50 text-sky-700' } : { texto: 'SUNAT', clase: 'bg-emerald-50 text-emerald-700' });

// ── Alertas ──
const TIPO_ALERTA = {
  VENCIDO: { texto: 'Vencido', clase: 'bg-red-50 text-red-700', icono: 'alerta' },
  POR_VENCER: { texto: 'Por vencer', clase: 'bg-amber-50 text-amber-800', icono: 'calendario' },
  DIFERENCIAS: { texto: 'Diferencias', clase: 'bg-violet-50 text-violet-700', icono: 'comprobante' },
  CONEXION: { texto: 'Conexión', clase: 'bg-slate-100 text-slate-700', icono: 'candado' },
};
const alertas = computed(() => datos.value?.alertas ?? []);
const { pag: pagAlertas, visibles: alertasVisibles } = usePaginacionLocal(alertas, 20);
function abrirAlerta(a) {
  if (a.tipo === 'CONEXION') router.push({ path: '/empresas', query: { sire: a.empresaId } });
  else abrirRegistro(a.empresaId, a.registro, a.periodo);
}

// ── Historial ──
const historial = useListado('/sire/historial', { empresaId: '' });
watch(vista, (v) => v === 'historial' && historial.cargar(), { immediate: true });

// ── Acciones ──
const sinc = reactive({ ocupado: false, abierto: false, resultado: null });
async function sincronizarTodas() {
  sinc.ocupado = true;
  try {
    sinc.resultado = (await api.post('/sire/panel/sincronizar')).data;
    sinc.abierto = true;
    await cargar();
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    sinc.ocupado = false;
  }
}
const exportando = ref(false);
async function exportar() {
  exportando.value = true;
  try {
    await descargar('/sire/panel/excel', { n: n.value }, `panel-sire-${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    exportando.value = false;
  }
}
</script>

<template>
  <EncabezadoPagina titulo="Panel SIRE" subtitulo="Registros de ventas y compras de todas las empresas del estudio">
    <button class="btn-secundario" :disabled="exportando || !datos" @click="exportar"><Icono nombre="descargar" clase="size-4" /> {{ exportando ? 'Exportando…' : 'Exportar Excel' }}</button>
    <button v-if="datos?.acciones.sincronizar" class="btn-primario" :disabled="sinc.ocupado" @click="sincronizarTodas">
      <Icono nombre="sincronizar" clase="size-4" :class="{ 'animate-spin': sinc.ocupado }" /> {{ sinc.ocupado ? 'Sincronizando…' : 'Sincronizar todas' }}
    </button>
  </EncabezadoPagina>

  <!-- Indicadores -->
  <section v-if="datos" class="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumen del SIRE">
    <button type="button" class="tarjeta p-4 text-left transition hover:shadow-md" @click="irA('alertas')">
      <span class="flex items-center justify-between gap-2">
        <span class="text-xs text-slate-500 sm:text-sm">Registros vencidos</span>
        <span class="flex size-8 items-center justify-center rounded-lg sm:size-9" :class="datos.resumen.vencidos ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'">
          <Icono :nombre="datos.resumen.vencidos ? 'alerta' : 'check'" clase="size-5" />
        </span>
      </span>
      <span class="mt-2 block text-xl font-semibold tracking-tight tabular-nums sm:text-2xl" :class="datos.resumen.vencidos ? 'text-red-700' : 'text-slate-900'">{{ datos.resumen.vencidos }}</span>
      <span class="mt-0.5 block text-xs text-slate-500">sin generar después del plazo</span>
    </button>
    <button type="button" class="tarjeta p-4 text-left transition hover:shadow-md" @click="irA('alertas')">
      <span class="flex items-center justify-between gap-2">
        <span class="text-xs text-slate-500 sm:text-sm">Por vencer</span>
        <span class="flex size-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700 sm:size-9"><Icono nombre="calendario" clase="size-5" /></span>
      </span>
      <span class="mt-2 block text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{{ datos.resumen.porVencer }}</span>
      <span class="mt-0.5 block text-xs text-slate-500">en los próximos 5 días</span>
    </button>
    <button type="button" class="tarjeta p-4 text-left transition hover:shadow-md" @click="(filtro.mostrar = 'diferencias'), irA('empresas')">
      <span class="flex items-center justify-between gap-2">
        <span class="text-xs text-slate-500 sm:text-sm">Con diferencias</span>
        <span class="flex size-8 items-center justify-center rounded-lg bg-violet-50 text-violet-700 sm:size-9"><Icono nombre="comprobante" clase="size-5" /></span>
      </span>
      <span class="mt-2 block text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{{ datos.resumen.conDiferencias }}</span>
      <span class="mt-0.5 block text-xs text-slate-500">por conciliar</span>
    </button>
    <button type="button" class="tarjeta p-4 text-left transition hover:shadow-md" @click="(filtro.mostrar = 'sinConfigurar'), irA('empresas')">
      <span class="flex items-center justify-between gap-2">
        <span class="text-xs text-slate-500 sm:text-sm">Empresas con SIRE</span>
        <span class="flex size-8 items-center justify-center rounded-lg bg-marca-50 text-marca-700 sm:size-9"><Icono nombre="empresa" clase="size-5" /></span>
      </span>
      <span class="mt-2 block text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{{ datos.resumen.configuradas }} <span class="text-sm font-normal text-slate-400">/ {{ datos.resumen.empresas }}</span></span>
      <span class="mt-0.5 block text-xs text-slate-500">configuradas y activas</span>
    </button>
  </section>

  <!-- Pestañas -->
  <div class="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
    <button
      v-for="[k, t] in [['empresas', 'Empresas'], ['alertas', `Alertas${alertas.length ? ` (${alertas.length})` : ''}`], ['historial', 'Historial']]"
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

  <!-- Empresas × períodos -->
  <template v-if="vista === 'empresas'">
    <div class="mb-4 grid gap-2 sm:grid-cols-[1fr_14rem_10rem_auto]">
      <CampoBusqueda v-model="filtro.q" placeholder="Empresa o RUC" />
      <select v-model="filtro.mostrar" class="input" aria-label="Mostrar">
        <option value="">Todas las empresas</option>
        <option value="urgentes">Vencidas o por vencer</option>
        <option value="diferencias">Con diferencias</option>
        <option value="sinConfigurar">Sin SIRE configurado</option>
      </select>
      <select v-model.number="n" class="input" aria-label="Períodos">
        <option :value="3">3 meses</option>
        <option :value="6">6 meses</option>
        <option :value="12">12 meses</option>
      </select>
      <BotonColumnas :columnas="columnas" />
    </div>
    <p class="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
      <span><strong>V</strong> ventas (RVIE) · <strong>C</strong> compras (RCE)</span>
      <span v-for="(e, k) in ESTADOS_SIRE" :key="k" class="inline-flex items-center gap-1"><span class="size-2 rounded-full" :class="e.punto" /> {{ e.texto }}</span>
    </p>
    <TablaResponsiva :columnas="columnas" :filas="visibles" :cargando="cargando && !datos" vacio="No hay empresas que coincidan">
      <template #celda-razonSocial="{ fila }">
        <span class="font-medium">{{ fila.razonSocial }}</span>
        <p class="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          <span class="font-mono">{{ fila.ruc }}</span>
          <span class="insignia" :class="conexion(fila).clase">{{ conexion(fila).texto }}</span>
        </p>
      </template>
      <template v-for="c in columnas.slice(1)" :key="c.clave" #[`celda-${c.clave}`]="{ fila }">
        <div v-if="periodoDe(fila, c.clave)" class="flex flex-col items-start gap-1 sm:items-center">
          <span class="flex gap-1">
            <button
              v-for="reg in ['RVIE', 'RCE']"
              :key="reg"
              type="button"
              class="inline-flex min-h-7 items-center gap-1 rounded-md border px-1.5 text-xs font-semibold transition hover:shadow-sm"
              :class="ESTADOS_SIRE[periodoDe(fila, c.clave)[reg]].clase"
              :title="`${reg === 'RVIE' ? 'Ventas' : 'Compras'}: ${ESTADOS_SIRE[periodoDe(fila, c.clave)[reg]].texto}`"
              :aria-label="`${reg === 'RVIE' ? 'Ventas' : 'Compras'} de ${fila.razonSocial}, ${c.titulo}: ${ESTADOS_SIRE[periodoDe(fila, c.clave)[reg]].texto}`"
              @click="abrirRegistro(fila.id, reg, periodoDe(fila, c.clave).periodo)"
            >
              <span class="size-1.5 rounded-full" :class="ESTADOS_SIRE[periodoDe(fila, c.clave)[reg]].punto" /> {{ reg === 'RVIE' ? 'V' : 'C' }}
            </button>
          </span>
          <span v-if="avisoCelda(periodoDe(fila, c.clave))" class="text-[11px] font-medium whitespace-nowrap" :class="avisoCelda(periodoDe(fila, c.clave)).clase">
            {{ avisoCelda(periodoDe(fila, c.clave)).texto }}
          </span>
        </div>
      </template>
    </TablaResponsiva>
    <Paginacion :pag="pag" />
  </template>

  <!-- Alertas -->
  <template v-else-if="vista === 'alertas'">
    <div class="tarjeta divide-y divide-slate-100">
      <p v-if="!alertas.length" class="flex items-center justify-center gap-2 p-8 text-sm text-emerald-700"><Icono nombre="check" clase="size-5" /> Sin alertas: todo al día</p>
      <div v-for="(a, i) in alertasVisibles" :key="i" class="flex flex-wrap items-center gap-3 px-4 py-3">
        <span class="insignia shrink-0" :class="TIPO_ALERTA[a.tipo].clase"><Icono :nombre="TIPO_ALERTA[a.tipo].icono" clase="size-3.5" /> {{ TIPO_ALERTA[a.tipo].texto }}</span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium">{{ a.empresa }}</p>
          <p class="text-xs text-slate-500">{{ a.texto }}<template v-if="a.etiqueta"> · {{ a.etiqueta }}</template><template v-if="a.vencimiento"> · vence {{ fecha(a.vencimiento) }}</template></p>
        </div>
        <button class="btn-secundario min-h-9 shrink-0 px-3 text-sm" @click="abrirAlerta(a)">{{ a.tipo === 'CONEXION' ? 'Revisar credenciales' : 'Abrir registro' }}</button>
      </div>
    </div>
    <Paginacion v-if="alertas.length" :pag="pagAlertas" />
  </template>

  <!-- Historial -->
  <template v-else>
    <div class="mb-4 grid gap-2 sm:grid-cols-[18rem]">
      <select v-model="historial.filtros.empresaId" class="input" aria-label="Empresa">
        <option value="">Todas las empresas</option>
        <option v-for="e in datos?.empresas ?? []" :key="e.id" :value="e.id">{{ e.razonSocial }}</option>
      </select>
    </div>
    <TablaResponsiva
      :columnas="[{ clave: 'fecha', titulo: 'Fecha' }, { clave: 'usuario', titulo: 'Usuario' }, { clave: 'empresa', titulo: 'Empresa' }, { clave: 'texto', titulo: 'Acción' }]"
      :filas="historial.filas.value"
      :cargando="historial.cargando.value"
      vacio="Todavía no hay movimientos en el SIRE"
    >
      <template #celda-fecha="{ fila }"><span class="whitespace-nowrap">{{ fechaHora(fila.fecha) }}</span></template>
      <template #celda-usuario="{ fila }">{{ fila.usuario ?? '—' }}</template>
      <template #celda-empresa="{ fila }">{{ fila.empresa ?? 'Todo el estudio' }}</template>
      <template #celda-texto="{ fila }">
        <span class="text-sm">{{ fila.texto }}</span>
        <p v-if="/^(RVIE|RCE)-\d{6}$/.test(fila.recursoId ?? '')" class="font-mono text-xs text-slate-500">{{ fila.recursoId.replace('-', ' · ') }}</p>
        <p v-else-if="fila.detalle?.resolucion" class="text-xs text-slate-500">{{ fila.detalle.clave }} → {{ fila.detalle.resolucion.toLowerCase() }}</p>
        <p v-else-if="fila.detalle?.mensaje" class="text-xs text-slate-500">{{ fila.detalle.mensaje }}</p>
      </template>
    </TablaResponsiva>
    <Paginacion :pag="historial.pag" />
  </template>

  <!-- Resultado de sincronizar todas -->
  <BaseModal :abierto="sinc.abierto" titulo="Sincronización con SUNAT" @cerrar="sinc.abierto = false">
    <div v-if="sinc.resultado" class="space-y-3">
      <p class="text-sm text-slate-600">
        {{ sinc.resultado.resultados.length }} empresa(s) consultadas<template v-if="sinc.resultado.conError">, {{ sinc.resultado.conError }} con error</template><template v-if="sinc.resultado.sinConfigurar">; {{ sinc.resultado.sinConfigurar }} sin SIRE configurado</template>.
      </p>
      <ul class="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
        <li v-for="x in sinc.resultado.resultados" :key="x.empresaId" class="flex items-start gap-2 px-3 py-2">
          <Icono :nombre="x.ok ? 'check' : 'alerta'" clase="mt-0.5 size-4 shrink-0" :class="x.ok ? 'text-emerald-600' : 'text-red-600'" />
          <span><span class="font-medium">{{ x.empresa }}</span><span class="block text-xs text-slate-500">{{ x.mensaje }}</span></span>
        </li>
      </ul>
    </div>
    <template #pie><button class="btn-primario" @click="sinc.abierto = false">Cerrar</button></template>
  </BaseModal>
</template>
