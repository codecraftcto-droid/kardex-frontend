import { onMounted, onBeforeUnmount } from 'vue';
import { obtenerSocket } from '@/services/socket';

/** Suscribe un manejador a eventos Socket.io mientras el componente está montado. */
export function useTiempoReal(eventos, manejador) {
  const lista = Array.isArray(eventos) ? eventos : [eventos];
  onMounted(() => lista.forEach((e) => obtenerSocket()?.on(e, manejador)));
  onBeforeUnmount(() => lista.forEach((e) => obtenerSocket()?.off(e, manejador)));
}
