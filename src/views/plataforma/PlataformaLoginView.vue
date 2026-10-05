<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePlataforma } from '@/stores/plataforma';
import { apiPlataforma } from '@/services/apiPlataforma';
import { mensajeError } from '@/services/api';
import CampoCodigo from '@/components/CampoCodigo.vue';
import CodigosRecuperacion from '@/components/CodigosRecuperacion.vue';

const plataforma = usePlataforma();
const route = useRoute();
const router = useRouter();
const paso = ref('credenciales');
const email = ref('');
const password = ref('');
const codigo = ref('');
const desafio = ref('');
const recuperacion = ref(false);
const alta = ref(null);
const codigos = ref([]);
const pendiente = ref(null);
const error = ref(route.query.expirada ? 'Su sesión finalizó. Ingrese nuevamente.' : '');
const enviando = ref(false);

const entrar = () => router.replace(typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/plataforma') ? route.query.redirect : '/plataforma');

async function ejecutar(fn) {
  error.value = '';
  enviando.value = true;
  try {
    await fn();
  } catch (e) {
    error.value = mensajeError(e);
    if (e.response?.data?.error?.includes('expiró')) paso.value = 'credenciales';
  } finally {
    enviando.value = false;
  }
}

const enviarCredenciales = () =>
  ejecutar(async () => {
    const r = await plataforma.login(email.value, password.value);
    desafio.value = r.desafio;
    codigo.value = '';
    if (r.mfa === 'verificar') paso.value = 'verificar';
    else {
      alta.value = (await apiPlataforma.post('/auth/mfa/configurar', { desafio: r.desafio })).data;
      paso.value = 'configurar';
    }
  });
const verificar = () =>
  ejecutar(async () => {
    plataforma.completarLogin((await apiPlataforma.post('/auth/mfa/verificar', { desafio: desafio.value, codigo: codigo.value })).data);
    entrar();
  });
const activar = () =>
  ejecutar(async () => {
    const { data } = await apiPlataforma.post('/auth/mfa/activar', { desafio: desafio.value, codigo: codigo.value });
    codigos.value = data.codigosRecuperacion;
    pendiente.value = data;
    paso.value = 'codigos';
  });
function continuar() {
  plataforma.completarLogin(pendiente.value);
  entrar();
}
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center bg-slate-900 px-4 py-10">
    <div class="w-full max-w-sm">
      <div class="mb-6 text-center text-white">
        <img src="/favicon.svg" alt="" class="mx-auto mb-3 size-12" />
        <h1 class="text-xl font-semibold">Kardex Plataforma</h1>
        <p class="text-sm text-slate-400">Acceso exclusivo para administración del servicio</p>
      </div>
      <div class="tarjeta p-5 sm:p-6">
        <form v-if="paso === 'credenciales'" class="space-y-4" @submit.prevent="enviarCredenciales">
          <div><label class="etiqueta" for="pe">Correo</label><input id="pe" v-model="email" type="email" class="input" autocomplete="username" required autofocus /></div>
          <div><label class="etiqueta" for="pp">Contraseña</label><input id="pp" v-model="password" type="password" class="input" autocomplete="current-password" required /></div>
          <p class="text-xs text-slate-500">La verificación en dos pasos es obligatoria en la plataforma.</p>
          <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{{ error }}</p>
          <button class="btn w-full bg-slate-900 text-white hover:bg-slate-800" :disabled="enviando">Continuar</button>
        </form>

        <form v-else-if="paso === 'verificar'" class="space-y-4" @submit.prevent="verificar">
          <p class="text-sm text-slate-600">{{ recuperacion ? 'Ingrese un código de recuperación.' : 'Código de 6 dígitos de su aplicación autenticadora.' }}</p>
          <CampoCodigo v-model="codigo" :recuperacion="recuperacion" />
          <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{{ error }}</p>
          <button class="btn w-full bg-slate-900 text-white hover:bg-slate-800" :disabled="enviando">Verificar</button>
          <button type="button" class="btn-texto w-full" @click="(recuperacion = !recuperacion), (codigo = '')">
            {{ recuperacion ? 'Usar la aplicación' : 'Usar un código de recuperación' }}
          </button>
        </form>

        <form v-else-if="paso === 'configurar'" class="space-y-4" @submit.prevent="activar">
          <p class="text-sm text-slate-600">Primer ingreso: configure la verificación en dos pasos escaneando el código con su aplicación autenticadora.</p>
          <img :src="alta.qr" alt="Código QR" class="mx-auto size-48 rounded-lg border border-slate-200" />
          <details class="text-xs text-slate-500">
            <summary class="cursor-pointer">Ingresar la clave manualmente</summary>
            <code class="mt-1 block rounded bg-slate-100 p-2 break-all">{{ alta.secreto }}</code>
          </details>
          <CampoCodigo v-model="codigo" />
          <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{{ error }}</p>
          <button class="btn w-full bg-slate-900 text-white hover:bg-slate-800" :disabled="enviando">Activar y entrar</button>
        </form>

        <div v-else class="space-y-4">
          <CodigosRecuperacion :codigos="codigos" />
          <button class="btn w-full bg-slate-900 text-white hover:bg-slate-800" @click="continuar">Ya los guardé, continuar</button>
        </div>
      </div>
      <p class="mt-4 text-center text-sm"><RouterLink to="/login" class="text-slate-400 hover:text-white">¿Es usuario de un estudio? Ingrese aquí</RouterLink></p>
    </div>
  </div>
</template>
