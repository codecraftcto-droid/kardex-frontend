<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api, mensajeError } from '@/services/api';
import { useToast } from '@/stores/toast';
import { useTiempoReal } from '@/composables/useTiempoReal';
import { cant, soles } from '@/utils/formato';
import BaseModal from './BaseModal.vue';
import TablaKardex from './TablaKardex.vue';
import Paginacion from './Paginacion.vue';
import Icono from './Icono.vue';
import BotonColumnas from './BotonColumnas.vue';
import { columnasKardex } from '@/utils/kardex';

/** Kardex de un producto en un almacén, sin salir de la pantalla actual. */
const props = defineProps({
  abierto: Boolean,
  /** { productoId, almacenId, producto, almacen } */
  fila: { type: Object, default: null },
});
const emit = defineEmits(['cerrar']);
const router = useRouter();
const toast = useToast();

const datos = ref(null);
const cargando = ref(false);
const periodo = ref('30');
const pag = reactive({ pagina: 1, porPagina: 20, total: 0, paginas: 0 });
const PERIODOS = [['30', '30 días'], ['90', '90 días'], ['365', '1 año'], ['', 'Todo']];

const desde = computed(() => {
  if (!periodo.value) return undefined;
  const d = new Date();
  d.setDate(d.getDate() - Number(periodo.value));
  return d.toISOString().slice(0, 10);
});

async function cargar() {
  if (!props.abierto || !props.fila) return;
  cargando.value = true;
  try {
    const { data } = await api.get(`/kardex/producto/${props.fila.productoId}`, {
      params: { almacenId: props.fila.almacenId, desde: desde.value, pagina: pag.pagina, porPagina: pag.porPagina },
    });
    datos.value = data;
    Object.assign(pag, { total: data.total, paginas: data.paginas });
  } catch (e) {
    toast.error(mensajeError(e));
    emit('cerrar');
  } finally {
    cargando.value = false;
  }
}
watch(() => props.abierto, (v) => {
  if (!v) return;
  datos.value = null;
  periodo.value = '30';
  pag.pagina = 1;
  cargar();
});
watch(periodo, () => (pag.pagina === 1 ? cargar() : (pag.pagina = 1)));
watch(() => [pag.pagina, pag.porPagina], cargar);
useTiempoReal('kardex:movimiento', (e) => props.abierto && e.almacenId === props.fila?.almacenId && cargar());

const resumen = computed(() => {
  const l = datos.value?.datos ?? [];
  const suma = (tipo) => l.filter((x) => x.movimiento.tipo === tipo).reduce((s, x) => s + Number(x.cantidad), 0);
  return { entradas: suma('ENTRADA'), salidas: suma('SALIDA') };
});
function paginaCompleta() {
  emit('cerrar');
  router.push({ name: 'kardex', query: { productoId: props.fila.productoId, almacenId: props.fila.almacenId } });
}
</script>

<template>
  <BaseModal :abierto="abierto" :titulo="fila ? `Kardex · ${fila.producto.nombre}` : 'Kardex'" ancho="sm:max-w-5xl" @cerrar="emit('cerrar')">
    <div v-if="fila" class="space-y-4">
      <!-- Encabezado: almacén, saldo y periodo -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-slate-500">
          <span class="font-mono text-xs">{{ fila.producto.sku }}</span> · {{ fila.almacen.nombre }}
          <template v-if="datos"> · {{ datos.verCostos ? 'con costos' : 'sin costos (no tiene permiso)' }}</template>
        </p>
        <div class="flex items-center gap-2">
        <BotonColumnas v-if="datos" clave="kardex" :columnas="columnasKardex(datos.verCostos)" />
        <div class="flex gap-1 rounded-lg bg-slate-100 p-1" role="radiogroup" aria-label="Periodo">
          <button
            v-for="[v, t] in PERIODOS"
            :key="v"
            role="radio"
            :aria-checked="periodo === v"
            class="min-h-8 rounded-md px-3 text-xs font-medium"
            :class="periodo === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'"
            @click="periodo = v"
          >{{ t }}</button>
        </div>
        </div>
      </div>

      <div v-if="datos" class="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div class="rounded-xl bg-slate-50 p-3">
          <p class="text-xs text-slate-500">Saldo actual</p>
          <p class="text-lg font-semibold tabular-nums">{{ cant(datos.stock?.cantidad ?? 0) }} <span class="text-xs font-normal text-slate-400">{{ datos.producto.unidad.codigo }}</span></p>
        </div>
        <div v-if="datos.verCostos" class="rounded-xl bg-slate-50 p-3">
          <p class="text-xs text-slate-500">Valor</p>
          <p class="text-lg font-semibold tabular-nums">{{ soles(datos.stock?.valorTotal ?? 0) }}</p>
        </div>
        <div class="rounded-xl bg-emerald-50 p-3">
          <p class="text-xs text-emerald-700">Entradas (esta página)</p>
          <p class="text-lg font-semibold text-emerald-800 tabular-nums">+{{ cant(resumen.entradas) }}</p>
        </div>
        <div class="rounded-xl bg-orange-50 p-3">
          <p class="text-xs text-orange-700">Salidas (esta página)</p>
          <p class="text-lg font-semibold text-orange-800 tabular-nums">−{{ cant(resumen.salidas) }}</p>
        </div>
      </div>

      <p v-if="!datos" class="py-10 text-center text-sm text-slate-500">Cargando kardex…</p>
      <p v-else-if="!datos.datos.length" class="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
        Sin movimientos en este periodo.
        <button v-if="periodo" class="font-medium text-marca-700 hover:underline" @click="periodo = ''">Ver todo el historial</button>
      </p>
      <template v-else>
        <TablaKardex :datos="datos" :costos="datos.verCostos" :cargando="cargando" :primera-pagina="pag.pagina === 1" />
        <Paginacion :pag="pag" :opciones="[10, 20, 50]" />
      </template>
    </div>
    <template #pie>
      <button class="btn-secundario" @click="paginaCompleta"><Icono nombre="kardex" clase="size-4" /> Abrir página completa</button>
      <button class="btn-primario" @click="emit('cerrar')">Cerrar</button>
    </template>
  </BaseModal>
</template>
