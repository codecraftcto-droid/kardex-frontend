<script setup>
import { ref, watch } from 'vue';
import { api } from '@/services/api';
import Icono from './Icono.vue';
import EscanerCodigo from './EscanerCodigo.vue';

/**
 * Búsqueda de productos por nombre, SKU o código de barras.
 * Compatible con lectores de código de barras USB/Bluetooth (escriben el código + Enter).
 */
const props = defineProps({
  empresaId: { type: String, required: true },
  placeholder: { type: String, default: 'Buscar o escanear producto…' },
  /** El escáner sigue abierto tras cada lectura (para agregar varios productos) */
  escaneoContinuo: Boolean,
});
const emit = defineEmits(['seleccionar']);

const texto = ref('');
const resultados = ref([]);
const abierto = ref(false);
const mensaje = ref('');
const entrada = ref(null);
let t;

watch(texto, (q) => {
  clearTimeout(t);
  mensaje.value = '';
  if (q.trim().length < 2) return (resultados.value = []);
  t = setTimeout(async () => {
    const { data } = await api.get('/productos', { params: { empresaId: props.empresaId, q: q.trim(), activo: 'true', porPagina: 8 } });
    resultados.value = data.datos;
    abierto.value = true;
  }, 250);
});

function elegir(p) {
  emit('seleccionar', p);
  texto.value = '';
  resultados.value = [];
  abierto.value = false;
  entrada.value?.focus();
}

// ── Cámara ──
const escaner = ref(false);
const hayCamara = typeof navigator !== 'undefined' && !!navigator.mediaDevices;
async function alLeer(codigo) {
  try {
    const { data } = await api.get(`/productos/codigo/${encodeURIComponent(codigo)}`, { params: { empresaId: props.empresaId } });
    elegir(data);
    mensaje.value = '';
  } catch {
    mensaje.value = `No hay un producto con el código ${codigo}`;
  }
}

// Deja terminar el clic en un resultado antes de cerrar la lista
const cerrarLuego = () => setTimeout(() => (abierto.value = false), 150);

/** Enter: código exacto (escáner) o único resultado. */
async function alEnter() {
  const q = texto.value.trim();
  if (!q) return;
  clearTimeout(t);
  try {
    const { data } = await api.get(`/productos/codigo/${encodeURIComponent(q)}`, { params: { empresaId: props.empresaId } });
    return elegir(data);
  } catch {
    if (resultados.value.length === 1) return elegir(resultados.value[0]);
    mensaje.value = resultados.value.length ? 'Seleccione un producto de la lista' : 'No se encontró el producto';
  }
}
</script>

<template>
  <div class="relative">
    <Icono nombre="buscar" clase="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-slate-400" />
    <input
      ref="entrada"
      v-model="texto"
      type="search"
      class="input min-h-12 pl-10 text-base" :class="{ 'pr-14': hayCamara }"
      :placeholder="placeholder"
      autocomplete="off"
      enterkeyhint="search"
      @keydown.enter.prevent="alEnter"
      @focus="abierto = resultados.length > 0"
      @blur="cerrarLuego"
    />
    <button
      v-if="hayCamara"
      type="button"
      class="absolute top-1 right-1 flex size-10 items-center justify-center rounded-md text-marca-700 hover:bg-marca-50"
      aria-label="Escanear con la cámara"
      @click="escaner = true"
    >
      <Icono nombre="camara" clase="size-6" />
    </button>
    <EscanerCodigo :abierto="escaner" :continuo="escaneoContinuo" @leido="alLeer" @cerrar="escaner = false" />
    <p v-if="mensaje" class="mt-1 text-sm text-amber-700">{{ mensaje }}</p>
    <ul v-if="abierto && resultados.length" class="tarjeta absolute inset-x-0 z-20 mt-1 max-h-80 overflow-y-auto py-1 shadow-lg">
      <li v-for="p in resultados" :key="p.id">
        <button type="button" class="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-slate-50" @mousedown.prevent="elegir(p)">
          <span class="min-w-0">
            <span class="block truncate font-medium">{{ p.nombre }}</span>
            <span class="font-mono text-xs text-slate-400">{{ p.sku }}<template v-if="p.codigoBarras"> · {{ p.codigoBarras }}</template></span>
          </span>
          <span class="shrink-0 text-xs text-slate-500">{{ p.unidad.codigo }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>
