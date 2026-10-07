<script setup>
import { onMounted, ref } from 'vue';
import { api, mensajeError } from '@/services/api';
import { useToast } from '@/stores/toast';
import { useRoute } from 'vue-router';
import { useContexto } from '@/stores/contexto';
import { useListado } from '@/composables/useListado';
import { useTiempoReal } from '@/composables/useTiempoReal';
import { fechaHora, soles } from '@/utils/formato';
import { ESTADOS_SUNAT, TIPOS_COMPROBANTE, estiloEstado, numeroCompleto } from '@/utils/pos';
import InsigniaSunat from '@/components/InsigniaSunat.vue';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import TablaResponsiva from '@/components/TablaResponsiva.vue';
import Paginacion from '@/components/Paginacion.vue';
import CampoBusqueda from '@/components/CampoBusqueda.vue';
import MenuAcciones from '@/components/MenuAcciones.vue';
import BotonColumnas from '@/components/BotonColumnas.vue';

const route = useRoute();
const contexto = useContexto();
const toast = useToast();
const { filas, cargando, filtros, pag, cargar } = useListado('/pos/comprobantes', {
  empresaId: contexto.empresaActivaId, tipo: '', estado: '', estadoSunat: route.query.sunat ?? '', sesionCajaId: route.query.sesion ?? '',
});

// ── Estado de la facturación electrónica de la empresa ──
const sunat = ref(null);
const cargarResumen = async () => {
  try { sunat.value = (await api.get('/cpe/resumen', { params: { empresaId: contexto.empresaActivaId } })).data; } catch { sunat.value = null; }
};
const pendientes = () => (sunat.value?.porEstado.PENDIENTE ?? 0);
const enviando = ref(false);
async function enviarPendientes() {
  enviando.value = true;
  try {
    const { data } = await api.post('/cpe/pendientes/enviar', { empresaId: contexto.empresaActivaId });
    toast.exito(`${data.encolados} comprobante(s) en camino a SUNAT; el estado se actualiza solo`);
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    enviando.value = false;
  }
}
onMounted(() => (cargar(), cargarResumen()));
useTiempoReal('pos:comprobante', () => (cargar(), cargarResumen()));

const columnas = [
  { clave: 'numero', titulo: 'Comprobante' },
  { clave: 'fechaEmision', titulo: 'Emisión' },
  { clave: 'clienteNombre', titulo: 'Cliente' },
  { clave: 'total', titulo: 'Total', clase: 'text-right' },
  { clave: 'estado', titulo: 'Estado' },
  { clave: 'estadoSunat', titulo: 'SUNAT' },
  { clave: 'caja.nombre', titulo: 'Caja', ocultarEnTarjeta: true },
];

/** Acciones de cada comprobante (menú ⋯) */
const accionesFila = (f) => [
  { texto: 'Ver comprobante', icono: 'comprobante', to: `/comprobantes/${f.id}` },
  { separador: true },
  { texto: 'Imprimir ticket', icono: 'imprimir', to: `/imprimir/comprobante/${f.id}/ticket`, nuevaPestana: true },
  { texto: 'Imprimir A4', icono: 'imprimir', to: `/imprimir/comprobante/${f.id}/a4`, nuevaPestana: true },
];
</script>

<template>
  <EncabezadoPagina titulo="Comprobantes" :subtitulo="filtros.sesionCajaId ? 'Ventas del turno de caja' : contexto.empresaActiva?.razonSocial">
    <button v-if="filtros.sesionCajaId" class="btn-secundario" @click="filtros.sesionCajaId = ''">Ver todos</button>
  </EncabezadoPagina>
  <!-- Facturación electrónica: aviso según el estado de la empresa -->
  <template v-if="sunat">
    <p v-if="!sunat.configurada" class="mb-3 flex flex-wrap items-center gap-x-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
      Esta empresa aún <strong>no envía comprobantes a SUNAT</strong>: quedan como "pendientes" hasta configurar la facturación electrónica.
      <RouterLink v-if="sunat.puedeConfigurar" :to="{ path: '/empresas', query: { facturacion: contexto.empresaActivaId } }" class="font-medium underline">Configurar ahora</RouterLink>
    </p>
    <div v-else-if="pendientes() || sunat.porEstado.RECHAZADO" class="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
      <span v-if="pendientes()" class="text-slate-700"><strong class="tabular-nums">{{ pendientes() }}</strong> pendiente(s) de envío</span>
      <button v-if="pendientes() && sunat.puedeEnviar" class="btn-secundario min-h-8 px-3 text-xs" :disabled="enviando" @click="enviarPendientes">Enviar a SUNAT</button>
      <button v-if="sunat.porEstado.RECHAZADO" class="ml-auto font-medium text-red-700 hover:underline" @click="filtros.estadoSunat = 'RECHAZADO'">
        {{ sunat.porEstado.RECHAZADO }} rechazado(s) por SUNAT: revisar
      </button>
      <span v-if="sunat.ambiente === 'PRUEBAS'" class="insignia ml-auto bg-indigo-50 text-indigo-700">Ambiente de pruebas{{ sunat.proveedor === 'SIMULADO' ? ' (simulado)' : '' }}</span>
    </div>
  </template>
  <div class="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_11rem_9rem_11rem_auto]">
    <CampoBusqueda v-model="filtros.q" placeholder="Número, cliente o documento" />
    <select v-model="filtros.tipo" class="input">
      <option value="">Todos los tipos</option>
      <option v-for="(t, k) in TIPOS_COMPROBANTE" :key="k" :value="k">{{ t.texto }}</option>
    </select>
    <select v-model="filtros.estado" class="input">
      <option value="">Todos</option>
      <option value="EMITIDO">Emitidos</option>
      <option value="ANULADO">Anulados</option>
    </select>
    <select v-model="filtros.estadoSunat" class="input" aria-label="Estado en SUNAT">
      <option value="">Todo estado SUNAT</option>
      <option v-for="k in ['PENDIENTE', 'ENVIADO', 'ACEPTADO', 'OBSERVADO', 'RECHAZADO', 'ANULADO']" :key="k" :value="k">{{ ESTADOS_SUNAT[k].corto }}</option>
    </select>
    <BotonColumnas :columnas="columnas" />
  </div>

  <TablaResponsiva :columnas="columnas" :filas="filas" :cargando="cargando" vacio="No hay comprobantes">
    <template #celda-numero="{ fila }">
      <RouterLink :to="`/comprobantes/${fila.id}`" class="font-mono font-medium whitespace-nowrap text-marca-700 hover:underline">{{ numeroCompleto(fila) }}</RouterLink>
      <p class="text-xs text-slate-500">{{ TIPOS_COMPROBANTE[fila.tipo].texto }}</p>
    </template>
    <template #celda-fechaEmision="{ fila }"><span class="whitespace-nowrap">{{ fechaHora(fila.fechaEmision) }}</span></template>
    <template #celda-total="{ fila }"><span class="tabular-nums" :class="{ 'line-through text-slate-400': fila.estado === 'ANULADO' }">{{ fila.tipo === 'NOTA_CREDITO' ? '−' : '' }}{{ soles(fila.total) }}</span>
      <span v-if="fila.formaPago === 'CREDITO' && fila.estado !== 'ANULADO'" class="block text-xs" :class="Number(fila.saldoPendiente) > 0 ? 'text-amber-700' : 'text-emerald-700'">
        Crédito · {{ Number(fila.saldoPendiente) > 0 ? `debe ${soles(fila.saldoPendiente)}` : 'pagado' }}
      </span>
    </template>
    <template #celda-estadoSunat="{ fila }"><InsigniaSunat v-if="fila.tipo !== 'NOTA_VENTA'" :estado="fila.estadoSunat" corto /><span v-else class="text-xs text-slate-400">Interno</span></template>
    <template #celda-estado="{ fila }">
      <span class="insignia" :class="estiloEstado(fila)">{{ fila.estado === 'ANULADO' ? 'Anulado' : 'Emitido' }}</span>
      <span v-if="fila.estadoSunat === 'PENDIENTE'" class="insignia ml-1 bg-amber-50 text-amber-700">SUNAT pendiente</span>
    </template>
    <template #acciones="{ fila }"><MenuAcciones :acciones="accionesFila(fila)" :etiqueta="`Acciones de ${numeroCompleto(fila)}`" /></template>
  </TablaResponsiva>
  <Paginacion :pag="pag" />
</template>
