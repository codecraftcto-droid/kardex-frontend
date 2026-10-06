<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import Icono from './Icono.vue';

/**
 * Casillas para mostrar u ocultar columnas (usar con useColumnasVisibles).
 * `compacto`: solo ícono (para el encabezado de la tabla). El panel flota sobre la página
 * (Teleport), así no lo recorta el scroll horizontal de la tabla.
 */
const props = defineProps({
  columnas: { type: Array, required: true },
  ocultas: { type: Array, required: true },
  compacto: Boolean,
});
const emit = defineEmits(['alternar', 'restablecer']);
const abierto = ref(false);
const boton = ref(null);
const panel = ref(null);
const pos = ref({ top: 0, left: 0 });
const ANCHO = 240;
const cantidadOcultas = computed(() => props.columnas.slice(1).filter((c) => props.ocultas.includes(c.clave)).length);

async function abrir() {
  const r = boton.value.getBoundingClientRect();
  const alto = props.columnas.length * 40 + 100;
  const arriba = r.bottom + alto + 8 > innerHeight && r.top > alto;
  pos.value = { top: arriba ? r.top - alto - 6 : r.bottom + 6, left: Math.max(8, Math.min(r.right - ANCHO, innerWidth - ANCHO - 8)) };
  abierto.value = true;
  addEventListener('scroll', cerrarPorScroll, true);
  addEventListener('resize', cerrar);
  await nextTick();
  panel.value?.querySelector('input:not(:disabled)')?.focus();
}
function cerrar() {
  abierto.value = false;
  removeEventListener('scroll', cerrarPorScroll, true);
  removeEventListener('resize', cerrar);
}
// El scroll dentro del propio panel no lo cierra
const cerrarPorScroll = (e) => !panel.value?.contains(e.target) && cerrar();
onBeforeUnmount(cerrar);
function teclas(e) {
  if (e.key === 'Escape') {
    cerrar();
    boton.value?.focus();
  }
}
</script>

<template>
  <button
    ref="boton"
    type="button"
    :class="compacto
      ? 'relative inline-flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-200/60 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-marca-600'
      : 'btn w-full border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 sm:w-auto'"
    :aria-expanded="abierto"
    aria-haspopup="dialog"
    aria-label="Elegir columnas visibles"
    title="Elegir columnas visibles"
    @click.stop="abierto ? cerrar() : abrir()"
  >
    <Icono nombre="columnas" clase="size-4" />
    <template v-if="!compacto">
      Columnas
      <span v-if="cantidadOcultas" class="rounded-full bg-marca-50 px-1.5 text-xs font-semibold text-marca-700">{{ columnas.length - cantidadOcultas }}/{{ columnas.length }}</span>
    </template>
    <span v-else-if="cantidadOcultas" class="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-marca-700 text-[10px] font-semibold text-white normal-case">{{ cantidadOcultas }}</span>
  </button>
  <Teleport to="body">
    <div v-if="abierto" class="fixed inset-0 z-40" @click="cerrar" />
    <div
      v-if="abierto"
      ref="panel"
      role="dialog"
      aria-label="Columnas visibles"
      class="fixed z-50 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 text-left normal-case shadow-xl shadow-slate-900/10"
      :style="{ top: `${pos.top}px`, left: `${pos.left}px`, width: `${ANCHO}px` }"
      @keydown="teclas"
    >
      <p class="px-2 pt-1 pb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">Mostrar columnas</p>
      <label
        v-for="(c, i) in columnas"
        :key="c.clave"
        class="flex min-h-10 items-center gap-3 rounded-lg px-2 text-sm font-normal tracking-normal"
        :class="i === 0 ? 'cursor-not-allowed text-slate-400' : 'cursor-pointer text-slate-700 hover:bg-slate-50'"
      >
        <input
          type="checkbox"
          class="size-4 accent-marca-700"
          :checked="i === 0 || !ocultas.includes(c.clave)"
          :disabled="i === 0"
          @change="emit('alternar', c.clave)"
        />
        {{ c.titulo }}
        <span v-if="i === 0" class="ml-auto text-xs">siempre</span>
      </label>
      <div class="mt-1 border-t border-slate-100 pt-1">
        <button type="button" class="btn-texto w-full justify-start text-sm" :disabled="!cantidadOcultas" @click="emit('restablecer')">Mostrar todas</button>
      </div>
    </div>
  </Teleport>
</template>
