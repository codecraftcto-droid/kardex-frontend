<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { apiPlataforma } from '@/services/apiPlataforma';
import { mensajeError } from '@/services/api';
import { useToast } from '@/stores/toast';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import Icono from '@/components/Icono.vue';

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

    <!-- Operación SUNAT de todos los estudios -->
    <h2 class="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">SUNAT · últimos 30 días</h2>
    <div class="mb-6 grid gap-4 lg:grid-cols-2">
      <section class="tarjeta p-4">
        <h3 class="mb-3 font-semibold">Comprobantes electrónicos por estado</h3>
        <div class="flex flex-wrap gap-2">
          <span v-for="(n, estado) in m.sunat.porEstado" :key="estado" class="insignia" :class="estado === 'RECHAZADO' ? 'bg-red-50 text-red-700' : ['PENDIENTE', 'ENVIADO'].includes(estado) ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700'">
            {{ estado.toLowerCase() }}: {{ n }}
          </span>
          <span v-if="!Object.keys(m.sunat.porEstado).length" class="text-sm text-slate-500">Sin comprobantes electrónicos en el periodo</span>
        </div>
        <h3 class="mt-4 mb-2 text-sm font-semibold">Estudios con problemas</h3>
        <p v-if="!m.sunat.estudiosConProblemas.length" class="flex items-center gap-2 text-sm text-emerald-700"><Icono nombre="check" clase="size-4" /> Ningún rechazo ni envío atascado</p>
        <ul v-else class="divide-y divide-slate-100 text-sm">
          <li v-for="e in m.sunat.estudiosConProblemas" :key="e.id" class="flex items-center justify-between gap-2 py-1.5">
            <RouterLink :to="`/plataforma/estudios/${e.id}`" class="font-medium text-slate-800 hover:underline">{{ e.nombre }}</RouterLink>
            <span class="flex gap-1">
              <span v-if="e.rechazados" class="insignia bg-red-50 text-red-700">{{ e.rechazados }} rechazados</span>
              <span v-if="e.atascados" class="insignia bg-amber-50 text-amber-800">{{ e.atascados }} sin respuesta &gt; 1 día</span>
            </span>
          </li>
        </ul>
        <template v-if="m.sunat.sireConError.length">
          <h3 class="mt-4 mb-2 text-sm font-semibold">Conexiones SIRE con error</h3>
          <ul class="divide-y divide-slate-100 text-sm">
            <li v-for="(s, i) in m.sunat.sireConError" :key="i" class="py-1.5">
              <RouterLink :to="`/plataforma/estudios/${s.estudioId}`" class="font-medium hover:underline">{{ s.estudio }}</RouterLink> · {{ s.empresa }}
              <p class="truncate text-xs text-red-700">{{ s.error }}</p>
            </li>
          </ul>
        </template>
      </section>
      <section class="tarjeta p-4">
        <h3 class="mb-3 font-semibold">Colas en segundo plano</h3>
        <div class="overflow-x-auto"><table class="min-w-full text-sm">
          <thead class="text-xs text-slate-500"><tr><th class="py-1 text-left font-medium">Cola</th><th class="py-1 pl-3 text-right font-medium">En espera</th><th class="py-1 pl-3 text-right font-medium">Procesando</th><th class="py-1 pl-3 text-right font-medium" title="Tareas periódicas o reintentos con fecha">Programados</th><th class="py-1 pl-3 text-right font-medium">Fallidos</th></tr></thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="c in m.colas" :key="c.nombre">
              <td class="py-1.5"><span class="font-medium">{{ c.nombre }}</span><p class="text-xs text-slate-500">{{ c.descripcion }}</p></td>
              <template v-if="c.ok">
                <td class="py-1.5 pl-3 text-right tabular-nums" :class="c.waiting > 20 ? 'font-semibold text-amber-700' : ''">{{ c.waiting }}</td>
                <td class="py-1.5 pl-3 text-right tabular-nums">{{ c.active }}</td>
                <td class="py-1.5 pl-3 text-right tabular-nums text-slate-500">{{ c.delayed }}</td>
                <td class="py-1.5 pl-3 text-right tabular-nums" :class="c.failed ? 'font-semibold text-red-700' : ''">{{ c.failed }}</td>
              </template>
              <td v-else colspan="4" class="py-1.5 text-right text-red-700">Sin conexión</td>
            </tr>
          </tbody>
        </table></div>
        <h3 class="mt-5 mb-2 font-semibold">Módulos contratados</h3>
        <ul class="space-y-2 text-sm">
          <li v-for="mod in m.modulos" :key="mod.codigo">
            <div class="flex justify-between"><span>{{ mod.nombre }}</span><span class="tabular-nums text-slate-500">{{ mod.estudios }} de {{ m.estudios.activos }}</span></div>
            <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div class="h-full rounded-full bg-marca-600" :style="{ width: `${m.estudios.activos ? (mod.estudios / m.estudios.activos) * 100 : 0}%` }" /></div>
          </li>
        </ul>
      </section>
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
