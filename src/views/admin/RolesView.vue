<script setup>
import { confirmar } from '@/utils/dialogos';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, mensajeError } from '@/services/api';
import { useAuth } from '@/stores/auth';
import { useToast } from '@/stores/toast';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import InsigniaEstado from '@/components/InsigniaEstado.vue';
import MenuAcciones from '@/components/MenuAcciones.vue';
import ModalRol from '@/components/ModalRol.vue';
import Icono from '@/components/Icono.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const toast = useToast();
const roles = ref([]);
const cargando = ref(true);
const gestiona = computed(() => auth.can('usuarios.roles.gestionar', {}));

async function cargar() {
  try {
    roles.value = (await api.get('/roles')).data;
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    cargando.value = false;
  }
}
onMounted(cargar);

// ── Modal del rol: ?rol=<id> | ?rol=nuevo | ?clonar=<id> (los enlaces /roles/... llegan así) ──
const modal = reactive({ abierto: false, rolId: null, clonarDe: null });
watch(
  () => [route.query.rol, route.query.clonar],
  ([rol, clonar]) => {
    if (!rol && !clonar) return (modal.abierto = false);
    Object.assign(modal, { abierto: true, rolId: rol && rol !== 'nuevo' ? rol : null, clonarDe: clonar ?? null });
  },
  { immediate: true },
);
const abrir = (query) => router.push({ query });
const cerrar = () => router.replace({ query: {} });
function guardado() {
  cerrar();
  cargar();
}

async function accion(fn, mensaje) {
  try {
    await fn();
    toast.exito(mensaje);
    await cargar();
  } catch (e) {
    toast.error(mensajeError(e));
  }
}
const alternarEstado = (rol) =>
  accion(() => api.patch(`/roles/${rol.id}/estado`, { activo: !rol.activo }), rol.activo ? 'Rol desactivado' : 'Rol activado');
const eliminar = async (rol) =>
  (await confirmar({ titulo: `¿Eliminar el rol ${rol.nombre}?`, texto: 'Esta acción no se puede deshacer.', confirmar: 'Eliminar rol', peligro: true })) && accion(() => api.delete(`/roles/${rol.id}`), 'Rol eliminado');

const accionesRol = (r) => [
  { texto: gestiona.value ? 'Editar permisos' : 'Ver permisos', icono: gestiona.value ? 'editar' : 'roles', alHacer: () => abrir({ rol: r.id }) },
  gestiona.value && { texto: 'Clonar', icono: 'clonar', alHacer: () => abrir({ clonar: r.id }) },
  gestiona.value && { texto: r.activo ? 'Desactivar' : 'Activar', icono: r.activo ? 'cerrar' : 'check', alHacer: () => alternarEstado(r) },
  gestiona.value && !r.esSistema && { separador: true },
  gestiona.value && !r.esSistema && { texto: 'Eliminar', icono: 'eliminar', peligro: true, alHacer: () => eliminar(r) },
];
</script>

<template>
  <EncabezadoPagina titulo="Roles y permisos" subtitulo="Roles del estudio: créelos, clónelos y ajuste sus permisos">
    <button v-if="gestiona" class="btn-primario" @click="abrir({ rol: 'nuevo' })"><Icono nombre="agregar" /> Nuevo rol</button>
  </EncabezadoPagina>

  <p v-if="cargando" class="text-sm text-slate-500">Cargando…</p>
  <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    <article v-for="rol in roles" :key="rol.id" class="tarjeta flex flex-col p-4 transition hover:shadow-md" :class="{ 'opacity-70': !rol.activo }">
      <div class="flex items-start justify-between gap-2">
        <button class="min-w-0 text-left" @click="abrir({ rol: rol.id })">
          <span class="block truncate font-semibold text-slate-900 hover:text-marca-700">{{ rol.nombre }}</span>
        </button>
        <div class="-mt-1 -mr-1 flex shrink-0 items-center gap-1">
          <span v-if="rol.esSistema" class="insignia bg-indigo-50 text-indigo-700">Plantilla</span>
          <InsigniaEstado :activo="rol.activo" />
          <MenuAcciones :acciones="accionesRol(rol)" :etiqueta="`Acciones del rol ${rol.nombre}`" />
        </div>
      </div>
      <p class="mt-1 flex-1 text-sm text-slate-500">{{ rol.descripcion || 'Sin descripción' }}</p>
      <div class="mt-4 flex items-center gap-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span class="flex items-center gap-1.5"><Icono nombre="roles" clase="size-4 text-slate-400" /> {{ rol._count.permisos }} permisos</span>
        <span class="flex items-center gap-1.5"><Icono nombre="usuarios" clase="size-4 text-slate-400" /> {{ rol._count.asignaciones }} asignaciones</span>
        <span v-if="rol.requiereMfa" class="insignia ml-auto bg-amber-50 text-amber-700">2FA</span>
      </div>
    </article>
  </div>

  <ModalRol :abierto="modal.abierto" :rol-id="modal.rolId" :clonar-de="modal.clonarDe" @cerrar="cerrar" @guardado="guardado" />
</template>
