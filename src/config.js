/**
 * Configuración en tiempo de EJECUCIÓN. En producción, nginx genera /config.js al iniciar
 * el contenedor con las variables de entorno (la misma imagen sirve para cualquier dominio).
 * En desarrollo se usan las variables VITE_* del archivo .env.
 */
const runtime = window.__KARDEX__ ?? {};
export const API_URL = runtime.apiUrl || import.meta.env.VITE_API_URL;
export const SOCKET_URL = runtime.socketUrl ?? import.meta.env.VITE_SOCKET_URL;
