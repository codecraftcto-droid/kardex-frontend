<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { api, mensajeError } from '@/services/api';
import { useAuth } from '@/stores/auth';
import { useToast } from '@/stores/toast';
import { TIPOS_DOCUMENTO, rucDesdeDni, rucValido } from '@/utils/pos';
import Icono from './Icono.vue';
import BaseModal from './BaseModal.vue';

/** Alta o edición de un cliente. Se usa en Clientes y en la caja (alta rápida). */
const props = defineProps({
  abierto: Boolean,
  empresaId: { type: String, required: true },
  cliente: { type: Object, default: null },
  /** Valores iniciales (p. ej. el documento que el cajero ya escribió) */
  inicial: { type: Object, default: () => ({}) },
  /** Factura: solo RUC */
  soloRuc: Boolean,
});
const emit = defineEmits(['cerrar', 'guardado']);
const toast = useToast();
const auth = useAuth();
const puedeCredito = computed(() => auth.canEnEmpresa('clientes.credito.configurar', props.empresaId));

const vacio = () => ({
  tipoDocumento: 'DNI', numeroDocumento: '', nombre: '', direccion: '', email: '', telefono: '', rucAsociado: '',
  creditoHabilitado: false, limiteCredito: '', diasCredito: 30, activo: true,
});
const f = reactive(vacio());
const consulta = reactive({ cargando: false, aviso: '' });
const estado = reactive({ guardando: false });
watch(
  () => props.abierto,
  (v) => {
    if (!v) return;
    const c = props.cliente;
    Object.assign(f, vacio(), c ? {
      ...c, direccion: c.direccion ?? '', email: c.email ?? '', telefono: c.telefono ?? '', rucAsociado: c.rucAsociado ?? '',
      limiteCredito: c.limiteCredito ?? '',
    } : props.inicial);
    if (props.soloRuc && !c) f.tipoDocumento = 'RUC';
    consulta.aviso = '';
  },
  { immediate: true },
);

const errorDoc = computed(() => {
  const n = f.numeroDocumento.trim();
  if (!n) return '';
  if (f.tipoDocumento === 'DNI' && !/^\d{8}$/.test(n)) return 'El DNI tiene 8 dígitos';
  if (f.tipoDocumento === 'RUC' && !rucValido(n)) return 'RUC inválido: revise los 11 dígitos';
  return '';
});
const errorRucAsociado = computed(() => {
  const r = f.rucAsociado.trim();
  return r && (!rucValido(r) || !r.startsWith('10')) ? 'Debe ser un RUC 10 válido' : '';
});
const rucSugerido = computed(() => (f.tipoDocumento === 'DNI' && !f.rucAsociado ? rucDesdeDni(f.numeroDocumento.trim()) : ''));

// Consulta RENIEC / SUNAT (solo si el estudio configuró el servicio)
const disponible = ref(false);
api.get('/clientes/consulta/disponible').then(({ data }) => (disponible.value = data.disponible)).catch(() => {});
const puedeConsultar = computed(() => disponible.value && ['DNI', 'RUC'].includes(f.tipoDocumento) && f.numeroDocumento.trim() && !errorDoc.value);
async function consultar() {
  consulta.cargando = true;
  consulta.aviso = '';
  try {
    const { data } = await api.get('/clientes/consulta', { params: { empresaId: props.empresaId, tipo: f.tipoDocumento, numero: f.numeroDocumento.trim() } });
    f.nombre = data.nombre;
    if (data.direccion) f.direccion = data.direccion;
    if (data.tipoDocumento === 'RUC' && (data.estado && data.estado !== 'ACTIVO' || data.condicion && data.condicion !== 'HABIDO')) {
      consulta.aviso = `Contribuyente ${data.estado || ''} ${data.condicion || ''}: SUNAT podría observar la factura.`;
    }
    if (data.existente && data.existente.id !== props.cliente?.id) consulta.aviso = `${consulta.aviso} Ya está registrado como "${data.existente.nombre}".`.trim();
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    consulta.cargando = false;
  }
}

async function guardar() {
  estado.guardando = true;
  try {
    const { activo, id, empresaId, creadoEn, actualizadoEn, tenantId, _count, creditoHabilitado, limiteCredito, diasCredito, ...resto } = f;
    const datos = { ...resto, rucAsociado: f.tipoDocumento === 'RUC' ? null : f.rucAsociado.trim() || null };
    // El crédito solo se envía si el usuario puede configurarlo
    if (puedeCredito.value) Object.assign(datos, { creditoHabilitado, limiteCredito: limiteCredito === '' ? null : String(limiteCredito), diasCredito: Number(diasCredito) || 0 });
    const { data } = props.cliente
      ? await api.put(`/clientes/${props.cliente.id}`, { ...datos, activo })
      : await api.post('/clientes', { ...datos, empresaId: props.empresaId });
    toast.exito(props.cliente ? 'Cliente actualizado' : 'Cliente registrado');
    emit('guardado', data);
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    estado.guardando = false;
  }
}
</script>

<template>
  <BaseModal :abierto="abierto" :titulo="cliente ? 'Editar cliente' : 'Nuevo cliente'" @cerrar="emit('cerrar')">
    <form id="form-cliente" class="grid gap-4 sm:grid-cols-[11rem_1fr]" @submit.prevent="guardar">
      <div>
        <label class="etiqueta" for="cl-tipo">Documento *</label>
        <select id="cl-tipo" v-model="f.tipoDocumento" class="input">
          <option v-for="(t, k) in TIPOS_DOCUMENTO" v-show="k !== 'SIN_DOCUMENTO'" :key="k" :value="k">{{ t }}</option>
        </select>
      </div>
      <div>
        <label class="etiqueta" for="cl-num">Número *</label>
        <div class="flex gap-2">
          <input id="cl-num" v-model="f.numeroDocumento" class="input font-mono" :inputmode="['DNI', 'RUC'].includes(f.tipoDocumento) ? 'numeric' : 'text'" maxlength="12" required />
          <button v-if="disponible" type="button" class="btn-secundario shrink-0 px-3" :disabled="!puedeConsultar || consulta.cargando" :title="f.tipoDocumento === 'RUC' ? 'Consultar en SUNAT' : 'Consultar en RENIEC'" @click="consultar">
            <Icono nombre="buscar" clase="size-4" /> {{ consulta.cargando ? '…' : f.tipoDocumento === 'RUC' ? 'SUNAT' : 'RENIEC' }}
          </button>
        </div>
        <p v-if="errorDoc" class="mt-1 text-xs text-red-600">{{ errorDoc }}</p>
      </div>
      <p v-if="consulta.aviso" class="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 sm:col-span-2">{{ consulta.aviso }}</p>
      <div class="sm:col-span-2">
        <label class="etiqueta" for="cl-nom">{{ f.tipoDocumento === 'RUC' ? 'Razón social' : 'Nombres y apellidos' }} *</label>
        <input id="cl-nom" v-model="f.nombre" class="input" maxlength="200" required />
      </div>
      <div class="sm:col-span-2">
        <label class="etiqueta" for="cl-dir">Dirección {{ f.tipoDocumento === 'RUC' ? '(se imprime en la factura)' : '' }}</label>
        <input id="cl-dir" v-model="f.direccion" class="input" maxlength="255" />
      </div>
      <div v-if="f.tipoDocumento !== 'RUC'" class="sm:col-span-2">
        <label class="etiqueta" for="cl-ruc10">RUC asociado (persona con negocio)</label>
        <div class="flex gap-2">
          <input id="cl-ruc10" v-model="f.rucAsociado" class="input font-mono" inputmode="numeric" maxlength="11" placeholder="10XXXXXXXXX" />
          <button v-if="rucSugerido" type="button" class="btn-secundario shrink-0 px-3 text-xs" title="El RUC 10 se forma con el DNI; confirme que la persona está inscrita" @click="f.rucAsociado = rucSugerido">Usar {{ rucSugerido }}</button>
        </div>
        <p v-if="errorRucAsociado" class="mt-1 text-xs text-red-600">{{ errorRucAsociado }}</p>
        <p v-else class="mt-1 text-xs text-slate-500">Si lo indica, a este cliente se le puede emitir factura con su RUC.</p>
      </div>
      <div><label class="etiqueta" for="cl-em">Correo</label><input id="cl-em" v-model="f.email" type="email" class="input" /></div>
      <div><label class="etiqueta" for="cl-tel">Teléfono</label><input id="cl-tel" v-model="f.telefono" type="tel" class="input" /></div>
      <fieldset v-if="puedeCredito" class="grid gap-3 rounded-lg border border-slate-200 p-3 sm:col-span-2 sm:grid-cols-3">
        <legend class="px-1 text-sm font-medium">Crédito</legend>
        <label class="flex min-h-11 items-center gap-2 text-sm sm:col-span-3"><input v-model="f.creditoHabilitado" type="checkbox" class="size-5 accent-marca-700" /> Puede comprar al crédito</label>
        <template v-if="f.creditoHabilitado">
          <div><label class="etiqueta" for="cl-lim">Límite S/</label><input id="cl-lim" v-model="f.limiteCredito" type="number" inputmode="decimal" min="0" step="0.01" class="input" placeholder="Sin tope" /></div>
          <div><label class="etiqueta" for="cl-dias">Plazo (días)</label><input id="cl-dias" v-model="f.diasCredito" type="number" inputmode="numeric" min="0" max="365" class="input" /></div>
        </template>
      </fieldset>
      <p v-else-if="cliente?.creditoHabilitado" class="text-sm text-slate-600 sm:col-span-2">
        Crédito habilitado{{ cliente.limiteCredito != null ? ` hasta S/ ${Number(cliente.limiteCredito).toFixed(2)}` : '' }} · {{ cliente.diasCredito }} días.
      </p>
      <label v-if="cliente" class="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
        <input v-model="f.activo" type="checkbox" class="size-5 accent-marca-700" /> Cliente activo
      </label>
    </form>
    <template #pie>
      <button class="btn-secundario" @click="emit('cerrar')">Cancelar</button>
      <button class="btn-primario" form="form-cliente" :disabled="estado.guardando || !!errorDoc || !!errorRucAsociado">Guardar</button>
    </template>
  </BaseModal>
</template>
