<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiPlataforma } from '@/services/apiPlataforma';
import { mensajeError } from '@/services/api';
import { usePlataforma } from '@/stores/plataforma';
import { useToast } from '@/stores/toast';
import { fecha, fechaHora, soles } from '@/utils/formato';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import BaseModal from '@/components/BaseModal.vue';
import Icono from '@/components/Icono.vue';

const route = useRoute();
const router = useRouter();
const plataforma = usePlataforma();
const toast = useToast();
const e = ref(null);
const planes = ref([]);
const enviando = ref(false);

async function cargar() {
  try {
    e.value = (await apiPlataforma.get(`/estudios/${route.params.id}`)).data;
  } catch (err) {
    toast.error(mensajeError(err));
    router.replace('/plataforma/estudios');
  }
}
onMounted(async () => {
  await cargar();
  planes.value = (await apiPlataforma.get('/planes')).data;
});

async function accion(fn, exito) {
  enviando.value = true;
  try {
    const r = await fn();
    toast.exito(typeof exito === 'function' ? exito(r?.data) : exito);
    await cargar();
  } catch (err) {
    toast.error(mensajeError(err));
  } finally {
    enviando.value = false;
  }
}

const porcentaje = (u) => (u.maximo ? Math.min(100, Math.round((u.usados / u.maximo) * 100)) : 0);
const nombres = { empresas: 'Empresas', usuarios: 'Usuarios', almacenes: 'Almacenes' };

// ── Edición (ADMIN) ──
const edicion = reactive({ abierto: false, form: {} });
function abrirEdicion() {
  const { nombre, ruc, emailContacto, telefonoContacto, planId } = e.value;
  edicion.form = { nombre, ruc: ruc ?? '', emailContacto: emailContacto ?? '', telefonoContacto: telefonoContacto ?? '', planId: planId ?? '' };
  edicion.abierto = true;
}
const guardar = () =>
  accion(async () => {
    const f = edicion.form;
    await apiPlataforma.put(`/estudios/${e.value.id}`, { ...f, ruc: f.ruc || null, emailContacto: f.emailContacto || null, planId: f.planId || null });
    edicion.abierto = false;
  }, 'Estudio actualizado');

// ── Suspensión ──
const suspension = reactive({ abierto: false, motivo: '' });
const suspender = () =>
  accion(async () => {
    const r = await apiPlataforma.post(`/estudios/${e.value.id}/suspender`, { motivo: suspension.motivo });
    suspension.abierto = false;
    return r;
  }, (d) => `Estudio suspendido; ${d.sesionesCerradas} sesión(es) cerradas`);
const reactivar = () => confirm('¿Reactivar el estudio? Sus usuarios podrán volver a ingresar.') && accion(() => apiPlataforma.post(`/estudios/${e.value.id}/reactivar`), 'Estudio reactivado');

// ── Soporte ──
const reenviar = (u) => accion(() => apiPlataforma.post(`/estudios/${e.value.id}/usuarios/${u.id}/reenviar-invitacion`), (d) => d.mensaje);
const restablecer2fa = (u) =>
  confirm(`¿Restablecer la verificación en dos pasos de ${u.email}? Se cerrarán sus sesiones.`) &&
  accion(() => apiPlataforma.post(`/estudios/${e.value.id}/usuarios/${u.id}/restablecer-2fa`), (d) => d.mensaje);
const cerrarSesiones = () =>
  confirm('¿Cerrar todas las sesiones de este estudio?') &&
  accion(() => apiPlataforma.post(`/estudios/${e.value.id}/cerrar-sesiones`), (d) => `${d.sesionesCerradas} sesión(es) cerradas`);
</script>

<template>
  <div v-if="e" class="space-y-5">
    <EncabezadoPagina :titulo="e.nombre" :subtitulo="e.ruc ? `RUC ${e.ruc}` : 'Sin RUC'">
      <template #antes>
        <RouterLink to="/plataforma/estudios" class="mb-1 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <Icono nombre="atras" clase="size-4" /> Estudios
        </RouterLink>
        <span class="insignia mb-1 ml-2" :class="e.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'">{{ e.activo ? 'Activo' : 'Suspendido' }}</span>
      </template>
      <template v-if="plataforma.esAdmin">
        <button class="btn-secundario" @click="abrirEdicion"><Icono nombre="editar" clase="size-4" /> Editar / plan</button>
        <button v-if="e.activo" class="btn-peligro" @click="(suspension.motivo = ''), (suspension.abierto = true)">Suspender</button>
        <button v-else class="btn-primario" :disabled="enviando" @click="reactivar">Reactivar</button>
      </template>
    </EncabezadoPagina>

    <p v-if="!e.activo" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      Suspendido el {{ fechaHora(e.suspendidoEn) }}: {{ e.motivoSuspension }}. Sus usuarios no pueden ingresar.
    </p>

    <div class="grid gap-5 lg:grid-cols-3">
      <section class="tarjeta p-4 lg:col-span-2">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="font-semibold">Plan {{ e.plan?.nombre ?? '(sin plan)' }}</h2>
          <span v-if="e.plan" class="text-sm text-slate-500">{{ soles(e.plan.precioMensual) }} / mes</span>
        </div>
        <div class="space-y-3">
          <div v-for="(u, k) in e.uso" :key="k">
            <div class="mb-1 flex justify-between text-sm">
              <span>{{ nombres[k] }}</span>
              <span class="tabular-nums" :class="u.maximo && u.usados >= u.maximo ? 'font-semibold text-red-600' : 'text-slate-600'">
                {{ u.usados }} / {{ u.maximo ?? '∞' }}
              </span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-slate-100">
              <div class="h-full rounded-full" :class="porcentaje(u) >= 100 ? 'bg-red-500' : porcentaje(u) >= 80 ? 'bg-amber-500' : 'bg-marca-600'" :style="{ width: `${u.maximo ? porcentaje(u) : 4}%` }" />
            </div>
          </div>
        </div>
      </section>
      <section class="tarjeta space-y-2 p-4 text-sm">
        <h2 class="font-semibold">Actividad</h2>
        <p class="flex justify-between"><span class="text-slate-500">Sesiones abiertas</span><strong>{{ e.sesionesActivas }}</strong></p>
        <p class="flex justify-between"><span class="text-slate-500">Movimientos (30 d)</span><strong>{{ e.movimientos30d }}</strong></p>
        <p class="flex justify-between"><span class="text-slate-500">Cliente desde</span><strong>{{ fecha(e.creadoEn) }}</strong></p>
        <p class="flex justify-between gap-2"><span class="text-slate-500">Contacto</span><span class="truncate">{{ e.emailContacto ?? '—' }}</span></p>
        <button class="btn-secundario mt-2 w-full" :disabled="enviando || !e.sesionesActivas" @click="cerrarSesiones">Cerrar todas las sesiones</button>
      </section>
    </div>

    <section class="tarjeta p-4">
      <h2 class="mb-1 font-semibold">Administradores del estudio</h2>
      <p class="mb-3 text-xs text-slate-500">Soporte sin suplantación: la plataforma no puede ingresar como un usuario del estudio.</p>
      <ul class="divide-y divide-slate-100">
        <li v-for="u in e.administradores" :key="u.id" class="flex flex-wrap items-center justify-between gap-2 py-3">
          <div class="min-w-0">
            <p class="font-medium">{{ u.nombres }} <span class="insignia ml-1" :class="u.estado === 'activo' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'">{{ u.estado }}</span></p>
            <p class="truncate text-xs text-slate-500">{{ u.email }} · 2FA {{ u.mfaActivo ? 'activo' : 'inactivo' }} · último acceso {{ fechaHora(u.ultimoAcceso) }}</p>
          </div>
          <div class="flex gap-1">
            <button v-if="u.estado === 'pendiente'" class="btn-texto text-slate-700" :disabled="enviando" @click="reenviar(u)">Reenviar invitación</button>
            <button v-if="u.mfaActivo" class="btn-texto text-red-600" :disabled="enviando" @click="restablecer2fa(u)">Restablecer 2FA</button>
          </div>
        </li>
      </ul>
    </section>

    <section class="tarjeta p-4">
      <div class="mb-2 flex items-center justify-between">
        <h2 class="font-semibold">Facturas recientes</h2>
        <RouterLink :to="{ path: '/plataforma/facturacion', query: { tenantId: e.id } }" class="text-sm text-slate-700 hover:underline">Ver todas</RouterLink>
      </div>
      <ul v-if="e.facturas.length" class="divide-y divide-slate-100 text-sm">
        <li v-for="f in e.facturas" :key="f.id" class="flex justify-between py-2">
          <span>{{ f.periodo }} · {{ soles(f.monto) }}</span>
          <span class="insignia" :class="{ PAGADA: 'bg-emerald-50 text-emerald-700', PENDIENTE: 'bg-amber-50 text-amber-700', ANULADA: 'bg-slate-100 text-slate-500' }[f.estado]">{{ f.estado.toLowerCase() }}</span>
        </li>
      </ul>
      <p v-else class="text-sm text-slate-500">Sin facturas.</p>
    </section>

    <BaseModal :abierto="edicion.abierto" titulo="Editar estudio" @cerrar="edicion.abierto = false">
      <form id="form-ed" class="space-y-3" @submit.prevent="guardar">
        <div><label class="etiqueta">Nombre *</label><input v-model="edicion.form.nombre" class="input" required /></div>
        <div><label class="etiqueta">RUC</label><input v-model="edicion.form.ruc" class="input" pattern="\d{11}" maxlength="11" /></div>
        <div><label class="etiqueta">Correo de contacto</label><input v-model="edicion.form.emailContacto" type="email" class="input" /></div>
        <div><label class="etiqueta">Teléfono</label><input v-model="edicion.form.telefonoContacto" class="input" /></div>
        <div>
          <label class="etiqueta">Plan</label>
          <select v-model="edicion.form.planId" class="input">
            <option value="">Sin plan</option>
            <option v-for="p in planes" :key="p.id" :value="p.id">{{ p.nombre }} · {{ soles(p.precioMensual) }}/mes</option>
          </select>
          <p class="mt-1 text-xs text-slate-500">Si el nuevo plan tiene límites menores al uso actual, no se borra nada: solo se impide crear más.</p>
        </div>
      </form>
      <template #pie>
        <button class="btn-secundario" @click="edicion.abierto = false">Cancelar</button>
        <button class="btn bg-slate-900 text-white" form="form-ed" :disabled="enviando">Guardar</button>
      </template>
    </BaseModal>

    <BaseModal :abierto="suspension.abierto" :titulo="`Suspender ${e.nombre}`" @cerrar="suspension.abierto = false">
      <form id="form-sus" class="space-y-3" @submit.prevent="suspender">
        <p class="text-sm text-slate-600">Todos sus usuarios perderán el acceso de inmediato (se cierran sesiones y conexiones en tiempo real). Sus datos se conservan intactos.</p>
        <div><label class="etiqueta">Motivo *</label><textarea v-model="suspension.motivo" class="input py-2" rows="3" minlength="5" required /></div>
      </form>
      <template #pie>
        <button class="btn-secundario" @click="suspension.abierto = false">Cancelar</button>
        <button class="btn-peligro" form="form-sus" :disabled="enviando">Suspender</button>
      </template>
    </BaseModal>
  </div>
  <p v-else class="text-sm text-slate-500">Cargando…</p>
</template>
