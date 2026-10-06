<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '@/stores/auth';
import { useContexto } from '@/stores/contexto';
import { obtenerSocket } from '@/services/socket';
import Icono from '@/components/Icono.vue';
import SelectorEmpresa from '@/components/SelectorEmpresa.vue';
import PaletaComandos from '@/components/PaletaComandos.vue';
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
  { to: '/pos', etiqueta: 'Caja', icono: 'caja', permiso: 'pos.venta.crear', grupo: 'Punto de venta' },
  { to: '/comprobantes', etiqueta: 'Comprobantes', icono: 'comprobante', permiso: 'pos.venta.ver', grupo: 'Punto de venta' },
  { to: '/clientes', etiqueta: 'Clientes', icono: 'usuarios', permiso: 'clientes.cliente.ver', grupo: 'Punto de venta' },
  { to: '/cuentas-por-cobrar', etiqueta: 'Cuentas por cobrar', icono: 'tarjeta', permiso: 'cxc.cuenta.ver', grupo: 'Punto de venta' },
  { to: '/cajas', etiqueta: 'Cajas y turnos', icono: 'kardex', permisos: ['pos.caja.configurar', 'pos.caja.ver'], grupo: 'Punto de venta' },
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
// Acciones rápidas (solo para el buscador Ctrl+K)
const ACCIONES = [
  { to: '/pos', etiqueta: 'Nueva venta en caja', icono: 'caja', permiso: 'pos.venta.crear', grupo: 'Acción' },
  { to: '/movimientos/entrada', etiqueta: 'Registrar entrada', icono: 'entrada', permiso: 'kardex.entrada.crear', grupo: 'Acción' },
  { to: '/movimientos/salida', etiqueta: 'Registrar salida', icono: 'salida', permiso: 'kardex.salida.crear', grupo: 'Acción' },
  { to: '/transferencias/nueva', etiqueta: 'Nueva transferencia', icono: 'transferencias', permiso: 'transferencia.solicitar', grupo: 'Acción' },
  { to: '/compras/nueva', etiqueta: 'Registrar compra', icono: 'entrada', permiso: 'compras.compra.crear', grupo: 'Acción' },
  { to: '/perfil', etiqueta: 'Mi perfil y sesiones', icono: 'perfil', grupo: 'Cuenta' },
];
const paleta = ref(false);
const opcionesPaleta = computed(() => [...visibles.value, ...ACCIONES.filter((a) => !a.permiso || auth.canAlguno(a.permiso))]);

// Menú lateral: grupos plegables y modo compacto (solo íconos), recordados en este navegador
function leer(k, porDefecto) {
  try { return JSON.parse(localStorage.getItem(k)) ?? porDefecto; } catch { return porDefecto; }
}
function guardar(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ }
}
const compacto = ref(leer('kardex:menu-compacto', false));
watch(compacto, (v) => guardar('kardex:menu-compacto', v));
const plegados = ref(leer('kardex:menu-plegados', []));
watch(plegados, (v) => guardar('kardex:menu-plegados', v), { deep: true });
const grupos = computed(() => {
  const lista = [];
  for (const o of visibles.value) {
    const g = o.grupo ?? '';
    if (lista.at(-1)?.nombre !== g) lista.push({ nombre: g, opciones: [] });
    lista.at(-1).opciones.push(o);
  }
  return lista;
});
const plegado = (g) => !compacto.value && plegados.value.includes(g.nombre) && !g.opciones.some((o) => activo(o.to));
const alternarGrupo = (g) => {
  const i = plegados.value.indexOf(g.nombre);
  i >= 0 ? plegados.value.splice(i, 1) : plegados.value.push(g.nombre);
};
const actual = computed(() => visibles.value.filter((o) => activo(o.to)).sort((a, b) => b.to.length - a.to.length)[0]);
const esMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

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
  comprobante: '/comprobantes', pos: '/pos', 'cxc-cliente': '/cuentas-por-cobrar',
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

const ROL_VISIBLE = { cliente: 'Portal cliente', operador: 'Operador de caja', interno: 'Equipo del estudio' };
const iniciales = computed(() =>
  (auth.usuario?.nombres || '?').split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase(),
);
</script>

<template>
  <div class="min-h-dvh bg-slate-50">
    <!-- ═════════ Barra lateral (escritorio) ═════════ -->
    <aside
      class="fixed inset-y-0 left-0 z-30 hidden flex-col bg-slate-950 text-slate-300 transition-[width] duration-200 lg:flex"
      :class="compacto ? 'w-[4.5rem]' : 'w-64'"
    >
      <div class="flex h-16 shrink-0 items-center gap-3 px-4" :class="{ 'justify-center px-0': compacto }">
        <img src="/favicon.svg" alt="" class="size-9 rounded-lg ring-1 ring-white/10" />
        <div v-if="!compacto" class="min-w-0">
          <p class="font-semibold tracking-tight text-white">Kardex</p>
          <p class="truncate text-xs text-slate-400">{{ auth.usuario?.tenant?.nombre }}</p>
        </div>
      </div>

      <nav class="flex-1 overflow-y-auto px-3 pb-4" aria-label="Menú principal">
        <div v-for="g in grupos" :key="g.nombre" class="mt-1">
          <button
            v-if="g.nombre && !compacto"
            class="group mt-4 mb-1 flex w-full items-center justify-between rounded-md px-3 py-1 text-[11px] font-semibold tracking-wider text-slate-500 uppercase hover:text-slate-300"
            :aria-expanded="!plegado(g)"
            @click="alternarGrupo(g)"
          >
            {{ g.nombre }}
            <Icono nombre="abajo" clase="size-3.5 transition-transform" :class="{ '-rotate-90': plegado(g) }" />
          </button>
          <div v-else-if="g.nombre" class="mx-3 my-3 border-t border-white/5" />
          <div v-show="!plegado(g)" class="space-y-0.5">
            <RouterLink
              v-for="o in g.opciones"
              :key="o.to"
              :to="o.to"
              :title="compacto ? o.etiqueta : undefined"
              class="relative flex min-h-10 items-center gap-3 rounded-lg text-sm font-medium transition-colors"
              :class="[
                compacto ? 'justify-center px-0' : 'px-3',
                activo(o.to) ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100',
              ]"
            >
              <span v-if="activo(o.to)" class="absolute inset-y-2 left-0 w-0.5 rounded-full bg-teal-400" aria-hidden="true" />
              <Icono :nombre="o.icono" clase="size-5 shrink-0" :class="activo(o.to) ? 'text-teal-300' : ''" />
              <span v-if="!compacto" class="truncate">{{ o.etiqueta }}</span>
            </RouterLink>
          </div>
        </div>
      </nav>

      <!-- Usuario -->
      <div class="relative shrink-0 border-t border-white/5 p-3">
        <button
          class="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-white/5"
          :class="{ 'justify-center': compacto }"
          :aria-expanded="menuUsuario"
          aria-label="Menú de usuario"
          @click="menuUsuario = !menuUsuario"
        >
          <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-marca-700 text-sm font-semibold text-white">{{ iniciales }}</span>
          <span v-if="!compacto" class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium text-white">{{ auth.usuario?.nombres }}</span>
            <span class="block truncate text-xs text-slate-400">{{ ROL_VISIBLE[auth.usuario?.tipo] ?? auth.usuario?.email }}</span>
          </span>
          <Icono v-if="!compacto" nombre="abajo" clase="size-4 rotate-180 text-slate-500" />
        </button>
        <div v-if="menuUsuario" class="fixed inset-0 z-10" @click="menuUsuario = false" />
        <div v-if="menuUsuario" class="absolute bottom-full left-3 z-20 mb-2 w-60 rounded-xl border border-slate-200 bg-white p-2 text-slate-700 shadow-xl">
          <div class="border-b border-slate-100 px-3 pt-1 pb-2">
            <p class="truncate text-sm font-medium text-slate-900">{{ auth.usuario?.nombres }}</p>
            <p class="truncate text-xs text-slate-500">{{ auth.usuario?.email }}</p>
          </div>
          <RouterLink to="/perfil" class="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm hover:bg-slate-50"><Icono nombre="perfil" clase="size-5" /> Mi perfil y sesiones</RouterLink>
          <button v-if="puedeInstalar" class="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm hover:bg-slate-50" @click="instalar"><Icono nombre="descargar" clase="size-5" /> Instalar aplicación</button>
          <button class="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm text-red-600 hover:bg-red-50" @click="auth.logout()"><Icono nombre="salir" clase="size-5" /> Cerrar sesión</button>
        </div>
      </div>
    </aside>

    <div class="transition-[padding] duration-200" :class="compacto ? 'lg:pl-[4.5rem]' : 'lg:pl-64'">
      <!-- ═════════ Cabecera ═════════ -->
      <header class="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur-md sm:px-6">
        <img src="/favicon.svg" alt="Kardex" class="size-8 lg:hidden" />
        <button
          class="hidden size-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 lg:flex"
          :aria-label="compacto ? 'Expandir menú' : 'Contraer menú'"
          :title="compacto ? 'Expandir menú' : 'Contraer menú'"
          @click="compacto = !compacto"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="size-5" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></svg>
        </button>
        <nav v-if="actual && actual.to !== '/'" class="hidden items-center gap-1.5 text-sm xl:flex" aria-label="Ubicación">
          <span class="text-slate-400">{{ actual.grupo }}</span>
          <Icono nombre="abajo" clase="size-3.5 -rotate-90 text-slate-300" />
          <span class="font-medium text-slate-700">{{ actual.etiqueta }}</span>
        </nav>
        <div class="min-w-0 flex-1 sm:max-w-xs xl:ml-4"><SelectorEmpresa /></div>
        <span v-if="auth.esCliente" class="insignia hidden shrink-0 bg-indigo-50 text-indigo-700 md:inline-flex">Portal cliente · solo lectura</span>
        <span v-else-if="auth.usuario?.tipo === 'operador'" class="insignia hidden shrink-0 bg-amber-50 text-amber-800 md:inline-flex">Operador de caja</span>

        <div class="ml-auto flex items-center gap-2">
          <button
            class="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-500 shadow-sm hover:border-slate-300 hover:text-slate-700"
            aria-label="Buscar en el menú"
            @click="paleta = true"
          >
            <Icono nombre="buscar" clase="size-4" />
            <span class="hidden md:inline">Buscar…</span>
            <kbd class="hidden rounded border border-slate-200 bg-slate-50 px-1.5 text-[11px] text-slate-400 md:inline">{{ esMac ? '⌘' : 'Ctrl' }} K</kbd>
          </button>
          <span
            class="hidden size-10 items-center justify-center sm:flex"
            :title="conectado ? 'Tiempo real conectado' : 'Tiempo real desconectado'"
            :aria-label="conectado ? 'En línea' : 'Sin conexión'"
            role="status"
          >
            <span class="relative flex size-2.5">
              <span v-if="conectado" class="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:hidden" />
              <span class="relative inline-flex size-2.5 rounded-full" :class="conectado ? 'bg-emerald-500' : 'bg-slate-300'" />
            </span>
          </span>
          <!-- Usuario en móvil (en escritorio está en la barra lateral) -->
          <div class="relative lg:hidden">
            <button
              class="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-marca-700 text-sm font-semibold text-white"
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
              <RouterLink to="/perfil" class="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm hover:bg-slate-50"><Icono nombre="perfil" /> Mi perfil y sesiones</RouterLink>
              <button v-if="puedeInstalar" class="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm hover:bg-slate-50" @click="instalar"><Icono nombre="descargar" /> Instalar aplicación</button>
              <button class="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm text-red-600 hover:bg-red-50" @click="auth.logout()"><Icono nombre="salir" /> Cerrar sesión</button>
            </div>
          </div>
        </div>
      </header>

      <main class="pb-barra-movil mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <!-- :key = empresa activa → al cambiar de empresa la vista se recrea con datos frescos -->
        <RouterView v-slot="{ Component }">
          <component :is="Component" :key="contexto.empresaActivaId" />
        </RouterView>
      </main>
    </div>

    <PaletaComandos v-model="paleta" :opciones="opcionesPaleta" />

    <!-- Barra inferior (móvil/tablet) -->
    <nav class="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden" aria-label="Navegación principal">
      <ul class="grid" :style="{ gridTemplateColumns: `repeat(${principales.length + (secundarias.length ? 1 : 0)}, minmax(0, 1fr))` }">
        <li v-for="o in principales" :key="o.to">
          <RouterLink :to="o.to" class="flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-medium" :class="activo(o.to) ? 'text-marca-700' : 'text-slate-500'">
            <span class="flex h-7 w-12 items-center justify-center rounded-full transition-colors" :class="activo(o.to) ? 'bg-marca-50' : ''"><Icono :nombre="o.icono" clase="size-5" /></span>
            <span class="max-w-full truncate px-1">{{ o.etiqueta }}</span>
          </RouterLink>
        </li>
        <li v-if="secundarias.length">
          <button class="flex h-16 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium" :class="secundarias.some((o) => activo(o.to)) ? 'text-marca-700' : 'text-slate-500'" @click="hojaAbierta = true">
            <span class="flex h-7 w-12 items-center justify-center rounded-full" :class="secundarias.some((o) => activo(o.to)) ? 'bg-marca-50' : ''"><Icono nombre="mas" clase="size-5" /></span> Más
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
