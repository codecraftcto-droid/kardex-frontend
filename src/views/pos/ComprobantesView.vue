<script setup>
import { onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useContexto } from '@/stores/contexto';
import { useListado } from '@/composables/useListado';
import { useTiempoReal } from '@/composables/useTiempoReal';
import { fechaHora, soles } from '@/utils/formato';
import { TIPOS_COMPROBANTE, estiloEstado, numeroCompleto } from '@/utils/pos';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import TablaResponsiva from '@/components/TablaResponsiva.vue';
import Paginacion from '@/components/Paginacion.vue';
import CampoBusqueda from '@/components/CampoBusqueda.vue';
import MenuAcciones from '@/components/MenuAcciones.vue';
import BotonColumnas from '@/components/BotonColumnas.vue';

const route = useRoute();
const contexto = useContexto();
const { filas, cargando, filtros, pag, cargar } = useListado('/pos/comprobantes', {
  empresaId: contexto.empresaActivaId, tipo: '', estado: '', sesionCajaId: route.query.sesion ?? '',
});
onMounted(cargar);
useTiempoReal('pos:comprobante', cargar);

const columnas = [
  { clave: 'numero', titulo: 'Comprobante' },
  { clave: 'fechaEmision', titulo: 'Emisión' },
  { clave: 'clienteNombre', titulo: 'Cliente' },
  { clave: 'total', titulo: 'Total', clase: 'text-right' },
  { clave: 'estado', titulo: 'Estado' },
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
  <p class="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
    Las facturas, boletas y notas de crédito aún <strong>no se envían a SUNAT</strong>: quedan como "pendiente de envío" hasta conectar la facturación electrónica.
  </p>
  <div class="mb-4 grid gap-2 sm:grid-cols-[1fr_12rem_10rem] md:grid-cols-[1fr_12rem_10rem_auto]">
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
    <template #celda-estado="{ fila }">
      <span class="insignia" :class="estiloEstado(fila)">{{ fila.estado === 'ANULADO' ? 'Anulado' : 'Emitido' }}</span>
      <span v-if="fila.estadoSunat === 'PENDIENTE'" class="insignia ml-1 bg-amber-50 text-amber-700">SUNAT pendiente</span>
    </template>
    <template #acciones="{ fila }"><MenuAcciones :acciones="accionesFila(fila)" :etiqueta="`Acciones de ${numeroCompleto(fila)}`" /></template>
  </TablaResponsiva>
  <Paginacion :pag="pag" />
</template>
