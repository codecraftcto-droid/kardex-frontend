import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { apiPlataforma, onSesionPlataformaExpirada, refrescarPlataforma, setTokenPlataforma } from '@/services/apiPlataforma';
import router from '@/router';

export const usePlataforma = defineStore('plataforma', () => {
  const admin = ref(null);
  const inicializado = ref(false);
  const autenticado = computed(() => !!admin.value);
  const esAdmin = computed(() => admin.value?.rol === 'ADMIN');

  /** Paso 1: siempre devuelve el desafío de 2FA (verificar o configurar). */
  async function login(email, password) {
    return (await apiPlataforma.post('/auth/login', { email, password })).data;
  }

  function completarLogin(data) {
    setTokenPlataforma(data.accessToken);
    admin.value = data.admin;
  }

  async function restaurar() {
    if (inicializado.value) return;
    try {
      admin.value = (await refrescarPlataforma()).admin;
    } catch {
      admin.value = null;
    } finally {
      inicializado.value = true;
    }
  }

  function limpiar(redirigir = false) {
    setTokenPlataforma(null);
    admin.value = null;
    if (redirigir) router.push({ name: 'plataforma-login', query: { expirada: '1' } });
  }

  async function logout() {
    try {
      await apiPlataforma.post('/auth/logout');
    } finally {
      limpiar();
      router.push({ name: 'plataforma-login' });
    }
  }

  onSesionPlataformaExpirada(() => limpiar(true));
  return { admin, inicializado, autenticado, esAdmin, login, completarLogin, restaurar, logout };
});
