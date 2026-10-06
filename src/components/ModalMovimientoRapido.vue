<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api, mensajeError } from '@/services/api';
import { useToast } from '@/stores/toast';
import { cant, soles } from '@/utils/formato';
import { MOTIVOS, MOTIVOS_POR_TIPO, TIPOS_DOCUMENTO } from '@/utils/kardex';
import BaseModal from './BaseModal.vue';
import Icono from './Icono.vue';

/**
 * Entrada o salida de UN producto en UN almacén, sin salir del inventario.
 * Para varios productos a la vez sigue estando el formulario completo.
 */
const props = defineProps({
  abierto: Boolean,
  tipo: { type: String, default: 'ENTRADA' }, // ENTRADA | SALIDA
  /** Fila de stock: { productoId, almacenId, cantidad, costoPromedio?, producto, almacen } */
  fila: { type: Object, default: null },
  /** El usuario ve costos en ese almacén (sugiere el costo promedio) */
  verCostos: Boolean,
});
const emit = defineEmits(['cerrar', 'guardado']);
const router = useRouter();
const toast = useToast();

const esEntrada = computed(() => props.tipo === 'ENTRADA');
const f = reactive({ motivo: '', cantidad: '', costoUnitario: '', conDocumento: false, documentoTipo: '', documentoSerie: '', documentoNumero: '', fechaDocumento: '', observacion: '' });
const enviando = ref(false);
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

watch(
  () => props.abierto,
  (v) => {
    if (!v || !props.fila) return;
    Object.assign(f, {
      motivo: MOTIVOS_POR_TIPO[props.tipo][0], cantidad: '', costoUnitario: '', conDocumento: false,
      documentoTipo: esEntrada.value ? 'FACTURA' : 'BOLETA', documentoSerie: '', documentoNumero: '', fechaDocumento: hoy(), observacion: '',
    });
  },
);
// Fuera de una compra, el costo de una entrada suele ser el promedio actual
watch(() => f.motivo, (m) => {
  if (esEntrada.value && m !== 'COMPRA' && !f.costoUnitario && props.verCostos && props.fila?.costoPromedio) {
    f.costoUnitario = Number(props.fila.costoPromedio).toFixed(4);
  }
});

const actual = computed(() => Number(props.fila?.cantidad ?? 0));
const cantidad = computed(() => Number(f.cantidad) || 0);
const resultante = computed(() => (esEntrada.value ? actual.value + cantidad.value : actual.value - cantidad.value));
const unidad = computed(() => props.fila?.producto.unidad?.codigo ?? '');
const pideCosto = computed(() => esEntrada.value && f.motivo === 'COMPRA');
const error = computed(() => {
  if (!(cantidad.value > 0)) return 'Indique la cantidad';
  if (!esEntrada.value && cantidad.value > actual.value) return `Solo hay ${cant(actual.value)} ${unidad.value} en este almacén`;
  if (pideCosto.value && !(Number(f.costoUnitario) > 0)) return 'Las compras requieren el costo unitario';
  return '';
});

async function guardar() {
  if (error.value) return;
  enviando.value = true;
  try {
    const { data } = await api.post(esEntrada.value ? '/kardex/entradas' : '/kardex/salidas', {
      almacenId: props.fila.almacenId,
      motivo: f.motivo,
      observacion: f.observacion || undefined,
      ...(f.conDocumento && {
        documentoTipo: f.documentoTipo || undefined, documentoSerie: f.documentoSerie || undefined,
        documentoNumero: f.documentoNumero || undefined, fechaDocumento: f.fechaDocumento || undefined,
      }),
      items: [{
        productoId: props.fila.productoId,
        cantidad: String(f.cantidad),
        ...(esEntrada.value && f.costoUnitario !== '' && { costoUnitario: String(f.costoUnitario) }),
      }],
    });
    toast.exito(`${esEntrada.value ? 'Entrada' : 'Salida'} ${data.numero} registrada`);
    emit('guardado', data);
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    enviando.value = false;
  }
}
// Varios productos: se pasa al formulario completo con este ya cargado
function formularioCompleto() {
  emit('cerrar');
  router.push({ path: esEntrada.value ? '/movimientos/entrada' : '/movimientos/salida', query: { productoId: props.fila.productoId, almacenId: props.fila.almacenId } });
}
</script>

<template>
  <BaseModal :abierto="abierto" :titulo="esEntrada ? 'Registrar entrada' : 'Registrar salida'" @cerrar="emit('cerrar')">
    <form v-if="fila" id="form-mov-rapido" class="space-y-4" @submit.prevent="guardar">
      <!-- Producto y almacén (fijos) -->
      <div class="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
        <span class="flex size-10 shrink-0 items-center justify-center rounded-lg" :class="esEntrada ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'">
          <Icono :nombre="esEntrada ? 'entrada' : 'salida'" clase="size-5" />
        </span>
        <div class="min-w-0">
          <p class="truncate font-medium text-slate-900">{{ fila.producto.nombre }}</p>
          <p class="truncate text-xs text-slate-500"><span class="font-mono">{{ fila.producto.sku }}</span> · {{ fila.almacen.nombre }}</p>
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label class="etiqueta" for="mr-motivo">Motivo *</label>
          <select id="mr-motivo" v-model="f.motivo" class="input">
            <option v-for="m in MOTIVOS_POR_TIPO[tipo]" :key="m" :value="m">{{ MOTIVOS[m] }}</option>
          </select>
        </div>
        <div>
          <label class="etiqueta" for="mr-cant">Cantidad *</label>
          <div class="relative">
            <input id="mr-cant" v-model="f.cantidad" type="number" inputmode="decimal" min="0.0001" step="any" class="input pr-12 tabular-nums" required autofocus />
            <span class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-slate-400">{{ unidad }}</span>
          </div>
        </div>
        <div v-if="esEntrada" class="sm:col-span-2">
          <label class="etiqueta" for="mr-costo">Costo unitario {{ pideCosto ? '*' : '(opcional)' }}</label>
          <input id="mr-costo" v-model="f.costoUnitario" type="number" inputmode="decimal" min="0" step="any" class="input tabular-nums" :placeholder="pideCosto ? 'Sin IGV' : 'Por defecto, el costo promedio actual'" />
          <p v-if="cantidad && Number(f.costoUnitario)" class="mt-1 text-xs text-slate-500">Total de la entrada: {{ soles(cantidad * Number(f.costoUnitario)) }}</p>
        </div>
      </div>

      <!-- Stock antes → después -->
      <div class="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm">
        <div><p class="text-xs text-slate-500">Stock actual</p><p class="font-semibold tabular-nums">{{ cant(actual) }} <span class="text-xs font-normal text-slate-400">{{ unidad }}</span></p></div>
        <Icono nombre="abajo" clase="size-5 -rotate-90 text-slate-300" />
        <div class="text-right">
          <p class="text-xs text-slate-500">Quedará</p>
          <p class="font-semibold tabular-nums" :class="resultante < 0 ? 'text-red-600' : esEntrada && cantidad ? 'text-emerald-700' : cantidad ? 'text-indigo-700' : ''">
            {{ cant(resultante) }} <span class="text-xs font-normal text-slate-400">{{ unidad }}</span>
          </p>
        </div>
      </div>

      <div>
        <button type="button" class="btn-texto -ml-2" :aria-expanded="f.conDocumento" @click="f.conDocumento = !f.conDocumento">
          <Icono :nombre="f.conDocumento ? 'abajo' : 'agregar'" clase="size-4" /> Documento de sustento (opcional)
        </button>
        <div v-if="f.conDocumento" class="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div class="col-span-2 sm:col-span-1">
            <label class="etiqueta" for="mr-dt">Tipo</label>
            <select id="mr-dt" v-model="f.documentoTipo" class="input"><option v-for="t in TIPOS_DOCUMENTO" :key="t" :value="t">{{ t }}</option></select>
          </div>
          <div><label class="etiqueta" for="mr-ds">Serie</label><input id="mr-ds" v-model="f.documentoSerie" class="input font-mono uppercase" maxlength="10" /></div>
          <div><label class="etiqueta" for="mr-dn">Número</label><input id="mr-dn" v-model="f.documentoNumero" class="input font-mono" maxlength="20" /></div>
          <div class="col-span-2 sm:col-span-1"><label class="etiqueta" for="mr-df">Fecha</label><input id="mr-df" v-model="f.fechaDocumento" type="date" class="input" /></div>
        </div>
      </div>
      <div><label class="etiqueta" for="mr-obs">Observación</label><input id="mr-obs" v-model="f.observacion" class="input" maxlength="500" /></div>

      <p v-if="error && f.cantidad" class="text-sm text-red-600">{{ error }}</p>
      <p class="text-xs text-slate-500">
        ¿Varios productos a la vez?
        <button type="button" class="font-medium text-marca-700 hover:underline" @click="formularioCompleto">Use el formulario completo</button>
      </p>
    </form>
    <template #pie>
      <button class="btn-secundario" @click="emit('cerrar')">Cancelar</button>
      <button class="btn-primario" form="form-mov-rapido" :disabled="!!error || enviando">{{ enviando ? 'Guardando…' : esEntrada ? 'Registrar entrada' : 'Registrar salida' }}</button>
    </template>
  </BaseModal>
</template>
