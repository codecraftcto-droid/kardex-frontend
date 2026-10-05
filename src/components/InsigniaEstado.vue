<script setup>
defineProps({ activo: Boolean, textoSi: { type: String, default: 'Activo' }, textoNo: { type: String, default: 'Inactivo' } });
</script>

<template>
  <span class="insignia" :class="activo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'">
    {{ activo ? textoSi : textoNo }}
  </span>
</template>
