<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, mensajeError } from '@/services/api';
import { useAuth } from '@/stores/auth';
import { useToast } from '@/stores/toast';
import { useTiempoReal } from '@/composables/useTiempoReal';
import { cant, fecha, fechaHora, num, soles } from '@/utils/formato';
import { MOTIVOS, estiloTipo } from '@/utils/kardex';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import TablaResponsiva from '@/components/TablaResponsiva.vue';
import BaseModal from '@/components/BaseModal.vue';
import Icono from '@/components/Icono.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const toast = useToast();
const m = ref(null);

async function cargar() {
  try {
    m.value = (await api.get(`/kardex/movimientos/${route.params.id}`)).data;
  } catch (e) {
    toast.error(mensajeError(e));
    router.replace('/movimientos');
  }
}
watch(() => route.params.id, (id) => id && cargar(), { immediate: true });
useTiempoReal('kardex:movimiento', (e) => e.almacenId === m.value?.almacenId && cargar());

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
const anulacion = reactive({ abierto: false, observacion: '', enviando: false });
async function anular() {
  anulacion.enviando = true;
  try {
    const { data } = await api.post(`/kardex/movimientos/${m.value.id}/anular`, { observacion: anulacion.observacion });
    toast.exito(`Movimiento anulado con ${data.numero}`);
    anulacion.abierto = false;
    router.push(`/movimientos/${data.id}`);
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    anulacion.enviando = false;
  }
}
</script>

<template>
  <div v-if="m" class="space-y-5">
    <EncabezadoPagina :titulo="`${m.tipo === 'ENTRADA' ? 'Entrada' : 'Salida'} ${m.numero}`" :subtitulo="MOTIVOS[m.motivo]">
      <template #antes>
        <RouterLink to="/movimientos" class="mb-1 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <Icono nombre="atras" clase="size-4" /> Movimientos
        </RouterLink>
      </template>
      <button v-if="puedeAnular" class="btn-peligro" @click="(anulacion.observacion = ''), (anulacion.abierto = true)">Anular</button>
    </EncabezadoPagina>

    <p v-if="m.anuladoPor" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      Este movimiento fue anulado el {{ fechaHora(m.anuladoPor.fecha) }} por
      <RouterLink :to="`/movimientos/${m.anuladoPor.id}`" class="font-medium underline">{{ m.anuladoPor.numero }}</RouterLink>.
    </p>
    <p v-if="m.documentoComercial" class="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">
      Generado al confirmar la {{ m.documentoComercial.tipo === 'COMPRA' ? 'compra' : 'venta' }}
      <RouterLink :to="`/${m.documentoComercial.tipo === 'COMPRA' ? 'compras' : 'ventas'}/${m.documentoComercial.id}`" class="font-medium underline">
        {{ m.documentoComercial.serie }}-{{ m.documentoComercial.numero }}</RouterLink>; para revertirlo, anule el documento.
    </p>
    <p v-if="m.comprobante" class="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">
      Generado por {{ m.comprobante.tipo === 'NOTA_CREDITO' ? 'la nota de crédito' : 'el comprobante' }}
      <RouterLink :to="`/comprobantes/${m.comprobante.id}`" class="font-mono font-medium underline">{{ m.comprobante.serie }}-{{ String(m.comprobante.numero).padStart(8, '0') }}</RouterLink>
      de la caja; para revertirlo, anule el comprobante (en su turno) o emita una nota de crédito.
    </p>
    <p v-if="m.transferencia" class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
      Movimiento de la transferencia
      <RouterLink :to="`/transferencias/${m.transferencia.id}`" class="font-medium underline">{{ m.transferencia.numero }}</RouterLink>.
    </p>
    <p v-if="m.anula" class="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
      Movimiento inverso que anula a
      <RouterLink :to="`/movimientos/${m.anula.id}`" class="font-medium underline">{{ m.anula.numero }}</RouterLink>.
    </p>

    <section class="tarjeta p-4 sm:p-5">
      <dl class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt class="text-slate-500">Tipo</dt><dd><span class="insignia" :class="estiloTipo(m.tipo)">{{ m.tipo === 'ENTRADA' ? 'Entrada' : 'Salida' }}</span></dd></div>
        <div><dt class="text-slate-500">Fecha de registro</dt><dd>{{ fechaHora(m.fecha) }}</dd></div>
        <div><dt class="text-slate-500">Almacén</dt><dd>{{ m.almacen.codigo }} — {{ m.almacen.nombre }} <span class="text-slate-400">({{ m.almacen.sede.nombre }})</span></dd></div>
        <div><dt class="text-slate-500">Valorización</dt><dd>{{ m.metodoValorizacion === 'PEPS' ? 'PEPS' : 'Promedio ponderado' }}</dd></div>
        <div><dt class="text-slate-500">Documento</dt><dd>{{ m.documentoNumero ? `${m.documentoTipo ?? ''} ${m.documentoSerie ?? ''}-${m.documentoNumero}` : '—' }}</dd></div>
        <div><dt class="text-slate-500">Fecha del documento</dt><dd>{{ fecha(m.fechaDocumento) }}</dd></div>
        <div><dt class="text-slate-500">Registrado por</dt><dd>{{ m.usuario.nombres }}</dd></div>
        <div v-if="m.observacion" class="sm:col-span-2 lg:col-span-4"><dt class="text-slate-500">Observación</dt><dd>{{ m.observacion }}</dd></div>
      </dl>
    </section>

    <TablaResponsiva selector :columnas="columnas" :filas="m.detalles">
      <template #celda-producto.nombre="{ fila }">
        <RouterLink :to="{ name: 'kardex', query: { productoId: fila.producto.id, almacenId: m.almacenId } }" class="font-medium text-marca-700 hover:underline">
          {{ fila.producto.nombre }}
        </RouterLink>
        <p class="font-mono text-xs text-slate-400">{{ fila.producto.sku }}</p>
      </template>
      <template #celda-cantidad="{ fila }"><span class="tabular-nums">{{ cant(fila.cantidad) }} {{ fila.producto.unidad.codigo }}</span></template>
      <template #celda-costoUnitario="{ fila }"><span class="tabular-nums">{{ num(fila.costoUnitario, 4) }}</span></template>
      <template #celda-costoTotal="{ fila }"><span class="tabular-nums">{{ soles(fila.costoTotal) }}</span></template>
      <template #celda-saldoCantidad="{ fila }"><span class="tabular-nums text-slate-500">{{ cant(fila.saldoCantidad) }}</span></template>
    </TablaResponsiva>
    <p v-if="m.verCostos" class="text-right text-sm">Total: <strong>{{ soles(total) }}</strong></p>

    <BaseModal :abierto="anulacion.abierto" :titulo="`Anular ${m.numero}`" @cerrar="anulacion.abierto = false">
      <form id="form-anular" class="space-y-3" @submit.prevent="anular">
        <p class="text-sm text-slate-600">
          El kardex es inmutable: se registrará un movimiento <strong>{{ m.tipo === 'ENTRADA' ? 'de salida' : 'de entrada' }}</strong>
          por las mismas cantidades y costos que revierte este documento.
        </p>
        <div>
          <label class="etiqueta" for="obs">Motivo de la anulación *</label>
          <textarea id="obs" v-model="anulacion.observacion" class="input py-2" rows="3" minlength="5" maxlength="500" required />
        </div>
      </form>
      <template #pie>
        <button class="btn-secundario" @click="anulacion.abierto = false">Cancelar</button>
        <button class="btn-peligro" form="form-anular" :disabled="anulacion.enviando">Registrar anulación</button>
      </template>
    </BaseModal>
  </div>
  <p v-else class="text-sm text-slate-500">Cargando…</p>
</template>
