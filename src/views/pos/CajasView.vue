<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { api, mensajeError } from '@/services/api';
import { useAuth } from '@/stores/auth';
import { useContexto } from '@/stores/contexto';
import { useToast } from '@/stores/toast';
import { useAlmacenes } from '@/composables/useAlmacenes';
import { useListado } from '@/composables/useListado';
import { useTiempoReal } from '@/composables/useTiempoReal';
import { fechaHora, soles } from '@/utils/formato';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import TablaResponsiva from '@/components/TablaResponsiva.vue';
import Paginacion from '@/components/Paginacion.vue';
import BaseModal from '@/components/BaseModal.vue';
import InsigniaEstado from '@/components/InsigniaEstado.vue';
import Icono from '@/components/Icono.vue';
import MenuAcciones from '@/components/MenuAcciones.vue';
import BotonColumnas from '@/components/BotonColumnas.vue';

const auth = useAuth();
const contexto = useContexto();
const toast = useToast();
const { almacenes, conPermiso } = useAlmacenes();

const cajas = ref([]);
const cargarCajas = async () => (cajas.value = (await api.get('/pos/cajas', { params: { empresaId: contexto.empresaActivaId } })).data);

// Historial de turnos (solo con permiso de supervisión)
const verTurnos = computed(() => auth.canEnEmpresa('pos.caja.ver', contexto.empresaActivaId));
const { filas: turnos, cargando, filtros, pag, cargar: cargarTurnos } = useListado('/pos/sesiones', { empresaId: contexto.empresaActivaId, estado: '' });
delete filtros.q;

onMounted(() => {
  cargarCajas();
  if (verTurnos.value) cargarTurnos();
});
useTiempoReal('pos:turno', () => {
  cargarCajas();
  if (verTurnos.value) cargarTurnos();
});

const almacenesConfigurables = computed(() => conPermiso('pos.caja.configurar'));
const vacio = () => ({ nombre: '', almacenId: almacenesConfigurables.value[0]?.id ?? '', serieFactura: 'F001', serieBoleta: 'B001', serieNotaVenta: 'NV01', serieNotaCreditoFactura: 'FC01', serieNotaCreditoBoleta: 'BC01', descuentoMaximo: '5', activo: true });
const modal = reactive({ abierto: false, id: null, form: vacio(), guardando: false });
function abrir(c) {
  modal.id = c?.id ?? null;
  modal.form = c ? { ...vacio(), ...Object.fromEntries(Object.keys(vacio()).map((k) => [k, c[k] ?? vacio()[k]])) } : vacio();
  modal.abierto = true;
}
async function guardar() {
  modal.guardando = true;
  try {
    const datos = { ...modal.form, descuentoMaximo: String(modal.form.descuentoMaximo === '' ? 0 : modal.form.descuentoMaximo) };
    modal.id ? await api.put(`/pos/cajas/${modal.id}`, datos) : await api.post('/pos/cajas', datos);
    toast.exito('Caja guardada');
    modal.abierto = false;
    cargarCajas();
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    modal.guardando = false;
  }
}

const SERIES = [
  ['serieBoleta', 'Boleta', 'B001'],
  ['serieFactura', 'Factura', 'F001'],
  ['serieNotaVenta', 'Nota de venta', 'NV01'],
  ['serieNotaCreditoBoleta', 'NC de boleta', 'BC01'],
  ['serieNotaCreditoFactura', 'NC de factura', 'FC01'],
];
const columnasTurnos = [
  { clave: 'caja.nombre', titulo: 'Caja' },
  { clave: 'usuario', titulo: 'Cajero' },
  { clave: 'abiertaEn', titulo: 'Apertura' },
  { clave: 'cerradaEn', titulo: 'Cierre' },
  { clave: 'diferencia', titulo: 'Diferencia', clase: 'text-right' },
];

/** Acciones de cada turno (menú ⋯) */
const accionesFila = (f) => [
  { texto: 'Ver ventas del turno', icono: 'comprobante', to: { path: '/comprobantes', query: { sesion: f.id } } },
  { separador: true },
  { texto: 'Imprimir cierre (A4)', icono: 'imprimir', to: `/imprimir/turno/${f.id}/a4`, nuevaPestana: true },
  { texto: 'Imprimir cierre (ticket)', icono: 'imprimir', to: `/imprimir/turno/${f.id}/ticket`, nuevaPestana: true },
];
</script>

<template>
  <EncabezadoPagina titulo="Cajas y turnos" :subtitulo="contexto.empresaActiva?.razonSocial">
    <button v-if="almacenesConfigurables.length" class="btn-primario" @click="abrir()"><Icono nombre="agregar" /> Nueva caja</button>
  </EncabezadoPagina>

  <div class="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <p v-if="!cajas.length" class="tarjeta p-6 text-sm text-slate-500 sm:col-span-2 lg:col-span-3">Esta empresa aún no tiene cajas. Cree una por cada punto de cobro.</p>
    <article v-for="c in cajas" :key="c.id" class="tarjeta p-4" :class="{ 'opacity-60': !c.activo }">
      <div class="flex items-start justify-between gap-2">
        <div>
          <h2 class="font-semibold">{{ c.nombre }}</h2>
          <p class="text-xs text-slate-500">{{ c.almacen.codigo }} — {{ c.almacen.nombre }} · {{ c.almacen.sede.nombre }}</p>
        </div>
        <InsigniaEstado :activo="c.activo" texto-si="Activa" texto-no="Inactiva" />
      </div>
      <p class="mt-1 text-xs text-slate-500">Descuento sin autorización: hasta {{ Number(c.descuentoMaximo) }} %</p>
      <p class="mt-3 font-mono text-xs text-slate-500">{{ c.serieBoleta }} · {{ c.serieFactura }} · {{ c.serieNotaVenta }} · {{ c.serieNotaCreditoBoleta }} · {{ c.serieNotaCreditoFactura }}</p>
      <p class="mt-2 text-sm">
        <span v-if="c.turno" class="insignia bg-emerald-50 text-emerald-700">Abierta</span>
        <span v-else class="insignia bg-slate-100 text-slate-600">Cerrada</span>
        <span v-if="c.turno" class="ml-1 text-xs text-slate-500">{{ c.turno.usuario }} desde {{ fechaHora(c.turno.abiertaEn) }}</span>
      </p>
      <div class="mt-3 flex flex-wrap gap-1 border-t border-slate-100 pt-3">
        <RouterLink v-if="c.acciones.vender" :to="{ path: '/pos', query: { caja: c.id } }" class="btn-texto"><Icono nombre="caja" clase="size-4" /> Ir a la caja</RouterLink>
        <button v-if="c.acciones.configurar" class="btn-texto" @click="abrir(c)"><Icono nombre="editar" clase="size-4" /> Configurar</button>
      </div>
    </article>
  </div>

  <template v-if="verTurnos">
    <div class="mb-3 flex items-center justify-between gap-2">
      <h2 class="font-semibold">Historial de turnos</h2>
      <div class="flex items-center gap-2">
      <BotonColumnas :columnas="columnasTurnos" />
      <select v-model="filtros.estado" class="input max-w-48">
        <option value="">Todos</option>
        <option value="ABIERTA">Abiertos</option>
        <option value="CERRADA">Cerrados</option>
      </select>
      </div>
    </div>
    <TablaResponsiva :columnas="columnasTurnos" :filas="turnos" :cargando="cargando" vacio="Sin turnos">
      <template #celda-abiertaEn="{ fila }"><span class="whitespace-nowrap">{{ fechaHora(fila.abiertaEn) }}</span></template>
      <template #celda-cerradaEn="{ fila }"><span class="whitespace-nowrap">{{ fila.cerradaEn ? fechaHora(fila.cerradaEn) : 'Abierto' }}</span></template>
      <template #celda-diferencia="{ fila }">
        <span v-if="fila.diferencia != null" class="tabular-nums" :class="Number(fila.diferencia) < 0 ? 'text-red-600' : Number(fila.diferencia) > 0 ? 'text-amber-700' : ''">{{ soles(fila.diferencia) }}</span>
        <span v-else>—</span>
      </template>
      <template #acciones="{ fila }"><MenuAcciones :acciones="accionesFila(fila)" :etiqueta="`Acciones del turno de ${fila.usuario}`" /></template>
    </TablaResponsiva>
    <Paginacion :pag="pag" />
  </template>

  <BaseModal :abierto="modal.abierto" :titulo="modal.id ? 'Configurar caja' : 'Nueva caja'" @cerrar="modal.abierto = false">
    <form id="form-caja" class="grid gap-4 sm:grid-cols-2" @submit.prevent="guardar">
      <div><label class="etiqueta">Nombre *</label><input v-model="modal.form.nombre" class="input" placeholder="Caja 1" required /></div>
      <div>
        <label class="etiqueta">Almacén del que descuenta *</label>
        <select v-model="modal.form.almacenId" class="input" :disabled="!!modal.id" required>
          <option v-for="a in modal.id ? almacenes : almacenesConfigurables" :key="a.id" :value="a.id">{{ a.codigo }} — {{ a.nombre }}</option>
        </select>
      </div>
      <p class="text-sm text-slate-600 sm:col-span-2">
        Series de comprobantes: las de factura y su nota de crédito empiezan con <b>F</b>; las de boleta y su nota de crédito, con <b>B</b>.
        Una serie con comprobantes emitidos ya no se puede cambiar.
      </p>
      <div v-for="[campo, etiqueta, ejemplo] in SERIES" :key="campo">
        <label class="etiqueta">{{ etiqueta }} *</label>
        <input v-model="modal.form[campo]" class="input font-mono uppercase" :placeholder="ejemplo" maxlength="4" required />
      </div>
      <div class="sm:col-span-2">
        <label class="etiqueta" for="caja-desc">Descuento máximo sin autorización (%)</label>
        <input id="caja-desc" v-model="modal.form.descuentoMaximo" type="number" inputmode="decimal" min="0" max="100" step="0.01" class="input sm:max-w-40" />
        <p class="mt-1 text-xs text-slate-500">Incluye bajar el precio de lista a mano. Por encima, la venta pide la clave de un supervisor (permiso "Autorizar descuentos").</p>
      </div>
      <label v-if="modal.id" class="flex min-h-11 items-center gap-2 text-sm"><input v-model="modal.form.activo" type="checkbox" class="size-5 accent-marca-700" /> Caja activa</label>
    </form>
    <template #pie>
      <button class="btn-secundario" @click="modal.abierto = false">Cancelar</button>
      <button class="btn-primario" form="form-caja" :disabled="modal.guardando">Guardar</button>
    </template>
  </BaseModal>
</template>
