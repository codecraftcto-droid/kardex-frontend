<script setup>
import { onMounted, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { api, mensajeError } from '@/services/api';
import { useContexto } from '@/stores/contexto';
import { useToast } from '@/stores/toast';
import { useListado } from '@/composables/useListado';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import TablaResponsiva from '@/components/TablaResponsiva.vue';
import Paginacion from '@/components/Paginacion.vue';
import CampoBusqueda from '@/components/CampoBusqueda.vue';
import BaseModal from '@/components/BaseModal.vue';
import Icono from '@/components/Icono.vue';
import MenuAcciones from '@/components/MenuAcciones.vue';
import BotonColumnas from '@/components/BotonColumnas.vue';

const router = useRouter();
const contexto = useContexto();
const toast = useToast();
const { filas, cargando, filtros, pag, cargar } = useListado('/usuarios', { estado: '', tipo: '' });
onMounted(cargar);

const columnas = [
  { clave: 'nombres', titulo: 'Nombre' },
  { clave: 'email', titulo: 'Correo' },
  { clave: 'tipo', titulo: 'Tipo' },
  { clave: '_count.asignaciones', titulo: 'Roles', clase: 'text-center' },
  { clave: 'estado', titulo: 'Estado' },
];
const estiloEstado = { activo: 'bg-emerald-50 text-emerald-700', pendiente: 'bg-amber-50 text-amber-700', suspendido: 'bg-red-50 text-red-700' };

const vacio = () => ({ nombres: '', email: '', documento: '', cargo: '', telefono: '', tipo: 'interno', empresaId: '' });
const modal = reactive({ abierto: false, guardando: false, form: vacio() });

async function invitar() {
  modal.guardando = true;
  try {
    const datos = { ...modal.form, empresaId: modal.form.tipo === 'interno' ? null : modal.form.empresaId };
    const { data } = await api.post('/usuarios', datos);
    toast.exito(`Invitación enviada a ${data.email}`);
    modal.abierto = false;
    router.push(`/usuarios/${data.id}`);
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    modal.guardando = false;
  }
}

/** Acciones de cada usuario (menú ⋯) */
const accionesFila = (f) => [{ texto: 'Ver detalle, roles y sesiones', icono: 'perfil', to: `/usuarios/${f.id}` }];
</script>

<template>
  <EncabezadoPagina titulo="Usuarios" subtitulo="Personal del estudio y usuarios del portal cliente">
    <button v-can="{ permiso: 'usuarios.usuario.crear', recurso: {} }" class="btn-primario" @click="(modal.form = vacio()), (modal.abierto = true)">
      <Icono nombre="agregar" /> Invitar usuario
    </button>
  </EncabezadoPagina>

  <div class="mb-4 grid gap-2 sm:grid-cols-[1fr_12rem_12rem] md:grid-cols-[1fr_12rem_12rem_auto]">
    <CampoBusqueda v-model="filtros.q" placeholder="Nombre, correo o documento" />
    <select v-model="filtros.estado" class="input">
      <option value="">Todos los estados</option>
      <option value="activo">Activos</option>
      <option value="pendiente">Pendientes</option>
      <option value="suspendido">Suspendidos</option>
    </select>
    <select v-model="filtros.tipo" class="input">
      <option value="">Todos los tipos</option>
      <option value="interno">Internos</option>
      <option value="cliente">Clientes</option>
      <option value="operador">Operadores de caja</option>
    </select>
    <BotonColumnas :columnas="columnas" />
  </div>

  <TablaResponsiva :columnas="columnas" :filas="filas" :cargando="cargando" vacio="No hay usuarios">
    <template #celda-nombres="{ fila }">
      <RouterLink :to="`/usuarios/${fila.id}`" class="font-medium text-marca-700 hover:underline">{{ fila.nombres }}</RouterLink>
      <p v-if="fila.cargo" class="text-xs text-slate-500">{{ fila.cargo }}</p>
    </template>
    <template #celda-tipo="{ fila }">{{ fila.tipo === 'interno' ? 'Interno' : `${fila.tipo === 'cliente' ? 'Cliente' : 'Operador'} · ${fila.empresa?.razonSocial ?? ''}` }}</template>
    <template #celda-estado="{ fila }"><span class="insignia capitalize" :class="estiloEstado[fila.estado]">{{ fila.estado }}</span></template>
    <template #acciones="{ fila }"><MenuAcciones :acciones="accionesFila(fila)" :etiqueta="`Acciones de ${fila.nombres}`" /></template>
  </TablaResponsiva>
  <Paginacion :pag="pag" />

  <BaseModal :abierto="modal.abierto" titulo="Invitar usuario" @cerrar="modal.abierto = false">
    <form id="form-invitar" class="grid gap-4 sm:grid-cols-2" @submit.prevent="invitar">
      <div class="sm:col-span-2">
        <label class="etiqueta" for="nom">Nombres y apellidos *</label>
        <input id="nom" v-model="modal.form.nombres" class="input" required />
      </div>
      <div class="sm:col-span-2">
        <label class="etiqueta" for="em">Correo *</label>
        <input id="em" v-model="modal.form.email" type="email" class="input" required />
      </div>
      <div>
        <label class="etiqueta" for="doc">Documento</label>
        <input id="doc" v-model="modal.form.documento" class="input" inputmode="numeric" />
      </div>
      <div>
        <label class="etiqueta" for="tel">Teléfono</label>
        <input id="tel" v-model="modal.form.telefono" type="tel" class="input" />
      </div>
      <div class="sm:col-span-2">
        <label class="etiqueta" for="car">Cargo</label>
        <input id="car" v-model="modal.form.cargo" class="input" />
      </div>
      <div>
        <label class="etiqueta" for="tipo">Tipo de usuario</label>
        <select id="tipo" v-model="modal.form.tipo" class="input">
          <option value="interno">Interno (personal del estudio)</option>
          <option value="cliente">Cliente (portal, solo lectura)</option>
          <option value="operador">Operador de caja (empleado de la empresa)</option>
        </select>
      </div>
      <div v-if="modal.form.tipo !== 'interno'">
        <label class="etiqueta" for="emp">Empresa *</label>
        <select id="emp" v-model="modal.form.empresaId" class="input" required>
          <option v-for="e in contexto.empresas" :key="e.id" :value="e.id">{{ e.razonSocial }}</option>
        </select>
      </div>
      <p class="text-sm text-slate-500 sm:col-span-2">El usuario recibirá un correo para activar su cuenta y crear su contraseña.</p>
    </form>
    <template #pie>
      <button class="btn-secundario" @click="modal.abierto = false">Cancelar</button>
      <button class="btn-primario" form="form-invitar" :disabled="modal.guardando">Enviar invitación</button>
    </template>
  </BaseModal>
</template>
