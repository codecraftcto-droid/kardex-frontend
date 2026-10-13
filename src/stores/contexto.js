import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '@/services/api';
import { mesActualLima } from '@/utils/fechas';

/** Empresa activa: el usuario solo puede elegir entre las suyas. */
export const useContexto = defineStore('contexto', () => {
  const empresas = ref([]);
  const empresaActivaId = ref(null);
  let clave = null;

  const empresaActiva = computed(() => empresas.value.find((e) => e.id === empresaActivaId.value) || null);

  // Período de trabajo (AAAA-MM): uno solo para todas las pantallas que trabajan por mes
  let guardado = null;
  try { guardado = localStorage.getItem('kardex:periodo'); } catch { /* almacenamiento no disponible */ }
  const mes = ref(/^\d{4}-\d{2}$/.test(guardado ?? '') && guardado <= mesActualLima() ? guardado : mesActualLima());
  const periodo = computed(() => mes.value.replace('-', ''));
  function fijarMes(valor) {
    if (!/^\d{4}-\d{2}$/.test(valor ?? '')) return;
    mes.value = valor > mesActualLima() ? mesActualLima() : valor;
    try { localStorage.setItem('kardex:periodo', mes.value); } catch { /* almacenamiento no disponible */ }
  }

  async function cargar(usuarioId) {
    clave = `kardex:empresa:${usuarioId}`;
    empresas.value = (await api.get('/me/contexto')).data.empresas;
    let guardada = null;
    try { guardada = localStorage.getItem(clave); } catch { /* almacenamiento no disponible */ }
    const valida = empresas.value.some((e) => e.id === guardada);
    empresaActivaId.value = valida ? guardada : empresas.value[0]?.id ?? null;
  }

  function seleccionar(id) {
    empresaActivaId.value = id;
    try { localStorage.setItem(clave, id); } catch { /* almacenamiento no disponible */ }
  }

  function $reset() {
    empresas.value = [];
    empresaActivaId.value = null;
  }

  return { empresas, empresaActivaId, empresaActiva, mes, periodo, fijarMes, cargar, seleccionar, $reset };
});
