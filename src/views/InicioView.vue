<script setup>
import { computed, ref, watch } from 'vue';
import { useAuth } from '@/stores/auth';
import { useContexto } from '@/stores/contexto';
import { api } from '@/services/api';
import { useTiempoReal } from '@/composables/useTiempoReal';
import { cant, fechaHora, soles } from '@/utils/formato';
import { MOTIVOS, estiloTipo } from '@/utils/kardex';
import Icono from '@/components/Icono.vue';
import GraficoBarras from '@/components/GraficoBarras.vue';

const auth = useAuth();
const contexto = useContexto();
const resumen = ref({});
const panel = ref(null);
const recientes = ref([]);
const bajos = ref([]);
const actividad = ref([]);
const cargando = ref(true);

/** Cada bloque se pide solo si el usuario tiene el permiso en la empresa activa. */
async function cargar() {
  const empresaId = contexto.empresaActivaId;
  if (!empresaId) return (cargando.value = false);
  const puede = (p) => auth.canEnEmpresa(p, empresaId);
  const total = (url, extra = {}) => api.get(url, { params: { empresaId, porPagina: 1, ...extra } }).then((r) => r.data);
  const verStock = puede('kardex.stock.ver');

  const [sedes, almacenes, productos, stock, bajoMin, movs, ind] = await Promise.all([
    puede('sedes.sede.ver') ? total('/sedes') : null,
    puede('almacenes.almacen.ver') ? total('/almacenes') : null,
    puede('productos.producto.ver') ? total('/productos', { activo: 'true' }) : null,
    verStock ? total('/kardex/stock') : null,
    verStock ? api.get('/kardex/stock', { params: { empresaId, bajoMinimo: 'true', porPagina: 5 } }).then((r) => r.data) : null,
    verStock ? api.get('/kardex/movimientos', { params: { empresaId, porPagina: 6 } }).then((r) => r.data) : null,
    api.get('/panel', { params: { empresaId } }).then((r) => r.data).catch(() => null),
  ]);
  // Evita mostrar datos de la empresa anterior si el usuario cambió rápido
  if (empresaId !== contexto.empresaActivaId) return;
  resumen.value = {
    sedes: sedes?.total,
    almacenes: almacenes?.total,
    productos: productos?.total,
    valor: stock?.resumen?.valorTotal,
    bajoMinimo: bajoMin?.total,
  };
  bajos.value = bajoMin?.datos ?? [];
  recientes.value = movs?.datos ?? [];
  panel.value = ind;
  cargando.value = false;
}
watch(() => contexto.empresaActivaId, cargar, { immediate: true });

// ── Saludo y fecha ──
const hora = new Date().getHours();
const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
const fechaLarga = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Lima' }).format(new Date());
const nombre = computed(() => auth.usuario?.nombres?.split(' ')[0] ?? '');

// ── Accesos rápidos (según permisos) ──
const accesos = computed(() =>
  [
    { to: '/pos', texto: 'Nueva venta', icono: 'caja', permiso: 'pos.venta.crear', principal: true },
    { to: '/movimientos/entrada', texto: 'Entrada', icono: 'entrada', permiso: 'kardex.entrada.crear' },
    { to: '/movimientos/salida', texto: 'Salida', icono: 'salida', permiso: 'kardex.salida.crear' },
    { to: '/transferencias/nueva', texto: 'Transferencia', icono: 'transferencias', permiso: 'transferencia.solicitar' },
    { to: '/cuentas-por-cobrar', texto: 'Cobranzas', icono: 'tarjeta', permiso: 'cxc.cobranza.crear' },
  ].filter((a) => auth.canEnEmpresa(a.permiso, contexto.empresaActivaId)),
);

// ── Indicadores ──
/** Lo de ayer como referencia (comparar un día en curso con uno completo no dice mucho). */
const ayer = computed(() => (panel.value?.ventas ? Number(panel.value.ventas.ayer) : null));

// ── Gráfico: ventas (si puede verlas) o movimientos de kardex ──
const diaCorto = (iso) => String(Number(iso.slice(8, 10)));
const diaLargo = (iso) => new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
const kmil = (v) => (v >= 1000 ? `${(v / 1000).toLocaleString('es-PE', { maximumFractionDigits: 1 })}k` : String(v));
const grafico = computed(() => {
  const p = panel.value;
  if (p?.ventas) {
    return {
      titulo: 'Ventas de los últimos 14 días',
      subtitulo: `Total del periodo: ${soles(p.ventas.totalPeriodo)}`,
      datos: p.ventas.serie.map((d) => ({ etiqueta: diaCorto(d.fecha), detalle: `${diaLargo(d.fecha)} · ${d.comprobantes} comprobante(s)`, valores: { total: Math.max(0, Number(d.total)) } })),
      series: [{ clave: 'total', nombre: 'Ventas', color: '#0d9488' }],
      formato: (v) => soles(v),
      formatoEje: (v) => `S/ ${kmil(v)}`,
    };
  }
  if (p?.movimientos) {
    return {
      titulo: 'Movimientos de kardex · últimos 14 días',
      subtitulo: 'Cantidad de entradas y salidas registradas por día',
      datos: p.movimientos.serie.map((d) => ({ etiqueta: diaCorto(d.fecha), detalle: diaLargo(d.fecha), valores: { entradas: d.entradas, salidas: d.salidas } })),
      series: [
        { clave: 'entradas', nombre: 'Entradas', color: '#0d9488' },
        { clave: 'salidas', nombre: 'Salidas', color: '#6366f1' },
      ],
      formato: (v) => String(v),
      formatoEje: (v) => kmil(v),
    };
  }
  return null;
});

// ── Actividad en tiempo real ──
const nombres = { 'empresa:cambio': 'Empresa', 'sede:cambio': 'Sede', 'almacen:cambio': 'Almacén', 'producto:cambio': 'Producto' };
const registrar = (texto, icono) => {
  actividad.value.unshift({ id: crypto.randomUUID(), texto, icono, hora: new Date() });
  actividad.value = actividad.value.slice(0, 8);
};
for (const evento of Object.keys(nombres)) {
  useTiempoReal(evento, (p) => {
    registrar(`${nombres[evento]}: ${p.accion}`, 'editar');
    cargar();
  });
}
useTiempoReal('kardex:movimiento', (p) => {
  registrar(`${p.tipo === 'ENTRADA' ? 'Entrada' : 'Salida'} ${p.numero} · ${MOTIVOS[p.motivo]}`, p.tipo === 'ENTRADA' ? 'entrada' : 'salida');
  cargar();
});
useTiempoReal('pos:comprobante', (c) => {
  registrar(`Comprobante ${c.serie}-${String(c.numero).padStart(8, '0')}`, 'comprobante');
  cargar();
});
useTiempoReal('cxc:cambio', () => cargar());

const pctStock = (s) => Math.min(100, Math.round((Number(s.cantidad) / Math.max(1, Number(s.stockMinimo))) * 100));
</script>

<template>
  <div class="space-y-6">
    <!-- ═════════ Encabezado ═════════ -->
    <section class="relative overflow-hidden rounded-2xl bg-gradient-to-br from-marca-700 via-marca-800 to-slate-900 p-5 text-white shadow-sm sm:p-7">
      <div class="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-teal-300/20 blur-3xl" aria-hidden="true" />
      <div class="relative flex flex-wrap items-end justify-between gap-4">
        <div class="min-w-0">
          <p class="text-sm text-teal-100/80 first-letter:uppercase">{{ fechaLarga }}</p>
          <h1 class="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{{ saludo }}, {{ nombre }}</h1>
          <p class="mt-1 truncate text-sm text-teal-50/80">{{ contexto.empresaActiva?.razonSocial || 'Seleccione una empresa' }}</p>
        </div>
        <div v-if="accesos.length" class="-mx-5 flex w-[calc(100%+2.5rem)] gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          <RouterLink
            v-for="a in accesos"
            :key="a.to"
            :to="a.to"
            class="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3.5 text-sm font-medium whitespace-nowrap transition"
            :class="a.principal ? 'bg-white text-marca-800 shadow-sm hover:bg-teal-50' : 'bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20'"
          >
            <Icono :nombre="a.icono" clase="size-4" /> {{ a.texto }}
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- ═════════ Indicadores ═════════ -->
    <section class="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Indicadores">
      <article v-if="panel?.ventas" class="tarjeta p-3.5 sm:p-4">
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs text-slate-500 sm:text-sm">Ventas de hoy</p>
          <span class="flex size-8 shrink-0 items-center justify-center rounded-lg sm:size-9 bg-marca-50 text-marca-700"><Icono nombre="caja" clase="size-5" /></span>
        </div>
        <p class="mt-2 text-lg font-semibold tracking-tight text-slate-900 tabular-nums sm:text-2xl">{{ soles(panel.ventas.hoy) }}</p>
        <p class="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
          <span>{{ panel.ventas.comprobantesHoy }} comprobante(s)<template v-if="panel.ventas.comprobantesHoy"> · ticket {{ soles(panel.ventas.ticketPromedioHoy) }}</template></span>
          <span v-if="ayer !== null" class="text-slate-400">Ayer {{ soles(ayer) }}</span>
        </p>
      </article>

      <RouterLink v-if="resumen.valor != null" to="/inventario" class="tarjeta group p-3.5 transition sm:p-4 hover:border-marca-600/40 hover:shadow-md">
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs text-slate-500 sm:text-sm">Valor del inventario</p>
          <span class="flex size-8 shrink-0 items-center justify-center rounded-lg sm:size-9 bg-sky-50 text-sky-700"><Icono nombre="inventario" clase="size-5" /></span>
        </div>
        <p class="mt-2 text-lg font-semibold tracking-tight text-slate-900 tabular-nums sm:text-2xl">{{ soles(resumen.valor) }}</p>
        <p class="mt-1 text-xs text-slate-500">
          <template v-if="resumen.productos != null">{{ resumen.productos }} productos activos</template>
          <template v-if="resumen.almacenes != null"> · {{ resumen.almacenes }} almacenes</template>
        </p>
      </RouterLink>

      <RouterLink v-if="panel?.cxc" to="/cuentas-por-cobrar" class="tarjeta group p-3.5 transition sm:p-4 hover:border-marca-600/40 hover:shadow-md">
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs text-slate-500 sm:text-sm">Por cobrar</p>
          <span class="flex size-8 shrink-0 items-center justify-center rounded-lg sm:size-9 bg-violet-50 text-violet-700"><Icono nombre="tarjeta" clase="size-5" /></span>
        </div>
        <p class="mt-2 text-lg font-semibold tracking-tight text-slate-900 tabular-nums sm:text-2xl">{{ soles(panel.cxc.saldo) }}</p>
        <p class="mt-1 text-xs">
          <span v-if="Number(panel.cxc.vencido) > 0" class="inline-flex items-center gap-1 font-medium text-red-600">
            <Icono nombre="alerta" clase="size-3.5" /> {{ soles(panel.cxc.vencido) }} vencido · {{ panel.cxc.clientesVencidos }} cliente(s)
          </span>
          <span v-else class="text-slate-500">{{ panel.cxc.clientes }} cliente(s) · todo al día</span>
        </p>
      </RouterLink>

      <RouterLink
        v-if="resumen.bajoMinimo != null"
        :to="{ path: '/inventario', query: { bajoMinimo: '1' } }"
        class="tarjeta group p-3.5 transition sm:p-4 hover:border-marca-600/40 hover:shadow-md"
      >
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs text-slate-500 sm:text-sm">Stock bajo mínimo</p>
          <span class="flex size-8 shrink-0 items-center justify-center rounded-lg sm:size-9" :class="resumen.bajoMinimo > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'">
            <Icono :nombre="resumen.bajoMinimo > 0 ? 'alerta' : 'check'" clase="size-5" />
          </span>
        </div>
        <p class="mt-2 text-lg font-semibold tracking-tight text-slate-900 tabular-nums sm:text-2xl">{{ resumen.bajoMinimo }}</p>
        <p class="mt-1 text-xs" :class="resumen.bajoMinimo > 0 ? 'font-medium text-red-600' : 'text-slate-500'">
          {{ resumen.bajoMinimo > 0 ? 'Productos por reponer' : 'Todo el stock sobre el mínimo' }}
        </p>
      </RouterLink>

      <!-- Sin ventas ni cuentas por cobrar: completa la fila con la organización -->
      <RouterLink v-if="!panel?.ventas && resumen.almacenes != null" to="/almacenes" class="tarjeta group p-3.5 transition sm:p-4 hover:border-marca-600/40 hover:shadow-md">
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs text-slate-500 sm:text-sm">Almacenes</p>
          <span class="flex size-8 shrink-0 items-center justify-center rounded-lg sm:size-9 bg-amber-50 text-amber-700"><Icono nombre="almacen" clase="size-5" /></span>
        </div>
        <p class="mt-2 text-lg font-semibold tracking-tight text-slate-900 tabular-nums sm:text-2xl">{{ resumen.almacenes }}</p>
        <p v-if="resumen.sedes != null" class="mt-1 text-xs text-slate-500">en {{ resumen.sedes }} sede(s)</p>
      </RouterLink>
    </section>

    <div class="grid gap-5 xl:grid-cols-3">
      <!-- ═════════ Gráfico ═════════ -->
      <section v-if="grafico" class="tarjeta min-w-0 p-4 sm:p-5 xl:col-span-2">
        <div class="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 class="font-semibold text-slate-900">{{ grafico.titulo }}</h2>
            <p class="text-sm text-slate-500">{{ grafico.subtitulo }}</p>
          </div>
          <ul v-if="grafico.series.length > 1" class="flex gap-3 text-xs text-slate-600" aria-label="Leyenda">
            <li v-for="s in grafico.series" :key="s.clave" class="flex items-center gap-1.5"><span class="size-2.5 rounded-sm" :style="{ background: s.color }" />{{ s.nombre }}</li>
          </ul>
        </div>
        <GraficoBarras :datos="grafico.datos" :series="grafico.series" :formato="grafico.formato" :formato-eje="grafico.formatoEje" :titulo="grafico.titulo" />
      </section>

      <!-- ═════════ Stock por reponer ═════════ -->
      <section v-if="resumen.bajoMinimo != null" class="tarjeta flex flex-col p-4 sm:p-5" :class="{ 'xl:col-span-3': !grafico }">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="font-semibold text-slate-900">Por reponer</h2>
          <RouterLink :to="{ path: '/inventario', query: { bajoMinimo: '1' } }" class="text-sm font-medium text-marca-700 hover:underline">Ver todo</RouterLink>
        </div>
        <ul v-if="bajos.length" class="space-y-3">
          <li v-for="s in bajos" :key="s.id">
            <div class="flex items-baseline justify-between gap-3 text-sm">
              <span class="min-w-0 truncate font-medium text-slate-800">{{ s.producto.nombre }}</span>
              <span class="shrink-0 text-xs text-slate-500 tabular-nums">{{ cant(s.cantidad) }} / {{ cant(s.stockMinimo) }}</span>
            </div>
            <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" :aria-valuenow="pctStock(s)" aria-valuemin="0" aria-valuemax="100" :aria-label="`${s.producto.nombre}: ${pctStock(s)} % del mínimo`">
              <div class="h-full rounded-full bg-red-500" :style="{ width: `${pctStock(s)}%` }" />
            </div>
            <p class="mt-0.5 text-xs text-slate-400">{{ s.almacen?.nombre }}</p>
          </li>
        </ul>
        <div v-else class="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
          <span class="flex size-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><Icono nombre="check" clase="size-6" /></span>
          <p class="text-sm font-medium text-slate-700">Nada por reponer</p>
          <p class="text-xs text-slate-500">Todos los productos están sobre su stock mínimo.</p>
        </div>
      </section>
    </div>

    <div class="grid gap-5 xl:grid-cols-3">
      <!-- ═════════ Últimos movimientos ═════════ -->
      <section v-if="recientes.length" class="tarjeta min-w-0 p-4 sm:p-5 xl:col-span-2">
        <div class="mb-2 flex items-center justify-between">
          <h2 class="font-semibold text-slate-900">Últimos movimientos</h2>
          <RouterLink to="/movimientos" class="text-sm font-medium text-marca-700 hover:underline">Ver todos</RouterLink>
        </div>
        <ul class="divide-y divide-slate-100">
          <li v-for="m in recientes" :key="m.id">
            <RouterLink :to="`/movimientos/${m.id}`" class="-mx-2 flex min-h-14 items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
              <span class="flex size-9 shrink-0 items-center justify-center rounded-lg" :class="m.tipo === 'ENTRADA' ? 'bg-emerald-50 text-emerald-700' : 'bg-indigo-50 text-indigo-700'">
                <Icono :nombre="m.tipo === 'ENTRADA' ? 'entrada' : 'salida'" clase="size-4" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-2">
                  <span class="font-mono text-sm font-medium text-slate-800">{{ m.numero }}</span>
                  <span class="insignia" :class="estiloTipo(m.tipo)">{{ MOTIVOS[m.motivo] }}</span>
                </span>
                <span class="block truncate text-xs text-slate-500">{{ m.almacen.nombre }}<template v-if="m.observacion"> · {{ m.observacion }}</template></span>
              </span>
              <span class="shrink-0 text-xs text-slate-400">{{ fechaHora(m.fecha) }}</span>
            </RouterLink>
          </li>
        </ul>
      </section>

      <!-- ═════════ Actividad en tiempo real ═════════ -->
      <section class="tarjeta p-4 sm:p-5" :class="{ 'xl:col-span-3': !recientes.length }">
        <h2 class="mb-3 flex items-center gap-2 font-semibold text-slate-900">
          <span class="relative flex size-2.5">
            <span class="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:hidden" />
            <span class="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
          </span>
          Actividad en vivo
        </h2>
        <ol v-if="actividad.length" class="relative space-y-4 border-l border-slate-200 pl-5">
          <li v-for="a in actividad" :key="a.id" class="relative">
            <span class="absolute top-0.5 -left-[1.95rem] flex size-6 items-center justify-center rounded-full bg-white text-slate-500 ring-1 ring-slate-200">
              <Icono :nombre="a.icono" clase="size-3.5" />
            </span>
            <p class="text-sm text-slate-700">{{ a.texto }}</p>
            <p class="text-xs text-slate-400">{{ a.hora.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) }}</p>
          </li>
        </ol>
        <div v-else class="flex flex-col items-center gap-2 py-6 text-center">
          <span class="flex size-11 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Icono nombre="rayo" clase="size-6" /></span>
          <p class="text-sm text-slate-500">Las ventas, movimientos y cambios de otros usuarios aparecerán aquí al instante.</p>
        </div>
      </section>
    </div>

    <p v-if="cargando" class="text-sm text-slate-500">Cargando…</p>
  </div>
</template>
