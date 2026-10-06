<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';
import Icono from './Icono.vue';

/**
 * Menú desplegable de acciones de una fila ("⋯"). Se dibuja flotando sobre la página
 * (Teleport), así no lo recorta el scroll de la tabla. Teclado: Enter/Espacio abre,
 * flechas recorren, Esc cierra.
 * acciones: [{ texto, icono?, to?, nuevaPestana?, alHacer?, peligro?, separador? }] — las vacías o falsas se omiten.
 */
const props = defineProps({
  acciones: { type: Array, required: true },
  etiqueta: { type: String, default: 'Acciones' },
});
const router = useRouter();
const visibles = computed(() => props.acciones.filter(Boolean));
const abierto = ref(false);
const boton = ref(null);
const menu = ref(null);
const pos = ref({ top: 0, left: 0, arriba: false });
const ANCHO = 224;

async function abrir() {
  const r = boton.value.getBoundingClientRect();
  const alto = visibles.value.length * 40 + 12;
  const arriba = r.bottom + alto + 8 > innerHeight && r.top > alto + 8;
  pos.value = {
    top: arriba ? r.top - alto - 6 : r.bottom + 6,
    left: Math.max(8, Math.min(r.right - ANCHO, innerWidth - ANCHO - 8)),
    arriba,
  };
  abierto.value = true;
  addEventListener('scroll', cerrar, true);
  addEventListener('resize', cerrar);
  await nextTick();
  menu.value?.querySelector('[role=menuitem]')?.focus();
}
function cerrar() {
  abierto.value = false;
  removeEventListener('scroll', cerrar, true);
  removeEventListener('resize', cerrar);
}
onBeforeUnmount(cerrar);
const alternar = () => (abierto.value ? cerrar() : abrir());

function ejecutar(a) {
  cerrar();
  boton.value?.focus();
  if (a.to && a.nuevaPestana) window.open(router.resolve(a.to).href, '_blank');
  else if (a.to) router.push(a.to);
  else a.alHacer?.();
}
function teclas(e) {
  const items = [...menu.value.querySelectorAll('[role=menuitem]')];
  const i = items.indexOf(document.activeElement);
  if (e.key === 'ArrowDown') items[(i + 1) % items.length]?.focus();
  else if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length]?.focus();
  else if (e.key === 'Home') items[0]?.focus();
  else if (e.key === 'End') items.at(-1)?.focus();
  else if (e.key === 'Escape' || e.key === 'Tab') {
    cerrar();
    boton.value?.focus();
  } else return;
  e.preventDefault();
}
</script>

<template>
  <button
    v-if="visibles.length"
    ref="boton"
    type="button"
    class="inline-flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-marca-600"
    :class="{ 'bg-slate-100 text-slate-800': abierto }"
    aria-haspopup="menu"
    :aria-expanded="abierto"
    :aria-label="etiqueta"
    :title="etiqueta"
    @click.stop="alternar"
  >
    <Icono nombre="mas" clase="size-5" />
  </button>
  <Teleport to="body">
    <div v-if="abierto" class="fixed inset-0 z-40" @click="cerrar" @contextmenu.prevent="cerrar" />
    <Transition name="menu">
      <div
        v-if="abierto"
        ref="menu"
        role="menu"
        :aria-label="etiqueta"
        class="fixed z-50 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10"
        :class="pos.arriba ? 'origin-bottom-right' : 'origin-top-right'"
        :style="{ top: `${pos.top}px`, left: `${pos.left}px`, width: `${ANCHO}px` }"
        @keydown="teclas"
      >
        <template v-for="(a, i) in visibles" :key="i">
          <div v-if="a.separador" class="my-1 border-t border-slate-100" role="separator" />
          <button
            v-else
            type="button"
            role="menuitem"
            class="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm outline-none"
            :class="a.peligro ? 'text-red-600 hover:bg-red-50 focus:bg-red-50' : 'text-slate-700 hover:bg-slate-50 focus:bg-slate-100'"
            @click="ejecutar(a)"
          >
            <Icono v-if="a.icono" :nombre="a.icono" clase="size-4 shrink-0" :class="a.peligro ? '' : 'text-slate-400'" />
            <span class="truncate">{{ a.texto }}</span>
          </button>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.menu-enter-active { transition: opacity 0.12s ease, transform 0.12s ease; }
.menu-leave-active { transition: opacity 0.08s ease; }
.menu-enter-from { opacity: 0; transform: scale(0.96); }
.menu-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .menu-enter-active, .menu-leave-active { transition: none; }
}
</style>
