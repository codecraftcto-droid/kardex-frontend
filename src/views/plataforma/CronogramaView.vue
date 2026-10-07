<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { apiPlataforma } from '@/services/apiPlataforma';
import { mensajeError } from '@/services/api';
import { usePlataforma } from '@/stores/plataforma';
import { useToast } from '@/stores/toast';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import BaseModal from '@/components/BaseModal.vue';
import Icono from '@/components/Icono.vue';

/**
 * Cronograma de vencimientos mensuales de SUNAT (lo publica cada fin de año por resolución).
 * Se edita como en la tabla oficial: por grupos de último dígito del RUC y buenos contribuyentes.
 * Es global: lo usan todos los estudios para calcular los vencimientos del SIRE.
 */
const plataforma = usePlataforma();
const toast = useToast();

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'];
/** Columnas de la tabla oficial → dígitos que cubre cada una */
const COLUMNAS = [
  { titulo: '0', grupos: ['0'] }, { titulo: '1', grupos: ['1'] }, { titulo: '2 y 3', grupos: ['2', '3'] }, { titulo: '4 y 5', grupos: ['4', '5'] },
  { titulo: '6 y 7', grupos: ['6', '7'] }, { titulo: '8 y 9', grupos: ['8', '9'] }, { titulo: 'Buenos contrib. y UESP', grupos: ['BC'] },
];

const ANIOS = [-1, 0, 1].map((d) => new Date().getFullYear() + d);
const anio = ref(ANIOS[1]);
const filas = ref([]);
const estado = reactive({ cargando: false, guardando: false, cambios: false });
const periodo = (mes) => `${anio.value}${String(mes + 1).padStart(2, '0')}`;

async function cargar() {
  estado.cargando = true;
  try {
    const { data } = await apiPlataforma.get('/cronograma', { params: { anio: anio.value } });
    const porPeriodo = new Map(data.periodos.map((p) => [p.periodo, p.fechas]));
    filas.value = MESES.map((_, mes) => {
      const f = porPeriodo.get(periodo(mes)) ?? {};
      return COLUMNAS.map((c) => f[c.grupos[0]] ?? '');
    });
    estado.cambios = false;
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    estado.cargando = false;
  }
}
watch(anio, cargar, { immediate: true });

// Una fila se envía si está completa; a medio llenar es un error
const filaIncompleta = (f) => f.some(Boolean) && !f.every(Boolean);
const errores = computed(() => filas.value.map((f, mes) => (filaIncompleta(f) ? `${MESES[mes]}: complete las ${COLUMNAS.length} fechas o déjela vacía` : null)).filter(Boolean));
const completas = computed(() => filas.value.filter((f) => f.every(Boolean)).length);

async function guardar() {
  estado.guardando = true;
  try {
    const periodos = filas.value
      .map((f, mes) => ({ f, mes }))
      .filter(({ f }) => f.every(Boolean))
      .map(({ f, mes }) => ({ periodo: periodo(mes), fechas: Object.fromEntries(COLUMNAS.flatMap((c, i) => c.grupos.map((g) => [g, f[i]]))) }));
    await apiPlataforma.put('/cronograma', { anio: anio.value, periodos });
    toast.exito(`Cronograma ${anio.value} guardado: ${periodos.length} período(s)`);
    estado.cambios = false;
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    estado.guardando = false;
  }
}

// Pegar desde Excel: 12 líneas (enero…diciembre) con 7 fechas cada una (dd/mm/aaaa o aaaa-mm-dd)
const pegado = reactive({ abierto: false, texto: '', error: '' });
const aIso = (t) => {
  const s = t.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
};
function aplicarPegado() {
  const lineas = pegado.texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const nuevas = [];
  for (const [i, l] of lineas.slice(0, 12).entries()) {
    // Se ignora una primera celda que no sea fecha (p. ej. el nombre del mes)
    const celdas = l.split(/\t|;|\s{2,}/).map(aIso);
    const fechas = celdas[0] === null ? celdas.slice(1) : celdas;
    if (fechas.length !== COLUMNAS.length || fechas.some((f) => !f)) {
      pegado.error = `Línea ${i + 1}: se esperaban ${COLUMNAS.length} fechas válidas`;
      return;
    }
    nuevas.push(fechas);
  }
  filas.value = MESES.map((_, mes) => nuevas[mes] ?? filas.value[mes]);
  Object.assign(pegado, { abierto: false, texto: '', error: '' });
  estado.cambios = true;
}
</script>

<template>
  <EncabezadoPagina titulo="Cronograma SUNAT" subtitulo="Vencimientos mensuales por último dígito del RUC: con ellos se calculan los plazos del SIRE de todos los estudios">
    <button v-if="plataforma.esAdmin" class="btn-secundario" @click="pegado.abierto = true"><Icono nombre="clonar" clase="size-4" /> Pegar desde Excel</button>
    <button v-if="plataforma.esAdmin" class="btn bg-slate-900 text-white hover:bg-slate-800" :disabled="estado.guardando || errores.length > 0" @click="guardar">
      {{ estado.guardando ? 'Guardando…' : 'Guardar cronograma' }}
    </button>
  </EncabezadoPagina>

  <div class="mb-4 flex flex-wrap items-center gap-3">
    <label class="flex items-center gap-2 text-sm">
      Año
      <select v-model.number="anio" class="input w-28">
        <option v-for="a in ANIOS" :key="a" :value="a">{{ a }}</option>
      </select>
    </label>
    <span class="text-sm text-slate-500">{{ completas }} de 12 períodos cargados</span>
    <span v-if="estado.cambios" class="insignia bg-amber-50 text-amber-800">Cambios sin guardar</span>
  </div>
  <p class="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
    Copie las fechas de la resolución de SUNAT del cronograma de obligaciones mensuales del {{ anio }}. Cada fila es el período tributario; la fecha es el día en que vence.
  </p>
  <ul v-if="errores.length" class="mb-4 space-y-1 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
    <li v-for="e in errores" :key="e">{{ e }}</li>
  </ul>

  <div class="tarjeta overflow-x-auto">
    <p v-if="estado.cargando" class="p-6 text-center text-sm text-slate-500">Cargando…</p>
    <table v-else class="min-w-full text-sm">
      <thead class="bg-slate-50 text-xs text-slate-500">
        <tr>
          <th class="sticky left-0 bg-slate-50 px-3 py-2 text-left font-semibold uppercase">Período</th>
          <th v-for="c in COLUMNAS" :key="c.titulo" class="px-2 py-2 text-left font-semibold whitespace-nowrap">{{ c.grupos[0] === 'BC' ? c.titulo : `RUC termina en ${c.titulo}` }}</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        <tr v-for="(f, mes) in filas" :key="mes" :class="{ 'bg-red-50/50': filaIncompleta(f) }">
          <th class="sticky left-0 bg-white px-3 py-1.5 text-left font-medium whitespace-nowrap">{{ MESES[mes] }} <span class="font-mono text-xs text-slate-400">{{ periodo(mes) }}</span></th>
          <td v-for="(c, i) in COLUMNAS" :key="c.titulo" class="px-2 py-1.5">
            <input
              v-model="f[i]"
              type="date"
              class="input min-w-36 py-1 text-sm"
              :disabled="!plataforma.esAdmin"
              :aria-label="`${MESES[mes]} ${anio}, ${c.titulo}`"
              @input="estado.cambios = true"
            />
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <BaseModal :abierto="pegado.abierto" titulo="Pegar cronograma desde Excel" @cerrar="pegado.abierto = false">
    <div class="space-y-3">
      <p class="text-sm text-slate-600">
        Copie de Excel las 12 filas (enero a diciembre) con las 7 columnas de fechas en este orden: <strong>0, 1, 2-3, 4-5, 6-7, 8-9, buenos contribuyentes</strong>.
        Se aceptan fechas dd/mm/aaaa; la primera columna puede ser el nombre del mes.
      </p>
      <textarea v-model="pegado.texto" rows="10" class="input font-mono text-xs" placeholder="Enero	13/02/2026	16/02/2026	…" aria-label="Fechas pegadas" />
      <p v-if="pegado.error" class="text-sm text-red-600">{{ pegado.error }}</p>
    </div>
    <template #pie>
      <button class="btn-secundario" @click="pegado.abierto = false">Cancelar</button>
      <button class="btn bg-slate-900 text-white hover:bg-slate-800" :disabled="!pegado.texto.trim()" @click="aplicarPegado">Aplicar</button>
    </template>
  </BaseModal>
</template>
