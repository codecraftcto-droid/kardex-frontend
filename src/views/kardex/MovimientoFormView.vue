<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, mensajeError } from '@/services/api';
import { useContexto } from '@/stores/contexto';
import { useToast } from '@/stores/toast';
import { useAlmacenes } from '@/composables/useAlmacenes';
import { cant, soles } from '@/utils/formato';
import { MOTIVOS, MOTIVOS_POR_TIPO, TIPOS_DOCUMENTO } from '@/utils/kardex';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import BuscadorProducto from '@/components/BuscadorProducto.vue';
import Icono from '@/components/Icono.vue';

const route = useRoute();
const router = useRouter();
const contexto = useContexto();
const toast = useToast();
const { almacenes, conPermiso } = useAlmacenes();

const tipo = computed(() => route.meta.tipo);
const esEntrada = computed(() => tipo.value === 'ENTRADA');
const permiso = computed(() => (esEntrada.value ? 'kardex.entrada.crear' : 'kardex.salida.crear'));
const almacenesPermitidos = computed(() => conPermiso(permiso.value));

const nuevo = () => ({
  almacenId: '',
  motivo: MOTIVOS_POR_TIPO[tipo.value][0],
  documentoTipo: esEntrada.value ? 'FACTURA' : 'BOLETA',
  documentoSerie: '',
  documentoNumero: '',
  fechaDocumento: new Date().toISOString().slice(0, 10),
  observacion: '',
});
const form = reactive(nuevo());
const items = ref([]);
const stock = ref(new Map());
const enviando = ref(false);

// Primer almacén permitido por defecto
watch(almacenesPermitidos, (lista) => {
  if (!lista.some((a) => a.id === form.almacenId)) form.almacenId = lista[0]?.id ?? '';
}, { immediate: true });

watch(tipo, () => {
  Object.assign(form, nuevo(), { almacenId: almacenesPermitidos.value[0]?.id ?? '' });
  items.value = [];
});

/** Stock disponible del almacén elegido (para validar salidas y sugerir costos). */
watch(() => form.almacenId, async (almacenId) => {
  stock.value = new Map();
  if (!almacenId) return;
  const { data } = await api.get('/kardex/stock', { params: { empresaId: contexto.empresaActivaId, almacenId, porPagina: 200 } });
  stock.value = new Map(data.datos.map((s) => [s.productoId, s]));
}, { immediate: true });

const disponible = (productoId) => Number(stock.value.get(productoId)?.cantidad ?? 0);

function agregar(producto) {
  const existente = items.value.find((i) => i.producto.id === producto.id);
  if (existente) {
    existente.cantidad = String(Number(existente.cantidad || 0) + 1);
    return toast.info(`${producto.nombre}: cantidad +1`);
  }
  const costoSugerido = stock.value.get(producto.id)?.costoPromedio;
  items.value.push({
    producto,
    cantidad: '1',
    costoUnitario: esEntrada.value && form.motivo !== 'COMPRA' && costoSugerido ? Number(costoSugerido).toFixed(4) : '',
  });
}
const quitar = (i) => items.value.splice(i, 1);

const excede = (it) => !esEntrada.value && Number(it.cantidad) > disponible(it.producto.id);
const total = computed(() => items.value.reduce((s, it) => s + Number(it.cantidad || 0) * Number(it.costoUnitario || 0), 0));
const requiereCosto = computed(() => esEntrada.value && form.motivo === 'COMPRA');
const valido = computed(
  () =>
    form.almacenId &&
    items.value.length &&
    items.value.every((it) => Number(it.cantidad) > 0 && !excede(it) && (!requiereCosto.value || it.costoUnitario !== '')),
);

async function guardar() {
  enviando.value = true;
  try {
    const { data } = await api.post(esEntrada.value ? '/kardex/entradas' : '/kardex/salidas', {
      ...form,
      fechaDocumento: form.fechaDocumento || undefined,
      items: items.value.map((it) => ({
        productoId: it.producto.id,
        cantidad: String(it.cantidad),
        ...(esEntrada.value && it.costoUnitario !== '' && { costoUnitario: String(it.costoUnitario) }),
      })),
    });
    toast.exito(`${esEntrada.value ? 'Entrada' : 'Salida'} ${data.numero} registrada`);
    // Las alertas de stock llegan en tiempo real (AppLayout), no se duplican aquí
    router.push(`/movimientos/${data.id}`);
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <form class="space-y-5" @submit.prevent="guardar">
    <EncabezadoPagina :titulo="esEntrada ? 'Nueva entrada' : 'Nueva salida'" :subtitulo="contexto.empresaActiva?.razonSocial">
      <template #antes>
        <RouterLink to="/movimientos" class="mb-1 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <Icono nombre="atras" clase="size-4" /> Movimientos
        </RouterLink>
      </template>
    </EncabezadoPagina>

    <p v-if="almacenes.length && !almacenesPermitidos.length" class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
      No tiene permiso para registrar {{ esEntrada ? 'entradas' : 'salidas' }} en ningún almacén de esta empresa.
    </p>

    <section class="tarjeta grid gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
      <div class="sm:col-span-2">
        <label class="etiqueta" for="alm">Almacén *</label>
        <select id="alm" v-model="form.almacenId" class="input" required>
          <option v-for="a in almacenesPermitidos" :key="a.id" :value="a.id">{{ a.codigo }} — {{ a.nombre }} ({{ a.sede.nombre }})</option>
        </select>
      </div>
      <div class="sm:col-span-2">
        <label class="etiqueta" for="mot">Motivo *</label>
        <select id="mot" v-model="form.motivo" class="input">
          <option v-for="mo in MOTIVOS_POR_TIPO[tipo]" :key="mo" :value="mo">{{ MOTIVOS[mo] }}</option>
        </select>
      </div>
      <div>
        <label class="etiqueta" for="dt">Documento</label>
        <select id="dt" v-model="form.documentoTipo" class="input">
          <option v-for="d in TIPOS_DOCUMENTO" :key="d" :value="d">{{ d }}</option>
        </select>
      </div>
      <div class="grid grid-cols-[5rem_1fr] gap-2">
        <div><label class="etiqueta" for="ser">Serie</label><input id="ser" v-model="form.documentoSerie" class="input uppercase" maxlength="10" /></div>
        <div><label class="etiqueta" for="numd">Número</label><input id="numd" v-model="form.documentoNumero" class="input" inputmode="numeric" maxlength="20" /></div>
      </div>
      <div>
        <label class="etiqueta" for="fd">Fecha del documento</label>
        <input id="fd" v-model="form.fechaDocumento" type="date" class="input" />
      </div>
      <div>
        <label class="etiqueta" for="obs">Observación</label>
        <input id="obs" v-model="form.observacion" class="input" maxlength="500" />
      </div>
    </section>

    <section class="space-y-3">
      <h2 class="font-semibold">Productos</h2>
      <BuscadorProducto v-if="contexto.empresaActivaId" :empresa-id="contexto.empresaActivaId" escaneo-continuo @seleccionar="agregar" />

      <p v-if="!items.length" class="tarjeta border-dashed p-6 text-center text-sm text-slate-500">
        Busque por nombre o SKU, o escanee el código de barras.
      </p>

      <ul class="space-y-3">
        <li v-for="(it, i) in items" :key="it.producto.id" class="tarjeta p-4" :class="{ 'border-red-300': excede(it) }">
          <div class="mb-3 flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="font-medium">{{ it.producto.nombre }}</p>
              <p class="text-xs text-slate-500">
                <span class="font-mono">{{ it.producto.sku }}</span> · Disponible:
                <strong :class="excede(it) ? 'text-red-600' : ''">{{ cant(disponible(it.producto.id)) }} {{ it.producto.unidad.codigo }}</strong>
              </p>
            </div>
            <button type="button" class="btn shrink-0 px-2 text-red-600 hover:bg-red-50" aria-label="Quitar producto" @click="quitar(i)">
              <Icono nombre="eliminar" />
            </button>
          </div>
          <div class="grid gap-3" :class="esEntrada ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-3'">
            <div>
              <label class="etiqueta">Cantidad ({{ it.producto.unidad.codigo }})</label>
              <input v-model="it.cantidad" type="number" inputmode="decimal" min="0.0001" step="any" class="input min-h-12 text-lg tabular-nums" required />
            </div>
            <div v-if="esEntrada">
              <label class="etiqueta">Costo unit. (S/){{ requiereCosto ? ' *' : '' }}</label>
              <input
                v-model="it.costoUnitario"
                type="number"
                inputmode="decimal"
                min="0"
                step="any"
                class="input min-h-12 text-lg tabular-nums"
                :required="requiereCosto"
                :placeholder="requiereCosto ? '' : 'Promedio'"
              />
            </div>
            <div v-if="esEntrada && it.costoUnitario !== ''" class="col-span-2 self-end text-right text-sm text-slate-500 sm:col-span-1 sm:pb-3">
              Subtotal: <strong class="text-slate-800">{{ soles(Number(it.cantidad || 0) * Number(it.costoUnitario || 0)) }}</strong>
            </div>
          </div>
          <p v-if="excede(it)" class="mt-2 text-sm text-red-600">La cantidad supera el stock disponible.</p>
        </li>
      </ul>
    </section>

    <!-- Barra de confirmación fija: alcanzable con el pulgar en móvil -->
    <div class="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border lg:bottom-4">
      <div class="flex items-center justify-between gap-3">
        <div class="text-sm">
          <p>{{ items.length }} producto(s)</p>
          <p v-if="esEntrada && total > 0" class="font-semibold">{{ soles(total) }}</p>
        </div>
        <button class="btn-primario min-h-12 px-6 text-base" :disabled="!valido || enviando">
          {{ enviando ? 'Registrando…' : `Registrar ${esEntrada ? 'entrada' : 'salida'}` }}
        </button>
      </div>
    </div>
  </form>
</template>
