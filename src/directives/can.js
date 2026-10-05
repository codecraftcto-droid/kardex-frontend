import { watchEffect } from 'vue';
import { useAuth } from '@/stores/auth';

/**
 * v-can="'kardex.salida.crear'"
 * v-can="{ permiso: 'sedes.sede.editar', recurso: { empresaId, sedeId } }"
 * Oculta el elemento si no hay permiso (solo UX: el backend valida siempre).
 */
function evaluar(el, valor) {
  const auth = useAuth();
  const { permiso, recurso } = typeof valor === 'string' ? { permiso: valor } : valor;
  el.style.display = auth.can(permiso, recurso) ? el.__displayOriginal : 'none';
}

export const vCan = {
  mounted(el, binding) {
    el.__displayOriginal = el.style.display;
    el.__detener = watchEffect(() => evaluar(el, binding.value));
  },
  updated(el, binding) {
    evaluar(el, binding.value);
  },
  unmounted(el) {
    el.__detener?.();
  },
};
