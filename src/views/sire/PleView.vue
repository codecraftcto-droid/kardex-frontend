<script setup>
import { usePeriodoTrabajo } from '@/composables/usePeriodoTrabajo';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, descargar, mensajeError } from '@/services/api';
import { useContexto } from '@/stores/contexto';
import { useToast } from '@/stores/toast';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import BaseModal from '@/components/BaseModal.vue';
import Icono from '@/components/Icono.vue';

/**
 * Libros electrónicos PLE del período: Diario (5.1), plan contable (5.3), Mayor (6.1) e inventario
 * permanente valorizado (13.1), listos para el validador PLE de SUNAT.
 */
const route = useRoute();
const router = useRouter();
const contexto = useContexto();
const toast = useToast();

const mes = usePeriodoTrabajo();
const periodo = computed(() => mes.value.replace('-', ''));

const d = ref(null);
const cargando = ref(false);
async function cargar() {
  if (!contexto.empresaActivaId || !mes.value) return;
  cargando.value = true;
  try {
    d.value = (await api.get('/ple', { params: { empresaId: contexto.empresaActivaId, periodo: periodo.value } })).data;
    router.replace({ query: { ...route.query, periodo: periodo.value } });
  } catch (e) {
    d.value = null;
    toast.error(mensajeError(e));
  } finally {
    cargando.value = false;
  }
}
watch([() => contexto.empresaActivaId, periodo], cargar, { immediate: true });

const params = () => ({ empresaId: contexto.empresaActivaId, periodo: periodo.value });
const bajando = ref(null);
async function bajar(libro, nombre) {
  bajando.value = libro;
  try {
    await descargar(libro === 'zip' ? '/ple/zip' : `/ple/${libro}/txt`, params(), nombre);
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    bajando.value = null;
  }
}

// Vista previa: las primeras líneas del TXT, con cada campo en su columna
const vista = ref(null);
async function verMuestra(l) {
  vista.value = { ...l, cargando: true };
  try {
    vista.value = (await api.get(`/ple/${l.libro}`, { params: params() })).data;
  } catch (e) {
    toast.error(mensajeError(e));
    vista.value = null;
  }
}
const columnasMuestra = computed(() => (vista.value?.muestra ?? []).map((linea) => linea.split('|').slice(0, -1)));
</script>

<template>
  <EncabezadoPagina titulo="Libros electrónicos (PLE)" :subtitulo="contexto.empresaActiva?.razonSocial">
    <button v-if="d?.libros.length" class="btn-primario" :disabled="bajando === 'zip'" @click="bajar('zip', `PLE-${d.empresa.ruc}-${periodo}.zip`)">
      <Icono nombre="descargar" clase="size-4" /> {{ bajando === 'zip' ? 'Preparando…' : 'Descargar todos (ZIP)' }}
    </button>
  </EncabezadoPagina>

  <p class="mb-4 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
    <Icono nombre="alerta" clase="mt-0.5 size-4 shrink-0" />
    Los registros de ventas y compras van por el SIRE. Estos libros se presentan con el programa PLE de SUNAT: páselos por su validador antes de enviarlos.
  </p>

  <p v-if="cargando && !d" class="text-sm text-slate-500">Generando…</p>
  <div v-else-if="d" class="grid gap-3 lg:grid-cols-2">
    <section v-for="l in d.libros" :key="l.libro" class="tarjeta flex min-w-0 flex-col gap-3 p-4 sm:p-5">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="flex flex-wrap items-center gap-2">
            <span class="insignia bg-marca-50 font-mono text-marca-700">{{ l.codigo }}</span>
            <span class="font-semibold">{{ l.nombre }}</span>
          </p>
          <p class="mt-1 truncate font-mono text-xs text-slate-500" :title="l.nombreArchivo">{{ l.nombreArchivo }}</p>
        </div>
        <span class="insignia shrink-0" :class="l.conInformacion ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'">
          {{ l.conInformacion ? `${l.filas} líneas` : 'Sin información' }}
        </span>
      </div>
      <ul v-if="l.avisos.length" class="space-y-1 text-xs text-amber-800">
        <li v-for="a in l.avisos" :key="a" class="flex items-start gap-1.5"><Icono nombre="alerta" clase="mt-0.5 size-3.5 shrink-0" /> {{ a }}</li>
      </ul>
      <div class="mt-auto flex flex-wrap justify-end gap-2">
        <button class="btn-secundario" :disabled="!l.conInformacion" @click="verMuestra(l)">Vista previa</button>
        <button class="btn-secundario" :disabled="bajando === l.libro" @click="bajar(l.libro, l.nombreArchivo)"><Icono nombre="descargar" clase="size-4" /> TXT</button>
      </div>
    </section>
  </div>

  <BaseModal :abierto="!!vista" :titulo="vista ? `${vista.codigo} ${vista.nombre}` : ''" ancho="sm:max-w-6xl" @cerrar="vista = null">
    <p v-if="vista?.cargando" class="py-8 text-center text-sm text-slate-500">Cargando…</p>
    <template v-else-if="vista">
      <p class="mb-2 text-sm text-slate-600">
        <span class="font-mono">{{ vista.nombreArchivo }}</span> · {{ vista.filas }} líneas<template v-if="vista.filas > vista.muestra.length"> (se muestran las primeras {{ vista.muestra.length }})</template>
      </p>
      <div class="max-h-[60vh] overflow-auto rounded-xl border border-slate-200">
        <table class="min-w-full font-mono text-xs">
          <thead class="sticky top-0 bg-slate-50 text-slate-500">
            <tr><th v-for="(_, i) in columnasMuestra[0]" :key="i" class="px-2 py-1.5 text-left font-semibold">{{ i + 1 }}</th></tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="(fila, i) in columnasMuestra" :key="i">
              <td v-for="(c, j) in fila" :key="j" class="px-2 py-1 whitespace-nowrap">{{ c }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="mt-2 text-xs text-slate-500">Cada columna es un campo del formato de SUNAT (separados por "|").</p>
    </template>
    <template #pie><button class="btn-primario" @click="vista = null">Cerrar</button></template>
  </BaseModal>
</template>
