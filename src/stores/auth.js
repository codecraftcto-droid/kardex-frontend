import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api, setToken, refrescarToken, onSesionExpirada } from '@/services/api';
import { conectarSocket, desconectarSocket } from '@/services/socket';
import { puede, puedeEnEmpresa, tieneAlguno } from '@/services/permisos';
import { useContexto } from './contexto';
import router from '@/router';

export const useAuth = defineStore('auth', () => {
  const usuario = ref(null);
  const permisos = ref(null);
  const inicializado = ref(false);

  const autenticado = computed(() => !!usuario.value);
  const esCliente = computed(() => usuario.value?.tipo === 'cliente');

  /** can('codigo') → en algún alcance; can('codigo', { empresaId, sedeId, almacenId }) → sobre un recurso. */
  const can = (codigo, recurso) => puede(permisos.value, codigo, recurso);
  const canEnEmpresa = (codigo, empresaId) => puedeEnEmpresa(permisos.value, codigo, empresaId);
  const canAlguno = (codigo) => tieneAlguno(permisos.value, codigo);

  async function cargarPermisos() {
    permisos.value = (await api.get('/me/permisos')).data;
  }

  async function cargarSesion() {
    const [me] = await Promise.all([api.get('/me'), cargarPermisos()]);
    usuario.value = me.data;
    await useContexto().cargar(me.data.id);
    const socket = conectarSocket();
    socket.off('permisos:actualizados').on('permisos:actualizados', async () => {
      await cargarPermisos();
      await useContexto().cargar(usuario.value.id);
    });
    socket.off('sesion:cerrada').on('sesion:cerrada', () => limpiar(true));
  }

  /**
   * Paso 1 del login. Si la cuenta usa 2FA (o su rol lo exige) devuelve
   * { mfa: 'verificar' | 'configurar', desafio } y la sesión se completa en el paso 2.
   */
  async function login(email, password) {
    const { data } = await api.post('/auth/login', { email, password });
    if (data.mfa) return data;
    await completarLogin(data);
    return null;
  }

  /** Recibe los tokens (tras la contraseña o tras el segundo factor) y carga la sesión. */
  async function completarLogin(data) {
    setToken(data.accessToken);
    await cargarSesion();
  }

  /** Al recargar la página: intenta recuperar la sesión con la cookie de refresh. */
  async function restaurar() {
    if (inicializado.value) return;
    try {
      await refrescarToken();
      await cargarSesion();
    } catch {
      usuario.value = null;
    } finally {
      inicializado.value = true;
    }
  }

  function limpiar(redirigir = false) {
    setToken(null);
    usuario.value = null;
    permisos.value = null;
    desconectarSocket();
    useContexto().$reset();
    if (redirigir) router.push({ name: 'login', query: { expirada: '1' } });
  }

  async function logout() {
    try {
      await api.post('/auth/logout');
    } finally {
      limpiar();
      router.push({ name: 'login' });
    }
  }

  onSesionExpirada(() => limpiar(true));

  return {
    usuario, permisos, inicializado, autenticado, esCliente,
    can, canEnEmpresa, canAlguno, login, completarLogin, logout, restaurar, cargarPermisos,
  };
});
