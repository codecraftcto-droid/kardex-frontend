<script setup>
/** Campo para el código de 6 dígitos (autocompletado desde SMS/app en móviles). */
const modelo = defineModel({ type: String, default: '' });
defineProps({ recuperacion: Boolean });
</script>

<template>
  <input
    v-if="!recuperacion"
    v-model="modelo"
    class="input min-h-14 text-center font-mono text-2xl tracking-[0.5em]"
    inputmode="numeric"
    autocomplete="one-time-code"
    pattern="\d{6}"
    maxlength="6"
    placeholder="000000"
    required
    autofocus
  />
  <input
    v-else
    v-model="modelo"
    class="input min-h-12 text-center font-mono text-lg uppercase"
    autocomplete="off"
    placeholder="XXXX-XXXX"
    maxlength="9"
    required
    autofocus
  />
</template>
