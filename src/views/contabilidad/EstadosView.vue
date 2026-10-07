<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, descargar, mensajeError } from '@/services/api';
import { useContexto } from '@/stores/contexto';
import { useToast } from '@/stores/toast';
import { num } from '@/utils/formato';
import { confirmar } from '@/utils/dialogos';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import Icono from '@/components/Icono.vue';

/**
 * Estados financieros del período: situación financiera, resultados (por función y por naturaleza,
 * del mes y acumulado) y hoja de trabajo. Desde diciembre se genera el asiento de cierre del ejercicio.
 */
const route = useRoute();
const router = useRouter();
const contexto = useContexto();
const toast = useToast();

const mesActual = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date()).slice(0, 7);
const mes = ref(typeof route.query.periodo === 'string' && /^\d{6}$/.test(route.query.periodo) ? `${route.query.periodo.slice(0, 4)}-${route.query.periodo.slice(4)}` : mesActual);
const periodo = computed(() => mes.value.replace('-', ''));
const vista = computed(() => (['situacion', 'resultados', 'hoja'].includes(route.query.vista) ? route.query.vista : 'situacion'));
const irA = (v) => router.replace({ query: { ...route.query, vista: v } });
const formato = ref('funcion');
const nivel = ref('2');

const d = ref(null);
const cargando = ref(false);
async function cargar() {
  if (!contexto.empresaActivaId || !mes.value) return;
  cargando.value = true;
  try {
    d.value = (await api.get('/contabilidad/estados', { params: { empresaId: contexto.empresaActivaId, periodo: periodo.value, nivel: nivel.value === '2' ? undefined : 'detalle' } })).data;
    router.replace({ query: { ...route.query, periodo: periodo.value } });
  } catch (e) {
    d.value = null;
    toast.error(mensajeError(e));
  } finally {
    cargando.value = false;
  }
}
watch([() => contexto.empresaActivaId, periodo, nivel], cargar, { immediate: true });

// Importes: los negativos entre paréntesis, como en los estados financieros
const imp = (v) => {
  const x = Number(v) || 0;
  if (x === 0) return '—';
  return x < 0 ? `(${num(-x, 2)})` : num(x, 2);
};
const celda = (v) => (Number(v) ? num(v, 2) : '');

const exportando = ref(false);
async function exportar() {
  exportando.value = true;
  try {
    await descargar('/contabilidad/estados/excel', { empresaId: contexto.empresaActivaId, periodo: periodo.value }, `estados-financieros-${periodo.value}.xlsx`);
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    exportando.value = false;
  }
}
async function cierreEjercicio() {
  const regenerar = Boolean(d.value.cierre);
  if (!(await confirmar({
    titulo: `${regenerar ? 'Regenerar' : 'Generar'} el asiento de cierre del ejercicio ${d.value.anio}`,
    texto: 'Se saldan las cuentas de gastos e ingresos contra la 891 (utilidad) o la 892 (pérdida) al 31 de diciembre. Los estados de resultados no lo toman en cuenta.',
    confirmar: regenerar ? 'Regenerar' : 'Generar asiento',
  }))) return;
  try {
    const { data } = await api.post('/contabilidad/cierre-ejercicio', { empresaId: contexto.empresaActivaId, anio: d.value.anio });
    toast.exito(`Asiento de cierre ${String(data.numero).padStart(4, '0')}: ${data.resultado >= 0 ? 'utilidad' : 'pérdida'} de S/ ${num(Math.abs(data.resultado), 2)}`);
    cargar();
  } catch (e) {
    toast.error(mensajeError(e));
  }
}

const COLUMNAS_HOJA = [
  ['Sumas del mayor', ['debe', 'haber'], ['Debe', 'Haber']],
  ['Saldos', ['deudor', 'acreedor'], ['Deudor', 'Acreedor']],
  ['Inventario', ['activo', 'pasivo'], ['Activo', 'Pasivo y patr.']],
  ['Resultados por naturaleza', ['perdidaNaturaleza', 'gananciaNaturaleza'], ['Pérdidas', 'Ganancias']],
  ['Resultados por función', ['perdidaFuncion', 'gananciaFuncion'], ['Pérdidas', 'Ganancias']],
];
// Fila "Resultado del ejercicio": va del lado que cuadra cada par de columnas
const resultadoHoja = computed(() => {
  const r = d.value?.hoja.resultado;
  if (!r) return {};
  return {
    activo: r.inventario < 0 ? -r.inventario : 0, pasivo: r.inventario > 0 ? r.inventario : 0,
    perdidaNaturaleza: r.naturaleza > 0 ? r.naturaleza : 0, gananciaNaturaleza: r.naturaleza < 0 ? -r.naturaleza : 0,
    perdidaFuncion: r.funcion > 0 ? r.funcion : 0, gananciaFuncion: r.funcion < 0 ? -r.funcion : 0,
  };
});
</script>

<template>
  <EncabezadoPagina titulo="Estados financieros" :subtitulo="contexto.empresaActiva?.razonSocial">
    <input v-model="mes" type="month" class="input w-44" :max="mesActual" aria-label="Período" />
    <button v-if="d?.acciones.cerrarEjercicio" class="btn-secundario" @click="cierreEjercicio"><Icono nombre="candado" clase="size-4" /> {{ d.cierre ? 'Regenerar cierre' : 'Cierre del ejercicio' }} {{ d.anio }}</button>
    <button class="btn-secundario" :disabled="exportando || !d" @click="exportar"><Icono nombre="descargar" clase="size-4" /> {{ exportando ? 'Exportando…' : 'Exportar Excel' }}</button>
  </EncabezadoPagina>

  <p v-if="cargando && !d" class="text-sm text-slate-500">Cargando…</p>
  <template v-if="d">
    <!-- Avisos -->
    <div class="mb-4 space-y-2">
      <p v-for="a in [...d.situacion.avisos, ...d.resultados.avisos]" :key="a" class="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"><Icono nombre="alerta" clase="mt-0.5 size-4 shrink-0" /> {{ a }}</p>
      <p v-if="d.situacion.resultadosAnterioresSinCerrar" class="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
        <Icono nombre="alerta" clase="mt-0.5 size-4 shrink-0" />
        Hay S/ {{ imp(d.situacion.resultadosAnterioresSinCerrar) }} de resultados de años anteriores sin asiento de cierre: se muestran dentro de "Resultados acumulados".
        Genere el cierre desde diciembre de cada año.
      </p>
      <p v-if="d.cierre" class="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"><Icono nombre="check" clase="size-4" /> {{ d.cierre.glosa }}</p>
    </div>

    <div class="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
      <button
        v-for="[k, t] in [['situacion', 'Situación financiera'], ['resultados', 'Estado de resultados'], ['hoja', 'Hoja de trabajo']]"
        :key="k"
        role="tab"
        :aria-selected="vista === k"
        class="-mb-px min-h-11 border-b-2 px-3 text-sm font-medium whitespace-nowrap"
        :class="vista === k ? 'border-marca-700 text-marca-700' : 'border-transparent text-slate-500 hover:text-slate-700'"
        @click="irA(k)"
      >
        {{ t }}
      </button>
    </div>

    <!-- Estado de situación financiera -->
    <template v-if="vista === 'situacion'">
      <p class="mb-3 flex items-center gap-2 text-sm" :class="d.situacion.cuadra ? 'text-emerald-700' : 'text-red-700'">
        <Icono :nombre="d.situacion.cuadra ? 'check' : 'alerta'" clase="size-4" />
        {{ d.situacion.cuadra ? 'Activo = Pasivo + Patrimonio' : 'No cuadra: revise los asientos del período' }} · al cierre de {{ d.etiqueta }}
      </p>
      <div class="grid gap-4 lg:grid-cols-2">
        <section class="tarjeta p-4 sm:p-5">
          <h2 class="mb-3 font-semibold">Activo</h2>
          <template v-for="[titulo, lista, total] in [['Activo corriente', d.situacion.activoCorriente, d.situacion.totales.activoCorriente], ['Activo no corriente', d.situacion.activoNoCorriente, d.situacion.totales.activoNoCorriente]]" :key="titulo">
            <p class="mt-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">{{ titulo }}</p>
            <dl class="divide-y divide-slate-100 text-sm">
              <div v-for="p in lista" :key="p.texto" class="flex justify-between gap-3 py-1.5"><dt>{{ p.texto }}</dt><dd class="tabular-nums">{{ imp(p.importe) }}</dd></div>
              <div class="flex justify-between gap-3 py-1.5 font-medium"><dt>Total {{ titulo.toLowerCase() }}</dt><dd class="tabular-nums">{{ imp(total) }}</dd></div>
            </dl>
          </template>
          <p class="mt-3 flex justify-between border-t-2 border-slate-300 pt-2 font-semibold"><span>TOTAL ACTIVO</span><span class="tabular-nums">S/ {{ imp(d.situacion.totales.activo) }}</span></p>
        </section>
        <section class="tarjeta p-4 sm:p-5">
          <h2 class="mb-3 font-semibold">Pasivo y patrimonio</h2>
          <template
            v-for="[titulo, lista, total] in [['Pasivo corriente', d.situacion.pasivoCorriente, d.situacion.totales.pasivoCorriente], ['Pasivo no corriente', d.situacion.pasivoNoCorriente, d.situacion.totales.pasivoNoCorriente], ['Patrimonio', d.situacion.patrimonio, d.situacion.totales.patrimonio]]"
            :key="titulo"
          >
            <template v-if="lista.length || titulo === 'Patrimonio'">
              <p class="mt-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">{{ titulo }}</p>
              <dl class="divide-y divide-slate-100 text-sm">
                <div v-for="p in lista" :key="p.texto" class="flex justify-between gap-3 py-1.5" :class="p.texto === 'Resultado del ejercicio' ? 'font-medium text-marca-800' : ''"><dt>{{ p.texto }}</dt><dd class="tabular-nums">{{ imp(p.importe) }}</dd></div>
                <div class="flex justify-between gap-3 py-1.5 font-medium"><dt>Total {{ titulo.toLowerCase() }}</dt><dd class="tabular-nums">{{ imp(total) }}</dd></div>
              </dl>
            </template>
          </template>
          <p class="mt-3 flex justify-between border-t-2 border-slate-300 pt-2 font-semibold"><span>TOTAL PASIVO Y PATRIMONIO</span><span class="tabular-nums">S/ {{ imp(d.situacion.totales.pasivoPatrimonio) }}</span></p>
        </section>
      </div>
    </template>

    <!-- Estado de resultados -->
    <template v-else-if="vista === 'resultados'">
      <div class="mb-3 inline-flex rounded-lg bg-slate-100 p-1" role="radiogroup" aria-label="Formato">
        <button
          v-for="[k, t] in [['funcion', 'Por función'], ['naturaleza', 'Por naturaleza']]"
          :key="k"
          type="button"
          role="radio"
          :aria-checked="formato === k"
          class="min-h-9 rounded-md px-3 text-sm font-medium"
          :class="formato === k ? 'bg-white shadow-sm' : 'text-slate-600'"
          @click="formato = k"
        >
          {{ t }}
        </button>
      </div>
      <section class="tarjeta overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr><th class="px-4 py-2 text-left font-semibold">Concepto</th><th class="px-4 py-2 text-right font-semibold">{{ d.etiqueta }}</th><th class="px-4 py-2 text-right font-semibold">Acumulado {{ d.anio }}</th></tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="(l, i) in d.resultados.acumulado[formato]" :key="l.texto" :class="l.total ? 'border-t-2 border-slate-300 bg-slate-50 font-semibold' : l.subtotal ? 'font-semibold' : ''">
              <td class="px-4 py-2" :class="l.subtotal || l.total ? '' : 'pl-8'">
                {{ l.texto }}
                <span v-if="l.cuentas" class="ml-1 font-mono text-xs text-slate-400">{{ l.cuentas.join(', ') }}</span>
              </td>
              <td class="px-4 py-2 text-right tabular-nums">{{ imp(d.resultados.mes[formato][i].importe) }}</td>
              <td class="px-4 py-2 text-right tabular-nums" :class="l.total && l.importe < 0 ? 'text-red-700' : ''">{{ imp(l.importe) }}</td>
            </tr>
          </tbody>
        </table>
      </section>
      <p class="mt-2 text-xs text-slate-500">
        En soles. Los gastos y costos van entre paréntesis.
        <template v-if="formato === 'naturaleza'">El consumo de mercaderías suma compras (60), variación de inventarios (61) y costo de ventas (69).</template>
        <template v-else>Los gastos por función salen de las cuentas de destino del elemento 9.</template>
      </p>
    </template>

    <!-- Hoja de trabajo -->
    <template v-else>
      <div class="mb-3 flex flex-wrap items-center gap-3">
        <select v-model="nivel" class="input w-56" aria-label="Nivel de detalle">
          <option value="2">Cuentas de 2 dígitos</option>
          <option value="detalle">Cuentas de detalle</option>
        </select>
        <span class="text-sm" :class="d.hoja.totales.debe === d.hoja.totales.haber ? 'text-emerald-700' : 'text-red-700'">
          {{ d.hoja.totales.debe === d.hoja.totales.haber ? 'Sumas iguales' : 'Las sumas no cuadran' }}
        </span>
      </div>
      <section class="tarjeta overflow-x-auto">
        <table class="min-w-full text-xs">
          <thead class="bg-slate-50 text-slate-500">
            <tr>
              <th rowspan="2" class="sticky left-0 bg-slate-50 px-2 py-2 text-left font-semibold uppercase">Cuenta</th>
              <th v-for="[g] in COLUMNAS_HOJA" :key="g" colspan="2" class="border-l border-slate-200 px-2 py-1.5 text-center font-semibold whitespace-nowrap">{{ g }}</th>
            </tr>
            <tr>
              <template v-for="[g, , titulos] in COLUMNAS_HOJA" :key="g">
                <th v-for="t in titulos" :key="t" class="border-l border-slate-200 px-2 py-1 text-right font-medium whitespace-nowrap">{{ t }}</th>
              </template>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="f in d.hoja.filas" :key="f.cuenta">
              <td class="sticky left-0 bg-white px-2 py-1 whitespace-nowrap"><span class="font-mono font-medium">{{ f.cuenta }}</span> <span class="text-slate-600">{{ f.nombre }}</span></td>
              <template v-for="[g, claves] in COLUMNAS_HOJA" :key="g">
                <td v-for="k in claves" :key="k" class="border-l border-slate-100 px-2 py-1 text-right tabular-nums">{{ celda(f[k]) }}</td>
              </template>
            </tr>
          </tbody>
          <tfoot class="font-semibold">
            <tr class="border-t-2 border-slate-300">
              <td class="sticky left-0 bg-white px-2 py-1.5">Totales</td>
              <template v-for="[g, claves] in COLUMNAS_HOJA" :key="g"><td v-for="k in claves" :key="k" class="border-l border-slate-100 px-2 py-1.5 text-right tabular-nums">{{ celda(d.hoja.totales[k]) }}</td></template>
            </tr>
            <tr class="text-marca-800">
              <td class="sticky left-0 bg-white px-2 py-1.5">Resultado del ejercicio</td>
              <td colspan="4" class="border-l border-slate-100" />
              <template v-for="[g, claves] in COLUMNAS_HOJA.slice(2)" :key="g"><td v-for="k in claves" :key="k" class="border-l border-slate-100 px-2 py-1.5 text-right tabular-nums">{{ celda(resultadoHoja[k]) }}</td></template>
            </tr>
          </tfoot>
        </table>
      </section>
      <p class="mt-2 text-xs text-slate-500">
        Inventario: cuentas 1 a 5. Naturaleza: 60–69, 70–78 y 88. Función: 69, 70–78, 88 y elemento 9. La 79 se cancela con el elemento 9 y no entra en resultados.
      </p>
    </template>
  </template>
</template>
