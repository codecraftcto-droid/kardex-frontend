<script setup>
import { onMounted, reactive, ref } from 'vue';
import { api, mensajeError } from '@/services/api';
import { useToast } from '@/stores/toast';
import BaseModal from './BaseModal.vue';
import CampoCodigo from './CampoCodigo.vue';
import CodigosRecuperacion from './CodigosRecuperacion.vue';

const toast = useToast();
const estado = ref(null);
const cargar = async () => (estado.value = (await api.get('/me/mfa')).data);
onMounted(cargar);

// modo: 'activar' | 'codigos' | 'regenerar' | 'desactivar'
const dlg = reactive({ modo: null, alta: null, codigo: '', password: '', codigos: [], enviando: false });
const cerrar = () => Object.assign(dlg, { modo: null, alta: null, codigo: '', password: '' });

async function accion(fn) {
  dlg.enviando = true;
  try {
    await fn();
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    dlg.enviando = false;
  }
}

const iniciar = () =>
  accion(async () => {
    dlg.alta = (await api.post('/me/mfa/iniciar')).data;
    dlg.modo = 'activar';
  });
const activar = () =>
  accion(async () => {
    dlg.codigos = (await api.post('/me/mfa/activar', { codigo: dlg.codigo })).data.codigosRecuperacion;
    dlg.modo = 'codigos';
    toast.exito('Verificación en dos pasos activada');
    cargar();
  });
const regenerar = () =>
  accion(async () => {
    dlg.codigos = (await api.post('/me/mfa/codigos', { codigo: dlg.codigo })).data.codigosRecuperacion;
    dlg.modo = 'codigos';
    cargar();
  });
const desactivar = () =>
  accion(async () => {
    await api.post('/me/mfa/desactivar', { password: dlg.password, codigo: dlg.codigo });
    toast.exito('Verificación en dos pasos desactivada');
    cerrar();
    cargar();
  });
</script>

<template>
  <section class="tarjeta p-4 sm:p-5 lg:col-span-2">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="font-semibold">Verificación en dos pasos (2FA)</h2>
        <p class="text-sm text-slate-500">Además de la contraseña, se pedirá un código de su aplicación autenticadora.</p>
      </div>
      <span v-if="estado" class="insignia" :class="estado.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'">
        {{ estado.activo ? 'Activa' : 'Inactiva' }}
      </span>
    </div>
    <template v-if="estado">
      <p v-if="estado.requerido && !estado.activo" class="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Uno de sus roles exige verificación en dos pasos: actívela ahora; se le pedirá en su próximo ingreso.
      </p>
      <p v-if="estado.activo" class="mt-3 text-sm text-slate-600">
        Códigos de recuperación disponibles: <strong>{{ estado.codigosRestantes }}</strong> de 8
        <span v-if="estado.requerido" class="text-slate-400"> · Obligatoria por su rol</span>
      </p>
      <div class="mt-3 flex flex-wrap gap-2">
        <button v-if="!estado.activo" class="btn-primario" :disabled="dlg.enviando" @click="iniciar">Activar 2FA</button>
        <template v-else>
          <button class="btn-secundario" @click="dlg.modo = 'regenerar'">Nuevos códigos de recuperación</button>
          <button v-if="!estado.requerido" class="btn-secundario text-red-600" @click="dlg.modo = 'desactivar'">Desactivar</button>
        </template>
      </div>
    </template>

    <BaseModal :abierto="!!dlg.modo" :titulo="{ activar: 'Activar verificación en dos pasos', codigos: 'Códigos de recuperación', regenerar: 'Nuevos códigos de recuperación', desactivar: 'Desactivar 2FA' }[dlg.modo]" @cerrar="cerrar">
      <form v-if="dlg.modo === 'activar'" id="form-2fa" class="space-y-4" @submit.prevent="activar">
        <ol class="list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>Instale Google Authenticator, Microsoft Authenticator o Authy.</li>
          <li>Escanee este código QR.</li>
          <li>Escriba el código de 6 dígitos que muestra la aplicación.</li>
        </ol>
        <img :src="dlg.alta.qr" alt="Código QR" class="mx-auto size-48 rounded-lg border border-slate-200" />
        <details class="text-xs text-slate-500">
          <summary class="cursor-pointer">Ingresar la clave manualmente</summary>
          <code class="mt-1 block rounded bg-slate-100 p-2 break-all">{{ dlg.alta.secreto }}</code>
        </details>
        <CampoCodigo v-model="dlg.codigo" />
      </form>
      <CodigosRecuperacion v-else-if="dlg.modo === 'codigos'" :codigos="dlg.codigos" />
      <form v-else-if="dlg.modo === 'regenerar'" id="form-2fa" class="space-y-4" @submit.prevent="regenerar">
        <p class="text-sm text-slate-600">Los códigos anteriores dejarán de funcionar. Confirme con el código actual de su aplicación.</p>
        <CampoCodigo v-model="dlg.codigo" />
      </form>
      <form v-else-if="dlg.modo === 'desactivar'" id="form-2fa" class="space-y-4" @submit.prevent="desactivar">
        <div><label class="etiqueta">Contraseña</label><input v-model="dlg.password" type="password" class="input" autocomplete="current-password" required /></div>
        <div><label class="etiqueta">Código de la aplicación o de recuperación</label><input v-model="dlg.codigo" class="input font-mono" required /></div>
      </form>
      <template #pie>
        <button class="btn-secundario" @click="cerrar">{{ dlg.modo === 'codigos' ? 'Listo, ya los guardé' : 'Cancelar' }}</button>
        <button v-if="dlg.modo !== 'codigos'" form="form-2fa" :class="dlg.modo === 'desactivar' ? 'btn-peligro' : 'btn-primario'" :disabled="dlg.enviando">
          {{ { activar: 'Activar', regenerar: 'Generar', desactivar: 'Desactivar' }[dlg.modo] }}
        </button>
      </template>
    </BaseModal>
  </section>
</template>
