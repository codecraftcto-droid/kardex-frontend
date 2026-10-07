<script setup>
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '@/stores/auth';
import { useContexto } from '@/stores/contexto';
import { useListado } from '@/composables/useListado';
import { useTiempoReal } from '@/composables/useTiempoReal';
import { fecha, fechaHora, num } from '@/utils/formato';
import { ESTADOS_SUNAT, TIPOS_DOCUMENTO } from '@/utils/pos';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import TablaResponsiva from '@/components/TablaResponsiva.vue';
import Paginacion from '@/components/Paginacion.vue';
import CampoBusqueda from '@/components/CampoBusqueda.vue';
import BotonColumnas from '@/components/BotonColumnas.vue';
import MenuAcciones from '@/components/MenuAcciones.vue';
import InsigniaSunat from '@/components/InsigniaSunat.vue';
import ModalGuia from '@/components/ModalGuia.vue';
import Icono from '@/components/Icono.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const contexto = useContexto();
const { filas, cargando, filtros, pag, cargar } = useListado('/guias', { empresaId: contexto.empresaActivaId, estadoSunat: '' });
onMounted(cargar);
useTiempoReal('gre:guia', cargar);

const columnas = [
  { clave: 'numero', titulo: 'Guía' },
  { clave: 'fechaTraslado', titulo: 'Traslado' },
  { clave: 'destinatarioNombre', titulo: 'Destinatario' },
  { clave: 'motivo', titulo: 'Motivo', ocultarEnTarjeta: true },
  { clave: 'ruta', titulo: 'Ruta (ubigeo)', ocultarEnTarjeta: true },
  { clave: 'pesoBruto', titulo: 'Peso', clase: 'text-right', ocultarEnTarjeta: true },
  { clave: 'estadoSunat', titulo: 'SUNAT' },
];
const MOTIVO_CORTO = { '01': 'Venta', '02': 'Compra', '04': 'Entre establecimientos', '08': 'Importación', '09': 'Exportación', '13': 'Otros', '14': 'Venta sujeta a confirmación', '17': 'Transformación', '18': 'Emisor itinerante', '19': 'Zona primaria' };
const numero = (g) => `${g.serie}-${String(g.numero).padStart(8, '0')}`;

// Detalle en modal: ?guia=<id>
const guiaId = computed(() => (typeof route.query.guia === 'string' ? route.query.guia : null));
const ver = (id) => router.push({ query: { ...route.query, guia: id } });
const cerrar = () => router.replace({ query: { ...route.query, guia: undefined } });
const accionesFila = (g) => [
  { texto: 'Ver guía', icono: 'comprobante', alHacer: () => ver(g.id) },
  { separador: true },
  { texto: 'Imprimir A4', icono: 'imprimir', to: `/imprimir/guia/${g.id}/a4`, nuevaPestana: true },
  { texto: 'Imprimir ticket', icono: 'imprimir', to: `/imprimir/guia/${g.id}/ticket`, nuevaPestana: true },
];
const puedeEmitir = computed(() => auth.canEnEmpresa('gre.guia.crear', contexto.empresaActivaId));
</script>

<template>
  <EncabezadoPagina titulo="Guías de remisión" :subtitulo="contexto.empresaActiva?.razonSocial">
    <RouterLink v-if="puedeEmitir" to="/guias/nueva" class="btn-primario"><Icono nombre="agregar" /> Nueva guía</RouterLink>
  </EncabezadoPagina>
  <p class="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
    Para trasladar productos de una transferencia o de una venta, emita la guía desde ese documento: los datos se llenan solos.
  </p>
  <div class="mb-4 grid gap-2 sm:grid-cols-[1fr_12rem] md:grid-cols-[1fr_12rem_auto]">
    <CampoBusqueda v-model="filtros.q" placeholder="Número, destinatario o documento" />
    <select v-model="filtros.estadoSunat" class="input" aria-label="Estado en SUNAT">
      <option value="">Todo estado SUNAT</option>
      <option v-for="k in ['PENDIENTE', 'ENVIADO', 'ACEPTADO', 'OBSERVADO', 'RECHAZADO']" :key="k" :value="k">{{ ESTADOS_SUNAT[k].corto }}</option>
    </select>
    <BotonColumnas :columnas="columnas" />
  </div>

  <TablaResponsiva :columnas="columnas" :filas="filas" :cargando="cargando" vacio="Aún no hay guías de remisión">
    <template #celda-numero="{ fila }">
      <button class="font-mono font-medium text-marca-700 hover:underline" @click="ver(fila.id)">{{ numero(fila) }}</button>
      <span v-if="fila.estado === 'ANULADA'" class="insignia ml-1 bg-red-50 text-red-700">Anulada</span>
      <p class="text-xs text-slate-500">{{ fechaHora(fila.fechaEmision) }}</p>
    </template>
    <template #celda-fechaTraslado="{ fila }">{{ fecha(fila.fechaTraslado) }}</template>
    <template #celda-destinatarioNombre="{ fila }">
      <span class="font-medium">{{ fila.destinatarioNombre }}</span>
      <p class="text-xs text-slate-500">{{ TIPOS_DOCUMENTO[fila.destinatarioTipoDoc] }} {{ fila.destinatarioNumDoc }}</p>
    </template>
    <template #celda-motivo="{ fila }">{{ MOTIVO_CORTO[fila.motivo] ?? fila.motivo }}</template>
    <template #celda-ruta="{ fila }"><span class="font-mono text-xs whitespace-nowrap">{{ fila.partidaUbigeo }} → {{ fila.llegadaUbigeo }}</span></template>
    <template #celda-pesoBruto="{ fila }"><span class="tabular-nums">{{ num(fila.pesoBruto, 2) }} {{ fila.unidadPeso === 'TNE' ? 't' : 'kg' }}</span></template>
    <template #celda-estadoSunat="{ fila }"><InsigniaSunat :estado="fila.estadoSunat" corto /></template>
    <template #acciones="{ fila }"><MenuAcciones :acciones="accionesFila(fila)" :etiqueta="`Acciones de la guía ${numero(fila)}`" /></template>
  </TablaResponsiva>
  <Paginacion :pag="pag" />

  <ModalGuia :abierto="!!guiaId" :guia-id="guiaId" @cerrar="cerrar" @cambio="cargar" />
</template>
