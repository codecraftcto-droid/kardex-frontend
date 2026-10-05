<script setup>
import { onBeforeUnmount, watch } from 'vue';
import Icono from './Icono.vue';

const props = defineProps({
  abierto: Boolean,
  titulo: String,
  ancho: { type: String, default: 'sm:max-w-lg' },
});
const emit = defineEmits(['cerrar']);

const alTeclear = (e) => e.key === 'Escape' && emit('cerrar');
watch(
  () => props.abierto,
  (v) => {
    document.body.style.overflow = v ? 'hidden' : '';
    v ? addEventListener('keydown', alTeclear) : removeEventListener('keydown', alTeclear);
  },
);
onBeforeUnmount(() => {
  document.body.style.overflow = '';
  removeEventListener('keydown', alTeclear);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <!-- Pantalla completa en móvil; diálogo centrado desde sm -->
      <div v-if="abierto" class="fixed inset-0 z-50 flex items-stretch justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true">
        <div class="absolute inset-0 hidden bg-slate-900/50 sm:block" @click="emit('cerrar')" />
        <div class="relative flex h-full w-full flex-col bg-white sm:h-auto sm:max-h-[90vh] sm:rounded-xl sm:shadow-xl" :class="ancho">
          <header class="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <h2 class="text-base font-semibold">{{ titulo }}</h2>
            <button class="btn px-2 text-slate-500 hover:bg-slate-100" aria-label="Cerrar" @click="emit('cerrar')">
              <Icono nombre="cerrar" />
            </button>
          </header>
          <div class="flex-1 overflow-y-auto px-4 py-4"><slot /></div>
          <footer v-if="$slots.pie" class="flex flex-col-reverse gap-2 border-t border-slate-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
            <slot name="pie" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active, .modal-leave-active { transition: opacity 0.15s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
</style>
