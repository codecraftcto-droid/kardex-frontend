<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api, mensajeError } from '@/services/api';
import { useAuth } from '@/stores/auth';
import { useToast } from '@/stores/toast';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import BaseModal from '@/components/BaseModal.vue';
import SelectorAlcance from '@/components/SelectorAlcance.vue';
import Icono from '@/components/Icono.vue';

const route = useRoute();
const auth = useAuth();
const toast = useToast();
const usuario = ref(null);
const sesiones = ref([]);
const roles = ref([]);
const catalogo = ref([]);

const esPropio = computed(() => usuario.value?.id === auth.usuario?.id);
const esCliente = computed(() => usuario.value?.tipo === 'cliente');
const puedeGestionar = computed(() => auth.canAlguno('usuarios.roles.gestionar') && !esPropio.value);
const puedeEditar = computed(() => auth.can('usuarios.usuario.editar', {}));
const puedeSesiones = computed(() => auth.can('usuarios.sesiones.gestionar', {}));

const nivel = { estudio: 'Estudio', empresa: 'Empresa', sede: 'Sede', almacen: 'Almacén' };
const estiloEstado = { activo: 'bg-emerald-50 text-emerald-700', pendiente: 'bg-amber-50 text-amber-700', suspendido: 'bg-red-50 text-red-700' };

async function cargar() {
  try {
    usuario.value = (await api.get(`/usuarios/${route.params.id}`)).data;
    if (puedeSesiones.value) sesiones.value = (await api.get(`/usuarios/${route.params.id}/sesiones`)).data;
  } catch (e) {
    toast.error(mensajeError(e));
  }
}
onMounted(async () => {
  await cargar();
  if (auth.canAlguno('usuarios.roles.ver')) {
    const [r, c] = await Promise.all([api.get('/roles'), api.get('/permisos')]);
    roles.value = r.data.filter((x) => x.activo);
    catalogo.value = c.data;
  }
});

async function ejecutar(fn, exito) {
  try {
    await fn();
    if (exito) toast.exito(exito);
    await cargar();
  } catch (e) {
    toast.error(mensajeError(e));
  }
}

// ── Datos básicos ──
const edicion = reactive({ abierto: false, form: {} });
function abrirEdicion() {
  const { nombres, documento, cargo, telefono } = usuario.value;
  edicion.form = { nombres, documento: documento ?? '', cargo: cargo ?? '', telefono: telefono ?? '' };
  edicion.abierto = true;
}
const guardarDatos = () =>
  ejecutar(async () => {
    await api.put(`/usuarios/${usuario.value.id}`, edicion.form);
    edicion.abierto = false;
  }, 'Datos actualizados');

const cambiarEstado = (estado) => {
  if (estado === 'suspendido' && !confirm('Se cerrarán todas sus sesiones de inmediato. ¿Suspender usuario?')) return;
  ejecutar(() => api.patch(`/usuarios/${usuario.value.id}/estado`, { estado }), estado === 'suspendido' ? 'Usuario suspendido' : 'Usuario reactivado');
};
const reenviar = () => ejecutar(() => api.post(`/usuarios/${usuario.value.id}/reenviar-invitacion`), 'Invitación reenviada');
const restablecer2fa = () => {
  if (confirm('Se desactivará su verificación en dos pasos y se cerrarán sus sesiones. Úselo si perdió su celular. ¿Continuar?')) {
    ejecutar(() => api.post(`/usuarios/${usuario.value.id}/mfa/restablecer`), 'Verificación en dos pasos restablecida');
  }
};
const cerrarSesiones = () => {
  if (confirm('¿Cerrar todas las sesiones de este usuario?')) ejecutar(() => api.delete(`/usuarios/${usuario.value.id}/sesiones`), 'Sesiones cerradas');
};

// ── Asignaciones ──
const asig = reactive({ abierto: false, rolId: '', alcance: { alcanceTipo: 'empresa', alcanceId: null } });
function abrirAsignacion() {
  Object.assign(asig, { abierto: true, rolId: '', alcance: { alcanceTipo: esCliente.value ? 'empresa' : 'estudio', alcanceId: null } });
}
const guardarAsignacion = () =>
  ejecutar(async () => {
    await api.post(`/usuarios/${usuario.value.id}/asignaciones`, { rolId: asig.rolId, ...asig.alcance });
    asig.abierto = false;
  }, 'Rol asignado');
const quitarAsignacion = (a) => {
  if (confirm(`¿Quitar el rol "${a.rol.nombre}" en ${a.alcanceNombre}?`)) ejecutar(() => api.delete(`/usuarios/${usuario.value.id}/asignaciones/${a.id}`), 'Rol retirado');
};

// ── Excepciones ──
const exc = reactive({ abierto: false, permiso: '', efecto: 'deny', alcance: { alcanceTipo: 'empresa', alcanceId: null } });
function abrirExcepcion() {
  Object.assign(exc, { abierto: true, permiso: '', efecto: 'deny', alcance: { alcanceTipo: esCliente.value ? 'empresa' : 'estudio', alcanceId: null } });
}
const guardarExcepcion = () =>
  ejecutar(async () => {
    await api.post(`/usuarios/${usuario.value.id}/excepciones`, { permiso: exc.permiso, efecto: exc.efecto, ...exc.alcance });
    exc.abierto = false;
  }, 'Excepción registrada');
const quitarExcepcion = (e) => {
  if (confirm('¿Eliminar la excepción?')) ejecutar(() => api.delete(`/usuarios/${usuario.value.id}/excepciones/${e.id}`), 'Excepción eliminada');
};

const fecha = (f) => (f ? new Date(f).toLocaleString() : '—');
</script>

<template>
  <div v-if="usuario" class="space-y-6">
    <EncabezadoPagina :titulo="usuario.nombres" :subtitulo="usuario.email">
      <template #antes>
        <RouterLink to="/usuarios" class="mb-1 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <Icono nombre="atras" clase="size-4" /> Usuarios
        </RouterLink>
      </template>
      <template v-if="puedeEditar && !esPropio">
        <button v-if="usuario.estado === 'pendiente'" class="btn-secundario" @click="reenviar">Reenviar invitación</button>
        <button v-if="usuario.estado === 'activo'" class="btn-peligro" @click="cambiarEstado('suspendido')">Suspender</button>
        <button v-if="usuario.estado === 'suspendido'" class="btn-primario" @click="cambiarEstado('activo')">Reactivar</button>
      </template>
    </EncabezadoPagina>

    <p v-if="esPropio" class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
      Por seguridad, no puede modificar sus propios roles, permisos ni estado.
    </p>

    <!-- Datos -->
    <section class="tarjeta p-4 sm:p-5">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="font-semibold">Datos</h2>
        <button v-if="puedeEditar" class="btn-texto" @click="abrirEdicion"><Icono nombre="editar" clase="size-4" /> Editar</button>
      </div>
      <dl class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div><dt class="text-slate-500">Estado</dt><dd><span class="insignia capitalize" :class="estiloEstado[usuario.estado]">{{ usuario.estado }}</span></dd></div>
        <div><dt class="text-slate-500">Tipo</dt><dd>{{ esCliente ? `Cliente — ${usuario.empresa?.razonSocial}` : 'Interno' }}</dd></div>
        <div><dt class="text-slate-500">Documento</dt><dd>{{ usuario.documento || '—' }}</dd></div>
        <div><dt class="text-slate-500">Cargo</dt><dd>{{ usuario.cargo || '—' }}</dd></div>
        <div><dt class="text-slate-500">Teléfono</dt><dd>{{ usuario.telefono || '—' }}</dd></div>
        <div><dt class="text-slate-500">Último acceso</dt><dd>{{ fecha(usuario.ultimoAcceso) }}</dd></div>
        <div>
          <dt class="text-slate-500">Verificación en dos pasos</dt>
          <dd class="flex items-center gap-2">
            <span class="insignia" :class="usuario.mfaActivo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'">{{ usuario.mfaActivo ? 'Activa' : 'Inactiva' }}</span>
            <button v-if="usuario.mfaActivo && puedeEditar && !esPropio" class="text-xs text-red-600 hover:underline" @click="restablecer2fa">Restablecer</button>
          </dd>
        </div>
      </dl>
    </section>

    <!-- Roles con alcance -->
    <section class="tarjeta p-4 sm:p-5">
      <div class="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 class="font-semibold">Roles y alcances</h2>
          <p class="text-xs text-slate-500">El alcance hereda hacia abajo: un rol en una empresa aplica a sus sedes y almacenes.</p>
        </div>
        <button v-if="puedeGestionar" class="btn-secundario shrink-0" @click="abrirAsignacion"><Icono nombre="agregar" clase="size-4" /> Asignar</button>
      </div>
      <ul v-if="usuario.asignaciones.length" class="divide-y divide-slate-100">
        <li v-for="a in usuario.asignaciones" :key="a.id" class="flex items-center justify-between gap-3 py-3">
          <div class="min-w-0">
            <p class="font-medium">{{ a.rol.nombre }} <span v-if="!a.rol.activo" class="insignia bg-slate-100 text-slate-500">rol inactivo</span></p>
            <p class="truncate text-sm text-slate-500">{{ nivel[a.alcanceTipo] }} · {{ a.alcanceNombre }}</p>
          </div>
          <button v-if="puedeGestionar" class="btn px-2 text-red-600 hover:bg-red-50" aria-label="Quitar rol" @click="quitarAsignacion(a)">
            <Icono nombre="eliminar" />
          </button>
        </li>
      </ul>
      <p v-else class="text-sm text-slate-500">Sin roles asignados: el usuario no puede ver ni hacer nada.</p>
    </section>

    <!-- Excepciones -->
    <section class="tarjeta p-4 sm:p-5">
      <div class="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 class="font-semibold">Excepciones de permisos</h2>
          <p class="text-xs text-slate-500">Permitir o denegar un permiso puntual. «Denegar» siempre tiene prioridad.</p>
        </div>
        <button v-if="puedeGestionar" class="btn-secundario shrink-0" @click="abrirExcepcion"><Icono nombre="agregar" clase="size-4" /> Agregar</button>
      </div>
      <ul v-if="usuario.excepciones.length" class="divide-y divide-slate-100">
        <li v-for="e in usuario.excepciones" :key="e.id" class="flex items-center justify-between gap-3 py-3">
          <div class="min-w-0">
            <p class="text-sm">
              <span class="insignia mr-1" :class="e.efecto === 'deny' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'">{{ e.efecto === 'deny' ? 'Denegar' : 'Permitir' }}</span>
              {{ e.permiso.descripcion }}
            </p>
            <p class="truncate text-xs text-slate-500"><code>{{ e.permiso.codigo }}</code> · {{ nivel[e.alcanceTipo] }} · {{ e.alcanceNombre }}</p>
          </div>
          <button v-if="puedeGestionar" class="btn px-2 text-red-600 hover:bg-red-50" aria-label="Eliminar excepción" @click="quitarExcepcion(e)">
            <Icono nombre="eliminar" />
          </button>
        </li>
      </ul>
      <p v-else class="text-sm text-slate-500">Sin excepciones.</p>
    </section>

    <!-- Sesiones -->
    <section v-if="puedeSesiones" class="tarjeta p-4 sm:p-5">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="font-semibold">Sesiones activas ({{ sesiones.length }})</h2>
        <button v-if="sesiones.length && !esPropio" class="btn-secundario" @click="cerrarSesiones">Cerrar todas</button>
      </div>
      <ul class="divide-y divide-slate-100 text-sm">
        <li v-for="s in sesiones" :key="s.id" class="py-2">
          <p class="truncate">{{ s.dispositivo || 'Dispositivo desconocido' }}</p>
          <p class="text-xs text-slate-500">IP {{ s.ip }} · último uso {{ fecha(s.ultimoUso) }}</p>
        </li>
      </ul>
    </section>

    <!-- Modales -->
    <BaseModal :abierto="edicion.abierto" titulo="Editar datos" @cerrar="edicion.abierto = false">
      <form id="form-datos" class="grid gap-4 sm:grid-cols-2" @submit.prevent="guardarDatos">
        <div class="sm:col-span-2"><label class="etiqueta">Nombres *</label><input v-model="edicion.form.nombres" class="input" required /></div>
        <div><label class="etiqueta">Documento</label><input v-model="edicion.form.documento" class="input" /></div>
        <div><label class="etiqueta">Teléfono</label><input v-model="edicion.form.telefono" type="tel" class="input" /></div>
        <div class="sm:col-span-2"><label class="etiqueta">Cargo</label><input v-model="edicion.form.cargo" class="input" /></div>
      </form>
      <template #pie>
        <button class="btn-secundario" @click="edicion.abierto = false">Cancelar</button>
        <button class="btn-primario" form="form-datos">Guardar</button>
      </template>
    </BaseModal>

    <BaseModal :abierto="asig.abierto" titulo="Asignar rol" @cerrar="asig.abierto = false">
      <form id="form-asig" class="space-y-4" @submit.prevent="guardarAsignacion">
        <div>
          <label class="etiqueta">Rol *</label>
          <select v-model="asig.rolId" class="input" required>
            <option value="" disabled>Seleccione…</option>
            <option v-for="r in roles" :key="r.id" :value="r.id">{{ r.nombre }}</option>
          </select>
        </div>
        <SelectorAlcance v-model="asig.alcance" :permitir-estudio="!esCliente" :empresa-fija="esCliente ? usuario.empresaId : null" />
        <p v-if="esCliente" class="text-xs text-slate-500">Usuario cliente: solo se aceptan roles de lectura dentro de su empresa.</p>
      </form>
      <template #pie>
        <button class="btn-secundario" @click="asig.abierto = false">Cancelar</button>
        <button class="btn-primario" form="form-asig">Asignar</button>
      </template>
    </BaseModal>

    <BaseModal :abierto="exc.abierto" titulo="Excepción de permiso" @cerrar="exc.abierto = false">
      <form id="form-exc" class="space-y-4" @submit.prevent="guardarExcepcion">
        <div>
          <label class="etiqueta">Efecto</label>
          <div class="grid grid-cols-2 gap-2">
            <label class="btn-secundario cursor-pointer" :class="{ 'border-red-400 bg-red-50 text-red-700': exc.efecto === 'deny' }">
              <input v-model="exc.efecto" type="radio" value="deny" class="sr-only" /> Denegar
            </label>
            <label class="btn-secundario cursor-pointer" :class="{ 'border-emerald-400 bg-emerald-50 text-emerald-700': exc.efecto === 'allow' }">
              <input v-model="exc.efecto" type="radio" value="allow" class="sr-only" /> Permitir
            </label>
          </div>
        </div>
        <div>
          <label class="etiqueta">Permiso *</label>
          <select v-model="exc.permiso" class="input" required>
            <option value="" disabled>Seleccione…</option>
            <optgroup v-for="m in catalogo" :key="m.modulo" :label="m.modulo">
              <option v-for="p in m.permisos" :key="p.codigo" :value="p.codigo">{{ p.descripcion }}</option>
            </optgroup>
          </select>
        </div>
        <SelectorAlcance v-model="exc.alcance" :permitir-estudio="!esCliente" :empresa-fija="esCliente ? usuario.empresaId : null" />
      </form>
      <template #pie>
        <button class="btn-secundario" @click="exc.abierto = false">Cancelar</button>
        <button class="btn-primario" form="form-exc">Guardar</button>
      </template>
    </BaseModal>
  </div>
  <p v-else class="text-sm text-slate-500">Cargando…</p>
</template>
