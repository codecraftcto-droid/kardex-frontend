<script setup>
import { onMounted, ref } from 'vue';
import { apiPlataforma } from '@/services/apiPlataforma';
import { useListado } from '@/composables/useListado';
import { fechaHora } from '@/utils/formato';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import TablaResponsiva from '@/components/TablaResponsiva.vue';
import Paginacion from '@/components/Paginacion.vue';
import BaseModal from '@/components/BaseModal.vue';

const { filas, cargando, filtros, pag, cargar } = useListado('/auditoria', { accion: '' }, apiPlataforma);
delete filtros.q;
onMounted(cargar);
const detalle = ref(null);
const columnas = [
  { clave: 'accion', titulo: 'Acción' },
  { clave: 'fecha', titulo: 'Fecha' },
  { clave: 'admin', titulo: 'Usuario de plataforma' },
  { clave: 'estudio', titulo: 'Estudio' },
  { clave: 'ip', titulo: 'IP', ocultarEnTarjeta: true },
];
</script>

<template>
  <EncabezadoPagina titulo="Auditoría de plataforma" subtitulo="Registro inmutable de accesos y acciones de administración" />
  <div class="mb-4 sm:max-w-xs"><input v-model="filtros.accion" class="input" placeholder="Filtrar por acción (p. ej. suspender)" /></div>
  <TablaResponsiva :columnas="columnas" :filas="filas" :cargando="cargando" vacio="Sin registros">
    <template #celda-accion="{ fila }"><code class="text-sm">{{ fila.accion }}</code></template>
    <template #celda-fecha="{ fila }"><span class="whitespace-nowrap">{{ fechaHora(fila.fecha) }}</span></template>
    <template #celda-admin="{ fila }">{{ fila.admin ?? '—' }}</template>
    <template #celda-estudio="{ fila }">{{ fila.estudio ?? '—' }}</template>
    <template #acciones="{ fila }"><button v-if="fila.antes || fila.despues" class="btn-texto text-slate-700" @click="detalle = fila">Detalle</button></template>
  </TablaResponsiva>
  <Paginacion :pag="pag" />
  <BaseModal :abierto="!!detalle" titulo="Detalle" ancho="sm:max-w-2xl" @cerrar="detalle = null">
    <div v-if="detalle" class="grid gap-3 md:grid-cols-2">
      <div><h3 class="mb-1 text-sm font-medium">Antes</h3><pre class="max-h-80 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{{ JSON.stringify(detalle.antes, null, 2) ?? '—' }}</pre></div>
      <div><h3 class="mb-1 text-sm font-medium">Después</h3><pre class="max-h-80 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{{ JSON.stringify(detalle.despues, null, 2) ?? '—' }}</pre></div>
    </div>
  </BaseModal>
</template>
