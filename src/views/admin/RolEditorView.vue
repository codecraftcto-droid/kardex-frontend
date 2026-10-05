<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, mensajeError } from '@/services/api';
import { useAuth } from '@/stores/auth';
import { useToast } from '@/stores/toast';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import Icono from '@/components/Icono.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const toast = useToast();

const esNuevo = computed(() => !route.params.id);
const catalogo = ref([]);
const form = reactive({ nombre: '', descripcion: '', requiereMfa: false });
const seleccion = ref(new Set());
const originales = ref(new Set());
const abiertos = ref(new Set());
const filtro = ref('');
const guardando = ref(false);
const rol = ref(null);

const puedeEditar = computed(() => auth.can('usuarios.roles.gestionar', {}));
const nombresModulo = {
  empresas: 'Empresas', sedes: 'Sedes', almacenes: 'Almacenes', usuarios: 'Usuarios y seguridad', auditoria: 'Auditoría',
  productos: 'Productos', kardex: 'Kardex', transferencia: 'Transferencias', reporte: 'Reportes',
};

onMounted(async () => {
  try {
    catalogo.value = (await api.get('/permisos')).data;
    if (!esNuevo.value) {
      rol.value = (await api.get(`/roles/${route.params.id}`)).data;
      Object.assign(form, { nombre: rol.value.nombre, descripcion: rol.value.descripcion ?? '', requiereMfa: rol.value.requiereMfa });
      seleccion.value = new Set(rol.value.permisos);
      originales.value = new Set(rol.value.permisos);
    }
    // En escritorio se abren todos los módulos; en móvil empiezan colapsados
    if (matchMedia('(min-width: 768px)').matches) abiertos.value = new Set(catalogo.value.map((m) => m.modulo));
  } catch (e) {
    toast.error(mensajeError(e));
  }
});

// Anti-escalamiento (UX): no puede otorgar permisos que no tiene; sí puede mantener o quitar los existentes
const otorgable = (codigo) => auth.canAlguno(codigo) || originales.value.has(codigo);
const editable = (codigo) => puedeEditar.value && (otorgable(codigo) || seleccion.value.has(codigo));

const modulosFiltrados = computed(() => {
  const q = filtro.value.trim().toLowerCase();
  if (!q) return catalogo.value;
  return catalogo.value
    .map((m) => ({ ...m, permisos: m.permisos.filter((p) => p.descripcion.toLowerCase().includes(q) || p.codigo.includes(q)) }))
    .filter((m) => m.permisos.length);
});

const marcados = (m) => m.permisos.filter((p) => seleccion.value.has(p.codigo)).length;

function alternar(codigo) {
  const s = new Set(seleccion.value);
  s.has(codigo) ? s.delete(codigo) : s.add(codigo);
  seleccion.value = s;
}
function alternarModulo(m) {
  const s = new Set(seleccion.value);
  const disponibles = m.permisos.filter((p) => editable(p.codigo));
  const todos = disponibles.every((p) => s.has(p.codigo));
  disponibles.forEach((p) => (todos ? s.delete(p.codigo) : otorgable(p.codigo) && s.add(p.codigo)));
  seleccion.value = s;
}
function alternarAbierto(modulo) {
  const s = new Set(abiertos.value);
  s.has(modulo) ? s.delete(modulo) : s.add(modulo);
  abiertos.value = s;
}

async function guardar() {
  guardando.value = true;
  try {
    const datos = { ...form, permisos: [...seleccion.value] };
    if (esNuevo.value) {
      const { data } = await api.post('/roles', datos);
      toast.exito('Rol creado');
      router.replace(`/roles/${data.id}`);
    } else {
      await api.put(`/roles/${route.params.id}`, datos);
      originales.value = new Set(seleccion.value);
      toast.exito('Rol actualizado; los permisos de sus usuarios se aplicaron de inmediato');
    }
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <form class="space-y-5" @submit.prevent="guardar">
    <EncabezadoPagina :titulo="esNuevo ? 'Nuevo rol' : form.nombre || 'Rol'" :subtitulo="`${seleccion.size} permisos seleccionados`">
      <template #antes>
        <RouterLink to="/roles" class="mb-1 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <Icono nombre="atras" clase="size-4" /> Roles
        </RouterLink>
      </template>
    </EncabezadoPagina>

    <section class="tarjeta grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
      <div>
        <label class="etiqueta" for="nombre">Nombre *</label>
        <input id="nombre" v-model="form.nombre" class="input" required :disabled="!puedeEditar" />
      </div>
      <div>
        <label class="etiqueta" for="desc">Descripción</label>
        <input id="desc" v-model="form.descripcion" class="input" :disabled="!puedeEditar" />
      </div>
      <label class="flex min-h-11 items-center gap-3 text-sm sm:col-span-2">
        <input v-model="form.requiereMfa" type="checkbox" class="size-5 accent-marca-700" :disabled="!puedeEditar" />
        Exigir verificación en dos pasos (2FA) a quienes tengan este rol
      </label>
    </section>

    <!-- Matriz de permisos -->
    <section class="space-y-3">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 class="font-semibold">Matriz de permisos</h2>
        <input v-model="filtro" type="search" class="input sm:max-w-xs" placeholder="Filtrar permisos…" />
      </div>

      <div v-for="m in modulosFiltrados" :key="m.modulo" class="tarjeta overflow-hidden">
        <div class="flex items-center gap-3 px-4">
          <input
            type="checkbox"
            class="size-5 shrink-0 accent-marca-700"
            :aria-label="`Seleccionar todo ${m.modulo}`"
            :checked="marcados(m) === m.permisos.length"
            :indeterminate="marcados(m) > 0 && marcados(m) < m.permisos.length"
            :disabled="!puedeEditar"
            @change="alternarModulo(m)"
          />
          <button type="button" class="flex min-h-12 flex-1 items-center justify-between gap-2 text-left" :aria-expanded="abiertos.has(m.modulo)" @click="alternarAbierto(m.modulo)">
            <span class="font-medium">{{ nombresModulo[m.modulo] || m.modulo }}</span>
            <span class="flex items-center gap-2 text-sm text-slate-500">
              {{ marcados(m) }}/{{ m.permisos.length }}
              <Icono nombre="abajo" clase="size-4 transition-transform" :class="{ 'rotate-180': abiertos.has(m.modulo) }" />
            </span>
          </button>
        </div>
        <ul v-show="abiertos.has(m.modulo) || filtro" class="grid border-t border-slate-100 sm:grid-cols-2">
          <li v-for="p in m.permisos" :key="p.codigo" class="border-b border-slate-100 sm:odd:border-r">
            <label class="flex min-h-12 cursor-pointer items-start gap-3 px-4 py-3" :class="{ 'cursor-not-allowed opacity-50': !editable(p.codigo) }">
              <input
                type="checkbox"
                class="mt-0.5 size-5 shrink-0 accent-marca-700"
                :checked="seleccion.has(p.codigo)"
                :disabled="!editable(p.codigo)"
                @change="alternar(p.codigo)"
              />
              <span class="min-w-0">
                <span class="block text-sm">
                  {{ p.descripcion }}
                  <span v-if="p.sensible" class="insignia ml-1 bg-amber-50 text-amber-700">sensible</span>
                </span>
                <code class="block truncate text-xs text-slate-400">{{ p.codigo }}</code>
                <span v-if="!otorgable(p.codigo)" class="block text-xs text-slate-400">Usted no tiene este permiso</span>
              </span>
            </label>
          </li>
        </ul>
      </div>
    </section>

    <!-- Barra de acción fija en móvil -->
    <div v-if="puedeEditar" class="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border lg:bottom-4">
      <div class="flex justify-end gap-2">
        <RouterLink to="/roles" class="btn-secundario">Cancelar</RouterLink>
        <button class="btn-primario" :disabled="guardando">{{ guardando ? 'Guardando…' : 'Guardar rol' }}</button>
      </div>
    </div>
  </form>
</template>
