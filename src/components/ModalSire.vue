<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { api, mensajeError } from '@/services/api';
import { useToast } from '@/stores/toast';
import { fechaHora } from '@/utils/formato';
import BaseModal from './BaseModal.vue';
import Icono from './Icono.vue';

/**
 * Credenciales del SIRE de UNA empresa: credenciales API de SUNAT (client_id / secret) y un
 * usuario SOL con perfil SIRE. Los secretos nunca vuelven al navegador: solo se indica si existen.
 */
const props = defineProps({
  abierto: Boolean,
  empresa: { type: Object, default: null }, // { id, razonSocial, ruc }
});
const emit = defineEmits(['cerrar', 'guardado']);
const toast = useToast();

const modos = ref([]);
const vacio = () => ({ modo: 'SIMULADO', clientId: '', clientSecret: '', usuarioSol: '', claveSol: '', activo: true });
const f = reactive(vacio());
const estado = reactive({ cargando: false, guardando: false, probando: false, tieneClientSecret: false, tieneClaveSol: false, existe: false, prueba: null, ultimaConexion: null, ultimoError: null });

watch(
  () => props.abierto,
  async (v) => {
    if (!v || !props.empresa) return;
    Object.assign(estado, { cargando: true, prueba: null });
    try {
      const [m, c] = await Promise.all([
        modos.value.length ? { data: modos.value } : api.get('/sire/modos'),
        api.get('/sire/config', { params: { empresaId: props.empresa.id } }),
      ]);
      modos.value = m.data;
      const cfg = c.data;
      Object.assign(f, vacio(), cfg ? { modo: cfg.modo, clientId: cfg.clientId ?? '', usuarioSol: cfg.usuarioSol ?? '', activo: cfg.activo } : {});
      Object.assign(estado, {
        existe: Boolean(cfg), tieneClientSecret: Boolean(cfg?.tieneClientSecret), tieneClaveSol: Boolean(cfg?.tieneClaveSol),
        ultimaConexion: cfg?.ultimaConexion ?? null, ultimoError: cfg?.ultimoError ?? null,
      });
    } catch (e) {
      toast.error(mensajeError(e));
      emit('cerrar');
    } finally {
      estado.cargando = false;
    }
  },
  { immediate: true },
);

const real = computed(() => f.modo === 'SUNAT');
const error = computed(() => {
  if (!real.value) return '';
  const falta = [
    !f.clientId && 'client_id',
    !f.clientSecret && !estado.tieneClientSecret && 'client_secret',
    !f.usuarioSol && 'usuario SOL',
    !f.claveSol && !estado.tieneClaveSol && 'clave SOL',
  ].filter(Boolean);
  return falta.length ? `Para conectarse con SUNAT falta: ${falta.join(', ')}` : '';
});

async function guardar() {
  estado.guardando = true;
  try {
    const { data } = await api.put('/sire/config', {
      empresaId: props.empresa.id, ...f, clientId: f.clientId || null, clientSecret: f.clientSecret || null, usuarioSol: f.usuarioSol || null, claveSol: f.claveSol || null,
    });
    toast.exito('Credenciales del SIRE guardadas');
    Object.assign(estado, { existe: true, tieneClientSecret: data.tieneClientSecret, tieneClaveSol: data.tieneClaveSol, ultimoError: null, prueba: null });
    f.clientSecret = '';
    f.claveSol = '';
    f.usuarioSol = data.usuarioSol ?? '';
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
    estado.prueba = (await api.post('/sire/config/probar', { empresaId: props.empresa.id })).data;
    if (estado.prueba.ok) Object.assign(estado, { ultimaConexion: new Date().toISOString(), ultimoError: null });
  } catch (e) {
    estado.prueba = { ok: false, mensaje: mensajeError(e) };
  } finally {
    estado.probando = false;
  }
}
</script>

<template>
  <BaseModal :abierto="abierto" :titulo="`SIRE · ${empresa?.razonSocial ?? ''}`" ancho="sm:max-w-2xl" @cerrar="emit('cerrar')">
    <p v-if="estado.cargando" class="py-8 text-center text-sm text-slate-500">Cargando…</p>
    <form v-else id="form-sire" class="space-y-5" @submit.prevent="guardar">
      <p class="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
        Con estas credenciales el sistema consulta el SIRE de <strong>RUC {{ empresa?.ruc }}</strong>: el estado de los registros de ventas (RVIE) y de compras (RCE)
        de cada período, y más adelante descarga las propuestas de SUNAT para conciliarlas.
      </p>

      <fieldset>
        <legend class="etiqueta">Conexión</legend>
        <div class="grid gap-2 sm:grid-cols-2">
          <label
            v-for="m in modos"
            :key="m.codigo"
            class="flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition"
            :class="f.modo === m.codigo ? 'border-marca-600 bg-marca-50/60 ring-1 ring-marca-600' : 'border-slate-200 hover:border-slate-300'"
          >
            <input v-model="f.modo" type="radio" :value="m.codigo" class="mt-0.5 size-4 accent-marca-700" />
            <span>
              <span class="block font-medium">{{ m.nombre }}</span>
              <span class="text-xs text-slate-500">{{ m.codigo === 'SIMULADO' ? 'Responde como SUNAT sin conectarse. Para capacitar y probar.' : 'Consulta real con las credenciales de la empresa.' }}</span>
            </span>
          </label>
        </div>
      </fieldset>

      <fieldset class="space-y-3 rounded-xl border border-slate-200 p-3">
        <legend class="px-1 text-sm font-medium">Credenciales API de SUNAT</legend>
        <p class="text-xs text-slate-500">
          Se generan en SUNAT Operaciones en Línea → <em>Credenciales de API SUNAT</em>, marcando el acceso al SIRE. Son distintas para cada empresa.
        </p>
        <div class="grid gap-3 sm:grid-cols-2">
          <div><label class="etiqueta" for="si-cid">ID de cliente (client_id){{ real ? ' *' : '' }}</label><input id="si-cid" v-model="f.clientId" class="input font-mono text-sm" autocomplete="off" /></div>
          <div>
            <label class="etiqueta" for="si-csec">Clave (client_secret){{ estado.tieneClientSecret ? ' · guardada' : real ? ' *' : '' }}</label>
            <input id="si-csec" v-model="f.clientSecret" type="password" class="input font-mono text-sm" :placeholder="estado.tieneClientSecret ? '•••••••• (guardada)' : ''" autocomplete="new-password" />
          </div>
        </div>
      </fieldset>

      <fieldset class="space-y-3 rounded-xl border border-slate-200 p-3">
        <legend class="px-1 text-sm font-medium">Usuario SOL</legend>
        <p class="text-xs text-slate-500">
          Recomendado: un <strong>usuario secundario</strong> creado por la empresa solo con el perfil del SIRE, no el usuario principal. Escriba el usuario sin el RUC.
        </p>
        <div class="grid gap-3 sm:grid-cols-2">
          <div><label class="etiqueta" for="si-usu">Usuario SOL{{ real ? ' *' : '' }}</label><input id="si-usu" v-model="f.usuarioSol" class="input font-mono uppercase" maxlength="20" autocomplete="off" /></div>
          <div>
            <label class="etiqueta" for="si-clave">Clave SOL{{ estado.tieneClaveSol ? ' · guardada' : real ? ' *' : '' }}</label>
            <input id="si-clave" v-model="f.claveSol" type="password" class="input font-mono text-sm" :placeholder="estado.tieneClaveSol ? '•••••••• (guardada)' : ''" autocomplete="new-password" />
          </div>
        </div>
        <p class="text-xs text-slate-500">Las claves se guardan cifradas y no se vuelven a mostrar. Déjelas vacías para conservar las actuales.</p>
      </fieldset>

      <label class="flex items-center gap-2 text-sm"><input v-model="f.activo" type="checkbox" class="size-4 accent-marca-700" /> SIRE activo para esta empresa</label>

      <p v-if="estado.ultimaConexion && !estado.prueba" class="text-xs text-slate-500">Última conexión correcta: {{ fechaHora(estado.ultimaConexion) }}</p>
      <p v-if="estado.ultimoError && !estado.prueba" class="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
        <Icono nombre="alerta" clase="mt-0.5 size-4 shrink-0" /> Último error: {{ estado.ultimoError }}
      </p>
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
      <button class="btn-primario" form="form-sire" :disabled="estado.guardando || !!error">{{ estado.guardando ? 'Guardando…' : 'Guardar' }}</button>
    </template>
  </BaseModal>
</template>
