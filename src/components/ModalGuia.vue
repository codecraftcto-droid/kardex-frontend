<script setup>
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api, mensajeError } from '@/services/api';
import { useToast } from '@/stores/toast';
import { useTiempoReal } from '@/composables/useTiempoReal';
import { cant, fecha, fechaHora, num } from '@/utils/formato';
import { TIPOS_DOCUMENTO } from '@/utils/pos';
import { pedirTexto } from '@/utils/dialogos';
import BaseModal from './BaseModal.vue';
import InsigniaSunat from './InsigniaSunat.vue';
import Icono from './Icono.vue';

/** Detalle de una guía de remisión electrónica. */
const props = defineProps({ abierto: Boolean, guiaId: { type: String, default: null } });
const emit = defineEmits(['cerrar', 'cambio']);
const router = useRouter();
const toast = useToast();
const g = ref(null);
const ocupado = ref(false);

async function cargar() {
  try {
    g.value = (await api.get(`/guias/${props.guiaId}`)).data;
  } catch (e) {
    toast.error(mensajeError(e));
    emit('cerrar');
  }
}
watch(() => props.abierto, (v) => v && ((g.value = null), cargar()), { immediate: true });
useTiempoReal('gre:guia', (x) => props.abierto && x.id === props.guiaId && cargar());

async function enviar() {
  ocupado.value = true;
  try {
    const { data } = await api.post(`/guias/${g.value.id}/enviar`);
    (data.error ? toast.error : toast.exito)(data.mensaje);
    await cargar();
    emit('cambio');
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    ocupado.value = false;
  }
}
async function anular() {
  const motivo = await pedirTexto({ titulo: `¿Anular la guía ${g.value.numeroCompleto}?`, texto: 'Aún no se envió a SUNAT, así que se anula aquí.', etiqueta: 'Motivo', confirmar: 'Anular guía', minimo: 5 });
  if (!motivo) return;
  try {
    await api.post(`/guias/${g.value.id}/anular`, { motivo });
    toast.exito('Guía anulada');
    await cargar();
    emit('cambio');
  } catch (e) {
    toast.error(mensajeError(e));
  }
}
const imprimir = (f) => window.open(router.resolve(`/imprimir/guia/${g.value.id}/${f}`).href, '_blank');
</script>

<template>
  <BaseModal :abierto="abierto" :titulo="g ? `Guía de remisión ${g.numeroCompleto}` : 'Guía de remisión'" ancho="sm:max-w-4xl" @cerrar="emit('cerrar')">
    <p v-if="!g" class="py-10 text-center text-sm text-slate-500">Cargando…</p>
    <div v-else class="space-y-4" :class="{ 'opacity-60': ocupado }">
      <div class="flex flex-wrap items-center gap-2">
        <InsigniaSunat :estado="g.estadoSunat" />
        <span v-if="g.estado === 'ANULADA'" class="insignia bg-red-50 text-red-700">Anulada</span>
        <span class="text-sm text-slate-500">{{ g.motivo }} · {{ g.motivoTexto }}<template v-if="g.motivo === '13'">: {{ g.motivoDescripcion }}</template></span>
      </div>
      <p v-if="g.sunatDescripcion" class="text-sm text-slate-600">{{ g.sunatDescripcion }}</p>
      <p v-if="g.sunatUltimoError && !['ACEPTADO', 'OBSERVADO'].includes(g.estadoSunat)" class="text-sm text-red-700">Último intento: {{ g.sunatUltimoError }}</p>

      <!-- Ruta -->
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="rounded-xl bg-slate-50 p-3 text-sm">
          <p class="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-500"><span class="flex size-5 items-center justify-center rounded-full bg-marca-700 text-[11px] text-white">A</span> Partida</p>
          <p class="font-medium">{{ g.partidaDireccion }}</p>
          <p class="text-xs text-slate-500">Ubigeo {{ g.partidaUbigeo }}<template v-if="g.partidaEstablecimiento"> · Establecimiento {{ g.partidaEstablecimiento }}</template></p>
        </div>
        <div class="rounded-xl bg-slate-50 p-3 text-sm">
          <p class="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-500"><span class="flex size-5 items-center justify-center rounded-full bg-indigo-600 text-[11px] text-white">B</span> Llegada</p>
          <p class="font-medium">{{ g.llegadaDireccion }}</p>
          <p class="text-xs text-slate-500">Ubigeo {{ g.llegadaUbigeo }}<template v-if="g.llegadaEstablecimiento"> · Establecimiento {{ g.llegadaEstablecimiento }}</template></p>
        </div>
      </div>

      <dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm lg:grid-cols-4">
        <div><dt class="text-xs text-slate-500">Destinatario</dt><dd class="font-medium">{{ g.destinatarioNombre }}</dd><dd class="text-xs text-slate-500">{{ TIPOS_DOCUMENTO[g.destinatarioTipoDoc] }} {{ g.destinatarioNumDoc }}</dd></div>
        <div><dt class="text-xs text-slate-500">Inicio del traslado</dt><dd class="font-medium">{{ fecha(g.fechaTraslado) }}</dd><dd class="text-xs text-slate-500">Emitida {{ fechaHora(g.fechaEmision) }}</dd></div>
        <div><dt class="text-xs text-slate-500">Carga</dt><dd class="font-medium">{{ num(g.pesoBruto, 3) }} {{ g.unidadPeso === 'TNE' ? 't' : 'kg' }}</dd><dd v-if="g.bultos" class="text-xs text-slate-500">{{ g.bultos }} bulto(s)</dd></div>
        <div>
          <dt class="text-xs text-slate-500">Transporte {{ g.modalidad === 'PUBLICO' ? 'público' : 'privado' }}</dt>
          <template v-if="g.modalidad === 'PUBLICO'"><dd class="font-medium">{{ g.transportistaNombre }}</dd><dd class="text-xs text-slate-500">RUC {{ g.transportistaRuc }}</dd></template>
          <template v-else><dd class="font-medium">{{ g.conductorNombres }} {{ g.conductorApellidos }}</dd><dd class="text-xs text-slate-500">Lic. {{ g.conductorLicencia }} · Placa {{ g.vehiculoPlaca }}</dd></template>
        </div>
        <div v-if="g.docRelTipo"><dt class="text-xs text-slate-500">Comprobante relacionado</dt><dd class="font-mono">{{ g.docRelTipo === '01' ? 'Factura' : 'Boleta' }} {{ g.docRelSerie }}-{{ g.docRelNumero }}</dd></div>
        <div v-if="g.observacion" class="col-span-2 lg:col-span-3"><dt class="text-xs text-slate-500">Observación</dt><dd>{{ g.observacion }}</dd></div>
      </dl>

      <div class="overflow-hidden rounded-xl border border-slate-200">
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50 text-xs text-slate-500 uppercase"><tr><th class="px-4 py-2 text-left font-semibold">Bien</th><th class="px-4 py-2 text-right font-semibold">Cantidad</th></tr></thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="d in g.detalles" :key="d.id">
              <td class="px-4 py-2"><span class="font-medium">{{ d.descripcion }}</span><span v-if="d.codigo" class="ml-2 font-mono text-xs text-slate-400">{{ d.codigo }}</span></td>
              <td class="px-4 py-2 text-right tabular-nums">{{ cant(d.cantidad) }} <span class="text-xs text-slate-400">{{ d.unidadCodigo }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="g.sunatXml || g.sunatCdr || g.sunatPdf" class="flex gap-4 text-sm">
        <a v-if="g.sunatXml" :href="g.sunatXml" target="_blank" rel="noopener" class="text-marca-700 hover:underline">XML</a>
        <a v-if="g.sunatCdr" :href="g.sunatCdr" target="_blank" rel="noopener" class="text-marca-700 hover:underline">CDR</a>
        <a v-if="g.sunatPdf" :href="g.sunatPdf" target="_blank" rel="noopener" class="text-marca-700 hover:underline">PDF del proveedor</a>
      </p>
    </div>
    <template #pie>
      <button v-if="g?.acciones.anular" class="btn-secundario mr-auto text-red-600 hover:bg-red-50" @click="anular">Anular</button>
      <button v-if="g" class="btn-secundario" @click="imprimir('a4')"><Icono nombre="imprimir" clase="size-4" /> A4</button>
      <button v-if="g" class="btn-secundario" @click="imprimir('ticket')"><Icono nombre="imprimir" clase="size-4" /> Ticket</button>
      <button v-if="g?.acciones.enviar" class="btn-primario" :disabled="ocupado" @click="enviar">{{ g.estadoSunat === 'ENVIADO' ? 'Consultar respuesta' : 'Enviar a SUNAT' }}</button>
      <button v-else class="btn-primario" @click="emit('cerrar')">Cerrar</button>
    </template>
  </BaseModal>
</template>
