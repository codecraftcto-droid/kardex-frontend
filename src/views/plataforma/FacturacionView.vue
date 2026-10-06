<script setup>
import { computed, onMounted, reactive } from 'vue';
import { useRoute } from 'vue-router';
import { apiPlataforma } from '@/services/apiPlataforma';
import { mensajeError } from '@/services/api';
import { usePlataforma } from '@/stores/plataforma';
import { useToast } from '@/stores/toast';
import { useListado } from '@/composables/useListado';
import { fecha, soles } from '@/utils/formato';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import TablaResponsiva from '@/components/TablaResponsiva.vue';
import Paginacion from '@/components/Paginacion.vue';
import BaseModal from '@/components/BaseModal.vue';
import MenuAcciones from '@/components/MenuAcciones.vue';
import BotonColumnas from '@/components/BotonColumnas.vue';

const route = useRoute();
const plataforma = usePlataforma();
const toast = useToast();
const periodoActual = new Date().toISOString().slice(0, 7);
const { filas, cargando, filtros, pag, cargar, extra } = useListado(
  '/facturas',
  { periodo: route.query.tenantId ? '' : periodoActual, estado: '', tenantId: route.query.tenantId ?? '' },
  apiPlataforma,
);
delete filtros.q;
onMounted(cargar);

const resumen = computed(() => extra.value?.resumen ?? {});
const columnas = [
  { clave: 'tenant.nombre', titulo: 'Estudio' },
  { clave: 'periodo', titulo: 'Periodo' },
  { clave: 'plan.nombre', titulo: 'Plan' },
  { clave: 'monto', titulo: 'Monto', clase: 'text-right' },
  { clave: 'venceEn', titulo: 'Vence' },
  { clave: 'estado', titulo: 'Estado' },
];
const estilo = (f) => (f.vencida ? 'bg-red-50 text-red-700' : { PAGADA: 'bg-emerald-50 text-emerald-700', PENDIENTE: 'bg-amber-50 text-amber-700', ANULADA: 'bg-slate-100 text-slate-500' }[f.estado]);

const dlg = reactive({ tipo: null, factura: null, texto: '', periodo: periodoActual, enviando: false });
async function confirmar() {
  dlg.enviando = true;
  try {
    if (dlg.tipo === 'generar') {
      const { data } = await apiPlataforma.post('/facturas/generar', { periodo: dlg.periodo });
      toast.exito(`${data.emitidas} factura(s) emitidas${data.omitidas ? `; ${data.omitidas} ya existían` : ''}`);
      filtros.periodo = dlg.periodo;
    } else if (dlg.tipo === 'pagar') {
      await apiPlataforma.post(`/facturas/${dlg.factura.id}/pagar`, { referencia: dlg.texto });
      toast.exito('Pago registrado');
    } else {
      await apiPlataforma.post(`/facturas/${dlg.factura.id}/anular`, { motivo: dlg.texto });
      toast.exito('Factura anulada');
    }
    dlg.tipo = null;
    cargar();
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    dlg.enviando = false;
  }
}
const abrir = (tipo, factura = null) => Object.assign(dlg, { tipo, factura, texto: '' });

/** Acciones de cada factura (menú ⋯) */
const accionesFila = (f) =>
  plataforma.esAdmin && f.estado === 'PENDIENTE'
    ? [
        { texto: 'Registrar pago', icono: 'check', alHacer: () => abrir('pagar', f) },
        { separador: true },
        { texto: 'Anular', icono: 'cerrar', peligro: true, alHacer: () => abrir('anular', f) },
      ]
    : [];
</script>

<template>
  <EncabezadoPagina titulo="Facturación" subtitulo="Cobro mensual a los estudios según su plan">
    <button v-if="plataforma.esAdmin" class="btn bg-slate-900 text-white hover:bg-slate-800" @click="abrir('generar')">Generar facturación del mes</button>
  </EncabezadoPagina>

  <div class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
    <div class="tarjeta p-4"><p class="text-sm text-slate-500">Pendiente de cobro</p><p class="text-xl font-semibold text-amber-700">{{ soles(resumen.PENDIENTE?.monto ?? 0) }}</p><p class="text-xs text-slate-500">{{ resumen.PENDIENTE?.cantidad ?? 0 }} factura(s)</p></div>
    <div class="tarjeta p-4"><p class="text-sm text-slate-500">Cobrado</p><p class="text-xl font-semibold text-emerald-700">{{ soles(resumen.PAGADA?.monto ?? 0) }}</p><p class="text-xs text-slate-500">{{ resumen.PAGADA?.cantidad ?? 0 }} factura(s)</p></div>
  </div>

  <div class="mb-4 grid gap-2 sm:grid-cols-[12rem_12rem] md:grid-cols-[12rem_12rem_1fr]">
    <input v-model="filtros.periodo" type="month" class="input" aria-label="Periodo" />
    <select v-model="filtros.estado" class="input">
      <option value="">Todos los estados</option>
      <option value="PENDIENTE">Pendientes</option>
      <option value="VENCIDA">Vencidas</option>
      <option value="PAGADA">Pagadas</option>
      <option value="ANULADA">Anuladas</option>
    </select>
    <BotonColumnas class="justify-self-end" :columnas="columnas" />
  </div>

  <TablaResponsiva :columnas="columnas" :filas="filas" :cargando="cargando" vacio="No hay facturas para estos filtros">
    <template #celda-tenant.nombre="{ fila }"><RouterLink :to="`/plataforma/estudios/${fila.tenant.id}`" class="font-medium hover:underline">{{ fila.tenant.nombre }}</RouterLink></template>
    <template #celda-monto="{ fila }"><span class="tabular-nums">{{ soles(fila.monto) }}</span></template>
    <template #celda-venceEn="{ fila }">{{ fecha(fila.venceEn) }}</template>
    <template #celda-estado="{ fila }">
      <span class="insignia" :class="estilo(fila)">{{ fila.vencida ? 'vencida' : fila.estado.toLowerCase() }}</span>
      <p v-if="fila.referenciaPago" class="text-xs text-slate-400">{{ fila.referenciaPago }}</p>
    </template>
    <template #acciones="{ fila }"><MenuAcciones :acciones="accionesFila(fila)" :etiqueta="`Acciones de la factura ${fila.numero ?? ''}`" /></template>
  </TablaResponsiva>
  <Paginacion :pag="pag" />

  <BaseModal :abierto="!!dlg.tipo" :titulo="{ generar: 'Generar facturación', pagar: 'Registrar pago', anular: 'Anular factura' }[dlg.tipo]" @cerrar="dlg.tipo = null">
    <form id="form-fact" class="space-y-3" @submit.prevent="confirmar">
      <template v-if="dlg.tipo === 'generar'">
        <p class="text-sm text-slate-600">Se emite una factura por cada estudio activo con plan. Si ya existe la del periodo, no se duplica.</p>
        <div><label class="etiqueta">Periodo</label><input v-model="dlg.periodo" type="month" class="input" required /></div>
      </template>
      <div v-else>
        <p class="mb-2 text-sm text-slate-600">{{ dlg.factura?.tenant.nombre }} · {{ dlg.factura?.periodo }} · {{ soles(dlg.factura?.monto) }}</p>
        <label class="etiqueta">{{ dlg.tipo === 'pagar' ? 'Referencia del pago (operación, transferencia…) *' : 'Motivo *' }}</label>
        <input v-model="dlg.texto" class="input" :minlength="dlg.tipo === 'pagar' ? 3 : 5" required />
      </div>
    </form>
    <template #pie>
      <button class="btn-secundario" @click="dlg.tipo = null">Cancelar</button>
      <button :class="dlg.tipo === 'anular' ? 'btn-peligro' : 'btn bg-slate-900 text-white'" form="form-fact" :disabled="dlg.enviando">Confirmar</button>
    </template>
  </BaseModal>
</template>
