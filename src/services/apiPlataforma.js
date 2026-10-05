import axios from 'axios';

/**
 * Cliente HTTP de la PLATAFORMA: instancia, token y renovación independientes de los del
 * estudio. Así una sesión de plataforma y una de estudio nunca se mezclan.
 */
import { API_URL } from '@/config';

const BASE = `${API_URL}/plataforma`;
const CABECERAS = { 'X-Requested-With': 'XMLHttpRequest' };

let token = null;
let alExpirar = () => {};
export const setTokenPlataforma = (t) => (token = t);
export const onSesionPlataformaExpirada = (fn) => (alExpirar = fn);

export const apiPlataforma = axios.create({ baseURL: BASE, withCredentials: true, headers: CABECERAS, timeout: 30000 });

let enCurso = null;
export function refrescarPlataforma() {
  const pedir = async () => {
    const { data } = await axios.post(`${BASE}/auth/refresh`, null, { withCredentials: true, headers: CABECERAS });
    token = data.accessToken;
    return data;
  };
  enCurso ||= (navigator.locks ? navigator.locks.request('kardex-plataforma-refresh', pedir) : pedir()).finally(() => (enCurso = null));
  return enCurso;
}

apiPlataforma.interceptors.request.use((config) => {
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
apiPlataforma.interceptors.response.use(
  (r) => r,
  async (error) => {
    const { config, response } = error;
    if (response?.status === 401 && config && !config._reintento && !config.url?.startsWith('/auth/')) {
      config._reintento = true;
      try {
        await refrescarPlataforma();
        return apiPlataforma(config);
      } catch {
        token = null;
        alExpirar();
      }
    }
    return Promise.reject(error);
  },
);
