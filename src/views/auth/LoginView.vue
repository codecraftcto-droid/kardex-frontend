<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '@/stores/auth';
import { api, mensajeError } from '@/services/api';
import TarjetaAuth from '@/components/TarjetaAuth.vue';
import CampoCodigo from '@/components/CampoCodigo.vue';
import CodigosRecuperacion from '@/components/CodigosRecuperacion.vue';
import FormCredenciales from '@/components/FormCredenciales.vue';

const auth = useAuth();
const route = useRoute();
const router = useRouter();

// paso: credenciales → (verificar | configurar → codigos) → dentro
const paso = ref('credenciales');
const email = ref('');
const password = ref('');
const codigo = ref('');
const desafio = ref('');
const usarRecuperacion = ref(false);
const alta = ref(null); // { qr, secreto }
const codigosNuevos = ref([]);
const sesionPendiente = ref(null);
const error = ref(route.query.expirada ? 'Su sesión finalizó. Ingrese nuevamente.' : '');
const enviando = ref(false);

function entrar() {
  const destino = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : '/';
  router.replace(destino);
}

async function ejecutar(fn) {
  error.value = '';
  enviando.value = true;
  try {
    await fn();
  } catch (e) {
    error.value = mensajeError(e, 'No se pudo completar la operación');
    if (e.response?.data?.error?.includes('expiró')) reiniciar();
  } finally {
    enviando.value = false;
  }
}

function reiniciar() {
  paso.value = 'credenciales';
  codigo.value = '';
  alta.value = null;
}

const enviarCredenciales = () =>
  ejecutar(async () => {
    const r = await auth.login(email.value, password.value);
    if (!r) return entrar();
    desafio.value = r.desafio;
    codigo.value = '';
    if (r.mfa === 'verificar') paso.value = 'verificar';
    else {
      alta.value = (await api.post('/auth/mfa/configurar', { desafio: r.desafio })).data;
      paso.value = 'configurar';
    }
  });

const enviarCodigo = () =>
  ejecutar(async () => {
    const { data } = await api.post('/auth/mfa/verificar', { desafio: desafio.value, codigo: codigo.value });
    await auth.completarLogin(data);
    entrar();
  });

const activar = () =>
  ejecutar(async () => {
    const { data } = await api.post('/auth/mfa/activar', { desafio: desafio.value, codigo: codigo.value });
    codigosNuevos.value = data.codigosRecuperacion;
    sesionPendiente.value = data;
    paso.value = 'codigos';
  });

const continuar = () =>
  ejecutar(async () => {
    await auth.completarLogin(sesionPendiente.value);
    entrar();
  });
</script>

<template>
  <TarjetaAuth
    :titulo="{ credenciales: 'Bienvenido de nuevo', verificar: 'Verificación en dos pasos', configurar: 'Configure la verificación en dos pasos', codigos: 'Códigos de recuperación' }[paso]"
    :subtitulo="paso === 'credenciales' ? 'Ingrese con su correo y contraseña para continuar.' : email"
  >
    <!-- 1. Correo y contraseña -->
    <FormCredenciales
      v-if="paso === 'credenciales'"
      v-model:email="email"
      v-model:password="password"
      :error="error"
      :enviando="enviando"
      ruta-olvido="/olvide"
      nota="Acceso protegido · los datos de cada estudio están aislados"
      @enviar="enviarCredenciales"
    />

    <!-- 2a. Código de la app autenticadora -->
    <form v-else-if="paso === 'verificar'" class="space-y-4" @submit.prevent="enviarCodigo">
      <p class="text-sm text-slate-600">
        {{ usarRecuperacion ? 'Ingrese uno de sus códigos de recuperación.' : 'Ingrese el código de 6 dígitos de su aplicación autenticadora.' }}
      </p>
      <CampoCodigo v-model="codigo" :recuperacion="usarRecuperacion" />
      <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{{ error }}</p>
      <button class="btn-primario w-full" :disabled="enviando">{{ enviando ? 'Verificando…' : 'Verificar' }}</button>
      <button type="button" class="btn-texto w-full" @click="(usarRecuperacion = !usarRecuperacion), (codigo = '')">
        {{ usarRecuperacion ? 'Usar el código de la aplicación' : '¿Perdió su celular? Use un código de recuperación' }}
      </button>
    </form>

    <!-- 2b. Alta obligatoria (su rol exige 2FA) -->
    <form v-else-if="paso === 'configurar'" class="space-y-4" @submit.prevent="activar">
      <p class="text-sm text-slate-600">
        Su rol exige verificación en dos pasos. Escanee el código con Google Authenticator, Microsoft Authenticator o Authy, y escriba el código que aparece.
      </p>
      <img v-if="alta" :src="alta.qr" alt="Código QR para la aplicación autenticadora" class="mx-auto size-48 rounded-lg border border-slate-200" />
      <details class="text-xs text-slate-500">
        <summary class="cursor-pointer">¿No puede escanear? Ingrese la clave manualmente</summary>
        <code class="mt-1 block rounded bg-slate-100 p-2 break-all">{{ alta?.secreto }}</code>
      </details>
      <CampoCodigo v-model="codigo" />
      <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{{ error }}</p>
      <button class="btn-primario w-full" :disabled="enviando">Activar y continuar</button>
    </form>

    <!-- 3. Mostrar códigos de recuperación una sola vez -->
    <div v-else-if="paso === 'codigos'" class="space-y-4">
      <CodigosRecuperacion :codigos="codigosNuevos" />
      <button class="btn-primario w-full" :disabled="enviando" @click="continuar">Ya los guardé, continuar</button>
    </div>

    <template #pie>
      <button v-if="!['credenciales', 'codigos'].includes(paso)" class="text-slate-500 hover:underline" @click="reiniciar">Volver a ingresar</button>
    </template>
  </TarjetaAuth>
</template>
