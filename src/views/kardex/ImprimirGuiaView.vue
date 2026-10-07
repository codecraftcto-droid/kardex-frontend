<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { usarHojaImpresion } from '@/utils/impresion';
import { api, mensajeError } from '@/services/api';
import { cant, fecha, fechaHora, num } from '@/utils/formato';
import { TIPOS_DOCUMENTO } from '@/utils/pos';

/** Representación impresa de la guía de remisión electrónica remitente (A4 o ticket 80 mm). */
const route = useRoute();
const ticket = computed(() => route.params.formato === 'ticket');
const g = ref(null);
const error = ref('');
let quitarHoja;

onMounted(async () => {
  quitarHoja = usarHojaImpresion(ticket.value, '12mm');
  try {
    g.value = (await api.get(`/guias/${route.params.id}`)).data;
    document.title = `Guía de remisión ${g.value.numeroCompleto}`;
    await nextTick();
    const img = document.querySelector('img[data-qr]');
    if (img && !img.complete) await new Promise((r) => (img.onload = img.onerror = r));
    setTimeout(() => window.print(), 150);
  } catch (e) {
    error.value = mensajeError(e, 'No se pudo cargar la guía');
  }
});
onBeforeUnmount(() => quitarHoja?.());
const imprimir = () => window.print();
const cerrar = () => window.close();
const empresa = computed(() => g.value?.empresa.nombreComercial || g.value?.empresa.razonSocial);
const transporte = computed(() => (g.value?.modalidad === 'PUBLICO' ? 'Transporte público' : 'Transporte privado'));
const leyenda = computed(() => ({
  PENDIENTE: 'PENDIENTE DE ENVÍO A SUNAT', ENVIADO: 'ENVIADA A SUNAT, EN ESPERA DE RESPUESTA', RECHAZADO: 'RECHAZADA POR SUNAT – SIN VALIDEZ',
}[g.value?.estadoSunat] ?? null));
</script>

<template>
  <div class="min-h-dvh bg-white text-black">
    <div class="no-print flex items-center justify-center gap-2 border-b border-slate-200 bg-slate-50 p-3">
      <button class="btn-primario" @click="imprimir">Imprimir</button>
      <button class="btn-secundario" @click="cerrar">Cerrar</button>
    </div>
    <p v-if="error" class="p-6 text-center text-red-600">{{ error }}</p>

    <!-- Ticket 80 mm -->
    <article v-else-if="g && ticket" class="ticket mx-auto px-[3mm] py-[4mm] font-mono text-[11px] leading-snug">
      <header class="text-center">
        <p class="text-[13px] font-bold">{{ empresa }}</p>
        <p>RUC {{ g.empresa.ruc }}</p>
        <p class="mt-2 font-bold">GUÍA DE REMISIÓN ELECTRÓNICA REMITENTE</p>
        <p class="font-bold">{{ g.numeroCompleto }}</p>
      </header>
      <hr />
      <p>Emisión: {{ fechaHora(g.fechaEmision) }}</p>
      <p>Inicio traslado: {{ fecha(g.fechaTraslado) }}</p>
      <p>Motivo: {{ g.motivoTexto }}</p>
      <p>Destinatario: {{ g.destinatarioNombre }}</p>
      <p>{{ TIPOS_DOCUMENTO[g.destinatarioTipoDoc] }}: {{ g.destinatarioNumDoc }}</p>
      <hr />
      <p class="font-bold">Partida ({{ g.partidaUbigeo }})</p><p>{{ g.partidaDireccion }}</p>
      <p class="mt-1 font-bold">Llegada ({{ g.llegadaUbigeo }})</p><p>{{ g.llegadaDireccion }}</p>
      <hr />
      <p>{{ transporte }}</p>
      <template v-if="g.modalidad === 'PUBLICO'"><p>{{ g.transportistaNombre }} · RUC {{ g.transportistaRuc }}</p></template>
      <template v-else><p>Conductor: {{ g.conductorNombres }} {{ g.conductorApellidos }}</p><p>DNI {{ g.conductorNumDoc }} · Lic. {{ g.conductorLicencia }}</p><p>Placa: {{ g.vehiculoPlaca }}</p></template>
      <p>Peso bruto: {{ num(g.pesoBruto, 3) }} {{ g.unidadPeso === 'TNE' ? 't' : 'kg' }}<template v-if="g.bultos"> · {{ g.bultos }} bulto(s)</template></p>
      <hr />
      <p v-for="d in g.detalles" :key="d.id" class="flex justify-between gap-2"><span>{{ d.descripcion }}</span><span>{{ cant(d.cantidad) }} {{ d.unidadCodigo }}</span></p>
      <hr />
      <p v-if="g.docRelTipo">Doc. relacionado: {{ g.docRelTipo === '01' ? 'Factura' : 'Boleta' }} {{ g.docRelSerie }}-{{ g.docRelNumero }}</p>
      <div v-if="g.qr" class="mt-2 flex justify-center"><img data-qr :src="g.qr" alt="Código QR" class="size-[30mm]" /></div>
      <footer class="mt-2 text-center">
        <p>Representación impresa de la guía de remisión electrónica.</p>
        <p v-if="leyenda" class="font-bold">{{ leyenda }}</p>
        <p v-if="g.estado === 'ANULADA'" class="mt-1 text-[14px] font-bold">*** ANULADA ***</p>
      </footer>
    </article>

    <!-- A4 -->
    <article v-else-if="g" class="relative mx-auto max-w-[190mm] p-[8mm] text-[12px] leading-snug print:p-0">
      <p v-if="g.estado === 'ANULADA'" class="pointer-events-none absolute inset-x-0 top-1/3 -rotate-12 text-center text-[64px] font-bold text-red-600/25">ANULADA</p>
      <header class="flex items-start justify-between gap-6">
        <div>
          <p class="text-[18px] font-bold">{{ empresa }}</p>
          <p v-if="g.empresa.nombreComercial">{{ g.empresa.razonSocial }}</p>
          <p v-if="g.empresa.direccion">{{ g.empresa.direccion }}</p>
        </div>
        <div class="w-[75mm] shrink-0 rounded-md border-2 border-black p-3 text-center">
          <p class="font-bold">RUC {{ g.empresa.ruc }}</p>
          <p class="my-1 bg-black py-1 text-[11px] font-bold text-white">GUÍA DE REMISIÓN ELECTRÓNICA REMITENTE</p>
          <p class="text-[15px] font-bold">{{ g.numeroCompleto }}</p>
        </div>
      </header>

      <section class="mt-4 grid grid-cols-2 gap-3">
        <div class="rounded-md border border-slate-400 p-2">
          <p class="font-bold">Datos del traslado</p>
          <p>Fecha de emisión: {{ fechaHora(g.fechaEmision) }}</p>
          <p>Inicio del traslado: {{ fecha(g.fechaTraslado) }}</p>
          <p>Motivo: {{ g.motivo }} - {{ g.motivoTexto }}<template v-if="g.motivo === '13'">: {{ g.motivoDescripcion }}</template></p>
          <p>Peso bruto total: {{ num(g.pesoBruto, 3) }} {{ g.unidadPeso === 'TNE' ? 't' : 'kg' }}<template v-if="g.bultos"> · Bultos: {{ g.bultos }}</template></p>
          <p v-if="g.docRelTipo">Comprobante relacionado: {{ g.docRelTipo === '01' ? 'Factura' : 'Boleta' }} {{ g.docRelSerie }}-{{ g.docRelNumero }}</p>
        </div>
        <div class="rounded-md border border-slate-400 p-2">
          <p class="font-bold">Destinatario</p>
          <p>{{ g.destinatarioNombre }}</p>
          <p>{{ TIPOS_DOCUMENTO[g.destinatarioTipoDoc] }}: {{ g.destinatarioNumDoc }}</p>
        </div>
        <div class="rounded-md border border-slate-400 p-2">
          <p class="font-bold">Punto de partida</p>
          <p>{{ g.partidaDireccion }}</p>
          <p>Ubigeo: {{ g.partidaUbigeo }}<template v-if="g.partidaEstablecimiento"> · Cód. establecimiento: {{ g.partidaEstablecimiento }}</template></p>
        </div>
        <div class="rounded-md border border-slate-400 p-2">
          <p class="font-bold">Punto de llegada</p>
          <p>{{ g.llegadaDireccion }}</p>
          <p>Ubigeo: {{ g.llegadaUbigeo }}<template v-if="g.llegadaEstablecimiento"> · Cód. establecimiento: {{ g.llegadaEstablecimiento }}</template></p>
        </div>
        <div class="col-span-2 rounded-md border border-slate-400 p-2">
          <p class="font-bold">{{ transporte }}</p>
          <p v-if="g.modalidad === 'PUBLICO'">Transportista: {{ g.transportistaNombre }} · RUC {{ g.transportistaRuc }}<template v-if="g.transportistaMtc"> · MTC {{ g.transportistaMtc }}</template></p>
          <p v-else>
            Conductor: {{ g.conductorNombres }} {{ g.conductorApellidos }} · DNI {{ g.conductorNumDoc }} · Licencia {{ g.conductorLicencia }} · Vehículo placa {{ g.vehiculoPlaca }}
          </p>
        </div>
      </section>

      <table class="mt-4 w-full border-collapse">
        <thead><tr class="border-y-2 border-black text-left"><th class="py-1.5 pr-2">N.º</th><th class="py-1.5 pr-2">Código</th><th class="py-1.5 pr-2">Descripción</th><th class="py-1.5 pr-2">Unidad</th><th class="py-1.5 text-right">Cantidad</th></tr></thead>
        <tbody>
          <tr v-for="(d, i) in g.detalles" :key="d.id" class="border-b border-slate-300">
            <td class="py-1.5 pr-2">{{ i + 1 }}</td><td class="py-1.5 pr-2">{{ d.codigo }}</td><td class="py-1.5 pr-2">{{ d.descripcion }}</td><td class="py-1.5 pr-2">{{ d.unidadCodigo }}</td>
            <td class="py-1.5 text-right">{{ cant(d.cantidad) }}</td>
          </tr>
        </tbody>
      </table>

      <section class="mt-4 flex items-center gap-3">
        <img v-if="g.qr" data-qr :src="g.qr" alt="Código QR" class="size-[28mm]" />
        <div class="text-[11px] text-slate-700">
          <p>Representación impresa de la guía de remisión electrónica remitente.</p>
          <p v-if="g.sunatHash" class="break-all">Código hash: {{ g.sunatHash }}</p>
          <p v-if="leyenda" class="font-bold text-black">{{ leyenda }}</p>
          <p v-if="g.observacion">Observación: {{ g.observacion }}</p>
          <p>Emitida por {{ g.emitidoPor }}</p>
        </div>
      </section>
    </article>
  </div>
</template>

<style scoped>
.ticket { width: 80mm; }
.ticket hr { border: 0; border-top: 1px dashed #000; margin: 2mm 0; }
@media print { .no-print { display: none !important; } }
</style>
