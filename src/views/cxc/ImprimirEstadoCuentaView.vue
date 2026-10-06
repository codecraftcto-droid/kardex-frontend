<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api, mensajeError } from '@/services/api';
import { fecha, fechaHora, num } from '@/utils/formato';
import { TIPOS_DOCUMENTO } from '@/utils/pos';

/** Estado de cuenta del cliente en A4: para entregarlo o enviarlo al cliente. */
const route = useRoute();
const ec = ref(null);
const error = ref('');
let estilo;

onMounted(async () => {
  estilo = document.createElement('style');
  estilo.textContent = '@page { size: A4; margin: 12mm } body { background: #fff !important }';
  document.head.appendChild(estilo);
  try {
    ec.value = (await api.get(`/cxc/clientes/${route.params.id}`)).data;
    document.title = `Estado de cuenta — ${ec.value.cliente.nombre}`;
    await nextTick();
    setTimeout(() => window.print(), 150);
  } catch (e) {
    error.value = mensajeError(e, 'No se pudo cargar el estado de cuenta');
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
    <article v-else-if="ec" class="mx-auto max-w-[190mm] p-[8mm] text-[12px] leading-snug print:p-0">
      <header class="flex items-start justify-between gap-6">
        <div>
          <p class="text-[18px] font-bold">{{ ec.empresa.nombreComercial || ec.empresa.razonSocial }}</p>
          <p v-if="ec.empresa.nombreComercial">{{ ec.empresa.razonSocial }}</p>
          <p>RUC {{ ec.empresa.ruc }}</p>
          <p v-if="ec.empresa.direccion">{{ ec.empresa.direccion }}</p>
        </div>
        <div class="text-right">
          <p class="text-[16px] font-bold">ESTADO DE CUENTA</p>
          <p>Al {{ fecha(ec.fecha) }}</p>
        </div>
      </header>

      <section class="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 rounded-md border border-slate-400 p-3">
        <span class="font-semibold">Cliente:</span><span>{{ ec.cliente.nombre }}</span>
        <span class="font-semibold">Documento:</span><span>{{ TIPOS_DOCUMENTO[ec.cliente.tipoDocumento] }} {{ ec.cliente.numeroDocumento }}{{ ec.cliente.rucAsociado ? ` · RUC ${ec.cliente.rucAsociado}` : '' }}</span>
        <template v-if="ec.cliente.direccion"><span class="font-semibold">Dirección:</span><span>{{ ec.cliente.direccion }}</span></template>
      </section>

      <p class="mt-4 font-bold">Documentos pendientes</p>
      <table class="mt-1 w-full border-collapse">
        <thead><tr class="border-y-2 border-black text-left"><th class="py-1 pr-2">Comprobante</th><th class="py-1 pr-2">Emisión</th><th class="py-1 pr-2">Cuota</th><th class="py-1 pr-2">Vence</th><th class="py-1 pr-2 text-right">Monto</th><th class="py-1 pr-2 text-right">Pendiente</th><th class="py-1 text-right">Atraso</th></tr></thead>
        <tbody>
          <template v-for="d in ec.documentos" :key="d.id">
            <tr v-for="(k, i) in d.cuotas.filter((x) => Number(x.pendiente) > 0)" :key="`${d.id}-${k.numero}`" class="border-b border-slate-300">
              <td class="py-1 pr-2">{{ i === 0 ? d.numeroCompleto : '' }}</td>
              <td class="py-1 pr-2">{{ i === 0 ? fecha(d.fechaEmision) : '' }}</td>
              <td class="py-1 pr-2">{{ k.numero }}/{{ d.cuotas.length }}</td>
              <td class="py-1 pr-2">{{ fecha(k.fechaVencimiento) }}</td>
              <td class="py-1 pr-2 text-right">{{ num(k.monto, 2) }}</td>
              <td class="py-1 pr-2 text-right">{{ num(k.pendiente, 2) }}</td>
              <td class="py-1 text-right" :class="{ 'font-bold': k.vencida }">{{ k.vencida ? `${k.diasVencido} días` : '—' }}</td>
            </tr>
          </template>
          <tr v-if="!ec.documentos.length"><td colspan="7" class="py-2 text-center">Sin documentos pendientes</td></tr>
        </tbody>
      </table>

      <p class="mt-4 font-bold">Movimientos de la cuenta</p>
      <table class="mt-1 w-full border-collapse">
        <thead><tr class="border-y-2 border-black text-left"><th class="py-1 pr-2">Fecha</th><th class="py-1 pr-2">Concepto</th><th class="py-1 pr-2 text-right">Cargo</th><th class="py-1 pr-2 text-right">Abono</th><th class="py-1 text-right">Saldo</th></tr></thead>
        <tbody>
          <tr v-for="(m, i) in ec.movimientos" :key="i" class="border-b border-slate-300">
            <td class="py-1 pr-2">{{ fechaHora(m.fecha) }}</td><td class="py-1 pr-2">{{ m.concepto }}</td>
            <td class="py-1 pr-2 text-right">{{ Number(m.cargo) ? num(m.cargo, 2) : '' }}</td>
            <td class="py-1 pr-2 text-right">{{ Number(m.abono) ? num(m.abono, 2) : '' }}</td>
            <td class="py-1 text-right">{{ num(m.saldo, 2) }}</td>
          </tr>
        </tbody>
      </table>

      <section class="mt-4 ml-auto w-[80mm]">
        <p class="flex justify-between"><span>Vencido</span><span>S/ {{ num(ec.resumen.vencido, 2) }}</span></p>
        <p class="flex justify-between"><span>Por vencer</span><span>S/ {{ num(ec.resumen.porVencer, 2) }}</span></p>
        <p class="flex justify-between border-t-2 border-black pt-1 text-[14px] font-bold"><span>TOTAL ADEUDADO</span><span>S/ {{ num(ec.resumen.deuda, 2) }}</span></p>
        <p class="mt-1 text-[11px]">{{ ec.resumen.deudaEnLetras }}</p>
      </section>
    </article>
  </div>
</template>

<style scoped>
@media print { .no-print { display: none !important; } }
</style>
