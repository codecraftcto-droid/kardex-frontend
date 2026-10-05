<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '@/stores/auth';
import { useContexto } from '@/stores/contexto';
import { obtenerSocket } from '@/services/socket';
import Icono from '@/components/Icono.vue';
import SelectorEmpresa from '@/components/SelectorEmpresa.vue';
import { useToast } from '@/stores/toast';
import { useTiempoReal } from '@/composables/useTiempoReal';
import { cant } from '@/utils/formato';
import { ESTADOS_TRANSFERENCIA } from '@/utils/kardex';
import { PERMISOS_REPORTES } from '@/router';
import { useInstalacion } from '@/composables/useInstalacion';
import { useExportaciones } from '@/stores/exportaciones';

const auth = useAuth();
const route = useRoute();
const router = useRouter();
const contexto = useContexto();

// Menú dinámico: cada opción declara el permiso que la habilita (sin roles en el código)
const opciones = [
  { to: '/', etiqueta: 'Inicio', icono: 'inicio' },
  { to: '/inventario', etiqueta: 'Inventario', icono: 'inventario', permiso: 'kardex.stock.ver', grupo: 'Kardex' },
  { to: '/movimientos', etiqueta: 'Movimientos', icono: 'movimientos', permiso: 'kardex.stock.ver', grupo: 'Kardex' },
  { to: '/transferencias', etiqueta: 'Transferencias', icono: 'transferencias', permiso: 'transferencia.ver', grupo: 'Kardex' },
  { to: '/productos', etiqueta: 'Productos', icono: 'productos', permiso: 'productos.producto.ver', grupo: 'Kardex' },
  { to: '/kardex', etiqueta: 'Kardex por producto', icono: 'kardex', permiso: 'kardex.stock.ver', grupo: 'Kardex' },
  { to: '/reportes', etiqueta: 'Reportes', icono: 'reportes', permisos: PERMISOS_REPORTES, grupo: 'Kardex' },
  { to: '/compras', etiqueta: 'Compras', icono: 'entrada', permiso: 'compras.compra.ver', grupo: 'Comercial' },
  { to: '/ventas', etiqueta: 'Ventas', icono: 'salida', permiso: 'ventas.venta.ver', grupo: 'Comercial' },
  { to: '/empresas', etiqueta: 'Empresas', icono: 'empresa', permiso: 'empresas.empresa.ver', grupo: 'Organización' },
  { to: '/sedes', etiqueta: 'Sedes', icono: 'sede', permiso: 'sedes.sede.ver', grupo: 'Organización' },
  { to: '/almacenes', etiqueta: 'Almacenes', icono: 'almacen', permiso: 'almacenes.almacen.ver', grupo: 'Organización' },
  { to: '/usuarios', etiqueta: 'Usuarios', icono: 'usuarios', permiso: 'usuarios.usuario.ver', grupo: 'Seguridad' },
  { to: '/roles', etiqueta: 'Roles y permisos', icono: 'roles', permiso: 'usuarios.roles.ver', grupo: 'Seguridad' },
  { to: '/auditoria', etiqueta: 'Auditoría', icono: 'auditoria', permiso: 'auditoria.ver', grupo: 'Seguridad' },
];
const visibles = computed(() =>
  opciones.filter((o) => (!o.permiso || auth.canAlguno(o.permiso)) && (!o.permisos || o.permisos.some((p) => auth.canAlguno(p)))),
);
const principales = computed(() => visibles.value.slice(0, 4));
const secundarias = computed(() => visibles.value.slice(4));

const activo = (to) => (to === '/' ? route.path === '/' : route.path.startsWith(to));
const hojaAbierta = ref(false);
const menuUsuario = ref(false);
watch(() => route.fullPath, () => { hojaAbierta.value = false; menuUsuario.value = false; });

const conectado = ref(false);
let socket;
const on = () => (conectado.value = true);
const off = () => (conectado.value = false);
onMounted(() => {
  socket = obtenerSocket();
  conectado.value = !!socket?.connected;
  socket?.on('connect', on).on('disconnect', off);
});
onBeforeUnmount(() => socket?.off('connect', on).off('disconnect', off));

const toast = useToast();
const { disponible: puedeInstalar, instalar } = useInstalacion();

/**
 * Cambio de empresa activa: la pantalla actual se vuelve a montar (ver :key en RouterView),
 * así ninguna vista conserva datos ni filtros de la empresa anterior. Las pantallas de
 * detalle vuelven a su listado porque el registro abierto pertenece a la otra empresa.
 */
const DETALLE_A_LISTADO = {
  movimiento: '/movimientos', kardex: '/kardex', transferencia: '/transferencias', 'transferencia-nueva': '/transferencias',
  'compras-nueva': '/compras', 'compras-editar': '/compras', 'compras-detalle': '/compras',
  'ventas-nueva': '/ventas', 'ventas-editar': '/ventas', 'ventas-detalle': '/ventas',
};
watch(
  () => contexto.empresaActivaId,
  (nueva, anterior) => {
    if (!anterior || !nueva) return;
    const destino = DETALLE_A_LISTADO[route.name];
    if (destino && (route.name !== 'kardex' || Object.keys(route.query).length)) router.replace(destino);
    toast.info(`Empresa activa: ${contexto.empresaActiva?.razonSocial}`);
  },
);

// Alertas de stock en tiempo real, en cualquier pantalla
useTiempoReal('stock:alerta', (a) =>
  toast.aviso(`Stock bajo: ${a.producto} en ${a.almacen} (${cant(a.cantidad)} de mínimo ${cant(a.stockMinimo)})`),
);

// Exportaciones de reportes en segundo plano (avisos en cualquier pantalla)
const exportaciones = useExportaciones();
useTiempoReal('reporte:progreso', exportaciones.alProgreso);
useTiempoReal('reporte:listo', exportaciones.alListo);
useTiempoReal('reporte:error', exportaciones.alError);

// Avance de transferencias que involucran a mis almacenes (salvo las acciones propias)
useTiempoReal('transferencia:cambio', (t) => {
  if (t.actorId !== auth.usuario?.id) toast.info(`Transferencia ${t.numero}: ${ESTADOS_TRANSFERENCIA[t.estado].texto.toLowerCase()}`);
});

const iniciales = computed(() =>
  (auth.usuario?.nombres || '?').split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase(),
);
</script>

<template>
  <div class="min-h-dvh">
    <!-- Barra lateral fija (escritorio) -->
    <aside class="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
      <div class="flex h-16 items-center gap-2 border-b border-slate-200 px-5">
        <img src="/favicon.svg" alt="" class="size-8" />
        <div class="min-w-0">
          <p class="font-semibold text-slate-900">Kardex</p>
          <p class="truncate text-xs text-slate-500">{{ auth.usuario?.tenant?.nombre }}</p>
        </div>
      </div>
      <nav class="flex-1 space-y-1 overflow-y-auto p-3">
        <template v-for="(o, i) in visibles" :key="o.to">
          <p v-if="o.grupo && visibles[i - 1]?.grupo !== o.grupo" class="px-3 pt-4 pb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">
            {{ o.grupo }}
          </p>
          <RouterLink
            :to="o.to"
            class="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium"
            :class="activo(o.to) ? 'bg-marca-50 text-marca-700' : 'text-slate-600 hover:bg-slate-50'"
          >
            <Icono :nombre="o.icono" /> {{ o.etiqueta }}
          </RouterLink>
        </template>
      </nav>
    </aside>

    <div class="lg:pl-64">
      <!-- Cabecera -->
      <header class="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
        <img src="/favicon.svg" alt="Kardex" class="size-8 lg:hidden" />
        <div class="min-w-0 flex-1 sm:max-w-xs"><SelectorEmpresa /></div>
        <span v-if="auth.esCliente" class="insignia hidden shrink-0 bg-indigo-50 text-indigo-700 sm:inline-flex">Portal cliente · solo lectura</span>
        <div class="ml-auto flex items-center gap-2">
          <span
            class="hidden items-center gap-1.5 text-xs sm:flex"
            :class="conectado ? 'text-emerald-600' : 'text-slate-400'"
            :title="conectado ? 'Tiempo real conectado' : 'Tiempo real desconectado'"
          >
            <span class="size-2 rounded-full" :class="conectado ? 'bg-emerald-500' : 'bg-slate-300'" />
            {{ conectado ? 'En línea' : 'Sin conexión' }}
          </span>
          <div class="relative">
            <button
              class="flex size-11 items-center justify-center rounded-full bg-marca-700 text-sm font-semibold text-white"
              :aria-expanded="menuUsuario"
              aria-label="Menú de usuario"
              @click="menuUsuario = !menuUsuario"
            >
              {{ iniciales }}
            </button>
            <div v-if="menuUsuario" class="fixed inset-0 z-10" @click="menuUsuario = false" />
            <div v-if="menuUsuario" class="tarjeta absolute right-0 z-20 mt-2 w-64 p-2 shadow-lg">
              <div class="border-b border-slate-100 px-3 pt-1 pb-2">
                <p class="truncate text-sm font-medium">{{ auth.usuario?.nombres }}</p>
                <p class="truncate text-xs text-slate-500">{{ auth.usuario?.email }}</p>
              </div>
              <RouterLink to="/perfil" class="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm hover:bg-slate-50">
                <Icono nombre="perfil" /> Mi perfil y sesiones
              </RouterLink>
              <button v-if="puedeInstalar" class="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm hover:bg-slate-50" @click="instalar">
                <Icono nombre="descargar" /> Instalar aplicación
              </button>
              <button class="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm text-red-600 hover:bg-red-50" @click="auth.logout()">
                <Icono nombre="salir" /> Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      </header>

      <main class="pb-barra-movil mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:py-8">
        <!-- :key = empresa activa → al cambiar de empresa la vista se recrea con datos frescos -->
        <RouterView v-slot="{ Component }">
          <component :is="Component" :key="contexto.empresaActivaId" />
        </RouterView>
      </main>
    </div>

    <!-- Barra inferior (móvil/tablet) -->
    <nav class="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Navegación principal">
      <ul class="grid" :style="{ gridTemplateColumns: `repeat(${principales.length + (secundarias.length ? 1 : 0)}, minmax(0, 1fr))` }">
        <li v-for="o in principales" :key="o.to">
          <RouterLink :to="o.to" class="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium" :class="activo(o.to) ? 'text-marca-700' : 'text-slate-500'">
            <Icono :nombre="o.icono" clase="size-6" /> <span class="truncate">{{ o.etiqueta }}</span>
          </RouterLink>
        </li>
        <li v-if="secundarias.length">
          <button class="flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium" :class="secundarias.some((o) => activo(o.to)) ? 'text-marca-700' : 'text-slate-500'" @click="hojaAbierta = true">
            <Icono nombre="mas" clase="size-6" /> Más
          </button>
        </li>
      </ul>
    </nav>

    <!-- Hoja inferior "Más" -->
    <Transition name="hoja">
      <div v-if="hojaAbierta" class="fixed inset-0 z-40 lg:hidden">
        <div class="absolute inset-0 bg-slate-900/40" @click="hojaAbierta = false" />
        <div class="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div class="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300" />
          <RouterLink v-for="o in secundarias" :key="o.to" :to="o.to" class="flex min-h-12 items-center gap-3 rounded-lg px-3 font-medium" :class="activo(o.to) ? 'bg-marca-50 text-marca-700' : 'text-slate-700'">
            <Icono :nombre="o.icono" /> {{ o.etiqueta }}
          </RouterLink>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.hoja-enter-active, .hoja-leave-active { transition: opacity 0.2s ease; }
.hoja-enter-from, .hoja-leave-to { opacity: 0; }
</style>
