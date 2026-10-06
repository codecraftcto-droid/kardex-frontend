<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api, mensajeError } from '@/services/api';
import { useAuth } from '@/stores/auth';
import { useToast } from '@/stores/toast';
import { useTiempoReal } from '@/composables/useTiempoReal';
import { cant, fecha, fechaHora, num, soles } from '@/utils/formato';
import { MOTIVOS, estiloTipo } from '@/utils/kardex';
import BaseModal from './BaseModal.vue';
import TablaResponsiva from './TablaResponsiva.vue';
import Icono from './Icono.vue';

/**
 * Detalle de un movimiento de kardex en un modal (desde el listado de Movimientos).
 * Los enlaces a otros movimientos (anulación / anulado por) se abren en el mismo modal.
 */
const props = defineProps({
  abierto: Boolean,
  movimientoId: { type: String, default: null },
});
const emit = defineEmits(['cerrar', 'cambio']);
const router = useRouter();
const auth = useAuth();
const toast = useToast();

const actualId = ref(null);
const m = ref(null);
const cargando = ref(false);
async function cargar(id = actualId.value) {
  if (!id) return;
  actualId.value = id;
  cargando.value = true;
  try {
    m.value = (await api.get(`/kardex/movimientos/${id}`)).data;
  } catch (e) {
    toast.error(mensajeError(e));
    emit('cerrar');
  } finally {
    cargando.value = false;
  }
}
watch(() => props.abierto, (v) => {
  if (!v) return;
  m.value = null;
  anulacion.activa = false;
  cargar(props.movimientoId);
});
useTiempoReal('kardex:movimiento', (e) => props.abierto && e.almacenId === m.value?.almacenId && cargar());

const columnas = computed(() => [
  { clave: 'producto.nombre', titulo: 'Producto' },
  { clave: 'cantidad', titulo: 'Cantidad', clase: 'text-right' },
  ...(m.value?.verCostos
    ? [
        { clave: 'costoUnitario', titulo: 'Costo unit.', clase: 'text-right' },
        { clave: 'costoTotal', titulo: 'Costo total', clase: 'text-right' },
      ]
    : []),
  { clave: 'saldoCantidad', titulo: 'Saldo', clase: 'text-right' },
]);
const total = computed(() => m.value?.detalles.reduce((s, d) => s + Number(d.costoTotal || 0), 0));
const unidades = computed(() => m.value?.detalles.reduce((s, d) => s + Number(d.cantidad || 0), 0));
const esEntrada = computed(() => m.value?.tipo === 'ENTRADA');

const puedeAnular = computed(
  () =>
    m.value &&
    m.value.motivo !== 'ANULACION' &&
    !m.value.documentoComercial &&
    !m.value.comprobante &&
    !m.value.transferencia &&
    !m.value.anuladoPor &&
    auth.can('kardex.movimiento.anular', { empresaId: m.value.empresaId, sedeId: m.value.sedeId, almacenId: m.value.almacenId }),
);
const anulacion = reactive({ activa: false, observacion: '', enviando: false });
async function anular() {
  anulacion.enviando = true;
  try {
    const { data } = await api.post(`/kardex/movimientos/${m.value.id}/anular`, { observacion: anulacion.observacion });
    toast.exito(`Movimiento anulado con ${data.numero}`);
    anulacion.activa = false;
    emit('cambio');
    await cargar(data.id); // muestra el movimiento inverso recién creado
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    anulacion.enviando = false;
  }
}
function irA(ruta) {
  emit('cerrar');
  router.push(ruta);
}
const documento = computed(() => (m.value?.documentoNumero ? `${m.value.documentoTipo ?? ''} ${m.value.documentoSerie ?? ''}-${m.value.documentoNumero}`.trim() : '—'));
</script>

<template>
  <BaseModal :abierto="abierto" :titulo="m ? `${esEntrada ? 'Entrada' : 'Salida'} ${m.numero}` : 'Movimiento'" ancho="sm:max-w-4xl" @cerrar="emit('cerrar')">
    <p v-if="!m" class="py-10 text-center text-sm text-slate-500">Cargando movimiento…</p>

    <div v-else class="space-y-4" :class="{ 'opacity-60': cargando }">
      <!-- Resumen -->
      <div class="flex flex-wrap items-center gap-3">
        <span class="flex size-10 shrink-0 items-center justify-center rounded-xl" :class="esEntrada ? 'bg-emerald-50 text-emerald-700' : 'bg-indigo-50 text-indigo-700'">
          <Icono :nombre="esEntrada ? 'entrada' : 'salida'" clase="size-5" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="flex flex-wrap items-center gap-2">
            <span class="insignia" :class="estiloTipo(m.tipo)">{{ esEntrada ? 'Entrada' : 'Salida' }}</span>
            <span class="font-medium text-slate-900">{{ MOTIVOS[m.motivo] }}</span>
            <span v-if="m.anuladoPor" class="insignia bg-red-50 text-red-700">Anulado</span>
          </p>
          <p class="text-xs text-slate-500">{{ fechaHora(m.fecha) }} · {{ m.usuario.nombres }}</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-slate-500">{{ m.detalles.length }} producto(s) · {{ cant(unidades) }} unid.</p>
          <p v-if="m.verCostos" class="text-lg font-semibold tabular-nums">{{ soles(total) }}</p>
        </div>
      </div>

      <!-- Avisos de origen / anulación -->
      <p v-if="m.anuladoPor" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        Anulado el {{ fechaHora(m.anuladoPor.fecha) }} por
        <button class="font-medium underline" @click="cargar(m.anuladoPor.id)">{{ m.anuladoPor.numero }}</button>.
      </p>
      <p v-if="m.anula" class="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
        Movimiento inverso que anula a <button class="font-medium underline" @click="cargar(m.anula.id)">{{ m.anula.numero }}</button>.
      </p>
      <p v-if="m.documentoComercial" class="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">
        Generado al confirmar la {{ m.documentoComercial.tipo === 'COMPRA' ? 'compra' : 'venta' }}
        <button class="font-medium underline" @click="irA(`/${m.documentoComercial.tipo === 'COMPRA' ? 'compras' : 'ventas'}/${m.documentoComercial.id}`)">
          {{ m.documentoComercial.serie }}-{{ m.documentoComercial.numero }}</button>; para revertirlo, anule el documento.
      </p>
      <p v-if="m.comprobante" class="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">
        Generado por {{ m.comprobante.tipo === 'NOTA_CREDITO' ? 'la nota de crédito' : 'el comprobante' }}
        <button class="font-mono font-medium underline" @click="irA(`/comprobantes/${m.comprobante.id}`)">{{ m.comprobante.serie }}-{{ String(m.comprobante.numero).padStart(8, '0') }}</button>
        de la caja; para revertirlo, anule el comprobante (en su turno) o emita una nota de crédito.
      </p>
      <p v-if="m.transferencia" class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Movimiento de la transferencia <button class="font-medium underline" @click="irA(`/transferencias/${m.transferencia.id}`)">{{ m.transferencia.numero }}</button>.
      </p>

      <!-- Datos -->
      <dl class="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl bg-slate-50 p-4 text-sm lg:grid-cols-4">
        <div><dt class="text-xs text-slate-500">Almacén</dt><dd class="font-medium">{{ m.almacen.codigo }} — {{ m.almacen.nombre }}</dd><dd class="text-xs text-slate-400">{{ m.almacen.sede.nombre }}</dd></div>
        <div><dt class="text-xs text-slate-500">Documento</dt><dd class="font-medium">{{ documento }}</dd><dd v-if="m.fechaDocumento" class="text-xs text-slate-400">{{ fecha(m.fechaDocumento) }}</dd></div>
        <div><dt class="text-xs text-slate-500">Valorización</dt><dd class="font-medium">{{ m.metodoValorizacion === 'PEPS' ? 'PEPS' : 'Promedio ponderado' }}</dd></div>
        <div><dt class="text-xs text-slate-500">Registrado por</dt><dd class="font-medium">{{ m.usuario.nombres }}</dd></div>
        <div v-if="m.observacion" class="col-span-2 lg:col-span-4"><dt class="text-xs text-slate-500">Observación</dt><dd>{{ m.observacion }}</dd></div>
      </dl>

      <!-- Productos -->
      <TablaResponsiva selector clave-columnas="movimiento" :columnas="columnas" :filas="m.detalles">
        <template #celda-producto.nombre="{ fila }">
          <button class="text-left font-medium text-marca-700 hover:underline" @click="irA({ name: 'kardex', query: { productoId: fila.producto.id, almacenId: m.almacenId } })">
            {{ fila.producto.nombre }}
          </button>
          <p class="font-mono text-xs text-slate-400">{{ fila.producto.sku }}</p>
        </template>
        <template #celda-cantidad="{ fila }"><span class="whitespace-nowrap tabular-nums">{{ cant(fila.cantidad) }} <span class="text-xs text-slate-400">{{ fila.producto.unidad.codigo }}</span></span></template>
        <template #celda-costoUnitario="{ fila }"><span class="tabular-nums">{{ num(fila.costoUnitario, 4) }}</span></template>
        <template #celda-costoTotal="{ fila }"><span class="tabular-nums">{{ soles(fila.costoTotal) }}</span></template>
        <template #celda-saldoCantidad="{ fila }"><span class="text-slate-500 tabular-nums">{{ cant(fila.saldoCantidad) }}</span></template>
      </TablaResponsiva>

      <!-- Anulación (dentro del mismo modal) -->
      <form v-if="anulacion.activa" id="form-anular-mov" class="space-y-3 rounded-xl border border-red-200 bg-red-50/50 p-4" @submit.prevent="anular">
        <p class="text-sm text-slate-700">
          El kardex no se borra: se registrará un movimiento <strong>{{ esEntrada ? 'de salida' : 'de entrada' }}</strong>
          por las mismas cantidades y costos, que revierte este.
        </p>
        <div>
          <label class="etiqueta" for="obs-anular">Motivo de la anulación *</label>
          <textarea id="obs-anular" v-model="anulacion.observacion" class="input py-2" rows="2" minlength="5" maxlength="500" required />
        </div>
      </form>
    </div>

    <template #pie>
      <template v-if="anulacion.activa">
        <button class="btn-secundario" @click="anulacion.activa = false">Volver</button>
        <button class="btn-peligro" form="form-anular-mov" :disabled="anulacion.enviando || anulacion.observacion.trim().length < 5">
          {{ anulacion.enviando ? 'Anulando…' : 'Registrar anulación' }}
        </button>
      </template>
      <template v-else>
        <button v-if="puedeAnular" class="btn-secundario mr-auto text-red-600 hover:bg-red-50" @click="(anulacion.observacion = ''), (anulacion.activa = true)">
          <Icono nombre="cerrar" clase="size-4" /> Anular movimiento
        </button>
        <button v-if="m" class="btn-secundario" @click="irA(`/movimientos/${m.id}`)">Abrir página completa</button>
        <button class="btn-primario" @click="emit('cerrar')">Cerrar</button>
      </template>
    </template>
  </BaseModal>
</template>
