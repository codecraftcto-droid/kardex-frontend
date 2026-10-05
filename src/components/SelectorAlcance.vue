<script setup>
import { ref, watch } from 'vue';
import { api } from '@/services/api';
import { useContexto } from '@/stores/contexto';

/**
 * Selección en cascada del alcance: estudio → empresa → sede → almacén.
 * v-model: { alcanceTipo, alcanceId }
 */
const props = defineProps({
  permitirEstudio: { type: Boolean, default: true },
  empresaFija: { type: String, default: null }, // usuarios cliente: solo su empresa
});
const modelo = defineModel({ type: Object, required: true });
const contexto = useContexto();

const empresaId = ref(props.empresaFija || '');
const sedeId = ref('');
const almacenId = ref('');
const sedes = ref([]);
const almacenes = ref([]);

watch(
  () => modelo.value.alcanceTipo,
  (t) => {
    if (t !== 'estudio' && !empresaId.value) empresaId.value = props.empresaFija || contexto.empresaActivaId || '';
  },
  { immediate: true },
);

watch(empresaId, async (id) => {
  sedeId.value = '';
  sedes.value = id ? (await api.get('/sedes', { params: { empresaId: id, porPagina: 100 } })).data.datos : [];
}, { immediate: true });

watch(sedeId, async (id) => {
  almacenId.value = '';
  almacenes.value = id ? (await api.get('/almacenes', { params: { sedeId: id, porPagina: 100 } })).data.datos : [];
});

// Sincroniza el v-model con el nivel elegido
watch([() => modelo.value.alcanceTipo, empresaId, sedeId, almacenId], () => {
  const t = modelo.value.alcanceTipo;
  const id = { estudio: null, empresa: empresaId.value, sede: sedeId.value, almacen: almacenId.value }[t] || null;
  if (modelo.value.alcanceId !== id) modelo.value = { alcanceTipo: t, alcanceId: id };
});
</script>

<template>
  <div class="grid gap-3 sm:grid-cols-2">
    <div>
      <label class="etiqueta">Nivel de alcance</label>
      <select v-model="modelo.alcanceTipo" class="input">
        <option v-if="permitirEstudio" value="estudio">Todo el estudio</option>
        <option value="empresa">Empresa</option>
        <option value="sede">Sede</option>
        <option value="almacen">Almacén</option>
      </select>
    </div>
    <div v-if="modelo.alcanceTipo !== 'estudio'">
      <label class="etiqueta">Empresa</label>
      <select v-model="empresaId" class="input" :disabled="!!empresaFija" required>
        <option v-for="e in contexto.empresas" :key="e.id" :value="e.id">{{ e.razonSocial }}</option>
      </select>
    </div>
    <div v-if="['sede', 'almacen'].includes(modelo.alcanceTipo)">
      <label class="etiqueta">Sede</label>
      <select v-model="sedeId" class="input" required>
        <option value="" disabled>Seleccione…</option>
        <option v-for="s in sedes" :key="s.id" :value="s.id">{{ s.nombre }}</option>
      </select>
    </div>
    <div v-if="modelo.alcanceTipo === 'almacen'">
      <label class="etiqueta">Almacén</label>
      <select v-model="almacenId" class="input" required>
        <option value="" disabled>Seleccione…</option>
        <option v-for="a in almacenes" :key="a.id" :value="a.id">{{ a.codigo }} — {{ a.nombre }}</option>
      </select>
    </div>
  </div>
</template>
