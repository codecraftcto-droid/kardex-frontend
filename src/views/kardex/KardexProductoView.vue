<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, mensajeError } from '@/services/api';
import { useExportaciones } from '@/stores/exportaciones';
import { useAuth } from '@/stores/auth';
import { useContexto } from '@/stores/contexto';
import { useToast } from '@/stores/toast';
import { useAlmacenes } from '@/composables/useAlmacenes';
import { useTiempoReal } from '@/composables/useTiempoReal';
import { cant, soles } from '@/utils/formato';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import BuscadorProducto from '@/components/BuscadorProducto.vue';
import Paginacion from '@/components/Paginacion.vue';
import Icono from '@/components/Icono.vue';
import TablaKardex from '@/components/TablaKardex.vue';
import BotonColumnas from '@/components/BotonColumnas.vue';
import { columnasKardex } from '@/utils/kardex';

const route = useRoute();
const router = useRouter();
const contexto = useContexto();
const toast = useToast();
const { almacenes } = useAlmacenes();

const producto = ref(null);
const filtros = reactive({ almacenId: route.query.almacenId || '', desde: '', hasta: '' });
const datos = ref(null);
const cargando = ref(false);
const pag = reactive({ pagina: 1, porPagina: 100, total: 0, paginas: 0 });

// Producto recibido por URL (desde Inventario, Productos o un movimiento)
watch(() => route.query.productoId, async (id) => {
  if (!id) return (producto.value = null);
  if (producto.value?.id === id) return;
  try {
    const p = (await api.get(`/productos/${id}`)).data;
    // Solo si pertenece a la empresa activa (el enlace puede venir de otra empresa)
    producto.value = p.empresaId === contexto.empresaActivaId ? p : null;
  } catch (e) {
    toast.error(mensajeError(e));
  }
}, { immediate: true });

watch(almacenes, (lista) => {
  if (!lista.some((a) => a.id === filtros.almacenId)) filtros.almacenId = lista[0]?.id ?? '';
});

function elegir(p) {
  producto.value = p;
  router.replace({ query: { ...route.query, productoId: p.id } });
}

async function cargar() {
  if (!producto.value || !filtros.almacenId) return;
  cargando.value = true;
  try {
    const { data } = await api.get(`/kardex/producto/${producto.value.id}`, {
      params: {
        almacenId: filtros.almacenId,
        desde: filtros.desde || undefined,
        hasta: filtros.hasta ? `${filtros.hasta}T23:59:59` : undefined,
        pagina: pag.pagina,
        porPagina: pag.porPagina,
      },
    });
    datos.value = data;
    Object.assign(pag, { total: data.total, paginas: data.paginas });
  } catch (e) {
    datos.value = null;
    toast.error(mensajeError(e));
  } finally {
    cargando.value = false;
  }
}
watch([producto, () => ({ ...filtros })], () => ((pag.pagina = 1), cargar()), { deep: true });
watch(() => [pag.pagina, pag.porPagina], cargar);
useTiempoReal('kardex:movimiento', (e) => e.almacenId === filtros.almacenId && cargar());

const costos = computed(() => datos.value?.verCostos);

const auth = useAuth();
const puedeExportar = computed(() => auth.canEnEmpresa('reporte.exportar', contexto.empresaActivaId));
function exportar(formato) {
  return useExportaciones().solicitar('kardex', formato, {
    empresaId: contexto.empresaActivaId,
    productoId: producto.value.id,
    almacenId: filtros.almacenId,
    desde: filtros.desde || undefined,
    hasta: filtros.hasta ? `${filtros.hasta}T23:59:59` : undefined,
  });
}

</script>

<template>
  <EncabezadoPagina titulo="Kardex por producto" :subtitulo="contexto.empresaActiva?.razonSocial">
    <template v-if="puedeExportar && producto && datos?.datos.length">
      <button class="btn-secundario" @click="exportar('xlsx')"><Icono nombre="descargar" clase="size-4" /> Excel</button>
      <button class="btn-secundario" @click="exportar('pdf')"><Icono nombre="descargar" clase="size-4" /> PDF</button>
    </template>
  </EncabezadoPagina>

  <section class="tarjeta mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
    <div class="sm:col-span-2">
      <label class="etiqueta">Producto</label>
      <div v-if="producto" class="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-marca-600 bg-marca-50 px-3">
        <span class="min-w-0 truncate text-sm"><strong>{{ producto.nombre }}</strong> <span class="font-mono text-xs text-slate-500">{{ producto.sku }}</span></span>
        <button class="btn px-2 text-slate-500" aria-label="Cambiar producto" @click="producto = null"><Icono nombre="cerrar" clase="size-4" /></button>
      </div>
      <BuscadorProducto v-else-if="contexto.empresaActivaId" :empresa-id="contexto.empresaActivaId" @seleccionar="elegir" />
    </div>
    <div class="sm:col-span-2">
      <label class="etiqueta">Almacén</label>
      <select v-model="filtros.almacenId" class="input">
        <option v-for="a in almacenes" :key="a.id" :value="a.id">{{ a.codigo }} — {{ a.nombre }}</option>
      </select>
    </div>
    <div><label class="etiqueta">Desde</label><input v-model="filtros.desde" type="date" class="input" /></div>
    <div><label class="etiqueta">Hasta</label><input v-model="filtros.hasta" type="date" class="input" /></div>
    <div v-if="datos?.stock" class="flex flex-wrap items-end gap-6 text-sm sm:col-span-2">
      <p>Saldo actual: <strong class="text-lg">{{ cant(datos.stock.cantidad) }}</strong> {{ datos.producto.unidad.codigo }}</p>
      <p v-if="costos">Valor: <strong class="text-lg">{{ soles(datos.stock.valorTotal) }}</strong></p>
      <BotonColumnas class="ml-auto" clave="kardex" :columnas="columnasKardex(costos)" />
    </div>
  </section>

  <p v-if="!producto" class="tarjeta border-dashed p-8 text-center text-sm text-slate-500">Elija un producto para ver su kardex.</p>
  <p v-else-if="datos && !datos.datos.length" class="tarjeta p-8 text-center text-sm text-slate-500">Sin movimientos en este almacén y periodo.</p>

  <template v-else-if="datos">
    <TablaKardex :datos="datos" :costos="costos" :cargando="cargando" :primera-pagina="pag.pagina === 1" />
    <Paginacion :pag="pag" />
  </template>
</template>
