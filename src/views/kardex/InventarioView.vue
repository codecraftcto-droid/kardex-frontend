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
watch(() => pag.pagina, cargar);
onMounted(cargar);
// Cualquier movimiento en un almacén visible actualiza la tabla sin recargar
useTiempoReal(['kardex:movimiento', 'stock:cambio'], () => cargar());

const verCostos = computed(() => resumen.value?.valorTotal != null);
const columnas = computed(() => [
  { clave: 'producto.nombre', titulo: 'Producto' },
  { clave: 'almacen.nombre', titulo: 'Almacén' },
  { clave: 'cantidad', titulo: 'Stock', clase: 'text-right' },
  { clave: 'limites', titulo: 'Mín / Máx', clase: 'text-right' },
  { clave: 'estado', titulo: 'Estado' },
  ...(verCostos.value
    ? [
        { clave: 'costoPromedio', titulo: 'Costo unit.', clase: 'text-right' },
        { clave: 'valorTotal', titulo: 'Valor', clase: 'text-right' },
      ]
    : []),
]);

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

  <div class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
    <div class="tarjeta p-4">
      <p class="text-sm text-slate-500">Registros de stock</p>
      <p class="text-2xl font-semibold">{{ pag.total }}</p>
    </div>
    <div v-if="verCostos" class="tarjeta p-4">
      <p class="text-sm text-slate-500">Valor del inventario</p>
      <p class="text-2xl font-semibold">{{ soles(resumen.valorTotal) }}</p>
    </div>
  </div>

  <div class="mb-4 grid gap-2 sm:grid-cols-[1fr_16rem_auto]">
    <CampoBusqueda v-model="filtros.q" placeholder="Producto, SKU o código de barras" />
    <select v-model="filtros.almacenId" class="input">
      <option value="">Todos los almacenes</option>
      <option v-for="a in almacenes" :key="a.id" :value="a.id">{{ a.codigo }} — {{ a.nombre }}</option>
    </select>
    <label class="btn-secundario cursor-pointer" :class="{ 'border-red-300 bg-red-50 text-red-700': filtros.bajoMinimo }">
      <input v-model="filtros.bajoMinimo" type="checkbox" class="sr-only" />
      <Icono nombre="alerta" clase="size-4" /> Solo bajo mínimo
    </label>
  </div>

  <TablaResponsiva :columnas="columnas" :filas="filas" :cargando="cargando" vacio="No hay stock registrado con estos filtros">
    <template #celda-producto.nombre="{ fila }">
      <span class="font-medium">{{ fila.producto.nombre }}</span>
      <p class="font-mono text-xs text-slate-400">{{ fila.producto.sku }}</p>
    </template>
    <template #celda-almacen.nombre="{ fila }">{{ fila.almacen.codigo }} — {{ fila.almacen.nombre }}</template>
    <template #celda-cantidad="{ fila }">
      <span class="font-semibold tabular-nums">{{ cant(fila.cantidad) }}</span>
      <span class="ml-1 text-xs text-slate-400">{{ fila.producto.unidad.codigo }}</span>
    </template>
    <template #celda-limites="{ fila }">
      <span class="tabular-nums text-slate-500">{{ cant(fila.stockMinimo) }} / {{ cant(fila.stockMaximo) }}</span>
    </template>
    <template #celda-estado="{ fila }">
      <span class="insignia" :class="estadoStock(fila).clase">{{ estadoStock(fila).texto }}</span>
    </template>
    <template #celda-costoPromedio="{ fila }"><span class="tabular-nums">{{ num(fila.costoPromedio, 4) }}</span></template>
    <template #celda-valorTotal="{ fila }"><span class="tabular-nums">{{ soles(fila.valorTotal) }}</span></template>
    <template #acciones="{ fila }">
      <RouterLink :to="{ name: 'kardex', query: { productoId: fila.productoId, almacenId: fila.almacenId } }" class="btn-texto">
        <Icono nombre="kardex" clase="size-4" /> Kardex
      </RouterLink>
      <button v-if="puedeLimites(fila)" class="btn-texto" @click="abrirLimites(fila)">Límites</button>
    </template>
  </TablaResponsiva>
  <Paginacion :pag="pag" />

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
