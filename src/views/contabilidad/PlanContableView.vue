<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, mensajeError } from '@/services/api';
import { useContexto } from '@/stores/contexto';
import { useToast } from '@/stores/toast';
import { usePaginacionLocal } from '@/composables/usePaginacionLocal';
import { confirmar } from '@/utils/dialogos';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import TablaResponsiva from '@/components/TablaResponsiva.vue';
import Paginacion from '@/components/Paginacion.vue';
import CampoBusqueda from '@/components/CampoBusqueda.vue';
import BotonColumnas from '@/components/BotonColumnas.vue';
import MenuAcciones from '@/components/MenuAcciones.vue';
import BaseModal from '@/components/BaseModal.vue';
import Icono from '@/components/Icono.vue';

/**
 * Plan contable (PCGE) de la empresa activa y las cuentas que usa cada operación en los
 * asientos automáticos. El código anida por prefijo; una cuenta con subcuentas no recibe movimientos.
 */
const route = useRoute();
const router = useRouter();
const contexto = useContexto();
const toast = useToast();

const datos = ref(null);
const cfg = ref(null);
const cargando = ref(false);
async function cargar() {
  if (!contexto.empresaActivaId) return;
  cargando.value = true;
  try {
    const params = { empresaId: contexto.empresaActivaId };
    const [p, c] = await Promise.all([api.get('/contabilidad/plan', { params }), api.get('/contabilidad/configuracion', { params })]);
    datos.value = p.data;
    cfg.value = c.data;
    elegidas.value = Object.fromEntries(c.data.operaciones.map((o) => [o.clave, o.codigo ?? '']));
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    cargando.value = false;
  }
}
watch(() => contexto.empresaActivaId, cargar, { immediate: true });

const vista = computed(() => (route.query.vista === 'operaciones' ? 'operaciones' : 'plan'));
const irA = (v) => router.replace({ query: { ...route.query, vista: v } });
const cuentas = computed(() => datos.value?.cuentas ?? []);
const vacio = computed(() => datos.value && !cuentas.value.length);

// ── Plan vacío: cargar el PCGE base o copiar de otra empresa ──
const otras = computed(() => contexto.empresas.filter((e) => e.id !== contexto.empresaActivaId));
const copia = reactive({ desde: '', ocupado: false });
async function cargarBase() {
  copia.ocupado = true;
  try {
    const { data } = await api.post('/contabilidad/plan/cargar-base', { empresaId: contexto.empresaActivaId });
    toast.exito(`Plan contable cargado: ${data.cuentas} cuentas`);
    await cargar();
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    copia.ocupado = false;
  }
}
async function copiar() {
  copia.ocupado = true;
  try {
    const { data } = await api.post('/contabilidad/plan/copiar', { empresaId: contexto.empresaActivaId, desdeEmpresaId: copia.desde });
    toast.exito(`Plan copiado: ${data.cuentas} cuentas`);
    await cargar();
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    copia.ocupado = false;
  }
}

// ── Plan de cuentas ──
const filtro = reactive({ q: '', elemento: '', soloImputables: false });
const filtradas = computed(() => {
  const q = filtro.q.trim().toLowerCase();
  return cuentas.value.filter((c) =>
    (!q || c.codigo.startsWith(q) || c.nombre.toLowerCase().includes(q))
    && (!filtro.elemento || c.elemento === Number(filtro.elemento))
    && (!filtro.soloImputables || c.imputable));
});
const { pag, visibles } = usePaginacionLocal(filtradas, 50);
const columnas = [
  { clave: 'codigo', titulo: 'Cuenta' },
  { clave: 'naturaleza', titulo: 'Naturaleza', ocultarEnTarjeta: true },
  { clave: 'imputable', titulo: 'Movimientos' },
  { clave: 'destino', titulo: 'Destino', ocultarEnTarjeta: true },
];
const enUso = computed(() => new Set((cfg.value?.operaciones ?? []).map((o) => o.codigo).filter(Boolean)));

// Modal de cuenta: nueva (opcionalmente bajo una cuenta padre) o edición
const vaciaCuenta = () => ({ id: null, codigo: '', nombre: '', naturaleza: '', pideTercero: false, destinoDebe: '', destinoHaber: '', activo: true });
const modal = reactive({ abierto: false, guardando: false, f: vaciaCuenta() });
function nueva(padre) {
  modal.f = { ...vaciaCuenta(), codigo: padre?.codigo ?? '' };
  modal.abierto = true;
}
function editar(c) {
  modal.f = { id: c.id, codigo: c.codigo, nombre: c.nombre, naturaleza: c.naturaleza, pideTercero: c.pideTercero, destinoDebe: c.destinoDebe ?? '', destinoHaber: c.destinoHaber ?? '', activo: c.activo };
  modal.abierto = true;
}
const esGasto = computed(() => modal.f.codigo.startsWith('6'));
const destinosDebe = computed(() => cuentas.value.filter((c) => c.codigo.startsWith('9') && c.imputable));
const destinosHaber = computed(() => cuentas.value.filter((c) => c.codigo.startsWith('79') && c.imputable));
async function guardarCuenta() {
  modal.guardando = true;
  const f = modal.f;
  const cuerpo = {
    empresaId: contexto.empresaActivaId, nombre: f.nombre, pideTercero: f.pideTercero,
    ...(f.naturaleza && { naturaleza: f.naturaleza }),
    destinoDebe: esGasto.value ? f.destinoDebe || null : null, destinoHaber: esGasto.value ? f.destinoHaber || null : null,
  };
  try {
    if (f.id) await api.put(`/contabilidad/plan/cuentas/${f.id}`, { ...cuerpo, activo: f.activo });
    else await api.post('/contabilidad/plan/cuentas', { ...cuerpo, codigo: f.codigo });
    toast.exito(f.id ? 'Cuenta actualizada' : `Cuenta ${f.codigo} creada`);
    modal.abierto = false;
    await cargar();
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    modal.guardando = false;
  }
}
async function eliminar(c) {
  if (!(await confirmar({ titulo: `¿Eliminar la cuenta ${c.codigo}?`, texto: c.nombre, confirmar: 'Eliminar cuenta', peligro: true }))) return;
  try {
    await api.delete(`/contabilidad/plan/cuentas/${c.id}`, { params: { empresaId: contexto.empresaActivaId } });
    toast.exito('Cuenta eliminada');
    await cargar();
  } catch (e) {
    toast.error(mensajeError(e));
  }
}
const accionesFila = (c) => (datos.value?.acciones.editar ? [
  c.codigo.length < 10 && { texto: 'Agregar subcuenta', icono: 'agregar', alHacer: () => nueva(c) },
  { texto: 'Editar', icono: 'editar', alHacer: () => editar(c) },
  !c.hijas && { separador: true },
  !c.hijas && { texto: 'Eliminar', icono: 'eliminar', peligro: true, alHacer: () => eliminar(c) },
] : []);

// ── Cuentas por operación ──
const elegidas = ref({});
const opciones = computed(() => cuentas.value.filter((c) => c.imputable && c.activo));
const grupos = computed(() => {
  const g = new Map();
  for (const o of cfg.value?.operaciones ?? []) (g.get(o.grupo) ?? g.set(o.grupo, []).get(o.grupo)).push(o);
  return [...g];
});
const cambios = computed(() => (cfg.value?.operaciones ?? []).some((o) => (o.codigo ?? '') !== elegidas.value[o.clave]));
const guardandoCfg = ref(false);
function usarSugeridas() {
  elegidas.value = { ...elegidas.value, ...cfg.value.sugeridas };
}
async function guardarConfig() {
  guardandoCfg.value = true;
  try {
    cfg.value = (await api.put('/contabilidad/configuracion', { empresaId: contexto.empresaActivaId, cuentas: elegidas.value })).data;
    toast.exito('Cuentas por operación guardadas');
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    guardandoCfg.value = false;
  }
}
const problemas = computed(() => (cfg.value?.operaciones ?? []).filter((o) => o.problema || !o.codigo).length);
</script>

<template>
  <EncabezadoPagina titulo="Plan contable" :subtitulo="contexto.empresaActiva?.razonSocial">
    <button v-if="datos?.acciones.editar && !vacio && vista === 'plan'" class="btn-primario" @click="nueva()"><Icono nombre="agregar" /> Nueva cuenta</button>
  </EncabezadoPagina>

  <p v-if="cargando && !datos" class="text-sm text-slate-500">Cargando…</p>

  <!-- Sin plan todavía -->
  <section v-else-if="vacio" class="tarjeta mx-auto max-w-2xl p-6 text-center sm:p-8">
    <span class="mx-auto flex size-12 items-center justify-center rounded-xl bg-marca-50 text-marca-700"><Icono nombre="kardex" clase="size-6" /></span>
    <h2 class="mt-4 text-lg font-semibold">Esta empresa aún no tiene plan contable</h2>
    <p class="mt-1 text-sm text-slate-600">Cargue el PCGE base (Plan Contable General Empresarial) o copie el plan de otra empresa del estudio. Luego puede agregar o editar las cuentas que necesite.</p>
    <template v-if="datos.acciones.editar">
      <button class="btn-primario mt-5" :disabled="copia.ocupado" @click="cargarBase"><Icono nombre="descargar" clase="size-4" /> Cargar PCGE base</button>
      <div v-if="otras.length" class="mx-auto mt-5 flex max-w-md flex-col gap-2 border-t border-slate-100 pt-5 sm:flex-row">
        <select v-model="copia.desde" class="input" aria-label="Empresa de la que se copia el plan">
          <option value="">Copiar el plan de…</option>
          <option v-for="e in otras" :key="e.id" :value="e.id">{{ e.razonSocial }}</option>
        </select>
        <button class="btn-secundario shrink-0" :disabled="!copia.desde || copia.ocupado" @click="copiar"><Icono nombre="clonar" clase="size-4" /> Copiar</button>
      </div>
    </template>
    <p v-else class="mt-4 text-sm text-slate-500">Pida al contador a cargo que cargue el plan.</p>
  </section>

  <template v-else-if="datos">
    <div class="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
      <button
        v-for="[k, t] in [['plan', `Plan de cuentas (${cuentas.length})`], ['operaciones', 'Cuentas por operación']]"
        :key="k"
        role="tab"
        :aria-selected="vista === k"
        class="-mb-px inline-flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-sm font-medium whitespace-nowrap"
        :class="vista === k ? 'border-marca-700 text-marca-700' : 'border-transparent text-slate-500 hover:text-slate-700'"
        @click="irA(k)"
      >
        {{ t }}
        <span v-if="k === 'operaciones' && problemas" class="insignia bg-amber-50 text-amber-800">{{ problemas }}</span>
      </button>
    </div>

    <!-- Plan de cuentas -->
    <template v-if="vista === 'plan'">
      <div class="mb-4 grid gap-2 sm:grid-cols-[1fr_16rem_auto_auto] sm:items-center">
        <CampoBusqueda v-model="filtro.q" placeholder="Código o nombre de la cuenta" />
        <select v-model="filtro.elemento" class="input" aria-label="Elemento">
          <option value="">Todos los elementos</option>
          <option v-for="(n, k) in datos.elementos" :key="k" :value="k">{{ k }} · {{ n }}</option>
        </select>
        <label class="flex min-h-11 items-center gap-2 text-sm whitespace-nowrap"><input v-model="filtro.soloImputables" type="checkbox" class="size-4 accent-marca-700" /> Solo las que reciben movimientos</label>
        <BotonColumnas :columnas="columnas" />
      </div>
      <TablaResponsiva :columnas="columnas" :filas="visibles" vacio="Ninguna cuenta coincide">
        <template #celda-codigo="{ fila }">
          <div class="flex items-baseline gap-2" :style="{ paddingLeft: `${(fila.nivel - 1) * 1.1}rem` }">
            <span class="font-mono text-sm" :class="fila.imputable ? 'text-slate-700' : 'font-semibold text-slate-900'">{{ fila.codigo }}</span>
            <span :class="[fila.imputable ? '' : 'font-semibold', fila.activo ? '' : 'text-slate-400 line-through']">{{ fila.nombre }}</span>
            <span v-if="enUso.has(fila.codigo)" class="insignia shrink-0 bg-marca-50 text-marca-700" title="Asignada a una operación">En uso</span>
            <span v-if="!fila.activo" class="insignia shrink-0 bg-slate-100 text-slate-500">Inactiva</span>
          </div>
        </template>
        <template #celda-naturaleza="{ fila }"><span class="text-sm text-slate-600">{{ fila.naturaleza === 'DEUDORA' ? 'Deudora' : 'Acreedora' }}</span></template>
        <template #celda-imputable="{ fila }">
          <span v-if="fila.imputable" class="insignia bg-emerald-50 text-emerald-700">Recibe</span>
          <span v-else class="text-xs text-slate-500">Agrupa {{ fila.hijas }}</span>
          <span v-if="fila.pideTercero" class="insignia ml-1 bg-slate-100 text-slate-600" title="Se analiza por cliente o proveedor">Por tercero</span>
        </template>
        <template #celda-destino="{ fila }">
          <span v-if="fila.destino" class="font-mono text-xs" :class="fila.destino.heredado ? 'text-slate-400' : 'text-slate-700'" :title="fila.destino.heredado ? `Heredado de la cuenta ${fila.destino.heredado}` : ''">
            {{ fila.destino.debe }} / {{ fila.destino.haber }}
          </span>
        </template>
        <template v-if="datos.acciones.editar" #acciones="{ fila }"><MenuAcciones :acciones="accionesFila(fila)" :etiqueta="`Acciones de la cuenta ${fila.codigo}`" /></template>
      </TablaResponsiva>
      <Paginacion :pag="pag" />
    </template>

    <!-- Cuentas por operación -->
    <template v-else-if="cfg">
      <p class="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
        Con estas cuentas se arman los asientos automáticos de ventas, compras, cobranzas e inventario. Solo se eligen cuentas que reciben movimientos.
      </p>
      <div class="space-y-4">
        <section v-for="[grupo, ops] in grupos" :key="grupo" class="tarjeta p-4 sm:p-5">
          <h2 class="mb-3 font-semibold">{{ grupo }}</h2>
          <div class="grid gap-x-6 gap-y-4 md:grid-cols-2">
            <div v-for="o in ops" :key="o.clave">
              <label class="etiqueta" :for="`op-${o.clave}`">{{ o.nombre }}</label>
              <select :id="`op-${o.clave}`" v-model="elegidas[o.clave]" class="input font-mono text-sm" :disabled="!cfg.acciones.editar">
                <option value="">Sin asignar</option>
                <option v-for="c in opciones" :key="c.codigo" :value="c.codigo">{{ c.codigo }} · {{ c.nombre }}</option>
                <option v-if="o.codigo && !opciones.some((c) => c.codigo === o.codigo)" :value="o.codigo">{{ o.codigo }} (no válida)</option>
              </select>
              <p v-if="o.problema" class="mt-1 text-xs text-red-600">{{ o.problema }}</p>
              <p v-else-if="!elegidas[o.clave]" class="mt-1 text-xs text-amber-700">Sin cuenta: esta operación no se podrá contabilizar. Sugerida: {{ o.sugerida }}</p>
            </div>
          </div>
        </section>
      </div>
      <div v-if="cfg.acciones.editar" class="sticky bottom-0 mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50/90 py-3 backdrop-blur">
        <button class="btn-secundario" @click="usarSugeridas">Usar las sugeridas</button>
        <button class="btn-primario" :disabled="!cambios || guardandoCfg" @click="guardarConfig">{{ guardandoCfg ? 'Guardando…' : 'Guardar' }}</button>
      </div>
    </template>
  </template>

  <!-- Nueva cuenta / editar -->
  <BaseModal :abierto="modal.abierto" :titulo="modal.f.id ? `Editar cuenta ${modal.f.codigo}` : 'Nueva cuenta'" @cerrar="modal.abierto = false">
    <form id="form-cuenta" class="space-y-4" @submit.prevent="guardarCuenta">
      <div class="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <div>
          <label class="etiqueta" for="cta-cod">Código *</label>
          <input id="cta-cod" v-model="modal.f.codigo" class="input font-mono" inputmode="numeric" maxlength="10" pattern="[1-9][0-9]{1,9}" required :disabled="!!modal.f.id" />
        </div>
        <div>
          <label class="etiqueta" for="cta-nom">Nombre *</label>
          <input id="cta-nom" v-model="modal.f.nombre" class="input" minlength="2" maxlength="150" required />
        </div>
      </div>
      <p v-if="!modal.f.id" class="text-xs text-slate-500">El código empieza con el de su cuenta padre (p. ej. 63651 va bajo 6365). La cuenta padre deja de recibir movimientos.</p>
      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label class="etiqueta" for="cta-nat">Naturaleza</label>
          <select id="cta-nat" v-model="modal.f.naturaleza" class="input">
            <option v-if="!modal.f.id" value="">Según el PCGE</option>
            <option value="DEUDORA">Deudora</option>
            <option value="ACREEDORA">Acreedora</option>
          </select>
        </div>
        <label class="flex min-h-11 items-center gap-2 pt-1 text-sm sm:pt-6"><input v-model="modal.f.pideTercero" type="checkbox" class="size-4 accent-marca-700" /> Se analiza por cliente o proveedor</label>
      </div>
      <fieldset v-if="esGasto" class="space-y-2 rounded-xl border border-slate-200 p-3">
        <legend class="px-1 text-sm font-medium">Cuentas de destino (amarre)</legend>
        <p class="text-xs text-slate-500">Vacías: hereda el destino de la cuenta padre.</p>
        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label class="etiqueta" for="cta-dd">Debe (elemento 9)</label>
            <select id="cta-dd" v-model="modal.f.destinoDebe" class="input font-mono text-sm">
              <option value="">Heredado</option>
              <option v-for="c in destinosDebe" :key="c.codigo" :value="c.codigo">{{ c.codigo }} · {{ c.nombre }}</option>
            </select>
          </div>
          <div>
            <label class="etiqueta" for="cta-dh">Haber (79)</label>
            <select id="cta-dh" v-model="modal.f.destinoHaber" class="input font-mono text-sm">
              <option value="">Heredado</option>
              <option v-for="c in destinosHaber" :key="c.codigo" :value="c.codigo">{{ c.codigo }} · {{ c.nombre }}</option>
            </select>
          </div>
        </div>
      </fieldset>
      <label v-if="modal.f.id" class="flex items-center gap-2 text-sm"><input v-model="modal.f.activo" type="checkbox" class="size-4 accent-marca-700" /> Cuenta activa</label>
    </form>
    <template #pie>
      <button class="btn-secundario" @click="modal.abierto = false">Cancelar</button>
      <button class="btn-primario" form="form-cuenta" :disabled="modal.guardando">{{ modal.guardando ? 'Guardando…' : 'Guardar' }}</button>
    </template>
  </BaseModal>
</template>
