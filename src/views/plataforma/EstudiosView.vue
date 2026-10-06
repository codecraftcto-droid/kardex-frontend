<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { apiPlataforma } from '@/services/apiPlataforma';
import { mensajeError } from '@/services/api';
import { usePlataforma } from '@/stores/plataforma';
import { useToast } from '@/stores/toast';
import { useListado } from '@/composables/useListado';
import { fechaHora } from '@/utils/formato';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import TablaResponsiva from '@/components/TablaResponsiva.vue';
import Paginacion from '@/components/Paginacion.vue';
import CampoBusqueda from '@/components/CampoBusqueda.vue';
import BaseModal from '@/components/BaseModal.vue';
import Icono from '@/components/Icono.vue';
import MenuAcciones from '@/components/MenuAcciones.vue';
import BotonColumnas from '@/components/BotonColumnas.vue';

const router = useRouter();
const plataforma = usePlataforma();
const toast = useToast();
const { filas, cargando, filtros, pag, cargar } = useListado('/estudios', { estado: '', planId: '' }, apiPlataforma);
const planes = ref([]);
onMounted(async () => {
  cargar();
  planes.value = (await apiPlataforma.get('/planes')).data;
});

const columnas = [
  { clave: 'nombre', titulo: 'Estudio' },
  { clave: 'plan.nombre', titulo: 'Plan' },
  { clave: 'activo', titulo: 'Estado' },
  { clave: 'uso', titulo: 'Empresas / usuarios / almacenes' },
  { clave: 'movimientos30d', titulo: 'Mov. 30 d', clase: 'text-right' },
  { clave: 'ultimoAcceso', titulo: 'Último acceso' },
];

const vacio = () => ({ nombre: '', ruc: '', emailContacto: '', telefonoContacto: '', planId: '', administrador: { nombres: '', email: '' } });
const modal = reactive({ abierto: false, guardando: false, form: vacio() });
async function crear() {
  modal.guardando = true;
  try {
    const f = modal.form;
    const { data } = await apiPlataforma.post('/estudios', { ...f, ruc: f.ruc || null, emailContacto: f.emailContacto || null, planId: f.planId || null });
    toast.exito(`Estudio creado; se envió la invitación a ${f.administrador.email}`);
    modal.abierto = false;
    router.push(`/plataforma/estudios/${data.id}`);
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    modal.guardando = false;
  }
}

/** Acciones de cada estudio (menú ⋯) */
const accionesFila = (f) => [{ texto: 'Ver estudio', icono: 'empresa', to: `/plataforma/estudios/${f.id}` }];
</script>

<template>
  <EncabezadoPagina titulo="Estudios" subtitulo="Clientes del servicio">
    <button v-if="plataforma.esAdmin" class="btn bg-slate-900 text-white hover:bg-slate-800" @click="(modal.form = vacio()), (modal.abierto = true)">
      <Icono nombre="agregar" /> Nuevo estudio
    </button>
  </EncabezadoPagina>

  <div class="mb-4 grid gap-2 sm:grid-cols-[1fr_12rem_12rem] md:grid-cols-[1fr_12rem_12rem_auto]">
    <CampoBusqueda v-model="filtros.q" placeholder="Nombre, RUC o correo" />
    <select v-model="filtros.estado" class="input">
      <option value="">Todos los estados</option>
      <option value="activo">Activos</option>
      <option value="suspendido">Suspendidos</option>
    </select>
    <select v-model="filtros.planId" class="input">
      <option value="">Todos los planes</option>
      <option v-for="p in planes" :key="p.id" :value="p.id">{{ p.nombre }}</option>
    </select>
    <BotonColumnas :columnas="columnas" />
  </div>

  <TablaResponsiva :columnas="columnas" :filas="filas" :cargando="cargando" vacio="No hay estudios">
    <template #celda-nombre="{ fila }">
      <RouterLink :to="`/plataforma/estudios/${fila.id}`" class="font-medium text-slate-900 hover:underline">{{ fila.nombre }}</RouterLink>
      <p class="text-xs text-slate-500">{{ fila.ruc || 'Sin RUC' }}<template v-if="fila.facturasPendientes"> · <span class="text-amber-700">{{ fila.facturasPendientes }} factura(s) pendiente(s)</span></template></p>
    </template>
    <template #celda-plan.nombre="{ fila }">{{ fila.plan?.nombre ?? 'Sin plan' }}</template>
    <template #celda-activo="{ fila }">
      <span class="insignia" :class="fila.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'">{{ fila.activo ? 'Activo' : 'Suspendido' }}</span>
    </template>
    <template #celda-uso="{ fila }"><span class="tabular-nums">{{ fila._count.empresas }} / {{ fila._count.usuarios }} / {{ fila.almacenes }}</span></template>
    <template #celda-movimientos30d="{ fila }"><span class="tabular-nums">{{ fila.movimientos30d }}</span></template>
    <template #celda-ultimoAcceso="{ fila }"><span class="whitespace-nowrap">{{ fechaHora(fila.ultimoAcceso) }}</span></template>
    <template #acciones="{ fila }"><MenuAcciones :acciones="accionesFila(fila)" :etiqueta="`Acciones de ${fila.nombre}`" /></template>
  </TablaResponsiva>
  <Paginacion :pag="pag" />

  <BaseModal :abierto="modal.abierto" titulo="Nuevo estudio" ancho="sm:max-w-2xl" @cerrar="modal.abierto = false">
    <form id="form-estudio" class="grid gap-4 sm:grid-cols-2" @submit.prevent="crear">
      <div class="sm:col-span-2"><label class="etiqueta">Nombre del estudio *</label><input v-model="modal.form.nombre" class="input" required /></div>
      <div><label class="etiqueta">RUC</label><input v-model="modal.form.ruc" class="input" inputmode="numeric" pattern="\d{11}" maxlength="11" /></div>
      <div>
        <label class="etiqueta">Plan</label>
        <select v-model="modal.form.planId" class="input">
          <option value="">Sin plan (sin límites ni cobro)</option>
          <option v-for="p in planes.filter((x) => x.activo)" :key="p.id" :value="p.id">{{ p.nombre }} · S/ {{ p.precioMensual }}/mes</option>
        </select>
      </div>
      <div><label class="etiqueta">Correo de contacto</label><input v-model="modal.form.emailContacto" type="email" class="input" /></div>
      <div><label class="etiqueta">Teléfono</label><input v-model="modal.form.telefonoContacto" type="tel" class="input" /></div>
      <fieldset class="rounded-lg border border-slate-200 p-3 sm:col-span-2">
        <legend class="px-1 text-sm font-medium">Primer administrador del estudio</legend>
        <div class="grid gap-3 sm:grid-cols-2">
          <div><label class="etiqueta">Nombres *</label><input v-model="modal.form.administrador.nombres" class="input" required /></div>
          <div><label class="etiqueta">Correo *</label><input v-model="modal.form.administrador.email" type="email" class="input" required /></div>
        </div>
        <p class="mt-2 text-xs text-slate-500">Recibirá una invitación para crear su contraseña. Se crean los roles plantilla del estudio.</p>
      </fieldset>
    </form>
    <template #pie>
      <button class="btn-secundario" @click="modal.abierto = false">Cancelar</button>
      <button class="btn bg-slate-900 text-white hover:bg-slate-800" form="form-estudio" :disabled="modal.guardando">Crear estudio</button>
    </template>
  </BaseModal>
</template>
