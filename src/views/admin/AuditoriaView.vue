<script setup>
import { onMounted, ref } from 'vue';
import { descargar, mensajeError } from '@/services/api';
import { useContexto } from '@/stores/contexto';
import { useToast } from '@/stores/toast';
import { useListado } from '@/composables/useListado';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import TablaResponsiva from '@/components/TablaResponsiva.vue';
import Paginacion from '@/components/Paginacion.vue';
import BaseModal from '@/components/BaseModal.vue';
import Icono from '@/components/Icono.vue';
import MenuAcciones from '@/components/MenuAcciones.vue';
import BotonColumnas from '@/components/BotonColumnas.vue';

const contexto = useContexto();
const toast = useToast();
const { filas, cargando, filtros, pag, cargar } = useListado('/auditoria', { modulo: '', accion: '', empresaId: '', desde: '', hasta: '' });
delete filtros.q;
onMounted(cargar);

const modulos = ['auth', 'usuarios', 'empresas', 'sedes', 'almacenes', 'auditoria'];
const columnas = [
  { clave: 'accion', titulo: 'Acción' },
  { clave: 'fecha', titulo: 'Fecha' },
  { clave: 'usuario.nombres', titulo: 'Usuario' },
  { clave: 'modulo', titulo: 'Módulo' },
  { clave: 'ip', titulo: 'IP', ocultarEnTarjeta: true },
];
const detalle = ref(null);
const fecha = (f) => new Date(f).toLocaleString();

// Las fechas "hasta" incluyen todo el día
const parametros = () => ({
  ...Object.fromEntries(Object.entries(filtros).filter(([, v]) => v)),
  ...(filtros.hasta && { hasta: `${filtros.hasta}T23:59:59` }),
});

async function exportar() {
  try {
    await descargar('/auditoria/exportar', parametros(), `auditoria-${new Date().toISOString().slice(0, 10)}.csv`);
  } catch (e) {
    toast.error(mensajeError(e, 'No se pudo exportar'));
  }
}

/** Acciones de cada registro (menú ⋯) */
const accionesFila = (f) => [{ texto: 'Ver detalle del cambio', icono: 'auditoria', alHacer: () => (detalle.value = f) }];
</script>

<template>
  <EncabezadoPagina titulo="Auditoría" subtitulo="Registro inmutable de accesos y cambios">
    <button v-can="'auditoria.exportar'" class="btn-secundario" @click="exportar"><Icono nombre="descargar" /> Exportar CSV</button>
  </EncabezadoPagina>

  <div class="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
    <select v-model="filtros.modulo" class="input">
      <option value="">Todos los módulos</option>
      <option v-for="m in modulos" :key="m" :value="m">{{ m }}</option>
    </select>
    <input v-model="filtros.accion" class="input" placeholder="Acción (p. ej. login)" />
    <select v-model="filtros.empresaId" class="input">
      <option value="">Todas las empresas</option>
      <option v-for="e in contexto.empresas" :key="e.id" :value="e.id">{{ e.razonSocial }}</option>
    </select>
    <label class="flex items-center gap-2"><span class="text-sm text-slate-500">Desde</span><input v-model="filtros.desde" type="date" class="input" /></label>
    <label class="flex items-center gap-2"><span class="text-sm text-slate-500">Hasta</span><input v-model="filtros.hasta" type="date" class="input" /></label>
    <BotonColumnas :columnas="columnas" />
  </div>

  <TablaResponsiva :columnas="columnas" :filas="filas" :cargando="cargando" vacio="Sin registros para estos filtros">
    <template #celda-accion="{ fila }"><code class="text-sm">{{ fila.accion }}</code></template>
    <template #celda-fecha="{ fila }"><span class="whitespace-nowrap">{{ fecha(fila.fecha) }}</span></template>
    <template #celda-usuario.nombres="{ fila }">{{ fila.usuario?.nombres ?? 'Sistema' }}</template>
    <template #acciones="{ fila }"><MenuAcciones :acciones="accionesFila(fila)" :etiqueta="'Acciones del registro'" /></template>
  </TablaResponsiva>
  <Paginacion :pag="pag" />

  <BaseModal :abierto="!!detalle" titulo="Detalle del evento" ancho="sm:max-w-3xl" @cerrar="detalle = null">
    <template v-if="detalle">
      <dl class="mb-4 grid gap-2 text-sm sm:grid-cols-2">
        <div><dt class="text-slate-500">Acción</dt><dd><code>{{ detalle.accion }}</code></dd></div>
        <div><dt class="text-slate-500">Fecha</dt><dd>{{ fecha(detalle.fecha) }}</dd></div>
        <div><dt class="text-slate-500">Usuario</dt><dd>{{ detalle.usuario?.nombres ?? '—' }} <span class="text-slate-400">{{ detalle.usuario?.email }}</span></dd></div>
        <div><dt class="text-slate-500">Recurso</dt><dd>{{ detalle.recurso }} <code class="text-xs text-slate-400">{{ detalle.recursoId }}</code></dd></div>
        <div><dt class="text-slate-500">IP</dt><dd>{{ detalle.ip }}</dd></div>
        <div><dt class="text-slate-500">Dispositivo</dt><dd class="break-words">{{ detalle.dispositivo }}</dd></div>
      </dl>
      <div class="grid gap-3 md:grid-cols-2">
        <div>
          <h3 class="mb-1 text-sm font-medium text-slate-600">Antes</h3>
          <pre class="max-h-80 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{{ detalle.antes ? JSON.stringify(detalle.antes, null, 2) : '—' }}</pre>
        </div>
        <div>
          <h3 class="mb-1 text-sm font-medium text-slate-600">Después</h3>
          <pre class="max-h-80 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{{ detalle.despues ? JSON.stringify(detalle.despues, null, 2) : '—' }}</pre>
        </div>
      </div>
    </template>
  </BaseModal>
</template>
