<script setup>
import { useToast } from '@/stores/toast';
const toast = useToast();
const estilos = { exito: 'bg-emerald-600', error: 'bg-red-600', info: 'bg-slate-800', aviso: 'bg-amber-600' };
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end" aria-live="polite">
    <TransitionGroup name="toast">
      <button
        v-for="m in toast.mensajes"
        :key="m.id"
        class="pointer-events-auto w-full max-w-sm rounded-lg px-4 py-3 text-left text-sm text-white shadow-lg"
        :class="estilos[m.tipo]"
        @click="toast.cerrar(m.id)"
      >
        {{ m.texto }}
      </button>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active, .toast-leave-active { transition: all 0.2s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(-8px); }
</style>
