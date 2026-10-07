<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { api, mensajeError } from '@/services/api';
import { useToast } from '@/stores/toast';
import BaseModal from './BaseModal.vue';
import Icono from './Icono.vue';

/**
 * Configuración de la facturación electrónica de UNA empresa: proveedor (OSE/PSE), ambiente,
 * ruta y token. El token nunca vuelve al navegador: solo se indica si ya hay uno guardado.
 */
const props = defineProps({
  abierto: Boolean,
  empresa: { type: Object, default: null }, // { id, razonSocial, ruc }
});
const emit = defineEmits(['cerrar', 'guardado']);
const toast = useToast();

const proveedores = ref([]);
const f = reactive({ proveedor: 'SIMULADO', ambiente: 'PRUEBAS', url: '', token: '', envioAutomatico: true, activo: true, sunatClientId: '', sunatClientSecret: '', serieGuia: 'T001' });
const estado = reactive({ cargando: false, guardando: false, probando: false, tieneToken: false, tieneSunatSecret: false, existe: false, prueba: null, verToken: false });

watch(
  () => props.abierto,
  async (v) => {
    if (!v || !props.empresa) return;
    Object.assign(estado, { cargando: true, prueba: null, verToken: false });
    try {
      const [p, c] = await Promise.all([
        proveedores.value.length ? { data: proveedores.value } : api.get('/cpe/proveedores'),
        api.get('/cpe/config', { params: { empresaId: props.empresa.id } }),
      ]);
      proveedores.value = p.data;
      const cfg = c.data;
      Object.assign(f, cfg
        ? { proveedor: cfg.proveedor, ambiente: cfg.ambiente, url: cfg.url ?? '', token: '', envioAutomatico: cfg.envioAutomatico, activo: cfg.activo, sunatClientId: cfg.sunatClientId ?? '', sunatClientSecret: '', serieGuia: cfg.serieGuia ?? 'T001' }
        : { proveedor: 'SIMULADO', ambiente: 'PRUEBAS', url: '', token: '', envioAutomatico: true, activo: true, sunatClientId: '', sunatClientSecret: '', serieGuia: 'T001' });
      Object.assign(estado, { tieneToken: Boolean(cfg?.tieneToken), tieneSunatSecret: Boolean(cfg?.tieneSunatSecret), existe: Boolean(cfg) });
    } catch (e) {
      toast.error(mensajeError(e));
      emit('cerrar');
    } finally {
      estado.cargando = false;
    }
  },
  { immediate: true },
);

const real = computed(() => f.proveedor !== 'SIMULADO');
const error = computed(() => {
  if (!real.value) return '';
  if (!f.url) return 'Ingrese la RUTA que le entregó el proveedor';
  if (!f.token && !estado.tieneToken) return 'Ingrese el TOKEN del proveedor';
  return '';
});
const errorSunat = computed(() => {
  if (f.sunatClientId && !f.sunatClientSecret && !estado.tieneSunatSecret) return 'Ingrese también la clave (client secret) de la API de SUNAT';
  return '';
});

async function guardar() {
  estado.guardando = true;
  try {
    await api.put('/cpe/config', {
      empresaId: props.empresa.id, ...f, url: real.value ? f.url : null, token: f.token || null,
      sunatClientId: f.sunatClientId || null, sunatClientSecret: f.sunatClientSecret || null,
    });
    toast.exito('Facturación electrónica guardada');
    Object.assign(estado, { existe: true, tieneToken: estado.tieneToken || Boolean(f.token), tieneSunatSecret: estado.tieneSunatSecret || Boolean(f.sunatClientSecret) });
    f.token = '';
    f.sunatClientSecret = '';
    emit('guardado');
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    estado.guardando = false;
  }
}
async function probar() {
  estado.probando = true;
  try {
    estado.prueba = (await api.post('/cpe/config/probar', { empresaId: props.empresa.id })).data;
  } catch (e) {
    estado.prueba = { ok: false, mensaje: mensajeError(e) };
  } finally {
    estado.probando = false;
  }
}
</script>

<template>
  <BaseModal :abierto="abierto" :titulo="`Facturación electrónica · ${empresa?.razonSocial ?? ''}`" ancho="sm:max-w-2xl" @cerrar="emit('cerrar')">
    <p v-if="estado.cargando" class="py-8 text-center text-sm text-slate-500">Cargando…</p>
    <form v-else id="form-facturacion" class="space-y-5" @submit.prevent="guardar">
      <p class="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
        Los comprobantes de <strong>RUC {{ empresa?.ruc }}</strong> se envían a SUNAT por medio de un proveedor autorizado (OSE/PSE), que firma el XML y devuelve la
        constancia (CDR). Cada empresa usa su propia cuenta del proveedor.
      </p>

      <!-- Proveedor -->
      <fieldset>
        <legend class="etiqueta">Proveedor</legend>
        <div class="grid gap-2 sm:grid-cols-2">
          <label
            v-for="p in proveedores"
            :key="p.codigo"
            class="flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition"
            :class="f.proveedor === p.codigo ? 'border-marca-600 bg-marca-50/60 ring-1 ring-marca-600' : 'border-slate-200 hover:border-slate-300'"
          >
            <input v-model="f.proveedor" type="radio" :value="p.codigo" class="mt-0.5 size-4 accent-marca-700" />
            <span>
              <span class="block font-medium">{{ p.nombre }}</span>
              <span class="text-xs text-slate-500">{{ p.codigo === 'SIMULADO' ? 'Responde como SUNAT sin enviar nada. Para capacitar y probar.' : 'Envío real por medio de su cuenta del proveedor.' }}</span>
            </span>
          </label>
        </div>
      </fieldset>

      <!-- Credenciales del proveedor -->
      <div v-if="real" class="grid gap-3 sm:grid-cols-2">
        <div class="sm:col-span-2">
          <label class="etiqueta" for="fe-url">RUTA del API *</label>
          <input id="fe-url" v-model="f.url" type="url" class="input font-mono text-sm" placeholder="https://api.nubefact.com/api/v1/…" autocomplete="off" />
          <p class="mt-1 text-xs text-slate-500">La encuentra en su panel de Nubefact → API (integración). Es distinta en cada cuenta.</p>
        </div>
        <div class="sm:col-span-2">
          <label class="etiqueta" for="fe-token">TOKEN {{ estado.tieneToken ? '(ya guardado: déjelo vacío para conservarlo)' : '*' }}</label>
          <div class="relative">
            <input
              id="fe-token"
              v-model="f.token"
              :type="estado.verToken ? 'text' : 'password'"
              class="input pr-11 font-mono text-sm"
              :placeholder="estado.tieneToken ? '••••••••••••  (guardado)' : 'Pegue aquí el token'"
              autocomplete="new-password"
            />
            <button type="button" class="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center text-slate-400 hover:text-slate-600" :aria-label="estado.verToken ? 'Ocultar token' : 'Mostrar token'" @click="estado.verToken = !estado.verToken">
              <Icono :nombre="estado.verToken ? 'ojoTachado' : 'ojo'" clase="size-5" />
            </button>
          </div>
          <p class="mt-1 text-xs text-slate-500">Se guarda cifrado. Por seguridad no se vuelve a mostrar.</p>
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label class="etiqueta" for="fe-amb">Ambiente</label>
          <select id="fe-amb" v-model="f.ambiente" class="input">
            <option value="PRUEBAS">Pruebas (sin validez tributaria)</option>
            <option value="PRODUCCION">Producción</option>
          </select>
          <label class="etiqueta mt-3" for="fe-sguia">Serie de guías de remisión</label>
          <input id="fe-sguia" v-model="f.serieGuia" class="input font-mono uppercase" maxlength="4" pattern="[Tt][A-Za-z0-9]{3}" title="T + 3 caracteres, p. ej. T001" />
        </div>
        <div class="space-y-2 pt-1 sm:pt-6">
          <label class="flex items-center gap-2 text-sm"><input v-model="f.envioAutomatico" type="checkbox" class="size-4 accent-marca-700" /> Enviar cada comprobante al emitirlo</label>
          <label class="flex items-center gap-2 text-sm"><input v-model="f.activo" type="checkbox" class="size-4 accent-marca-700" /> Facturación electrónica activa</label>
        </div>
      </div>
      <p v-if="f.ambiente === 'PRODUCCION' && f.proveedor === 'SIMULADO'" class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
        El proveedor simulado no envía nada a SUNAT: en producción use un proveedor real.
      </p>

      <!-- API SUNAT: validar los comprobantes de las compras -->
      <fieldset class="space-y-3 rounded-xl border border-slate-200 p-3">
        <legend class="px-1 text-sm font-medium">Validación de compras (API de SUNAT)</legend>
        <p class="text-xs text-slate-500">
          Para verificar en SUNAT que las facturas de los proveedores existen y están vigentes. Las credenciales se generan en
          SUNAT Operaciones en Línea → <em>Credenciales de API SUNAT</em>, con la clave SOL de la empresa.
          {{ f.proveedor === 'SIMULADO' ? 'Sin credenciales, en modo simulado se valida de prueba.' : '' }}
        </p>
        <div class="grid gap-3 sm:grid-cols-2">
          <div><label class="etiqueta" for="fe-cid">ID de cliente (client_id)</label><input id="fe-cid" v-model="f.sunatClientId" class="input font-mono text-sm" autocomplete="off" /></div>
          <div>
            <label class="etiqueta" for="fe-csec">Clave (client_secret) {{ estado.tieneSunatSecret ? '· guardada' : '' }}</label>
            <input id="fe-csec" v-model="f.sunatClientSecret" type="password" class="input font-mono text-sm" :placeholder="estado.tieneSunatSecret ? '•••••••• (guardada)' : ''" autocomplete="new-password" />
          </div>
        </div>
        <p v-if="errorSunat" class="text-xs text-red-600">{{ errorSunat }}</p>
      </fieldset>

      <p v-if="estado.prueba" class="flex items-start gap-2 rounded-lg px-3 py-2 text-sm" :class="estado.prueba.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'">
        <Icono :nombre="estado.prueba.ok ? 'check' : 'alerta'" clase="mt-0.5 size-4 shrink-0" /> {{ estado.prueba.mensaje }}
      </p>
      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
    </form>

    <template #pie>
      <button v-if="estado.existe" type="button" class="btn-secundario mr-auto" :disabled="estado.probando" @click="probar">
        {{ estado.probando ? 'Probando…' : 'Probar conexión' }}
      </button>
      <button class="btn-secundario" @click="emit('cerrar')">Cerrar</button>
      <button class="btn-primario" form="form-facturacion" :disabled="estado.guardando || !!error || !!errorSunat">{{ estado.guardando ? 'Guardando…' : 'Guardar' }}</button>
    </template>
  </BaseModal>
</template>
