<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { api, mensajeError } from '@/services/api';
import { useToast } from '@/stores/toast';
import BaseModal from './BaseModal.vue';
import Icono from './Icono.vue';

/**
 * Configuración de la facturación electrónica de UNA empresa: proveedor, ambiente y credenciales.
 * - Nubefact (OSE/PSE): ruta y token.
 * - SUNAT directo (servicio propio): certificado digital, usuario y clave SOL, API de guías.
 * Ningún secreto vuelve al navegador: solo se indica si ya hay uno guardado.
 */
const props = defineProps({
  abierto: Boolean,
  empresa: { type: Object, default: null }, // { id, razonSocial, ruc }
});
const emit = defineEmits(['cerrar', 'guardado']);
const toast = useToast();

const proveedores = ref([]);
const VACIO = { proveedor: 'SIMULADO', ambiente: 'PRUEBAS', url: '', token: '', envioAutomatico: true, activo: true, sunatClientId: '', sunatClientSecret: '', serieGuia: 'T001', solUsuario: '', solClave: '', greClientId: '', greClientSecret: '' };
const f = reactive({ ...VACIO });
const estado = reactive({
  cargando: false, guardando: false, probando: false, existe: false, prueba: null, verToken: false,
  tieneToken: false, tieneSunatSecret: false, tieneSolClave: false, tieneGreSecret: false,
});
const certificado = reactive({ titular: null, vence: null, archivo: null, clave: '', subiendo: false, error: '' });
const DESCRIPCION = {
  SIMULADO: 'Responde como SUNAT sin enviar nada. Para capacitar y probar.',
  NUBEFACT: 'Envío por medio de su cuenta de Nubefact (OSE/PSE).',
  SUNAT_DIRECTO: 'Envío directo a SUNAT con el certificado digital y la clave SOL de la empresa.',
};

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
      Object.assign(f, VACIO, cfg && {
        proveedor: cfg.proveedor, ambiente: cfg.ambiente, url: cfg.url ?? '', envioAutomatico: cfg.envioAutomatico, activo: cfg.activo,
        sunatClientId: cfg.sunatClientId ?? '', serieGuia: cfg.serieGuia ?? 'T001', solUsuario: cfg.solUsuario ?? '', greClientId: cfg.greClientId ?? '',
      });
      Object.assign(estado, {
        existe: Boolean(cfg), tieneToken: Boolean(cfg?.tieneToken), tieneSunatSecret: Boolean(cfg?.tieneSunatSecret),
        tieneSolClave: Boolean(cfg?.tieneSolClave), tieneGreSecret: Boolean(cfg?.tieneGreSecret),
      });
      Object.assign(certificado, { titular: cfg?.certificadoTitular ?? null, vence: cfg?.certificadoVence ?? null, archivo: null, clave: '', error: '' });
    } catch (e) {
      toast.error(mensajeError(e));
      emit('cerrar');
    } finally {
      estado.cargando = false;
    }
  },
  { immediate: true },
);

const nubefact = computed(() => f.proveedor === 'NUBEFACT');
const directo = computed(() => f.proveedor === 'SUNAT_DIRECTO');
const error = computed(() => {
  if (nubefact.value) {
    if (!f.url) return 'Ingrese la RUTA que le entregó el proveedor';
    if (!f.token && !estado.tieneToken) return 'Ingrese el TOKEN del proveedor';
  }
  // En pruebas (beta de SUNAT) no hacen falta: se usa el usuario de prueba y un certificado de prueba
  if (directo.value && f.ambiente === 'PRODUCCION') {
    if (!certificado.titular) return 'Suba el certificado digital de la empresa';
    if (!f.solUsuario) return 'Ingrese el usuario SOL secundario';
    if (!f.solClave && !estado.tieneSolClave) return 'Ingrese la clave SOL';
  }
  return '';
});
const errorGuias = computed(() => (f.greClientId && !f.greClientSecret && !estado.tieneGreSecret ? 'Ingrese también la clave (client secret) de la API de guías' : ''));
const vencido = computed(() => certificado.vence && new Date(certificado.vence) < new Date());
const errorSunat = computed(() => {
  if (f.sunatClientId && !f.sunatClientSecret && !estado.tieneSunatSecret) return 'Ingrese también la clave (client secret) de la API de SUNAT';
  return '';
});

async function guardar() {
  estado.guardando = true;
  try {
    await api.put('/cpe/config', {
      empresaId: props.empresa.id, ...f, url: nubefact.value ? f.url : null, token: f.token || null,
      sunatClientId: f.sunatClientId || null, sunatClientSecret: f.sunatClientSecret || null,
      solUsuario: f.solUsuario || null, solClave: f.solClave || null, greClientId: f.greClientId || null, greClientSecret: f.greClientSecret || null,
    });
    toast.exito('Facturación electrónica guardada');
    Object.assign(estado, {
      existe: true,
      tieneToken: estado.tieneToken || Boolean(f.token), tieneSunatSecret: estado.tieneSunatSecret || Boolean(f.sunatClientSecret),
      tieneSolClave: estado.tieneSolClave || Boolean(f.solClave), tieneGreSecret: estado.tieneGreSecret || Boolean(f.greClientSecret),
    });
    Object.assign(f, { token: '', sunatClientSecret: '', solClave: '', greClientSecret: '' });
    emit('guardado');
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    estado.guardando = false;
  }
}
/** El .pfx viaja en base64 al servidor, que lo convierte y lo guarda cifrado; no queda en el navegador */
function leerBase64(archivo) {
  return new Promise((ok, falla) => {
    const lector = new FileReader();
    lector.onload = () => ok(String(lector.result).split(',')[1]);
    lector.onerror = () => falla(new Error('No se pudo leer el archivo'));
    lector.readAsDataURL(archivo);
  });
}
async function subirCertificado() {
  if (!certificado.archivo) return;
  Object.assign(certificado, { subiendo: true, error: '' });
  try {
    const pfx = await leerBase64(certificado.archivo);
    const { data } = await api.post('/cpe/config/certificado', { empresaId: props.empresa.id, pfx, clave: certificado.clave });
    Object.assign(certificado, { titular: data.titular, vence: data.venceEn, archivo: null, clave: '' });
    estado.existe = true;
    toast.exito('Certificado digital guardado');
  } catch (e) {
    certificado.error = mensajeError(e);
  } finally {
    certificado.subiendo = false;
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
        Los comprobantes de <strong>RUC {{ empresa?.ruc }}</strong> se firman y se envían a SUNAT, que devuelve la constancia (CDR). Puede hacerlo un proveedor
        autorizado (OSE/PSE) con su cuenta, o el sistema directamente con el certificado digital y la clave SOL de la empresa.
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
              <span class="text-xs text-slate-500">{{ DESCRIPCION[p.codigo] ?? 'Envío real por medio de su cuenta del proveedor.' }}</span>
            </span>
          </label>
        </div>
      </fieldset>

      <!-- Credenciales del proveedor -->
      <div v-if="nubefact" class="grid gap-3 sm:grid-cols-2">
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

      <!-- SUNAT directo: certificado digital y clave SOL de la empresa -->
      <div v-if="directo" class="space-y-4">
        <p v-if="f.ambiente === 'PRUEBAS'" class="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">
          En pruebas se usa el entorno beta de SUNAT: no necesita certificado ni clave SOL. Cárguelos antes de pasar a producción.
        </p>
        <fieldset class="space-y-3 rounded-xl border border-slate-200 p-3">
          <legend class="px-1 text-sm font-medium">Certificado digital</legend>
          <p v-if="certificado.titular" class="flex items-start gap-2 text-sm" :class="vencido ? 'text-red-700' : 'text-slate-700'">
            <Icono :nombre="vencido ? 'alerta' : 'check'" clase="mt-0.5 size-4 shrink-0" :class="vencido ? '' : 'text-emerald-600'" />
            <span>{{ certificado.titular }} · {{ vencido ? 'venció' : 'vence' }} el {{ new Date(certificado.vence).toLocaleDateString('es-PE') }}</span>
          </p>
          <p v-else class="text-sm text-slate-500">Aún no se ha subido. Es el archivo .pfx o .p12 que emitió la entidad certificadora (o SUNAT) para el RUC.</p>
          <div class="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
            <div class="min-w-0">
              <label class="etiqueta" for="fe-cert">{{ certificado.titular ? 'Reemplazar por otro archivo' : 'Archivo del certificado' }}</label>
              <input id="fe-cert" type="file" accept=".pfx,.p12" class="input text-sm" @change="certificado.archivo = $event.target.files?.[0] ?? null" />
            </div>
            <div>
              <label class="etiqueta" for="fe-cert-clave">Contraseña del archivo</label>
              <input id="fe-cert-clave" v-model="certificado.clave" type="password" class="input" autocomplete="new-password" />
            </div>
            <button type="button" class="btn-secundario" :disabled="!certificado.archivo || certificado.subiendo" @click="subirCertificado">
              {{ certificado.subiendo ? 'Subiendo…' : 'Subir' }}
            </button>
          </div>
          <p v-if="certificado.error" class="text-sm text-red-600">{{ certificado.error }}</p>
          <p class="text-xs text-slate-500">Se guarda cifrado en el servidor y nunca se vuelve a descargar.</p>
        </fieldset>

        <fieldset class="space-y-3 rounded-xl border border-slate-200 p-3">
          <legend class="px-1 text-sm font-medium">Clave SOL</legend>
          <p class="text-xs text-slate-500">Use un usuario secundario creado en SUNAT Operaciones en Línea solo para emitir comprobantes, no la clave del titular.</p>
          <div class="grid gap-3 sm:grid-cols-2">
            <div><label class="etiqueta" for="fe-sol">Usuario SOL secundario</label><input id="fe-sol" v-model="f.solUsuario" class="input font-mono uppercase" maxlength="30" autocomplete="off" placeholder="p. ej. FACTURA1" /></div>
            <div>
              <label class="etiqueta" for="fe-sol-clave">Clave SOL {{ estado.tieneSolClave ? '· guardada' : '' }}</label>
              <input id="fe-sol-clave" v-model="f.solClave" type="password" class="input" :placeholder="estado.tieneSolClave ? '•••••••• (guardada)' : ''" autocomplete="new-password" />
            </div>
          </div>
        </fieldset>

        <fieldset class="space-y-3 rounded-xl border border-slate-200 p-3">
          <legend class="px-1 text-sm font-medium">Guías de remisión (API de SUNAT)</legend>
          <p class="text-xs text-slate-500">SUNAT recibe las guías por su API: genere las credenciales en SOL → <em>Credenciales de API SUNAT</em>. Solo si la empresa emite guías.</p>
          <div class="grid gap-3 sm:grid-cols-2">
            <div><label class="etiqueta" for="fe-gid">ID de cliente (client_id)</label><input id="fe-gid" v-model="f.greClientId" class="input font-mono text-sm" autocomplete="off" /></div>
            <div>
              <label class="etiqueta" for="fe-gsec">Clave (client_secret) {{ estado.tieneGreSecret ? '· guardada' : '' }}</label>
              <input id="fe-gsec" v-model="f.greClientSecret" type="password" class="input font-mono text-sm" :placeholder="estado.tieneGreSecret ? '•••••••• (guardada)' : ''" autocomplete="new-password" />
            </div>
          </div>
          <p v-if="errorGuias" class="text-xs text-red-600">{{ errorGuias }}</p>
        </fieldset>
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
      <button class="btn-primario" form="form-facturacion" :disabled="estado.guardando || !!error || !!errorSunat || !!errorGuias">{{ estado.guardando ? 'Guardando…' : 'Guardar' }}</button>
    </template>
  </BaseModal>
</template>
