<script setup>
import { nextTick, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/services/api';
import { useContexto } from '@/stores/contexto';
import { fecha } from '@/utils/formato';
import Icono from './Icono.vue';

/**
 * Pendientes de todo el estudio (todas las empresas que el usuario ve): registros SIRE vencidos o
 * por vencer, diferencias por conciliar y conexiones con error. Es lo primero que mira el contador.
 */
const router = useRouter();
const contexto = useContexto();
const datos = ref(null);
const MAX = 6;
const TIPO = {
  VENCIDO: { texto: 'Vencido', clase: 'bg-red-50 text-red-700' },
  POR_VENCER: { texto: 'Por vencer', clase: 'bg-amber-50 text-amber-800' },
  DIFERENCIAS: { texto: 'Diferencias', clase: 'bg-violet-50 text-violet-700' },
  CONEXION: { texto: 'Conexión', clase: 'bg-slate-100 text-slate-700' },
};
onMounted(async () => {
  try {
    datos.value = (await api.get('/sire/panel', { params: { n: 3 } })).data;
  } catch {
    datos.value = null; // sin acceso o sin el módulo: el bloque no se muestra
  }
});
async function abrir(a) {
  if (a.tipo === 'CONEXION') return router.push({ path: `/empresas/${a.empresaId}` });
  if (contexto.empresaActivaId !== a.empresaId) {
    contexto.seleccionar(a.empresaId);
    await nextTick();
  }
  return router.push(`/sire/${a.registro}/${a.periodo}`);
}
</script>

<template>
  <section v-if="datos" class="tarjeta p-4 sm:p-5">
    <div class="mb-3 flex items-center justify-between gap-2">
      <h2 class="font-semibold text-slate-900">Pendientes del estudio</h2>
      <RouterLink to="/sire/panel?vista=alertas" class="text-sm font-medium text-marca-700 hover:underline">Ver todo</RouterLink>
    </div>
    <p v-if="!datos.alertas.length" class="flex items-center gap-2 py-3 text-sm text-emerald-700">
      <Icono nombre="check" clase="size-5" /> Todo al día en las {{ datos.resumen.empresas }} empresa(s)
    </p>
    <ul v-else class="divide-y divide-slate-100">
      <li v-for="(a, i) in datos.alertas.slice(0, MAX)" :key="i">
        <button type="button" class="flex w-full items-center gap-3 py-2.5 text-left hover:bg-slate-50" @click="abrir(a)">
          <span class="insignia w-24 shrink-0 justify-center" :class="TIPO[a.tipo].clase">{{ TIPO[a.tipo].texto }}</span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium">{{ a.empresa }}</span>
            <span class="block truncate text-xs text-slate-500">{{ a.texto }}<template v-if="a.etiqueta"> · {{ a.etiqueta }}</template><template v-if="a.vencimiento"> · {{ fecha(a.vencimiento) }}</template></span>
          </span>
          <Icono nombre="abajo" clase="size-4 -rotate-90 text-slate-400" />
        </button>
      </li>
    </ul>
    <p v-if="datos.alertas.length > MAX" class="mt-2 text-xs text-slate-500">y {{ datos.alertas.length - MAX }} más</p>
  </section>
</template>
