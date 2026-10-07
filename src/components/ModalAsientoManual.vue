<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { api, mensajeError } from '@/services/api';
import { useToast } from '@/stores/toast';
import { soles } from '@/utils/formato';
import BaseModal from './BaseModal.vue';
import Icono from './Icono.vue';

/**
 * Asiento manual: fecha, glosa y líneas (cuenta, debe o haber, y opcionalmente el tercero y el
 * documento). Solo se guarda cuando cuadra. Sirve para crear y para editar.
 */
const props = defineProps({
  abierto: Boolean,
  empresaId: { type: String, default: null },
  asiento: { type: Object, default: null }, // para editar: { id, fecha, glosa, lineas }
  fechaInicial: { type: String, default: '' },
});
const emit = defineEmits(['cerrar', 'guardado']);
const toast = useToast();

const cuentas = ref([]);
const nuevaLinea = () => ({ cuenta: '', debe: '', haber: '', glosa: '', terceroDoc: '', terceroNombre: '', docSerie: '', docNumero: '', mas: false });
const f = reactive({ fecha: '', glosa: '', lineas: [] });
const guardando = ref(false);
// El plan es de la empresa: al cambiarla se vuelve a cargar
watch(() => props.empresaId, () => (cuentas.value = []));
const hoy =new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

watch(() => props.abierto, async (v) => {
  if (!v) return;
  if (props.asiento) {
    Object.assign(f, {
      fecha: props.asiento.fecha, glosa: props.asiento.glosa,
      lineas: props.asiento.lineas.map((l) => ({
        cuenta: l.cuenta, debe: Number(l.debe) ? String(Number(l.debe)) : '', haber: Number(l.haber) ? String(Number(l.haber)) : '', glosa: l.glosa ?? '',
        terceroDoc: l.terceroDoc ?? '', terceroNombre: l.terceroNombre ?? '', docSerie: l.docSerie ?? '', docNumero: l.docNumero ?? '', mas: Boolean(l.terceroDoc || l.docSerie),
      })),
    });
  } else {
    Object.assign(f, { fecha: props.fechaInicial || hoy, glosa: '', lineas: [nuevaLinea(), nuevaLinea()] });
  }
  if (!cuentas.value.length) {
    try {
      const { data } = await api.get('/contabilidad/plan', { params: { empresaId: props.empresaId } });
      cuentas.value = data.cuentas.filter((c) => c.imputable && c.activo);
    } catch (e) {
      toast.error(mensajeError(e));
    }
  }
}, { immediate: true });

const porCodigo = computed(() => new Map(cuentas.value.map((c) => [c.codigo, c])));
const num = (v) => Math.round((Number(v) || 0) * 100) / 100;
const totales = computed(() => ({ debe: num(f.lineas.reduce((s, l) => s + num(l.debe), 0)), haber: num(f.lineas.reduce((s, l) => s + num(l.haber), 0)) }));
const diferencia = computed(() => num(totales.value.debe - totales.value.haber));
const errorLinea = (l) => {
  if (!l.cuenta) return '';
  const c = porCodigo.value.get(l.cuenta);
  if (!c) return 'Cuenta no válida (debe recibir movimientos)';
  if (num(l.debe) > 0 && num(l.haber) > 0) return 'Solo debe o haber';
  return '';
};
const valido = computed(() => f.glosa.trim().length >= 3 && f.lineas.length >= 2
  && f.lineas.every((l) => l.cuenta && !errorLinea(l) && (num(l.debe) > 0) !== (num(l.haber) > 0))
  && diferencia.value === 0 && totales.value.debe > 0);
// Escribir en el debe borra el haber de la misma línea, y al revés
const alDebe = (l) => num(l.debe) > 0 && (l.haber = '');
const alHaber = (l) => num(l.haber) > 0 && (l.debe = '');
function cuadrarUltima() {
  const l = f.lineas.at(-1);
  if (diferencia.value > 0) Object.assign(l, { haber: String(num(num(l.haber) + diferencia.value)), debe: '' });
  else if (diferencia.value < 0) Object.assign(l, { debe: String(num(num(l.debe) - diferencia.value)), haber: '' });
}

async function guardar() {
  guardando.value = true;
  const cuerpo = {
    empresaId: props.empresaId, fecha: f.fecha, glosa: f.glosa,
    lineas: f.lineas.map(({ mas, ...l }) => ({ ...l, debe: num(l.debe), haber: num(l.haber) })),
  };
  try {
    const { data } = props.asiento
      ? await api.put(`/contabilidad/asientos/manual/${props.asiento.id}`, cuerpo)
      : await api.post('/contabilidad/asientos/manual', cuerpo);
    toast.exito(props.asiento ? 'Asiento actualizado' : `Asiento ${data.periodo.slice(4)}-${String(data.numero).padStart(4, '0')} registrado`);
    emit('guardado', data);
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <BaseModal :abierto="abierto" :titulo="asiento ? 'Editar asiento manual' : 'Nuevo asiento manual'" ancho="sm:max-w-5xl" @cerrar="emit('cerrar')">
    <form id="form-asiento" class="space-y-4" @submit.prevent="valido && guardar()">
      <div class="grid gap-3 sm:grid-cols-[11rem_1fr]">
        <div><label class="etiqueta" for="as-fecha">Fecha *</label><input id="as-fecha" v-model="f.fecha" type="date" class="input" :max="hoy" required /></div>
        <div><label class="etiqueta" for="as-glosa">Glosa *</label><input id="as-glosa" v-model="f.glosa" class="input" maxlength="300" placeholder="Por la provisión de…" required /></div>
      </div>

      <datalist id="cuentas-imputables">
        <option v-for="c in cuentas" :key="c.codigo" :value="c.codigo">{{ c.nombre }}</option>
      </datalist>
      <div class="overflow-x-auto rounded-xl border border-slate-200">
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              <th class="px-2 py-2 text-left font-semibold">Cuenta</th>
              <th class="px-2 py-2 text-left font-semibold">Detalle</th>
              <th class="w-32 px-2 py-2 text-right font-semibold">Debe</th>
              <th class="w-32 px-2 py-2 text-right font-semibold">Haber</th>
              <th class="w-20"><span class="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <template v-for="(l, i) in f.lineas" :key="i">
              <tr>
                <td class="px-2 py-1.5 align-top">
                  <input v-model.trim="l.cuenta" list="cuentas-imputables" class="input w-28 font-mono text-sm" inputmode="numeric" :aria-label="`Cuenta de la línea ${i + 1}`" />
                  <p class="mt-0.5 max-w-48 truncate text-xs" :class="errorLinea(l) ? 'text-red-600' : 'text-slate-500'">{{ errorLinea(l) || porCodigo.get(l.cuenta)?.nombre || '' }}</p>
                </td>
                <td class="px-2 py-1.5 align-top"><input v-model="l.glosa" class="input min-w-40 text-sm" maxlength="200" placeholder="Opcional" :aria-label="`Detalle de la línea ${i + 1}`" /></td>
                <td class="px-2 py-1.5 align-top"><input v-model="l.debe" type="number" min="0" step="0.01" inputmode="decimal" class="input text-right tabular-nums" :aria-label="`Debe de la línea ${i + 1}`" @input="alDebe(l)" /></td>
                <td class="px-2 py-1.5 align-top"><input v-model="l.haber" type="number" min="0" step="0.01" inputmode="decimal" class="input text-right tabular-nums" :aria-label="`Haber de la línea ${i + 1}`" @input="alHaber(l)" /></td>
                <td class="px-1 py-1.5 align-top whitespace-nowrap">
                  <button type="button" class="btn px-2 text-slate-500" :aria-label="`Tercero y documento de la línea ${i + 1}`" :aria-expanded="l.mas" @click="l.mas = !l.mas"><Icono nombre="usuarios" clase="size-4" /></button>
                  <button type="button" class="btn px-2 text-red-600 hover:bg-red-50" :disabled="f.lineas.length <= 2" :aria-label="`Quitar la línea ${i + 1}`" @click="f.lineas.splice(i, 1)"><Icono nombre="eliminar" clase="size-4" /></button>
                </td>
              </tr>
              <tr v-if="l.mas" class="bg-slate-50/60">
                <td colspan="5" class="px-2 py-2">
                  <div class="grid gap-2 sm:grid-cols-4">
                    <input v-model.trim="l.terceroDoc" class="input font-mono text-sm" maxlength="20" placeholder="RUC / DNI del tercero" :aria-label="`Documento del tercero, línea ${i + 1}`" />
                    <input v-model="l.terceroNombre" class="input text-sm" maxlength="200" placeholder="Nombre del tercero" :aria-label="`Nombre del tercero, línea ${i + 1}`" />
                    <input v-model.trim="l.docSerie" class="input font-mono text-sm uppercase" maxlength="20" placeholder="Serie del comprobante" :aria-label="`Serie del comprobante, línea ${i + 1}`" />
                    <input v-model.trim="l.docNumero" class="input font-mono text-sm" maxlength="20" placeholder="Número" :aria-label="`Número del comprobante, línea ${i + 1}`" />
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
          <tfoot class="border-t-2 border-slate-200 font-semibold">
            <tr>
              <td class="px-2 py-2" colspan="2">
                <button type="button" class="btn-texto text-marca-700" @click="f.lineas.push(nuevaLinea())"><Icono nombre="agregar" clase="size-4" /> Agregar línea</button>
              </td>
              <td class="px-2 py-2 text-right tabular-nums">{{ soles(totales.debe) }}</td>
              <td class="px-2 py-2 text-right tabular-nums">{{ soles(totales.haber) }}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <p v-if="diferencia !== 0" class="flex flex-wrap items-center gap-2 text-sm text-amber-800">
        <Icono nombre="alerta" clase="size-4" /> No cuadra: diferencia de {{ soles(Math.abs(diferencia)) }} al {{ diferencia > 0 ? 'haber' : 'debe' }}.
        <button type="button" class="font-medium underline" @click="cuadrarUltima">Cuadrar en la última línea</button>
      </p>
      <p v-else-if="totales.debe > 0" class="flex items-center gap-2 text-sm text-emerald-700"><Icono nombre="check" clase="size-4" /> El asiento cuadra</p>
    </form>
    <template #pie>
      <button class="btn-secundario" @click="emit('cerrar')">Cancelar</button>
      <button class="btn-primario" form="form-asiento" :disabled="!valido || guardando">{{ guardando ? 'Guardando…' : 'Guardar asiento' }}</button>
    </template>
  </BaseModal>
</template>
