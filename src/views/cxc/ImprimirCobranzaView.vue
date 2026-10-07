<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { usarHojaImpresion } from '@/utils/impresion';
import { api, mensajeError } from '@/services/api';
import { fecha, fechaHora, num } from '@/utils/formato';
import { MEDIOS_PAGO, TIPOS_DOCUMENTO } from '@/utils/pos';

/** Recibo de cobranza en ticket (80 mm) o A4: el comprobante de que el cliente pagó a cuenta. */
const route = useRoute();
const ticket = computed(() => route.params.formato === 'ticket');
const k = ref(null);
const error = ref('');
let quitarHoja;

onMounted(async () => {
  quitarHoja = usarHojaImpresion(ticket.value, '15mm');
  try {
    k.value = (await api.get(`/cxc/cobranzas/${route.params.id}`)).data;
    document.title = `Recibo de cobranza Nº ${k.value.numero}`;
    await nextTick();
    setTimeout(() => window.print(), 150);
  } catch (e) {
    error.value = mensajeError(e, 'No se pudo cargar la cobranza');
  }
});
onBeforeUnmount(() => quitarHoja?.());
const imprimir = () => window.print();
const cerrar = () => window.close();
const empresa = computed(() => k.value?.empresa.nombreComercial || k.value?.empresa.razonSocial);
const doc = computed(() => (k.value ? `${TIPOS_DOCUMENTO[k.value.cliente.tipoDocumento]} ${k.value.cliente.numeroDocumento}` : ''));
</script>

<template>
  <div class="min-h-dvh bg-white text-black">
    <div class="no-print flex items-center justify-center gap-2 border-b border-slate-200 bg-slate-50 p-3">
      <button class="btn-primario" @click="imprimir">Imprimir</button>
      <button class="btn-secundario" @click="cerrar">Cerrar</button>
    </div>
    <p v-if="error" class="p-6 text-center text-red-600">{{ error }}</p>
    <article v-else-if="k" :class="ticket ? 'ticket mx-auto px-[3mm] py-[4mm] font-mono text-[11px] leading-snug' : 'relative mx-auto max-w-[180mm] p-[8mm] text-[13px] print:p-0'">
      <p v-if="k.estado === 'ANULADA'" class="text-center text-[16px] font-bold">*** ANULADO ***</p>
      <header :class="ticket ? 'text-center' : 'mb-4 flex items-start justify-between gap-6'">
        <div>
          <p class="font-bold" :class="ticket ? 'text-[13px]' : 'text-[18px]'">{{ empresa }}</p>
          <p v-if="k.empresa.nombreComercial">{{ k.empresa.razonSocial }}</p>
          <p>RUC {{ k.empresa.ruc }}</p>
          <p v-if="k.empresa.direccion">{{ k.empresa.direccion }}</p>
        </div>
        <div :class="ticket ? 'mt-2' : 'w-[60mm] shrink-0 rounded-md border-2 border-black p-3 text-center'">
          <p class="font-bold">RECIBO DE COBRANZA</p>
          <p class="font-bold">Nº {{ String(k.numero).padStart(6, '0') }}</p>
        </div>
      </header>
      <hr />
      <p>Fecha: {{ fechaHora(k.fecha) }}</p>
      <p>Cliente: {{ k.cliente.nombre }}</p>
      <p>{{ doc }}</p>
      <p>A cuenta de: {{ k.comprobante.numeroCompleto }} ({{ fechaHora(k.comprobante.fechaEmision) }})</p>
      <hr />
      <p class="flex justify-between"><span>Medio</span><span>{{ MEDIOS_PAGO[k.medio] }}{{ k.referencia ? ` · ${k.referencia}` : '' }}</span></p>
      <p v-if="k.saldoAnterior != null" class="flex justify-between"><span>Saldo anterior</span><span>{{ num(k.saldoAnterior, 2) }}</span></p>
      <p class="flex justify-between font-bold" :class="ticket ? 'text-[13px]' : 'text-[16px]'"><span>IMPORTE PAGADO S/</span><span>{{ num(k.monto, 2) }}</span></p>
      <p v-if="k.saldoDespues != null" class="flex justify-between"><span>Saldo pendiente</span><span>{{ num(k.saldoDespues, 2) }}</span></p>
      <template v-if="k.cuotasPagadas?.length">
        <p class="mt-1 font-bold">Aplicado a:</p>
        <p v-for="q in k.cuotasPagadas" :key="q.numero" class="flex justify-between gap-2">
          <span>Cuota {{ q.numero }}/{{ q.total }} (vence {{ fecha(q.fechaVencimiento) }})</span>
          <span>{{ num(q.paga, 2) }} · {{ Number(q.queda) ? `debe ${num(q.queda, 2)}` : 'pagada' }}</span>
        </p>
      </template>
      <p class="mt-1">{{ k.montoEnLetras }}</p>
      <p v-if="k.observacion" class="mt-1">Obs.: {{ k.observacion }}</p>
      <p v-if="k.estado === 'ANULADA'" class="mt-1">Anulado el {{ fechaHora(k.anuladoEn) }}: {{ k.motivoAnulacion }}</p>
      <hr />
      <p>Recibió: {{ k.usuario }}</p>
      <p class="mt-2 text-center">Este recibo no es un comprobante de pago SUNAT.</p>
      <div class="mt-10 grid grid-cols-2 gap-6 text-center">
        <p class="border-t border-black pt-1">Recibí conforme</p>
        <p class="border-t border-black pt-1">Cliente</p>
      </div>
    </article>
  </div>
</template>

<style scoped>
.ticket { width: 80mm; }
hr { border: 0; border-top: 1px dashed #000; margin: 2mm 0; }
@media print { .no-print { display: none !important; } }
</style>
