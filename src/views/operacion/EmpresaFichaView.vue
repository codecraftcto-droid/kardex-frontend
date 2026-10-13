<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, mensajeError } from '@/services/api';
import { useContexto } from '@/stores/contexto';
import { useToast } from '@/stores/toast';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import ModalFacturacion from '@/components/ModalFacturacion.vue';
import ModalSire from '@/components/ModalSire.vue';
import Icono from '@/components/Icono.vue';

/**
 * Ficha de la empresa: en un solo lugar, qué tiene listo y qué le falta para operar (datos,
 * sedes, almacenes, cajas, facturación electrónica, SIRE, plan contable y cuentas), con el acceso
 * directo para resolver cada punto.
 */
const route = useRoute();
const router = useRouter();
const contexto = useContexto();
const toast = useToast();

const d = ref(null);
async function cargar() {
  try {
    d.value = (await api.get(`/empresas/${route.params.id}/configuracion`)).data;
  } catch (e) {
    toast.error(mensajeError(e));
    router.replace('/empresas');
  }
}
watch(() => route.params.id, (id) => id && cargar(), { immediate: true });

const ESTADO = {
  ok: { icono: 'check', clase: 'bg-emerald-50 text-emerald-700', texto: 'Listo' },
  pendiente: { icono: 'alerta', clase: 'bg-red-50 text-red-700', texto: 'Pendiente' },
  aviso: { icono: 'alerta', clase: 'bg-amber-50 text-amber-800', texto: 'Revisar' },
  opcional: { icono: 'check', clase: 'bg-slate-100 text-slate-500', texto: 'Opcional' },
};
const grupos = computed(() => {
  const m = new Map();
  for (const c of d.value?.checks ?? []) m.set(c.grupo, [...(m.get(c.grupo) ?? []), c]);
  return [...m];
});
const porcentaje = computed(() => (d.value?.total ? Math.round((d.value.listos / d.value.total) * 100) : 0));

// Acciones: modales de esta misma pantalla o la pantalla que corresponde (con la empresa activa)
const modal = ref(null);
async function resolver(c) {
  const { tipo, destino } = c.accion;
  if (tipo === 'modal' && destino === 'datos') return router.push({ path: '/empresas', query: { editar: d.value.empresa.id } });
  if (tipo === 'modal') {
    modal.value = destino;
    return undefined;
  }
  if (contexto.empresaActivaId !== d.value.empresa.id) {
    contexto.seleccionar(d.value.empresa.id);
    await nextTick();
  }
  return router.push(destino);
}
function cerrarModal() {
  modal.value = null;
  cargar();
}
</script>

<template>
  <template v-if="d">
    <EncabezadoPagina :titulo="d.empresa.nombreComercial || d.empresa.razonSocial" :subtitulo="`${d.empresa.razonSocial} · RUC ${d.empresa.ruc}`">
      <template #antes>
        <RouterLink to="/empresas" class="mb-1 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"><Icono nombre="atras" clase="size-4" /> Empresas</RouterLink>
      </template>
    </EncabezadoPagina>

    <section class="tarjeta mb-5 p-4 sm:p-5">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="font-semibold">{{ d.listos === d.total ? 'Lista para operar' : `Configuración: ${d.listos} de ${d.total} puntos listos` }}</p>
        <span class="text-sm text-slate-500 tabular-nums">{{ porcentaje }}%</span>
      </div>
      <div class="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" :aria-valuenow="porcentaje" aria-valuemin="0" aria-valuemax="100" aria-label="Avance de la configuración">
        <div class="h-full rounded-full transition-all" :class="d.listos === d.total ? 'bg-emerald-500' : 'bg-marca-600'" :style="{ width: `${porcentaje}%` }" />
      </div>
      <p class="mt-2 text-xs text-slate-500">Solo se muestran los puntos de los módulos que el estudio tiene contratados.</p>
    </section>

    <div class="grid gap-4 lg:grid-cols-2">
      <section v-for="[grupo, lista] in grupos" :key="grupo" class="tarjeta p-4 sm:p-5">
        <h2 class="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">{{ grupo }}</h2>
        <ul class="divide-y divide-slate-100">
          <li v-for="c in lista" :key="c.clave" class="flex items-start gap-3 py-3">
            <span class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full" :class="ESTADO[c.estado].clase" :title="ESTADO[c.estado].texto">
              <Icono :nombre="ESTADO[c.estado].icono" clase="size-4" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="font-medium">{{ c.titulo }}</p>
              <p class="text-sm text-slate-600">{{ c.detalle }}</p>
            </div>
            <button v-if="c.accion.permitido" class="btn-secundario min-h-9 shrink-0 px-3 text-sm" @click="resolver(c)">
              {{ c.estado === 'ok' || c.estado === 'opcional' ? 'Ver' : 'Configurar' }}
            </button>
          </li>
        </ul>
      </section>
    </div>

    <ModalFacturacion :abierto="modal === 'facturacion'" :empresa="d.empresa" @cerrar="cerrarModal" @guardado="cargar" />
    <ModalSire :abierto="modal === 'sire'" :empresa="d.empresa" @cerrar="cerrarModal" @guardado="cargar" />
  </template>
  <p v-else class="text-sm text-slate-500">Cargando…</p>
</template>
