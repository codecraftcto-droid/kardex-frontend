<script setup>
/**
 * Marco de las pantallas de acceso: panel de marca a la izquierda (solo en pantallas
 * grandes) y el formulario a la derecha. En móvil queda solo el formulario.
 */
import { computed } from 'vue';

const props = defineProps({
  titulo: String,
  subtitulo: String,
  /** 'estudio' (usuarios de los estudios) o 'plataforma' (administración del servicio) */
  variante: { type: String, default: 'estudio' },
});
const anio = new Date().getFullYear();
const esPlataforma = computed(() => props.variante === 'plataforma');

const CONTENIDO = {
  estudio: {
    marca: 'Inventario para estudios contables',
    titular: 'El inventario de todas sus empresas cliente,',
    resalte: 'en un solo lugar.',
    beneficios: [
      { titulo: 'Kardex valorizado', texto: 'PEPS o promedio ponderado, por almacén y en tiempo real.' },
      { titulo: 'Punto de venta', texto: 'Boletas, facturas, crédito y cobranzas en ticket o A4.' },
      { titulo: 'Seguridad por roles', texto: 'Cada usuario ve solo sus empresas, sedes y almacenes.' },
    ],
  },
  plataforma: {
    marca: 'Administración del servicio',
    titular: 'Todos los estudios, planes y suscripciones,',
    resalte: 'bajo control.',
    beneficios: [
      { titulo: 'Estudios y planes', texto: 'Altas, límites de uso, suspensiones y renovaciones.' },
      { titulo: 'Verificación en dos pasos', texto: 'Obligatoria para todo el equipo de la plataforma.' },
      { titulo: 'Auditoría completa', texto: 'Cada acción de soporte queda registrada y no se puede borrar.' },
    ],
  },
};
const c = computed(() => CONTENIDO[props.variante] ?? CONTENIDO.estudio);
</script>

<template>
  <div class="grid min-h-dvh bg-white lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
    <!-- ═════════ Panel de marca (escritorio) ═════════ -->
    <aside class="relative hidden overflow-hidden bg-marca-800 text-white lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16" aria-hidden="true">
      <!-- Fondo: degradado, cuadrícula y halos de luz -->
      <div class="absolute inset-0 bg-gradient-to-br" :class="esPlataforma ? 'from-slate-800 via-slate-900 to-black' : 'from-marca-700 via-marca-800 to-slate-950'" />
      <div class="fondo-cuadricula absolute inset-0 opacity-[0.07]" />
      <div class="absolute -top-32 -right-24 size-96 rounded-full blur-3xl" :class="esPlataforma ? 'bg-teal-400/10' : 'bg-teal-300/20'" />
      <div class="absolute -bottom-40 -left-20 size-[28rem] rounded-full bg-emerald-400/10 blur-3xl" />

      <div class="relative flex items-center gap-3">
        <img src="/favicon.svg" alt="" class="size-10 rounded-lg ring-1 ring-white/20" />
        <div>
          <p class="text-lg font-semibold tracking-tight">Kardex</p>
          <p class="text-xs text-teal-100/70">{{ c.marca }}</p>
        </div>
        <span v-if="esPlataforma" class="ml-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-0.5 text-xs font-medium text-amber-200">Acceso restringido</span>
      </div>

      <div class="relative max-w-lg">
        <h2 class="text-3xl leading-tight font-semibold tracking-tight xl:text-4xl">
          {{ c.titular }} <span class="text-teal-200">{{ c.resalte }}</span>
        </h2>

        <!-- Vista previa ilustrativa del producto (solo estudios) -->
        <div v-if="!esPlataforma" class="aparecer mt-10 rounded-2xl border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-black/20 backdrop-blur-sm">
          <div class="flex items-center justify-between">
            <p class="text-sm font-medium text-teal-50">Valorización del mes <span class="text-xs font-normal text-teal-100/50">· ejemplo</span></p>
            <span class="rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs font-medium text-emerald-200">+12.4 %</span>
          </div>
          <p class="mt-1 text-2xl font-semibold tabular-nums">S/ 248,930.50</p>
          <svg viewBox="0 0 300 70" class="mt-3 h-16 w-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="area-login" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stop-color="#5eead4" stop-opacity="0.45" />
                <stop offset="1" stop-color="#5eead4" stop-opacity="0" />
              </linearGradient>
            </defs>
            <path d="M0 55 L30 50 L60 52 L90 40 L120 44 L150 30 L180 34 L210 22 L240 26 L270 12 L300 8 L300 70 L0 70 Z" fill="url(#area-login)" />
            <path d="M0 55 L30 50 L60 52 L90 40 L120 44 L150 30 L180 34 L210 22 L240 26 L270 12 L300 8" fill="none" stroke="#5eead4" stroke-width="2" vector-effect="non-scaling-stroke" />
          </svg>
          <div class="mt-4 grid grid-cols-3 gap-2 text-xs">
            <div class="rounded-lg bg-white/[0.06] p-2.5"><p class="text-teal-100/60">Empresas</p><p class="mt-0.5 text-base font-semibold">18</p></div>
            <div class="rounded-lg bg-white/[0.06] p-2.5"><p class="text-teal-100/60">Almacenes</p><p class="mt-0.5 text-base font-semibold">42</p></div>
            <div class="rounded-lg bg-white/[0.06] p-2.5"><p class="text-teal-100/60">Stock bajo</p><p class="mt-0.5 text-base font-semibold text-amber-200">7</p></div>
          </div>
        </div>

        <ul class="mt-10 space-y-4">
          <li v-for="b in c.beneficios" :key="b.titulo" class="flex gap-3">
            <span class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-teal-300/15 ring-1 ring-teal-200/30">
              <svg viewBox="0 0 20 20" fill="currentColor" class="size-3.5 text-teal-200"><path fill-rule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.58l7.3-7.3a1 1 0 0 1 1.4 0Z" clip-rule="evenodd" /></svg>
            </span>
            <div>
              <p class="text-sm font-medium">{{ b.titulo }}</p>
              <p class="text-sm text-teal-100/70">{{ b.texto }}</p>
            </div>
          </li>
        </ul>
      </div>

      <p class="relative text-xs text-teal-100/50">© {{ anio }} Kardex · Datos aislados por estudio</p>
    </aside>

    <!-- ═════════ Formulario ═════════ -->
    <main class="relative flex flex-col justify-center px-5 py-10 sm:px-10">
      <!-- Toque de color en móvil -->
      <div class="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b to-transparent lg:hidden" :class="esPlataforma ? 'from-slate-100' : 'from-marca-50'" />
      <div class="aparecer relative mx-auto w-full max-w-sm">
        <div class="mb-8 flex items-center gap-3 lg:hidden">
          <img src="/favicon.svg" alt="" class="size-10" />
          <div>
            <p class="font-semibold text-slate-900">Kardex</p>
            <p class="text-xs text-slate-500">{{ c.marca }}</p>
          </div>
        </div>

        <h1 class="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{{ titulo }}</h1>
        <p v-if="subtitulo" class="mt-2 text-sm text-slate-500">{{ subtitulo }}</p>

        <div class="mt-8"><slot /></div>
        <div class="mt-6 text-center text-sm"><slot name="pie" /></div>
      </div>
      <p class="relative mt-10 text-center text-xs text-slate-400 lg:hidden">© {{ anio }} Kardex</p>
    </main>
  </div>
</template>

<style scoped>
.fondo-cuadricula {
  background-image:
    linear-gradient(to right, #fff 1px, transparent 1px),
    linear-gradient(to bottom, #fff 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: radial-gradient(ellipse at 30% 40%, #000 30%, transparent 75%);
}
.aparecer { animation: aparecer 0.5s ease-out both; }
@keyframes aparecer {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .aparecer { animation: none; }
}
</style>
