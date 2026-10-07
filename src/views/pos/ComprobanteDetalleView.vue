<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, mensajeError } from '@/services/api';
import { useContexto } from '@/stores/contexto';
import { useToast } from '@/stores/toast';
import { cant, fecha, fechaHora, num, soles } from '@/utils/formato';
import { FORMAS_PAGO, MEDIOS_PAGO, MOTIVOS_NC, TIPOS_COMPROBANTE, TIPOS_DOCUMENTO, estiloEstado } from '@/utils/pos';
import { useAuth } from '@/stores/auth';
import FormCobranza from '@/components/FormCobranza.vue';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import TablaResponsiva from '@/components/TablaResponsiva.vue';
import BaseModal from '@/components/BaseModal.vue';
import Icono from '@/components/Icono.vue';
import InsigniaSunat from '@/components/InsigniaSunat.vue';
import { useTiempoReal } from '@/composables/useTiempoReal';

const route = useRoute();
const router = useRouter();
const contexto = useContexto();
const toast = useToast();
const c = ref(null);
const enviando = ref(false);
const auth = useAuth();
const cobro = ref(false);
function cobrado() {
  cobro.value = false;
  cargar();
}
// ── SUNAT ──
const electronico = computed(() => c.value && c.value.tipo !== 'NOTA_VENTA');
const puedeGuia = computed(() => c.value && ['FACTURA', 'BOLETA'].includes(c.value.tipo) && c.value.estado !== 'ANULADO' && auth.canEnEmpresa('gre.guia.crear', c.value.empresaId));
const puedeEnviarSunat = computed(() => c.value && auth.canEnEmpresa('cpe.envio.gestionar', c.value.empresaId));
const sunat = reactive({ enviando: false });
async function enviarSunat() {
  sunat.enviando = true;
  try {
    const { data } = await api.post(`/cpe/comprobantes/${c.value.id}/enviar`);
    (data.error ? toast.error : toast.exito)(data.mensaje || 'Enviado');
    await cargar();
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    sunat.enviando = false;
  }
}
// La respuesta de SUNAT llega sola (cola en segundo plano)
useTiempoReal('pos:comprobante', (x) => x.id === c.value?.id && cargar());

const cuotaVencida = (k) => k.vencida && Number(k.pendiente) > 0;

async function cargar() {
  try {
    c.value = (await api.get(`/pos/comprobantes/${route.params.id}`)).data;
  } catch (e) {
    toast.error(mensajeError(e));
    router.replace('/comprobantes');
  }
}
watch(() => route.params.id, (id) => id && cargar(), { immediate: true });
const imprimir = (f) => window.open(router.resolve(`/imprimir/comprobante/${c.value.id}/${f}`).href, '_blank');

const columnas = [
  { clave: 'descripcion', titulo: 'Descripción' },
  { clave: 'cantidad', titulo: 'Cant.', clase: 'text-right' },
  { clave: 'precioUnitario', titulo: 'P. unit.', clase: 'text-right' },
  { clave: 'descuento', titulo: 'Dscto.', clase: 'text-right' },
  { clave: 'total', titulo: 'Importe', clase: 'text-right' },
];

// ── Anular ──
const anulacion = reactive({ abierto: false, motivo: '' });
async function anular() {
  enviando.value = true;
  try {
    await api.post(`/pos/comprobantes/${c.value.id}/anular`, { motivo: anulacion.motivo });
    toast.exito('Comprobante anulado; el stock volvió al almacén');
    anulacion.abierto = false;
    await cargar();
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    enviando.value = false;
  }
}

// ── Nota de crédito (requiere un turno propio abierto) ──
const nc = reactive({ abierto: false, cajas: [], cajaId: '', motivo: '07', descripcion: '', medio: 'EFECTIVO', cantidades: {} });
async function abrirNC() {
  const cajas = (await api.get('/pos/cajas', { params: { empresaId: contexto.empresaActivaId } })).data.filter((x) => x.turno?.esMio);
  Object.assign(nc, { abierto: true, cajas, cajaId: cajas[0]?.id ?? '', motivo: '07', descripcion: '', medio: 'EFECTIVO', cantidades: Object.fromEntries(c.value.detalles.map((d) => [d.productoId, ''])) });
}
const totalNC = computed(() => {
  if (!c.value) return 0;
  if (nc.motivo !== '07') return Number(c.value.total);
  return c.value.detalles.reduce((s, d) => s + (Number(nc.cantidades[d.productoId] || 0) / Number(d.cantidad)) * Number(d.total), 0);
});
async function emitirNC() {
  enviando.value = true;
  try {
    const items = Object.entries(nc.cantidades).filter(([, q]) => Number(q) > 0).map(([productoId, cantidad]) => ({ productoId, cantidad: String(cantidad) }));
    const { data } = await api.post('/pos/notas-credito', {
      cajaId: nc.cajaId, comprobanteId: c.value.id, motivoCodigo: nc.motivo, motivoDescripcion: nc.descripcion || undefined,
      medioReembolso: nc.medio, ...(nc.motivo === '07' && { items }),
    });
    toast.exito(`Nota de crédito ${data.serie}-${String(data.numero).padStart(8, '0')} emitida`);
    nc.abierto = false;
    router.push(`/comprobantes/${data.id}`);
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <div v-if="c" class="space-y-5">
    <EncabezadoPagina :titulo="`${TIPOS_COMPROBANTE[c.tipo].texto} ${c.numeroCompleto}`" :subtitulo="c.clienteNombre">
      <template #antes>
        <RouterLink to="/comprobantes" class="mb-1 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"><Icono nombre="atras" clase="size-4" /> Comprobantes</RouterLink>
        <span class="insignia mb-1 ml-2" :class="estiloEstado(c)">{{ c.estado === 'ANULADO' ? 'Anulado' : 'Emitido' }}</span>
        <InsigniaSunat v-if="electronico" class="mb-1 ml-1" :estado="c.estadoSunat" corto />
      </template>
      <button class="btn-secundario" @click="imprimir('ticket')"><Icono nombre="imprimir" clase="size-4" /> Ticket</button>
      <button class="btn-secundario" @click="imprimir('a4')"><Icono nombre="imprimir" clase="size-4" /> A4</button>
      <button v-if="c.acciones.cobrar" class="btn-primario" @click="cobro = true"><Icono nombre="tarjeta" clase="size-4" /> Cobrar</button>
      <RouterLink v-if="puedeGuia" :to="`/guias/nueva?desde=comprobante&id=${c.id}`" class="btn-secundario"><Icono nombre="transferencias" clase="size-4" /> Guía de remisión</RouterLink>
      <button v-if="c.acciones.notaCredito" class="btn-secundario" @click="abrirNC">Nota de crédito</button>
      <button v-if="c.acciones.anular" class="btn-peligro" @click="(anulacion.motivo = ''), (anulacion.abierto = true)">Anular</button>
    </EncabezadoPagina>

    <p v-if="c.estado === 'ANULADO'" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Anulado el {{ fechaHora(c.anuladoEn) }}: {{ c.motivoAnulacion }}</p>
    <p v-if="c.referencia" class="rounded-lg bg-slate-100 px-3 py-2 text-sm">
      {{ MOTIVOS_NC[c.motivoCodigo] }} sobre
      <RouterLink :to="`/comprobantes/${c.referencia.id}`" class="font-mono font-medium underline">{{ c.referencia.serie }}-{{ String(c.referencia.numero).padStart(8, '0') }}</RouterLink>
      <template v-if="c.motivoDescripcion && c.motivoDescripcion !== MOTIVOS_NC[c.motivoCodigo]">: {{ c.motivoDescripcion }}</template>
    </p>
    <p v-if="c.notasCredito.length" class="rounded-lg bg-slate-100 px-3 py-2 text-sm">
      Notas de crédito:
      <RouterLink v-for="n in c.notasCredito" :key="n.id" :to="`/comprobantes/${n.id}`" class="mr-2 font-mono underline" :class="{ 'line-through': n.estado === 'ANULADO' }">{{ n.serie }}-{{ String(n.numero).padStart(8, '0') }} ({{ soles(n.total) }})</RouterLink>
    </p>

    <!-- Facturación electrónica -->
    <section v-if="electronico" class="tarjeta p-4 sm:p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 class="flex items-center gap-2 font-semibold">SUNAT <InsigniaSunat :estado="c.estadoSunat" /></h2>
          <p v-if="c.sunatDescripcion" class="mt-1 text-sm text-slate-600">
            <span v-if="c.sunatCodigo && c.sunatCodigo !== '0'" class="font-mono text-xs text-slate-500">Código {{ c.sunatCodigo }} · </span>{{ c.sunatDescripcion }}
          </p>
          <p v-else-if="c.estadoSunat === 'PENDIENTE'" class="mt-1 text-sm text-slate-500">Aún no se envía a SUNAT.</p>
          <p v-if="c.sunatUltimoError && !['ACEPTADO', 'OBSERVADO', 'ANULADO'].includes(c.estadoSunat)" class="mt-1 text-sm text-red-700">Último intento: {{ c.sunatUltimoError }}</p>
          <p v-if="c.estadoSunat === 'RECHAZADO'" class="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            Un comprobante rechazado <strong>no tiene validez</strong>. Corrija el dato observado (por ejemplo, el documento del cliente) y emita uno nuevo;
            si ya se cobró, anule este y vuelva a emitir.
          </p>
          <p v-if="c.bajaEstado" class="mt-1 text-sm" :class="c.bajaEstado === 'ACEPTADA' ? 'text-slate-600' : 'text-amber-700'">
            Comunicación de baja: <strong>{{ { ACEPTADA: 'aceptada', PENDIENTE: 'en proceso', ERROR: 'con error' }[c.bajaEstado] ?? c.bajaEstado }}</strong>
            <template v-if="c.bajaMensaje"> · {{ c.bajaMensaje }}</template>
          </p>
        </div>
        <button
          v-if="puedeEnviarSunat && ['PENDIENTE', 'ENVIADO'].includes(c.estadoSunat) && !(c.estado === 'ANULADO' && !c.sunatEnviadoEn)"
          class="btn-primario shrink-0"
          :disabled="sunat.enviando"
          @click="enviarSunat"
        >
          {{ sunat.enviando ? 'Enviando…' : c.estadoSunat === 'ENVIADO' ? 'Consultar respuesta' : 'Enviar a SUNAT' }}
        </button>
      </div>
      <dl v-if="c.sunatEnviadoEn" class="mt-3 grid gap-x-6 gap-y-2 border-t border-slate-100 pt-3 text-sm sm:grid-cols-3">
        <div><dt class="text-xs text-slate-500">Enviado</dt><dd>{{ fechaHora(c.sunatEnviadoEn) }}<span class="text-xs text-slate-400"> · {{ c.sunatIntentos }} intento(s)</span></dd></div>
        <div v-if="c.sunatHash" class="min-w-0"><dt class="text-xs text-slate-500">Código hash</dt><dd class="truncate font-mono text-xs" :title="c.sunatHash">{{ c.sunatHash }}</dd></div>
        <div v-if="c.sunatXml || c.sunatCdr || c.sunatPdf">
          <dt class="text-xs text-slate-500">Archivos</dt>
          <dd class="flex flex-wrap gap-3">
            <a v-if="c.sunatXml" :href="c.sunatXml" target="_blank" rel="noopener" class="text-marca-700 hover:underline">XML</a>
            <a v-if="c.sunatCdr" :href="c.sunatCdr" target="_blank" rel="noopener" class="text-marca-700 hover:underline">CDR</a>
            <a v-if="c.sunatPdf" :href="c.sunatPdf" target="_blank" rel="noopener" class="text-marca-700 hover:underline">PDF del proveedor</a>
          </dd>
        </div>
      </dl>
    </section>

    <section class="tarjeta p-4 sm:p-5">
      <dl class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt class="text-slate-500">Cliente</dt><dd>{{ c.clienteNombre }}<span class="block text-xs text-slate-500">{{ TIPOS_DOCUMENTO[c.clienteTipoDocumento] }} {{ c.clienteNumeroDocumento }}</span></dd></div>
        <div><dt class="text-slate-500">Emisión</dt><dd>{{ fechaHora(c.fechaEmision) }}</dd></div>
        <div><dt class="text-slate-500">Caja</dt><dd>{{ c.caja.nombre }} · {{ c.cajero }}</dd></div>
        <div><dt class="text-slate-500">Forma de pago</dt><dd>{{ FORMAS_PAGO[c.formaPago] }}
          <span v-if="c.formaPago === 'CREDITO'" class="block text-xs" :class="Number(c.saldoPendiente) > 0 ? 'text-amber-700' : 'text-emerald-700'">
            {{ Number(c.saldoPendiente) > 0 ? `Saldo ${soles(c.saldoPendiente)}` : 'Pagado' }}
          </span></dd></div>
        <div v-if="c.autorizacion"><dt class="text-slate-500">Autorización</dt><dd>{{ c.autorizacion }}<span class="block text-xs text-slate-500">por {{ c.autorizadoPor }}</span></dd></div>
        <div v-if="c.clienteId && auth.canEnEmpresa('cxc.cuenta.ver', c.empresaId) && c.formaPago === 'CREDITO'"><dt class="text-slate-500">Cuenta del cliente</dt><dd><RouterLink :to="`/cuentas-por-cobrar/${c.clienteId}`" class="text-marca-700 hover:underline">Estado de cuenta</RouterLink></dd></div>
        <div v-if="c.movimiento"><dt class="text-slate-500">Kardex</dt><dd><RouterLink :to="`/movimientos/${c.movimiento.id}`" class="font-mono text-marca-700 hover:underline">{{ c.movimiento.numero }}</RouterLink></dd></div>
      </dl>
    </section>

    <TablaResponsiva selector :columnas="columnas" :filas="c.detalles">
      <template #celda-cantidad="{ fila }"><span class="tabular-nums">{{ cant(fila.cantidad) }} {{ fila.unidadCodigo }}</span></template>
      <template #celda-precioUnitario="{ fila }"><span class="tabular-nums">{{ num(fila.precioUnitario, 2) }}</span></template>
      <template #celda-descuento="{ fila }"><span class="tabular-nums">{{ Number(fila.descuento) ? num(fila.descuento, 2) : '—' }}</span></template>
      <template #celda-total="{ fila }"><span class="tabular-nums">{{ soles(fila.total) }}</span></template>
    </TablaResponsiva>

    <div class="grid gap-4 sm:grid-cols-2">
      <section class="tarjeta p-4 text-sm">
        <h2 class="mb-2 font-semibold">{{ c.tipo === 'NOTA_CREDITO' ? 'Reembolso' : 'Pagos' }}</h2>
        <ul class="space-y-1">
          <li v-for="p in c.pagos" :key="p.id" class="flex justify-between"><span>{{ MEDIOS_PAGO[p.medio] }}<span v-if="p.referencia" class="text-xs text-slate-500"> · {{ p.referencia }}</span></span><span class="tabular-nums">{{ soles(Math.abs(p.monto)) }}</span></li>
          <li v-if="!c.pagos.length && c.formaPago === 'CREDITO'" class="text-slate-500">Sin pago inicial</li>
          <li v-if="c.formaPago === 'CREDITO'" class="flex justify-between font-medium text-sky-700"><span>Al crédito</span><span class="tabular-nums">{{ soles(c.montoCredito) }}</span></li>
          <li v-if="Number(c.aplicadoASaldo)" class="flex justify-between text-sky-700"><span>Rebajado de la deuda</span><span class="tabular-nums">{{ soles(c.aplicadoASaldo) }}</span></li>
          <li v-if="c.montoRecibido" class="flex justify-between text-slate-500"><span>Efectivo recibido</span><span class="tabular-nums">{{ soles(c.montoRecibido) }}</span></li>
          <li v-if="Number(c.vuelto)" class="flex justify-between text-slate-500"><span>Vuelto</span><span class="tabular-nums">{{ soles(c.vuelto) }}</span></li>
        </ul>
      </section>
      <dl class="tarjeta space-y-1 p-4 text-sm sm:col-start-2">
        <div class="flex justify-between"><dt class="text-slate-500">Op. gravada</dt><dd class="tabular-nums">{{ soles(c.opGravada) }}</dd></div>
        <div v-if="Number(c.opExonerada)" class="flex justify-between"><dt class="text-slate-500">Op. exonerada</dt><dd class="tabular-nums">{{ soles(c.opExonerada) }}</dd></div>
        <div v-if="Number(c.opInafecta)" class="flex justify-between"><dt class="text-slate-500">Op. inafecta</dt><dd class="tabular-nums">{{ soles(c.opInafecta) }}</dd></div>
        <div v-if="Number(c.descuentoTotal)" class="flex justify-between"><dt class="text-slate-500">Descuentos<template v-if="Number(c.descuentoGlobal)"> (global {{ soles(c.descuentoGlobal) }})</template></dt><dd class="tabular-nums">{{ soles(c.descuentoTotal) }}</dd></div>
        <div class="flex justify-between"><dt class="text-slate-500">IGV</dt><dd class="tabular-nums">{{ soles(c.igv) }}</dd></div>
        <div class="flex justify-between border-t border-slate-100 pt-1 text-base font-semibold"><dt>Total</dt><dd class="tabular-nums">{{ soles(c.total) }}</dd></div>
        <template v-if="Number(c.detraccionMonto) || Number(c.retencionMonto)">
          <div class="flex justify-between text-amber-800">
            <dt>{{ Number(c.detraccionMonto) ? `Detracción ${Number(c.detraccionPorcentaje)}% (código ${c.detraccionCodigo})` : 'Retención IGV 3%' }}</dt>
            <dd class="tabular-nums">−{{ soles(Number(c.detraccionMonto) || c.retencionMonto) }}</dd>
          </div>
          <div class="flex justify-between font-medium"><dt>Neto a cobrar</dt><dd class="tabular-nums">{{ soles(Number(c.total) - Number(c.detraccionMonto) - Number(c.retencionMonto)) }}</dd></div>
        </template>
        <p class="pt-1 text-xs text-slate-500">{{ c.montoEnLetras }}</p>
      </dl>
    </div>

    <div v-if="c.formaPago === 'CREDITO'" class="grid gap-4 sm:grid-cols-2">
      <section class="tarjeta p-4 text-sm">
        <h2 class="mb-2 font-semibold">Cuotas</h2>
        <ul class="space-y-1">
          <li v-for="k in c.cuotas" :key="k.numero" class="flex flex-wrap justify-between gap-x-3">
            <span>Cuota {{ k.numero }} · vence {{ fecha(k.fechaVencimiento) }}</span>
            <span class="tabular-nums">
              {{ soles(k.monto) }}
              <span v-if="Number(k.pendiente) === 0" class="insignia ml-1 bg-emerald-50 text-emerald-700">Pagada</span>
              <span v-else-if="cuotaVencida(k)" class="insignia ml-1 bg-red-50 text-red-700">Vencida {{ k.diasVencido }} d · debe {{ soles(k.pendiente) }}</span>
              <span v-else class="insignia ml-1 bg-slate-100 text-slate-600">Debe {{ soles(k.pendiente) }}</span>
            </span>
          </li>
        </ul>
      </section>
      <section class="tarjeta p-4 text-sm">
        <h2 class="mb-2 font-semibold">Cobranzas</h2>
        <p v-if="!c.cobranzas.length" class="text-slate-500">Aún no hay cobranzas.</p>
        <ul class="space-y-1">
          <li v-for="k in c.cobranzas" :key="k.id" class="flex justify-between gap-2" :class="{ 'text-slate-400 line-through': k.estado === 'ANULADA' }">
            <RouterLink :to="`/imprimir/cobranza/${k.id}/a4`" target="_blank" class="hover:underline">Nº {{ k.numero }} · {{ fechaHora(k.fecha) }} · {{ MEDIOS_PAGO[k.medio] }}</RouterLink>
            <span class="tabular-nums">{{ soles(k.monto) }}</span>
          </li>
        </ul>
      </section>
    </div>

    <FormCobranza
      :abierto="cobro"
      :empresa-id="c.empresaId"
      :comprobante="{ id: c.id, numeroCompleto: c.numeroCompleto, saldoPendiente: c.saldoPendiente, clienteNombre: c.clienteNombre, cuotas: c.cuotas }"
      @cerrar="cobro = false"
      @guardado="cobrado"
    />

    <BaseModal :abierto="anulacion.abierto" :titulo="`Anular ${c.numeroCompleto}`" @cerrar="anulacion.abierto = false">
      <form id="form-anular" class="space-y-3" @submit.prevent="anular">
        <p class="text-sm text-slate-600">Se anula dentro del turno de caja: el stock vuelve al almacén y el pago deja de contar en el arqueo.</p>
        <div><label class="etiqueta">Motivo *</label><textarea v-model="anulacion.motivo" class="input py-2" rows="3" minlength="5" required /></div>
      </form>
      <template #pie>
        <button class="btn-secundario" @click="anulacion.abierto = false">Volver</button>
        <button class="btn-peligro" form="form-anular" :disabled="enviando">Anular</button>
      </template>
    </BaseModal>

    <BaseModal :abierto="nc.abierto" :titulo="`Nota de crédito sobre ${c.numeroCompleto}`" @cerrar="nc.abierto = false">
      <p v-if="!nc.cajas.length" class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Para emitir una nota de crédito necesita un turno de caja abierto a su nombre (el reembolso sale de esa caja).
        <RouterLink to="/pos" class="font-medium underline">Ir a la caja</RouterLink>
      </p>
      <form v-else id="form-nc" class="space-y-4" @submit.prevent="emitirNC">
        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label class="etiqueta">Motivo *</label>
            <select v-model="nc.motivo" class="input"><option v-for="(m, k) in MOTIVOS_NC" :key="k" :value="k">{{ k }} · {{ m }}</option></select>
          </div>
          <div>
            <label class="etiqueta">Reembolso por</label>
            <select v-model="nc.medio" class="input"><option v-for="(m, k) in MEDIOS_PAGO" :key="k" :value="k">{{ m }}</option></select>
          </div>
          <div v-if="nc.cajas.length > 1" class="sm:col-span-2">
            <label class="etiqueta">Caja</label>
            <select v-model="nc.cajaId" class="input"><option v-for="x in nc.cajas" :key="x.id" :value="x.id">{{ x.nombre }}</option></select>
          </div>
        </div>
        <div v-if="nc.motivo === '07'" class="space-y-2">
          <p class="text-sm text-slate-600">Cantidad que devuelve el cliente:</p>
          <div v-for="d in c.detalles" :key="d.id" class="flex items-center gap-3">
            <span class="min-w-0 flex-1 truncate text-sm">{{ d.descripcion }} <span class="text-xs text-slate-500">(vendido {{ cant(d.cantidad) }})</span></span>
            <input v-model="nc.cantidades[d.productoId]" type="number" inputmode="decimal" min="0" :max="Number(d.cantidad)" step="any" class="input w-28" placeholder="0" />
          </div>
        </div>
        <div><label class="etiqueta">Detalle (opcional)</label><input v-model="nc.descripcion" class="input" maxlength="200" /></div>
        <p class="rounded-lg bg-slate-50 p-3 text-sm">
          <template v-if="Number(c.saldoPendiente) > 0">
            Importe aproximado: <strong>{{ soles(totalNC) }}</strong>. Primero se rebaja de la deuda ({{ soles(c.saldoPendiente) }});
            solo se reembolsa lo que exceda: <strong>{{ soles(Math.max(0, totalNC - Number(c.saldoPendiente))) }}</strong>.
          </template>
          <template v-else>Reembolso aproximado: <strong>{{ soles(totalNC) }}</strong>.</template>
          Los productos vuelven al almacén al costo con que salieron.
        </p>
      </form>
      <template #pie>
        <button class="btn-secundario" @click="nc.abierto = false">Volver</button>
        <button v-if="nc.cajas.length" class="btn-primario" form="form-nc" :disabled="enviando || totalNC <= 0">Emitir nota de crédito</button>
      </template>
    </BaseModal>
  </div>
  <p v-else class="text-sm text-slate-500">Cargando…</p>
</template>
