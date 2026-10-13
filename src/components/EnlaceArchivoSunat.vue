<script setup>
import { computed, ref } from 'vue';
import { descargar, mensajeError } from '@/services/api';
import { useToast } from '@/stores/toast';

/**
 * XML o CDR de un envío a SUNAT. Con SUNAT directo el archivo está guardado en el sistema
 * ("archivo:<id>") y se descarga con la sesión; con un proveedor externo es su enlace https.
 */
const props = defineProps({
  valor: { type: String, required: true },
  texto: { type: String, required: true },
  nombre: { type: String, required: true }, // nombre del archivo al descargar
});
const toast = useToast();
const interno = computed(() => props.valor.startsWith('archivo:'));
const bajando = ref(false);

async function bajar() {
  bajando.value = true;
  try {
    await descargar(`/cpe/archivos/${props.valor.slice(8)}`, null, props.nombre);
  } catch (e) {
    toast.error(mensajeError(e, 'No se pudo descargar el archivo'));
  } finally {
    bajando.value = false;
  }
}
</script>

<template>
  <button v-if="interno" type="button" class="text-marca-700 hover:underline disabled:opacity-60" :disabled="bajando" @click="bajar">{{ texto }}</button>
  <a v-else :href="valor" target="_blank" rel="noopener" class="text-marca-700 hover:underline">{{ texto }}</a>
</template>
