<script setup>
import { ref, watch } from 'vue';
import { useAuth } from '@/stores/auth';
import { useContexto } from '@/stores/contexto';
import { api } from '@/services/api';
import { useTiempoReal } from '@/composables/useTiempoReal';
import { fechaHora, soles } from '@/utils/formato';
import { MOTIVOS, estiloTipo } from '@/utils/kardex';
import Icono from '@/components/Icono.vue';

const auth = useAuth();
const contexto = useContexto();
const resumen = ref({});
const recientes = ref([]);
const actividad = ref([]);

/** Cada indicador se pide solo si el usuario tiene el permiso en la empresa activa. */
async function cargarResumen() {
  const empresaId = contexto.empresaActivaId;
  if (!empresaId) return;
  const puede = (p) => auth.canEnEmpresa(p, empresaId);
  const total = (url, extra = {}) => api.get(url, { params: { empresaId, porPagina: 1, ...extra } }).then((r) => r.data);

  const [sedes, almacenes, productos, stock, bajos, movs] = await Promise.all([
    puede('sedes.sede.ver') ? total('/sedes') : null,
    puede('almacenes.almacen.ver') ? total('/almacenes') : null,
    puede('productos.producto.ver') ? total('/productos', { activo: 'true' }) : null,
    puede('kardex.stock.ver') ? total('/kardex/stock') : null,
    puede('kardex.stock.ver') ? total('/kardex/stock', { bajoMinimo: 'true' }) : null,
    puede('kardex.stock.ver') ? api.get('/kardex/movimientos', { params: { empresaId, porPagina: 5 } }).then((r) => r.data) : null,
  ]);
  // Evita mostrar datos de la empresa anterior si el usuario cambió rápido
  if (empresaId !== contexto.empresaActivaId) return;
  resumen.value = {
    sedes: sedes?.total,
    almacenes: almacenes?.total,
    productos: productos?.total,
    valor: stock?.resumen?.valorTotal,
    bajoMinimo: bajos?.total,
  };
  recientes.value = movs?.datos ?? [];
}
watch(() => contexto.empresaActivaId, cargarResumen, { immediate: true });

const nombres = { 'empresa:cambio': 'Empresa', 'sede:cambio': 'Sede', 'almacen:cambio': 'Almacén', 'producto:cambio': 'Producto' };
const registrar = (texto) => {
  actividad.value.unshift({ id: crypto.randomUUID(), texto, hora: new Date() });
  actividad.value = actividad.value.slice(0, 10);
};
for (const evento of Object.keys(nombres)) {
  useTiempoReal(evento, (p) => {
    registrar(`${nombres[evento]}: ${p.accion}`);
    cargarResumen();
  });
}
useTiempoReal('kardex:movimiento', (p) => {
  registrar(`${p.tipo === 'ENTRADA' ? 'Entrada' : 'Salida'} ${p.numero} (${MOTIVOS[p.motivo]})`);
  cargarResumen();
});
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-xl font-semibold text-slate-900 sm:text-2xl">Hola, {{ auth.usuario?.nombres?.split(' ')[0] }}</h1>
      <p class="text-sm text-slate-500">{{ contexto.empresaActiva?.razonSocial || 'Seleccione una empresa' }}</p>
    </div>

    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <RouterLink v-if="resumen.valor != null" to="/inventario" class="tarjeta col-span-2 p-4 hover:border-marca-600 lg:col-span-1">
        <Icono nombre="inventario" clase="size-6 text-marca-700" />
        <p class="mt-2 text-2xl font-semibold">{{ soles(resumen.valor) }}</p>
        <p class="text-sm text-slate-500">Valor del inventario</p>
      </RouterLink>
      <RouterLink v-if="resumen.bajoMinimo != null" :to="{ path: '/inventario', query: { bajoMinimo: '1' } }" class="tarjeta p-4 hover:border-marca-600" :class="{ 'border-red-200 bg-red-50/40': resumen.bajoMinimo > 0 }">
        <Icono nombre="alerta" clase="size-6" :class="resumen.bajoMinimo > 0 ? 'text-red-600' : 'text-slate-400'" />
        <p class="mt-2 text-2xl font-semibold">{{ resumen.bajoMinimo }}</p>
        <p class="text-sm text-slate-500">Bajo stock mínimo</p>
      </RouterLink>
      <RouterLink v-if="resumen.productos != null" to="/productos" class="tarjeta p-4 hover:border-marca-600">
        <Icono nombre="productos" clase="size-6 text-marca-700" />
        <p class="mt-2 text-2xl font-semibold">{{ resumen.productos }}</p>
        <p class="text-sm text-slate-500">Productos activos</p>
      </RouterLink>
      <RouterLink v-if="resumen.almacenes != null" to="/almacenes" class="tarjeta p-4 hover:border-marca-600">
        <Icono nombre="almacen" clase="size-6 text-marca-700" />
        <p class="mt-2 text-2xl font-semibold">{{ resumen.almacenes }}</p>
        <p class="text-sm text-slate-500">Almacenes<template v-if="resumen.sedes != null"> · {{ resumen.sedes }} sedes</template></p>
      </RouterLink>
    </div>

    <div class="grid gap-5 lg:grid-cols-2">
      <section v-if="recientes.length" class="tarjeta p-4">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="font-medium">Últimos movimientos</h2>
          <RouterLink to="/movimientos" class="text-sm text-marca-700 hover:underline">Ver todos</RouterLink>
        </div>
        <ul class="divide-y divide-slate-100 text-sm">
          <li v-for="m in recientes" :key="m.id">
            <RouterLink :to="`/movimientos/${m.id}`" class="flex min-h-11 items-center justify-between gap-3 py-2 hover:bg-slate-50">
              <span class="min-w-0">
                <span class="font-mono font-medium">{{ m.numero }}</span>
                <span class="insignia ml-2" :class="estiloTipo(m.tipo)">{{ MOTIVOS[m.motivo] }}</span>
                <span class="block truncate text-xs text-slate-500">{{ m.almacen.nombre }}</span>
              </span>
              <span class="shrink-0 text-xs text-slate-400">{{ fechaHora(m.fecha) }}</span>
            </RouterLink>
          </li>
        </ul>
      </section>

      <section class="tarjeta p-4">
        <h2 class="mb-3 flex items-center gap-2 font-medium"><Icono nombre="rayo" clase="size-5 text-amber-500" /> Actividad en tiempo real</h2>
        <ul v-if="actividad.length" class="divide-y divide-slate-100 text-sm">
          <li v-for="a in actividad" :key="a.id" class="flex justify-between gap-3 py-2">
            <span>{{ a.texto }}</span><span class="shrink-0 text-slate-400">{{ a.hora.toLocaleTimeString() }}</span>
          </li>
        </ul>
        <p v-else class="text-sm text-slate-500">Los movimientos y cambios que registren otros usuarios aparecerán aquí sin recargar la página.</p>
      </section>
    </div>
  </div>
</template>
