<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { api, descargar, mensajeError } from '@/services/api';
import { useContexto } from '@/stores/contexto';
import { useToast } from '@/stores/toast';
import { useListado } from '@/composables/useListado';
import { usePaginacionLocal } from '@/composables/usePaginacionLocal';
import { fechaHora, soles } from '@/utils/formato';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import TablaResponsiva from '@/components/TablaResponsiva.vue';
import Paginacion from '@/components/Paginacion.vue';
import Icono from '@/components/Icono.vue';

/**
 * Importación desde Excel: elegir qué importar, descargar la plantilla, subir el archivo, revisar
 * la vista previa fila por fila y aplicar. Solo se aplican las filas sin errores.
 */
const contexto = useContexto();
const toast = useToast();

const DESCRIPCION = {
  CLIENTES: 'Crea los clientes nuevos y actualiza los que ya existen (por tipo y número de documento).',
  PRODUCTOS: 'Crea o actualiza productos por su código (SKU). Las categorías que falten se crean solas.',
  INVENTARIO_INICIAL: 'Carga el stock inicial de cada almacén al costo indicado. Solo para productos sin movimientos.',
  ASIENTO_APERTURA: 'Registra los saldos iniciales de la contabilidad (activos, pasivos y patrimonio) en un asiento.',
};
const ICONO = { CLIENTES: 'usuarios', PRODUCTOS: 'productos', INVENTARIO_INICIAL: 'inventario', ASIENTO_APERTURA: 'kardex' };

const tipos = ref([]);
const tipo = ref(null);
const archivo = ref(null);
const fecha = ref(`${new Date().getFullYear()}-01-01`);
const estado = reactive({ validando: false, aplicando: false, vista: null, resultado: null });
const soloErrores = ref(false);

async function cargarTipos() {
  if (!contexto.empresaActivaId) return;
  try {
    tipos.value = (await api.get('/importaciones/tipos', { params: { empresaId: contexto.empresaActivaId } })).data.filter((t) => t.permitido);
  } catch (e) {
    toast.error(mensajeError(e));
  }
}
const historial = useListado('/importaciones', { empresaId: contexto.empresaActivaId });
watch(() => contexto.empresaActivaId, (id) => {
  reiniciar();
  cargarTipos();
  historial.filtros.empresaId = id;
}, { immediate: true });
historial.cargar();

const actual = computed(() => tipos.value.find((t) => t.codigo === tipo.value));
function elegir(codigo) {
  tipo.value = codigo;
  reiniciar(false);
}
function reiniciar(todo = true) {
  if (todo) tipo.value = null;
  archivo.value = null;
  Object.assign(estado, { vista: null, resultado: null });
}

async function plantilla() {
  try {
    await descargar(`/importaciones/plantilla/${tipo.value}`, { empresaId: contexto.empresaActivaId }, `plantilla-${tipo.value.toLowerCase().replace(/_/g, '-')}.xlsx`);
  } catch (e) {
    toast.error(mensajeError(e));
  }
}
const aBase64 = (f) => new Promise((ok, mal) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1] ?? '');
  r.onerror = () => mal(new Error('No se pudo leer el archivo'));
  r.readAsDataURL(f);
});
function elegirArchivo(e) {
  const f = e.target.files?.[0] ?? e.dataTransfer?.files?.[0];
  if (!f) return;
  if (!/\.(xlsx|csv)$/i.test(f.name)) return toast.error('Suba un archivo .xlsx o .csv');
  if (f.size > 8 * 1024 * 1024) return toast.error('El archivo supera los 8 MB');
  archivo.value = f;
}
async function validar() {
  estado.validando = true;
  try {
    estado.vista = (await api.post('/importaciones/validar', {
      empresaId: contexto.empresaActivaId, tipo: tipo.value, nombreArchivo: archivo.value.name, archivo: await aBase64(archivo.value),
      opciones: tipo.value === 'ASIENTO_APERTURA' ? { fecha: fecha.value } : {},
    })).data;
    soloErrores.value = estado.vista.resumen.conError > 0;
    historial.cargar();
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    estado.validando = false;
  }
}
async function aplicar() {
  estado.aplicando = true;
  try {
    estado.resultado = (await api.post(`/importaciones/${estado.vista.id}/aplicar`, {})).data.resultado;
    toast.exito('Importación aplicada');
    historial.cargar();
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    estado.aplicando = false;
  }
}
async function descartar() {
  try {
    await api.post(`/importaciones/${estado.vista.id}/descartar`, {});
    reiniciar(false);
    historial.cargar();
  } catch (e) {
    toast.error(mensajeError(e));
  }
}

// Vista previa: las primeras columnas del archivo, la acción y los errores
const filasVista = computed(() => (estado.vista?.filas ?? []).filter((f) => !soloErrores.value || f.errores.length));
const { pag, visibles } = usePaginacionLocal(filasVista, 20);
const columnasVista = computed(() => [
  { clave: 'numero', titulo: 'Fila' },
  ...(actual.value?.columnas ?? []).slice(0, 4).map((c) => ({ clave: `d_${c.clave}`, titulo: c.titulo, ocultarEnTarjeta: false })),
  { clave: 'accion', titulo: 'Resultado' },
]);
const ACCION = { crear: { texto: 'Nuevo', clase: 'bg-emerald-50 text-emerald-700' }, actualizar: { texto: 'Se actualiza', clase: 'bg-sky-50 text-sky-700' }, omitir: { texto: 'Con error', clase: 'bg-red-50 text-red-700' } };
const ESTADO = { VALIDADA: { texto: 'Sin aplicar', clase: 'bg-amber-50 text-amber-800' }, APLICADA: { texto: 'Aplicada', clase: 'bg-emerald-50 text-emerald-700' }, DESCARTADA: { texto: 'Descartada', clase: 'bg-slate-100 text-slate-600' } };
const resultadoTexto = (r) => {
  if (!r) return '';
  if (r.asientoId) return `Asiento ${r.periodo.slice(4)}-${String(r.numero).padStart(4, '0')} por ${soles(r.total)}`;
  if (r.movimientos) return `${r.productos} producto(s) en ${r.movimientos.length} movimiento(s) de kardex (${r.movimientos.join(', ')}) · ${soles(r.valorTotal)}`;
  return [r.creados && `${r.creados} creado(s)`, r.actualizados && `${r.actualizados} actualizado(s)`, r.categoriasCreadas && `${r.categoriasCreadas} categoría(s) nueva(s)`].filter(Boolean).join(' · ') || 'Sin cambios';
};
</script>

<template>
  <EncabezadoPagina titulo="Importar datos" :subtitulo="contexto.empresaActiva?.razonSocial" />

  <!-- 1. Qué importar -->
  <section v-if="!tipo" class="mb-6">
    <p class="mb-3 text-sm text-slate-600">Elija qué importar. Recomendado para un cliente nuevo: productos, luego inventario inicial y, al final, el asiento de apertura.</p>
    <p v-if="!tipos.length" class="tarjeta p-6 text-center text-sm text-slate-500">No tiene permiso para importar datos en esta empresa.</p>
    <div class="grid gap-3 sm:grid-cols-2">
      <button v-for="t in tipos" :key="t.codigo" type="button" class="tarjeta flex items-start gap-3 p-4 text-left transition hover:shadow-md" @click="elegir(t.codigo)">
        <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-marca-50 text-marca-700"><Icono :nombre="ICONO[t.codigo]" clase="size-5" /></span>
        <span>
          <span class="block font-semibold">{{ t.nombre }}</span>
          <span class="mt-0.5 block text-sm text-slate-600">{{ DESCRIPCION[t.codigo] }}</span>
        </span>
      </button>
    </div>
  </section>

  <template v-else>
    <button class="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700" @click="reiniciar()"><Icono nombre="atras" clase="size-4" /> Elegir otro tipo</button>

    <!-- 2. Archivo -->
    <section v-if="!estado.vista" class="tarjeta mb-6 space-y-4 p-4 sm:p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="font-semibold">{{ actual?.nombre }}</h2>
          <p class="text-sm text-slate-600">{{ DESCRIPCION[tipo] }}</p>
        </div>
        <button class="btn-secundario" @click="plantilla"><Icono nombre="descargar" clase="size-4" /> Descargar plantilla</button>
      </div>
      <ul v-if="actual?.notas.length" class="list-disc space-y-1 pl-5 text-sm text-slate-600">
        <li v-for="n in actual.notas" :key="n">{{ n }}</li>
      </ul>
      <details class="text-sm">
        <summary class="cursor-pointer text-marca-700">Columnas del archivo</summary>
        <ul class="mt-2 grid gap-1 sm:grid-cols-2">
          <li v-for="c in actual?.columnas" :key="c.clave"><strong>{{ c.titulo }}{{ c.requerido ? ' *' : '' }}</strong><span v-if="c.ayuda" class="text-slate-500"> — {{ c.ayuda }}</span></li>
        </ul>
      </details>
      <div v-if="tipo === 'ASIENTO_APERTURA'" class="max-w-xs">
        <label class="etiqueta" for="imp-fecha">Fecha del asiento de apertura *</label>
        <input id="imp-fecha" v-model="fecha" type="date" class="input" />
      </div>
      <label
        class="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-6 text-center text-sm text-slate-600 transition hover:border-marca-400 hover:bg-marca-50/40"
        @dragover.prevent
        @drop.prevent="elegirArchivo"
      >
        <Icono nombre="descargar" clase="size-6 rotate-180 text-slate-400" />
        <span v-if="archivo"><strong>{{ archivo.name }}</strong> · {{ (archivo.size / 1024).toFixed(0) }} KB</span>
        <span v-else>Arrastre aquí el archivo o <span class="font-medium text-marca-700">elíjalo</span> (.xlsx o .csv, hasta 8 MB)</span>
        <input type="file" accept=".xlsx,.csv" class="sr-only" aria-label="Archivo a importar" @change="elegirArchivo" />
      </label>
      <div class="flex justify-end">
        <button class="btn-primario" :disabled="!archivo || estado.validando" @click="validar">{{ estado.validando ? 'Revisando…' : 'Revisar archivo' }}</button>
      </div>
    </section>

    <!-- 3. Vista previa y resultado -->
    <section v-else class="mb-6 space-y-4">
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <span class="font-medium">{{ estado.vista.nombreArchivo }}</span>
        <span class="insignia bg-slate-100 text-slate-700">{{ estado.vista.resumen.total }} filas</span>
        <span class="insignia bg-emerald-50 text-emerald-700">{{ estado.vista.resumen.validas }} válidas</span>
        <span v-if="estado.vista.resumen.conError" class="insignia bg-red-50 text-red-700">{{ estado.vista.resumen.conError }} con error</span>
        <span v-if="estado.vista.resumen.crear" class="insignia bg-emerald-50 text-emerald-700">{{ estado.vista.resumen.crear }} nuevas</span>
        <span v-if="estado.vista.resumen.actualizar" class="insignia bg-sky-50 text-sky-700">{{ estado.vista.resumen.actualizar }} se actualizan</span>
        <span v-if="estado.vista.resumen.valorTotal != null" class="insignia bg-slate-100 text-slate-700">Valor {{ soles(estado.vista.resumen.valorTotal) }}</span>
      </div>
      <!-- Apertura: cuadre y comparación con el kardex -->
      <div v-if="tipo === 'ASIENTO_APERTURA'" class="grid gap-3 sm:grid-cols-3">
        <div class="tarjeta p-3 text-sm"><p class="text-slate-500">Debe / Haber</p><p class="font-semibold tabular-nums">{{ soles(estado.vista.resumen.debe) }} / {{ soles(estado.vista.resumen.haber) }}</p></div>
        <div class="tarjeta p-3 text-sm"><p class="text-slate-500">Cuenta 20 (archivo)</p><p class="font-semibold tabular-nums">{{ soles(estado.vista.resumen.cuenta20) }}</p></div>
        <div class="tarjeta p-3 text-sm">
          <p class="text-slate-500">Inventario en el kardex</p>
          <p class="font-semibold tabular-nums" :class="Math.abs(estado.vista.resumen.cuenta20 - estado.vista.resumen.inventarioKardex) > 0.009 ? 'text-amber-700' : ''">{{ soles(estado.vista.resumen.inventarioKardex) }}</p>
        </div>
      </div>
      <p v-if="tipo === 'ASIENTO_APERTURA' && Math.abs(estado.vista.resumen.cuenta20 - estado.vista.resumen.inventarioKardex) > 0.009" class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
        La cuenta 20 no coincide con el valor del inventario cargado en el kardex. Si aún no importó el inventario inicial, hágalo antes; si no, revise los saldos.
      </p>

      <p v-if="estado.resultado" class="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        <Icono nombre="check" clase="mt-0.5 size-4 shrink-0" /> Importación aplicada: {{ resultadoTexto(estado.resultado) }}<template v-if="estado.resultado.omitidas"> · {{ estado.resultado.omitidas }} fila(s) omitida(s) por errores</template>.
      </p>
      <p v-else-if="estado.vista.bloqueo" class="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><Icono nombre="alerta" clase="mt-0.5 size-4 shrink-0" /> {{ estado.vista.bloqueo }}</p>
      <p v-else-if="estado.vista.resumen.conError" class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Las filas con error no se importan. Corríjalas en el archivo y vuelva a subirlo, o aplique solo las válidas.
      </p>

      <label v-if="estado.vista.resumen.conError" class="flex items-center gap-2 text-sm"><input v-model="soloErrores" type="checkbox" class="size-4 accent-marca-700" /> Ver solo las filas con error</label>
      <TablaResponsiva :columnas="columnasVista" :filas="visibles" vacio="Sin filas">
        <template v-for="c in columnasVista.slice(1, -1)" :key="c.clave" #[`celda-${c.clave}`]="{ fila }">
          <span class="text-sm">{{ fila.datos[c.clave.slice(2)] || '—' }}</span>
        </template>
        <template #celda-accion="{ fila }">
          <span class="insignia" :class="ACCION[fila.accion].clase">{{ ACCION[fila.accion].texto }}</span>
          <ul v-if="fila.errores.length" class="mt-1 space-y-0.5 text-xs text-red-700"><li v-for="e in fila.errores" :key="e">{{ e }}</li></ul>
        </template>
      </TablaResponsiva>
      <Paginacion :pag="pag" />

      <div class="flex flex-wrap justify-end gap-2">
        <template v-if="!estado.resultado">
          <button class="btn-secundario" @click="descartar">Descartar</button>
          <button class="btn-primario" :disabled="!!estado.vista.bloqueo || !estado.vista.resumen.validas || estado.aplicando" @click="aplicar">
            {{ estado.aplicando ? 'Importando…' : `Importar ${estado.vista.resumen.validas} fila(s)` }}
          </button>
        </template>
        <button v-else class="btn-primario" @click="reiniciar()">Importar otro archivo</button>
      </div>
    </section>
  </template>

  <!-- Historial -->
  <h2 class="mb-2 font-semibold">Historial de importaciones</h2>
  <TablaResponsiva
    :columnas="[{ clave: 'creadoEn', titulo: 'Fecha' }, { clave: 'tipoNombre', titulo: 'Tipo' }, { clave: 'nombreArchivo', titulo: 'Archivo' }, { clave: 'filas', titulo: 'Filas' }, { clave: 'estado', titulo: 'Estado' }]"
    :filas="historial.filas.value"
    :cargando="historial.cargando.value"
    vacio="Aún no hay importaciones"
  >
    <template #celda-creadoEn="{ fila }"><span class="whitespace-nowrap">{{ fechaHora(fila.creadoEn) }}</span><p class="text-xs text-slate-500">{{ fila.usuario }}</p></template>
    <template #celda-nombreArchivo="{ fila }"><span class="text-sm">{{ fila.nombreArchivo }}</span><p v-if="fila.resultado" class="text-xs text-slate-500">{{ resultadoTexto(fila.resultado) }}</p></template>
    <template #celda-filas="{ fila }"><span class="tabular-nums">{{ fila.filasValidas }} / {{ fila.totalFilas }}</span></template>
    <template #celda-estado="{ fila }"><span class="insignia" :class="ESTADO[fila.estado].clase">{{ ESTADO[fila.estado].texto }}</span></template>
  </TablaResponsiva>
  <Paginacion :pag="historial.pag" />
</template>
