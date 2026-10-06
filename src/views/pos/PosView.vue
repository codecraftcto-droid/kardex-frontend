<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, mensajeError } from '@/services/api';
import { useContexto } from '@/stores/contexto';
import { useToast } from '@/stores/toast';
import { useTiempoReal } from '@/composables/useTiempoReal';
import { cant, fechaHora, soles } from '@/utils/formato';
import { MEDIOS_PAGO, TIPOS_COMPROBANTE, TIPOS_DOCUMENTO, UMBRAL_BOLETA, cuotasIguales, descuentoLinea, numeroCompleto, totales } from '@/utils/pos';
import BuscadorProducto from '@/components/BuscadorProducto.vue';
import BaseModal from '@/components/BaseModal.vue';
import FormCliente from '@/components/FormCliente.vue';
import Icono from '@/components/Icono.vue';

const route = useRoute();
const router = useRouter();
const contexto = useContexto();
const toast = useToast();

// ───────────── Caja y turno ─────────────
const cajas = ref([]);
const cajaId = ref(route.query.caja || leer('kardex:caja') || '');
const caja = computed(() => cajas.value.find((c) => c.id === cajaId.value) ?? null);
const turnoMio = computed(() => caja.value?.turno?.esMio);
const apertura = ref('');
const cargando = ref(true);

function leer(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function guardar(k, v) {
  try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ }
}

async function cargarCajas() {
  cargando.value = true;
  try {
    cajas.value = (await api.get('/pos/cajas', { params: { empresaId: contexto.empresaActivaId } })).data.filter((c) => c.acciones.vender && c.activo);
    if (!caja.value) cajaId.value = cajas.value.find((c) => c.turno?.esMio)?.id ?? cajas.value[0]?.id ?? '';
  } finally {
    cargando.value = false;
  }
}
cargarCajas();
watch(cajaId, (id) => {
  if (id) guardar('kardex:caja', id);
  router.replace({ query: { ...route.query, caja: id || undefined } });
  cargarStock();
});
useTiempoReal('pos:turno', cargarCajas);

async function abrirTurno() {
  try {
    await api.post(`/pos/cajas/${cajaId.value}/abrir`, { montoApertura: String(apertura.value || 0) });
    toast.exito('Caja abierta');
    apertura.value = '';
    await cargarCajas();
  } catch (e) {
    toast.error(mensajeError(e));
  }
}

// ───────────── Stock del almacén de la caja ─────────────
const stock = ref(new Map());
async function cargarStock() {
  if (!caja.value) return;
  try {
    const { data } = await api.get('/kardex/stock', { params: { empresaId: contexto.empresaActivaId, almacenId: caja.value.almacenId, porPagina: 200 } });
    stock.value = new Map(data.datos.map((s) => [s.productoId, Number(s.cantidad)]));
  } catch { /* sin permiso de ver stock: el backend valida igual */ }
}
watch(caja, (c, antes) => c && c.id !== antes?.id && cargarStock(), { immediate: true });
useTiempoReal('kardex:movimiento', (m) => m.almacenId === caja.value?.almacenId && cargarStock());

// ───────────── Venta en curso ─────────────
const tipo = ref(leer('kardex:pos-tipo') || 'BOLETA');
watch(tipo, (t) => guardar('kardex:pos-tipo', t));
const items = ref([]);
const cliente = ref(null); // null = Clientes varios
// Descuento sobre toda la venta (se prorratea entre las líneas)
const global = reactive({ abierto: false, tipo: 'PORCENTAJE', valor: '' });
const t = computed(() => totales(items.value, global.valor ? { tipo: global.tipo, valor: global.valor } : null));
const tope = computed(() => Number(caja.value?.descuentoMaximo ?? 100));
const sobreTope = computed(() => t.value.rebaja > tope.value + 0.001);
const disponible = (id) => stock.value.get(id);

function agregar(p) {
  const existente = items.value.find((i) => i.producto.id === p.id);
  if (existente) existente.cantidad = String(Number(existente.cantidad) + 1);
  else items.value.unshift({ producto: p, cantidad: '1', precio: p.precioReferencial != null ? String(Number(p.precioReferencial)) : '', descuento: '', tipoDescuento: 'S/' });
}
const cambiar = (it, d) => (it.cantidad = String(Math.max(1, Number(it.cantidad || 0) + d)));
const quitar = (i) => items.value.splice(i, 1);
const excede = (it) => disponible(it.producto.id) !== undefined && Number(it.cantidad) > disponible(it.producto.id);
const sinPrecio = (it) => it.precio === '' || Number(it.precio) < 0;
const descuentoExcede = (it) => descuentoLinea(it) > Number(it.cantidad || 0) * Number(it.precio || 0) + 0.001 || (it.tipoDescuento === '%' && Number(it.descuento) > 100);
const alternarDescuento = (it) => ((it.tipoDescuento = it.tipoDescuento === '%' ? 'S/' : '%'), (it.descuento = ''));

const avisoCliente = computed(() => {
  if (tipo.value === 'FACTURA' && cliente.value?.tipoDocumento !== 'RUC' && !cliente.value?.rucAsociado) return 'La factura exige un cliente con RUC (o con RUC asociado)';
  if (tipo.value === 'BOLETA' && !cliente.value && t.value.total >= UMBRAL_BOLETA) return `Boleta desde S/ ${UMBRAL_BOLETA}: identifique al comprador`;
  return '';
});
const puedeCobrar = computed(() => items.value.length && t.value.total > 0 && !avisoCliente.value && !items.value.some((i) => excede(i) || sinPrecio(i) || descuentoExcede(i)));

// Búsqueda de clientes
const busquedaCliente = ref('');
const resultadosCliente = ref([]);
let tm;
watch(busquedaCliente, (q) => {
  clearTimeout(tm);
  if (q.trim().length < 2) return (resultadosCliente.value = []);
  tm = setTimeout(async () => {
    resultadosCliente.value = (await api.get('/clientes', { params: { empresaId: contexto.empresaActivaId, q: q.trim(), porPagina: 6 } })).data.datos.filter((c) => c.activo);
  }, 250);
});
function elegirCliente(c) {
  cliente.value = c;
  busquedaCliente.value = '';
  resultadosCliente.value = [];
  if ((c.tipoDocumento === 'RUC' || c.rucAsociado) && tipo.value === 'BOLETA') toast.info('Cliente con RUC: si necesita crédito fiscal, emita factura');
}
const nuevoCliente = reactive({ abierto: false, inicial: {} });
function abrirNuevoCliente() {
  const q = busquedaCliente.value.trim();
  const doc = /^\d{11}$/.test(q) ? { tipoDocumento: 'RUC', numeroDocumento: q } : /^\d{8}$/.test(q) ? { tipoDocumento: 'DNI', numeroDocumento: q } : { nombre: q };
  Object.assign(nuevoCliente, { abierto: true, inicial: doc });
}
function clienteCreado(c) {
  nuevoCliente.abierto = false;
  elegirCliente(c);
}

function nuevaVenta() {
  items.value = [];
  cliente.value = null;
  Object.assign(global, { abierto: false, tipo: 'PORCENTAJE', valor: '' });
  autorizaciones.value = [];
  cobro.abierto = false;
  listo.value = null;
}

// ───────────── Cobro ─────────────
const impresion = ref(leer('kardex:pos-impresion') || 'ticket');
watch(impresion, (v) => guardar('kardex:pos-impresion', v));
const cobro = reactive({ abierto: false, forma: 'CONTADO', pagos: [], enviando: false, credito: null, nCuotas: 1, cuotas: [] });
const esCredito = computed(() => cobro.forma === 'CREDITO');
const pagado = computed(() => cobro.pagos.reduce((s, p) => s + Number(p.monto || 0), 0));
const noEfectivo = computed(() => cobro.pagos.filter((p) => p.medio !== 'EFECTIVO').reduce((s, p) => s + Number(p.monto || 0), 0));
const falta = computed(() => Math.max(0, Math.round((t.value.total - pagado.value) * 100) / 100));
const vuelto = computed(() => (esCredito.value || noEfectivo.value > t.value.total ? 0 : Math.max(0, Math.round((pagado.value - t.value.total) * 100) / 100)));
const financiado = computed(() => Math.round((t.value.total - pagado.value) * 100) / 100);
const sumaCuotas = computed(() => Math.round(cobro.cuotas.reduce((s, c) => s + Number(c.monto || 0), 0) * 100) / 100);
const errorCobro = computed(() => {
  if (esCredito.value) {
    if (!cliente.value) return 'Elija un cliente registrado para venderle al crédito';
    if (!cliente.value.creditoHabilitado) return `${cliente.value.nombre} no tiene crédito habilitado`;
    if (financiado.value <= 0) return 'El pago inicial cubre todo: registre la venta al contado';
    if (sumaCuotas.value !== financiado.value) return `Las cuotas suman ${soles(sumaCuotas.value)} y deben sumar ${soles(financiado.value)}`;
    return '';
  }
  if (noEfectivo.value > t.value.total + 0.001) return 'Tarjeta, Yape, Plin y transferencia no pueden superar el total';
  if (falta.value > 0) return `Falta cobrar ${soles(falta.value)}`;
  return '';
});
const RAPIDOS = [10, 20, 50, 100, 200];

function abrirCobro() {
  if (!puedeCobrar.value) return;
  Object.assign(cobro, { abierto: true, forma: 'CONTADO', credito: null, pagos: [{ medio: 'EFECTIVO', monto: String(t.value.total.toFixed(2)), referencia: '' }] });
}
async function cambiarForma(forma) {
  cobro.forma = forma;
  if (forma === 'CONTADO') {
    cobro.pagos = [{ medio: 'EFECTIVO', monto: String(t.value.total.toFixed(2)), referencia: '' }];
    return;
  }
  // Crédito: sin inicial por defecto; cuotas según el plazo del cliente
  cobro.pagos = [];
  cobro.nCuotas = 1;
  regenerarCuotas();
  if (cliente.value) {
    try {
      cobro.credito = (await api.get(`/cxc/clientes/${cliente.value.id}/credito`)).data;
      regenerarCuotas();
    } catch { cobro.credito = null; }
  }
}
function regenerarCuotas() {
  cobro.cuotas = financiado.value > 0 ? cuotasIguales(financiado.value, cobro.nCuotas, cobro.credito?.diasCredito ?? cliente.value?.diasCredito ?? 30) : [];
}
watch(() => [cobro.nCuotas, financiado.value], () => esCredito.value && regenerarCuotas());
function agregarMedio(medio) {
  // Si solo está el efectivo sugerido por el total (sin tocar), elegir otro medio lo reemplaza
  const [unico] = cobro.pagos;
  if (!esCredito.value && cobro.pagos.length === 1 && unico.medio === 'EFECTIVO' && Number(unico.monto) === t.value.total && medio !== 'EFECTIVO') {
    cobro.pagos = [{ medio, monto: t.value.total.toFixed(2), referencia: '' }];
    return;
  }
  const restante = esCredito.value ? 0 : Math.max(0, t.value.total - pagado.value);
  cobro.pagos.push({ medio, monto: restante ? restante.toFixed(2) : '', referencia: '' });
}

// ───────────── Autorización de supervisor ─────────────
const autorizaciones = ref([]);
const autorizacion = reactive({ abierto: false, tipo: '', mensaje: '', email: '', password: '', enviando: false });
async function autorizar() {
  autorizacion.enviando = true;
  // La ventana de impresión se abre en este clic (gesto del usuario)
  const ventana = impresion.value !== 'no' ? window.open('', '_blank') : null;
  try {
    const { data } = await api.post('/pos/autorizaciones', { cajaId: cajaId.value, tipo: autorizacion.tipo, email: autorizacion.email, password: autorizacion.password });
    autorizaciones.value.push(data.token);
    toast.exito(`Autorizado por ${data.supervisor}`);
    Object.assign(autorizacion, { abierto: false, password: '' });
    await emitir(ventana);
  } catch (e) {
    ventana?.close();
    autorizacion.password = '';
    toast.error(mensajeError(e));
  } finally {
    autorizacion.enviando = false;
  }
}

const listo = ref(null);
async function emitir(ventanaPrevia) {
  if (errorCobro.value) return;
  cobro.enviando = true;
  // La ventana de impresión se abre YA (gesto del usuario) para que el navegador no la bloquee
  const ventana = ventanaPrevia instanceof Window ? ventanaPrevia : impresion.value !== 'no' ? window.open('', '_blank') : null;
  try {
    const { data } = await api.post('/pos/ventas', {
      cajaId: cajaId.value,
      tipo: tipo.value,
      clienteId: cliente.value?.id ?? null,
      items: items.value.map((i) => ({
        productoId: i.producto.id, cantidad: String(i.cantidad), precioUnitario: String(i.precio),
        ...(Number(i.descuento) > 0 && (i.tipoDescuento === '%' ? { descuentoPorcentaje: String(i.descuento) } : { descuento: String(i.descuento) })),
      })),
      ...(Number(global.valor) > 0 && { descuentoGlobal: { tipo: global.tipo, valor: String(global.valor) } }),
      formaPago: cobro.forma,
      ...(esCredito.value && { cuotas: cobro.cuotas.map((c) => ({ monto: String(Number(c.monto).toFixed(2)), fechaVencimiento: c.fechaVencimiento })) }),
      pagos: cobro.pagos.filter((p) => Number(p.monto) > 0).map((p) => ({ medio: p.medio, monto: String(Number(p.monto).toFixed(2)), referencia: p.referencia || undefined })),
      ...(autorizaciones.value.length && { autorizaciones: autorizaciones.value }),
    });
    listo.value = { ...data, nCuotas: esCredito.value ? cobro.cuotas.length : 0 };
    cobro.abierto = false;
    autorizaciones.value = [];
    if (ventana) ventana.location.href = router.resolve(`/imprimir/comprobante/${data.id}/${impresion.value}`).href;
  } catch (e) {
    ventana?.close();
    const d = e?.response?.data?.detalles;
    if (d?.codigo === 'AUTORIZACION_REQUERIDA') {
      Object.assign(autorizacion, { abierto: true, tipo: d.tipo, mensaje: e.response.data.error, email: '', password: '' });
    } else {
      toast.error(mensajeError(e));
    }
  } finally {
    cobro.enviando = false;
  }
}
const imprimir = (formato) => window.open(router.resolve(`/imprimir/comprobante/${listo.value.id}/${formato}`).href, '_blank');

// ───────────── Cierre de caja ─────────────
const cierre = reactive({ abierto: false, datos: null, declarado: '', observacion: '', enviando: false });
async function abrirCierre() {
  try {
    cierre.datos = (await api.get(`/pos/sesiones/${caja.value.turno.id}`)).data;
    Object.assign(cierre, { abierto: true, declarado: '', observacion: '' });
  } catch (e) {
    toast.error(mensajeError(e));
  }
}
const diferencia = computed(() => (cierre.declarado === '' ? null : Math.round((Number(cierre.declarado) - Number(cierre.datos?.efectivoEsperado ?? 0)) * 100) / 100));
async function cerrarCaja() {
  cierre.enviando = true;
  const id = caja.value.turno.id;
  try {
    await api.post(`/pos/sesiones/${id}/cerrar`, { efectivoDeclarado: String(cierre.declarado || 0), observacion: cierre.observacion || undefined });
    cierre.abierto = false;
    toast.exito('Caja cerrada');
    window.open(router.resolve(`/imprimir/turno/${id}/${impresion.value === 'a4' ? 'a4' : 'ticket'}`).href, '_blank');
    nuevaVenta();
    await cargarCajas();
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    cierre.enviando = false;
  }
}
</script>

<template>
  <!-- Selección de caja -->
  <div class="mb-4 flex flex-wrap items-center gap-2">
    <h1 class="mr-auto text-xl font-semibold text-slate-900 sm:text-2xl">Caja</h1>
    <select v-if="cajas.length > 1" v-model="cajaId" class="input w-auto" aria-label="Caja">
      <option v-for="c in cajas" :key="c.id" :value="c.id">{{ c.nombre }} · {{ c.almacen.nombre }}</option>
    </select>
    <template v-if="turnoMio">
      <select v-model="impresion" class="input w-auto" aria-label="Impresión al emitir" title="Impresión automática al emitir">
        <option value="ticket">Ticket</option>
        <option value="a4">A4</option>
        <option value="no">Sin imprimir</option>
      </select>
      <RouterLink :to="{ path: '/comprobantes', query: { sesion: caja.turno.id } }" class="btn-secundario">Ventas del turno</RouterLink>
      <button class="btn-secundario text-red-600" @click="abrirCierre">Cerrar caja</button>
    </template>
  </div>

  <p v-if="cargando" class="text-sm text-slate-500">Cargando…</p>
  <p v-else-if="!cajas.length" class="tarjeta p-6 text-sm text-slate-500">
    No tiene cajas asignadas en esta empresa. Un administrador debe crear la caja (Cajas y turnos) y darle el rol Cajero en ese almacén.
  </p>

  <!-- Caja cerrada: abrir turno -->
  <section v-else-if="!caja.turno" class="tarjeta mx-auto max-w-md p-6 text-center">
    <Icono nombre="caja" clase="mx-auto size-10 text-marca-700" />
    <h2 class="mt-2 text-lg font-semibold">{{ caja.nombre }} está cerrada</h2>
    <p class="mb-4 text-sm text-slate-500">Indique el efectivo con el que inicia el turno (sencillo).</p>
    <form class="flex gap-2" @submit.prevent="abrirTurno">
      <input v-model="apertura" type="number" inputmode="decimal" min="0" step="0.01" class="input min-h-12 text-lg" placeholder="0.00" aria-label="Monto de apertura" />
      <button class="btn-primario min-h-12 px-6">Abrir caja</button>
    </form>
  </section>

  <p v-else-if="!turnoMio" class="tarjeta p-6 text-sm">
    <strong>{{ caja.nombre }}</strong> está en uso por {{ caja.turno.usuario }} desde {{ fechaHora(caja.turno.abiertaEn) }}.
    Elija otra caja o pida que cierre su turno.
  </p>

  <!-- Punto de venta -->
  <div v-else class="grid gap-4 pb-24 lg:grid-cols-[1fr_26rem] lg:pb-0">
    <!-- Productos -->
    <section class="min-w-0 space-y-3">
      <BuscadorProducto :empresa-id="contexto.empresaActivaId" escaneo-continuo placeholder="Buscar, escanear o escribir código…" @seleccionar="agregar" />
      <p v-if="!items.length" class="tarjeta border-dashed p-8 text-center text-sm text-slate-500">
        Escanee o busque productos para empezar la venta. Con un lector de código de barras, solo escanee.
      </p>
      <ul class="space-y-2">
        <li v-for="(it, i) in items" :key="it.producto.id" class="tarjeta p-3" :class="{ 'border-red-300': excede(it) || sinPrecio(it) }">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="truncate font-medium">{{ it.producto.nombre }}</p>
              <p class="text-xs text-slate-500">
                <span class="font-mono">{{ it.producto.sku }}</span>
                <template v-if="disponible(it.producto.id) !== undefined"> · Stock {{ cant(disponible(it.producto.id)) }}</template>
                <template v-if="it.producto.afectacionIgv === '20'"> · Exonerado</template>
              </p>
            </div>
            <button class="btn shrink-0 px-2 text-red-600 hover:bg-red-50" aria-label="Quitar" @click="quitar(i)"><Icono nombre="eliminar" clase="size-5" /></button>
          </div>
          <div class="mt-2 grid grid-cols-[auto_1fr_1fr] items-end gap-2 sm:grid-cols-[auto_8rem_8rem_1fr]">
            <div class="flex items-center">
              <button class="btn-secundario size-11 px-0 text-lg" aria-label="Menos" @click="cambiar(it, -1)">−</button>
              <input v-model="it.cantidad" type="number" inputmode="decimal" min="0.0001" step="any" class="input mx-1 w-16 text-center" aria-label="Cantidad" />
              <button class="btn-secundario size-11 px-0 text-lg" aria-label="Más" @click="cambiar(it, 1)">+</button>
            </div>
            <label class="text-xs text-slate-500">Precio (con IGV)<input v-model="it.precio" type="number" inputmode="decimal" min="0" step="0.01" class="input mt-1" /></label>
            <div class="text-xs text-slate-500">
              <span class="flex items-center justify-between">Descuento
                <button type="button" class="rounded px-1.5 font-semibold text-marca-700 hover:bg-marca-50" :aria-label="`Descuento en ${it.tipoDescuento === '%' ? 'porcentaje' : 'soles'}; cambiar`" @click="alternarDescuento(it)">{{ it.tipoDescuento }}</button>
              </span>
              <input v-model="it.descuento" type="number" inputmode="decimal" min="0" :max="it.tipoDescuento === '%' ? 100 : undefined" step="0.01" class="input mt-1" :placeholder="it.tipoDescuento === '%' ? '0 %' : '0.00'" :aria-label="`Descuento ${it.tipoDescuento}`" />
            </div>
            <p class="col-span-3 text-right font-semibold tabular-nums sm:col-span-1">{{ soles(it.importe ?? 0) }}</p>
          </div>
          <p v-if="excede(it)" class="mt-1 text-xs text-red-600">Supera el stock disponible.</p>
          <p v-if="sinPrecio(it)" class="mt-1 text-xs text-red-600">Indique el precio de venta.</p>
          <p v-if="descuentoExcede(it)" class="mt-1 text-xs text-red-600">El descuento supera el importe.</p>
        </li>
      </ul>
    </section>

    <!-- Ticket -->
    <aside class="space-y-3 lg:sticky lg:top-20 lg:self-start">
      <div class="tarjeta p-4">
        <div class="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1" role="radiogroup" aria-label="Tipo de comprobante">
          <button v-for="k in ['BOLETA', 'FACTURA', 'NOTA_VENTA']" :key="k" role="radio" :aria-checked="tipo === k" class="min-h-10 rounded-md text-sm font-medium" :class="tipo === k ? 'bg-white shadow-sm' : 'text-slate-600'" @click="tipo = k">
            {{ TIPOS_COMPROBANTE[k].texto }}
          </button>
        </div>

        <div class="mt-3">
          <p class="etiqueta">Cliente</p>
          <div v-if="cliente" class="flex items-center justify-between gap-2 rounded-lg border border-marca-600 bg-marca-50 px-3 py-2 text-sm">
            <span class="min-w-0"><span class="block truncate font-medium">{{ cliente.nombre }}</span><span class="text-xs text-slate-500">{{ TIPOS_DOCUMENTO[cliente.tipoDocumento] }} {{ cliente.numeroDocumento }}<template v-if="cliente.rucAsociado"> · RUC {{ cliente.rucAsociado }}</template></span>
              <span v-if="cliente.creditoHabilitado" class="insignia mt-0.5 bg-sky-50 text-sky-700">Con crédito</span></span>
            <button class="btn px-2 text-slate-500" aria-label="Quitar cliente" @click="cliente = null"><Icono nombre="cerrar" clase="size-4" /></button>
          </div>
          <div v-else class="relative">
            <div class="flex gap-2">
              <input v-model="busquedaCliente" class="input" placeholder="Clientes varios · buscar DNI, RUC o nombre" />
              <button class="btn-secundario shrink-0 px-3" title="Nuevo cliente" aria-label="Nuevo cliente" @click="abrirNuevoCliente"><Icono nombre="agregar" clase="size-5" /></button>
            </div>
            <ul v-if="resultadosCliente.length" class="tarjeta absolute inset-x-0 z-20 mt-1 py-1 shadow-lg">
              <li v-for="c in resultadosCliente" :key="c.id">
                <button class="flex min-h-11 w-full flex-col items-start px-3 py-1 text-left text-sm hover:bg-slate-50" @click="elegirCliente(c)">
                  <span class="font-medium">{{ c.nombre }}</span><span class="text-xs text-slate-500">{{ TIPOS_DOCUMENTO[c.tipoDocumento] }} {{ c.numeroDocumento }}<template v-if="c.rucAsociado"> · RUC {{ c.rucAsociado }}</template><template v-if="c.creditoHabilitado"> · con crédito</template></span>
                </button>
              </li>
            </ul>
          </div>
          <p v-if="avisoCliente" class="mt-1 text-xs text-amber-700">{{ avisoCliente }}</p>
        </div>

        <div class="mt-3">
          <button v-if="!global.abierto" class="btn-texto px-0 text-sm" :disabled="!items.length" @click="global.abierto = true"><Icono nombre="agregar" clase="size-4" /> Descuento a toda la venta</button>
          <div v-else class="flex items-end gap-2">
            <label class="min-w-0 flex-1 text-xs text-slate-500">Descuento global
              <input v-model="global.valor" type="number" inputmode="decimal" min="0" step="0.01" class="input mt-1" :placeholder="global.tipo === 'PORCENTAJE' ? '0 %' : '0.00'" />
            </label>
            <div class="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1" role="radiogroup" aria-label="Tipo de descuento global">
              <button v-for="[k, txt] in [['PORCENTAJE', '%'], ['MONTO', 'S/']]" :key="k" role="radio" :aria-checked="global.tipo === k" class="min-h-9 min-w-9 rounded-md text-sm font-medium" :class="global.tipo === k ? 'bg-white shadow-sm' : 'text-slate-600'" @click="global.tipo = k">{{ txt }}</button>
            </div>
            <button class="btn px-2 text-slate-500" aria-label="Quitar descuento global" @click="Object.assign(global, { abierto: false, valor: '' })"><Icono nombre="cerrar" clase="size-4" /></button>
          </div>
        </div>
        <p v-if="sobreTope && !caja.acciones.autorizaDescuento" class="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Rebaja de {{ t.rebaja.toFixed(2) }} %: supera el tope de la caja ({{ tope }} %). Al emitir se pedirá la autorización de un supervisor.
        </p>

        <dl class="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm">
          <div class="flex justify-between"><dt class="text-slate-500">Op. gravada</dt><dd class="tabular-nums">{{ soles(t.gravada) }}</dd></div>
          <div v-if="t.exonerada" class="flex justify-between"><dt class="text-slate-500">Op. exonerada</dt><dd class="tabular-nums">{{ soles(t.exonerada) }}</dd></div>
          <div v-if="t.inafecta" class="flex justify-between"><dt class="text-slate-500">Op. inafecta</dt><dd class="tabular-nums">{{ soles(t.inafecta) }}</dd></div>
          <div class="flex justify-between"><dt class="text-slate-500">IGV 18%</dt><dd class="tabular-nums">{{ soles(t.igv) }}</dd></div>
          <div v-if="t.descuento" class="flex justify-between"><dt class="text-slate-500">Descuentos</dt><dd class="tabular-nums">−{{ soles(t.descuento) }}</dd></div>
          <div class="flex justify-between pt-1 text-xl font-semibold"><dt>Total</dt><dd class="tabular-nums">{{ soles(t.total) }}</dd></div>
        </dl>
        <button class="btn-primario mt-4 hidden min-h-14 w-full text-lg lg:flex" :disabled="!puedeCobrar" @click="abrirCobro">Cobrar {{ soles(t.total) }}</button>
        <button v-if="items.length" class="btn-texto mt-1 w-full text-slate-500" @click="nuevaVenta">Vaciar venta</button>
      </div>
    </aside>

    <!-- Móvil: barra de cobro fija -->
    <div class="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 border-t border-slate-200 bg-white/95 p-3 backdrop-blur lg:hidden">
      <button class="btn-primario min-h-14 w-full text-lg" :disabled="!puedeCobrar" @click="abrirCobro">Cobrar {{ soles(t.total) }} · {{ items.length }} ítem(s)</button>
    </div>
  </div>

  <!-- Cobro -->
  <BaseModal :abierto="cobro.abierto" :titulo="`Cobrar ${soles(t.total)}`" @cerrar="cobro.abierto = false">
    <div class="space-y-4">
      <div v-if="caja?.acciones.credito" class="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1" role="radiogroup" aria-label="Forma de pago">
        <button v-for="f in ['CONTADO', 'CREDITO']" :key="f" role="radio" :aria-checked="cobro.forma === f" class="min-h-10 rounded-md text-sm font-medium" :class="cobro.forma === f ? 'bg-white shadow-sm' : 'text-slate-600'" @click="cambiarForma(f)">
          {{ f === 'CONTADO' ? 'Contado' : 'Crédito' }}
        </button>
      </div>
      <template v-if="esCredito">
        <dl v-if="cobro.credito" class="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-sky-50 p-3 text-sm sm:grid-cols-4">
          <div><dt class="text-xs text-slate-500">Deuda actual</dt><dd class="tabular-nums">{{ soles(cobro.credito.deuda) }}</dd></div>
          <div><dt class="text-xs text-slate-500">Límite</dt><dd class="tabular-nums">{{ cobro.credito.limiteCredito != null ? soles(cobro.credito.limiteCredito) : 'Sin tope' }}</dd></div>
          <div><dt class="text-xs text-slate-500">Disponible</dt><dd class="tabular-nums" :class="cobro.credito.disponible != null && Number(cobro.credito.disponible) < financiado ? 'font-semibold text-red-600' : ''">{{ cobro.credito.disponible != null ? soles(cobro.credito.disponible) : '—' }}</dd></div>
          <div><dt class="text-xs text-slate-500">Vencido</dt><dd class="tabular-nums" :class="Number(cobro.credito.vencido) > 0 ? 'font-semibold text-red-600' : ''">{{ soles(cobro.credito.vencido) }}</dd></div>
        </dl>
        <p class="text-sm text-slate-600">Pago inicial (opcional): agregue un medio de pago si el cliente deja algo a cuenta.</p>
      </template>
      <div v-for="(p, i) in cobro.pagos" :key="i" class="rounded-lg border border-slate-200 p-3">
        <div class="mb-2 flex items-center justify-between">
          <span class="font-medium">{{ MEDIOS_PAGO[p.medio] }}</span>
          <button v-if="cobro.pagos.length > 1 || esCredito" class="text-xs text-red-600" @click="cobro.pagos.splice(i, 1)">Quitar</button>
        </div>
        <input v-model="p.monto" type="number" inputmode="decimal" min="0" step="0.01" class="input min-h-12 text-xl tabular-nums" :aria-label="`Monto ${MEDIOS_PAGO[p.medio]}`" />
        <div v-if="p.medio === 'EFECTIVO' && !esCredito" class="mt-2 flex flex-wrap gap-1">
          <button class="btn-secundario min-h-9 px-3 text-xs" @click="p.monto = (Number(p.monto || 0) + falta).toFixed(2)">Exacto</button>
          <button v-for="b in RAPIDOS" :key="b" class="btn-secundario min-h-9 px-3 text-xs" @click="p.monto = String(b)">S/ {{ b }}</button>
        </div>
        <input v-else v-model="p.referencia" class="input mt-2" placeholder="Nº de operación (opcional)" maxlength="60" />
      </div>
      <div class="flex flex-wrap gap-1">
        <span class="mr-1 self-center text-sm text-slate-500">Agregar:</span>
        <button v-for="(n, m) in MEDIOS_PAGO" :key="m" class="btn-secundario min-h-9 px-3 text-xs" @click="agregarMedio(m)">{{ n }}</button>
      </div>
      <div v-if="esCredito && financiado > 0" class="space-y-2 rounded-lg border border-slate-200 p-3">
        <div class="flex items-center justify-between gap-2">
          <span class="font-medium">Cuotas</span>
          <label class="flex items-center gap-2 text-sm text-slate-600">N.º
            <select v-model.number="cobro.nCuotas" class="input w-20"><option v-for="n in 12" :key="n" :value="n">{{ n }}</option></select>
          </label>
        </div>
        <div v-for="(c, i) in cobro.cuotas" :key="i" class="grid grid-cols-[2rem_1fr_1fr] items-center gap-2">
          <span class="text-sm text-slate-500">{{ i + 1 }}</span>
          <input v-model="c.monto" type="number" inputmode="decimal" min="0.01" step="0.01" class="input tabular-nums" :aria-label="`Monto cuota ${i + 1}`" />
          <input v-model="c.fechaVencimiento" type="date" class="input" :aria-label="`Vencimiento cuota ${i + 1}`" />
        </div>
      </div>
      <dl class="rounded-lg bg-slate-50 p-3 text-sm">
        <div class="flex justify-between"><dt>Total</dt><dd class="tabular-nums">{{ soles(t.total) }}</dd></div>
        <div v-if="esCredito" class="flex justify-between"><dt>Inicial</dt><dd class="tabular-nums">{{ soles(pagado) }}</dd></div>
        <div v-if="esCredito" class="flex justify-between text-lg font-semibold text-sky-700"><dt>Al crédito</dt><dd class="tabular-nums">{{ soles(financiado) }}</dd></div>
        <template v-if="!esCredito">
        <div class="flex justify-between"><dt>Recibido</dt><dd class="tabular-nums">{{ soles(pagado) }}</dd></div>
        <div class="flex justify-between text-lg font-semibold" :class="vuelto ? 'text-emerald-700' : ''"><dt>Vuelto</dt><dd class="tabular-nums">{{ soles(vuelto) }}</dd></div>
        </template>
      </dl>
      <p v-if="errorCobro" class="text-sm text-red-600">{{ errorCobro }}</p>
    </div>
    <template #pie>
      <button class="btn-secundario" @click="cobro.abierto = false">Volver</button>
      <button class="btn-primario min-h-12 px-6" :disabled="!!errorCobro || cobro.enviando" @click="emitir">
        {{ cobro.enviando ? 'Emitiendo…' : `Emitir ${TIPOS_COMPROBANTE[tipo].texto.toLowerCase()}` }}
      </button>
    </template>
  </BaseModal>

  <!-- Venta registrada -->
  <BaseModal :abierto="!!listo" titulo="Venta registrada" @cerrar="nuevaVenta">
    <div v-if="listo" class="space-y-3 text-center">
      <Icono nombre="check" clase="mx-auto size-12 text-emerald-600" />
      <p class="font-mono text-lg">{{ numeroCompleto(listo) }}</p>
      <p class="text-3xl font-semibold">{{ soles(listo.total) }}</p>
      <p v-if="Number(listo.vuelto)" class="rounded-lg bg-emerald-50 p-3 text-2xl font-semibold text-emerald-700">Vuelto: {{ soles(listo.vuelto) }}</p>
      <p v-if="listo.formaPago === 'CREDITO'" class="rounded-lg bg-sky-50 p-3 font-semibold text-sky-700">Al crédito: {{ soles(listo.montoCredito) }} en {{ listo.nCuotas }} cuota(s)</p>
      <div class="flex justify-center gap-2">
        <button class="btn-secundario" @click="imprimir('ticket')"><Icono nombre="imprimir" clase="size-4" /> Ticket</button>
        <button class="btn-secundario" @click="imprimir('a4')"><Icono nombre="imprimir" clase="size-4" /> A4</button>
      </div>
    </div>
    <template #pie>
      <button class="btn-primario min-h-12 w-full sm:w-auto" autofocus @click="nuevaVenta">Nueva venta</button>
    </template>
  </BaseModal>

  <!-- Cierre de caja -->
  <BaseModal :abierto="cierre.abierto" titulo="Cerrar caja (arqueo)" @cerrar="cierre.abierto = false">
    <div v-if="cierre.datos" class="space-y-4 text-sm">
      <p class="text-slate-600">{{ caja?.nombre }} · abierta {{ fechaHora(cierre.datos.abiertaEn) }} por {{ cierre.datos.usuario }}</p>
      <dl class="rounded-lg bg-slate-50 p-3">
        <div class="flex justify-between"><dt>Apertura (efectivo inicial)</dt><dd class="tabular-nums">{{ soles(cierre.datos.montoApertura) }}</dd></div>
        <div v-for="(monto, medio) in cierre.datos.resumen.porMedio" :key="medio" class="flex justify-between"><dt>{{ MEDIOS_PAGO[medio] }}</dt><dd class="tabular-nums">{{ soles(monto) }}</dd></div>
        <div class="flex justify-between border-t border-slate-200 pt-1 font-semibold"><dt>Efectivo esperado en caja</dt><dd class="tabular-nums">{{ soles(cierre.datos.efectivoEsperado) }}</dd></div>
        <div class="flex justify-between text-slate-500"><dt>Ventas netas del turno</dt><dd class="tabular-nums">{{ soles(cierre.datos.resumen.ventasNetas) }}</dd></div>
        <div v-if="Number(cierre.datos.resumen.ventasCredito)" class="flex justify-between text-slate-500"><dt>De ellas, al crédito (no entró dinero)</dt><dd class="tabular-nums">{{ soles(cierre.datos.resumen.ventasCredito) }}</dd></div>
        <div v-if="cierre.datos.resumen.cobranzas?.cantidad" class="flex justify-between text-slate-500"><dt>Cobranzas de créditos ({{ cierre.datos.resumen.cobranzas.cantidad }}), incluidas arriba</dt><dd class="tabular-nums">{{ soles(cierre.datos.resumen.cobranzas.total) }}</dd></div>
        <div v-if="cierre.datos.resumen.anulados" class="flex justify-between text-slate-500"><dt>Comprobantes anulados</dt><dd>{{ cierre.datos.resumen.anulados }}</dd></div>
      </dl>
      <div>
        <label class="etiqueta" for="declarado">Efectivo contado en caja *</label>
        <input id="declarado" v-model="cierre.declarado" type="number" inputmode="decimal" min="0" step="0.01" class="input min-h-12 text-xl" required />
        <p v-if="diferencia !== null" class="mt-1 font-medium" :class="diferencia < 0 ? 'text-red-600' : diferencia > 0 ? 'text-amber-700' : 'text-emerald-700'">
          {{ diferencia === 0 ? 'Cuadra exacto' : diferencia < 0 ? `Faltante: ${soles(-diferencia)}` : `Sobrante: ${soles(diferencia)}` }}
        </p>
      </div>
      <div><label class="etiqueta" for="obs-cierre">Observación</label><input id="obs-cierre" v-model="cierre.observacion" class="input" maxlength="500" /></div>
    </div>
    <template #pie>
      <button class="btn-secundario" @click="cierre.abierto = false">Volver</button>
      <button class="btn-peligro" :disabled="cierre.declarado === '' || cierre.enviando" @click="cerrarCaja">Cerrar caja e imprimir</button>
    </template>
  </BaseModal>

  <!-- Autorización de supervisor -->
  <BaseModal :abierto="autorizacion.abierto" titulo="Autorización de supervisor" @cerrar="autorizacion.abierto = false">
    <form id="form-autorizacion" class="space-y-3" @submit.prevent="autorizar">
      <p class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{{ autorizacion.mensaje }}</p>
      <p class="text-sm text-slate-600">Un supervisor ingresa aquí su correo y contraseña. La autorización vale solo para esta venta.</p>
      <div><label class="etiqueta" for="aut-email">Correo del supervisor</label><input id="aut-email" v-model="autorizacion.email" type="email" class="input" autocomplete="off" required /></div>
      <div><label class="etiqueta" for="aut-pass">Contraseña</label><input id="aut-pass" v-model="autorizacion.password" type="password" class="input" autocomplete="off" required /></div>
    </form>
    <template #pie>
      <button class="btn-secundario" @click="autorizacion.abierto = false">Cancelar</button>
      <button class="btn-primario" form="form-autorizacion" :disabled="autorizacion.enviando">Autorizar y emitir</button>
    </template>
  </BaseModal>

  <FormCliente
    v-if="contexto.empresaActivaId"
    :abierto="nuevoCliente.abierto"
    :empresa-id="contexto.empresaActivaId"
    :inicial="nuevoCliente.inicial"
    :solo-ruc="tipo === 'FACTURA'"
    @cerrar="nuevoCliente.abierto = false"
    @guardado="clienteCreado"
  />
</template>
