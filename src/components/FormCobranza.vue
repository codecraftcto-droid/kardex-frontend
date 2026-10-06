<script setup>
import { computed, reactive, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api, mensajeError } from '@/services/api';
import { useToast } from '@/stores/toast';
import { fecha, soles } from '@/utils/formato';
import { MEDIOS_PAGO } from '@/utils/pos';
import BaseModal from './BaseModal.vue';

/**
 * Registro de una cobranza (pago a cuenta de una venta al crédito).
 * El efectivo entra por una caja con turno propio abierto (va al arqueo); los demás medios
 * pueden registrarse sin caja (p. ej. un depósito que se ve en el banco).
 */
const props = defineProps({
  abierto: Boolean,
  empresaId: { type: String, required: true },
  /** { id, numeroCompleto, saldoPendiente, clienteNombre, cuotas: [{ numero, monto, pendiente, fechaVencimiento, vencida }] } */
  comprobante: { type: Object, default: null },
});
const emit = defineEmits(['cerrar', 'guardado']);
const router = useRouter();
const toast = useToast();

const f = reactive({ monto: '', medio: 'EFECTIVO', referencia: '', observacion: '', cajaId: '', imprimir: 'ticket' });
const estado = reactive({ cajas: [], enviando: false });
watch(
  () => props.abierto,
  async (v) => {
    if (!v || !props.comprobante) return;
    // Por defecto se cobra la cuota que toca (la más antigua pendiente); se puede pagar menos o más
    const proxima = pendientes.value[0];
    Object.assign(f, { monto: Number(proxima ? proxima.pendiente : props.comprobante.saldoPendiente).toFixed(2), medio: 'EFECTIVO', referencia: '', observacion: '' });
    try {
      estado.cajas = (await api.get('/pos/cajas', { params: { empresaId: props.empresaId } })).data.filter((c) => c.turno?.esMio);
    } catch {
      estado.cajas = [];
    }
    f.cajaId = estado.cajas[0]?.id ?? '';
  },
  { immediate: true },
);
const saldo = computed(() => Number(props.comprobante?.saldoPendiente ?? 0));
const r2 = (n) => Math.round(n * 100) / 100;
const pendientes = computed(() => (props.comprobante?.cuotas ?? []).filter((k) => Number(k.pendiente) > 0));
const vencido = computed(() => r2(pendientes.value.filter((k) => k.vencida).reduce((s, k) => s + Number(k.pendiente), 0)));

/** Montos sugeridos: la cuota que toca, todo lo vencido y el saldo completo. */
const rapidos = computed(() => {
  const lista = [];
  const proxima = pendientes.value[0];
  if (proxima) lista.push({ texto: `Cuota ${proxima.numero}${Number(proxima.pendiente) < Number(proxima.monto) ? ' (resto)' : ''}`, monto: Number(proxima.pendiente) });
  if (vencido.value > 0 && vencido.value !== Number(proxima?.pendiente)) lista.push({ texto: 'Todo lo vencido', monto: vencido.value });
  if (saldo.value > 0 && !lista.some((x) => x.monto === saldo.value)) lista.push({ texto: 'Todo el saldo', monto: saldo.value });
  return lista;
});

/** Cómo se aplica el pago: a las cuotas en orden de vencimiento (igual que el backend). */
const aplicacion = computed(() => {
  let resto = Number(f.monto) || 0;
  return pendientes.value
    .map((k) => {
      const debe = Number(k.pendiente);
      const paga = r2(Math.min(debe, Math.max(0, resto)));
      resto = r2(resto - paga);
      return { ...k, paga, queda: r2(debe - paga) };
    })
    .filter((k) => k.paga > 0);
});
const error = computed(() => {
  const m = Number(f.monto);
  if (!(m > 0)) return 'Indique el monto';
  if (m > saldo.value + 0.001) return `El saldo pendiente es ${soles(saldo.value)}`;
  if (f.medio === 'EFECTIVO' && !f.cajaId) return 'El efectivo se cobra en una caja con turno abierto a su nombre';
  return '';
});

async function guardar() {
  estado.enviando = true;
  const ventana = f.imprimir !== 'no' ? window.open('', '_blank') : null;
  try {
    const { data } = await api.post('/cxc/cobranzas', {
      comprobanteId: props.comprobante.id, monto: Number(f.monto).toFixed(2), medio: f.medio,
      referencia: f.referencia || undefined, observacion: f.observacion || undefined, cajaId: f.cajaId || null,
    });
    toast.exito(`Cobranza Nº ${data.numero} registrada · saldo ${soles(data.saldoPendiente)}`);
    if (ventana) ventana.location.href = router.resolve(`/imprimir/cobranza/${data.id}/${f.imprimir}`).href;
    emit('guardado', data);
  } catch (e) {
    ventana?.close();
    toast.error(mensajeError(e));
  } finally {
    estado.enviando = false;
  }
}
</script>

<template>
  <BaseModal :abierto="abierto" :titulo="comprobante ? `Cobrar ${comprobante.numeroCompleto}` : 'Cobrar'" @cerrar="emit('cerrar')">
    <form v-if="comprobante" id="form-cobranza" class="grid gap-4 sm:grid-cols-2" @submit.prevent="guardar">
      <p class="rounded-lg bg-sky-50 px-3 py-2 text-sm sm:col-span-2">
        {{ comprobante.clienteNombre }} · saldo pendiente <strong class="tabular-nums">{{ soles(saldo) }}</strong>
      </p>
      <div>
        <label class="etiqueta" for="cb-monto">Monto *</label>
        <input id="cb-monto" v-model="f.monto" type="number" inputmode="decimal" min="0.01" :max="saldo" step="0.01" class="input min-h-12 text-xl tabular-nums" required />
      </div>
      <div>
        <label class="etiqueta" for="cb-medio">Medio *</label>
        <select id="cb-medio" v-model="f.medio" class="input min-h-12"><option v-for="(m, k) in MEDIOS_PAGO" :key="k" :value="k">{{ m }}</option></select>
      </div>
      <div v-if="rapidos.length" class="flex flex-wrap gap-1 sm:col-span-2">
        <button v-for="r in rapidos" :key="r.texto" type="button" class="btn-secundario min-h-9 px-3 text-xs" :class="{ 'border-marca-600 bg-marca-50': Number(f.monto) === r.monto }" @click="f.monto = r.monto.toFixed(2)">
          {{ r.texto }} · {{ soles(r.monto) }}
        </button>
      </div>
      <ul v-if="aplicacion.length" class="space-y-1 rounded-lg bg-slate-50 p-3 text-sm sm:col-span-2" aria-label="Cómo se aplica el pago">
        <li v-for="k in aplicacion" :key="k.numero" class="flex flex-wrap justify-between gap-x-3">
          <span>Cuota {{ k.numero }} <span class="text-xs text-slate-500">· vence {{ fecha(k.fechaVencimiento) }}<template v-if="k.vencida"> (vencida)</template></span></span>
          <span class="tabular-nums">
            paga {{ soles(k.paga) }} →
            <strong v-if="k.queda === 0" class="text-emerald-700">queda pagada</strong>
            <strong v-else class="text-amber-700">queda debiendo {{ soles(k.queda) }}</strong>
          </span>
        </li>
      </ul>
      <div class="sm:col-span-2">
        <label class="etiqueta" for="cb-caja">Caja</label>
        <select id="cb-caja" v-model="f.cajaId" class="input">
          <option v-for="c in estado.cajas" :key="c.id" :value="c.id">{{ c.nombre }} (su turno abierto: entra al arqueo)</option>
          <option value="">Sin caja (depósito, transferencia…)</option>
        </select>
      </div>
      <div v-if="f.medio !== 'EFECTIVO'"><label class="etiqueta" for="cb-ref">Nº de operación</label><input id="cb-ref" v-model="f.referencia" class="input" maxlength="60" /></div>
      <div :class="f.medio === 'EFECTIVO' ? 'sm:col-span-2' : ''"><label class="etiqueta" for="cb-obs">Observación</label><input id="cb-obs" v-model="f.observacion" class="input" maxlength="300" /></div>
      <div class="sm:col-span-2">
        <label class="etiqueta" for="cb-imp">Recibo</label>
        <select id="cb-imp" v-model="f.imprimir" class="input"><option value="ticket">Imprimir ticket</option><option value="a4">Imprimir A4</option><option value="no">No imprimir</option></select>
      </div>
      <p v-if="error" class="text-sm text-red-600 sm:col-span-2">{{ error }}</p>
    </form>
    <template #pie>
      <button class="btn-secundario" @click="emit('cerrar')">Cancelar</button>
      <button class="btn-primario" form="form-cobranza" :disabled="!!error || estado.enviando">Registrar cobranza</button>
    </template>
  </BaseModal>
</template>
