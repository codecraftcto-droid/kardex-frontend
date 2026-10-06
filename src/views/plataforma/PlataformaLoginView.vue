<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePlataforma } from '@/stores/plataforma';
import { apiPlataforma } from '@/services/apiPlataforma';
import { mensajeError } from '@/services/api';
import TarjetaAuth from '@/components/TarjetaAuth.vue';
import FormCredenciales from '@/components/FormCredenciales.vue';
import CampoCodigo from '@/components/CampoCodigo.vue';
import CodigosRecuperacion from '@/components/CodigosRecuperacion.vue';

/**
 * Ingreso del equipo de la plataforma (super admin / soporte). Es un acceso SEPARADO del de
 * los estudios: otra tabla de usuarios, otro secreto de tokens y 2FA obligatoria.
 */
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
const reiniciar = () => ((paso.value = 'credenciales'), (codigo.value = ''), (alta.value = null));
</script>

<template>
  <TarjetaAuth
    variante="plataforma"
    :titulo="{ credenciales: 'Panel de la plataforma', verificar: 'Verificación en dos pasos', configurar: 'Configure la verificación en dos pasos', codigos: 'Códigos de recuperación' }[paso]"
    :subtitulo="paso === 'credenciales' ? 'Acceso exclusivo para la administración del servicio.' : email"
  >
    <FormCredenciales
      v-if="paso === 'credenciales'"
      v-model:email="email"
      v-model:password="password"
      :error="error"
      :enviando="enviando"
      texto-boton="Continuar"
      placeholder-correo="usted@codecraft.net.pe"
      nota="Se pedirá el código de su aplicación autenticadora"
      @enviar="enviarCredenciales"
    />

    <form v-else-if="paso === 'verificar'" class="space-y-4" @submit.prevent="verificar">
      <p class="text-sm text-slate-600">{{ recuperacion ? 'Ingrese uno de sus códigos de recuperación.' : 'Ingrese el código de 6 dígitos de su aplicación autenticadora.' }}</p>
      <CampoCodigo v-model="codigo" :recuperacion="recuperacion" />
      <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{{ error }}</p>
      <button class="btn-primario min-h-12 w-full text-base" :disabled="enviando">{{ enviando ? 'Verificando…' : 'Verificar' }}</button>
      <button type="button" class="btn-texto w-full" @click="(recuperacion = !recuperacion), (codigo = '')">
        {{ recuperacion ? 'Usar el código de la aplicación' : '¿Perdió su celular? Use un código de recuperación' }}
      </button>
    </form>

    <form v-else-if="paso === 'configurar'" class="space-y-4" @submit.prevent="activar">
      <p class="text-sm text-slate-600">Primer ingreso: escanee el código con Google Authenticator, Microsoft Authenticator o Authy, y escriba el código que aparece.</p>
      <img :src="alta.qr" alt="Código QR para la aplicación autenticadora" class="mx-auto size-48 rounded-lg border border-slate-200" />
      <details class="text-xs text-slate-500">
        <summary class="cursor-pointer">¿No puede escanear? Ingrese la clave manualmente</summary>
        <code class="mt-1 block rounded bg-slate-100 p-2 break-all">{{ alta.secreto }}</code>
      </details>
      <CampoCodigo v-model="codigo" />
      <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{{ error }}</p>
      <button class="btn-primario min-h-12 w-full text-base" :disabled="enviando">Activar y entrar</button>
    </form>

    <div v-else class="space-y-4">
      <CodigosRecuperacion :codigos="codigos" />
      <button class="btn-primario min-h-12 w-full text-base" @click="continuar">Ya los guardé, continuar</button>
    </div>

    <template #pie>
      <button v-if="['verificar', 'configurar'].includes(paso)" class="text-slate-500 hover:underline" @click="reiniciar">Volver a ingresar</button>
      <RouterLink v-else-if="paso === 'credenciales'" to="/login" class="text-slate-500 hover:text-slate-700 hover:underline">¿Es usuario de un estudio? Ingrese aquí</RouterLink>
    </template>
  </TarjetaAuth>
</template>
