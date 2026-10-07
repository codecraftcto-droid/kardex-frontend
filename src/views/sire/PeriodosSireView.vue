<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, mensajeError } from '@/services/api';
import { useContexto } from '@/stores/contexto';
import { useToast } from '@/stores/toast';
import { usePaginacionLocal } from '@/composables/usePaginacionLocal';
import { fecha, fechaHora } from '@/utils/formato';
import { plazo } from '@/utils/sire';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import TablaResponsiva from '@/components/TablaResponsiva.vue';
import Paginacion from '@/components/Paginacion.vue';
import BotonColumnas from '@/components/BotonColumnas.vue';
import InsigniaSire from '@/components/InsigniaSire.vue';
import ModalSire from '@/components/ModalSire.vue';
import MenuAcciones from '@/components/MenuAcciones.vue';
import Icono from '@/components/Icono.vue';

/**
 * Períodos tributarios de la empresa activa: vencimiento según el cronograma de SUNAT y avance
 * de los registros de ventas (RVIE) y compras (RCE). Se sincroniza con el SIRE de SUNAT.
 */
const route = useRoute();
const router = useRouter();
const contexto = useContexto();
const toast = useToast();

const datos = ref(null);
const cargando = ref(false);
const sincronizando = ref(false);
const cuantos = ref(12);

async function cargar() {
  if (!contexto.empresaActivaId) return;
  cargando.value = true;
  try {
    datos.value = (await api.get('/sire/periodos', { params: { empresaId: contexto.empresaActivaId, n: cuantos.value } })).data;
  } catch (e) {
    datos.value = null;
    toast.error(mensajeError(e));
  } finally {
    cargando.value = false;
  }
}
watch([() => contexto.empresaActivaId, cuantos], cargar, { immediate: true });

async function sincronizar() {
  sincronizando.value = true;
  try {
    const { data } = await api.post('/sire/periodos/sincronizar', { empresaId: contexto.empresaActivaId });
    (data.ok ? toast.exito : toast.error)(data.mensaje);
    await cargar();
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    sincronizando.value = false;
  }
}

const periodos = computed(() => datos.value?.periodos ?? []);
const { pag, visibles } = usePaginacionLocal(periodos, 12);

// Indicadores: el próximo vencimiento pendiente, los vencidos y lo ya generado
const indicadores = computed(() => {
  const p = periodos.value;
  const porVencer = p.filter((x) => x.diasParaVencer != null && x.diasParaVencer >= 0).sort((a, b) => a.diasParaVencer - b.diasParaVencer);
  return {
    proximo: porVencer[0] ?? null,
    vencidos: p.filter((x) => x.diasParaVencer != null && x.diasParaVencer < 0).length,
    generados: p.filter((x) => !x.enCurso).reduce((n, x) => n + (x.estadoRvie === 'GENERADO') + (x.estadoRce === 'GENERADO'), 0),
    cerrados: p.filter((x) => !x.enCurso).length * 2,
  };
});
const sincronizadoEn = computed(() => periodos.value.map((x) => x.sincronizadoEn).filter(Boolean).sort().at(-1) ?? null);

const columnas = [
  { clave: 'etiqueta', titulo: 'Período' },
  { clave: 'vencimiento', titulo: 'Vencimiento' },
  { clave: 'estadoRvie', titulo: 'Ventas (RVIE)' },
  { clave: 'estadoRce', titulo: 'Compras (RCE)' },
  { clave: 'sunat', titulo: 'Según SUNAT', ocultarEnTarjeta: true },
];

const accionesFila = (p) => [
  { texto: 'Registro de ventas (RVIE)', icono: 'salida', to: `/sire/RVIE/${p.periodo}` },
  { texto: 'Registro de compras (RCE)', icono: 'entrada', to: `/sire/RCE/${p.periodo}` },
];

// Credenciales en modal: ?credenciales=1
const credenciales = computed(() => route.query.credenciales === '1');
const abrirCredenciales = () => router.push({ query: { ...route.query, credenciales: '1' } });
const cerrarCredenciales = () => router.replace({ query: { ...route.query, credenciales: undefined } });
</script>

<template>
  <EncabezadoPagina titulo="Períodos SIRE" :subtitulo="datos ? `${datos.empresa.razonSocial} · RUC ${datos.empresa.ruc}` : contexto.empresaActiva?.razonSocial">
    <button v-if="datos?.acciones.configurar" class="btn-secundario" @click="abrirCredenciales"><Icono nombre="candado" clase="size-4" /> Credenciales SIRE</button>
    <button v-if="datos?.acciones.sincronizar" class="btn-primario" :disabled="sincronizando" @click="sincronizar">
      <Icono nombre="sincronizar" clase="size-4" :class="{ 'animate-spin': sincronizando }" /> {{ sincronizando ? 'Sincronizando…' : 'Sincronizar con SUNAT' }}
    </button>
  </EncabezadoPagina>

  <template v-if="datos">
    <!-- Avisos -->
    <div class="mb-4 space-y-2">
      <p v-if="!datos.config" class="flex flex-wrap items-center gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">
        <Icono nombre="alerta" clase="size-4 shrink-0" />
        Esta empresa aún no tiene configurado el SIRE: los estados se muestran sin consultar a SUNAT.
        <button v-if="datos.acciones.configurar" class="font-medium underline" @click="abrirCredenciales">Configurar ahora</button>
      </p>
      <p v-else-if="!datos.config.activo" class="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">El SIRE está desactivado para esta empresa.</p>
      <p v-if="datos.config?.ultimoError" class="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
        <Icono nombre="alerta" clase="mt-0.5 size-4 shrink-0" /> Última conexión con error: {{ datos.config.ultimoError }}
      </p>
      <p v-if="datos.config?.modo === 'SIMULADO'" class="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
        Conexión <strong>simulada</strong>: los estados son de prueba, no vienen de SUNAT.
      </p>
      <p v-if="!datos.cronogramaCargado" class="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
        Aún no se cargó el cronograma de vencimientos de SUNAT: las fechas aparecerán cuando el administrador de la plataforma lo registre.
      </p>
    </div>

    <!-- Indicadores -->
    <section class="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumen del SIRE">
      <div class="tarjeta col-span-2 p-4 lg:col-span-1">
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs text-slate-500 sm:text-sm">Próximo vencimiento</p>
          <span class="flex size-8 items-center justify-center rounded-lg bg-marca-50 text-marca-700 sm:size-9"><Icono nombre="calendario" clase="size-5" /></span>
        </div>
        <template v-if="indicadores.proximo">
          <p class="mt-2 text-xl font-semibold tracking-tight text-slate-900 tabular-nums sm:text-2xl">{{ fecha(indicadores.proximo.vencimiento) }}</p>
          <p class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            {{ indicadores.proximo.etiqueta }}
            <span class="insignia" :class="plazo(indicadores.proximo.diasParaVencer).clase">{{ plazo(indicadores.proximo.diasParaVencer).texto }}</span>
          </p>
        </template>
        <p v-else class="mt-2 text-xl font-semibold text-slate-400">—</p>
      </div>
      <div class="tarjeta p-4">
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs text-slate-500 sm:text-sm">Períodos vencidos</p>
          <span class="flex size-8 items-center justify-center rounded-lg sm:size-9" :class="indicadores.vencidos ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'">
            <Icono :nombre="indicadores.vencidos ? 'alerta' : 'check'" clase="size-5" />
          </span>
        </div>
        <p class="mt-2 text-xl font-semibold tracking-tight text-slate-900 tabular-nums sm:text-2xl">{{ indicadores.vencidos }}</p>
        <p class="mt-0.5 text-xs text-slate-500">{{ indicadores.vencidos ? 'con registros sin generar' : 'todo al día' }}</p>
      </div>
      <div class="tarjeta p-4">
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs text-slate-500 sm:text-sm">Registros generados</p>
          <span class="flex size-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 sm:size-9"><Icono nombre="comprobante" clase="size-5" /></span>
        </div>
        <p class="mt-2 text-xl font-semibold tracking-tight text-slate-900 tabular-nums sm:text-2xl">{{ indicadores.generados }} <span class="text-sm font-normal text-slate-400">/ {{ indicadores.cerrados }}</span></p>
        <p class="mt-0.5 text-xs text-slate-500">ventas y compras de los meses cerrados</p>
      </div>
      <div class="tarjeta col-span-2 p-4 lg:col-span-1">
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs text-slate-500 sm:text-sm">Última sincronización</p>
          <span class="flex size-8 items-center justify-center rounded-lg bg-sky-50 text-sky-700 sm:size-9"><Icono nombre="sincronizar" clase="size-5" /></span>
        </div>
        <p class="mt-2 text-base font-semibold text-slate-900">{{ sincronizadoEn ? fechaHora(sincronizadoEn) : 'Nunca' }}</p>
        <p class="mt-0.5 text-xs text-slate-500">Cronograma: {{ datos.empresa.grupoCronograma === 'BC' ? 'buenos contribuyentes' : `RUC terminado en ${datos.empresa.grupoCronograma}` }}</p>
      </div>
    </section>
  </template>

  <div class="mb-4 grid gap-2 sm:grid-cols-[12rem_auto] sm:justify-between">
    <select v-model.number="cuantos" class="input" aria-label="Cantidad de períodos">
      <option :value="12">Últimos 12 meses</option>
      <option :value="24">Últimos 24 meses</option>
      <option :value="36">Últimos 36 meses</option>
    </select>
    <BotonColumnas :columnas="columnas" />
  </div>

  <TablaResponsiva :columnas="columnas" :filas="visibles" :cargando="cargando && !datos" vacio="Sin períodos">
    <template #celda-etiqueta="{ fila }">
      <span class="font-medium">{{ fila.etiqueta }}</span>
      <span v-if="fila.enCurso" class="insignia ml-1.5 bg-marca-50 text-marca-700">En curso</span>
      <p class="font-mono text-xs text-slate-400">{{ fila.periodo }}</p>
    </template>
    <template #celda-vencimiento="{ fila }">
      <template v-if="fila.vencimiento">
        <span class="tabular-nums">{{ fecha(fila.vencimiento) }}</span>
        <span v-if="plazo(fila.diasParaVencer)" class="insignia ml-1.5" :class="plazo(fila.diasParaVencer).clase">{{ plazo(fila.diasParaVencer).texto }}</span>
      </template>
      <span v-else class="text-slate-400">—</span>
    </template>
    <template #celda-estadoRvie="{ fila }">
      <RouterLink :to="`/sire/RVIE/${fila.periodo}`" class="rounded-full hover:ring-2 hover:ring-marca-200" :aria-label="`Registro de ventas de ${fila.etiqueta}`"><InsigniaSire :estado="fila.estadoRvie" /></RouterLink>
    </template>
    <template #celda-estadoRce="{ fila }">
      <RouterLink :to="`/sire/RCE/${fila.periodo}`" class="rounded-full hover:ring-2 hover:ring-marca-200" :aria-label="`Registro de compras de ${fila.etiqueta}`"><InsigniaSire :estado="fila.estadoRce" /></RouterLink>
    </template>
    <template #celda-sunat="{ fila }">
      <template v-if="fila.sunatRvie || fila.sunatRce">
        <p class="text-xs text-slate-600"><span class="text-slate-400">Ventas:</span> {{ fila.sunatRvie ?? '—' }}</p>
        <p class="text-xs text-slate-600"><span class="text-slate-400">Compras:</span> {{ fila.sunatRce ?? '—' }}</p>
      </template>
      <span v-else class="text-xs text-slate-400">Sin sincronizar</span>
    </template>
    <template #acciones="{ fila }"><MenuAcciones :acciones="accionesFila(fila)" :etiqueta="`Acciones de ${fila.etiqueta}`" /></template>
  </TablaResponsiva>
  <Paginacion :pag="pag" />

  <ModalSire :abierto="credenciales" :empresa="datos?.empresa ?? contexto.empresaActiva" @cerrar="cerrarCredenciales" @guardado="cargar" />
</template>
