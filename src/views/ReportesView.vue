<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api, mensajeError } from '@/services/api';
import { useExportaciones } from '@/stores/exportaciones';
import { useAuth } from '@/stores/auth';
import { useContexto } from '@/stores/contexto';
import { useToast } from '@/stores/toast';
import { useAlmacenes } from '@/composables/useAlmacenes';
import { cant, fecha, fechaHora, num } from '@/utils/formato';
import { ESTADOS_TRANSFERENCIA } from '@/utils/kardex';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import TablaResponsiva from '@/components/TablaResponsiva.vue';
import Paginacion from '@/components/Paginacion.vue';
import { usePaginacionLocal } from '@/composables/usePaginacionLocal';
import Icono from '@/components/Icono.vue';

const auth = useAuth();
const contexto = useContexto();
const toast = useToast();
const { almacenes } = useAlmacenes();
const empresaId = computed(() => contexto.empresaActivaId);

const hoy = () => new Date().toISOString().slice(0, 10);
const inicioMes = () => hoy().slice(0, 8) + '01';

/** Catálogo de reportes: cada uno visible solo con su permiso. */
const REPORTES = [
  { id: 'stock', titulo: 'Stock actual', descripcion: 'Por almacén, por sede o consolidado de la empresa', icono: 'inventario', permisos: ['reporte.stock.ver'] },
  { id: 'movimientos', titulo: 'Movimientos', descripcion: 'Entradas y salidas en un rango de fechas', icono: 'movimientos', permisos: ['reporte.movimientos.ver'] },
  { id: 'valorizacion', titulo: 'Valorización', descripcion: 'Valor del inventario a una fecha de corte', icono: 'kardex', permisos: ['reporte.valorizacion.ver', 'kardex.costos.ver'] },
  { id: 'transferencias', titulo: 'Transferencias', descripcion: 'Traslados entre almacenes y faltantes', icono: 'transferencias', permisos: ['transferencia.ver'] },
  { id: 'ventas', titulo: 'Registro de ventas', descripcion: 'Comprobantes del periodo (formato 14.1)', icono: 'comprobante', permisos: ['reporte.ventas.ver'] },
  { id: 'caja', titulo: 'Turnos de caja', descripcion: 'Arqueos por caja y medio de pago', icono: 'caja', permisos: ['reporte.ventas.ver'] },
  { id: 'cxc', titulo: 'Cuentas por cobrar', descripcion: 'Saldos de clientes por antigüedad (al día de hoy)', icono: 'tarjeta', permisos: ['reporte.cxc.ver'] },
  { id: 'cobranzas', titulo: 'Cobranzas', descripcion: 'Pagos recibidos de ventas al crédito', icono: 'tarjeta', permisos: ['reporte.cxc.ver'] },
];
const disponibles = computed(() => REPORTES.filter((r) => r.permisos.every((p) => auth.canEnEmpresa(p, empresaId.value))));
const route = useRoute();
const actual = ref(route.query.tipo || null);
watch(disponibles, (l) => { if (!l.some((r) => r.id === actual.value)) actual.value = l[0]?.id ?? null; }, { immediate: true });

const filtros = reactive({
  nivel: 'almacen', sedeId: '', almacenId: '', categoriaId: '', incluirCeros: false,
  desde: inicioMes(), hasta: hoy(), corte: hoy(), tipo: '', estado: '', incluirNotasVenta: false, soloVencidos: false,
});
const sedes = ref([]);
const categorias = ref([]);
watch(empresaId, async (id) => {
  if (!id) return;
  const [s, c] = await Promise.all([
    auth.canEnEmpresa('sedes.sede.ver', id) ? api.get('/sedes', { params: { empresaId: id, porPagina: 100 } }) : { data: { datos: [] } },
    auth.canEnEmpresa('productos.producto.ver', id) ? api.get('/catalogos/categorias', { params: { empresaId: id } }) : { data: [] },
  ]);
  sedes.value = s.data.datos;
  categorias.value = c.data;
}, { immediate: true });

/** Parámetros del reporte actual (las fechas "hasta" incluyen todo el día). */
function parametros() {
  const f = filtros;
  const comunes = { empresaId: empresaId.value };
  const opc = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null));
  return {
    stock: () => opc({ ...comunes, nivel: f.nivel, sedeId: f.sedeId, almacenId: f.nivel === 'almacen' ? f.almacenId : '', categoriaId: f.categoriaId, incluirCeros: f.incluirCeros ? 'true' : '' }),
    movimientos: () => opc({ ...comunes, desde: f.desde, hasta: `${f.hasta}T23:59:59`, almacenId: f.almacenId, tipo: f.tipo }),
    valorizacion: () => opc({ ...comunes, corte: `${f.corte}T23:59:59`, sedeId: f.sedeId, almacenId: f.almacenId }),
    transferencias: () => opc({ ...comunes, desde: f.desde, hasta: `${f.hasta}T23:59:59`, estado: f.estado, almacenId: f.almacenId }),
    ventas: () => opc({ ...comunes, desde: f.desde, hasta: `${f.hasta}T23:59:59`, incluirNotasVenta: f.incluirNotasVenta ? 'true' : '' }),
    caja: () => opc({ ...comunes, desde: f.desde, hasta: `${f.hasta}T23:59:59` }),
    cxc: () => opc({ ...comunes, soloVencidos: f.soloVencidos ? 'true' : '' }),
    cobranzas: () => opc({ ...comunes, desde: f.desde, hasta: `${f.hasta}T23:59:59` }),
  }[actual.value]();
}

const resultado = ref(null);
const cargando = ref(false);
async function generar() {
  cargando.value = true;
  try {
    resultado.value = (await api.get(`/reportes/${actual.value}`, { params: parametros() })).data;
  } catch (e) {
    resultado.value = null;
    toast.error(mensajeError(e));
  } finally {
    cargando.value = false;
  }
}
watch(actual, () => (resultado.value = null));

const puedeExportar = computed(() => auth.canEnEmpresa('reporte.exportar', empresaId.value));
// Exportación en segundo plano: el reporte completo (sin límite de filas en Excel)
const exportaciones = useExportaciones();
const { pag: pagExport, visibles: exportacionesVisibles } = usePaginacionLocal(computed(() => exportaciones.lista), 10);
onMounted(() => exportaciones.cargar());
const exportando = ref('');
async function exportar(formato) {
  exportando.value = formato;
  await exportaciones.solicitar(actual.value, formato, parametros());
  exportando.value = '';
}
const ESTADOS_EXP = {
  PENDIENTE: { texto: 'En cola', clase: 'bg-slate-100 text-slate-600' },
  PROCESANDO: { texto: 'Generando', clase: 'bg-sky-50 text-sky-700' },
  LISTO: { texto: 'Listo', clase: 'bg-emerald-50 text-emerald-700' },
  ERROR: { texto: 'Error', clase: 'bg-red-50 text-red-700' },
  EXPIRADO: { texto: 'Expirado', clase: 'bg-slate-100 text-slate-400' },
};
const tamano = (b) => (b == null ? '' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

// ── Vista previa: formato por tipo de columna ──
const VISTA_PREVIA = 500;
const formatear = (v, tipo) => {
  if (v === null || v === undefined || v === '') return '';
  return { cantidad: cant, moneda: (x) => num(x, 2), costo: (x) => num(x, 4), fecha, fechaHora }[tipo]?.(v) ?? v;
};
const columnas = computed(() =>
  (resultado.value?.columnas ?? []).map((c) => ({ ...c, clase: ['cantidad', 'moneda', 'costo'].includes(c.tipo) ? 'text-right tabular-nums' : '' })),
);
const filas = computed(() =>
  (resultado.value?.filas ?? []).slice(0, VISTA_PREVIA).map((f, i) => ({
    _id: i,
    ...Object.fromEntries(resultado.value.columnas.map((c) => [c.clave, formatear(f[c.clave], c.tipo)])),
  })),
);
// La vista previa (hasta 500 filas) se pagina en el navegador
const { pag: pagFilas, visibles: filasPagina } = usePaginacionLocal(filas, 20);

const totales = computed(() => {
  const t = resultado.value?.totales;
  if (!t) return [];
  return resultado.value.columnas.filter((c) => t[c.clave] != null).map((c) => ({ titulo: c.titulo, valor: formatear(t[c.clave], c.tipo) }));
});
const muestraSede = computed(() => (actual.value === 'stock' && filtros.nivel !== 'empresa') || actual.value === 'valorizacion');
const muestraAlmacen = computed(() => !['ventas', 'caja', 'cxc', 'cobranzas'].includes(actual.value) && (actual.value !== 'stock' || filtros.nivel === 'almacen'));
</script>

<template>
  <EncabezadoPagina titulo="Reportes" :subtitulo="contexto.empresaActiva?.razonSocial" />

  <p v-if="!disponibles.length" class="tarjeta p-8 text-center text-sm text-slate-500">No tiene reportes disponibles en esta empresa.</p>

  <template v-else>
    <!-- Selección de reporte -->
    <div class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <button
        v-for="r in disponibles"
        :key="r.id"
        class="tarjeta p-3 text-left transition sm:p-4"
        :class="actual === r.id ? 'border-marca-600 ring-2 ring-marca-100' : 'hover:border-slate-300'"
        @click="actual = r.id"
      >
        <Icono :nombre="r.icono" clase="size-6 text-marca-700" />
        <p class="mt-2 font-medium">{{ r.titulo }}</p>
        <p class="hidden text-xs text-slate-500 sm:block">{{ r.descripcion }}</p>
      </button>
    </div>

    <!-- Filtros -->
    <form class="tarjeta mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4" @submit.prevent="generar">
      <div v-if="actual === 'stock'">
        <label class="etiqueta">Nivel</label>
        <select v-model="filtros.nivel" class="input">
          <option value="almacen">Por almacén</option>
          <option value="sede">Consolidado por sede</option>
          <option value="empresa">Consolidado de la empresa</option>
        </select>
      </div>
      <template v-if="['movimientos', 'transferencias', 'ventas', 'caja', 'cobranzas'].includes(actual)">
        <div><label class="etiqueta">Desde</label><input v-model="filtros.desde" type="date" class="input" required /></div>
        <div><label class="etiqueta">Hasta</label><input v-model="filtros.hasta" type="date" class="input" required /></div>
      </template>
      <div v-if="actual === 'valorizacion'"><label class="etiqueta">Fecha de corte</label><input v-model="filtros.corte" type="date" class="input" required /></div>
      <div v-if="muestraSede && sedes.length">
        <label class="etiqueta">Sede</label>
        <select v-model="filtros.sedeId" class="input">
          <option value="">Todas</option>
          <option v-for="s in sedes" :key="s.id" :value="s.id">{{ s.nombre }}</option>
        </select>
      </div>
      <div v-if="muestraAlmacen && almacenes.length">
        <label class="etiqueta">Almacén</label>
        <select v-model="filtros.almacenId" class="input">
          <option value="">Todos</option>
          <option v-for="a in almacenes" :key="a.id" :value="a.id">{{ a.codigo }} — {{ a.nombre }}</option>
        </select>
      </div>
      <div v-if="actual === 'stock' && categorias.length">
        <label class="etiqueta">Categoría</label>
        <select v-model="filtros.categoriaId" class="input">
          <option value="">Todas</option>
          <option v-for="c in categorias" :key="c.id" :value="c.id">{{ c.nombre }}</option>
        </select>
      </div>
      <div v-if="actual === 'movimientos'">
        <label class="etiqueta">Tipo</label>
        <select v-model="filtros.tipo" class="input">
          <option value="">Entradas y salidas</option>
          <option value="ENTRADA">Solo entradas</option>
          <option value="SALIDA">Solo salidas</option>
        </select>
      </div>
      <div v-if="actual === 'transferencias'">
        <label class="etiqueta">Estado</label>
        <select v-model="filtros.estado" class="input">
          <option value="">Todos</option>
          <option v-for="(e, k) in ESTADOS_TRANSFERENCIA" :key="k" :value="k">{{ e.texto }}</option>
        </select>
      </div>
      <label v-if="actual === 'ventas'" class="flex min-h-11 items-center gap-2 self-end text-sm">
        <input v-model="filtros.incluirNotasVenta" type="checkbox" class="size-5 accent-marca-700" /> Incluir notas de venta (internas)
      </label>
      <label v-if="actual === 'cxc'" class="flex min-h-11 items-center gap-2 self-end text-sm">
        <input v-model="filtros.soloVencidos" type="checkbox" class="size-5 accent-marca-700" /> Solo documentos con cuotas vencidas
      </label>
      <label v-if="actual === 'stock'" class="flex min-h-11 items-center gap-2 self-end text-sm">
        <input v-model="filtros.incluirCeros" type="checkbox" class="size-5 accent-marca-700" /> Incluir productos sin stock
      </label>
      <div class="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4">
        <button class="btn-primario" :disabled="cargando">{{ cargando ? 'Generando…' : 'Generar reporte' }}</button>
        <template v-if="puedeExportar">
          <button type="button" class="btn-secundario" :disabled="!!exportando" @click="exportar('xlsx')">
            <Icono nombre="descargar" clase="size-4" /> {{ exportando === 'xlsx' ? 'Exportando…' : 'Excel' }}
          </button>
          <button type="button" class="btn-secundario" :disabled="!!exportando" @click="exportar('pdf')">
            <Icono nombre="descargar" clase="size-4" /> {{ exportando === 'pdf' ? 'Exportando…' : 'PDF' }}
          </button>
        </template>
      </div>
    </form>

    <!-- Resultado -->
    <section v-if="resultado" class="space-y-3">
      <div class="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 class="font-semibold">{{ resultado.titulo }}</h2>
          <p v-for="l in resultado.subtitulo" :key="l" class="text-xs text-slate-500">{{ l }}</p>
        </div>
        <p v-if="!resultado.verCostos" class="insignia bg-slate-100 text-slate-600">Sin columnas de costo (no tiene permiso)</p>
      </div>
      <div v-if="totales.length" class="flex flex-wrap gap-3">
        <div v-for="t in totales" :key="t.titulo" class="tarjeta px-4 py-2">
          <p class="text-xs text-slate-500">{{ t.titulo }}</p>
          <p class="text-lg font-semibold tabular-nums">{{ t.valor }}</p>
        </div>
      </div>
      <TablaResponsiva selector :columnas="columnas" :filas="filasPagina" clave-fila="_id" :clave-columnas="`reporte-${actual}`" vacio="Sin datos para los filtros seleccionados" />
      <Paginacion :pag="pagFilas" />
      <p v-if="resultado.hayMas" class="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">
        Vista previa de las primeras {{ VISTA_PREVIA }} filas{{ resultado.total ? ` de ${resultado.total.toLocaleString('es-PE')}` : '' }}.
        Exporte a Excel para obtener el reporte completo con sus totales; se genera en segundo plano.
      </p>
    </section>

    <!-- Mis exportaciones -->
    <section v-if="exportaciones.lista.length" class="tarjeta mt-6 p-4">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="font-semibold">Mis exportaciones</h2>
        <span class="text-xs text-slate-500">Los archivos se conservan 24 horas</span>
      </div>
      <ul class="divide-y divide-slate-100">
        <li v-for="x in exportacionesVisibles" :key="x.id" class="flex flex-wrap items-center justify-between gap-3 py-3">
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">
              {{ x.titulo || REPORTES.find((r) => r.id === x.tipo)?.titulo || x.tipo }}
              <span class="ml-1 font-mono text-xs text-slate-400 uppercase">{{ x.formato }}</span>
            </p>
            <p class="text-xs text-slate-500">
              {{ fechaHora(x.creadoEn) }}
              <template v-if="x.filas != null"> · {{ x.filas.toLocaleString('es-PE') }} filas</template>
              <template v-if="x.tamanoBytes"> · {{ tamano(x.tamanoBytes) }}</template>
            </p>
            <div v-if="['PENDIENTE', 'PROCESANDO'].includes(x.estado)" class="mt-1.5 h-1.5 max-w-xs overflow-hidden rounded-full bg-slate-100">
              <div class="h-full rounded-full bg-sky-500 transition-all" :class="{ 'animate-pulse': x.estado === 'PENDIENTE' }" :style="{ width: `${Math.max(5, x.progreso)}%` }" />
            </div>
            <p v-if="x.error" class="mt-1 text-xs text-red-600">{{ x.error }}</p>
          </div>
          <span class="insignia" :class="ESTADOS_EXP[x.estado].clase">{{ ESTADOS_EXP[x.estado].texto }}{{ x.estado === 'PROCESANDO' ? ` ${x.progreso}%` : '' }}</span>
          <button v-if="x.estado === 'LISTO'" class="btn-secundario" @click="exportaciones.bajar(x)"><Icono nombre="descargar" clase="size-4" /> Descargar</button>
        </li>
      </ul>
      <Paginacion :pag="pagExport" :opciones="[10, 20, 50]" />
    </section>
  </template>
</template>
