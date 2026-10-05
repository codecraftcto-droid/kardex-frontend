import { reactive, ref, watch } from 'vue';
import { api, mensajeError } from '@/services/api';
import { useToast } from '@/stores/toast';

/** Listado paginado con búsqueda (debounce) y filtros reactivos. `cliente`: API de estudio o de plataforma. */
export function useListado(url, filtrosIniciales = {}, cliente = api) {
  const toast = useToast();
  const filas = ref([]);
  const cargando = ref(false);
  const filtros = reactive({ q: '', ...filtrosIniciales });
  const pag = reactive({ pagina: 1, porPagina: 20, total: 0, paginas: 0 });

  async function cargar() {
    cargando.value = true;
    try {
      const params = Object.fromEntries(Object.entries({ ...filtros, pagina: pag.pagina, porPagina: pag.porPagina }).filter(([, v]) => v !== '' && v != null));
      const { data } = await cliente.get(typeof url === 'function' ? url() : url, { params });
      filas.value = data.datos;
      extra.value = data; // datos adicionales del listado (p. ej. resumen)
      Object.assign(pag, { total: data.total, paginas: data.paginas });
    } catch (e) {
      toast.error(mensajeError(e));
    } finally {
      cargando.value = false;
    }
  }

  let t;
  watch(
    () => ({ ...filtros }),
    () => {
      clearTimeout(t);
      t = setTimeout(() => {
        pag.pagina = 1;
        cargar();
      }, 300);
    },
  );
  watch(() => pag.pagina, cargar);

  const extra = ref(null);
  return { filas, cargando, filtros, pag, cargar, extra };
}
