<script setup>
import { onMounted, reactive, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '@/stores/auth';
import { useContexto } from '@/stores/contexto';
import { useListado } from '@/composables/useListado';
import { useTiempoReal } from '@/composables/useTiempoReal';
import { useAlmacenes } from '@/composables/useAlmacenes';
import { fechaHora } from '@/utils/formato';
import { MOTIVOS, estiloTipo } from '@/utils/kardex';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import TablaResponsiva from '@/components/TablaResponsiva.vue';
import Paginacion from '@/components/Paginacion.vue';
import CampoBusqueda from '@/components/CampoBusqueda.vue';
import Icono from '@/components/Icono.vue';
import MenuAcciones from '@/components/MenuAcciones.vue';
import ModalMovimiento from '@/components/ModalMovimiento.vue';
import BotonColumnas from '@/components/BotonColumnas.vue';

const router = useRouter();
const auth = useAuth();
const contexto = useContexto();
const { almacenes } = useAlmacenes();
const { filas, cargando, filtros, pag, cargar } = useListado('/kardex/movimientos', {
  empresaId: contexto.empresaActivaId,
  almacenId: '',
  tipo: '',
});
onMounted(cargar);
useTiempoReal('kardex:movimiento', cargar);

const columnas = [
  { clave: 'numero', titulo: 'Número' },
  { clave: 'fecha', titulo: 'Fecha' },
  { clave: 'motivo', titulo: 'Tipo / motivo' },
  { clave: 'almacen.nombre', titulo: 'Almacén' },
  { clave: 'documento', titulo: 'Documento' },
  { clave: 'usuario.nombres', titulo: 'Registró', ocultarEnTarjeta: true },
];
const documento = (m) => (m.documentoNumero ? `${m.documentoTipo ?? ''} ${m.documentoSerie ?? ''}-${m.documentoNumero}`.trim() : '—');

/** Acciones de cada movimiento (menú ⋯) */
const detalle = reactive({ abierto: false, id: null });
const verDetalle = (f) => Object.assign(detalle, { abierto: true, id: f.id });
const accionesFila = (f) => [{ texto: `Ver detalle (${f._count.detalles} producto${f._count.detalles === 1 ? '' : 's'})`, icono: 'movimientos', alHacer: () => verDetalle(f) }];
</script>

<template>
  <EncabezadoPagina titulo="Movimientos" :subtitulo="contexto.empresaActiva?.razonSocial">
    <RouterLink v-if="auth.canEnEmpresa('kardex.entrada.crear', contexto.empresaActivaId)" to="/movimientos/entrada" class="btn-primario">
      <Icono nombre="entrada" /> Nueva entrada
    </RouterLink>
    <RouterLink v-if="auth.canEnEmpresa('kardex.salida.crear', contexto.empresaActivaId)" to="/movimientos/salida" class="btn-secundario">
      <Icono nombre="salida" /> Nueva salida
    </RouterLink>
  </EncabezadoPagina>

  <div class="mb-4 grid gap-2 sm:grid-cols-[1fr_16rem_12rem] md:grid-cols-[1fr_16rem_12rem_auto]">
    <CampoBusqueda v-model="filtros.q" placeholder="Número o documento" />
    <select v-model="filtros.almacenId" class="input">
      <option value="">Todos los almacenes</option>
      <option v-for="a in almacenes" :key="a.id" :value="a.id">{{ a.codigo }} — {{ a.nombre }}</option>
    </select>
    <select v-model="filtros.tipo" class="input">
      <option value="">Entradas y salidas</option>
      <option value="ENTRADA">Solo entradas</option>
      <option value="SALIDA">Solo salidas</option>
    </select>
    <BotonColumnas :columnas="columnas" />
  </div>

  <TablaResponsiva :columnas="columnas" :filas="filas" :cargando="cargando" vacio="No hay movimientos">
    <template #celda-numero="{ fila }">
      <button class="font-mono font-medium text-marca-700 hover:underline" @click="verDetalle(fila)">{{ fila.numero }}</button>
      <span v-if="fila.anuladoPor" class="insignia ml-2 bg-red-50 text-red-700">Anulado</span>
    </template>
    <template #celda-fecha="{ fila }"><span class="whitespace-nowrap">{{ fechaHora(fila.fecha) }}</span></template>
    <template #celda-motivo="{ fila }">
      <span class="insignia" :class="estiloTipo(fila.tipo)">{{ fila.tipo === 'ENTRADA' ? 'Entrada' : 'Salida' }}</span>
      <span class="ml-1 text-slate-600">{{ MOTIVOS[fila.motivo] }}</span>
      <span v-if="fila.anula" class="ml-1 text-xs text-slate-400">de {{ fila.anula.numero }}</span>
    </template>
    <template #celda-almacen.nombre="{ fila }">{{ fila.almacen.codigo }} — {{ fila.almacen.nombre }}</template>
    <template #celda-documento="{ fila }"><span class="whitespace-nowrap">{{ documento(fila) }}</span></template>
    <template #acciones="{ fila }"><MenuAcciones :acciones="accionesFila(fila)" :etiqueta="`Acciones del movimiento ${fila.numero}`" /></template>
  </TablaResponsiva>
  <Paginacion :pag="pag" />

  <ModalMovimiento :abierto="detalle.abierto" :movimiento-id="detalle.id" @cerrar="detalle.abierto = false" @cambio="cargar" />
</template>
