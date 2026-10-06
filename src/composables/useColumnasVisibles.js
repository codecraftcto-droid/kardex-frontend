import { computed, ref, toValue, watch } from 'vue';

/**
 * Columnas visibles de una tabla, recordadas por navegador (localStorage) con una clave por tabla.
 * El estado es COMPARTIDO por clave: el botón "Columnas" de la barra de filtros y la tabla usan la
 * misma clave y se mantienen sincronizados sin pasarse nada.
 * Se guardan las OCULTAS (una columna nueva aparece sola). La primera columna nunca se oculta.
 */
const estados = new Map();
function estado(llave) {
  if (!estados.has(llave)) {
    let inicial = [];
    try { inicial = JSON.parse(localStorage.getItem(llave)) ?? []; } catch { /* sin almacenamiento */ }
    const r = ref(inicial);
    watch(r, (v) => {
      try { localStorage.setItem(llave, JSON.stringify(v)); } catch { /* sin almacenamiento */ }
    }, { deep: true });
    estados.set(llave, r);
  }
  return estados.get(llave);
}

export function useColumnasVisibles(clave, columnas) {
  const llave = computed(() => `kardex:columnas:${toValue(clave)}`);
  const ocultas = computed({ get: () => estado(llave.value).value, set: (v) => (estado(llave.value).value = v) });
  const todas = computed(() => toValue(columnas));
  const visibles = computed(() => todas.value.filter((c, i) => i === 0 || !ocultas.value.includes(c.clave)));
  const alternar = (c) => {
    const lista = estado(llave.value).value;
    const i = lista.indexOf(c);
    i >= 0 ? lista.splice(i, 1) : lista.push(c);
  };
  const restablecer = () => (ocultas.value = []);
  return { todas, visibles, ocultas, alternar, restablecer };
}
