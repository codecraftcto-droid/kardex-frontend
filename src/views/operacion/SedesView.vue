<script setup>
import { onMounted, reactive, ref, watch } from 'vue';
import { api, mensajeError } from '@/services/api';
import { useAuth } from '@/stores/auth';
import { useContexto } from '@/stores/contexto';
import { useToast } from '@/stores/toast';
import { useListado } from '@/composables/useListado';
import { useTiempoReal } from '@/composables/useTiempoReal';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import TablaResponsiva from '@/components/TablaResponsiva.vue';
import Paginacion from '@/components/Paginacion.vue';
import CampoBusqueda from '@/components/CampoBusqueda.vue';
import BaseModal from '@/components/BaseModal.vue';
import InsigniaEstado from '@/components/InsigniaEstado.vue';
import Icono from '@/components/Icono.vue';

const auth = useAuth();
const contexto = useContexto();
const toast = useToast();
const { filas, cargando, filtros, pag, cargar } = useListado('/sedes', { empresaId: contexto.empresaActivaId });
onMounted(cargar);
useTiempoReal('sede:cambio', cargar);

const columnas = [
  { clave: 'nombre', titulo: 'Sede' },
  { clave: 'direccion', titulo: 'Dirección' },
  { clave: 'responsable.nombres', titulo: 'Responsable' },
  { clave: '_count.almacenes', titulo: 'Almacenes', clase: 'text-center' },
  { clave: 'activo', titulo: 'Estado' },
];

// Responsables posibles: usuarios internos activos (solo si puede verlos)
const responsables = ref([]);
async function cargarResponsables() {
  if (!auth.can('usuarios.usuario.ver', {}) || responsables.value.length) return;
  const { data } = await api.get('/usuarios', { params: { tipo: 'interno', estado: 'activo', porPagina: 100 } });
  responsables.value = data.datos;
}

const vacio = () => ({ nombre: '', direccion: '', responsableId: '', activo: true });
const modal = reactive({ abierto: false, id: null, guardando: false, form: vacio() });

function abrir(fila) {
  cargarResponsables();
  modal.id = fila?.id ?? null;
  modal.form = fila
    ? { nombre: fila.nombre, direccion: fila.direccion ?? '', responsableId: fila.responsableId ?? '', activo: fila.activo }
    : vacio();
  if (fila?.responsable && !responsables.value.some((r) => r.id === fila.responsable.id)) responsables.value.push(fila.responsable);
  modal.abierto = true;
}

async function guardar() {
  modal.guardando = true;
  try {
    const datos = { ...modal.form, responsableId: modal.form.responsableId || null };
    if (modal.id) await api.put(`/sedes/${modal.id}`, datos);
    else {
      delete datos.activo;
      await api.post('/sedes', { ...datos, empresaId: contexto.empresaActivaId });
    }
    toast.exito(modal.id ? 'Sede actualizada' : 'Sede creada');
    modal.abierto = false;
    cargar();
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    modal.guardando = false;
  }
}

async function eliminar(fila) {
  if (!confirm(`¿Eliminar la sede "${fila.nombre}"?`)) return;
  try {
    await api.delete(`/sedes/${fila.id}`);
    toast.exito('Sede eliminada');
    cargar();
  } catch (e) {
    toast.error(mensajeError(e));
  }
}
</script>

<template>
  <EncabezadoPagina titulo="Sedes" :subtitulo="contexto.empresaActiva?.razonSocial">
    <button v-can="{ permiso: 'sedes.sede.crear', recurso: { empresaId: contexto.empresaActivaId } }" class="btn-primario" @click="abrir()">
      <Icono nombre="agregar" /> Nueva sede
    </button>
  </EncabezadoPagina>

  <div class="mb-4"><CampoBusqueda v-model="filtros.q" placeholder="Buscar sede" /></div>

  <TablaResponsiva :columnas="columnas" :filas="filas" :cargando="cargando" vacio="No hay sedes en esta empresa">
    <template #celda-activo="{ fila }"><InsigniaEstado :activo="fila.activo" textoSi="Activa" textoNo="Inactiva" /></template>
    <template #acciones="{ fila }">
      <button v-can="{ permiso: 'sedes.sede.editar', recurso: { empresaId: fila.empresaId, sedeId: fila.id } }" class="btn-texto" @click="abrir(fila)">
        <Icono nombre="editar" clase="size-4" /> Editar
      </button>
      <button v-can="{ permiso: 'sedes.sede.eliminar', recurso: { empresaId: fila.empresaId, sedeId: fila.id } }" class="btn-texto text-red-600 hover:bg-red-50" @click="eliminar(fila)">
        <Icono nombre="eliminar" clase="size-4" /> Eliminar
      </button>
    </template>
  </TablaResponsiva>
  <Paginacion :pag="pag" />

  <BaseModal :abierto="modal.abierto" :titulo="modal.id ? 'Editar sede' : 'Nueva sede'" @cerrar="modal.abierto = false">
    <form id="form-sede" class="space-y-4" @submit.prevent="guardar">
      <div>
        <label class="etiqueta" for="nom">Nombre *</label>
        <input id="nom" v-model="modal.form.nombre" class="input" required />
      </div>
      <div>
        <label class="etiqueta" for="dir">Dirección</label>
        <input id="dir" v-model="modal.form.direccion" class="input" />
      </div>
      <div v-if="responsables.length">
        <label class="etiqueta" for="resp">Responsable</label>
        <select id="resp" v-model="modal.form.responsableId" class="input">
          <option value="">Sin responsable</option>
          <option v-for="r in responsables" :key="r.id" :value="r.id">{{ r.nombres }}</option>
        </select>
      </div>
      <label v-if="modal.id" class="flex min-h-11 items-center gap-3">
        <input v-model="modal.form.activo" type="checkbox" class="size-5 accent-marca-700" /> Sede activa
      </label>
    </form>
    <template #pie>
      <button class="btn-secundario" @click="modal.abierto = false">Cancelar</button>
      <button class="btn-primario" form="form-sede" :disabled="modal.guardando">Guardar</button>
    </template>
  </BaseModal>
</template>
