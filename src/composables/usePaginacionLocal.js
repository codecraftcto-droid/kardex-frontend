import { computed, reactive, unref, watch } from 'vue';

/**
 * Paginación de una lista que ya está completa en el navegador (vista previa de reportes,
 * exportaciones, cobranzas…). Devuelve `pag` (para <Paginacion>) y `visibles` (la página actual).
 */
export function usePaginacionLocal(lista, porPagina = 20) {
  const pag = reactive({ pagina: 1, porPagina, total: 0, paginas: 0 });
  const todos = computed(() => unref(lista) ?? []);
  watch(
    () => [todos.value.length, pag.porPagina],
    ([n]) => {
      pag.total = n;
      pag.paginas = Math.max(1, Math.ceil(n / pag.porPagina));
      if (pag.pagina > pag.paginas) pag.pagina = pag.paginas;
    },
    { immediate: true },
  );
  const visibles = computed(() => todos.value.slice((pag.pagina - 1) * pag.porPagina, pag.pagina * pag.porPagina));
  return { pag, visibles };
}
