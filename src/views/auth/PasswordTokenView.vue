<script setup>
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api, mensajeError } from '@/services/api';
import TarjetaAuth from '@/components/TarjetaAuth.vue';

// Sirve para activar una invitación y para restablecer la contraseña
const route = useRoute();
const activar = computed(() => route.meta.modo === 'activar');
const password = ref('');
const confirmar = ref('');
const error = ref('');
const exito = ref('');
const enviando = ref(false);

async function enviar() {
  error.value = '';
  if (password.value !== confirmar.value) return (error.value = 'Las contraseñas no coinciden');
  enviando.value = true;
  try {
    const url = activar.value ? '/auth/activar' : '/auth/restablecer';
    exito.value = (await api.post(url, { token: route.query.token, password: password.value })).data.mensaje;
  } catch (e) {
    error.value = mensajeError(e);
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <TarjetaAuth
    :titulo="activar ? 'Activar cuenta' : 'Nueva contraseña'"
    subtitulo="Mínimo 8 caracteres, con letras y números"
  >
    <div v-if="exito" class="space-y-4">
      <p class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ exito }}</p>
      <RouterLink to="/login" class="btn-primario w-full">Ir a ingresar</RouterLink>
    </div>
    <p v-else-if="!route.query.token" class="text-sm text-red-700">Enlace inválido.</p>
    <form v-else class="space-y-4" @submit.prevent="enviar">
      <div>
        <label class="etiqueta" for="p1">Contraseña</label>
        <input id="p1" v-model="password" type="password" class="input" autocomplete="new-password" minlength="8" required />
      </div>
      <div>
        <label class="etiqueta" for="p2">Confirmar contraseña</label>
        <input id="p2" v-model="confirmar" type="password" class="input" autocomplete="new-password" required />
      </div>
      <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{{ error }}</p>
      <button class="btn-primario w-full" :disabled="enviando">Guardar contraseña</button>
    </form>
  </TarjetaAuth>
</template>
