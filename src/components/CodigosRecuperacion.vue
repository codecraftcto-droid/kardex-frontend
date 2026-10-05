<script setup>
import { ref } from 'vue';
const props = defineProps({ codigos: { type: Array, required: true } });
const copiado = ref(false);
async function copiar() {
  try {
    await navigator.clipboard.writeText(props.codigos.join('\n'));
    copiado.value = true;
  } catch { /* portapapeles no disponible */ }
}
function descargar() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([`Códigos de recuperación — Kardex\n\n${props.codigos.join('\n')}\n\nCada código sirve una sola vez.\n`], { type: 'text/plain' }));
  a.download = 'kardex-codigos-recuperacion.txt';
  a.click();
  URL.revokeObjectURL(a.href);
}
</script>

<template>
  <div class="space-y-3">
    <p class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
      Guarde estos códigos en un lugar seguro. Le permiten ingresar si pierde su celular. <strong>Cada uno sirve una sola vez</strong> y no se volverán a mostrar.
    </p>
    <ul class="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 font-mono text-sm">
      <li v-for="c in codigos" :key="c" class="text-center">{{ c }}</li>
    </ul>
    <div class="flex gap-2">
      <button type="button" class="btn-secundario flex-1" @click="copiar">{{ copiado ? 'Copiado' : 'Copiar' }}</button>
      <button type="button" class="btn-secundario flex-1" @click="descargar">Descargar .txt</button>
    </div>
  </div>
</template>
