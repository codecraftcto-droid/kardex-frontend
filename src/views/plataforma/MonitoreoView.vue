<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { apiPlataforma } from '@/services/apiPlataforma';
import { mensajeError } from '@/services/api';
import { useToast } from '@/stores/toast';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';

const toast = useToast();
const m = ref(null);
const actualizado = ref(null);
async function cargar() {
  try {
    m.value = (await apiPlataforma.get('/monitoreo')).data;
    actualizado.value = new Date();
  } catch (e) {
    toast.error(mensajeError(e));
  }
}
let timer;
onMounted(() => {
  cargar();
  timer = setInterval(cargar, 30000); // refresco automático cada 30 s
});
onBeforeUnmount(() => clearInterval(timer));

const maxDia = computed(() => Math.max(1, ...(m.value?.movimientos.porDia ?? []).map((d) => d.movimientos)));
const uptime = computed(() => {
  const s = m.value?.proceso.uptimeSegundos ?? 0;
  const h = Math.floor(s / 3600);
  return h >= 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : `${h} h ${Math.floor((s % 3600) / 60)} min`;
});
</script>

<template>
  <EncabezadoPagina titulo="Monitoreo" :subtitulo="actualizado ? `Actualizado ${actualizado.toLocaleTimeString()} · se refresca cada 30 s` : ''">
    <button class="btn-secundario" @click="cargar">Actualizar</button>
  </EncabezadoPagina>

  <template v-if="m">
    <h2 class="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">Servicios</h2>
    <div class="mb-6 grid gap-3 sm:grid-cols-3">
      <div v-for="(s, nombre) in { 'Base de datos': m.servicios.baseDatos, Redis: m.servicios.redis }" :key="nombre" class="tarjeta flex items-center justify-between p-4">
        <div>
          <p class="text-sm text-slate-500">{{ nombre }}</p>
          <p class="text-lg font-semibold">{{ s.ok ? `${s.ms} ms` : 'Sin respuesta' }}</p>
        </div>
        <span class="size-3 rounded-full" :class="s.ok ? 'bg-emerald-500' : 'bg-red-500'" />
      </div>
      <div class="tarjeta flex items-center justify-between p-4">
        <div>
          <p class="text-sm text-slate-500">Tiempo real</p>
          <p class="text-lg font-semibold">{{ m.servicios.tiempoReal.conexiones ?? '—' }} conexiones</p>
        </div>
        <span class="size-3 rounded-full" :class="m.servicios.tiempoReal.ok ? 'bg-emerald-500' : 'bg-red-500'" />
      </div>
    </div>

    <h2 class="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">Uso</h2>
    <div class="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
      <div class="tarjeta p-4"><p class="text-sm text-slate-500">Estudios activos</p><p class="text-2xl font-semibold">{{ m.estudios.activos }}</p></div>
      <div class="tarjeta p-4"><p class="text-sm text-slate-500">Suspendidos</p><p class="text-2xl font-semibold" :class="m.estudios.suspendidos ? 'text-red-600' : ''">{{ m.estudios.suspendidos }}</p></div>
      <div class="tarjeta p-4"><p class="text-sm text-slate-500">Usuarios activos</p><p class="text-2xl font-semibold">{{ m.usuariosActivos }}</p></div>
      <div class="tarjeta p-4"><p class="text-sm text-slate-500">Sesiones abiertas</p><p class="text-2xl font-semibold">{{ m.sesionesActivas }}</p></div>
      <div class="tarjeta col-span-2 p-4 lg:col-span-1"><p class="text-sm text-slate-500">Movimientos 24 h</p><p class="text-2xl font-semibold">{{ m.movimientos.ultimas24h }}</p></div>
    </div>

    <section class="tarjeta mb-6 p-4">
      <h2 class="mb-3 font-semibold">Movimientos de kardex · últimos 30 días ({{ m.movimientos.ultimos30d }})</h2>
      <div v-if="m.movimientos.porDia.length" class="flex h-40 items-end gap-1 overflow-x-auto">
        <div v-for="d in m.movimientos.porDia" :key="d.dia" class="flex min-w-6 flex-1 flex-col items-center gap-1" :title="`${d.dia}: ${d.movimientos}`">
          <span class="text-[10px] text-slate-500">{{ d.movimientos }}</span>
          <div class="w-full rounded-t bg-marca-600" :style="{ height: `${(d.movimientos / maxDia) * 110}px` }" />
          <span class="text-[10px] whitespace-nowrap text-slate-400">{{ d.dia.slice(8) }}/{{ d.dia.slice(5, 7) }}</span>
        </div>
      </div>
      <p v-else class="text-sm text-slate-500">Sin movimientos en el periodo.</p>
    </section>

    <p class="text-xs text-slate-500">API: Node {{ m.proceso.node }} · memoria {{ m.proceso.memoriaMb }} MB · en línea hace {{ uptime }}</p>
  </template>
  <p v-else class="text-sm text-slate-500">Cargando…</p>
</template>
