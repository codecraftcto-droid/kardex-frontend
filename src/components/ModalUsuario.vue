<script setup>
import { confirmar } from '@/utils/dialogos';
import { computed, reactive, ref, watch } from 'vue';
import { api, mensajeError } from '@/services/api';
import { useAuth } from '@/stores/auth';
import { useToast } from '@/stores/toast';
import BaseModal from './BaseModal.vue';
import SelectorAlcance from './SelectorAlcance.vue';
import Icono from './Icono.vue';

/**
 * Detalle de un usuario en un modal con pestañas: datos, roles con alcance, excepciones y sesiones.
 * Las ediciones se hacen dentro del mismo modal (sin abrir otro encima).
 */
const props = defineProps({
  abierto: Boolean,
  usuarioId: { type: String, default: null },
});
const emit = defineEmits(['cerrar', 'cambio']);
const auth = useAuth();
const toast = useToast();

const usuario = ref(null);
const sesiones = ref([]);
const roles = ref([]);
const catalogo = ref([]);
const pestana = ref('datos');
const ocupado = ref(false);
// Formularios internos (se declaran antes del watch inmediato que los reinicia)
const edicion = reactive({ activa: false, form: {} });
const asig = reactive({ activa: false, rolId: '', alcance: { alcanceTipo: 'estudio', alcanceId: null } });
const exc = reactive({ activa: false, permiso: '', efecto: 'deny', alcance: { alcanceTipo: 'estudio', alcanceId: null } });

const esPropio = computed(() => usuario.value?.id === auth.usuario?.id);
// Usuarios de la empresa cliente (portal u operador de caja): alcance solo dentro de su empresa
const esDeEmpresa = computed(() => ['cliente', 'operador'].includes(usuario.value?.tipo));
const rolesCompatibles = computed(() =>
  roles.value.filter((r) => usuario.value?.tipo === 'interno' || (usuario.value?.tipo === 'cliente' ? r.aptoCliente : r.aptoOperador)),
);
const puedeGestionar = computed(() => auth.canAlguno('usuarios.roles.gestionar') && !esPropio.value);
const puedeEditar = computed(() => auth.can('usuarios.usuario.editar', {}));
const puedeSesiones = computed(() => auth.can('usuarios.sesiones.gestionar', {}));

const NIVEL = { estudio: 'Todo el estudio', empresa: 'Empresa', sede: 'Sede', almacen: 'Almacén' };
const ESTADO = { activo: 'bg-emerald-50 text-emerald-700', pendiente: 'bg-amber-50 text-amber-700', suspendido: 'bg-red-50 text-red-700' };
const TIPO = { interno: 'Equipo del estudio', cliente: 'Portal cliente (solo lectura)', operador: 'Operador de caja' };
const fecha = (f) => (f ? new Date(f).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const iniciales = computed(() => (usuario.value?.nombres || '?').split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase());

async function cargar() {
  try {
    usuario.value = (await api.get(`/usuarios/${props.usuarioId}`)).data;
    if (puedeSesiones.value) sesiones.value = (await api.get(`/usuarios/${props.usuarioId}/sesiones`)).data;
  } catch (e) {
    toast.error(mensajeError(e));
    emit('cerrar');
  }
}
watch(
  () => props.abierto,
  async (v) => {
    if (!v) return;
    Object.assign(edicion, { activa: false });
    Object.assign(asig, { activa: false });
    Object.assign(exc, { activa: false });
    usuario.value = null;
    sesiones.value = [];
    pestana.value = 'datos';
    await cargar();
    if (auth.canAlguno('usuarios.roles.ver') && !roles.value.length) {
      try {
        const [r, c] = await Promise.all([api.get('/roles'), api.get('/permisos')]);
        roles.value = r.data.filter((x) => x.activo);
        catalogo.value = c.data;
      } catch { /* sin permiso: solo lectura */ }
    }
  },
  { immediate: true },
);

/** Ejecuta una acción, recarga y avisa al listado */
async function ejecutar(fn, exito) {
  ocupado.value = true;
  try {
    await fn();
    if (exito) toast.exito(exito);
    await cargar();
    emit('cambio');
    return true;
  } catch (e) {
    toast.error(mensajeError(e));
    return false;
  } finally {
    ocupado.value = false;
  }
}

// ── Datos ──
function editar() {
  const { nombres, documento, cargo, telefono } = usuario.value;
  Object.assign(edicion, { activa: true, form: { nombres, documento: documento ?? '', cargo: cargo ?? '', telefono: telefono ?? '' } });
}
const guardarDatos = async () => (await ejecutar(() => api.put(`/usuarios/${usuario.value.id}`, edicion.form), 'Datos actualizados')) && (edicion.activa = false);

const cambiarEstado = async (estado) => {
  if (estado === 'suspendido' && !(await confirmar({
    titulo: `¿Suspender a ${usuario.value.nombres}?`, texto: 'No podrá ingresar y se cerrarán todas sus sesiones de inmediato. Podrá reactivarlo después.',
    confirmar: 'Suspender', peligro: true,
  }))) return;
  ejecutar(() => api.patch(`/usuarios/${usuario.value.id}/estado`, { estado }), estado === 'suspendido' ? 'Usuario suspendido' : 'Usuario reactivado');
};
const reenviar = () => ejecutar(() => api.post(`/usuarios/${usuario.value.id}/reenviar-invitacion`), 'Invitación reenviada');
const restablecer2fa = async () => {
  if (await confirmar({
    titulo: '¿Restablecer la verificación en dos pasos?', texto: 'Úselo si perdió su celular: se desactiva su 2FA y se cierran sus sesiones. Deberá configurarla de nuevo al ingresar.',
    confirmar: 'Restablecer', peligro: true,
  })) {
    ejecutar(() => api.post(`/usuarios/${usuario.value.id}/mfa/restablecer`), 'Verificación en dos pasos restablecida');
  }
};
const cerrarSesiones = async () =>
  (await confirmar({ titulo: '¿Cerrar todas sus sesiones?', texto: 'Tendrá que volver a ingresar en todos sus dispositivos.', confirmar: 'Cerrar sesiones', peligro: true })) && ejecutar(() => api.delete(`/usuarios/${usuario.value.id}/sesiones`), 'Sesiones cerradas');

// ── Roles con alcance ──
const alcanceInicial = () => ({ alcanceTipo: esDeEmpresa.value ? 'empresa' : 'estudio', alcanceId: esDeEmpresa.value ? usuario.value.empresaId : null });
const abrirAsignacion = () => Object.assign(asig, { activa: true, rolId: '', alcance: alcanceInicial() });
const guardarAsignacion = async () =>
  (await ejecutar(() => api.post(`/usuarios/${usuario.value.id}/asignaciones`, { rolId: asig.rolId, ...asig.alcance }), 'Rol asignado')) && (asig.activa = false);
const quitarAsignacion = async (a) =>
  (await confirmar({ titulo: `¿Quitar el rol ${a.rol.nombre}?`, texto: `Dejará de tener sus permisos en: ${a.alcanceNombre}.`, confirmar: 'Quitar rol', peligro: true })) && ejecutar(() => api.delete(`/usuarios/${usuario.value.id}/asignaciones/${a.id}`), 'Rol retirado');

// ── Excepciones ──
const abrirExcepcion = () => Object.assign(exc, { activa: true, permiso: '', efecto: 'deny', alcance: alcanceInicial() });
const guardarExcepcion = async () =>
  (await ejecutar(() => api.post(`/usuarios/${usuario.value.id}/excepciones`, { permiso: exc.permiso, efecto: exc.efecto, ...exc.alcance }), 'Excepción registrada')) &&
  (exc.activa = false);
const quitarExcepcion = async (e) =>
  (await confirmar({ titulo: '¿Eliminar la excepción?', texto: `«${e.permiso.descripcion}» volverá a depender solo de sus roles.`, confirmar: 'Eliminar', peligro: true })) && ejecutar(() => api.delete(`/usuarios/${usuario.value.id}/excepciones/${e.id}`), 'Excepción eliminada');

const pestanas = computed(() => [
  { id: 'datos', texto: 'Datos' },
  { id: 'roles', texto: 'Roles y alcances', n: usuario.value?.asignaciones.length },
  { id: 'excepciones', texto: 'Excepciones', n: usuario.value?.excepciones.length },
  ...(puedeSesiones.value ? [{ id: 'sesiones', texto: 'Sesiones', n: sesiones.value.length }] : []),
]);
</script>

<template>
  <BaseModal :abierto="abierto" :titulo="usuario ? usuario.nombres : 'Usuario'" ancho="sm:max-w-3xl" @cerrar="emit('cerrar')">
    <p v-if="!usuario" class="py-10 text-center text-sm text-slate-500">Cargando…</p>
    <div v-else class="space-y-4" :class="{ 'pointer-events-none opacity-60': ocupado }">
      <!-- Cabecera -->
      <div class="flex items-center gap-3">
        <span class="flex size-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-marca-700 font-semibold text-white">{{ iniciales }}</span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm text-slate-600">{{ usuario.email }}</p>
          <p class="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <span class="insignia capitalize" :class="ESTADO[usuario.estado]">{{ usuario.estado }}</span>
            <span>{{ TIPO[usuario.tipo] }}<template v-if="usuario.empresa"> · {{ usuario.empresa.razonSocial }}</template></span>
            <span v-if="usuario.mfaActivo" class="insignia bg-emerald-50 text-emerald-700">2FA</span>
          </p>
        </div>
      </div>
      <p v-if="esPropio" class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Por seguridad, no puede modificar sus propios roles, permisos ni estado.</p>
      <p v-else-if="usuario.estado === 'pendiente'" class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Aún no activa su cuenta: debe abrir el enlace de la invitación que le llegó por correo.
      </p>

      <!-- Pestañas -->
      <div class="-mx-4 overflow-x-auto border-b border-slate-200 px-4" role="tablist" aria-label="Secciones del usuario">
        <div class="flex gap-1">
          <button
            v-for="p in pestanas"
            :key="p.id"
            role="tab"
            :aria-selected="pestana === p.id"
            class="-mb-px flex min-h-10 items-center gap-1.5 border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors"
            :class="pestana === p.id ? 'border-marca-700 text-marca-800' : 'border-transparent text-slate-500 hover:text-slate-800'"
            @click="pestana = p.id"
          >
            {{ p.texto }}
            <span v-if="p.n != null" class="rounded-full px-1.5 text-xs tabular-nums" :class="pestana === p.id ? 'bg-marca-50 text-marca-700' : 'bg-slate-100 text-slate-500'">{{ p.n }}</span>
          </button>
        </div>
      </div>

      <!-- ═════════ Datos ═════════ -->
      <section v-if="pestana === 'datos'" role="tabpanel">
        <form v-if="edicion.activa" id="form-datos-usuario" class="grid gap-3 sm:grid-cols-2" @submit.prevent="guardarDatos">
          <div class="sm:col-span-2"><label class="etiqueta" for="u-nom">Nombres *</label><input id="u-nom" v-model="edicion.form.nombres" class="input" required /></div>
          <div><label class="etiqueta" for="u-doc">Documento</label><input id="u-doc" v-model="edicion.form.documento" class="input" /></div>
          <div><label class="etiqueta" for="u-tel">Teléfono</label><input id="u-tel" v-model="edicion.form.telefono" type="tel" class="input" /></div>
          <div class="sm:col-span-2"><label class="etiqueta" for="u-car">Cargo</label><input id="u-car" v-model="edicion.form.cargo" class="input" /></div>
          <div class="flex justify-end gap-2 sm:col-span-2">
            <button type="button" class="btn-secundario" @click="edicion.activa = false">Cancelar</button>
            <button class="btn-primario">Guardar datos</button>
          </div>
        </form>
        <template v-else>
          <dl class="grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3">
            <div><dt class="text-xs text-slate-500">Documento</dt><dd class="font-medium">{{ usuario.documento || '—' }}</dd></div>
            <div><dt class="text-xs text-slate-500">Cargo</dt><dd class="font-medium">{{ usuario.cargo || '—' }}</dd></div>
            <div><dt class="text-xs text-slate-500">Teléfono</dt><dd class="font-medium">{{ usuario.telefono || '—' }}</dd></div>
            <div><dt class="text-xs text-slate-500">Último acceso</dt><dd class="font-medium">{{ fecha(usuario.ultimoAcceso) }}</dd></div>
            <div><dt class="text-xs text-slate-500">Creado</dt><dd class="font-medium">{{ fecha(usuario.creadoEn) }}</dd></div>
            <div>
              <dt class="text-xs text-slate-500">Verificación en dos pasos</dt>
              <dd class="flex items-center gap-2 font-medium">
                {{ usuario.mfaActivo ? 'Activa' : 'Inactiva' }}
                <button v-if="usuario.mfaActivo && puedeEditar && !esPropio" class="text-xs font-normal text-red-600 hover:underline" @click="restablecer2fa">Restablecer</button>
              </dd>
            </div>
          </dl>
          <button v-if="puedeEditar" class="btn-texto mt-2 -ml-2" @click="editar"><Icono nombre="editar" clase="size-4" /> Editar datos</button>
        </template>
      </section>

      <!-- ═════════ Roles ═════════ -->
      <section v-else-if="pestana === 'roles'" role="tabpanel" class="space-y-3">
        <p class="text-xs text-slate-500">El alcance hereda hacia abajo: un rol en una empresa aplica a sus sedes y almacenes.</p>
        <ul v-if="usuario.asignaciones.length" class="divide-y divide-slate-100 rounded-xl border border-slate-200">
          <li v-for="a in usuario.asignaciones" :key="a.id" class="flex items-center gap-3 px-4 py-3">
            <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-marca-50 text-marca-700"><Icono nombre="roles" clase="size-5" /></span>
            <div class="min-w-0 flex-1">
              <p class="font-medium">{{ a.rol.nombre }} <span v-if="!a.rol.activo" class="insignia bg-slate-100 text-slate-500">rol inactivo</span></p>
              <p class="truncate text-sm text-slate-500">{{ NIVEL[a.alcanceTipo] }}<template v-if="a.alcanceTipo !== 'estudio'"> · {{ a.alcanceNombre }}</template></p>
            </div>
            <button v-if="puedeGestionar" class="btn px-2 text-red-600 hover:bg-red-50" :aria-label="`Quitar rol ${a.rol.nombre}`" @click="quitarAsignacion(a)"><Icono nombre="eliminar" clase="size-5" /></button>
          </li>
        </ul>
        <p v-else class="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">Sin roles asignados: el usuario no puede ver ni hacer nada.</p>

        <form v-if="asig.activa" id="form-asig-usuario" class="space-y-3 rounded-xl border border-marca-600/30 bg-marca-50/40 p-4" @submit.prevent="guardarAsignacion">
          <div>
            <label class="etiqueta" for="u-rol">Rol *</label>
            <select id="u-rol" v-model="asig.rolId" class="input" required>
              <option value="" disabled>Seleccione…</option>
              <option v-for="r in rolesCompatibles" :key="r.id" :value="r.id">{{ r.nombre }} · {{ r._count.permisos }} permisos</option>
            </select>
          </div>
          <SelectorAlcance v-model="asig.alcance" :permitir-estudio="!esDeEmpresa" :empresa-fija="esDeEmpresa ? usuario.empresaId : null" />
          <p v-if="esDeEmpresa" class="text-xs text-slate-500">{{ usuario.tipo === 'cliente' ? 'Usuario cliente: solo roles de lectura' : 'Operador de caja: solo roles de caja, clientes y lectura' }}, dentro de su empresa.</p>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-secundario" @click="asig.activa = false">Cancelar</button>
            <button class="btn-primario">Asignar rol</button>
          </div>
        </form>
        <button v-else-if="puedeGestionar" class="btn-secundario" @click="abrirAsignacion"><Icono nombre="agregar" clase="size-4" /> Asignar rol</button>
      </section>

      <!-- ═════════ Excepciones ═════════ -->
      <section v-else-if="pestana === 'excepciones'" role="tabpanel" class="space-y-3">
        <p class="text-xs text-slate-500">Permitir o denegar un permiso puntual, sin cambiar el rol. «Denegar» siempre tiene prioridad.</p>
        <ul v-if="usuario.excepciones.length" class="divide-y divide-slate-100 rounded-xl border border-slate-200">
          <li v-for="e in usuario.excepciones" :key="e.id" class="flex items-center gap-3 px-4 py-3">
            <div class="min-w-0 flex-1">
              <p class="text-sm">
                <span class="insignia mr-1" :class="e.efecto === 'deny' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'">{{ e.efecto === 'deny' ? 'Denegar' : 'Permitir' }}</span>
                {{ e.permiso.descripcion }}
              </p>
              <p class="truncate text-xs text-slate-500">{{ NIVEL[e.alcanceTipo] }}<template v-if="e.alcanceTipo !== 'estudio'"> · {{ e.alcanceNombre }}</template></p>
            </div>
            <button v-if="puedeGestionar" class="btn px-2 text-red-600 hover:bg-red-50" aria-label="Eliminar excepción" @click="quitarExcepcion(e)"><Icono nombre="eliminar" clase="size-5" /></button>
          </li>
        </ul>
        <p v-else class="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">Sin excepciones.</p>

        <form v-if="exc.activa" id="form-exc-usuario" class="space-y-3 rounded-xl border border-marca-600/30 bg-marca-50/40 p-4" @submit.prevent="guardarExcepcion">
          <div class="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Efecto">
            <label class="btn-secundario cursor-pointer" :class="{ 'border-red-400 bg-red-50 text-red-700': exc.efecto === 'deny' }"><input v-model="exc.efecto" type="radio" value="deny" class="sr-only" /> Denegar</label>
            <label class="btn-secundario cursor-pointer" :class="{ 'border-emerald-400 bg-emerald-50 text-emerald-700': exc.efecto === 'allow' }"><input v-model="exc.efecto" type="radio" value="allow" class="sr-only" /> Permitir</label>
          </div>
          <div>
            <label class="etiqueta" for="u-perm">Permiso *</label>
            <select id="u-perm" v-model="exc.permiso" class="input" required>
              <option value="" disabled>Seleccione…</option>
              <optgroup v-for="m in catalogo" :key="m.modulo" :label="m.modulo">
                <option v-for="p in m.permisos" :key="p.codigo" :value="p.codigo">{{ p.descripcion }}</option>
              </optgroup>
            </select>
          </div>
          <SelectorAlcance v-model="exc.alcance" :permitir-estudio="!esDeEmpresa" :empresa-fija="esDeEmpresa ? usuario.empresaId : null" />
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-secundario" @click="exc.activa = false">Cancelar</button>
            <button class="btn-primario">Guardar excepción</button>
          </div>
        </form>
        <button v-else-if="puedeGestionar" class="btn-secundario" @click="abrirExcepcion"><Icono nombre="agregar" clase="size-4" /> Agregar excepción</button>
      </section>

      <!-- ═════════ Sesiones ═════════ -->
      <section v-else-if="pestana === 'sesiones'" role="tabpanel" class="space-y-3">
        <ul v-if="sesiones.length" class="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
          <li v-for="s in sesiones" :key="s.id" class="px-4 py-2.5">
            <p class="truncate">{{ s.dispositivo || 'Dispositivo desconocido' }}</p>
            <p class="text-xs text-slate-500">IP {{ s.ip }} · último uso {{ fecha(s.ultimoUso) }}</p>
          </li>
        </ul>
        <p v-else class="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">Sin sesiones activas.</p>
        <button v-if="sesiones.length && !esPropio" class="btn-secundario text-red-600" @click="cerrarSesiones">Cerrar todas las sesiones</button>
      </section>
    </div>

    <template #pie>
      <template v-if="usuario && puedeEditar && !esPropio">
        <button v-if="usuario.estado === 'activo'" class="btn-secundario mr-auto text-red-600 hover:bg-red-50" @click="cambiarEstado('suspendido')">Suspender usuario</button>
        <button v-if="usuario.estado === 'suspendido'" class="btn-secundario mr-auto text-emerald-700" @click="cambiarEstado('activo')">Reactivar usuario</button>
        <button v-if="usuario.estado === 'pendiente'" class="btn-secundario mr-auto" @click="reenviar">Reenviar invitación</button>
      </template>
      <button class="btn-primario" @click="emit('cerrar')">Cerrar</button>
    </template>
  </BaseModal>
</template>
