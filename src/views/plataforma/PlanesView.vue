<script setup>
import { onMounted, reactive, ref } from 'vue';
import { apiPlataforma } from '@/services/apiPlataforma';
import { mensajeError } from '@/services/api';
import { usePlataforma } from '@/stores/plataforma';
import { useToast } from '@/stores/toast';
import { soles } from '@/utils/formato';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import BaseModal from '@/components/BaseModal.vue';
import Icono from '@/components/Icono.vue';

const plataforma = usePlataforma();
const toast = useToast();
const planes = ref([]);
const modulos = ref([]);
const cargar = async () => (planes.value = (await apiPlataforma.get('/planes')).data);
onMounted(async () => {
  cargar();
  modulos.value = (await apiPlataforma.get('/modulos')).data;
});
const nombreModulo = (c) => modulos.value.find((m) => m.codigo === c)?.nombre ?? c;

const vacio = () => ({ codigo: '', nombre: '', descripcion: '', precioMensual: '', maxEmpresas: '', maxUsuarios: '', maxAlmacenes: '', modulos: ['inventario', 'pos', 'cxc', 'facturacion'], activo: true });
const modal = reactive({ abierto: false, id: null, form: vacio(), guardando: false });
function abrir(p) {
  modal.id = p?.id ?? null;
  modal.form = p ? { ...vacio(), ...Object.fromEntries(Object.keys(vacio()).map((k) => [k, p[k] ?? ''])), modulos: [...(p.modulos ?? [])] } : vacio();
  modal.abierto = true;
}
async function guardar() {
  modal.guardando = true;
  const nulo = (v) => (v === '' || v === null ? null : v);
  const f = modal.form;
  const datos = { ...f, maxEmpresas: nulo(f.maxEmpresas), maxUsuarios: nulo(f.maxUsuarios), maxAlmacenes: nulo(f.maxAlmacenes) };
  try {
    modal.id ? await apiPlataforma.put(`/planes/${modal.id}`, datos) : await apiPlataforma.post('/planes', datos);
    toast.exito('Plan guardado');
    modal.abierto = false;
    cargar();
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    modal.guardando = false;
  }
}
const limite = (v) => (v == null ? 'Ilimitados' : v);
</script>

<template>
  <EncabezadoPagina titulo="Planes" subtitulo="Precios y límites que se aplican a cada estudio">
    <button v-if="plataforma.esAdmin" class="btn bg-slate-900 text-white hover:bg-slate-800" @click="abrir()"><Icono nombre="agregar" /> Nuevo plan</button>
  </EncabezadoPagina>
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <article v-for="p in planes" :key="p.id" class="tarjeta flex flex-col p-5" :class="{ 'opacity-60': !p.activo }">
      <div class="flex items-start justify-between">
        <div>
          <p class="text-xs font-semibold tracking-wide text-slate-500 uppercase">{{ p.codigo }}</p>
          <h2 class="text-lg font-semibold">{{ p.nombre }}</h2>
        </div>
        <span v-if="!p.activo" class="insignia bg-slate-100 text-slate-600">Inactivo</span>
      </div>
      <p class="mt-1 text-sm text-slate-500">{{ p.descripcion }}</p>
      <p class="my-4 text-3xl font-semibold">{{ soles(p.precioMensual) }}<span class="text-sm font-normal text-slate-500"> / mes</span></p>
      <ul class="flex-1 space-y-1 text-sm">
        <li>Empresas: <strong>{{ limite(p.maxEmpresas) }}</strong></li>
        <li>Usuarios: <strong>{{ limite(p.maxUsuarios) }}</strong></li>
        <li>Almacenes: <strong>{{ limite(p.maxAlmacenes) }}</strong></li>
        <li class="pt-2">
          <span class="mb-1 block text-xs text-slate-500">Módulos incluidos</span>
          <span class="flex flex-wrap gap-1">
            <span v-for="m in p.modulos" :key="m" class="insignia bg-marca-50 text-marca-800">{{ nombreModulo(m) }}</span>
          </span>
        </li>
      </ul>
      <div class="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
        <span class="text-slate-500">{{ p._count.estudios }} estudio(s)</span>
        <button v-if="plataforma.esAdmin" class="btn-texto text-slate-700" @click="abrir(p)"><Icono nombre="editar" clase="size-4" /> Editar</button>
      </div>
    </article>
  </div>

  <BaseModal :abierto="modal.abierto" :titulo="modal.id ? 'Editar plan' : 'Nuevo plan'" @cerrar="modal.abierto = false">
    <form id="form-plan" class="grid grid-cols-2 gap-3" @submit.prevent="guardar">
      <div><label class="etiqueta">Código *</label><input v-model="modal.form.codigo" class="input uppercase" required /></div>
      <div><label class="etiqueta">Nombre *</label><input v-model="modal.form.nombre" class="input" required /></div>
      <div class="col-span-2"><label class="etiqueta">Descripción</label><input v-model="modal.form.descripcion" class="input" /></div>
      <div class="col-span-2"><label class="etiqueta">Precio mensual (S/) *</label><input v-model="modal.form.precioMensual" type="number" min="0" step="0.01" inputmode="decimal" class="input" required /></div>
      <div><label class="etiqueta">Máx. empresas</label><input v-model="modal.form.maxEmpresas" type="number" min="1" class="input" placeholder="Ilimitado" /></div>
      <div><label class="etiqueta">Máx. usuarios</label><input v-model="modal.form.maxUsuarios" type="number" min="1" class="input" placeholder="Ilimitado" /></div>
      <div><label class="etiqueta">Máx. almacenes</label><input v-model="modal.form.maxAlmacenes" type="number" min="1" class="input" placeholder="Ilimitado" /></div>
      <fieldset class="sm:col-span-2">
        <legend class="etiqueta">Módulos incluidos</legend>
        <div class="grid gap-2 sm:grid-cols-2">
          <label v-for="m in modulos" :key="m.codigo" class="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 p-2.5 text-sm hover:border-slate-300">
            <input v-model="modal.form.modulos" type="checkbox" :value="m.codigo" class="mt-0.5 size-4 accent-marca-700" />
            <span><span class="block font-medium">{{ m.nombre }}</span><span class="text-xs text-slate-500">{{ m.descripcion }}</span></span>
          </label>
        </div>
        <p class="mt-1 text-xs text-slate-500">Inicio, empresas, sedes, almacenes, usuarios y auditoría vienen siempre incluidos.</p>
      </fieldset>
      <label class="col-span-2 flex min-h-11 items-center gap-2 text-sm"><input v-model="modal.form.activo" type="checkbox" class="size-5" /> Disponible para nuevos estudios</label>
    </form>
    <template #pie>
      <button class="btn-secundario" @click="modal.abierto = false">Cancelar</button>
      <button class="btn bg-slate-900 text-white" form="form-plan" :disabled="modal.guardando">Guardar</button>
    </template>
  </BaseModal>
</template>
