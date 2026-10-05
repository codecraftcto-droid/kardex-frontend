import axios from 'axios';

import { API_URL } from '@/config';

const BASE = API_URL;
const CABECERAS = { 'X-Requested-With': 'XMLHttpRequest' };

/**
 * El access token vive SOLO en memoria (no en localStorage) para reducir el
 * impacto de un XSS. El refresh token es una cookie httpOnly que gestiona el backend.
 */
let tokenAcceso = null;
let alExpirarSesion = () => {};

export const getToken = () => tokenAcceso;
export const setToken = (t) => (tokenAcceso = t);
export const onSesionExpirada = (fn) => (alExpirarSesion = fn);

export const api = axios.create({ baseURL: BASE, withCredentials: true, headers: CABECERAS, timeout: 30000 });

let enCurso = null;

/**
 * Renueva el access token. Se serializa entre pestañas con Web Locks: el refresh
 * token rota en cada uso y dos renovaciones simultáneas se detectarían como robo.
 */
export function refrescarToken() {
  const pedir = async () => {
    const { data } = await axios.post(`${BASE}/auth/refresh`, null, { withCredentials: true, headers: CABECERAS });
    tokenAcceso = data.accessToken;
    return tokenAcceso;
  };
  enCurso ||= (navigator.locks ? navigator.locks.request('kardex-refresh', pedir) : pedir()).finally(() => {
    enCurso = null;
  });
  return enCurso;
}

api.interceptors.request.use((config) => {
  if (tokenAcceso) config.headers.Authorization = `Bearer ${tokenAcceso}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const { config, response } = error;
    const esAuth = config?.url?.startsWith('/auth/');
    if (response?.status === 401 && config && !config._reintento && !esAuth) {
      config._reintento = true;
      try {
        await refrescarToken();
        return api(config);
      } catch {
        tokenAcceso = null;
        alExpirarSesion();
      }
    }
    return Promise.reject(error);
  },
);

/** Mensaje legible de un error de API. */
export function mensajeError(err, porDefecto = 'Ocurrió un error inesperado') {
  const d = err?.response?.data;
  if (d?.detalles?.length) return d.detalles.map((x) => x.mensaje).join('. ');
  if (d?.error) return d.error;
  if (err?.code === 'ERR_NETWORK') return 'No se pudo conectar con el servidor';
  return porDefecto;
}

/** Descarga un archivo autenticado (CSV, Excel, PDF). */
export async function descargar(url, params, nombre) {
  let data;
  try {
    ({ data } = await api.get(url, { params, responseType: 'blob' }));
  } catch (err) {
    // Con responseType blob el error JSON llega como Blob: se convierte para mostrar el mensaje
    if (err.response?.data instanceof Blob) {
      try { err.response.data = JSON.parse(await err.response.data.text()); } catch { /* no era JSON */ }
    }
    throw err;
  }
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(data);
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(enlace.href);
}
