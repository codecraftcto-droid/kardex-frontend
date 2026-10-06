<script setup>
import { onMounted } from 'vue';
import { useContexto } from '@/stores/contexto';
import { useListado } from '@/composables/useListado';
import { useTiempoReal } from '@/composables/useTiempoReal';
import { fecha, soles } from '@/utils/formato';
import { TIPOS_DOCUMENTO, TRAMOS } from '@/utils/pos';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import TablaResponsiva from '@/components/TablaResponsiva.vue';
import Paginacion from '@/components/Paginacion.vue';
import CampoBusqueda from '@/components/CampoBusqueda.vue';
import MenuAcciones from '@/components/MenuAcciones.vue';
import BotonColumnas from '@/components/BotonColumnas.vue';

const contexto = useContexto();
const { filas, cargando, filtros, pag, cargar, extra } = useListado('/cxc/clientes', { empresaId: contexto.empresaActivaId, vencidos: '' });
onMounted(cargar);
useTiempoReal('cxc:cambio', cargar);

const columnas = [
  { clave: 'nombre', titulo: 'Cliente' },
  { clave: 'documentos', titulo: 'Doc.', clase: 'text-center', ocultarEnTarjeta: true },
  { clave: 'saldo', titulo: 'Saldo', clase: 'text-right' },
  { clave: 'vencido', titulo: 'Vencido', clase: 'text-right' },
  { clave: 'diasVencido', titulo: 'Atraso', clase: 'text-right' },
  { clave: 'proximoVencimiento', titulo: 'Próximo venc.', ocultarEnTarjeta: true },
];

/** Acciones de cada cliente (menú ⋯) */
const accionesFila = (f) => [
  { texto: 'Ver estado de cuenta', icono: 'tarjeta', to: `/cuentas-por-cobrar/${f.id}` },
  { texto: 'Imprimir estado de cuenta', icono: 'imprimir', to: `/imprimir/estado-cuenta/${f.id}`, nuevaPestana: true },
];
</script>

<template>
  <EncabezadoPagina titulo="Cuentas por cobrar" :subtitulo="contexto.empresaActiva?.razonSocial">
    <RouterLink to="/reportes?tipo=cxc" class="btn-secundario">Reporte de antigüedad</RouterLink>
  </EncabezadoPagina>

  <!-- Antigüedad de saldos -->
  <section v-if="extra?.totales" class="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
    <div class="tarjeta p-3">
      <p class="text-xs text-slate-500">Total por cobrar</p>
      <p class="text-lg font-semibold tabular-nums">{{ soles(extra.totales.saldo) }}</p>
    </div>
    <div v-for="(txt, k) in TRAMOS" :key="k" class="tarjeta p-3" :class="{ 'border-red-200 bg-red-50/40': k !== 'porVencer' && Number(extra.totales[k]) > 0 }">
      <p class="text-xs text-slate-500">{{ txt }}</p>
      <p class="text-lg font-semibold tabular-nums" :class="k !== 'porVencer' && Number(extra.totales[k]) > 0 ? 'text-red-700' : ''">{{ soles(extra.totales[k]) }}</p>
    </div>
  </section>

  <div class="mb-4 grid gap-2 sm:grid-cols-[1fr_14rem] md:grid-cols-[1fr_14rem_auto]">
    <CampoBusqueda v-model="filtros.q" placeholder="Cliente, DNI o RUC" />
    <select v-model="filtros.vencidos" class="input" aria-label="Filtrar">
      <option value="">Todos los que deben</option>
      <option value="true">Solo con cuotas vencidas</option>
    </select>
    <BotonColumnas :columnas="columnas" />
  </div>

  <TablaResponsiva :columnas="columnas" :filas="filas" :cargando="cargando" vacio="Ningún cliente tiene saldo pendiente">
    <template #celda-nombre="{ fila }">
      <RouterLink :to="`/cuentas-por-cobrar/${fila.id}`" class="font-medium text-marca-700 hover:underline">{{ fila.nombre }}</RouterLink>
      <span class="block text-xs text-slate-500">{{ TIPOS_DOCUMENTO[fila.tipoDocumento] }} {{ fila.numeroDocumento }}<template v-if="fila.telefono"> · {{ fila.telefono }}</template></span>
    </template>
    <template #celda-saldo="{ fila }">
      <span class="tabular-nums">{{ soles(fila.saldo) }}</span>
      <span v-if="fila.limiteCredito != null" class="block text-xs text-slate-500">de {{ soles(fila.limiteCredito) }}</span>
    </template>
    <template #celda-vencido="{ fila }"><span class="tabular-nums" :class="Number(fila.vencido) > 0 ? 'font-semibold text-red-700' : 'text-slate-400'">{{ Number(fila.vencido) > 0 ? soles(fila.vencido) : '—' }}</span></template>
    <template #celda-diasVencido="{ fila }">
      <span v-if="fila.diasVencido" class="insignia" :class="fila.diasVencido > 60 ? 'bg-red-100 text-red-800' : fila.diasVencido > 30 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'">{{ fila.diasVencido }} días</span>
      <span v-else class="insignia bg-emerald-50 text-emerald-700">Al día</span>
    </template>
    <template #celda-proximoVencimiento="{ fila }">{{ fila.proximoVencimiento ? fecha(fila.proximoVencimiento) : '—' }}</template>
    <template #acciones="{ fila }"><MenuAcciones :acciones="accionesFila(fila)" :etiqueta="`Acciones de ${fila.nombre}`" /></template>
  </TablaResponsiva>
  <Paginacion :pag="pag" />
</template>
