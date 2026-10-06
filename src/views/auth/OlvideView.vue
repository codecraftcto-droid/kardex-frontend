<script setup>
import { ref } from 'vue';
import { api, mensajeError } from '@/services/api';
import TarjetaAuth from '@/components/TarjetaAuth.vue';

const email = ref('');
const mensaje = ref('');
const error = ref('');
const enviando = ref(false);

async function enviar() {
  error.value = '';
  enviando.value = true;
  try {
    mensaje.value = (await api.post('/auth/olvide', { email: email.value })).data.mensaje;
  } catch (e) {
    error.value = mensajeError(e);
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <TarjetaAuth titulo="Recuperar contraseña" subtitulo="Le enviaremos un enlace temporal de un solo uso">
    <p v-if="mensaje" class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ mensaje }}</p>
    <form v-else class="space-y-4" @submit.prevent="enviar">
      <div>
        <label class="etiqueta" for="email">Correo electrónico</label>
        <input id="email" v-model="email" type="email" class="input min-h-12" placeholder="usted@estudio.pe" required autofocus />
      </div>
      <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{{ error }}</p>
      <button class="btn-primario min-h-12 w-full text-base" :disabled="enviando">Enviar enlace</button>
    </form>
    <template #pie><RouterLink to="/login" class="text-marca-700 hover:underline">Volver a ingresar</RouterLink></template>
  </TarjetaAuth>
</template>
