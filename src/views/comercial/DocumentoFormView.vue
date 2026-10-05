<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, mensajeError } from '@/services/api';
import { useAuth } from '@/stores/auth';
import { useContexto } from '@/stores/contexto';
import { useToast } from '@/stores/toast';
import { useAlmacenes } from '@/composables/useAlmacenes';
import { cant } from '@/utils/formato';
import { DOCUMENTOS, IGV_TASA, monedaFmt } from '@/utils/comercial';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import BuscadorProducto from '@/components/BuscadorProducto.vue';
import Icono from '@/components/Icono.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const contexto = useContexto();
const toast = useToast();
const { almacenes, conPermiso } = useAlmacenes();

const tipo = computed(() => route.meta.tipo);
const cfg = computed(() => DOCUMENTOS[tipo.value]);
const esVenta = computed(() => tipo.value === 'VENTA');
const id = computed(() => route.params.id);
const almacenesPermitidos = computed(() => conPermiso(`${cfg.value.permiso}.crear`));

const form = reactive({
  almacenId: '',
  terceroDocumento: '',
  terceroNombre: '',
  comprobanteTipo: cfg.value.comprobantes[0],
  serie: '',
  numero: '',
  fechaEmision: new Date().toISOString().slice(0, 10),
  moneda: 'PEN',
  tipoCambio: '',
  observacion: '',
});
const items = ref([]);
const stock = ref(new Map());
const enviando = ref(false);
const formulario = ref(null);

// Edición de un borrador existente
watch(id, async (docId) => {
  if (!docId) return;
  try {
    const { data } = await api.get(`${cfg.value.api}/${docId}`);
    if (data.estado !== 'BORRADOR') {
      toast.error('Solo se pueden editar documentos en borrador');
      return router.replace(`${cfg.value.ruta}/${docId}`);
    }
    Object.assign(form, {
      almacenId: data.almacenId, terceroDocumento: data.terceroDocumento, terceroNombre: data.terceroNombre,
      comprobanteTipo: data.comprobanteTipo, serie: data.serie, numero: data.numero,
      fechaEmision: data.fechaEmision.slice(0, 10), moneda: data.moneda,
      tipoCambio: data.moneda === 'USD' ? String(Number(data.tipoCambio)) : '', observacion: data.observacion ?? '',
    });
    items.value = data.detalles.map((d) => ({
      producto: d.producto, cantidad: String(Number(d.cantidad)), valorUnitario: String(Number(d.valorUnitario)), afectoIgv: d.afectoIgv,
    }));
  } catch (e) {
    toast.error(mensajeError(e));
    router.replace(cfg.value.ruta);
  }
}, { immediate: true });

watch(almacenesPermitidos, (lista) => {
  if (!form.almacenId || !lista.some((a) => a.id === form.almacenId)) form.almacenId = lista[0]?.id ?? '';
}, { immediate: true });

// Stock del almacén (en ventas, para no vender lo que no hay)
watch(() => form.almacenId, async (almacenId) => {
  stock.value = new Map();
  if (!almacenId || !esVenta.value || !auth.canEnEmpresa('kardex.stock.ver', contexto.empresaActivaId)) return;
  const { data } = await api.get('/kardex/stock', { params: { empresaId: contexto.empresaActivaId, almacenId, porPagina: 200 } });
  stock.value = new Map(data.datos.map((s) => [s.productoId, Number(s.cantidad)]));
}, { immediate: true });

function agregar(p) {
  const existente = items.value.find((i) => i.producto.id === p.id);
  if (existente) {
    existente.cantidad = String(Number(existente.cantidad || 0) + 1);
    return;
  }
  // En ventas se sugiere el precio referencial (sin IGV)
  const sugerido = esVenta.value && p.precioReferencial ? (Number(p.precioReferencial) / (1 + IGV_TASA)).toFixed(4) : '';
  items.value.push({ producto: p, cantidad: '1', valorUnitario: sugerido, afectoIgv: true });
}

const linea = (it) => Math.round(Number(it.cantidad || 0) * Number(it.valorUnitario || 0) * 100) / 100;
const totales = computed(() => {
  const subtotal = items.value.reduce((s, it) => s + linea(it), 0);
  const gravado = items.value.filter((it) => it.afectoIgv).reduce((s, it) => s + linea(it), 0);
  const igv = Math.round(gravado * IGV_TASA * 100) / 100;
  return { subtotal, igv, total: subtotal + igv };
});
const sinStock = (it) => esVenta.value && stock.value.size > 0 && Number(it.cantidad) > (stock.value.get(it.producto.id) ?? 0);
const puedeConfirmar = computed(() => {
  const a = almacenes.value.find((x) => x.id === form.almacenId);
  return a && auth.can(`${cfg.value.permiso}.aprobar`, { empresaId: a.empresaId, sedeId: a.sedeId, almacenId: a.id });
});

async function guardar(confirmarDespues = false) {
  // El botón de confirmar no es submit: se validan igual los campos obligatorios
  if (!formulario.value.reportValidity()) return;
  enviando.value = true;
  try {
    const cuerpo = {
      ...form,
      tipoCambio: form.moneda === 'USD' ? form.tipoCambio : undefined,
      items: items.value.map((it) => ({ productoId: it.producto.id, cantidad: String(it.cantidad), valorUnitario: String(it.valorUnitario || 0), afectoIgv: it.afectoIgv })),
    };
    const { data } = id.value ? await api.put(`${cfg.value.api}/${id.value}`, cuerpo) : await api.post(cfg.value.api, cuerpo);
    if (confirmarDespues) {
      try {
        const c = await api.post(`${cfg.value.api}/${data.id}/confirmar`);
        toast.exito(`${cfg.value.singular} confirmada; kardex actualizado (${c.data.movimiento.numero})`);
      } catch (e) {
        toast.error(`Se guardó como borrador, pero no se pudo confirmar: ${mensajeError(e)}`);
      }
    } else {
      toast.exito('Borrador guardado');
    }
    router.push(`${cfg.value.ruta}/${data.id}`);
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <form ref="formulario" class="space-y-5" @submit.prevent="guardar(false)">
    <EncabezadoPagina :titulo="`${id ? 'Editar' : 'Nueva'} ${cfg.singular.toLowerCase()}`" :subtitulo="contexto.empresaActiva?.razonSocial">
      <template #antes>
        <RouterLink :to="cfg.ruta" class="mb-1 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <Icono nombre="atras" clase="size-4" /> {{ cfg.plural }}
        </RouterLink>
      </template>
    </EncabezadoPagina>

    <p class="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">Se guarda como borrador. {{ cfg.efecto }}</p>

    <section class="tarjeta grid gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
      <div class="lg:col-span-1">
        <label class="etiqueta" for="tdoc">{{ esVenta ? 'DNI / RUC' : 'RUC' }} del {{ cfg.tercero.toLowerCase() }} *</label>
        <input id="tdoc" v-model="form.terceroDocumento" class="input font-mono" inputmode="numeric" maxlength="11" required />
      </div>
      <div class="sm:col-span-1 lg:col-span-3">
        <label class="etiqueta" for="tnom">{{ esVenta ? 'Nombre o razón social' : 'Razón social' }} *</label>
        <input id="tnom" v-model="form.terceroNombre" class="input" maxlength="200" required />
      </div>
      <div>
        <label class="etiqueta" for="ctipo">Comprobante *</label>
        <select id="ctipo" v-model="form.comprobanteTipo" class="input">
          <option v-for="c in cfg.comprobantes" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>
      <div class="grid grid-cols-[5.5rem_1fr] gap-2">
        <div><label class="etiqueta" for="ser">Serie *</label><input id="ser" v-model="form.serie" class="input uppercase" maxlength="10" required /></div>
        <div><label class="etiqueta" for="num">Número *</label><input id="num" v-model="form.numero" class="input" inputmode="numeric" maxlength="10" required /></div>
      </div>
      <div><label class="etiqueta" for="fem">Fecha de emisión *</label><input id="fem" v-model="form.fechaEmision" type="date" class="input" required /></div>
      <div>
        <label class="etiqueta" for="alm">Almacén *</label>
        <select id="alm" v-model="form.almacenId" class="input" required>
          <option v-for="a in almacenesPermitidos" :key="a.id" :value="a.id">{{ a.codigo }} — {{ a.nombre }}</option>
        </select>
      </div>
      <div>
        <label class="etiqueta" for="mon">Moneda</label>
        <select id="mon" v-model="form.moneda" class="input">
          <option value="PEN">Soles (S/)</option>
          <option value="USD">Dólares (US$)</option>
        </select>
      </div>
      <div v-if="form.moneda === 'USD'">
        <label class="etiqueta" for="tc">Tipo de cambio *</label>
        <input id="tc" v-model="form.tipoCambio" type="number" inputmode="decimal" min="0.0001" step="0.0001" class="input" required />
      </div>
      <div :class="form.moneda === 'USD' ? 'sm:col-span-2' : 'sm:col-span-2 lg:col-span-3'">
        <label class="etiqueta" for="obs">Observación</label>
        <input id="obs" v-model="form.observacion" class="input" maxlength="500" />
      </div>
    </section>

    <section class="space-y-3">
      <h2 class="font-semibold">Productos</h2>
      <BuscadorProducto v-if="contexto.empresaActivaId" :empresa-id="contexto.empresaActivaId" escaneo-continuo @seleccionar="agregar" />
      <p v-if="!items.length" class="tarjeta border-dashed p-6 text-center text-sm text-slate-500">Busque o escanee los productos del comprobante.</p>
      <ul class="space-y-3">
        <li v-for="(it, i) in items" :key="it.producto.id" class="tarjeta p-4" :class="{ 'border-red-300': sinStock(it) }">
          <div class="mb-3 flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="font-medium">{{ it.producto.nombre }}</p>
              <p class="text-xs text-slate-500">
                <span class="font-mono">{{ it.producto.sku }}</span>
                <template v-if="esVenta && stock.size"> · Disponible: <strong>{{ cant(stock.get(it.producto.id) ?? 0) }}</strong></template>
              </p>
            </div>
            <button type="button" class="btn shrink-0 px-2 text-red-600 hover:bg-red-50" aria-label="Quitar" @click="items.splice(i, 1)"><Icono nombre="eliminar" /></button>
          </div>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:items-end">
            <div>
              <label class="etiqueta">Cantidad ({{ it.producto.unidad.codigo }})</label>
              <input v-model="it.cantidad" type="number" inputmode="decimal" min="0.0001" step="any" class="input min-h-12 text-lg" required />
            </div>
            <div>
              <label class="etiqueta">{{ esVenta ? 'Precio' : 'Valor' }} unit. sin IGV</label>
              <input v-model="it.valorUnitario" type="number" inputmode="decimal" min="0" step="any" class="input min-h-12 text-lg" required />
            </div>
            <label class="flex min-h-12 items-center gap-2 text-sm">
              <input v-model="it.afectoIgv" type="checkbox" class="size-5 accent-marca-700" /> Afecto a IGV
            </label>
            <p class="text-right text-sm text-slate-500 sm:pb-3">Subtotal: <strong class="text-slate-800">{{ monedaFmt(linea(it), form.moneda) }}</strong></p>
          </div>
          <p v-if="sinStock(it)" class="mt-2 text-sm text-red-600">No hay stock suficiente; no se podrá confirmar.</p>
        </li>
      </ul>
    </section>

    <div class="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border lg:bottom-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <dl class="flex gap-4 text-sm">
          <div><dt class="text-xs text-slate-500">Subtotal</dt><dd class="tabular-nums">{{ monedaFmt(totales.subtotal, form.moneda) }}</dd></div>
          <div><dt class="text-xs text-slate-500">IGV 18%</dt><dd class="tabular-nums">{{ monedaFmt(totales.igv, form.moneda) }}</dd></div>
          <div><dt class="text-xs text-slate-500">Total</dt><dd class="font-semibold tabular-nums">{{ monedaFmt(totales.total, form.moneda) }}</dd></div>
        </dl>
        <div class="flex w-full gap-2 sm:w-auto">
          <button class="btn-secundario min-h-12 flex-1" :disabled="!items.length || enviando">Guardar borrador</button>
          <button v-if="puedeConfirmar" type="button" class="btn-primario min-h-12 flex-1" :disabled="!items.length || enviando || items.some(sinStock)" @click="guardar(true)">
            Guardar y confirmar
          </button>
        </div>
      </div>
    </div>
  </form>
</template>
