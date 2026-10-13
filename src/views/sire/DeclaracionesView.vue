<script setup>
import Pestanas from '@/components/Pestanas.vue';
import { usePeriodoTrabajo } from '@/composables/usePeriodoTrabajo';
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, descargar, mensajeError } from '@/services/api';
import { useContexto } from '@/stores/contexto';
import { useToast } from '@/stores/toast';
import { usePaginacionLocal } from '@/composables/usePaginacionLocal';
import { fecha, num, soles } from '@/utils/formato';
import { confirmar } from '@/utils/dialogos';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import TablaResponsiva from '@/components/TablaResponsiva.vue';
import Paginacion from '@/components/Paginacion.vue';
import BaseModal from '@/components/BaseModal.vue';
import Icono from '@/components/Icono.vue';

/**
 * Apoyo para declaraciones: hoja de trabajo del PDT 621 (IGV y renta) con registro de lo presentado,
 * y la DAOT anual. Todo sale de las ventas y compras registradas en el sistema.
 */
const route = useRoute();
const router = useRouter();
const contexto = useContexto();
const toast = useToast();
const vista = computed(() => (route.query.vista === 'daot' ? 'daot' : 'pdt'));
const irA = (v) => router.replace({ query: { ...route.query, vista: v } });
const REGIMEN = { GENERAL: 'Régimen General', MYPE: 'Régimen MYPE Tributario', ESPECIAL: 'Régimen Especial', NRUS: 'Nuevo RUS' };
const entero = (v) => (v == null ? '—' : v < 0 ? `(${num(-v, 0)})` : num(v, 0));

// ───────────── PDT 621 ─────────────
const mes = usePeriodoTrabajo();
const periodo = computed(() => mes.value.replace('-', ''));
// Ajustes a mano (vacío = automático)
const ajuste = reactive({ saldoAnterior: '', tasaRenta: '' });
const pdt = ref(null);
const anio = ref([]);
const cargando = ref(false);
async function cargarPdt() {
  if (!contexto.empresaActivaId || !mes.value) return;
  cargando.value = true;
  try {
    const params = { empresaId: contexto.empresaActivaId, periodo: periodo.value };
    if (ajuste.saldoAnterior !== '') params.saldoAnterior = ajuste.saldoAnterior;
    if (ajuste.tasaRenta !== '') params.tasaRenta = Number(ajuste.tasaRenta) / 100;
    const [p, a] = await Promise.all([
      api.get('/declaraciones/pdt621', { params }),
      api.get('/declaraciones/pdt621/anio', { params: { empresaId: contexto.empresaActivaId, anio: periodo.value.slice(0, 4) } }),
    ]);
    pdt.value = p.data;
    anio.value = a.data;
    router.replace({ query: { ...route.query, periodo: periodo.value } });
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    cargando.value = false;
  }
}
watch([() => contexto.empresaActivaId, periodo], () => {
  Object.assign(ajuste, { saldoAnterior: '', tasaRenta: '' });
  cargarPdt();
}, { immediate: true });
let t;
watch(() => ({ ...ajuste }), () => {
  clearTimeout(t);
  t = setTimeout(cargarPdt, 400);
});

// Lo recalculado ya no coincide con lo que se registró como presentado
const difiere = computed(() => {
  const d = pdt.value?.declarada;
  return d && (d.igvPagado !== pdt.value.igv.aPagar || d.rentaPagada !== (pdt.value.renta.pagoCuenta ?? 0) || d.saldoFavorSiguiente !== pdt.value.igv.saldoFavorSiguiente);
});

const registro = reactive({ abierto: false, numeroOrden: '', fecha: '', guardando: false });
function abrirRegistro() {
  Object.assign(registro, {
    abierto: true, numeroOrden: pdt.value.declarada?.numeroOrden ?? '',
    fecha: pdt.value.declarada?.fechaPresentacion ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date()),
  });
}
async function registrar() {
  registro.guardando = true;
  try {
    await api.put('/declaraciones/pdt621', {
      empresaId: contexto.empresaActivaId, periodo: periodo.value, numeroOrden: registro.numeroOrden, fechaPresentacion: registro.fecha,
      saldoAnterior: ajuste.saldoAnterior === '' ? null : Number(ajuste.saldoAnterior), tasaRenta: ajuste.tasaRenta === '' ? null : Number(ajuste.tasaRenta) / 100,
    });
    toast.exito('Declaración registrada');
    registro.abierto = false;
    cargarPdt();
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    registro.guardando = false;
  }
}
async function eliminarRegistro() {
  if (!(await confirmar({ titulo: '¿Quitar el registro de esta declaración?', texto: 'Solo borra el registro en el sistema (no anula nada en SUNAT). El mes siguiente dejará de tomar su saldo a favor.', confirmar: 'Quitar registro', peligro: true }))) return;
  try {
    await api.delete('/declaraciones/pdt621', { params: { empresaId: contexto.empresaActivaId, periodo: periodo.value } });
    cargarPdt();
  } catch (e) {
    toast.error(mensajeError(e));
  }
}

// ───────────── DAOT ─────────────
const anioDaot = ref(new Date().getFullYear() - 1);
const uit = ref('');
const daot = ref(null);
async function cargarDaot() {
  if (!contexto.empresaActivaId) return;
  try {
    daot.value = (await api.get('/declaraciones/daot', { params: { empresaId: contexto.empresaActivaId, anio: anioDaot.value, ...(uit.value && { uit: uit.value }) } })).data;
    if (!uit.value) uit.value = String(daot.value.uit);
  } catch (e) {
    toast.error(mensajeError(e));
  }
}
watch([vista, () => contexto.empresaActivaId, anioDaot], ([v]) => v === 'daot' && cargarDaot(), { immediate: true });
const ladoDaot = ref('ventas');
const filasDaot = computed(() => daot.value?.[ladoDaot.value] ?? []);
const { pag: pagDaot, visibles: visiblesDaot } = usePaginacionLocal(filasDaot, 20);
const bajandoDaot = ref(false);
async function exportarDaot() {
  bajandoDaot.value = true;
  try {
    await descargar('/declaraciones/daot/excel', { empresaId: contexto.empresaActivaId, anio: anioDaot.value, uit: uit.value }, `daot-${anioDaot.value}.xlsx`);
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    bajandoDaot.value = false;
  }
}
const anios = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i);
</script>

<template>
  <EncabezadoPagina titulo="Declaraciones" :subtitulo="contexto.empresaActiva?.razonSocial">
    <template v-if="vista === 'daot'">
      <select v-model.number="anioDaot" class="input w-28" aria-label="Año"><option v-for="a in anios" :key="a" :value="a">{{ a }}</option></select>
      <button class="btn-secundario" :disabled="bajandoDaot || !daot" @click="exportarDaot"><Icono nombre="descargar" clase="size-4" /> Exportar Excel</button>
    </template>
  </EncabezadoPagina>

  <Pestanas :opciones="[['pdt', 'PDT 621 (IGV y renta)'], ['daot', 'DAOT']]" :activa="vista" @cambiar="irA" />

  <!-- ───────────── PDT 621 ───────────── -->
  <template v-if="vista === 'pdt'">
    <p v-if="cargando && !pdt" class="text-sm text-slate-500">Calculando…</p>
    <template v-if="pdt">
      <div class="mb-4 space-y-2">
        <p v-if="pdt.declarada" class="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm" :class="difiere ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'">
          <Icono :nombre="difiere ? 'alerta' : 'check'" clase="size-4 shrink-0" />
          Presentado el {{ fecha(pdt.declarada.fechaPresentacion) }} · N.º de orden <span class="font-mono">{{ pdt.declarada.numeroOrden }}</span>
          <template v-if="difiere"> · Lo recalculado ya no coincide con lo declarado: revise si hubo cambios en el período (podría requerir una rectificatoria).</template>
        </p>
        <p v-for="a in pdt.avisos" :key="a" class="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600"><Icono nombre="alerta" clase="mt-0.5 size-4 shrink-0" /> {{ a }}</p>
      </div>

      <div class="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <section class="tarjeta overflow-x-auto">
          <h2 class="px-4 pt-4 font-semibold sm:px-5">IGV — {{ pdt.etiqueta }}</h2>
          <table class="mt-2 min-w-full text-sm">
            <thead class="bg-slate-50 text-xs text-slate-500 uppercase">
              <tr><th class="px-4 py-2 text-left font-semibold">Casilla</th><th class="px-4 py-2 text-left font-semibold">Concepto</th><th class="px-4 py-2 text-right font-semibold">Base</th><th class="px-4 py-2 text-right font-semibold">IGV</th></tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="l in pdt.igv.lineas" :key="l.texto">
                <td class="px-4 py-2 font-mono text-xs text-slate-500">{{ l.casilla ?? '' }}<template v-if="l.casillaImpuesto"> / {{ l.casillaImpuesto }}</template></td>
                <td class="px-4 py-2">{{ l.texto }}</td>
                <td class="px-4 py-2 text-right tabular-nums">{{ entero(l.base) }}</td>
                <td class="px-4 py-2 text-right tabular-nums">{{ l.impuesto == null ? '' : entero(l.impuesto) }}</td>
              </tr>
            </tbody>
          </table>
          <dl class="divide-y divide-slate-100 border-t-2 border-slate-200 text-sm">
            <div class="flex justify-between px-4 py-2 sm:px-5"><dt>IGV de las ventas (débito)</dt><dd class="tabular-nums">{{ entero(pdt.igv.debito) }}</dd></div>
            <div class="flex justify-between px-4 py-2 sm:px-5"><dt>Crédito fiscal</dt><dd class="tabular-nums">({{ entero(pdt.igv.credito) }})</dd></div>
            <div class="flex justify-between px-4 py-2 font-medium sm:px-5"><dt>Impuesto resultante</dt><dd class="tabular-nums">{{ entero(pdt.igv.resultado) }}</dd></div>
            <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-5">
              <dt><span class="font-mono text-xs text-slate-500">145</span> Saldo a favor del mes anterior</dt>
              <dd class="flex items-center gap-2">
                <input v-model="ajuste.saldoAnterior" type="number" min="0" step="1" class="input h-9 w-28 text-right tabular-nums" :placeholder="String(pdt.igv.saldoAnterior)" aria-label="Saldo a favor del mes anterior (a mano)" />
              </dd>
            </div>
            <div class="flex justify-between px-4 py-2 sm:px-5"><dt>Retenciones del mes (aplicadas)</dt><dd class="tabular-nums">({{ entero(pdt.igv.retencionesAplicadas) }})</dd></div>
            <div class="flex justify-between bg-slate-50 px-4 py-3 text-base font-semibold sm:px-5">
              <dt>{{ pdt.igv.saldoFavorSiguiente ? 'Saldo a favor para el mes siguiente' : 'IGV a pagar' }}</dt>
              <dd class="tabular-nums" :class="pdt.igv.saldoFavorSiguiente ? 'text-emerald-700' : 'text-marca-800'">S/ {{ entero(pdt.igv.saldoFavorSiguiente || pdt.igv.aPagar) }}</dd>
            </div>
          </dl>
        </section>

        <div class="space-y-4">
          <section class="tarjeta p-4 sm:p-5">
            <h2 class="font-semibold">Renta — pago a cuenta</h2>
            <p class="text-xs text-slate-500">{{ REGIMEN[pdt.renta.regimen] }}</p>
            <dl class="mt-3 space-y-2 text-sm">
              <div class="flex justify-between"><dt><span class="font-mono text-xs text-slate-500">301</span> Ingresos netos</dt><dd class="tabular-nums">{{ entero(pdt.renta.ingresosNetos) }}</dd></div>
              <div class="flex items-center justify-between gap-2">
                <dt>Tasa (%)</dt>
                <dd><input v-model="ajuste.tasaRenta" type="number" min="0" step="0.01" class="input h-9 w-24 text-right" :placeholder="pdt.renta.tasa == null ? '—' : String(Math.round(pdt.renta.tasa * 10000) / 100)" aria-label="Tasa del pago a cuenta (a mano)" /></dd>
              </div>
              <div class="flex justify-between border-t border-slate-100 pt-2 text-base font-semibold"><dt>Pago a cuenta</dt><dd class="tabular-nums">S/ {{ entero(pdt.renta.pagoCuenta) }}</dd></div>
            </dl>
          </section>
          <section class="tarjeta p-4 sm:p-5">
            <p class="text-sm font-semibold">Total a pagar</p>
            <p class="mt-1 text-2xl font-semibold tabular-nums">S/ {{ entero((pdt.igv.aPagar || 0) + (pdt.renta.pagoCuenta || 0)) }}</p>
            <p class="text-xs text-slate-500">IGV + renta, en soles enteros como en el formulario</p>
            <div v-if="pdt.acciones.registrar" class="mt-3 flex flex-wrap gap-2">
              <button class="btn-primario" @click="abrirRegistro"><Icono nombre="check" clase="size-4" /> {{ pdt.declarada ? 'Actualizar registro' : 'Registrar presentación' }}</button>
              <button v-if="pdt.declarada" class="btn-secundario text-red-600 hover:bg-red-50" @click="eliminarRegistro">Quitar</button>
            </div>
          </section>
        </div>
      </div>

      <!-- Detalle del crédito fiscal -->
      <details v-if="pdt.comprasEnEspera.length || pdt.creditoDiferido.length" class="tarjeta mt-4 p-4">
        <summary class="cursor-pointer text-sm font-medium">Detracciones que afectan el crédito fiscal</summary>
        <div class="mt-3 grid gap-4 md:grid-cols-2">
          <div v-if="pdt.comprasEnEspera.length">
            <p class="mb-1 text-xs font-semibold text-amber-800 uppercase">En espera (sin depositar)</p>
            <ul class="divide-y divide-slate-100 text-sm"><li v-for="c in pdt.comprasEnEspera" :key="c.documentoId" class="flex justify-between gap-2 py-1.5"><RouterLink :to="`/compras/${c.documentoId}`" class="font-mono text-marca-700 hover:underline">{{ c.comprobante }}</RouterLink><span class="truncate text-slate-600">{{ c.proveedor }}</span><span class="tabular-nums">IGV {{ soles(c.igv) }}</span></li></ul>
          </div>
          <div v-if="pdt.creditoDiferido.length">
            <p class="mb-1 text-xs font-semibold text-emerald-700 uppercase">De meses anteriores, depositadas este mes</p>
            <ul class="divide-y divide-slate-100 text-sm"><li v-for="c in pdt.creditoDiferido" :key="c.documentoId" class="flex justify-between gap-2 py-1.5"><RouterLink :to="`/compras/${c.documentoId}`" class="font-mono text-marca-700 hover:underline">{{ c.comprobante }}</RouterLink><span class="truncate text-slate-600">{{ c.proveedor }}</span><span class="tabular-nums">IGV {{ soles(c.igv) }}</span></li></ul>
          </div>
        </div>
      </details>

      <!-- Resumen del año -->
      <h2 class="mt-6 mb-2 font-semibold">Declaraciones registradas en {{ periodo.slice(0, 4) }}</h2>
      <TablaResponsiva
        :columnas="[{ clave: 'etiqueta', titulo: 'Período' }, { clave: 'numeroOrden', titulo: 'N.º de orden' }, { clave: 'igvPagado', titulo: 'IGV', clase: 'text-right' }, { clave: 'rentaPagada', titulo: 'Renta', clase: 'text-right' }, { clave: 'saldoFavorSiguiente', titulo: 'Saldo a favor', clase: 'text-right' }]"
        :filas="anio"
        vacio="Aún no hay declaraciones registradas en el año"
      >
        <template #celda-etiqueta="{ fila }"><span class="font-medium">{{ fila.etiqueta }}</span><p class="text-xs text-slate-500">Presentado {{ fecha(fila.fechaPresentacion) }}</p></template>
        <template #celda-numeroOrden="{ fila }"><span class="font-mono text-sm">{{ fila.numeroOrden }}</span></template>
        <template #celda-igvPagado="{ fila }"><span class="tabular-nums">{{ entero(fila.igvPagado) }}</span></template>
        <template #celda-rentaPagada="{ fila }"><span class="tabular-nums">{{ entero(fila.rentaPagada) }}</span></template>
        <template #celda-saldoFavorSiguiente="{ fila }"><span class="tabular-nums">{{ entero(fila.saldoFavorSiguiente) }}</span></template>
      </TablaResponsiva>
    </template>
  </template>

  <!-- ───────────── DAOT ───────────── -->
  <template v-else>
    <template v-if="daot">
      <div class="mb-4 flex flex-wrap items-end gap-4">
        <div>
          <label class="etiqueta" for="daot-uit">UIT {{ daot.anio }} (S/)</label>
          <input id="daot-uit" v-model="uit" type="number" min="1" class="input w-32" @change="cargarDaot" />
        </div>
        <p class="text-sm text-slate-600">Se informan los terceros con operaciones mayores a 2 UIT: <strong>S/ {{ num(daot.limite, 2) }}</strong>. Ingresos del año: <strong>{{ soles(daot.ingresosAnio) }}</strong>.</p>
      </div>
      <p v-for="a in daot.avisos" :key="a" class="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"><Icono nombre="alerta" clase="mt-0.5 size-4 shrink-0" /> {{ a }}</p>
      <div class="mb-3 inline-flex rounded-lg bg-slate-100 p-1" role="radiogroup" aria-label="Lado de la DAOT">
        <button
          v-for="[k, t] in [['ventas', `Ingresos · ${daot.ventas.length} clientes`], ['compras', `Costos y gastos · ${daot.compras.length} proveedores`]]"
          :key="k"
          type="button"
          role="radio"
          :aria-checked="ladoDaot === k"
          class="min-h-9 rounded-md px-3 text-sm font-medium"
          :class="ladoDaot === k ? 'bg-white shadow-sm' : 'text-slate-600'"
          @click="ladoDaot = k"
        >
          {{ t }}
        </button>
      </div>
      <TablaResponsiva
        :columnas="[{ clave: 'documento', titulo: 'Documento' }, { clave: 'nombre', titulo: 'Nombre o razón social' }, { clave: 'comprobantes', titulo: 'Comprobantes', clase: 'text-right' }, { clave: 'monto', titulo: 'Monto', clase: 'text-right' }]"
        :filas="visiblesDaot"
        vacio="Ningún tercero supera las 2 UIT en el año"
      >
        <template #celda-documento="{ fila }"><span class="font-mono text-sm">{{ fila.tipoDocumento === '6' ? 'RUC' : 'DNI' }} {{ fila.documento }}</span></template>
        <template #celda-monto="{ fila }"><span class="font-medium tabular-nums">{{ soles(fila.monto) }}</span></template>
      </TablaResponsiva>
      <Paginacion :pag="pagDaot" />
      <p class="mt-2 text-xs text-slate-500">Monto = base imponible más operaciones no gravadas, sin IGV, en soles; las notas de crédito restan. Revise con el contador la obligación de presentar la DAOT.</p>
    </template>
  </template>

  <BaseModal :abierto="registro.abierto" :titulo="`Registrar PDT 621 de ${pdt?.etiqueta ?? ''}`" @cerrar="registro.abierto = false">
    <form id="form-pdt" class="space-y-4" @submit.prevent="registrar">
      <p class="text-sm text-slate-600">Guarda los importes de esta hoja de trabajo como lo declarado y deja el saldo a favor (S/ {{ entero(pdt?.igv.saldoFavorSiguiente) }}) para el mes siguiente.</p>
      <div class="grid gap-3 sm:grid-cols-2">
        <div><label class="etiqueta" for="pdt-orden">N.º de orden *</label><input id="pdt-orden" v-model.trim="registro.numeroOrden" class="input font-mono" inputmode="numeric" pattern="\d{6,12}" required /></div>
        <div><label class="etiqueta" for="pdt-fecha">Fecha de presentación *</label><input id="pdt-fecha" v-model="registro.fecha" type="date" class="input" required /></div>
      </div>
    </form>
    <template #pie>
      <button class="btn-secundario" @click="registro.abierto = false">Cancelar</button>
      <button class="btn-primario" form="form-pdt" :disabled="registro.guardando">{{ registro.guardando ? 'Guardando…' : 'Registrar' }}</button>
    </template>
  </BaseModal>
</template>
