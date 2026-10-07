<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { usarHojaImpresion } from '@/utils/impresion';
import { api, mensajeError } from '@/services/api';
import { fechaHora, num } from '@/utils/formato';
import { MEDIOS_PAGO, TIPOS_COMPROBANTE } from '@/utils/pos';

/** Reporte de cierre de caja (arqueo) en ticket 80 mm o A4. */
const route = useRoute();
const ticket = computed(() => route.params.formato === 'ticket');
const s = ref(null);
const error = ref('');
let quitarHoja;

const diferencia = computed(() => (s.value?.diferencia == null ? null : Number(s.value.diferencia)));
const textoDif = computed(() => (diferencia.value === 0 ? 'Cuadra' : diferencia.value < 0 ? 'Faltante' : 'Sobrante'));

onMounted(async () => {
  quitarHoja = usarHojaImpresion(ticket.value, '15mm');
  try {
    s.value = (await api.get(`/pos/sesiones/${route.params.id}`)).data;
    document.title = `Cierre de caja — ${s.value.caja.nombre}`;
    await nextTick();
    setTimeout(() => window.print(), 150);
  } catch (e) {
    error.value = mensajeError(e, 'No se pudo cargar el turno');
  }
});
onBeforeUnmount(() => quitarHoja?.());
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
    <article v-else-if="s" :class="ticket ? 'ticket mx-auto px-[3mm] py-[4mm] font-mono text-[11px]' : 'mx-auto max-w-[180mm] p-[8mm] text-[13px] print:p-0'">
      <header :class="ticket ? 'text-center' : 'mb-4'">
        <p class="font-bold" :class="ticket ? 'text-[13px]' : 'text-[18px]'">{{ s.caja.empresa.nombreComercial || s.caja.empresa.razonSocial }}</p>
        <p>RUC {{ s.caja.empresa.ruc }}</p>
        <p class="mt-2 font-bold" :class="ticket ? '' : 'text-[16px]'">CIERRE DE CAJA {{ s.estado === 'ABIERTA' ? '(PARCIAL: TURNO ABIERTO)' : '' }}</p>
      </header>
      <hr v-if="ticket" />
      <dl class="space-y-0.5">
        <p class="flex justify-between"><span>Caja</span><span>{{ s.caja.nombre }} · {{ s.caja.almacen.nombre }}</span></p>
        <p class="flex justify-between"><span>Cajero</span><span>{{ s.usuario }}</span></p>
        <p class="flex justify-between"><span>Apertura</span><span>{{ fechaHora(s.abiertaEn) }}</span></p>
        <p class="flex justify-between"><span>Cierre</span><span>{{ s.cerradaEn ? fechaHora(s.cerradaEn) : '—' }}</span></p>
      </dl>
      <hr />
      <p class="font-bold">Comprobantes</p>
      <p v-for="(t, tipo) in s.resumen.porTipo" :key="tipo" class="flex justify-between"><span>{{ TIPOS_COMPROBANTE[tipo].texto }} ({{ t.cantidad }})</span><span>{{ num(t.total, 2) }}</span></p>
      <p v-if="s.resumen.anulados" class="flex justify-between"><span>Anulados</span><span>{{ s.resumen.anulados }}</span></p>
      <p class="flex justify-between font-bold"><span>Ventas netas</span><span>{{ num(s.resumen.ventasNetas, 2) }}</span></p>
      <p v-if="Number(s.resumen.ventasCredito)" class="flex justify-between"><span>De ellas, al crédito</span><span>{{ num(s.resumen.ventasCredito, 2) }}</span></p>
      <p v-if="s.resumen.cobranzas?.cantidad" class="flex justify-between"><span>Cobranzas de créditos ({{ s.resumen.cobranzas.cantidad }})</span><span>{{ num(s.resumen.cobranzas.total, 2) }}</span></p>
      <hr />
      <p class="font-bold">Por medio de pago{{ s.resumen.cobranzas?.cantidad ? ' (incluye cobranzas)' : '' }}</p>
      <p v-for="(monto, medio) in s.resumen.porMedio" :key="medio" class="flex justify-between"><span>{{ MEDIOS_PAGO[medio] }}</span><span>{{ num(monto, 2) }}</span></p>
      <hr />
      <p class="font-bold">Arqueo de efectivo</p>
      <p class="flex justify-between"><span>Apertura</span><span>{{ num(s.montoApertura, 2) }}</span></p>
      <p class="flex justify-between"><span>Efectivo esperado</span><span>{{ num(s.efectivoEsperado, 2) }}</span></p>
      <p v-if="s.efectivoDeclarado != null" class="flex justify-between"><span>Efectivo contado</span><span>{{ num(s.efectivoDeclarado, 2) }}</span></p>
      <p v-if="diferencia !== null" class="flex justify-between font-bold"><span>{{ textoDif }}</span><span>{{ num(Math.abs(diferencia), 2) }}</span></p>
      <p v-if="s.observacion" class="mt-1">Obs.: {{ s.observacion }}</p>
      <div class="mt-10 grid grid-cols-2 gap-6 text-center" :class="{ 'mt-12': !ticket }">
        <p class="border-t border-black pt-1">Cajero</p>
        <p class="border-t border-black pt-1">Supervisor</p>
      </div>
    </article>
  </div>
</template>

<style scoped>
.ticket { width: 80mm; }
hr { border: 0; border-top: 1px dashed #000; margin: 2mm 0; }
@media print { .no-print { display: none !important; } }
</style>
