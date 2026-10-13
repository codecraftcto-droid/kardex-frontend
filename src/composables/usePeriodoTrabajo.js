import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useContexto } from '@/stores/contexto';
import { aMes } from '@/utils/fechas';

/**
 * Período de trabajo (AAAA-MM) compartido por todas las pantallas que trabajan por mes: se elige
 * una vez en la cabecera y se recuerda. Un enlace con ?periodo=AAAAMM lo fija al abrir la pantalla.
 */
export function usePeriodoTrabajo() {
  const route = useRoute();
  const contexto = useContexto();
  const q = route.query.periodo;
  if (typeof q === 'string' && /^\d{6}$/.test(q)) contexto.fijarMes(aMes(q));
  return computed({ get: () => contexto.mes, set: (v) => contexto.fijarMes(v) });
}
