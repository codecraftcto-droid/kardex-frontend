<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import Icono from './Icono.vue';

/**
 * Buscador rápido (Ctrl/⌘ + K): salta a cualquier pantalla o acción del menú escribiendo.
 * Solo lista lo que el usuario puede ver (recibe las opciones ya filtradas por permisos).
 */
const props = defineProps({
  /** [{ to, etiqueta, icono, grupo? }] */
  opciones: { type: Array, required: true },
});
const abierto = defineModel({ type: Boolean, default: false });
const router = useRouter();
const q = ref('');
const indice = ref(0);
const campo = ref(null);

const normalizar = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const resultados = computed(() => {
  const t = normalizar(q.value.trim());
  const lista = t ? props.opciones.filter((o) => normalizar(`${o.etiqueta} ${o.grupo ?? ''}`).includes(t)) : props.opciones;
  return lista.slice(0, 12);
});
watch(q, () => (indice.value = 0));
watch(abierto, async (v) => {
  if (!v) return;
  q.value = '';
  indice.value = 0;
  await nextTick();
  campo.value?.focus();
});

function ir(o) {
  if (!o) return;
  abierto.value = false;
  router.push(o.to);
}
function teclas(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    indice.value = (indice.value + 1) % Math.max(1, resultados.value.length);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    indice.value = (indice.value - 1 + resultados.value.length) % Math.max(1, resultados.value.length);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    ir(resultados.value[indice.value]);
  } else if (e.key === 'Escape') {
    abierto.value = false;
  }
}
// Atajo global
const atajo = (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    abierto.value = !abierto.value;
  }
};
onMounted(() => addEventListener('keydown', atajo));
onBeforeUnmount(() => removeEventListener('keydown', atajo));
</script>

<template>
  <Teleport to="body">
    <Transition name="paleta">
      <div v-if="abierto" class="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Buscador rápido">
        <div class="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" @click="abierto = false" />
        <div class="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div class="flex items-center gap-3 border-b border-slate-100 px-4">
            <Icono nombre="buscar" clase="size-5 shrink-0 text-slate-400" />
            <input
              ref="campo"
              v-model="q"
              class="h-14 w-full bg-transparent text-base text-slate-800 outline-none placeholder:text-slate-400"
              placeholder="¿A dónde quiere ir? Ej.: caja, kardex, clientes…"
              role="combobox"
              aria-expanded="true"
              aria-controls="paleta-resultados"
              :aria-activedescendant="resultados[indice] ? `paleta-op-${indice}` : undefined"
              @keydown="teclas"
            />
            <kbd class="hidden rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-400 sm:block">Esc</kbd>
          </div>
          <ul id="paleta-resultados" role="listbox" class="max-h-[50vh] overflow-y-auto p-2">
            <li v-for="(o, i) in resultados" :id="`paleta-op-${i}`" :key="o.to" role="option" :aria-selected="i === indice">
              <button
                class="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm"
                :class="i === indice ? 'bg-marca-50 text-marca-800' : 'text-slate-700'"
                @mouseenter="indice = i"
                @click="ir(o)"
              >
                <span class="flex size-8 shrink-0 items-center justify-center rounded-lg" :class="i === indice ? 'bg-white text-marca-700 shadow-sm' : 'bg-slate-100 text-slate-500'">
                  <Icono :nombre="o.icono" clase="size-4" />
                </span>
                <span class="min-w-0 flex-1 truncate font-medium">{{ o.etiqueta }}</span>
                <span v-if="o.grupo" class="shrink-0 text-xs text-slate-400">{{ o.grupo }}</span>
              </button>
            </li>
            <li v-if="!resultados.length" class="px-3 py-6 text-center text-sm text-slate-500">Sin resultados para "{{ q }}"</li>
          </ul>
          <p class="hidden border-t border-slate-100 px-4 py-2 text-xs text-slate-400 sm:block">
            <kbd class="rounded border border-slate-200 px-1">↑</kbd> <kbd class="rounded border border-slate-200 px-1">↓</kbd> para moverse ·
            <kbd class="rounded border border-slate-200 px-1">Enter</kbd> para abrir
          </p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.paleta-enter-active, .paleta-leave-active { transition: opacity 0.15s ease; }
.paleta-enter-from, .paleta-leave-to { opacity: 0; }
</style>
