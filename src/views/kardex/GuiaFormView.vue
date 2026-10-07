<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, mensajeError } from '@/services/api';
import { useContexto } from '@/stores/contexto';
import { useToast } from '@/stores/toast';
import { useAlmacenes } from '@/composables/useAlmacenes';
import { TIPOS_DOCUMENTO } from '@/utils/pos';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import BuscadorProducto from '@/components/BuscadorProducto.vue';
import Icono from '@/components/Icono.vue';

/**
 * Emisión de una guía de remisión electrónica (remitente). Se puede precargar desde una
 * transferencia (?desde=transferencia&id=…) o una venta (?desde=comprobante&id=…).
 */
const route = useRoute();
const router = useRouter();
const contexto = useContexto();
const toast = useToast();
const { conPermiso } = useAlmacenes();
const almacenes = computed(() => conPermiso('gre.guia.crear'));

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
const motivos = ref({});
const g = reactive({
  almacenId: '', fechaTraslado: hoy(), motivo: '01', motivoDescripcion: '', modalidad: 'PRIVADO',
  destinatarioTipoDoc: 'RUC', destinatarioNumDoc: '', destinatarioNombre: '',
  partidaUbigeo: '', partidaDireccion: '', partidaEstablecimiento: '', llegadaUbigeo: '', llegadaDireccion: '', llegadaEstablecimiento: '',
  pesoBruto: '', unidadPeso: 'KGM', bultos: '',
  transportistaRuc: '', transportistaNombre: '', transportistaMtc: '',
  conductorTipoDoc: 'DNI', conductorNumDoc: '', conductorNombres: '', conductorApellidos: '', conductorLicencia: '', vehiculoPlaca: '',
  docRelTipo: '', docRelSerie: '', docRelNumero: '', transferenciaId: null, comprobanteId: null, observacion: '',
});
const items = ref([]);
const estado = reactive({ cargando: true, enviando: false, error: '', origen: '', guiasPrevias: 0 });

onMounted(async () => {
  try {
    motivos.value = (await api.get('/guias/motivos')).data;
    const { desde, id } = route.query;
    if (desde && id) {
      const { data } = await api.get('/guias/preparar', { params: { desde, id } });
      const { items: lista, guiasPrevias, empresaId, ...resto } = data;
      // El documento manda: la guía es de su empresa, aunque se haya abierto con otra activa
      if (empresaId && empresaId !== contexto.empresaActivaId) contexto.seleccionar(empresaId);
      Object.assign(g, Object.fromEntries(Object.entries(resto).map(([k, v]) => [k, v ?? ''])));
      items.value = lista.map((i) => ({ ...i }));
      estado.guiasPrevias = guiasPrevias;
      estado.origen = desde === 'transferencia' ? 'la transferencia' : 'la venta';
    }
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    estado.cargando = false;
  }
});
// Guía manual: el primer almacén permitido y su sede como punto de partida
watch(almacenes, (l) => { if (!g.almacenId && l.length) g.almacenId = l[0].id; }, { immediate: true });
watch(() => g.almacenId, (id) => {
  const a = almacenes.value.find((x) => x.id === id);
  if (!a || g.partidaDireccion) return;
  Object.assign(g, { partidaDireccion: a.sede?.direccion ?? '', partidaUbigeo: a.sede?.ubigeo ?? '', partidaEstablecimiento: a.sede?.codigoEstablecimiento ?? '' });
});
// Traslado entre establecimientos: el destinatario es la propia empresa
watch(() => g.motivo, (m) => {
  if (m === '04' && contexto.empresaActiva) {
    Object.assign(g, { destinatarioTipoDoc: 'RUC', destinatarioNumDoc: contexto.empresaActiva.ruc, destinatarioNombre: contexto.empresaActiva.razonSocial });
  }
});

function agregar(p) {
  const ya = items.value.find((i) => i.productoId === p.id);
  if (ya) ya.cantidad = String(Number(ya.cantidad) + 1);
  else items.value.push({ productoId: p.id, codigo: p.sku, descripcion: p.nombre, unidadCodigo: p.unidad?.codigo ?? 'NIU', cantidad: '1' });
}

async function emitir() {
  estado.enviando = true;
  estado.error = '';
  try {
    const vacio = (v) => (v === '' ? null : v);
    const datos = Object.fromEntries(Object.entries(g).map(([k, v]) => [k, vacio(v)]));
    const { data } = await api.post('/guias', { ...datos, pesoBruto: Number(g.pesoBruto), bultos: g.bultos === '' ? null : Number(g.bultos), items: items.value });
    toast.exito(`Guía ${data.serie}-${String(data.numero).padStart(8, '0')} emitida`);
    router.replace({ path: '/guias', query: { guia: data.id } });
  } catch (e) {
    estado.error = mensajeError(e);
    toast.error(estado.error);
  } finally {
    estado.enviando = false;
  }
}
const ayudaUbigeo = 'Código INEI de 6 dígitos del distrito (p. ej. 150101 Lima, 150131 San Isidro, 040101 Arequipa).';
</script>

<template>
  <EncabezadoPagina titulo="Nueva guía de remisión" :subtitulo="estado.origen ? `Datos tomados de ${estado.origen}: revíselos antes de emitir` : 'Guía de remisión electrónica remitente'">
    <template #antes>
      <RouterLink to="/guias" class="mb-1 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"><Icono nombre="atras" clase="size-4" /> Guías de remisión</RouterLink>
    </template>
  </EncabezadoPagina>

  <p v-if="estado.cargando" class="text-sm text-slate-500">Cargando…</p>
  <form v-else class="space-y-5 pb-24" @submit.prevent="emitir">
    <p v-if="estado.guiasPrevias" class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
      Ya existe{{ estado.guiasPrevias > 1 ? 'n' : '' }} {{ estado.guiasPrevias }} guía(s) para este documento. Emita otra solo si el traslado es en varios viajes.
    </p>

    <!-- Traslado -->
    <section class="tarjeta grid gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
      <h2 class="font-semibold sm:col-span-2 lg:col-span-4">Traslado</h2>
      <div class="lg:col-span-2">
        <label class="etiqueta" for="g-mot">Motivo *</label>
        <select id="g-mot" v-model="g.motivo" class="input"><option v-for="(t, k) in motivos" :key="k" :value="k">{{ k }} · {{ t }}</option></select>
      </div>
      <div>
        <label class="etiqueta" for="g-alm">Almacén de partida *</label>
        <select id="g-alm" v-model="g.almacenId" class="input" :disabled="!!g.transferenciaId || !!g.comprobanteId">
          <option v-for="a in almacenes" :key="a.id" :value="a.id">{{ a.codigo }} — {{ a.nombre }}</option>
        </select>
      </div>
      <div><label class="etiqueta" for="g-fec">Inicio del traslado *</label><input id="g-fec" v-model="g.fechaTraslado" type="date" :min="hoy()" class="input" required /></div>
      <div v-if="g.motivo === '13'" class="sm:col-span-2 lg:col-span-4">
        <label class="etiqueta" for="g-motd">Describa el motivo *</label><input id="g-motd" v-model="g.motivoDescripcion" class="input" maxlength="100" />
      </div>
      <template v-if="['01', '14'].includes(g.motivo)">
        <div>
          <label class="etiqueta" for="g-drt">Comprobante relacionado</label>
          <select id="g-drt" v-model="g.docRelTipo" class="input"><option value="">Ninguno</option><option value="01">Factura</option><option value="03">Boleta</option></select>
        </div>
        <div><label class="etiqueta" for="g-drs">Serie</label><input id="g-drs" v-model="g.docRelSerie" class="input font-mono uppercase" maxlength="4" /></div>
        <div><label class="etiqueta" for="g-drn">Número</label><input id="g-drn" v-model="g.docRelNumero" class="input font-mono" inputmode="numeric" maxlength="10" /></div>
      </template>
    </section>

    <!-- Destinatario y puntos -->
    <section class="tarjeta grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
      <h2 class="font-semibold sm:col-span-2">Destinatario</h2>
      <div class="grid grid-cols-[9rem_1fr] gap-2">
        <div>
          <label class="etiqueta" for="g-dtd">Documento</label>
          <select id="g-dtd" v-model="g.destinatarioTipoDoc" class="input" :disabled="g.motivo === '04'">
            <option v-for="(t, k) in TIPOS_DOCUMENTO" :key="k" :value="k">{{ t }}</option>
          </select>
        </div>
        <div><label class="etiqueta" for="g-dnd">Número</label><input id="g-dnd" v-model="g.destinatarioNumDoc" class="input font-mono" :disabled="g.motivo === '04'" /></div>
      </div>
      <div><label class="etiqueta" for="g-dno">Nombre o razón social *</label><input id="g-dno" v-model="g.destinatarioNombre" class="input" :disabled="g.motivo === '04'" required /></div>

      <fieldset class="space-y-3 rounded-xl bg-slate-50 p-3">
        <legend class="flex items-center gap-1.5 text-sm font-medium"><span class="flex size-5 items-center justify-center rounded-full bg-marca-700 text-[11px] text-white">A</span> Punto de partida</legend>
        <div><label class="etiqueta" for="g-pd">Dirección *</label><input id="g-pd" v-model="g.partidaDireccion" class="input" required /></div>
        <div class="grid grid-cols-2 gap-2">
          <div><label class="etiqueta" for="g-pu">Ubigeo *</label><input id="g-pu" v-model="g.partidaUbigeo" class="input font-mono" inputmode="numeric" maxlength="6" :title="ayudaUbigeo" required /></div>
          <div><label class="etiqueta" for="g-pe">Cód. establecimiento</label><input id="g-pe" v-model="g.partidaEstablecimiento" class="input font-mono" inputmode="numeric" maxlength="4" placeholder="0000" /></div>
        </div>
      </fieldset>
      <fieldset class="space-y-3 rounded-xl bg-slate-50 p-3">
        <legend class="flex items-center gap-1.5 text-sm font-medium"><span class="flex size-5 items-center justify-center rounded-full bg-indigo-600 text-[11px] text-white">B</span> Punto de llegada</legend>
        <div><label class="etiqueta" for="g-ld">Dirección *</label><input id="g-ld" v-model="g.llegadaDireccion" class="input" required /></div>
        <div class="grid grid-cols-2 gap-2">
          <div><label class="etiqueta" for="g-lu">Ubigeo *</label><input id="g-lu" v-model="g.llegadaUbigeo" class="input font-mono" inputmode="numeric" maxlength="6" :title="ayudaUbigeo" required /></div>
          <div><label class="etiqueta" for="g-le">Cód. establecimiento</label><input id="g-le" v-model="g.llegadaEstablecimiento" class="input font-mono" inputmode="numeric" maxlength="4" /></div>
        </div>
      </fieldset>
      <p class="text-xs text-slate-500 sm:col-span-2">{{ ayudaUbigeo }} El de cada sede se configura en Organización → Sedes.</p>
    </section>

    <!-- Transporte -->
    <section class="tarjeta space-y-4 p-4 sm:p-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="font-semibold">Transporte</h2>
        <div class="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1" role="radiogroup" aria-label="Modalidad de transporte">
          <button v-for="[k, t] in [['PRIVADO', 'Privado (vehículo propio)'], ['PUBLICO', 'Público (transportista)']]" :key="k" type="button" role="radio" :aria-checked="g.modalidad === k"
            class="min-h-9 rounded-md px-3 text-sm font-medium" :class="g.modalidad === k ? 'bg-white shadow-sm' : 'text-slate-600'" @click="g.modalidad = k">{{ t }}</button>
        </div>
      </div>
      <div v-if="g.modalidad === 'PUBLICO'" class="grid gap-3 sm:grid-cols-3">
        <div><label class="etiqueta" for="g-tr">RUC del transportista *</label><input id="g-tr" v-model="g.transportistaRuc" class="input font-mono" inputmode="numeric" maxlength="11" /></div>
        <div><label class="etiqueta" for="g-tn">Razón social *</label><input id="g-tn" v-model="g.transportistaNombre" class="input" /></div>
        <div><label class="etiqueta" for="g-tm">N.º registro MTC</label><input id="g-tm" v-model="g.transportistaMtc" class="input font-mono" /></div>
      </div>
      <div v-else class="grid gap-3 sm:grid-cols-3">
        <div><label class="etiqueta" for="g-cd">DNI del conductor *</label><input id="g-cd" v-model="g.conductorNumDoc" class="input font-mono" inputmode="numeric" maxlength="8" /></div>
        <div><label class="etiqueta" for="g-cn">Nombres *</label><input id="g-cn" v-model="g.conductorNombres" class="input" /></div>
        <div><label class="etiqueta" for="g-ca">Apellidos *</label><input id="g-ca" v-model="g.conductorApellidos" class="input" /></div>
        <div><label class="etiqueta" for="g-cl">Licencia de conducir *</label><input id="g-cl" v-model="g.conductorLicencia" class="input font-mono uppercase" maxlength="10" placeholder="Q12345678" /></div>
        <div><label class="etiqueta" for="g-vp">Placa del vehículo *</label><input id="g-vp" v-model="g.vehiculoPlaca" class="input font-mono uppercase" maxlength="8" placeholder="ABC-123" /></div>
      </div>
      <div class="grid gap-3 sm:grid-cols-3">
        <div>
          <label class="etiqueta" for="g-pb">Peso bruto total *</label>
          <div class="flex gap-2">
            <input id="g-pb" v-model="g.pesoBruto" type="number" inputmode="decimal" min="0.001" step="any" class="input" required />
            <select v-model="g.unidadPeso" class="input w-24" aria-label="Unidad de peso"><option value="KGM">kg</option><option value="TNE">t</option></select>
          </div>
        </div>
        <div><label class="etiqueta" for="g-bu">Bultos</label><input id="g-bu" v-model="g.bultos" type="number" inputmode="numeric" min="0" class="input" /></div>
      </div>
    </section>

    <!-- Bienes -->
    <section class="tarjeta space-y-3 p-4 sm:p-5">
      <h2 class="font-semibold">Bienes trasladados</h2>
      <BuscadorProducto v-if="contexto.empresaActivaId" :empresa-id="contexto.empresaActivaId" placeholder="Agregar producto…" @seleccionar="agregar" />
      <ul class="divide-y divide-slate-100 rounded-xl border border-slate-200">
        <li v-for="(it, i) in items" :key="i" class="flex items-center gap-3 px-3 py-2">
          <span class="min-w-0 flex-1"><span class="block truncate text-sm font-medium">{{ it.descripcion }}</span><span class="font-mono text-xs text-slate-400">{{ it.codigo }}</span></span>
          <input v-model="it.cantidad" type="number" inputmode="decimal" min="0.0001" step="any" class="input w-28 text-right" :aria-label="`Cantidad de ${it.descripcion}`" />
          <span class="w-10 text-xs text-slate-500">{{ it.unidadCodigo }}</span>
          <button type="button" class="btn px-2 text-red-600 hover:bg-red-50" :aria-label="`Quitar ${it.descripcion}`" @click="items.splice(i, 1)"><Icono nombre="eliminar" clase="size-4" /></button>
        </li>
        <li v-if="!items.length" class="px-3 py-6 text-center text-sm text-slate-500">Agregue los productos que se trasladan.</li>
      </ul>
      <div><label class="etiqueta" for="g-obs">Observación</label><input id="g-obs" v-model="g.observacion" class="input" maxlength="500" /></div>
    </section>

    <p v-if="estado.error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{{ estado.error }}</p>
    <div class="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border lg:bottom-4">
      <div class="flex justify-end gap-2">
        <RouterLink to="/guias" class="btn-secundario">Cancelar</RouterLink>
        <button class="btn-primario" :disabled="estado.enviando || !items.length">{{ estado.enviando ? 'Emitiendo…' : 'Emitir guía' }}</button>
      </div>
    </div>
  </form>
</template>
