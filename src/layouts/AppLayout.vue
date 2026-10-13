<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '@/stores/auth';
import { useContexto } from '@/stores/contexto';
import { obtenerSocket } from '@/services/socket';
import Icono from '@/components/Icono.vue';
import SelectorEmpresa from '@/components/SelectorEmpresa.vue';
import SelectorPeriodo from '@/components/SelectorPeriodo.vue';
import PaletaComandos from '@/components/PaletaComandos.vue';
import { useToast } from '@/stores/toast';
import { useTiempoReal } from '@/composables/useTiempoReal';
import { cant } from '@/utils/formato';
import { ESTADOS_TRANSFERENCIA } from '@/utils/kardex';
import { ACCIONES, navegacionVisible, paginaDe, puedeVer } from '@/router/navegacion';
import { useInstalacion } from '@/composables/useInstalacion';
import { useExportaciones } from '@/stores/exportaciones';

const auth = useAuth();
const route = useRoute();
const router = useRouter();
const contexto = useContexto();

// Navegación por áreas (router/navegacion.js): el menú lateral muestra las áreas y las
// pantallas de cada área van como pestañas sobre el contenido
const nav = computed(() => navegacionVisible(auth.canAlguno));
const areas = computed(() => nav.value.flatMap((s) => s.areas));
const paginaActual = computed(() => paginaDe(route.path));
const areaActual = computed(() => areas.value.find((a) => a.id === paginaActual.value?.area) ?? null);
const activoArea = (a) => areaActual.value?.id === a.id;
const activoPagina = (p) => paginaActual.value?.to === p.to;
const paleta = ref(false);
const opcionesPaleta = computed(() => [
  ...areas.value.flatMap((a) => a.paginas.map((p) => ({ to: p.to, etiqueta: p.etiqueta, icono: a.icono, grupo: a.etiqueta }))),
  ...ACCIONES.filter((a) => puedeVer(a, auth.canAlguno)),
]);

// Menú lateral: secciones plegables y modo compacto (solo íconos), recordados en este navegador
function leer(k, porDefecto) {
  try { return JSON.parse(localStorage.getItem(k)) ?? porDefecto; } catch { return porDefecto; }
}
function guardar(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ }
}
const compacto = ref(leer('kardex:menu-compacto', false));
watch(compacto, (v) => guardar('kardex:menu-compacto', v));
const plegados = ref(leer('kardex:menu-secciones-plegadas', []));
watch(plegados, (v) => guardar('kardex:menu-secciones-plegadas', v), { deep: true });
const plegado = (s) => !compacto.value && plegados.value.includes(s.nombre) && !s.areas.some(activoArea);
const alternarSeccion = (s) => {
  const i = plegados.value.indexOf(s.nombre);
  i >= 0 ? plegados.value.splice(i, 1) : plegados.value.push(s.nombre);
};
const esMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

// Móvil: las primeras cuatro áreas en la barra inferior y el resto en "Más"
const principales = computed(() => areas.value.slice(0, 4));
const secundarias = computed(() => areas.value.slice(4));
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
  movimiento: '/movimientos', kardex: '/kardex', transferencia: '/transferencias', 'transferencia-nueva': '/transferencias', 'guia-nueva': '/guias', 'sire-registro': '/sire',
  'compras-nueva': '/compras', 'compras-editar': '/compras', 'compras-detalle': '/compras',
  'ventas-nueva': '/ventas', 'ventas-editar': '/ventas', 'ventas-detalle': '/ventas',
};
watch(
  () => contexto.empresaActivaId,
  (nueva, anterior) => {
    if (!anterior || !nueva) return;
    const destino = DETALLE_A_LISTADO[route.name];
    // Una guía precargada desde un documento cambia ella misma a la empresa de ese documento
    const guiaDesdeDocumento = route.name === 'guia-nueva' && route.query.desde;
    if (destino && !guiaDesdeDocumento && (route.name !== 'kardex' || Object.keys(route.query).length)) router.replace(destino);
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
        <div v-for="(s, i) in nav" :key="s.nombre" class="mt-1">
          <button
            v-if="i > 0 && !compacto"
            class="group mt-4 mb-1 flex w-full items-center justify-between rounded-md px-3 py-1 text-[11px] font-semibold tracking-wider text-slate-500 uppercase hover:text-slate-300"
            :aria-expanded="!plegado(s)"
            @click="alternarSeccion(s)"
          >
            {{ s.nombre }}
            <Icono nombre="abajo" clase="size-3.5 transition-transform" :class="{ '-rotate-90': plegado(s) }" />
          </button>
          <div v-else-if="i > 0" class="mx-3 my-3 border-t border-white/5" />
          <div v-show="!plegado(s)" class="space-y-0.5">
            <RouterLink
              v-for="a in s.areas"
              :key="a.id"
              :to="a.to"
              :title="compacto ? a.etiqueta : undefined"
              class="relative flex min-h-10 items-center gap-3 rounded-lg text-sm font-medium transition-colors"
              :class="[
                compacto ? 'justify-center px-0' : 'px-3',
                activoArea(a) ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100',
              ]"
            >
              <span v-if="activoArea(a)" class="absolute inset-y-2 left-0 w-0.5 rounded-full bg-teal-400" aria-hidden="true" />
              <Icono :nombre="a.icono" clase="size-5 shrink-0" :class="activoArea(a) ? 'text-teal-300' : ''" />
              <span v-if="!compacto" class="truncate">{{ a.etiqueta }}</span>
              <span v-if="!compacto && a.paginas.length > 1" class="ml-auto text-[11px] text-slate-500 tabular-nums">{{ a.paginas.length }}</span>
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
        <nav v-if="areaActual && areaActual.id !== 'inicio'" class="hidden items-center gap-1.5 text-sm xl:flex" aria-label="Ubicación">
          <span :class="areaActual.paginas.length > 1 ? 'text-slate-400' : 'font-medium text-slate-700'">{{ areaActual.etiqueta }}</span>
          <template v-if="areaActual.paginas.length > 1">
            <Icono nombre="abajo" clase="size-3.5 -rotate-90 text-slate-300" />
            <span class="font-medium text-slate-700">{{ paginaActual.etiqueta }}</span>
          </template>
        </nav>
        <div class="min-w-0 flex-1 sm:max-w-xs xl:ml-4"><SelectorEmpresa /></div>
        <SelectorPeriodo v-if="paginaActual?.periodo" class="hidden sm:flex" />
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
        <!-- Pestañas del área: las demás pantallas del mismo tema -->
        <nav v-if="areaActual && areaActual.paginas.length > 1" class="-mt-1 mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 lg:-mt-3" :aria-label="areaActual.etiqueta">
          <RouterLink
            v-for="p in areaActual.paginas"
            :key="p.to"
            :to="p.to"
            class="-mb-px flex min-h-11 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors"
            :class="activoPagina(p) ? 'border-marca-700 text-marca-700' : 'border-transparent text-slate-500 hover:text-slate-800'"
            :aria-current="activoPagina(p) ? 'page' : undefined"
          >
            {{ p.etiqueta }}
          </RouterLink>
        </nav>
        <!-- En móvil la cabecera no tiene espacio para el período: va sobre el contenido -->
        <SelectorPeriodo v-if="paginaActual?.periodo" class="mb-4 sm:hidden" />
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
        <li v-for="o in principales" :key="o.id">
          <RouterLink :to="o.to" class="flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-medium" :class="activoArea(o) ? 'text-marca-700' : 'text-slate-500'">
            <span class="flex h-7 w-12 items-center justify-center rounded-full transition-colors" :class="activoArea(o) ? 'bg-marca-50' : ''"><Icono :nombre="o.icono" clase="size-5" /></span>
            <span class="max-w-full truncate px-1">{{ o.etiqueta }}</span>
          </RouterLink>
        </li>
        <li v-if="secundarias.length">
          <button class="flex h-16 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium" :class="secundarias.some(activoArea) ? 'text-marca-700' : 'text-slate-500'" @click="hojaAbierta = true">
            <span class="flex h-7 w-12 items-center justify-center rounded-full" :class="secundarias.some(activoArea) ? 'bg-marca-50' : ''"><Icono nombre="mas" clase="size-5" /></span> Más
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
          <RouterLink v-for="o in secundarias" :key="o.id" :to="o.to" class="flex min-h-12 items-center gap-3 rounded-lg px-3 font-medium" :class="activoArea(o) ? 'bg-marca-50 text-marca-700' : 'text-slate-700'">
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
