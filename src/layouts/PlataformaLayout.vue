<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { usePlataforma } from '@/stores/plataforma';
import Icono from '@/components/Icono.vue';

/**
 * Consola de la plataforma (superadministrador). Mismo esquema que el sistema de los estudios
 * (menú lateral oscuro), con acento ámbar y el rótulo "Plataforma" para que nunca se confundan.
 */
const plataforma = usePlataforma();
const route = useRoute();
const menuAbierto = ref(false);
watch(() => route.fullPath, () => (menuAbierto.value = false));

const SECCIONES = [
  {
    nombre: 'Servicio',
    opciones: [
      { to: '/plataforma', etiqueta: 'Monitoreo', icono: 'rayo' },
      { to: '/plataforma/estudios', etiqueta: 'Estudios', icono: 'empresa' },
      { to: '/plataforma/auditoria', etiqueta: 'Auditoría', icono: 'auditoria' },
    ],
  },
  {
    nombre: 'Negocio',
    opciones: [
      { to: '/plataforma/planes', etiqueta: 'Planes y módulos', icono: 'productos' },
      { to: '/plataforma/facturacion', etiqueta: 'Facturación', icono: 'reportes' },
    ],
  },
  { nombre: 'SUNAT', opciones: [{ to: '/plataforma/cronograma', etiqueta: 'Cronograma', icono: 'calendario' }] },
];
const opciones = SECCIONES.flatMap((s) => s.opciones);
const activo = (to) => (to === '/plataforma' ? route.path === '/plataforma' : route.path === to || route.path.startsWith(`${to}/`));
const actual = computed(() => opciones.find((o) => activo(o.to)));
const iniciales = computed(() => (plataforma.admin?.nombres || '?').split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase());
</script>

<template>
  <div class="min-h-dvh bg-slate-50">
    <!-- ═════════ Barra lateral (escritorio) ═════════ -->
    <aside class="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-slate-950 text-slate-300 lg:flex">
      <div class="flex h-16 shrink-0 items-center gap-3 px-4">
        <img src="/favicon.svg" alt="" class="size-9 rounded-lg ring-1 ring-amber-400/40" />
        <div class="min-w-0">
          <p class="font-semibold tracking-tight text-white">Kardex</p>
          <p class="text-xs font-medium text-amber-300">Plataforma</p>
        </div>
      </div>
      <nav class="flex-1 overflow-y-auto px-3 pb-4" aria-label="Plataforma">
        <div v-for="s in SECCIONES" :key="s.nombre">
          <p class="mt-5 mb-1 px-3 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{{ s.nombre }}</p>
          <RouterLink
            v-for="o in s.opciones"
            :key="o.to"
            :to="o.to"
            class="relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors"
            :class="activo(o.to) ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'"
          >
            <span v-if="activo(o.to)" class="absolute inset-y-2 left-0 w-0.5 rounded-full bg-amber-400" aria-hidden="true" />
            <Icono :nombre="o.icono" clase="size-5 shrink-0" :class="activo(o.to) ? 'text-amber-300' : ''" />
            <span class="truncate">{{ o.etiqueta }}</span>
          </RouterLink>
        </div>
      </nav>
      <div class="relative shrink-0 border-t border-white/5 p-3">
        <button class="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-white/5" :aria-expanded="menuAbierto" aria-label="Menú de usuario" @click="menuAbierto = !menuAbierto">
          <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500 text-sm font-semibold text-slate-900">{{ iniciales }}</span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium text-white">{{ plataforma.admin?.nombres }}</span>
            <span class="block truncate text-xs text-slate-400">{{ plataforma.admin?.rol === 'ADMIN' ? 'Superadministrador' : 'Soporte' }}</span>
          </span>
        </button>
        <div v-if="menuAbierto" class="fixed inset-0 z-10" @click="menuAbierto = false" />
        <div v-if="menuAbierto" class="absolute bottom-full left-3 z-20 mb-2 w-60 rounded-xl border border-slate-200 bg-white p-2 text-slate-700 shadow-xl">
          <div class="border-b border-slate-100 px-3 pt-1 pb-2">
            <p class="truncate text-sm font-medium text-slate-900">{{ plataforma.admin?.nombres }}</p>
            <p class="truncate text-xs text-slate-500">{{ plataforma.admin?.email }}</p>
          </div>
          <button class="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm text-red-600 hover:bg-red-50" @click="plataforma.logout()"><Icono nombre="salir" clase="size-5" /> Cerrar sesión</button>
        </div>
      </div>
    </aside>

    <div class="lg:pl-64">
      <!-- ═════════ Cabecera ═════════ -->
      <header class="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
        <div class="flex h-16 items-center gap-3 px-4 sm:px-6">
          <img src="/favicon.svg" alt="Kardex" class="size-8 lg:hidden" />
          <span class="insignia shrink-0 bg-amber-100 text-amber-800">Plataforma</span>
          <span v-if="actual" class="hidden truncate text-sm font-medium text-slate-700 sm:inline">{{ actual.etiqueta }}</span>
          <div class="relative ml-auto lg:hidden">
            <button class="flex size-10 items-center justify-center rounded-full bg-amber-500 text-sm font-semibold text-slate-900" aria-label="Menú de usuario" @click="menuAbierto = !menuAbierto">{{ iniciales }}</button>
            <div v-if="menuAbierto" class="fixed inset-0 z-10" @click="menuAbierto = false" />
            <div v-if="menuAbierto" class="tarjeta absolute right-0 z-20 mt-2 w-64 p-2 shadow-lg">
              <div class="border-b border-slate-100 px-3 pt-1 pb-2">
                <p class="truncate text-sm font-medium">{{ plataforma.admin?.nombres }}</p>
                <p class="truncate text-xs text-slate-500">{{ plataforma.admin?.email }}</p>
              </div>
              <button class="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm text-red-600 hover:bg-red-50" @click="plataforma.logout()"><Icono nombre="salir" /> Cerrar sesión</button>
            </div>
          </div>
        </div>
        <!-- Móvil/tablet: secciones como pestañas -->
        <nav class="overflow-x-auto border-t border-slate-100 lg:hidden" aria-label="Plataforma">
          <div class="flex w-max gap-1 px-3 py-2">
            <RouterLink
              v-for="o in opciones"
              :key="o.to"
              :to="o.to"
              class="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm whitespace-nowrap"
              :class="activo(o.to) ? 'bg-amber-50 font-medium text-amber-800' : 'text-slate-600'"
            >
              <Icono :nombre="o.icono" clase="size-4" /> {{ o.etiqueta }}
            </RouterLink>
          </div>
        </nav>
      </header>
      <main class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><RouterView /></main>
    </div>
  </div>
</template>
