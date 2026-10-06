<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, mensajeError } from '@/services/api';
import { useContexto } from '@/stores/contexto';
import { useToast } from '@/stores/toast';
import { useTiempoReal } from '@/composables/useTiempoReal';
import { fecha, fechaHora, soles } from '@/utils/formato';
import { MEDIOS_PAGO, TIPOS_COMPROBANTE, TIPOS_DOCUMENTO } from '@/utils/pos';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import BaseModal from '@/components/BaseModal.vue';
import FormCobranza from '@/components/FormCobranza.vue';
import Icono from '@/components/Icono.vue';
import Paginacion from '@/components/Paginacion.vue';
import { usePaginacionLocal } from '@/composables/usePaginacionLocal';

const route = useRoute();
const router = useRouter();
const contexto = useContexto();
const toast = useToast();
const ec = ref(null);
const todos = ref(false);

async function cargar() {
  try {
    ec.value = (await api.get(`/cxc/clientes/${route.params.id}`, { params: { todos: todos.value ? 'true' : undefined } })).data;
  } catch (e) {
    toast.error(mensajeError(e));
    router.replace('/cuentas-por-cobrar');
  }
}
watch([() => route.params.id, todos], () => route.params.id && cargar(), { immediate: true });
useTiempoReal('cxc:cambio', (x) => x.clienteId === route.params.id && cargar());

const cobro = reactive({ abierto: false, comprobante: null });
function cobrar(d) {
  Object.assign(cobro, { abierto: true, comprobante: { id: d.id, numeroCompleto: d.numeroCompleto, saldoPendiente: d.saldoPendiente, clienteNombre: ec.value.cliente.nombre, cuotas: d.cuotas } });
}
function cobrado() {
  cobro.abierto = false;
  cargar();
}

const anulacion = reactive({ abierto: false, cobranza: null, motivo: '', enviando: false });
async function anular() {
  anulacion.enviando = true;
  try {
    await api.post(`/cxc/cobranzas/${anulacion.cobranza.id}/anular`, { motivo: anulacion.motivo });
    toast.exito('Cobranza anulada: el saldo volvió a la deuda');
    anulacion.abierto = false;
    cargar();
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    anulacion.enviando = false;
  }
}

const usoCredito = computed(() => {
  const r = ec.value?.resumen;
  return r?.limite ? Math.min(100, (Number(r.deuda) / Number(r.limite)) * 100) : null;
});
const { pag: pagCobranzas, visibles: cobranzasVisibles } = usePaginacionLocal(computed(() => ec.value?.cobranzas ?? []), 10);
const { pag: pagDocs, visibles: docsVisibles } = usePaginacionLocal(computed(() => ec.value?.documentos ?? []), 10);
const imprimir = () => window.open(router.resolve(`/imprimir/estado-cuenta/${route.params.id}`).href, '_blank');
</script>

<template>
  <div v-if="ec" class="space-y-5">
    <EncabezadoPagina :titulo="ec.cliente.nombre" :subtitulo="`${TIPOS_DOCUMENTO[ec.cliente.tipoDocumento]} ${ec.cliente.numeroDocumento}${ec.cliente.rucAsociado ? ` · RUC ${ec.cliente.rucAsociado}` : ''}`">
      <template #antes>
        <RouterLink to="/cuentas-por-cobrar" class="mb-1 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"><Icono nombre="atras" clase="size-4" /> Cuentas por cobrar</RouterLink>
      </template>
      <button class="btn-secundario" @click="imprimir"><Icono nombre="imprimir" clase="size-4" /> Estado de cuenta</button>
    </EncabezadoPagina>

    <section class="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <div class="tarjeta p-3"><p class="text-xs text-slate-500">Deuda total</p><p class="text-xl font-semibold tabular-nums">{{ soles(ec.resumen.deuda) }}</p></div>
      <div class="tarjeta p-3" :class="{ 'border-red-200 bg-red-50/40': Number(ec.resumen.vencido) > 0 }">
        <p class="text-xs text-slate-500">Vencido</p><p class="text-xl font-semibold tabular-nums" :class="{ 'text-red-700': Number(ec.resumen.vencido) > 0 }">{{ soles(ec.resumen.vencido) }}</p>
      </div>
      <div class="tarjeta p-3"><p class="text-xs text-slate-500">Por vencer</p><p class="text-xl font-semibold tabular-nums">{{ soles(ec.resumen.porVencer) }}</p></div>
      <div class="tarjeta p-3">
        <p class="text-xs text-slate-500">Crédito disponible</p>
        <p class="text-xl font-semibold tabular-nums">{{ ec.resumen.limite != null ? soles(ec.resumen.disponible) : 'Sin tope' }}</p>
        <div v-if="usoCredito !== null" class="mt-1 h-1.5 rounded-full bg-slate-100" role="progressbar" :aria-valuenow="Math.round(usoCredito)" aria-valuemin="0" aria-valuemax="100" aria-label="Uso del crédito">
          <div class="h-full rounded-full" :class="usoCredito >= 90 ? 'bg-red-500' : 'bg-marca-600'" :style="{ width: `${usoCredito}%` }" />
        </div>
        <p class="mt-1 text-xs text-slate-500">
          {{ ec.cliente.creditoHabilitado ? `Límite ${ec.resumen.limite != null ? soles(ec.resumen.limite) : 'sin tope'} · ${ec.cliente.diasCredito} días` : 'Crédito deshabilitado' }}
        </p>
      </div>
    </section>

    <section>
      <div class="mb-2 flex items-center justify-between gap-2">
        <h2 class="font-semibold">Documentos al crédito</h2>
        <label class="flex items-center gap-2 text-sm"><input v-model="todos" type="checkbox" class="size-5 accent-marca-700" /> Incluir pagados</label>
      </div>
      <p v-if="!ec.documentos.length" class="tarjeta p-6 text-center text-sm text-slate-500">No hay documentos pendientes.</p>
      <div class="grid gap-3 lg:grid-cols-2">
        <article v-for="d in docsVisibles" :key="d.id" class="tarjeta p-4 text-sm">
          <div class="flex items-start justify-between gap-2">
            <div>
              <RouterLink :to="`/comprobantes/${d.id}`" class="font-mono font-medium text-marca-700 hover:underline">{{ d.numeroCompleto }}</RouterLink>
              <p class="text-xs text-slate-500">{{ TIPOS_COMPROBANTE[d.tipo].texto }} · {{ fechaHora(d.fechaEmision) }} · total {{ soles(d.total) }}<template v-if="Number(d.inicial)"> (inicial {{ soles(d.inicial) }})</template></p>
            </div>
            <div class="text-right">
              <p class="text-lg font-semibold tabular-nums">{{ soles(d.saldoPendiente) }}</p>
              <span v-if="d.diasVencido" class="insignia bg-red-50 text-red-700">{{ d.diasVencido }} días vencido</span>
              <span v-else-if="Number(d.saldoPendiente) === 0" class="insignia bg-emerald-50 text-emerald-700">Pagado</span>
            </div>
          </div>
          <ul class="mt-3 space-y-1 border-t border-slate-100 pt-2">
            <li v-for="k in d.cuotas" :key="k.numero" class="flex flex-wrap justify-between gap-x-2">
              <span>Cuota {{ k.numero }} · {{ fecha(k.fechaVencimiento) }}</span>
              <span class="tabular-nums" :class="Number(k.pendiente) === 0 ? 'text-emerald-700' : k.vencida ? 'font-medium text-red-700' : ''">
                {{ Number(k.pendiente) === 0 ? `Pagada (${soles(k.monto)})` : `Debe ${soles(k.pendiente)} de ${soles(k.monto)}` }}
              </span>
            </li>
          </ul>
          <button v-if="ec.acciones.cobrar && Number(d.saldoPendiente) > 0" class="btn-primario mt-3 w-full sm:w-auto" @click="cobrar(d)"><Icono nombre="tarjeta" clase="size-4" /> Cobrar</button>
        </article>
      </div>
      <Paginacion :pag="pagDocs" :opciones="[10, 20, 50]" />
    </section>

    <section>
      <h2 class="mb-2 font-semibold">Cobranzas</h2>
      <p v-if="!ec.cobranzas.length" class="tarjeta p-6 text-center text-sm text-slate-500">Aún no hay cobranzas.</p>
      <ul v-else class="tarjeta divide-y divide-slate-100">
        <li v-for="k in cobranzasVisibles" :key="k.id" class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm" :class="{ 'text-slate-400': k.estado === 'ANULADA' }">
          <span class="font-mono">Nº {{ k.numero }}</span>
          <span class="min-w-0 flex-1">{{ fechaHora(k.fecha) }} · {{ MEDIOS_PAGO[k.medio] }}<template v-if="k.referencia"> · {{ k.referencia }}</template> · {{ k.comprobante }}
            <span v-if="k.estado === 'ANULADA'" class="insignia ml-1 bg-red-50 text-red-700">Anulada: {{ k.motivoAnulacion }}</span>
          </span>
          <span class="tabular-nums font-medium" :class="{ 'line-through': k.estado === 'ANULADA' }">{{ soles(k.monto) }}</span>
          <span class="flex gap-1">
            <RouterLink :to="`/imprimir/cobranza/${k.id}/ticket`" target="_blank" class="btn-texto" aria-label="Imprimir recibo"><Icono nombre="imprimir" clase="size-4" /></RouterLink>
            <button v-if="ec.acciones.anular && k.estado === 'VIGENTE'" class="btn-texto text-red-600 hover:bg-red-50" @click="Object.assign(anulacion, { abierto: true, cobranza: k, motivo: '' })">Anular</button>
          </span>
        </li>
      </ul>
      <Paginacion :pag="pagCobranzas" :opciones="[10, 20, 50]" />
    </section>

    <FormCobranza :abierto="cobro.abierto" :empresa-id="contexto.empresaActivaId" :comprobante="cobro.comprobante" @cerrar="cobro.abierto = false" @guardado="cobrado" />

    <BaseModal :abierto="anulacion.abierto" :titulo="`Anular cobranza Nº ${anulacion.cobranza?.numero}`" @cerrar="anulacion.abierto = false">
      <form id="form-anular-cobranza" class="space-y-3" @submit.prevent="anular">
        <p class="text-sm text-slate-600">El monto vuelve a la deuda del cliente. Si se cobró en una caja, solo se puede anular mientras ese turno siga abierto.</p>
        <div><label class="etiqueta" for="motivo-cb">Motivo *</label><textarea id="motivo-cb" v-model="anulacion.motivo" class="input py-2" rows="3" minlength="5" required /></div>
      </form>
      <template #pie>
        <button class="btn-secundario" @click="anulacion.abierto = false">Volver</button>
        <button class="btn-peligro" form="form-anular-cobranza" :disabled="anulacion.enviando">Anular</button>
      </template>
    </BaseModal>
  </div>
  <p v-else class="text-sm text-slate-500">Cargando…</p>
</template>
