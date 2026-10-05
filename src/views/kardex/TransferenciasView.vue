<script setup>
import { onMounted } from 'vue';
import { useAuth } from '@/stores/auth';
import { useContexto } from '@/stores/contexto';
import { useListado } from '@/composables/useListado';
import { useTiempoReal } from '@/composables/useTiempoReal';
import { useAlmacenes } from '@/composables/useAlmacenes';
import { fechaHora } from '@/utils/formato';
import { ESTADOS_TRANSFERENCIA } from '@/utils/kardex';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import TablaResponsiva from '@/components/TablaResponsiva.vue';
import Paginacion from '@/components/Paginacion.vue';
import CampoBusqueda from '@/components/CampoBusqueda.vue';
import Icono from '@/components/Icono.vue';

const auth = useAuth();
const contexto = useContexto();
const { almacenes } = useAlmacenes();
const { filas, cargando, filtros, pag, cargar } = useListado('/transferencias', {
  empresaId: contexto.empresaActivaId,
  pendientes: 'true',
  estado: '',
  almacenId: '',
});
onMounted(cargar);
useTiempoReal('transferencia:cambio', cargar);

const pestanas = [
  { valor: 'pendientes', texto: 'Pendientes' },
  { valor: '', texto: 'Todas' },
  ...Object.entries(ESTADOS_TRANSFERENCIA).map(([valor, e]) => ({ valor, texto: e.texto })),
];
const activa = () => (filtros.pendientes === 'true' ? 'pendientes' : filtros.estado);
function elegir(valor) {
  Object.assign(filtros, valor === 'pendientes' ? { pendientes: 'true', estado: '' } : { pendientes: '', estado: valor });
}

const columnas = [
  { clave: 'numero', titulo: 'Número' },
  { clave: 'estado', titulo: 'Estado' },
  { clave: 'ruta', titulo: 'Origen → destino' },
  { clave: 'solicitadoEn', titulo: 'Solicitada' },
  { clave: 'solicitadoPor.nombres', titulo: 'Solicitó', ocultarEnTarjeta: true },
];
const pendienteMia = (t) => Object.values(t.acciones).some(Boolean) && !['RECIBIDA', 'RECHAZADA', 'CANCELADA'].includes(t.estado);
</script>

<template>
  <EncabezadoPagina titulo="Transferencias" :subtitulo="contexto.empresaActiva?.razonSocial">
    <RouterLink v-if="auth.canEnEmpresa('transferencia.solicitar', contexto.empresaActivaId)" to="/transferencias/nueva" class="btn-primario">
      <Icono nombre="agregar" /> Nueva transferencia
    </RouterLink>
  </EncabezadoPagina>

  <!-- Pestañas con scroll horizontal contenido (nunca de la página) -->
  <div class="mb-3 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
    <div class="flex w-max gap-1 rounded-lg bg-slate-100 p-1">
      <button
        v-for="p in pestanas"
        :key="p.valor"
        class="min-h-10 rounded-md px-3 text-sm font-medium whitespace-nowrap"
        :class="activa() === p.valor ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'"
        @click="elegir(p.valor)"
      >
        {{ p.texto }}
      </button>
    </div>
  </div>

  <div class="mb-4 grid gap-2 sm:grid-cols-[1fr_16rem]">
    <CampoBusqueda v-model="filtros.q" placeholder="Número de transferencia" />
    <select v-model="filtros.almacenId" class="input">
      <option value="">Todos los almacenes</option>
      <option v-for="a in almacenes" :key="a.id" :value="a.id">{{ a.codigo }} — {{ a.nombre }}</option>
    </select>
  </div>

  <TablaResponsiva :columnas="columnas" :filas="filas" :cargando="cargando" vacio="No hay transferencias">
    <template #celda-numero="{ fila }">
      <RouterLink :to="`/transferencias/${fila.id}`" class="font-mono font-medium text-marca-700 hover:underline">{{ fila.numero }}</RouterLink>
      <span v-if="pendienteMia(fila)" class="insignia ml-2 bg-amber-100 text-amber-800">Requiere su acción</span>
    </template>
    <template #celda-estado="{ fila }">
      <span class="insignia" :class="ESTADOS_TRANSFERENCIA[fila.estado].clase">{{ ESTADOS_TRANSFERENCIA[fila.estado].texto }}</span>
    </template>
    <template #celda-ruta="{ fila }">
      <span class="whitespace-nowrap">{{ fila.origen.codigo }} {{ fila.origen.nombre }}</span>
      <span class="mx-1 text-slate-400">→</span>
      <span class="whitespace-nowrap">{{ fila.destino.codigo }} {{ fila.destino.nombre }}</span>
    </template>
    <template #celda-solicitadoEn="{ fila }"><span class="whitespace-nowrap">{{ fechaHora(fila.solicitadoEn) }}</span></template>
    <template #acciones="{ fila }">
      <RouterLink :to="`/transferencias/${fila.id}`" class="btn-texto">Ver ({{ fila._count.detalles }})</RouterLink>
    </template>
  </TablaResponsiva>
  <Paginacion :pag="pag" />
</template>
