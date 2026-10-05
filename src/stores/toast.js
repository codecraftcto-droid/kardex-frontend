import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useToast = defineStore('toast', () => {
  const mensajes = ref([]);
  let id = 0;
  function mostrar(texto, tipo = 'exito', ms = 4000) {
    const m = { id: ++id, texto, tipo };
    mensajes.value.push(m);
    setTimeout(() => cerrar(m.id), ms);
  }
  const cerrar = (mid) => (mensajes.value = mensajes.value.filter((m) => m.id !== mid));
  return {
    mensajes,
    cerrar,
    exito: (t) => mostrar(t, 'exito'),
    error: (t) => mostrar(t, 'error', 6000),
    info: (t) => mostrar(t, 'info'),
    aviso: (t) => mostrar(t, 'aviso', 8000),
  };
});
