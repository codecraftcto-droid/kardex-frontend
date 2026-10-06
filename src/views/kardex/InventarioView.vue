<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api, mensajeError } from '@/services/api';
import { useAuth } from '@/stores/auth';
import { useContexto } from '@/stores/contexto';
import { useToast } from '@/stores/toast';
import { useTiempoReal } from '@/composables/useTiempoReal';
import { useAlmacenes } from '@/composables/useAlmacenes';
import { cant, num, soles } from '@/utils/formato';
import { estadoStock } from '@/utils/kardex';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import TablaResponsiva from '@/components/TablaResponsiva.vue';
import Paginacion from '@/components/Paginacion.vue';
import CampoBusqueda from '@/components/CampoBusqueda.vue';
import BaseModal from '@/components/BaseModal.vue';
import Icono from '@/components/Icono.vue';
import MenuAcciones from '@/components/MenuAcciones.vue';
import ModalMovimientoRapido from '@/components/ModalMovimientoRapido.vue';
import ModalKardex from '@/components/ModalKardex.vue';
import EstadoStock from '@/components/EstadoStock.vue';
import BotonColumnas from '@/components/BotonColumnas.vue';

const route = useRoute();
const auth = useAuth();
const contexto = useContexto();
const toast = useToast();
const { almacenes } = useAlmacenes();

const filas = ref([]);
const resumen = ref(null);
const cargando = ref(false);
const filtros = reactive({ q: '', almacenId: '', bajoMinimo: route.query.bajoMinimo === '1' });
const pag = reactive({ pagina: 1, porPagina: 50, total: 0, paginas: 0 });

async function cargar() {
  if (!contexto.empresaActivaId) return;
  cargando.value = true;
  try {
    const { data } = await api.get('/kardex/stock', {
      params: {
        empresaId: contexto.empresaActivaId,
        almacenId: filtros.almacenId || undefined,
        q: filtros.q || undefined,
        bajoMinimo: filtros.bajoMinimo ? 'true' : undefined,
        pagina: pag.pagina,
        porPagina: pag.porPagina,
      },
    });
    filas.value = data.datos;
    resumen.value = data.resumen;
    Object.assign(pag, { total: data.total, paginas: data.paginas });
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    cargando.value = false;
  }
}

let t;
watch(() => ({ ...filtros }), () => {
  clearTimeout(t);
  t = setTimeout(() => ((pag.pagina = 1), cargar()), 300);
});
watch(() => [pag.pagina, pag.porPagina], cargar);
onMounted(() => (cargar(), cargarIndicadores()));

/** Indicadores del almacén elegido (no dependen de la búsqueda ni del filtro "bajo mínimo"). */
const indicadores = ref(null);
async function cargarIndicadores() {
  if (!contexto.empresaActivaId) return;
  const base = { empresaId: contexto.empresaActivaId, almacenId: filtros.almacenId || undefined, porPagina: 1 };
  try {
    const [todo, bajos] = await Promise.all([
      api.get('/kardex/stock', { params: base }),
      api.get('/kardex/stock', { params: { ...base, bajoMinimo: 'true' } }),
    ]);
    indicadores.value = { registros: todo.data.total, valor: todo.data.resumen?.valorTotal ?? null, bajoMinimo: bajos.data.total };
  } catch { indicadores.value = null; }
}
watch(() => filtros.almacenId, cargarIndicadores);
// Cualquier movimiento en un almacén visible actualiza la tabla sin recargar
useTiempoReal(['kardex:movimiento', 'stock:cambio'], () => (cargar(), cargarIndicadores()));

const verCostos = computed(() => resumen.value?.valorTotal != null);
const columnas = computed(() => [
  { clave: 'producto.nombre', titulo: 'Producto' },
  { clave: 'almacen.nombre', titulo: 'Almacén' },
  { clave: 'cantidad', titulo: 'Stock', clase: 'text-right' },
  { clave: 'limites', titulo: 'Mín / Máx', clase: 'text-right', ocultarEnTarjeta: true },
  { clave: 'estado', titulo: 'Estado' },
  ...(verCostos.value
    ? [
        { clave: 'costoPromedio', titulo: 'Costo unit.', clase: 'text-right' },
        { clave: 'valorTotal', titulo: 'Valor', clase: 'text-right' },
      ]
    : []),
]);


// ── Entrada / salida rápida (modal) ──
const rapido = reactive({ abierto: false, tipo: 'ENTRADA', fila: null });
const kardex = reactive({ abierto: false, fila: null });
const abrirRapido = (tipo, fila) => Object.assign(rapido, { abierto: true, tipo, fila });
function movimientoGuardado() {
  rapido.abierto = false;
  cargar();
  cargarIndicadores();
}

// ── Nivel de stock: barra respecto del máximo (o del doble del mínimo) ──
const TONO = {
  'Bajo mínimo': { barra: 'bg-red-500' },
  'Sobre máximo': { barra: 'bg-amber-500' },
  'Sin stock': { barra: 'bg-slate-300' },
  Normal: { barra: 'bg-emerald-500' },
};
function nivel(f) {
  const c = Number(f.cantidad);
  const tope = f.stockMaximo != null ? Number(f.stockMaximo) : f.stockMinimo != null ? Number(f.stockMinimo) * 2 : null;
  return tope ? Math.max(c > 0 ? 3 : 0, Math.min(100, Math.round((c / tope) * 100))) : null;
}
const iniciales = (n) => n.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

/** Acciones de cada fila (solo las permitidas en ese almacén). */
function acciones(f) {
  const r = { empresaId: f.empresaId, sedeId: f.sedeId, almacenId: f.almacenId };
  const q = { productoId: f.productoId, almacenId: f.almacenId };
  return [
    { texto: 'Ver kardex', icono: 'kardex', alHacer: () => Object.assign(kardex, { abierto: true, fila: f }) },
    auth.can('kardex.entrada.crear', r) && { texto: 'Registrar entrada', icono: 'entrada', alHacer: () => abrirRapido('ENTRADA', f) },
    auth.can('kardex.salida.crear', r) && Number(f.cantidad) > 0 && { texto: 'Registrar salida', icono: 'salida', alHacer: () => abrirRapido('SALIDA', f) },
    puedeLimites(f) && { separador: true },
    puedeLimites(f) && { texto: 'Ajustar mínimo y máximo', icono: 'editar', alHacer: () => abrirLimites(f) },
  ];
}

// ── Límites mínimo / máximo ──
const limites = reactive({ abierto: false, fila: null, min: '', max: '' });
const puedeLimites = (f) => auth.can('almacenes.almacen.editar', { empresaId: f.empresaId, sedeId: f.sedeId, almacenId: f.almacenId });
function abrirLimites(f) {
  Object.assign(limites, { abierto: true, fila: f, min: f.stockMinimo ?? '', max: f.stockMaximo ?? '' });
}
async function guardarLimites() {
  try {
    await api.put('/kardex/stock/limites', {
      almacenId: limites.fila.almacenId,
      productoId: limites.fila.productoId,
      stockMinimo: limites.min === '' ? null : String(limites.min),
      stockMaximo: limites.max === '' ? null : String(limites.max),
    });
    toast.exito('Límites actualizados');
    limites.abierto = false;
    cargar();
    cargarIndicadores();
  } catch (e) {
    toast.error(mensajeError(e));
  }
}
</script>

<template>
  <EncabezadoPagina titulo="Inventario" :subtitulo="contexto.empresaActiva?.razonSocial">
    <RouterLink v-if="auth.canEnEmpresa('kardex.entrada.crear', contexto.empresaActivaId)" to="/movimientos/entrada" class="btn-secundario">
      <Icono nombre="entrada" /> Entrada
    </RouterLink>
    <RouterLink v-if="auth.canEnEmpresa('kardex.salida.crear', contexto.empresaActivaId)" to="/movimientos/salida" class="btn-secundario">
      <Icono nombre="salida" /> Salida
    </RouterLink>
  </EncabezadoPagina>

  <!-- Indicadores -->
  <section class="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3" aria-label="Resumen del inventario">
    <div class="tarjeta p-4">
      <div class="flex items-center justify-between gap-2">
        <p class="text-xs text-slate-500 sm:text-sm">Productos en stock</p>
        <span class="flex size-8 items-center justify-center rounded-lg bg-marca-50 text-marca-700 sm:size-9"><Icono nombre="inventario" clase="size-5" /></span>
      </div>
      <p class="mt-2 text-xl font-semibold tracking-tight text-slate-900 tabular-nums sm:text-2xl">{{ indicadores?.registros ?? '—' }}</p>
      <p class="mt-0.5 text-xs text-slate-500">{{ filtros.almacenId ? 'en el almacén elegido' : 'en todos sus almacenes' }}</p>
    </div>
    <div v-if="indicadores?.valor != null" class="tarjeta p-4">
      <div class="flex items-center justify-between gap-2">
        <p class="text-xs text-slate-500 sm:text-sm">Valor del inventario</p>
        <span class="flex size-8 items-center justify-center rounded-lg bg-sky-50 text-sky-700 sm:size-9"><Icono nombre="kardex" clase="size-5" /></span>
      </div>
      <p class="mt-2 text-xl font-semibold tracking-tight text-slate-900 tabular-nums sm:text-2xl">{{ soles(indicadores.valor) }}</p>
      <p class="mt-0.5 text-xs text-slate-500">{{ contexto.empresaActiva?.metodoValorizacion === 'PEPS' ? 'Valorizado por PEPS' : 'Valorizado a costo promedio' }}</p>
    </div>
    <button
      v-if="indicadores"
      type="button"
      class="tarjeta col-span-2 p-4 text-left transition hover:shadow-md lg:col-span-1"
      :class="filtros.bajoMinimo ? 'border-red-300 ring-2 ring-red-100' : 'hover:border-slate-300'"
      :aria-pressed="filtros.bajoMinimo"
      @click="filtros.bajoMinimo = !filtros.bajoMinimo"
    >
      <span class="flex items-center justify-between gap-2">
        <span class="text-xs text-slate-500 sm:text-sm">Bajo stock mínimo</span>
        <span class="flex size-8 items-center justify-center rounded-lg sm:size-9" :class="indicadores.bajoMinimo ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'">
          <Icono :nombre="indicadores.bajoMinimo ? 'alerta' : 'check'" clase="size-5" />
        </span>
      </span>
      <span class="mt-2 block text-xl font-semibold tracking-tight text-slate-900 tabular-nums sm:text-2xl">{{ indicadores.bajoMinimo }}</span>
      <span class="mt-0.5 block text-xs" :class="indicadores.bajoMinimo ? 'font-medium text-red-600' : 'text-slate-500'">
        {{ filtros.bajoMinimo ? 'Mostrando solo estos · clic para ver todos' : indicadores.bajoMinimo ? 'Clic para ver cuáles reponer' : 'Todo sobre el mínimo' }}
      </span>
    </button>
  </section>

  <!-- Filtros -->
  <div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
    <div class="min-w-0 flex-1"><CampoBusqueda v-model="filtros.q" placeholder="Buscar por producto, SKU o código de barras" /></div>
    <select v-model="filtros.almacenId" class="input sm:w-64" aria-label="Almacén">
      <option value="">Todos los almacenes</option>
      <option v-for="a in almacenes" :key="a.id" :value="a.id">{{ a.codigo }} — {{ a.nombre }}</option>
    </select>
    <button
      type="button"
      class="btn shrink-0 border"
      :class="filtros.bajoMinimo ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'"
      :aria-pressed="filtros.bajoMinimo"
      @click="filtros.bajoMinimo = !filtros.bajoMinimo"
    >
      <Icono nombre="alerta" clase="size-4" /> Solo bajo mínimo
      <Icono v-if="filtros.bajoMinimo" nombre="cerrar" clase="size-3.5" />
    </button>
    <BotonColumnas :columnas="columnas" />
  </div>

  <TablaResponsiva :columnas="columnas" :filas="filas" :cargando="cargando" vacio="No hay stock registrado con estos filtros">
    <template #celda-producto.nombre="{ fila }">
      <div class="flex min-w-0 items-center gap-3">
        <span class="hidden size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-500 md:flex" aria-hidden="true">{{ iniciales(fila.producto.nombre) }}</span>
        <span class="min-w-0">
          <RouterLink :to="{ name: 'kardex', query: { productoId: fila.productoId, almacenId: fila.almacenId } }" class="block truncate font-medium text-slate-900 hover:text-marca-700 hover:underline">{{ fila.producto.nombre }}</RouterLink>
          <span class="block font-mono text-xs text-slate-400">{{ fila.producto.sku }}</span>
        </span>
      </div>
    </template>
    <template #celda-almacen.nombre="{ fila }">
      <span class="whitespace-nowrap"><span class="font-mono text-xs text-slate-400">{{ fila.almacen.codigo }}</span> {{ fila.almacen.nombre }}</span>
    </template>
    <template #celda-cantidad="{ fila }">
      <div class="inline-flex flex-col items-end gap-1">
        <span class="whitespace-nowrap"><span class="font-semibold text-slate-900 tabular-nums">{{ cant(fila.cantidad) }}</span><span class="ml-1 text-xs text-slate-400">{{ fila.producto.unidad.codigo }}</span></span>
        <span v-if="nivel(fila) !== null" class="hidden h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 md:block" aria-hidden="true">
          <span class="block h-full rounded-full" :class="TONO[estadoStock(fila).texto].barra" :style="{ width: `${nivel(fila)}%` }" />
        </span>
      </div>
    </template>
    <template #celda-limites="{ fila }">
      <span class="whitespace-nowrap text-slate-500 tabular-nums">{{ fila.stockMinimo != null ? cant(fila.stockMinimo) : '—' }} <span class="text-slate-300">/</span> {{ fila.stockMaximo != null ? cant(fila.stockMaximo) : '—' }}</span>
    </template>
    <template #celda-estado="{ fila }"><EstadoStock :fila="fila" /></template>
    <template #celda-costoPromedio="{ fila }"><span class="text-slate-600 tabular-nums">{{ num(fila.costoPromedio, 4) }}</span></template>
    <template #celda-valorTotal="{ fila }"><span class="font-medium tabular-nums">{{ soles(fila.valorTotal) }}</span></template>
    <template #acciones="{ fila }">
      <MenuAcciones :acciones="acciones(fila)" :etiqueta="`Acciones para ${fila.producto.nombre} en ${fila.almacen.nombre}`" />
    </template>
  </TablaResponsiva>
  <Paginacion :pag="pag" />

  <ModalKardex :abierto="kardex.abierto" :fila="kardex.fila" @cerrar="kardex.abierto = false" />

  <ModalMovimientoRapido
    :abierto="rapido.abierto"
    :tipo="rapido.tipo"
    :fila="rapido.fila"
    :ver-costos="verCostos"
    @cerrar="rapido.abierto = false"
    @guardado="movimientoGuardado"
  />

  <BaseModal :abierto="limites.abierto" titulo="Stock mínimo y máximo" @cerrar="limites.abierto = false">
    <form v-if="limites.fila" id="form-limites" class="space-y-4" @submit.prevent="guardarLimites">
      <p class="text-sm text-slate-600">
        <strong>{{ limites.fila.producto.nombre }}</strong> en {{ limites.fila.almacen.nombre }}.
        Cuando el stock baje del mínimo se enviará una alerta en tiempo real.
      </p>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="etiqueta">Mínimo</label><input v-model="limites.min" type="number" inputmode="decimal" min="0" step="any" class="input" /></div>
        <div><label class="etiqueta">Máximo</label><input v-model="limites.max" type="number" inputmode="decimal" min="0" step="any" class="input" /></div>
      </div>
    </form>
    <template #pie>
      <button class="btn-secundario" @click="limites.abierto = false">Cancelar</button>
      <button class="btn-primario" form="form-limites">Guardar</button>
    </template>
  </BaseModal>
</template>
