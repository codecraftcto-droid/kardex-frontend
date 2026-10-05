<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api, mensajeError } from '@/services/api';
import { useAuth } from '@/stores/auth';
import { useContexto } from '@/stores/contexto';
import { useToast } from '@/stores/toast';
import { useAlmacenes } from '@/composables/useAlmacenes';
import { cant } from '@/utils/formato';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import BuscadorProducto from '@/components/BuscadorProducto.vue';
import Icono from '@/components/Icono.vue';

const router = useRouter();
const auth = useAuth();
const contexto = useContexto();
const toast = useToast();
const { almacenes } = useAlmacenes();

const form = reactive({ origenAlmacenId: '', destinoAlmacenId: '', observacion: '' });
const items = ref([]);
const stockOrigen = ref(new Map());
const enviando = ref(false);

// Debe tener permiso de solicitar sobre el origen o sobre el destino
const recurso = (a) => ({ empresaId: a.empresaId, sedeId: a.sedeId, almacenId: a.id });
const puedeEn = (id) => {
  const a = almacenes.value.find((x) => x.id === id);
  return a && auth.can('transferencia.solicitar', recurso(a));
};
const permitido = computed(() => form.origenAlmacenId && form.destinoAlmacenId && (puedeEn(form.origenAlmacenId) || puedeEn(form.destinoAlmacenId)));

watch(almacenes, (lista) => {
  if (lista.length < 2) return;
  const propio = lista.find((a) => auth.can('transferencia.solicitar', recurso(a)));
  form.destinoAlmacenId ||= propio?.id ?? lista[1].id;
  form.origenAlmacenId ||= lista.find((a) => a.id !== form.destinoAlmacenId)?.id ?? '';
}, { immediate: true });

watch(() => form.origenAlmacenId, async (almacenId) => {
  stockOrigen.value = new Map();
  if (!almacenId || !auth.canEnEmpresa('kardex.stock.ver', contexto.empresaActivaId)) return;
  try {
    const { data } = await api.get('/kardex/stock', { params: { empresaId: contexto.empresaActivaId, almacenId, porPagina: 200 } });
    stockOrigen.value = new Map(data.datos.map((s) => [s.productoId, Number(s.cantidad)]));
  } catch {
    /* sin visibilidad del stock de origen: se valida al despachar */
  }
}, { immediate: true });

function agregar(p) {
  const existente = items.value.find((i) => i.producto.id === p.id);
  if (existente) existente.cantidad = String(Number(existente.cantidad || 0) + 1);
  else items.value.push({ producto: p, cantidad: '1' });
}
const disponible = (id) => stockOrigen.value.get(id);
const valido = computed(() => permitido.value && form.origenAlmacenId !== form.destinoAlmacenId && items.value.length && items.value.every((i) => Number(i.cantidad) > 0));

async function guardar() {
  enviando.value = true;
  try {
    const { data } = await api.post('/transferencias', {
      ...form,
      items: items.value.map((i) => ({ productoId: i.producto.id, cantidad: String(i.cantidad) })),
    });
    toast.exito(`Transferencia ${data.numero} solicitada`);
    router.push(`/transferencias/${data.id}`);
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <form class="space-y-5" @submit.prevent="guardar">
    <EncabezadoPagina titulo="Nueva transferencia" :subtitulo="contexto.empresaActiva?.razonSocial">
      <template #antes>
        <RouterLink to="/transferencias" class="mb-1 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <Icono nombre="atras" clase="size-4" /> Transferencias
        </RouterLink>
      </template>
    </EncabezadoPagina>

    <p v-if="almacenes.length < 2" class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
      Necesita al menos dos almacenes visibles en esta empresa para transferir.
    </p>

    <section class="tarjeta grid gap-4 p-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end sm:p-5">
      <div>
        <label class="etiqueta" for="ori">Desde (origen) *</label>
        <select id="ori" v-model="form.origenAlmacenId" class="input" required>
          <option v-for="a in almacenes" :key="a.id" :value="a.id" :disabled="a.id === form.destinoAlmacenId">{{ a.codigo }} — {{ a.nombre }} ({{ a.sede.nombre }})</option>
        </select>
      </div>
      <Icono nombre="transferencias" clase="mx-auto hidden size-6 text-slate-400 sm:mb-2.5 sm:block" />
      <div>
        <label class="etiqueta" for="des">Hacia (destino) *</label>
        <select id="des" v-model="form.destinoAlmacenId" class="input" required>
          <option v-for="a in almacenes" :key="a.id" :value="a.id" :disabled="a.id === form.origenAlmacenId">{{ a.codigo }} — {{ a.nombre }} ({{ a.sede.nombre }})</option>
        </select>
      </div>
      <div class="sm:col-span-3">
        <label class="etiqueta" for="obs">Observación</label>
        <input id="obs" v-model="form.observacion" class="input" maxlength="500" placeholder="Motivo o referencia de la transferencia" />
      </div>
      <p v-if="form.origenAlmacenId && form.destinoAlmacenId && !permitido" class="text-sm text-red-600 sm:col-span-3">
        No tiene permiso para solicitar transferencias entre estos almacenes.
      </p>
    </section>

    <section class="space-y-3">
      <h2 class="font-semibold">Productos</h2>
      <BuscadorProducto v-if="contexto.empresaActivaId" :empresa-id="contexto.empresaActivaId" escaneo-continuo @seleccionar="agregar" />
      <p v-if="!items.length" class="tarjeta border-dashed p-6 text-center text-sm text-slate-500">Agregue los productos a transferir.</p>
      <ul class="space-y-3">
        <li v-for="(it, i) in items" :key="it.producto.id" class="tarjeta flex flex-wrap items-end gap-3 p-4">
          <div class="min-w-0 flex-1">
            <p class="font-medium">{{ it.producto.nombre }}</p>
            <p class="text-xs text-slate-500">
              <span class="font-mono">{{ it.producto.sku }}</span>
              <template v-if="disponible(it.producto.id) !== undefined"> · En origen: <strong>{{ cant(disponible(it.producto.id)) }}</strong></template>
            </p>
            <p v-if="disponible(it.producto.id) !== undefined && Number(it.cantidad) > disponible(it.producto.id)" class="text-xs text-amber-700">
              Supera el stock actual del origen; se validará al despachar.
            </p>
          </div>
          <div class="w-36">
            <label class="etiqueta">Cantidad ({{ it.producto.unidad.codigo }})</label>
            <input v-model="it.cantidad" type="number" inputmode="decimal" min="0.0001" step="any" class="input min-h-12 text-lg" required />
          </div>
          <button type="button" class="btn px-2 text-red-600 hover:bg-red-50" aria-label="Quitar" @click="items.splice(i, 1)"><Icono nombre="eliminar" /></button>
        </li>
      </ul>
    </section>

    <div class="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border lg:bottom-4">
      <div class="flex items-center justify-between gap-3">
        <p class="text-sm">{{ items.length }} producto(s)</p>
        <button class="btn-primario min-h-12 px-6 text-base" :disabled="!valido || enviando">{{ enviando ? 'Enviando…' : 'Solicitar transferencia' }}</button>
      </div>
    </div>
  </form>
</template>
