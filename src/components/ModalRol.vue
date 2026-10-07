<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { api, mensajeError } from '@/services/api';
import { useAuth } from '@/stores/auth';
import { useToast } from '@/stores/toast';
import BaseModal from './BaseModal.vue';
import Icono from './Icono.vue';

/**
 * Crear, editar o clonar un rol con su matriz de permisos.
 * Filas = recursos; columnas = Ver · Crear · Editar · Eliminar · Otras acciones.
 * Anti-escalamiento (también lo valida el backend): no se otorgan permisos que el usuario no tiene.
 */
const props = defineProps({
  abierto: Boolean,
  /** id del rol a editar; null = nuevo */
  rolId: { type: String, default: null },
  /** Rol a copiar (crea uno nuevo con sus permisos) */
  clonarDe: { type: String, default: null },
});
const emit = defineEmits(['cerrar', 'guardado']);
const auth = useAuth();
const toast = useToast();

const catalogo = ref([]);
const form = reactive({ nombre: '', descripcion: '', requiereMfa: false });
const seleccion = ref(new Set());
const originales = ref(new Set());
const rol = ref(null);
const cargando = ref(false);
const guardando = ref(false);
const filtro = ref('');
const soloMarcados = ref(false);

const esNuevo = computed(() => !props.rolId);
const soloLectura = computed(() => !auth.can('usuarios.roles.gestionar', {}) || (!esNuevo.value && rol.value?.esPropio));

watch(() => props.abierto, async (v) => {
  if (!v) return;
  cargando.value = true;
  filtro.value = '';
  soloMarcados.value = false;
  Object.assign(form, { nombre: '', descripcion: '', requiereMfa: false });
  seleccion.value = new Set();
  originales.value = new Set();
  rol.value = null;
  try {
    if (!catalogo.value.length) catalogo.value = (await api.get('/permisos')).data;
    const base = props.rolId ?? props.clonarDe;
    if (base) {
      const r = (await api.get(`/roles/${base}`)).data;
      if (props.rolId) {
        rol.value = r;
        Object.assign(form, { nombre: r.nombre, descripcion: r.descripcion ?? '', requiereMfa: r.requiereMfa });
        originales.value = new Set(r.permisos);
      } else {
        Object.assign(form, { nombre: `${r.nombre} (copia)`, descripcion: r.descripcion ?? '', requiereMfa: r.requiereMfa });
      }
      seleccion.value = new Set(r.permisos);
    }
  } catch (e) {
    toast.error(mensajeError(e));
    emit('cerrar');
  } finally {
    cargando.value = false;
  }
}, { immediate: true });

// ── Organización de la matriz ──
const MODULOS = {
  empresas: 'Empresas', sedes: 'Sedes', almacenes: 'Almacenes', usuarios: 'Usuarios y seguridad', auditoria: 'Auditoría',
  productos: 'Productos', kardex: 'Kardex', transferencia: 'Transferencias', compras: 'Compras', ventas: 'Ventas',
  clientes: 'Clientes', pos: 'Punto de venta', cxc: 'Cuentas por cobrar', reporte: 'Reportes',
};
const RECURSOS = {
  empresa: 'Empresas', configuracion: 'Configuración (valorización)', sede: 'Sedes', almacen: 'Almacenes', usuario: 'Usuarios',
  roles: 'Roles y permisos', sesiones: 'Sesiones de otros usuarios', auditoria: 'Auditoría', producto: 'Productos', stock: 'Stock',
  entrada: 'Entradas', salida: 'Salidas', movimiento: 'Movimientos (anulación)', costos: 'Costos y valorización', transferencia: 'Transferencias',
  compra: 'Compras', venta: 'Ventas', cliente: 'Clientes', credito: 'Crédito de clientes', caja: 'Cajas y turnos', notacredito: 'Notas de crédito',
  descuento: 'Descuentos', cuenta: 'Cuentas por cobrar', cobranza: 'Cobranzas', movimientos: 'Movimientos', valorizacion: 'Valorización',
  ventas: 'Ventas', cxc: 'Cuentas por cobrar', reporte: 'Reportes',
};
const ACCIONES = { ver: 'Ver', crear: 'Crear', editar: 'Editar', eliminar: 'Eliminar' };
const OTRAS = {
  aprobar: 'Aprobar', anular: 'Anular', exportar: 'Exportar', gestionar: 'Gestionar', configurar: 'Configurar', credito: 'Vender al crédito',
  solicitar: 'Solicitar', despachar: 'Despachar', recibir: 'Recibir', autorizar: 'Autorizar',
};
const partes = (codigo) => {
  const p = codigo.split('.');
  return { recurso: p.length >= 3 ? p[1] : p[0], accion: p.at(-1) };
};
const etiquetaAccion = (a) => ACCIONES[a] ?? OTRAS[a] ?? a;

const normalizar = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** [{ modulo, nombre, filas: [{ recurso, nombre, celdas: {ver, crear, ...}, otras: [] , todos: [] }] }] */
const grupos = computed(() => {
  const q = normalizar(filtro.value.trim());
  return catalogo.value
    .map((m) => {
      const filas = new Map();
      for (const p of m.permisos) {
        if (soloMarcados.value && !seleccion.value.has(p.codigo)) continue;
        const { recurso, accion } = partes(p.codigo);
        const nombre = RECURSOS[recurso] ?? p.descripcion;
        if (q && !normalizar(`${MODULOS[m.modulo] ?? m.modulo} ${nombre} ${p.descripcion} ${p.codigo}`).includes(q)) continue;
        const f = filas.get(recurso) ?? { recurso, nombre, celdas: {}, otras: [], todos: [] };
        if (ACCIONES[accion]) f.celdas[accion] = p;
        else f.otras.push(p);
        f.todos.push(p);
        filas.set(recurso, f);
      }
      return { modulo: m.modulo, nombre: MODULOS[m.modulo] ?? m.modulo, filas: [...filas.values()] };
    })
    .filter((g) => g.filas.length);
});

// ── Selección ──
const otorgable = (codigo) => auth.canAlguno(codigo) || originales.value.has(codigo);
const editable = (p) => !soloLectura.value && (otorgable(p.codigo) || seleccion.value.has(p.codigo));
function alternar(p) {
  if (!editable(p)) return;
  const s = new Set(seleccion.value);
  s.has(p.codigo) ? s.delete(p.codigo) : s.add(p.codigo);
  seleccion.value = s;
}
/** Marca todos (si falta alguno) o desmarca todos, respetando lo que el usuario puede otorgar */
function alternarVarios(lista) {
  const disponibles = lista.filter(editable);
  const todos = disponibles.every((p) => seleccion.value.has(p.codigo));
  const s = new Set(seleccion.value);
  disponibles.forEach((p) => (todos ? s.delete(p.codigo) : otorgable(p.codigo) && s.add(p.codigo)));
  seleccion.value = s;
}
const estado = (lista) => {
  const n = lista.filter((p) => seleccion.value.has(p.codigo)).length;
  return { todos: n > 0 && n === lista.length, alguno: n > 0 && n < lista.length, n };
};
const permisosDe = (g) => g.filas.flatMap((f) => f.todos);
function soloLecturaPreset() {
  const s = new Set();
  catalogo.value.flatMap((m) => m.permisos).filter((p) => p.lectura && !p.sensible && otorgable(p.codigo)).forEach((p) => s.add(p.codigo));
  seleccion.value = s;
}
const limpiar = () => (seleccion.value = new Set([...seleccion.value].filter((c) => !otorgable(c))));
const total = computed(() => catalogo.value.reduce((n, m) => n + m.permisos.length, 0));
const sensibles = computed(() => catalogo.value.flatMap((m) => m.permisos).filter((p) => p.sensible && seleccion.value.has(p.codigo)).length);

async function guardar() {
  guardando.value = true;
  try {
    const datos = { ...form, descripcion: form.descripcion || null, permisos: [...seleccion.value] };
    const { data } = esNuevo.value ? await api.post('/roles', datos) : await api.put(`/roles/${props.rolId}`, datos);
    toast.exito(esNuevo.value ? 'Rol creado' : 'Rol actualizado; los permisos de sus usuarios se aplicaron de inmediato');
    emit('guardado', data);
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    guardando.value = false;
  }
}
const titulo = computed(() => (props.clonarDe ? 'Clonar rol' : esNuevo.value ? 'Nuevo rol' : cargando.value ? 'Rol' : soloLectura.value ? `Rol: ${form.nombre}` : `Editar rol: ${form.nombre}`));
</script>

<template>
  <BaseModal :abierto="abierto" :titulo="titulo" ancho="sm:max-w-6xl" @cerrar="emit('cerrar')">
    <p v-if="cargando" class="py-10 text-center text-sm text-slate-500">Cargando…</p>
    <form v-else id="form-rol" class="space-y-5" @submit.prevent="guardar">
      <p v-if="rol?.esPropio" class="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
        <Icono nombre="alerta" clase="mt-0.5 size-4 shrink-0" /> Usted tiene este rol asignado: por seguridad no puede modificarlo. Pida a otro administrador que lo haga.
      </p>
      <p v-else-if="rol?.esSistema" class="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-800">Rol plantilla: puede ajustarlo, pero no eliminarlo.</p>

      <!-- Datos del rol -->
      <div class="grid gap-3 sm:grid-cols-[1fr_1.5fr]">
        <div><label class="etiqueta" for="rol-nombre">Nombre *</label><input id="rol-nombre" v-model="form.nombre" class="input" required minlength="2" maxlength="80" :disabled="soloLectura" /></div>
        <div><label class="etiqueta" for="rol-desc">Descripción</label><input id="rol-desc" v-model="form.descripcion" class="input" maxlength="255" :disabled="soloLectura" /></div>
        <label class="flex min-h-10 items-center gap-3 text-sm sm:col-span-2">
          <input v-model="form.requiereMfa" type="checkbox" class="size-5 accent-marca-700" :disabled="soloLectura" />
          Exigir verificación en dos pasos (2FA) a quienes tengan este rol
        </label>
      </div>

      <!-- Barra de la matriz -->
      <div class="sticky -top-4 z-10 -mx-4 flex flex-col gap-2 border-y border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center">
        <div class="relative min-w-0 flex-1">
          <Icono nombre="buscar" clase="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input v-model="filtro" type="search" class="input pl-9" placeholder="Buscar permiso, módulo o acción…" aria-label="Buscar permisos" />
        </div>
        <label class="flex items-center gap-2 text-sm whitespace-nowrap text-slate-600"><input v-model="soloMarcados" type="checkbox" class="size-4 accent-marca-700" /> Solo marcados</label>
        <div v-if="!soloLectura" class="flex gap-1">
          <button type="button" class="btn-secundario min-h-9 px-3 text-xs" title="Marca todo lo de consulta (sin permisos sensibles)" @click="soloLecturaPreset">Solo lectura</button>
          <button type="button" class="btn-secundario min-h-9 px-3 text-xs" @click="limpiar">Quitar todo</button>
        </div>
        <p class="text-sm whitespace-nowrap text-slate-500">
          <strong class="text-slate-800 tabular-nums">{{ seleccion.size }}</strong>/{{ total }} permisos
          <span v-if="sensibles" class="ml-1 insignia bg-amber-50 text-amber-700">{{ sensibles }} sensibles</span>
        </p>
      </div>

      <!-- Matriz -->
      <p v-if="!grupos.length" class="py-6 text-center text-sm text-slate-500">Ningún permiso coincide con la búsqueda.</p>
      <section v-for="g in grupos" :key="g.modulo" class="overflow-hidden rounded-xl border border-slate-200">
        <header class="flex items-center gap-3 bg-slate-50 px-4 py-2.5">
          <input
            type="checkbox"
            class="size-4 accent-marca-700"
            :checked="estado(permisosDe(g)).todos"
            :indeterminate="estado(permisosDe(g)).alguno"
            :disabled="soloLectura"
            :aria-label="`Marcar todo ${g.nombre}`"
            @change="alternarVarios(permisosDe(g))"
          />
          <h3 class="flex-1 text-sm font-semibold text-slate-800">{{ g.nombre }}</h3>
          <span class="text-xs text-slate-500 tabular-nums">{{ estado(permisosDe(g)).n }}/{{ permisosDe(g).length }}</span>
        </header>

        <div class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead class="hidden md:table-header-group">
              <tr class="border-b border-slate-100 text-xs text-slate-500">
                <th class="w-64 px-4 py-2 text-left font-medium">Recurso</th>
                <th v-for="(t, a) in ACCIONES" :key="a" class="w-20 px-2 py-2 text-center font-medium">{{ t }}</th>
                <th class="px-4 py-2 text-left font-medium">Otras acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="f in g.filas" :key="f.recurso" class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 md:table-row md:p-0 hover:bg-slate-50/60">
                <td class="w-full md:w-64 md:px-4 md:py-2.5">
                  <label class="flex items-center gap-2.5" :class="soloLectura ? '' : 'cursor-pointer'">
                    <input
                      type="checkbox"
                      class="size-4 accent-marca-700"
                      :checked="estado(f.todos).todos"
                      :indeterminate="estado(f.todos).alguno"
                      :disabled="soloLectura"
                      :aria-label="`Marcar todo ${f.nombre}`"
                      @change="alternarVarios(f.todos)"
                    />
                    <span class="font-medium text-slate-800">{{ f.nombre }}</span>
                  </label>
                </td>
                <!-- Ver · Crear · Editar · Eliminar -->
                <td v-for="(t, a) in ACCIONES" :key="a" class="md:px-2 md:py-2.5 md:text-center" :class="{ 'hidden md:table-cell': !f.celdas[a] }">
                  <label
                    v-if="f.celdas[a]"
                    class="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1"
                    :class="editable(f.celdas[a]) ? 'cursor-pointer hover:bg-slate-100' : 'cursor-not-allowed opacity-45'"
                    :title="`${f.celdas[a].descripcion}${!otorgable(f.celdas[a].codigo) ? ' — usted no tiene este permiso' : ''}`"
                  >
                    <input type="checkbox" class="size-4 accent-marca-700" :checked="seleccion.has(f.celdas[a].codigo)" :disabled="!editable(f.celdas[a])" :aria-label="f.celdas[a].descripcion" @change="alternar(f.celdas[a])" />
                    <span class="md:sr-only">{{ t }}</span>
                    <span v-if="f.celdas[a].sensible" class="size-1.5 rounded-full bg-amber-500" aria-label="sensible" />
                  </label>
                  <span v-else class="text-slate-200" aria-hidden="true">—</span>
                </td>
                <!-- Otras acciones -->
                <td class="md:px-4 md:py-2">
                  <div class="flex flex-wrap gap-1.5">
                    <label
                      v-for="p in f.otras"
                      :key="p.codigo"
                      class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
                      :class="[
                        seleccion.has(p.codigo) ? 'border-marca-600 bg-marca-50 text-marca-800' : 'border-slate-200 text-slate-600',
                        editable(p) ? 'cursor-pointer hover:border-marca-600' : 'cursor-not-allowed opacity-45',
                      ]"
                      :title="`${p.descripcion}${!otorgable(p.codigo) ? ' — usted no tiene este permiso' : ''}`"
                    >
                      <input type="checkbox" class="size-3.5 accent-marca-700" :checked="seleccion.has(p.codigo)" :disabled="!editable(p)" :aria-label="p.descripcion" @change="alternar(p)" />
                      {{ etiquetaAccion(partes(p.codigo).accion) }}
                      <span v-if="p.sensible" class="size-1.5 rounded-full bg-amber-500" aria-label="sensible" />
                    </label>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <p class="flex items-center gap-1.5 text-xs text-slate-500">
        <span class="size-1.5 rounded-full bg-amber-500" /> Permiso sensible (costos, anulaciones, seguridad). Pase el mouse sobre una casilla para ver su descripción.
      </p>
    </form>

    <template #pie>
      <button class="btn-secundario" @click="emit('cerrar')">{{ soloLectura ? 'Cerrar' : 'Cancelar' }}</button>
      <button v-if="!soloLectura" class="btn-primario" form="form-rol" :disabled="guardando || cargando">{{ guardando ? 'Guardando…' : esNuevo ? 'Crear rol' : 'Guardar cambios' }}</button>
    </template>
  </BaseModal>
</template>
