<script setup>
import { confirmar } from '@/utils/dialogos';
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, mensajeError } from '@/services/api';
import { useToast } from '@/stores/toast';
import { useTiempoReal } from '@/composables/useTiempoReal';
import { cant, fecha, fechaHora, num, soles } from '@/utils/formato';
import { DOCUMENTOS, ESTADOS_DOCUMENTO, monedaFmt } from '@/utils/comercial';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import TablaResponsiva from '@/components/TablaResponsiva.vue';
import BaseModal from '@/components/BaseModal.vue';
import Icono from '@/components/Icono.vue';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const cfg = computed(() => DOCUMENTOS[route.meta.tipo]);
const d = ref(null);
const enviando = ref(false);

async function cargar() {
  try {
    d.value = (await api.get(`${cfg.value.api}/${route.params.id}`)).data;
  } catch (e) {
    toast.error(mensajeError(e));
    router.replace(cfg.value.ruta);
  }
}
watch(() => route.params.id, (id) => id && cargar(), { immediate: true });
useTiempoReal(['compra:cambio', 'venta:cambio'], (e) => e.id === d.value?.id && (e.estado === 'ELIMINADO' ? router.replace(cfg.value.ruta) : cargar()));

const columnas = [
  { clave: 'producto.nombre', titulo: 'Producto' },
  { clave: 'cantidad', titulo: 'Cantidad', clase: 'text-right' },
  { clave: 'valorUnitario', titulo: 'Valor unit.', clase: 'text-right' },
  { clave: 'afectoIgv', titulo: 'IGV' },
  { clave: 'subtotal', titulo: 'Subtotal', clase: 'text-right' },
];

async function accion(fn, exito) {
  enviando.value = true;
  try {
    await fn();
    if (exito) toast.exito(exito);
    await cargar();
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    enviando.value = false;
  }
}

const confirmarDoc = async () => {
  if (!(await confirmar({ titulo: `¿Confirmar ${cfg.value.articulo}?`, texto: cfg.value.efecto, confirmar: 'Confirmar' }))) return;
  enviando.value = true;
  try {
    const { data } = await api.post(`${cfg.value.api}/${d.value.id}/confirmar`, {});
    toast.exito(`${cfg.value.singular} confirmada · kardex ${data.movimiento.numero}`);
  } catch (e) {
    // SUNAT no reconoce el comprobante del proveedor: se puede confirmar igual, a conciencia (queda auditado)
    if (e.response?.data?.detalles?.codigo === 'VALIDACION_SUNAT') {
      const forzar = await confirmar({
        titulo: 'SUNAT no valida este comprobante',
        texto: `${e.response.data.error}. Si lo registra igual, podría perder el crédito fiscal. ¿Confirmar de todas formas?`,
        confirmar: 'Confirmar igual', peligro: true,
      });
      if (forzar) {
        try {
          await api.post(`${cfg.value.api}/${d.value.id}/confirmar`, { forzar: true });
          toast.aviso('Compra confirmada pese a la observación de SUNAT (quedó registrado en la auditoría)');
        } catch (e2) {
          toast.error(mensajeError(e2));
        }
      }
    } else {
      toast.error(mensajeError(e));
    }
  } finally {
    enviando.value = false;
    await cargar();
  }
};

// ── Validación del comprobante del proveedor en SUNAT (solo compras) ──
const validable = computed(() => d.value?.tipo === 'COMPRA' && ['FACTURA', 'BOLETA'].includes(d.value.comprobanteTipo) && /^\d{11}$/.test(d.value.terceroDocumento));
const VALIDACION = {
  VALIDO: { texto: 'Válido en SUNAT', clase: 'bg-emerald-50 text-emerald-700' },
  NO_EXISTE: { texto: 'No existe en SUNAT', clase: 'bg-red-50 text-red-700' },
  ANULADO: { texto: 'Anulado por el emisor', clase: 'bg-red-50 text-red-700' },
  NO_AUTORIZADO: { texto: 'Emisor no autorizado', clase: 'bg-red-50 text-red-700' },
  ERROR: { texto: 'No se pudo validar', clase: 'bg-amber-50 text-amber-800' },
};
const validando = ref(false);
async function validarSunat() {
  validando.value = true;
  try {
    const { data } = await api.post(`${cfg.value.api}/${d.value.id}/validar-sunat`);
    (data.estado === 'VALIDO' ? toast.exito : toast.aviso)(data.mensaje);
    await cargar();
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    validando.value = false;
  }
}
async function eliminar() {
  if (!(await confirmar({ titulo: '¿Eliminar este borrador?', texto: 'Esta acción no se puede deshacer.', confirmar: 'Eliminar borrador', peligro: true }))) return;
  try {
    await api.delete(`${cfg.value.api}/${d.value.id}`);
    toast.exito('Borrador eliminado');
    router.replace(cfg.value.ruta);
  } catch (e) {
    toast.error(mensajeError(e));
  }
}
// ── Detracción (SPOT) de la compra: el IGV da crédito fiscal cuando se deposita ──
const spot = reactive({ abierto: false, monto: '', constancia: '', fecha: '', guardando: false });
function abrirSpot() {
  Object.assign(spot, {
    abierto: true, monto: Number(d.value.detraccionMonto) ? String(Number(d.value.detraccionMonto)) : '',
    constancia: d.value.detraccionConstancia ?? '', fecha: d.value.detraccionFecha?.slice(0, 10) ?? '',
  });
}
async function guardarSpot() {
  spot.guardando = true;
  try {
    await api.put(`${cfg.value.api}/${d.value.id}/detraccion`, { monto: spot.monto || '0', constancia: spot.constancia || null, fecha: spot.fecha || null });
    toast.exito(spot.constancia ? 'Constancia de detracción registrada' : 'Detracción guardada');
    spot.abierto = false;
    await cargar();
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    spot.guardando = false;
  }
}
const conSpot = computed(() => Number(d.value?.detraccionMonto) > 0);

const anulacion = reactive({ abierto: false, motivo: '' });
const anular = () =>
  accion(async () => {
    const { data } = await api.post(`${cfg.value.api}/${d.value.id}/anular`, { motivo: anulacion.motivo });
    anulacion.abierto = false;
    toast.exito(`${cfg.value.singular} anulada · kardex ${data.movimiento.numero}`);
  });
</script>

<template>
  <div v-if="d" class="space-y-5">
    <EncabezadoPagina :titulo="`${d.comprobanteTipo} ${d.serie}-${d.numero}`" :subtitulo="d.terceroNombre">
      <template #antes>
        <RouterLink :to="cfg.ruta" class="mb-1 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <Icono nombre="atras" clase="size-4" /> {{ cfg.plural }}
        </RouterLink>
        <span class="insignia mb-1 ml-2" :class="ESTADOS_DOCUMENTO[d.estado].clase">{{ ESTADOS_DOCUMENTO[d.estado].texto }}</span>
      </template>
      <button v-if="d.acciones.confirmar" class="btn-primario" :disabled="enviando" @click="confirmarDoc"><Icono nombre="check" /> Confirmar</button>
      <RouterLink v-if="d.acciones.editar" :to="`${cfg.ruta}/${d.id}/editar`" class="btn-secundario"><Icono nombre="editar" clase="size-4" /> Editar</RouterLink>
      <button v-if="d.acciones.eliminar" class="btn-secundario text-red-600" @click="eliminar"><Icono nombre="eliminar" clase="size-4" /></button>
      <button v-if="d.acciones.anular" class="btn-peligro" @click="(anulacion.motivo = ''), (anulacion.abierto = true)">Anular</button>
    </EncabezadoPagina>

    <p v-if="d.estado === 'BORRADOR'" class="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">Borrador: aún no afecta el inventario. {{ cfg.efecto }}</p>
    <p v-if="d.estado === 'ANULADO'" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      Anulada el {{ fechaHora(d.anuladoEn) }} por {{ d.anuladoPor }}: {{ d.motivoAnulacion }}
    </p>

    <!-- Validación en SUNAT del comprobante del proveedor -->
    <section v-if="validable" class="tarjeta flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
      <div class="min-w-0">
        <p class="flex flex-wrap items-center gap-2 font-semibold">
          Validación en SUNAT
          <span v-if="d.validacionEstado" class="insignia" :class="VALIDACION[d.validacionEstado]?.clase">{{ VALIDACION[d.validacionEstado]?.texto }}</span>
          <span v-else class="insignia bg-slate-100 text-slate-600">Sin validar</span>
        </p>
        <p v-if="d.validacionMensaje" class="mt-1 text-sm text-slate-600">{{ d.validacionMensaje }}</p>
        <p v-if="d.validacionRucEstado" class="mt-1 text-sm" :class="d.validacionRucEstado !== 'ACTIVO' || d.validacionRucCondicion !== 'HABIDO' ? 'font-medium text-red-700' : 'text-slate-500'">
          Proveedor: {{ d.validacionRucEstado }} · {{ d.validacionRucCondicion }}
          <template v-if="d.validacionRucCondicion && d.validacionRucCondicion !== 'HABIDO'"> — las compras a proveedores no habidos no dan derecho a crédito fiscal</template>
        </p>
        <p v-if="!d.validacionEstado" class="mt-1 text-sm text-slate-500">Al confirmar se valida automáticamente.</p>
      </div>
      <button class="btn-secundario shrink-0" :disabled="validando" @click="validarSunat">{{ validando ? 'Validando…' : d.validacionEstado ? 'Volver a validar' : 'Validar en SUNAT' }}</button>
    </section>

    <!-- Detracción (SPOT): solo compras -->
    <section v-if="d.tipo === 'COMPRA' && (conSpot || d.acciones.detraccion)" class="tarjeta flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
      <div class="min-w-0">
        <p class="flex flex-wrap items-center gap-2 font-semibold">
          Detracción (SPOT)
          <span v-if="!conSpot" class="insignia bg-slate-100 text-slate-600">No sujeta</span>
          <span v-else-if="d.detraccionConstancia" class="insignia bg-emerald-50 text-emerald-700">Depositada</span>
          <span v-else class="insignia bg-amber-50 text-amber-800">Pendiente de depósito</span>
        </p>
        <p v-if="conSpot" class="mt-1 text-sm text-slate-600">
          {{ soles(d.detraccionMonto) }}
          <template v-if="d.detraccionConstancia"> · constancia <span class="font-mono">{{ d.detraccionConstancia }}</span> del {{ fecha(d.detraccionFecha) }}</template>
        </p>
        <p v-if="conSpot && !d.detraccionConstancia" class="mt-1 text-sm text-amber-800">El IGV de esta compra recién da crédito fiscal en el período en que se deposite la detracción.</p>
        <p v-if="!conSpot" class="mt-1 text-sm text-slate-500">Si la compra está sujeta al SPOT, registre el monto y luego la constancia del depósito.</p>
      </div>
      <button v-if="d.acciones.detraccion" class="btn-secundario shrink-0" @click="abrirSpot">
        {{ !conSpot ? 'Registrar detracción' : d.detraccionConstancia ? 'Editar detracción' : 'Registrar constancia' }}
      </button>
    </section>

    <section class="tarjeta p-4 sm:p-5">
      <dl class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt class="text-slate-500">{{ cfg.tercero }}</dt><dd>{{ d.terceroNombre }} <span class="font-mono text-xs text-slate-400">{{ d.terceroDocumento }}</span></dd></div>
        <div><dt class="text-slate-500">Fecha de emisión</dt><dd>{{ fecha(d.fechaEmision) }}</dd></div>
        <div><dt class="text-slate-500">Almacén</dt><dd>{{ d.almacen.codigo }} — {{ d.almacen.nombre }}</dd></div>
        <div><dt class="text-slate-500">Moneda</dt><dd>{{ d.moneda }}<template v-if="d.moneda === 'USD'"> · T.C. {{ num(d.tipoCambio, 4) }}</template></dd></div>
        <div><dt class="text-slate-500">Registrada por</dt><dd>{{ d.creadoPor }}</dd></div>
        <div v-if="d.confirmadoEn"><dt class="text-slate-500">Confirmada</dt><dd>{{ d.confirmadoPor }} · {{ fechaHora(d.confirmadoEn) }}</dd></div>
        <div v-if="d.movimiento">
          <dt class="text-slate-500">Kardex</dt>
          <dd class="flex gap-2">
            <RouterLink :to="`/movimientos/${d.movimiento.id}`" class="font-mono text-marca-700 hover:underline">{{ d.movimiento.numero }}</RouterLink>
            <template v-if="d.anulacion">
              <span class="text-slate-400">→</span>
              <RouterLink :to="`/movimientos/${d.anulacion.id}`" class="font-mono text-red-600 hover:underline">{{ d.anulacion.numero }}</RouterLink>
            </template>
          </dd>
        </div>
        <div v-if="d.observacion" class="sm:col-span-2 lg:col-span-4"><dt class="text-slate-500">Observación</dt><dd>{{ d.observacion }}</dd></div>
      </dl>
    </section>

    <TablaResponsiva selector :columnas="columnas" :filas="d.detalles">
      <template #celda-producto.nombre="{ fila }">
        <span class="font-medium">{{ fila.producto.nombre }}</span>
        <p class="font-mono text-xs text-slate-400">{{ fila.producto.sku }}</p>
      </template>
      <template #celda-cantidad="{ fila }"><span class="tabular-nums">{{ cant(fila.cantidad) }} {{ fila.producto.unidad.codigo }}</span></template>
      <template #celda-valorUnitario="{ fila }"><span class="tabular-nums">{{ num(fila.valorUnitario, 4) }}</span></template>
      <template #celda-afectoIgv="{ fila }">{{ fila.afectoIgv ? 'Gravado' : 'Exonerado' }}</template>
      <template #celda-subtotal="{ fila }"><span class="tabular-nums">{{ monedaFmt(fila.subtotal, d.moneda) }}</span></template>
    </TablaResponsiva>

    <div class="grid gap-4 sm:grid-cols-2">
      <section v-if="d.margen" class="tarjeta p-4">
        <h2 class="mb-2 font-semibold">Margen de la venta</h2>
        <dl class="space-y-1 text-sm">
          <div class="flex justify-between"><dt class="text-slate-500">Venta (sin IGV, en soles)</dt><dd class="tabular-nums">{{ soles(d.margen.ventaSoles) }}</dd></div>
          <div class="flex justify-between"><dt class="text-slate-500">Costo de lo vendido (kardex)</dt><dd class="tabular-nums">{{ soles(d.margen.costoVenta) }}</dd></div>
          <div class="flex justify-between border-t border-slate-100 pt-1 font-semibold">
            <dt>Utilidad bruta</dt><dd class="tabular-nums" :class="Number(d.margen.utilidad) < 0 ? 'text-red-600' : 'text-emerald-700'">{{ soles(d.margen.utilidad) }}</dd>
          </div>
        </dl>
      </section>
      <dl class="tarjeta space-y-1 p-4 text-sm sm:col-start-2">
        <div class="flex justify-between"><dt class="text-slate-500">Subtotal</dt><dd class="tabular-nums">{{ monedaFmt(d.subtotal, d.moneda) }}</dd></div>
        <div class="flex justify-between"><dt class="text-slate-500">IGV</dt><dd class="tabular-nums">{{ monedaFmt(d.igv, d.moneda) }}</dd></div>
        <div class="flex justify-between border-t border-slate-100 pt-1 text-base font-semibold"><dt>Total</dt><dd class="tabular-nums">{{ monedaFmt(d.total, d.moneda) }}</dd></div>
      </dl>
    </div>

    <BaseModal :abierto="spot.abierto" :titulo="`Detracción · ${d.serie}-${d.numero}`" @cerrar="spot.abierto = false">
      <form id="form-spot" class="space-y-4" @submit.prevent="guardarSpot">
        <div>
          <label class="etiqueta" for="spot-monto">Monto de la detracción (S/)</label>
          <input id="spot-monto" v-model="spot.monto" type="number" inputmode="decimal" min="0" step="0.01" class="input tabular-nums" placeholder="0.00" />
          <p class="mt-1 text-xs text-slate-500">El que figura en la factura del proveedor (según la tabla del SPOT). Deje 0 si la compra no está sujeta.</p>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label class="etiqueta" for="spot-const">N.º de constancia de depósito</label>
            <input id="spot-const" v-model="spot.constancia" class="input font-mono" maxlength="30" :disabled="!Number(spot.monto)" />
          </div>
          <div>
            <label class="etiqueta" for="spot-fecha">Fecha del depósito{{ spot.constancia ? ' *' : '' }}</label>
            <input id="spot-fecha" v-model="spot.fecha" type="date" class="input" :required="!!spot.constancia" :disabled="!Number(spot.monto)" />
          </div>
        </div>
        <p class="text-xs text-slate-500">Mientras no tenga la constancia, déjela vacía: la compra figurará como pendiente de depósito en el registro de compras (SIRE).</p>
      </form>
      <template #pie>
        <button class="btn-secundario" @click="spot.abierto = false">Cancelar</button>
        <button class="btn-primario" form="form-spot" :disabled="spot.guardando">{{ spot.guardando ? 'Guardando…' : 'Guardar' }}</button>
      </template>
    </BaseModal>

    <BaseModal :abierto="anulacion.abierto" :titulo="`Anular ${d.serie}-${d.numero}`" @cerrar="anulacion.abierto = false">
      <form id="form-anular-doc" class="space-y-3" @submit.prevent="anular">
        <p class="text-sm text-slate-600">Se registrará en el kardex el movimiento inverso de {{ d.movimiento?.numero }}. El documento quedará anulado y no se podrá reactivar.</p>
        <div>
          <label class="etiqueta" for="mot">Motivo *</label>
          <textarea id="mot" v-model="anulacion.motivo" class="input py-2" rows="3" minlength="5" maxlength="500" required />
        </div>
      </form>
      <template #pie>
        <button class="btn-secundario" @click="anulacion.abierto = false">Volver</button>
        <button class="btn-peligro" form="form-anular-doc" :disabled="enviando">Anular</button>
      </template>
    </BaseModal>
  </div>
  <p v-else class="text-sm text-slate-500">Cargando…</p>
</template>
