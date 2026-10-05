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
import { cant, fecha, num, soles } from '@/utils/formato';
import { MOTIVOS } from '@/utils/kardex';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import BuscadorProducto from '@/components/BuscadorProducto.vue';
import Paginacion from '@/components/Paginacion.vue';
import Icono from '@/components/Icono.vue';

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
watch(() => pag.pagina, cargar);
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

const entrada = (l) => l.movimiento.tipo === 'ENTRADA';
const doc = (m) => (m.documentoNumero ? `${m.documentoSerie ?? ''}-${m.documentoNumero}` : '');
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
    <div v-if="datos?.stock" class="flex items-end gap-6 text-sm sm:col-span-2">
      <p>Saldo actual: <strong class="text-lg">{{ cant(datos.stock.cantidad) }}</strong> {{ datos.producto.unidad.codigo }}</p>
      <p v-if="costos">Valor: <strong class="text-lg">{{ soles(datos.stock.valorTotal) }}</strong></p>
    </div>
  </section>

  <p v-if="!producto" class="tarjeta border-dashed p-8 text-center text-sm text-slate-500">Elija un producto para ver su kardex.</p>
  <p v-else-if="datos && !datos.datos.length" class="tarjeta p-8 text-center text-sm text-slate-500">Sin movimientos en este almacén y periodo.</p>

  <template v-else-if="datos">
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
            <th rowspan="2" class="px-3 py-2 text-left font-medium">Movimiento</th>
            <th :colspan="costos ? 3 : 1" class="border-l border-slate-200 bg-emerald-50/60 px-3 py-2 text-center font-medium">Entradas</th>
            <th :colspan="costos ? 3 : 1" class="border-l border-slate-200 bg-orange-50/60 px-3 py-2 text-center font-medium">Salidas</th>
            <th :colspan="costos ? 3 : 1" class="border-l border-slate-200 px-3 py-2 text-center font-medium">Saldo</th>
          </tr>
          <tr class="border-b border-slate-200 text-xs">
            <template v-for="g in 3" :key="g">
              <th class="border-l border-slate-200 px-3 py-1 text-right font-medium">Cant.</th>
              <template v-if="costos">
                <th class="px-3 py-1 text-right font-medium">C. unit.</th>
                <th class="px-3 py-1 text-right font-medium">Total</th>
              </template>
            </template>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-if="datos.saldoInicial && pag.pagina === 1" class="bg-slate-50/60 text-slate-500">
            <td colspan="2" class="px-3 py-2 italic">Saldo inicial</td>
            <td :colspan="costos ? 6 : 2" class="border-l border-slate-200" />
            <td class="border-l border-slate-200 px-3 py-2 text-right">{{ cant(datos.saldoInicial.cantidad) }}</td>
            <template v-if="costos">
              <td class="px-3 py-2 text-right">{{ num(datos.saldoInicial.saldoCostoUnitario, 4) }}</td>
              <td class="px-3 py-2 text-right">{{ num(datos.saldoInicial.saldoValor) }}</td>
            </template>
          </tr>
          <tr v-for="l in datos.datos" :key="l.id" class="hover:bg-slate-50">
            <td class="px-3 py-2 whitespace-nowrap">{{ fecha(l.movimiento.fecha) }}</td>
            <td class="px-3 py-2 whitespace-nowrap">
              <RouterLink :to="`/movimientos/${l.movimiento.id}`" class="font-mono text-marca-700 hover:underline">{{ l.movimiento.numero }}</RouterLink>
              <span class="ml-1 text-xs text-slate-500">{{ MOTIVOS[l.movimiento.motivo] }} {{ doc(l.movimiento) }}</span>
            </td>
            <template v-for="lado in ['ENTRADA', 'SALIDA']" :key="lado">
              <template v-if="l.movimiento.tipo === lado">
                <td class="border-l border-slate-200 px-3 py-2 text-right">{{ cant(l.cantidad) }}</td>
                <template v-if="costos">
                  <td class="px-3 py-2 text-right">{{ num(l.costoUnitario, 4) }}</td>
                  <td class="px-3 py-2 text-right">{{ num(l.costoTotal) }}</td>
                </template>
              </template>
              <td v-else :colspan="costos ? 3 : 1" class="border-l border-slate-200" />
            </template>
            <td class="border-l border-slate-200 px-3 py-2 text-right font-medium">{{ cant(l.saldoCantidad) }}</td>
            <template v-if="costos">
              <td class="px-3 py-2 text-right">{{ num(l.saldoCostoUnitario, 4) }}</td>
              <td class="px-3 py-2 text-right font-medium">{{ num(l.saldoValor) }}</td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>
    <Paginacion :pag="pag" />
  </template>
</template>
