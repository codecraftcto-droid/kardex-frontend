<script setup>
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useAuth } from '@/stores/auth';
import { useContexto } from '@/stores/contexto';
import { useListado } from '@/composables/useListado';
import { useTiempoReal } from '@/composables/useTiempoReal';
import { useAlmacenes } from '@/composables/useAlmacenes';
import { fecha } from '@/utils/formato';
import { DOCUMENTOS, ESTADOS_DOCUMENTO, monedaFmt } from '@/utils/comercial';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import TablaResponsiva from '@/components/TablaResponsiva.vue';
import Paginacion from '@/components/Paginacion.vue';
import CampoBusqueda from '@/components/CampoBusqueda.vue';
import Icono from '@/components/Icono.vue';
import MenuAcciones from '@/components/MenuAcciones.vue';
import BotonColumnas from '@/components/BotonColumnas.vue';

const route = useRoute();
const auth = useAuth();
const contexto = useContexto();
const cfg = computed(() => DOCUMENTOS[route.meta.tipo]);
const { almacenes } = useAlmacenes();
const { filas, cargando, filtros, pag, cargar } = useListado(() => cfg.value.api, { empresaId: contexto.empresaActivaId, estado: '', almacenId: '' });
onMounted(cargar);
useTiempoReal(['compra:cambio', 'venta:cambio'], cargar);

const columnas = computed(() => [
  { clave: 'comprobante', titulo: 'Comprobante' },
  { clave: 'terceroNombre', titulo: cfg.value.tercero },
  { clave: 'fechaEmision', titulo: 'Emisión' },
  { clave: 'almacen.nombre', titulo: 'Almacén', ocultarEnTarjeta: true },
  { clave: 'total', titulo: 'Total', clase: 'text-right' },
  { clave: 'estado', titulo: 'Estado' },
]);

/** Acciones de cada documento (menú ⋯) */
const accionesFila = (f) => [
  { texto: 'Ver documento', icono: 'comprobante', to: `${cfg.value.ruta}/${f.id}` },
  f.acciones.editar && { texto: 'Editar borrador', icono: 'editar', to: `${cfg.value.ruta}/${f.id}/editar` },
];
</script>

<template>
  <EncabezadoPagina :titulo="cfg.plural" :subtitulo="contexto.empresaActiva?.razonSocial">
    <RouterLink v-if="auth.canEnEmpresa(`${cfg.permiso}.crear`, contexto.empresaActivaId)" :to="`${cfg.ruta}/nueva`" class="btn-primario">
      <Icono nombre="agregar" /> Nueva {{ cfg.singular.toLowerCase() }}
    </RouterLink>
  </EncabezadoPagina>

  <div class="mb-4 grid gap-2 sm:grid-cols-[1fr_14rem_12rem] md:grid-cols-[1fr_14rem_12rem_auto]">
    <CampoBusqueda v-model="filtros.q" :placeholder="`${cfg.tercero}, RUC/DNI o número`" />
    <select v-model="filtros.almacenId" class="input">
      <option value="">Todos los almacenes</option>
      <option v-for="a in almacenes" :key="a.id" :value="a.id">{{ a.codigo }} — {{ a.nombre }}</option>
    </select>
    <select v-model="filtros.estado" class="input">
      <option value="">Todos los estados</option>
      <option v-for="(e, k) in ESTADOS_DOCUMENTO" :key="k" :value="k">{{ e.texto }}</option>
    </select>
    <BotonColumnas :columnas="columnas" />
  </div>

  <TablaResponsiva :columnas="columnas" :filas="filas" :cargando="cargando" :vacio="`No hay ${cfg.plural.toLowerCase()} registradas`">
    <template #celda-comprobante="{ fila }">
      <RouterLink :to="`${cfg.ruta}/${fila.id}`" class="font-medium whitespace-nowrap text-marca-700 hover:underline">
        {{ fila.comprobanteTipo }} {{ fila.serie }}-{{ fila.numero }}
      </RouterLink>
    </template>
    <template #celda-terceroNombre="{ fila }">
      <span>{{ fila.terceroNombre }}</span>
      <p class="font-mono text-xs text-slate-400">{{ fila.terceroDocumento }}</p>
    </template>
    <template #celda-fechaEmision="{ fila }">{{ fecha(fila.fechaEmision) }}</template>
    <template #celda-almacen.nombre="{ fila }">{{ fila.almacen.codigo }} — {{ fila.almacen.nombre }}</template>
    <template #celda-total="{ fila }"><span class="tabular-nums">{{ monedaFmt(fila.total, fila.moneda) }}</span></template>
    <template #celda-estado="{ fila }">
      <span class="insignia" :class="ESTADOS_DOCUMENTO[fila.estado].clase">{{ ESTADOS_DOCUMENTO[fila.estado].texto }}</span>
    </template>
    <template #acciones="{ fila }"><MenuAcciones :acciones="accionesFila(fila)" :etiqueta="`Acciones del documento ${fila.serie ?? ''}-${fila.numero ?? ''}`" /></template>
  </TablaResponsiva>
  <Paginacion :pag="pag" />
</template>
