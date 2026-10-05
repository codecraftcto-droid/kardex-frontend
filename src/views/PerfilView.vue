<script setup>
import { onMounted, reactive, ref } from 'vue';
import { api, mensajeError } from '@/services/api';
import { useAuth } from '@/stores/auth';
import { useToast } from '@/stores/toast';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import SeccionDosPasos from '@/components/SeccionDosPasos.vue';
import SeccionPlan from '@/components/SeccionPlan.vue';

const auth = useAuth();
const toast = useToast();
const datos = reactive({ nombres: auth.usuario.nombres, telefono: auth.usuario.telefono ?? '', cargo: auth.usuario.cargo ?? '' });
const pass = reactive({ actual: '', nueva: '', confirmar: '' });
const sesiones = ref([]);

const cargarSesiones = async () => (sesiones.value = (await api.get('/me/sesiones')).data);
onMounted(cargarSesiones);

async function guardarDatos() {
  try {
    const { data } = await api.patch('/me', datos);
    Object.assign(auth.usuario, data);
    toast.exito('Datos actualizados');
  } catch (e) {
    toast.error(mensajeError(e));
  }
}

async function cambiarPassword() {
  if (pass.nueva !== pass.confirmar) return toast.error('Las contraseñas no coinciden');
  try {
    await api.post('/me/password', { actual: pass.actual, nueva: pass.nueva });
    Object.assign(pass, { actual: '', nueva: '', confirmar: '' });
    toast.exito('Contraseña actualizada. Se cerraron sus otras sesiones.');
    cargarSesiones();
  } catch (e) {
    toast.error(mensajeError(e));
  }
}

async function cerrarSesion(s) {
  if (s.actual) return auth.logout();
  try {
    await api.delete(`/me/sesiones/${s.id}`);
    toast.exito('Sesión cerrada');
    cargarSesiones();
  } catch (e) {
    toast.error(mensajeError(e));
  }
}
</script>

<template>
  <EncabezadoPagina titulo="Mi perfil" :subtitulo="auth.usuario.email" />
  <div class="grid grid-cols-1 gap-5 lg:grid-cols-2">
    <form class="tarjeta space-y-4 p-4 sm:p-5" @submit.prevent="guardarDatos">
      <h2 class="font-semibold">Datos personales</h2>
      <div><label class="etiqueta">Nombres</label><input v-model="datos.nombres" class="input" required /></div>
      <div><label class="etiqueta">Teléfono</label><input v-model="datos.telefono" type="tel" class="input" /></div>
      <div><label class="etiqueta">Cargo</label><input v-model="datos.cargo" class="input" /></div>
      <div class="flex justify-end"><button class="btn-primario">Guardar</button></div>
    </form>

    <form class="tarjeta space-y-4 p-4 sm:p-5" @submit.prevent="cambiarPassword">
      <h2 class="font-semibold">Cambiar contraseña</h2>
      <div><label class="etiqueta">Contraseña actual</label><input v-model="pass.actual" type="password" class="input" autocomplete="current-password" required /></div>
      <div><label class="etiqueta">Nueva contraseña</label><input v-model="pass.nueva" type="password" class="input" autocomplete="new-password" minlength="8" required /></div>
      <div><label class="etiqueta">Confirmar</label><input v-model="pass.confirmar" type="password" class="input" autocomplete="new-password" required /></div>
      <div class="flex justify-end"><button class="btn-primario">Actualizar</button></div>
    </form>

    <SeccionPlan v-if="auth.can('usuarios.roles.gestionar', {})" />
    <SeccionDosPasos />

    <section class="tarjeta p-4 sm:p-5 lg:col-span-2">
      <h2 class="mb-3 font-semibold">Sesiones y dispositivos</h2>
      <ul class="divide-y divide-slate-100">
        <li v-for="s in sesiones" :key="s.id" class="flex items-center justify-between gap-3 py-3">
          <div class="min-w-0 text-sm">
            <p class="truncate">{{ s.dispositivo || 'Dispositivo desconocido' }}</p>
            <p class="text-xs text-slate-500">
              IP {{ s.ip }} · último uso {{ new Date(s.ultimoUso).toLocaleString() }}
              <span v-if="s.actual" class="insignia ml-1 bg-marca-50 text-marca-700">Esta sesión</span>
            </p>
          </div>
          <button class="btn-secundario shrink-0" @click="cerrarSesion(s)">Cerrar</button>
        </li>
      </ul>
    </section>
  </div>
</template>
