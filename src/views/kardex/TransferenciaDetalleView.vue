<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, mensajeError } from '@/services/api';
import { useToast } from '@/stores/toast';
import { useAuth } from '@/stores/auth';
import { useTiempoReal } from '@/composables/useTiempoReal';
import { cant, fechaHora, num, soles } from '@/utils/formato';
import { ESTADOS_TRANSFERENCIA } from '@/utils/kardex';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import BaseModal from '@/components/BaseModal.vue';
import Icono from '@/components/Icono.vue';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const t = ref(null);
const auth = useAuth();
// La guía acompaña el traslado: se emite al aprobar o despachar (también después, si faltó)
const puedeGuia = computed(() => t.value && ['APROBADA', 'DESPACHADA', 'RECIBIDA'].includes(t.value.estado) && auth.canEnEmpresa('gre.guia.crear', t.value.empresaId));
const enviando = ref(false);

async function cargar() {
  try {
    t.value = (await api.get(`/transferencias/${route.params.id}`)).data;
  } catch (e) {
    toast.error(mensajeError(e));
    router.replace('/transferencias');
  }
}
watch(() => route.params.id, (id) => id && cargar(), { immediate: true });
useTiempoReal('transferencia:cambio', (e) => e.id === t.value?.id && cargar());

/** Línea de tiempo: etapas cumplidas, la actual y las siguientes. */
const etapas = computed(() => {
  if (!t.value) return [];
  const x = t.value;
  const lista = [
    { titulo: 'Solicitada', quien: x.solicitadoPor?.nombres, cuando: x.solicitadoEn },
    { titulo: 'Aprobada', quien: x.aprobadoPor?.nombres, cuando: x.aprobadoEn },
    { titulo: 'Despachada', quien: x.despachadoPor?.nombres, cuando: x.despachadoEn, detalle: 'Salida del almacén de origen' },
    { titulo: 'Recibida', quien: x.recibidoPor?.nombres, cuando: x.recibidoEn, detalle: 'Entrada en el almacén de destino' },
  ];
  if (x.estado === 'RECHAZADA') lista.splice(1, 3, { titulo: 'Rechazada', quien: x.rechazadoPor?.nombres, cuando: x.rechazadoEn, error: true });
  if (x.estado === 'CANCELADA') {
    const hasta = lista.findIndex((e) => !e.cuando);
    lista.splice(hasta, lista.length, { titulo: 'Cancelada', quien: x.canceladoPor?.nombres, cuando: x.canceladoEn, error: true });
  }
  return lista;
});

// ── Acciones ──
const dialogo = reactive({ tipo: null, motivo: '', cantidades: {}, observacion: '' });
function abrir(tipo) {
  const base = tipo === 'despachar' ? 'cantidadSolicitada' : 'cantidadDespachada';
  Object.assign(dialogo, {
    tipo,
    motivo: '',
    observacion: '',
    cantidades: Object.fromEntries(t.value.detalles.map((d) => [d.productoId, d[base] != null ? String(Number(d[base])) : '0'])),
  });
}
const titulos = { aprobar: 'Aprobar transferencia', rechazar: 'Rechazar transferencia', cancelar: 'Cancelar transferencia', despachar: 'Despachar', recibir: 'Registrar recepción' };

async function confirmar() {
  enviando.value = true;
  const { tipo } = dialogo;
  const cuerpo = {
    aprobar: {},
    rechazar: { motivo: dialogo.motivo },
    cancelar: { motivo: dialogo.motivo },
    despachar: { cantidades: dialogo.cantidades },
    recibir: { cantidades: dialogo.cantidades, observacion: dialogo.observacion || undefined },
  }[tipo];
  try {
    const { data } = await api.post(`/transferencias/${t.value.id}/${tipo}`, cuerpo);
    toast.exito(`Transferencia ${data.numero}: ${ESTADOS_TRANSFERENCIA[data.estado].texto.toLowerCase()}`);
    dialogo.tipo = null;
    await cargar();
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    enviando.value = false;
  }
}

const faltante = (d) => (d.cantidadRecibida != null ? Number(d.cantidadDespachada) - Number(d.cantidadRecibida) : 0);
const diferenciaRecepcion = computed(() =>
  dialogo.tipo === 'recibir' && t.value.detalles.some((d) => Number(dialogo.cantidades[d.productoId]) < Number(d.cantidadDespachada)),
);
</script>

<template>
  <div v-if="t" class="space-y-5">
    <EncabezadoPagina :titulo="`Transferencia ${t.numero}`">
      <template #antes>
        <RouterLink to="/transferencias" class="mb-1 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <Icono nombre="atras" clase="size-4" /> Transferencias
        </RouterLink>
        <span class="insignia mb-1" :class="ESTADOS_TRANSFERENCIA[t.estado].clase">{{ ESTADOS_TRANSFERENCIA[t.estado].texto }}</span>
      </template>
      <button v-if="t.acciones.aprobar" class="btn-primario" @click="abrir('aprobar')"><Icono nombre="check" /> Aprobar</button>
      <button v-if="t.acciones.despachar" class="btn-primario" @click="abrir('despachar')"><Icono nombre="salida" /> Despachar</button>
      <button v-if="t.acciones.recibir" class="btn-primario" @click="abrir('recibir')"><Icono nombre="entrada" /> Recibir</button>
      <button v-if="t.acciones.rechazar" class="btn-secundario text-red-600" @click="abrir('rechazar')">Rechazar</button>
      <button v-if="t.acciones.cancelar" class="btn-secundario" @click="abrir('cancelar')">Cancelar</button>
      <RouterLink v-if="puedeGuia" :to="`/guias/nueva?desde=transferencia&id=${t.id}`" class="btn-secundario"><Icono nombre="transferencias" clase="size-4" /> Emitir guía de remisión</RouterLink>
    </EncabezadoPagina>

    <div class="grid gap-5 lg:grid-cols-[1fr_20rem]">
      <div class="space-y-5">
        <!-- Ruta -->
        <section class="tarjeta grid gap-4 p-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:p-5">
          <div>
            <p class="text-xs text-slate-500 uppercase">Origen</p>
            <p class="font-medium">{{ t.origen.codigo }} — {{ t.origen.nombre }}</p>
            <p class="text-sm text-slate-500">{{ t.origen.sede.nombre }}</p>
          </div>
          <Icono nombre="transferencias" clase="size-7 text-marca-700 sm:mx-4" />
          <div>
            <p class="text-xs text-slate-500 uppercase">Destino</p>
            <p class="font-medium">{{ t.destino.codigo }} — {{ t.destino.nombre }}</p>
            <p class="text-sm text-slate-500">{{ t.destino.sede.nombre }}</p>
          </div>
          <p v-if="t.observacion" class="text-sm text-slate-600 sm:col-span-3"><strong>Observación:</strong> {{ t.observacion }}</p>
          <p v-if="t.motivoCierre" class="rounded-lg bg-slate-50 px-3 py-2 text-sm sm:col-span-3"><strong>Nota de cierre:</strong> {{ t.motivoCierre }}</p>
        </section>

        <!-- Productos -->
        <section class="tarjeta overflow-hidden">
          <h2 class="border-b border-slate-100 px-4 py-3 font-semibold">Productos</h2>
          <ul class="divide-y divide-slate-100">
            <li v-for="d in t.detalles" :key="d.id" class="p-4">
              <div class="flex flex-wrap justify-between gap-2">
                <div class="min-w-0">
                  <p class="font-medium">{{ d.producto.nombre }}</p>
                  <p class="font-mono text-xs text-slate-400">{{ d.producto.sku }}</p>
                </div>
                <p v-if="['SOLICITADA', 'APROBADA'].includes(t.estado) && t.stockOrigen[d.productoId] !== undefined" class="text-xs text-slate-500">
                  Stock en origen: <strong>{{ cant(t.stockOrigen[d.productoId]) }}</strong>
                </p>
              </div>
              <dl class="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div class="rounded-lg bg-slate-50 p-2"><dt class="text-xs text-slate-500">Solicitado</dt><dd class="font-semibold tabular-nums">{{ cant(d.cantidadSolicitada) }} {{ d.producto.unidad.codigo }}</dd></div>
                <div class="rounded-lg bg-slate-50 p-2"><dt class="text-xs text-slate-500">Despachado</dt><dd class="font-semibold tabular-nums">{{ cant(d.cantidadDespachada) }}</dd></div>
                <div class="rounded-lg bg-slate-50 p-2"><dt class="text-xs text-slate-500">Recibido</dt><dd class="font-semibold tabular-nums">{{ cant(d.cantidadRecibida) }}</dd></div>
                <div class="rounded-lg p-2" :class="faltante(d) > 0 ? 'bg-red-50 text-red-700' : 'bg-slate-50'">
                  <dt class="text-xs" :class="faltante(d) > 0 ? '' : 'text-slate-500'">{{ t.verCostos && d.costoUnitario ? 'Costo unit.' : 'Faltante' }}</dt>
                  <dd class="font-semibold tabular-nums">
                    <template v-if="t.verCostos && d.costoUnitario">{{ num(d.costoUnitario, 4) }}</template>
                    <template v-else>{{ faltante(d) > 0 ? cant(faltante(d)) : '—' }}</template>
                  </dd>
                </div>
              </dl>
              <p v-if="faltante(d) > 0 && t.verCostos && d.costoUnitario" class="mt-1 text-xs text-red-600">
                Faltante: {{ cant(faltante(d)) }} ({{ soles(faltante(d) * Number(d.costoUnitario)) }})
              </p>
            </li>
          </ul>
        </section>
      </div>

      <!-- Seguimiento -->
      <aside class="space-y-5">
        <section class="tarjeta p-4">
          <h2 class="mb-3 font-semibold">Seguimiento</h2>
          <ol class="space-y-4">
            <li v-for="(e, i) in etapas" :key="e.titulo" class="relative flex gap-3">
              <span
                class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                :class="e.error ? 'bg-red-100 text-red-700' : e.cuando ? 'bg-marca-700 text-white' : 'border-2 border-slate-200 text-slate-400'"
              >
                <Icono v-if="e.cuando && !e.error" nombre="check" clase="size-3.5" />
                <template v-else>{{ e.error ? '!' : i + 1 }}</template>
              </span>
              <div class="text-sm">
                <p class="font-medium" :class="e.cuando ? '' : 'text-slate-400'">{{ e.titulo }}</p>
                <p v-if="e.cuando" class="text-xs text-slate-500">{{ e.quien }} · {{ fechaHora(e.cuando) }}</p>
                <p v-else-if="e.detalle" class="text-xs text-slate-400">{{ e.detalle }}</p>
              </div>
            </li>
          </ol>
        </section>
        <section v-if="t.movimientos.length" class="tarjeta p-4">
          <h2 class="mb-2 font-semibold">Movimientos de kardex</h2>
          <ul class="space-y-1 text-sm">
            <li v-for="m in t.movimientos" :key="m.id">
              <RouterLink :to="`/movimientos/${m.id}`" class="flex min-h-10 items-center justify-between gap-2 text-marca-700 hover:underline">
                <span class="font-mono">{{ m.numero }}</span>
                <span class="text-xs text-slate-500">{{ m.tipo === 'SALIDA' ? 'Salida en origen' : 'Entrada en destino' }}</span>
              </RouterLink>
            </li>
          </ul>
        </section>
      </aside>
    </div>

    <BaseModal :abierto="!!dialogo.tipo" :titulo="titulos[dialogo.tipo]" @cerrar="dialogo.tipo = null">
      <form id="form-accion" class="space-y-4" @submit.prevent="confirmar">
        <p v-if="dialogo.tipo === 'aprobar'" class="text-sm text-slate-600">
          Se autoriza el traslado. El stock se descuenta del origen recién al <strong>despachar</strong>.
        </p>
        <div v-if="['rechazar', 'cancelar'].includes(dialogo.tipo)">
          <label class="etiqueta" for="mot">Motivo *</label>
          <textarea id="mot" v-model="dialogo.motivo" class="input py-2" rows="3" minlength="5" maxlength="500" required />
        </div>
        <template v-if="['despachar', 'recibir'].includes(dialogo.tipo)">
          <p class="text-sm text-slate-600">
            {{ dialogo.tipo === 'despachar'
              ? 'Confirme las cantidades que salen del almacén de origen (puede despachar menos de lo solicitado).'
              : 'Confirme las cantidades recibidas. Si llega menos de lo despachado, la diferencia queda registrada como faltante.' }}
          </p>
          <div v-for="d in t.detalles" :key="d.id" class="flex items-end gap-3">
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{{ d.producto.nombre }}</p>
              <p class="text-xs text-slate-500">
                {{ dialogo.tipo === 'despachar' ? `Solicitado ${cant(d.cantidadSolicitada)}` : `Despachado ${cant(d.cantidadDespachada)}` }} {{ d.producto.unidad.codigo }}
              </p>
            </div>
            <input
              v-model="dialogo.cantidades[d.productoId]"
              type="number"
              inputmode="decimal"
              min="0"
              :max="dialogo.tipo === 'despachar' ? Number(d.cantidadSolicitada) : Number(d.cantidadDespachada)"
              step="any"
              class="input min-h-12 w-32 text-lg"
              :disabled="dialogo.tipo === 'recibir' && !Number(d.cantidadDespachada)"
              required
            />
          </div>
          <div v-if="dialogo.tipo === 'recibir'">
            <label class="etiqueta" for="obsr">Observación de la recepción{{ diferenciaRecepcion ? ' (explique la diferencia)' : '' }}</label>
            <input id="obsr" v-model="dialogo.observacion" class="input" maxlength="500" :required="diferenciaRecepcion" />
          </div>
        </template>
      </form>
      <template #pie>
        <button class="btn-secundario" @click="dialogo.tipo = null">Volver</button>
        <button :class="['rechazar', 'cancelar'].includes(dialogo.tipo) ? 'btn-peligro' : 'btn-primario'" form="form-accion" :disabled="enviando">
          {{ enviando ? 'Procesando…' : titulos[dialogo.tipo] }}
        </button>
      </template>
    </BaseModal>
  </div>
  <p v-else class="text-sm text-slate-500">Cargando…</p>
</template>
