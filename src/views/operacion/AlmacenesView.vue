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
const { filas, cargando, filtros, pag, cargar } = useListado('/almacenes', { empresaId: contexto.empresaActivaId, sedeId: '' });
useTiempoReal('almacen:cambio', cargar);

const sedes = ref([]);
async function cargarSedes() {
  sedes.value = [];
  if (!contexto.empresaActivaId || !auth.canEnEmpresa('sedes.sede.ver', contexto.empresaActivaId)) return;
  const { data } = await api.get('/sedes', { params: { empresaId: contexto.empresaActivaId, porPagina: 100 } });
  sedes.value = data.datos;
}
onMounted(() => {
  cargar();
  cargarSedes();
});

const columnas = [
  { clave: 'nombre', titulo: 'Almacén' },
  { clave: 'codigo', titulo: 'Código' },
  { clave: 'sede.nombre', titulo: 'Sede' },
  { clave: 'activo', titulo: 'Estado' },
];

// Sedes donde puede crear almacenes
const sedesCreables = () =>
  sedes.value.filter((s) => auth.can('almacenes.almacen.crear', { empresaId: s.empresaId, sedeId: s.id }));

const vacio = () => ({ sedeId: '', codigo: '', nombre: '', descripcion: '', activo: true });
const modal = reactive({ abierto: false, id: null, guardando: false, form: vacio() });

function abrir(fila) {
  modal.id = fila?.id ?? null;
  modal.form = fila
    ? { sedeId: fila.sedeId, codigo: fila.codigo, nombre: fila.nombre, descripcion: fila.descripcion ?? '', activo: fila.activo }
    : { ...vacio(), sedeId: filtros.sedeId || sedesCreables()[0]?.id || '' };
  modal.abierto = true;
}

async function guardar() {
  modal.guardando = true;
  try {
    const { sedeId, ...datos } = modal.form;
    if (modal.id) await api.put(`/almacenes/${modal.id}`, datos);
    else {
      delete datos.activo;
      await api.post('/almacenes', { ...datos, sedeId });
    }
    toast.exito(modal.id ? 'Almacén actualizado' : 'Almacén creado');
    modal.abierto = false;
    cargar();
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    modal.guardando = false;
  }
}

async function eliminar(fila) {
  if (!confirm(`¿Eliminar el almacén "${fila.nombre}"?`)) return;
  try {
    await api.delete(`/almacenes/${fila.id}`);
    toast.exito('Almacén eliminado');
    cargar();
  } catch (e) {
    toast.error(mensajeError(e));
  }
}
</script>

<template>
  <EncabezadoPagina titulo="Almacenes" :subtitulo="contexto.empresaActiva?.razonSocial">
    <button v-if="sedesCreables().length" class="btn-primario" @click="abrir()"><Icono nombre="agregar" /> Nuevo almacén</button>
  </EncabezadoPagina>

  <div class="mb-4 grid gap-2 sm:grid-cols-[1fr_14rem]">
    <CampoBusqueda v-model="filtros.q" placeholder="Buscar por nombre o código" />
    <select v-if="sedes.length" v-model="filtros.sedeId" class="input">
      <option value="">Todas las sedes</option>
      <option v-for="s in sedes" :key="s.id" :value="s.id">{{ s.nombre }}</option>
    </select>
  </div>

  <TablaResponsiva :columnas="columnas" :filas="filas" :cargando="cargando" vacio="No hay almacenes visibles">
    <template #celda-codigo="{ fila }"><span class="font-mono text-xs">{{ fila.codigo }}</span></template>
    <template #celda-activo="{ fila }"><InsigniaEstado :activo="fila.activo" /></template>
    <template #acciones="{ fila }">
      <button v-can="{ permiso: 'almacenes.almacen.editar', recurso: { empresaId: fila.empresaId, sedeId: fila.sedeId, almacenId: fila.id } }" class="btn-texto" @click="abrir(fila)">
        <Icono nombre="editar" clase="size-4" /> Editar
      </button>
      <button v-can="{ permiso: 'almacenes.almacen.eliminar', recurso: { empresaId: fila.empresaId, sedeId: fila.sedeId, almacenId: fila.id } }" class="btn-texto text-red-600 hover:bg-red-50" @click="eliminar(fila)">
        <Icono nombre="eliminar" clase="size-4" /> Eliminar
      </button>
    </template>
  </TablaResponsiva>
  <Paginacion :pag="pag" />

  <BaseModal :abierto="modal.abierto" :titulo="modal.id ? 'Editar almacén' : 'Nuevo almacén'" @cerrar="modal.abierto = false">
    <form id="form-almacen" class="grid gap-4 sm:grid-cols-3" @submit.prevent="guardar">
      <div v-if="!modal.id" class="sm:col-span-3">
        <label class="etiqueta" for="sede">Sede *</label>
        <select id="sede" v-model="modal.form.sedeId" class="input" required>
          <option v-for="s in sedesCreables()" :key="s.id" :value="s.id">{{ s.nombre }}</option>
        </select>
      </div>
      <div>
        <label class="etiqueta" for="cod">Código *</label>
        <input id="cod" v-model="modal.form.codigo" class="input uppercase" maxlength="20" required />
      </div>
      <div class="sm:col-span-2">
        <label class="etiqueta" for="nom">Nombre *</label>
        <input id="nom" v-model="modal.form.nombre" class="input" required />
      </div>
      <div class="sm:col-span-3">
        <label class="etiqueta" for="desc">Descripción</label>
        <input id="desc" v-model="modal.form.descripcion" class="input" />
      </div>
      <label v-if="modal.id" class="flex min-h-11 items-center gap-3 sm:col-span-3">
        <input v-model="modal.form.activo" type="checkbox" class="size-5 accent-marca-700" /> Almacén activo
      </label>
    </form>
    <template #pie>
      <button class="btn-secundario" @click="modal.abierto = false">Cancelar</button>
      <button class="btn-primario" form="form-almacen" :disabled="modal.guardando">Guardar</button>
    </template>
  </BaseModal>
</template>
