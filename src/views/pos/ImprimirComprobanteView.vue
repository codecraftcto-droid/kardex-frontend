<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api, mensajeError } from '@/services/api';
import { cant, fecha, fechaHora, num } from '@/utils/formato';
import { MEDIOS_PAGO, MOTIVOS_NC, TIPOS_DOCUMENTO } from '@/utils/pos';

/**
 * Representación impresa del comprobante en ticket (80 mm) o A4.
 * Se abre en una pestaña aparte y lanza la impresión del navegador al cargar.
 */
const route = useRoute();
const ticket = computed(() => route.params.formato === 'ticket');
const c = ref(null);
const error = ref('');
let estilo;

const TITULO = {
  FACTURA: 'FACTURA ELECTRÓNICA',
  BOLETA: 'BOLETA DE VENTA ELECTRÓNICA',
  NOTA_CREDITO: 'NOTA DE CRÉDITO ELECTRÓNICA',
  NOTA_VENTA: 'NOTA DE VENTA',
};
const pagos = computed(() => (c.value?.pagos ?? []).map((p) => ({ ...p, monto: Math.abs(Number(p.monto)) })));
const empresaNombre = computed(() => c.value?.empresa.nombreComercial || c.value?.empresa.razonSocial);
const direccion = computed(() => c.value?.caja.almacen.sede.direccion || c.value?.empresa.direccion);
const credito = computed(() => c.value?.formaPago === 'CREDITO');
const docCliente = computed(() => (c.value?.clienteTipoDocumento === 'SIN_DOCUMENTO' ? '' : `${TIPOS_DOCUMENTO[c.value.clienteTipoDocumento]}: ${c.value.clienteNumeroDocumento}`));

onMounted(async () => {
  // Tamaño de página según el formato (la impresora térmica usa rollo de 80 mm)
  estilo = document.createElement('style');
  estilo.textContent = ticket.value
    ? '@page { size: 80mm auto; margin: 0 } body { background: #fff !important }'
    : '@page { size: A4; margin: 12mm } body { background: #fff !important }';
  document.head.appendChild(estilo);
  try {
    c.value = (await api.get(`/pos/comprobantes/${route.params.id}`)).data;
    document.title = `${c.value.numeroCompleto} — ${c.value.nombreTipo}`;
    await nextTick();
    // Espera a que el QR esté dibujado antes de imprimir
    const img = document.querySelector('img[data-qr]');
    if (img && !img.complete) await new Promise((r) => (img.onload = img.onerror = r));
    setTimeout(() => window.print(), 150);
  } catch (e) {
    error.value = mensajeError(e, 'No se pudo cargar el comprobante');
  }
});
onBeforeUnmount(() => estilo?.remove());
const imprimir = () => window.print();
const cerrar = () => window.close();
</script>

<template>
  <div class="min-h-dvh bg-white text-black">
    <div class="no-print flex items-center justify-center gap-2 border-b border-slate-200 bg-slate-50 p-3">
      <button class="btn-primario" @click="imprimir">Imprimir</button>
      <button class="btn-secundario" @click="cerrar">Cerrar</button>
    </div>
    <p v-if="error" class="p-6 text-center text-red-600">{{ error }}</p>

    <!-- ═════════ TICKET 80 mm ═════════ -->
    <article v-else-if="c && ticket" class="ticket mx-auto px-[3mm] py-[4mm] font-mono text-[11px] leading-snug">
      <header class="text-center">
        <p class="text-[13px] font-bold">{{ empresaNombre }}</p>
        <p v-if="c.empresa.nombreComercial">{{ c.empresa.razonSocial }}</p>
        <p>RUC {{ c.empresa.ruc }}</p>
        <p v-if="direccion">{{ direccion }}</p>
        <p class="mt-2 font-bold">{{ TITULO[c.tipo] }}</p>
        <p class="font-bold">{{ c.numeroCompleto }}</p>
      </header>
      <hr />
      <p>Fecha: {{ fechaHora(c.fechaEmision) }}</p>
      <p>Cliente: {{ c.clienteNombre }}</p>
      <p v-if="docCliente">{{ docCliente }}</p>
      <p v-if="c.clienteDireccion">Dir.: {{ c.clienteDireccion }}</p>
      <p v-if="c.tipo !== 'NOTA_CREDITO'">Forma de pago: {{ credito ? 'CRÉDITO' : 'CONTADO' }}</p>
      <p v-if="c.referencia">Modifica: {{ c.referencia.serie }}-{{ String(c.referencia.numero).padStart(8, '0') }} · {{ MOTIVOS_NC[c.motivoCodigo] }}</p>
      <hr />
      <div v-for="d in c.detalles" :key="d.id" class="mb-1">
        <p>{{ d.descripcion }}</p>
        <p class="flex justify-between"><span>{{ cant(d.cantidad) }} {{ d.unidadCodigo }} x {{ num(d.precioUnitario, 2) }}<template v-if="Number(d.descuento)"> − {{ num(d.descuento, 2) }}</template></span><span>{{ num(d.total, 2) }}</span></p>
      </div>
      <hr />
      <p class="flex justify-between"><span>Op. gravada</span><span>{{ num(c.opGravada, 2) }}</span></p>
      <p v-if="Number(c.opExonerada)" class="flex justify-between"><span>Op. exonerada</span><span>{{ num(c.opExonerada, 2) }}</span></p>
      <p v-if="Number(c.opInafecta)" class="flex justify-between"><span>Op. inafecta</span><span>{{ num(c.opInafecta, 2) }}</span></p>
      <p v-if="Number(c.descuentoTotal)" class="flex justify-between"><span>Descuentos</span><span>{{ num(c.descuentoTotal, 2) }}</span></p>
      <p class="flex justify-between"><span>IGV 18%</span><span>{{ num(c.igv, 2) }}</span></p>
      <p class="flex justify-between text-[13px] font-bold"><span>TOTAL S/</span><span>{{ num(c.total, 2) }}</span></p>
      <p class="mt-1">{{ c.montoEnLetras }}</p>
      <hr />
      <p v-for="p in pagos" :key="p.id" class="flex justify-between"><span>{{ c.tipo === 'NOTA_CREDITO' ? 'Reembolso ' : '' }}{{ MEDIOS_PAGO[p.medio] }}</span><span>{{ num(p.monto, 2) }}</span></p>
      <p v-if="c.montoRecibido" class="flex justify-between"><span>Recibido</span><span>{{ num(c.montoRecibido, 2) }}</span></p>
      <p v-if="Number(c.vuelto)" class="flex justify-between"><span>Vuelto</span><span>{{ num(c.vuelto, 2) }}</span></p>
      <template v-if="credito">
        <p class="flex justify-between font-bold"><span>Monto al crédito</span><span>{{ num(c.montoCredito, 2) }}</span></p>
        <p v-for="k in c.cuotas" :key="k.numero" class="flex justify-between"><span>Cuota {{ k.numero }} · vence {{ fecha(k.fechaVencimiento) }}</span><span>{{ num(k.monto, 2) }}</span></p>
      </template>
      <p v-if="Number(c.aplicadoASaldo)" class="flex justify-between"><span>Aplicado a la deuda</span><span>{{ num(c.aplicadoASaldo, 2) }}</span></p>
      <p class="mt-1">Atendido por: {{ c.cajero }} · {{ c.caja.nombre }}</p>
      <div v-if="c.qr" class="mt-2 flex justify-center"><img data-qr :src="c.qr" alt="Código QR" class="size-[30mm]" /></div>
      <footer class="mt-2 text-center">
        <p v-if="c.tipo === 'NOTA_VENTA'">Documento interno: no es un comprobante de pago.</p>
        <template v-else>
          <p>Representación impresa de la {{ TITULO[c.tipo].toLowerCase() }}.</p>
          <p v-if="c.estadoSunat === 'PENDIENTE'" class="font-bold">PENDIENTE DE ENVÍO A SUNAT</p>
        </template>
        <p v-if="c.estado === 'ANULADO'" class="mt-1 text-[14px] font-bold">*** ANULADO ***</p>
        <p class="mt-2">¡Gracias por su compra!</p>
      </footer>
    </article>

    <!-- ═════════ A4 ═════════ -->
    <article v-else-if="c" class="a4 relative mx-auto max-w-[190mm] p-[8mm] text-[12px] leading-snug sm:p-0 print:p-0">
      <p v-if="c.estado === 'ANULADO'" class="pointer-events-none absolute inset-x-0 top-1/3 -rotate-12 text-center text-[64px] font-bold text-red-600/25">ANULADO</p>
      <header class="flex items-start justify-between gap-6">
        <div class="min-w-0">
          <p class="text-[18px] font-bold">{{ empresaNombre }}</p>
          <p v-if="c.empresa.nombreComercial">{{ c.empresa.razonSocial }}</p>
          <p v-if="direccion">{{ direccion }}</p>
          <p v-if="c.caja.almacen.sede.nombre" class="text-slate-600">{{ c.caja.almacen.sede.nombre }}</p>
        </div>
        <div class="w-[70mm] shrink-0 rounded-md border-2 border-black p-3 text-center">
          <p class="font-bold">RUC {{ c.empresa.ruc }}</p>
          <p class="my-1 bg-black py-1 font-bold text-white">{{ TITULO[c.tipo] }}</p>
          <p class="text-[15px] font-bold">{{ c.numeroCompleto }}</p>
        </div>
      </header>

      <section class="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 rounded-md border border-slate-400 p-3">
        <span class="font-semibold">Cliente:</span><span>{{ c.clienteNombre }}</span>
        <template v-if="docCliente"><span class="font-semibold">Documento:</span><span>{{ docCliente }}</span></template>
        <template v-if="c.clienteDireccion"><span class="font-semibold">Dirección:</span><span>{{ c.clienteDireccion }}</span></template>
        <span class="font-semibold">Fecha de emisión:</span><span>{{ fechaHora(c.fechaEmision) }}</span>
        <span class="font-semibold">Moneda:</span><span>Soles</span>
        <template v-if="c.tipo !== 'NOTA_CREDITO'"><span class="font-semibold">Forma de pago:</span><span>{{ credito ? 'Crédito' : 'Contado' }}</span></template>
        <template v-if="c.referencia">
          <span class="font-semibold">Documento que modifica:</span>
          <span>{{ c.referencia.serie }}-{{ String(c.referencia.numero).padStart(8, '0') }} · Motivo {{ c.motivoCodigo }}: {{ c.motivoDescripcion || MOTIVOS_NC[c.motivoCodigo] }}</span>
        </template>
      </section>

      <table class="mt-4 w-full border-collapse">
        <thead>
          <tr class="border-y-2 border-black text-left">
            <th class="py-1.5 pr-2">Cant.</th><th class="py-1.5 pr-2">Und.</th><th class="py-1.5 pr-2">Descripción</th>
            <th class="py-1.5 pr-2 text-right">V. unit.</th><th class="py-1.5 pr-2 text-right">P. unit.</th><th class="py-1.5 pr-2 text-right">Dscto.</th><th class="py-1.5 text-right">Importe</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in c.detalles" :key="d.id" class="border-b border-slate-300 align-top">
            <td class="py-1.5 pr-2">{{ cant(d.cantidad) }}</td><td class="py-1.5 pr-2">{{ d.unidadCodigo }}</td><td class="py-1.5 pr-2">{{ d.descripcion }}</td>
            <td class="py-1.5 pr-2 text-right">{{ num(d.valorUnitario, 4) }}</td><td class="py-1.5 pr-2 text-right">{{ num(d.precioUnitario, 2) }}</td>
            <td class="py-1.5 pr-2 text-right">{{ Number(d.descuento) ? num(d.descuento, 2) : '' }}</td><td class="py-1.5 text-right">{{ num(d.total, 2) }}</td>
          </tr>
        </tbody>
      </table>

      <section class="mt-4 flex items-start justify-between gap-6">
        <div class="min-w-0 flex-1 space-y-2">
          <p class="font-semibold">{{ c.montoEnLetras }}</p>
          <p v-if="pagos.length">
            <span class="font-semibold">{{ c.tipo === 'NOTA_CREDITO' ? 'Reembolso:' : 'Forma de pago:' }}</span>
            {{ pagos.map((p) => `${MEDIOS_PAGO[p.medio]} S/ ${num(p.monto, 2)}`).join(' · ') }}
          </p>
          <div v-if="credito">
            <p><span class="font-semibold">Monto neto pendiente de pago:</span> S/ {{ num(c.montoCredito, 2) }}<template v-if="pagos.length"> (inicial S/ {{ num(Number(c.total) - Number(c.montoCredito), 2) }})</template></p>
            <table class="mt-1 border-collapse text-[11px]">
              <thead><tr class="border-b border-black"><th class="pr-4 text-left">Cuota</th><th class="pr-4 text-left">Vencimiento</th><th class="text-right">Monto</th></tr></thead>
              <tbody><tr v-for="k in c.cuotas" :key="k.numero"><td class="pr-4">{{ k.numero }}</td><td class="pr-4">{{ fecha(k.fechaVencimiento) }}</td><td class="text-right">S/ {{ num(k.monto, 2) }}</td></tr></tbody>
            </table>
          </div>
          <p v-if="Number(c.aplicadoASaldo)"><span class="font-semibold">Aplicado a la deuda del comprobante:</span> S/ {{ num(c.aplicadoASaldo, 2) }}</p>
          <div class="flex items-center gap-3">
            <img v-if="c.qr" data-qr :src="c.qr" alt="Código QR" class="size-[28mm]" />
            <div class="text-[11px] text-slate-700">
              <p v-if="c.tipo === 'NOTA_VENTA'">Documento interno: no es un comprobante de pago.</p>
              <template v-else>
                <p>Representación impresa de la {{ TITULO[c.tipo].toLowerCase() }}.</p>
                <p v-if="c.estadoSunat === 'PENDIENTE'" class="font-bold text-black">Pendiente de envío a SUNAT.</p>
              </template>
              <p>Atendido por {{ c.cajero }} · {{ c.caja.nombre }}</p>
            </div>
          </div>
        </div>
        <table class="w-[70mm] shrink-0">
          <tbody>
            <tr><td class="py-0.5">Op. gravada</td><td class="text-right">S/ {{ num(c.opGravada, 2) }}</td></tr>
            <tr v-if="Number(c.opExonerada)"><td class="py-0.5">Op. exonerada</td><td class="text-right">S/ {{ num(c.opExonerada, 2) }}</td></tr>
            <tr v-if="Number(c.opInafecta)"><td class="py-0.5">Op. inafecta</td><td class="text-right">S/ {{ num(c.opInafecta, 2) }}</td></tr>
            <tr v-if="Number(c.descuentoTotal)"><td class="py-0.5">Descuentos</td><td class="text-right">S/ {{ num(c.descuentoTotal, 2) }}</td></tr>
            <tr><td class="py-0.5">IGV 18%</td><td class="text-right">S/ {{ num(c.igv, 2) }}</td></tr>
            <tr class="border-t-2 border-black text-[14px] font-bold"><td class="py-1">TOTAL</td><td class="text-right">S/ {{ num(c.total, 2) }}</td></tr>
          </tbody>
        </table>
      </section>
    </article>
  </div>
</template>

<style scoped>
.ticket { width: 80mm; }
.ticket hr { border: 0; border-top: 1px dashed #000; margin: 2mm 0; }
@media print {
  .no-print { display: none !important; }
}
</style>
