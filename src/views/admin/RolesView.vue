<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, mensajeError } from '@/services/api';
import { useToast } from '@/stores/toast';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import InsigniaEstado from '@/components/InsigniaEstado.vue';
import Icono from '@/components/Icono.vue';

const router = useRouter();
const toast = useToast();
const roles = ref([]);
const cargando = ref(true);

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

async function accion(fn, mensaje) {
  try {
    const r = await fn();
    toast.exito(mensaje);
    await cargar();
    return r;
  } catch (e) {
    toast.error(mensajeError(e));
  }
}

async function clonar(rol) {
  const nombre = prompt('Nombre del nuevo rol', `${rol.nombre} (copia)`);
  if (!nombre) return;
  const r = await accion(() => api.post(`/roles/${rol.id}/clonar`, { nombre }), 'Rol clonado');
  if (r) router.push(`/roles/${r.data.id}`);
}
const alternar = (rol) =>
  accion(() => api.patch(`/roles/${rol.id}/estado`, { activo: !rol.activo }), rol.activo ? 'Rol desactivado' : 'Rol activado');
const eliminar = (rol) => confirm(`¿Eliminar el rol "${rol.nombre}"?`) && accion(() => api.delete(`/roles/${rol.id}`), 'Rol eliminado');
</script>

<template>
  <EncabezadoPagina titulo="Roles y permisos" subtitulo="Roles del estudio: créelos, clónelos y ajuste su matriz de permisos">
    <RouterLink v-can="{ permiso: 'usuarios.roles.gestionar', recurso: {} }" to="/roles/nuevo" class="btn-primario">
      <Icono nombre="agregar" /> Nuevo rol
    </RouterLink>
  </EncabezadoPagina>

  <p v-if="cargando" class="text-sm text-slate-500">Cargando…</p>
  <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    <article v-for="rol in roles" :key="rol.id" class="tarjeta flex flex-col p-4" :class="{ 'opacity-70': !rol.activo }">
      <div class="flex items-start justify-between gap-2">
        <RouterLink :to="`/roles/${rol.id}`" class="font-semibold text-slate-900 hover:text-marca-700">{{ rol.nombre }}</RouterLink>
        <div class="flex shrink-0 gap-1">
          <span v-if="rol.esSistema" class="insignia bg-indigo-50 text-indigo-700">Plantilla</span>
          <InsigniaEstado :activo="rol.activo" />
        </div>
      </div>
      <p class="mt-1 flex-1 text-sm text-slate-500">{{ rol.descripcion || 'Sin descripción' }}</p>
      <p class="mt-3 text-xs text-slate-500">{{ rol._count.permisos }} permisos · {{ rol._count.asignaciones }} asignaciones</p>
      <div class="mt-3 flex flex-wrap gap-1 border-t border-slate-100 pt-3">
        <RouterLink :to="`/roles/${rol.id}`" class="btn-texto"><Icono nombre="editar" clase="size-4" /> Ver</RouterLink>
        <button v-can="{ permiso: 'usuarios.roles.gestionar', recurso: {} }" class="btn-texto" @click="clonar(rol)">
          <Icono nombre="clonar" clase="size-4" /> Clonar
        </button>
        <button v-can="{ permiso: 'usuarios.roles.gestionar', recurso: {} }" class="btn-texto" @click="alternar(rol)">
          {{ rol.activo ? 'Desactivar' : 'Activar' }}
        </button>
        <button v-if="!rol.esSistema" v-can="{ permiso: 'usuarios.roles.gestionar', recurso: {} }" class="btn-texto text-red-600 hover:bg-red-50" @click="eliminar(rol)">
          <Icono nombre="eliminar" clase="size-4" /> Eliminar
        </button>
      </div>
    </article>
  </div>
</template>
