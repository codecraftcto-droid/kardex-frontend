import { io } from 'socket.io-client';
import { getToken, refrescarToken } from './api';
import { SOCKET_URL } from '@/config';

let socket = null;

/** Conecta el socket; el token se lee en cada (re)conexión. */
export function conectarSocket() {
  if (socket) return socket;
  // Sin URL (modo móvil con proxy) se conecta al mismo origen de la página
  socket = io(SOCKET_URL || undefined, {
    autoConnect: true,
    transports: ['websocket', 'polling'],
    auth: (cb) => cb({ token: getToken() }),
  });
  socket.on('connect_error', async (err) => {
    // Token expirado: renovar y reintentar
    if (err.message === 'No autenticado') {
      try {
        await refrescarToken();
        socket.connect();
      } catch {
        /* el interceptor de API gestionará el cierre de sesión */
      }
    }
  });
  return socket;
}

export function desconectarSocket() {
  socket?.disconnect();
  socket = null;
}

export const obtenerSocket = () => socket;
