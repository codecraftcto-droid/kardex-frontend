<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { usePlataforma } from '@/stores/plataforma';
import Icono from '@/components/Icono.vue';

const plataforma = usePlataforma();
const route = useRoute();
const menuAbierto = ref(false);
watch(() => route.fullPath, () => (menuAbierto.value = false));

const opciones = [
  { to: '/plataforma', etiqueta: 'Monitoreo', icono: 'rayo' },
  { to: '/plataforma/estudios', etiqueta: 'Estudios', icono: 'empresa' },
  { to: '/plataforma/planes', etiqueta: 'Planes', icono: 'productos' },
  { to: '/plataforma/facturacion', etiqueta: 'Facturación', icono: 'reportes' },
  { to: '/plataforma/auditoria', etiqueta: 'Auditoría', icono: 'auditoria' },
];
const activo = (to) => (to === '/plataforma' ? route.path === '/plataforma' : route.path.startsWith(to));
const iniciales = computed(() => (plataforma.admin?.nombres || '?').split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase());
</script>

<template>
  <div class="min-h-dvh bg-slate-100">
    <!-- Cabecera oscura: deja claro que es la consola de la plataforma, no un estudio -->
    <header class="sticky top-0 z-20 bg-slate-900 text-white">
      <div class="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <img src="/favicon.svg" alt="" class="size-8" />
        <div class="min-w-0">
          <p class="font-semibold leading-tight">Kardex Plataforma</p>
          <p class="text-xs text-slate-400">Consola de administración SaaS</p>
        </div>
        <nav class="ml-6 hidden gap-1 lg:flex" aria-label="Plataforma">
          <RouterLink v-for="o in opciones" :key="o.to" :to="o.to" class="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium"
            :class="activo(o.to) ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'">
            <Icono :nombre="o.icono" clase="size-4" /> {{ o.etiqueta }}
          </RouterLink>
        </nav>
        <div class="ml-auto flex items-center gap-2">
          <span class="insignia hidden bg-amber-400/15 text-amber-300 sm:inline-flex">{{ plataforma.admin?.rol }}</span>
          <div class="relative">
            <button class="flex size-11 items-center justify-center rounded-full bg-amber-500 text-sm font-semibold text-slate-900" aria-label="Menú" @click="menuAbierto = !menuAbierto">
              {{ iniciales }}
            </button>
            <div v-if="menuAbierto" class="fixed inset-0 z-10" @click="menuAbierto = false" />
            <div v-if="menuAbierto" class="tarjeta absolute right-0 z-20 mt-2 w-64 p-2 text-slate-800 shadow-lg">
              <div class="border-b border-slate-100 px-3 pt-1 pb-2">
                <p class="truncate text-sm font-medium">{{ plataforma.admin?.nombres }}</p>
                <p class="truncate text-xs text-slate-500">{{ plataforma.admin?.email }}</p>
              </div>
              <button class="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm text-red-600 hover:bg-red-50" @click="plataforma.logout()">
                <Icono nombre="salir" /> Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      </div>
      <!-- Móvil/tablet: pestañas con scroll contenido -->
      <nav class="overflow-x-auto border-t border-white/10 lg:hidden" aria-label="Plataforma">
        <div class="flex w-max gap-1 px-3 py-2">
          <RouterLink v-for="o in opciones" :key="o.to" :to="o.to" class="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm whitespace-nowrap"
            :class="activo(o.to) ? 'bg-white/10 text-white' : 'text-slate-300'">
            <Icono :nombre="o.icono" clase="size-4" /> {{ o.etiqueta }}
          </RouterLink>
        </div>
      </nav>
    </header>
    <main class="mx-auto max-w-7xl px-4 py-6 sm:px-6"><RouterView /></main>
  </div>
</template>
