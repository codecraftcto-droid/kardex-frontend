<script setup>
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

const confirmarDoc = () => {
  if (!confirm(`¿Confirmar ${cfg.value.articulo}? ${cfg.value.efecto}`)) return;
  accion(async () => {
    const { data } = await api.post(`${cfg.value.api}/${d.value.id}/confirmar`);
    toast.exito(`${cfg.value.singular} confirmada · kardex ${data.movimiento.numero}`);
  });
};
async function eliminar() {
  if (!confirm('¿Eliminar este borrador?')) return;
  try {
    await api.delete(`${cfg.value.api}/${d.value.id}`);
    toast.exito('Borrador eliminado');
    router.replace(cfg.value.ruta);
  } catch (e) {
    toast.error(mensajeError(e));
  }
}
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
