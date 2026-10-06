<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

/**
 * Columnas (una o dos series, agrupadas) en SVG, sin librerías.
 * Marcas finas (≤ 24 px) con punta redondeada, base recta, cuadrícula tenue, tooltip al pasar
 * el mouse o tocar, y una tabla equivalente para lectores de pantalla.
 */
const props = defineProps({
  /** [{ etiqueta, detalle?, valores: { [clave]: number } }] */
  datos: { type: Array, required: true },
  /** [{ clave, nombre, color }] — en orden fijo */
  series: { type: Array, required: true },
  formato: { type: Function, default: (v) => String(v) },
  /** Formato corto para el eje (p. ej. 1.2k) */
  formatoEje: { type: Function, default: null },
  alto: { type: Number, default: 220 },
  titulo: { type: String, default: 'Gráfico' },
});

const caja = ref(null);
const ancho = ref(0);
let observador;
onMounted(() => {
  ancho.value = Math.max(260, caja.value.clientWidth);
  observador = new ResizeObserver(([e]) => (ancho.value = Math.max(260, e.contentRect.width)));
  observador.observe(caja.value);
});
onBeforeUnmount(() => observador?.disconnect());

const M = { arriba: 12, derecha: 8, abajo: 26, izquierda: 48 };
const maximo = computed(() => Math.max(0, ...props.datos.flatMap((d) => props.series.map((s) => Number(d.valores[s.clave]) || 0))));
/** Escala "redonda": 4 divisiones con un paso de 1, 2, 2.5 o 5 × 10^n */
const escala = computed(() => {
  const crudo = maximo.value / 4 || 1;
  const pot = 10 ** Math.floor(Math.log10(crudo));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= crudo);
  return { paso, tope: paso * 4 };
});
const marcas = computed(() => Array.from({ length: 5 }, (_, i) => escala.value.paso * i));
const areaAncho = computed(() => ancho.value - M.izquierda - M.derecha);
const areaAlto = computed(() => props.alto - M.arriba - M.abajo);
const banda = computed(() => areaAncho.value / Math.max(1, props.datos.length));
const grosor = computed(() => Math.min(24, Math.max(4, (banda.value * 0.62 - (props.series.length - 1) * 2) / props.series.length)));
const y = (v) => M.arriba + areaAlto.value - (v / escala.value.tope) * areaAlto.value;
const xCentro = (i) => M.izquierda + banda.value * i + banda.value / 2;

/** Columna con punta redondeada (4 px) y base recta */
function columna(x, valor) {
  const alto = Math.max(0, y(0) - y(valor));
  if (alto <= 0) return '';
  const r = Math.min(4, alto, grosor.value / 2);
  const w = grosor.value;
  const base = y(0);
  const tope = base - alto;
  return `M${x},${base} V${tope + r} Q${x},${tope} ${x + r},${tope} H${x + w - r} Q${x + w},${tope} ${x + w},${tope + r} V${base} Z`;
}
const xSerie = (i, k) => xCentro(i) - (props.series.length * grosor.value + (props.series.length - 1) * 2) / 2 + k * (grosor.value + 2);

// Etiquetas del eje X: no más de ~8 para que no choquen
const cadaCuanto = computed(() => Math.ceil(props.datos.length / Math.max(2, Math.floor(areaAncho.value / 56))));

const activo = ref(null);
const tooltip = computed(() => {
  if (activo.value == null) return null;
  const d = props.datos[activo.value];
  const x = xCentro(activo.value);
  return { d, izquierda: Math.min(Math.max(x, 90), ancho.value - 90) };
});
const fmtEje = (v) => (props.formatoEje ?? props.formato)(v);
</script>

<template>
  <div ref="caja" class="relative w-full min-w-0 overflow-hidden select-none" @mouseleave="activo = null">
    <svg v-if="ancho" :width="ancho" :height="alto" :viewBox="`0 0 ${ancho} ${alto}`" role="img" :aria-label="titulo" class="block overflow-visible">
      <!-- Cuadrícula y eje Y -->
      <g>
        <template v-for="m in marcas" :key="m">
          <line :x1="M.izquierda" :x2="ancho - M.derecha" :y1="y(m)" :y2="y(m)" class="stroke-slate-100" stroke-width="1" />
          <text :x="M.izquierda - 8" :y="y(m)" text-anchor="end" dominant-baseline="middle" class="fill-slate-400 text-[11px] tabular-nums">{{ fmtEje(m) }}</text>
        </template>
        <line :x1="M.izquierda" :x2="ancho - M.derecha" :y1="y(0)" :y2="y(0)" class="stroke-slate-200" stroke-width="1" />
      </g>
      <!-- Columna resaltada al pasar -->
      <rect
        v-if="activo != null"
        :x="M.izquierda + banda * activo + 2"
        :y="M.arriba"
        :width="Math.max(0, banda - 4)"
        :height="areaAlto"
        rx="6"
        class="fill-slate-100/70"
      />
      <!-- Barras -->
      <g v-for="(d, i) in datos" :key="i">
        <path v-for="(s, k) in series" :key="s.clave" :d="columna(xSerie(i, k), Number(d.valores[s.clave]) || 0)" :fill="s.color" />
        <text
          v-if="i % cadaCuanto === (datos.length - 1) % cadaCuanto"
          :x="xCentro(i)"
          :y="alto - 6"
          text-anchor="middle"
          class="text-[11px]"
          :class="i === datos.length - 1 ? 'fill-slate-700 font-medium' : 'fill-slate-400'"
        >{{ d.etiqueta }}</text>
        <!-- Zona sensible: toda la banda, más grande que la barra -->
        <rect :x="M.izquierda + banda * i" :y="M.arriba" :width="banda" :height="areaAlto + M.abajo" fill="transparent" @mouseenter="activo = i" @click="activo = i" />
      </g>
    </svg>

    <div
      v-if="tooltip"
      class="pointer-events-none absolute top-0 z-10 min-w-40 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
      :style="{ left: `${tooltip.izquierda}px` }"
    >
      <p class="mb-1 font-medium text-slate-700">{{ tooltip.d.detalle ?? tooltip.d.etiqueta }}</p>
      <p v-for="s in series" :key="s.clave" class="flex items-center justify-between gap-4">
        <span class="flex items-center gap-1.5 text-slate-500"><span class="size-2 rounded-sm" :style="{ background: s.color }" />{{ s.nombre }}</span>
        <span class="font-medium text-slate-800 tabular-nums">{{ formato(Number(tooltip.d.valores[s.clave]) || 0) }}</span>
      </p>
    </div>

    <!-- Equivalente accesible -->
    <table class="sr-only">
      <caption>{{ titulo }}</caption>
      <thead><tr><th scope="col">Día</th><th v-for="s in series" :key="s.clave" scope="col">{{ s.nombre }}</th></tr></thead>
      <tbody>
        <tr v-for="(d, i) in datos" :key="i"><th scope="row">{{ d.detalle ?? d.etiqueta }}</th><td v-for="s in series" :key="s.clave">{{ formato(Number(d.valores[s.clave]) || 0) }}</td></tr>
      </tbody>
    </table>
  </div>
</template>
