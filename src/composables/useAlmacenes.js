import { ref, watch } from 'vue';
import { api } from '@/services/api';
import { useAuth } from '@/stores/auth';
import { useContexto } from '@/stores/contexto';

/** Almacenes visibles de la empresa activa (se recargan al cambiar de empresa). */
export function useAlmacenes() {
  const auth = useAuth();
  const contexto = useContexto();
  const almacenes = ref([]);

  async function cargar() {
    const empresaId = contexto.empresaActivaId;
    almacenes.value = [];
    if (!empresaId || !auth.canEnEmpresa('almacenes.almacen.ver', empresaId)) return;
    const { data } = await api.get('/almacenes', { params: { empresaId, activo: 'true', porPagina: 100 } });
    almacenes.value = data.datos;
  }
  watch(() => contexto.empresaActivaId, cargar, { immediate: true });

  /** Almacenes donde el usuario tiene `permiso`. */
  const conPermiso = (permiso) =>
    almacenes.value.filter((a) => auth.can(permiso, { empresaId: a.empresaId, sedeId: a.sedeId, almacenId: a.id }));

  return { almacenes, conPermiso, recargar: cargar };
}
