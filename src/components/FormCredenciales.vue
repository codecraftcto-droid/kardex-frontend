<script setup>
import { ref } from 'vue';
import Icono from './Icono.vue';

/** Correo + contraseña con íconos, botón para ver la contraseña y estado de carga. Lo usan ambos ingresos. */
defineProps({
  error: String,
  enviando: Boolean,
  textoBoton: { type: String, default: 'Ingresar' },
  /** Ruta de "¿La olvidó?" (sin ella no se muestra) */
  rutaOlvido: String,
  placeholderCorreo: { type: String, default: 'usted@estudio.pe' },
  nota: String,
});
const emit = defineEmits(['enviar']);
const email = defineModel('email', { type: String, default: '' });
const password = defineModel('password', { type: String, default: '' });
const ver = ref(false);
</script>

<template>
  <form class="space-y-5" @submit.prevent="emit('enviar')">
    <div>
      <label class="etiqueta" for="email">Correo electrónico</label>
      <div class="relative">
        <Icono nombre="correo" clase="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-slate-400" />
        <input id="email" v-model="email" type="email" class="input min-h-12 pl-11" :placeholder="placeholderCorreo" autocomplete="username" required autofocus />
      </div>
    </div>
    <div>
      <div class="mb-1 flex items-center justify-between">
        <label class="etiqueta mb-0" for="password">Contraseña</label>
        <RouterLink v-if="rutaOlvido" :to="rutaOlvido" class="text-sm font-medium text-marca-700 hover:underline">¿La olvidó?</RouterLink>
      </div>
      <div class="relative">
        <Icono nombre="candado" clase="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-slate-400" />
        <input id="password" v-model="password" :type="ver ? 'text' : 'password'" class="input min-h-12 pr-12 pl-11" placeholder="••••••••" autocomplete="current-password" required />
        <button
          type="button"
          class="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-marca-600"
          :aria-label="ver ? 'Ocultar contraseña' : 'Mostrar contraseña'"
          :aria-pressed="ver"
          @click="ver = !ver"
        >
          <Icono :nombre="ver ? 'ojoTachado' : 'ojo'" clase="size-5" />
        </button>
      </div>
    </div>
    <p v-if="error" class="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">
      <Icono nombre="alerta" clase="mt-0.5 size-4 shrink-0" /> {{ error }}
    </p>
    <button class="btn-primario min-h-12 w-full text-base shadow-sm shadow-marca-700/20" :disabled="enviando">
      <svg v-if="enviando" class="size-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity="0.3" stroke-width="3" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round" /></svg>
      {{ enviando ? 'Verificando…' : textoBoton }}
    </button>
    <p v-if="nota" class="flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
      <Icono nombre="roles" clase="size-4 shrink-0" /> {{ nota }}
    </p>
  </form>
</template>
