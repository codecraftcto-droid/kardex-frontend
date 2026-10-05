<script setup>
const props = defineProps({ pag: { type: Object, required: true } });
const ir = (n) => (props.pag.pagina = Math.min(Math.max(1, n), props.pag.paginas || 1));
</script>

<template>
  <nav v-if="pag.paginas > 1" class="mt-4 flex items-center justify-between gap-2 text-sm" aria-label="Paginación">
    <span class="text-slate-500">{{ pag.total }} registros · pág. {{ pag.pagina }}/{{ pag.paginas }}</span>
    <div class="flex gap-2">
      <button class="btn-secundario" :disabled="pag.pagina <= 1" @click="ir(pag.pagina - 1)">Anterior</button>
      <button class="btn-secundario" :disabled="pag.pagina >= pag.paginas" @click="ir(pag.pagina + 1)">Siguiente</button>
    </div>
  </nav>
</template>
