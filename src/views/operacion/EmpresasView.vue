<script setup>
import { confirmar } from '@/utils/dialogos';
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, mensajeError } from '@/services/api';
import { useAuth } from '@/stores/auth';
import { useContexto } from '@/stores/contexto';
import { useToast } from '@/stores/toast';
import { useListado } from '@/composables/useListado';
import { useTiempoReal } from '@/composables/useTiempoReal';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import TablaResponsiva from '@/components/TablaResponsiva.vue';
import Paginacion from '@/components/Paginacion.vue';
import CampoBusqueda from '@/components/CampoBusqueda.vue';
import BaseModal from '@/components/BaseModal.vue';
import InsigniaEstado from '@/components/InsigniaEstado.vue';
import Icono from '@/components/Icono.vue';
import MenuAcciones from '@/components/MenuAcciones.vue';
import BotonColumnas from '@/components/BotonColumnas.vue';
import ModalFacturacion from '@/components/ModalFacturacion.vue';
import ModalSire from '@/components/ModalSire.vue';

const auth = useAuth();
const contexto = useContexto();
const toast = useToast();
const { filas, cargando, filtros, pag, cargar } = useListado('/empresas', { activo: '' });
onMounted(cargar);
useTiempoReal('empresa:cambio', cargar);

const columnas = [
  { clave: 'razonSocial', titulo: 'Razón social' },
  { clave: 'ruc', titulo: 'RUC' },
  { clave: 'metodoValorizacion', titulo: 'Valorización' },
  { clave: '_count.sedes', titulo: 'Sedes', clase: 'text-center' },
  { clave: 'activo', titulo: 'Estado' },
];

const vacio = () => ({ razonSocial: '', ruc: '', contacto: '', email: '', telefono: '', direccion: '', nombreComercial: '', cuentaDetracciones: '', exceptuadoRetencion: false, buenContribuyente: false, metodoValorizacion: 'PROMEDIO', activo: true });
const modal = reactive({ abierto: false, id: null, guardando: false, form: vacio() });

function abrir(fila) {
  modal.id = fila?.id ?? null;
  modal.form = fila ? { ...vacio(), ...Object.fromEntries(Object.keys(vacio()).map((k) => [k, fila[k] ?? ''])) } : vacio();
  modal.abierto = true;
}

const puedeValorizacion = () =>
  modal.id ? auth.can('empresas.configuracion.editar', { empresaId: modal.id }) : auth.can('empresas.configuracion.editar', {});

async function guardar() {
  modal.guardando = true;
  try {
    const datos = { ...modal.form };
    if (modal.id) await api.put(`/empresas/${modal.id}`, datos);
    else {
      delete datos.activo;
      await api.post('/empresas', datos);
    }
    toast.exito(modal.id ? 'Empresa actualizada' : 'Empresa creada');
    modal.abierto = false;
    cargar();
    contexto.cargar(auth.usuario.id);
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    modal.guardando = false;
  }
}

async function eliminar(fila) {
  if (!(await confirmar({ titulo: `¿Eliminar ${fila.razonSocial}?`, texto: 'Esta acción no se puede deshacer.', confirmar: 'Eliminar empresa', peligro: true }))) return;
  try {
    await api.delete(`/empresas/${fila.id}`);
    toast.exito('Empresa eliminada');
    cargar();
    contexto.cargar(auth.usuario.id);
  } catch (e) {
    toast.error(mensajeError(e));
  }
}

/** Acciones de cada fila (menú ⋯), solo las permitidas sobre ese registro */
// ── Facturación electrónica: ?facturacion=<empresaId> (enlace desde Comprobantes) ──
const route = useRoute();
const router = useRouter();
const empresaFacturacion = computed(() => {
  const id = route.query.facturacion;
  return typeof id === 'string' ? filas.value.find((e) => e.id === id) ?? contexto.empresas.find((e) => e.id === id) ?? null : null;
});
const abrirFacturacion = (f) => router.push({ query: { ...route.query, facturacion: f.id } });
const cerrarFacturacion = () => router.replace({ query: { ...route.query, facturacion: undefined } });

// ── Credenciales SIRE: ?sire=<empresaId> ──
const empresaSire = computed(() => {
  const id = route.query.sire;
  return typeof id === 'string' ? filas.value.find((e) => e.id === id) ?? contexto.empresas.find((e) => e.id === id) ?? null : null;
});
const abrirSire = (f) => router.push({ query: { ...route.query, sire: f.id } });
const cerrarSire = () => router.replace({ query: { ...route.query, sire: undefined } });

const accionesFila = (f) => [
  auth.canEnEmpresa('cpe.configuracion.editar', f.id) && { texto: 'Facturación electrónica', icono: 'comprobante', alHacer: () => abrirFacturacion(f) },
  auth.canEnEmpresa('sire.configuracion.editar', f.id) && { texto: 'Credenciales SIRE', icono: 'candado', alHacer: () => abrirSire(f) },
  auth.can('empresas.empresa.editar', { empresaId: f.id }) && { texto: 'Editar', icono: 'editar', alHacer: () => abrir(f) },
  auth.can('empresas.empresa.eliminar', { empresaId: f.id }) && { separador: true },
  auth.can('empresas.empresa.eliminar', { empresaId: f.id }) && { texto: 'Eliminar', icono: 'eliminar', peligro: true, alHacer: () => eliminar(f) },
];
</script>

<template>
  <EncabezadoPagina titulo="Empresas cliente" subtitulo="Empresas atendidas por el estudio">
    <button v-can="{ permiso: 'empresas.empresa.crear', recurso: {} }" class="btn-primario" @click="abrir()">
      <Icono nombre="agregar" /> Nueva empresa
    </button>
  </EncabezadoPagina>

  <div class="mb-4 grid gap-2 sm:grid-cols-[1fr_auto] md:grid-cols-[1fr_auto_auto]">
    <CampoBusqueda v-model="filtros.q" placeholder="Buscar por razón social o RUC" />
    <select v-model="filtros.activo" class="input sm:w-40">
      <option value="">Todas</option>
      <option value="true">Activas</option>
      <option value="false">Inactivas</option>
    </select>
    <BotonColumnas :columnas="columnas" />
  </div>

  <TablaResponsiva :columnas="columnas" :filas="filas" :cargando="cargando" vacio="No hay empresas">
    <template #celda-metodoValorizacion="{ fila }">{{ fila.metodoValorizacion === 'PEPS' ? 'PEPS' : 'Promedio ponderado' }}</template>
    <template #celda-activo="{ fila }"><InsigniaEstado :activo="fila.activo" textoSi="Activa" textoNo="Inactiva" /></template>
    <template #acciones="{ fila }"><MenuAcciones :acciones="accionesFila(fila)" :etiqueta="`Acciones de ${fila.razonSocial ?? fila.nombre}`" /></template>
  </TablaResponsiva>
  <Paginacion :pag="pag" />

  <BaseModal :abierto="modal.abierto" :titulo="modal.id ? 'Editar empresa' : 'Nueva empresa'" @cerrar="modal.abierto = false">
    <form id="form-empresa" class="grid gap-4 sm:grid-cols-2" @submit.prevent="guardar">
      <div class="sm:col-span-2">
        <label class="etiqueta" for="rs">Razón social *</label>
        <input id="rs" v-model="modal.form.razonSocial" class="input" required />
      </div>
      <div>
        <label class="etiqueta" for="ruc">RUC *</label>
        <input id="ruc" v-model="modal.form.ruc" class="input" inputmode="numeric" pattern="\d{11}" maxlength="11" required />
      </div>
      <div>
        <label class="etiqueta" for="val">Método de valorización</label>
        <select id="val" v-model="modal.form.metodoValorizacion" class="input" :disabled="!puedeValorizacion()">
          <option value="PROMEDIO">Promedio ponderado</option>
          <option value="PEPS">PEPS</option>
        </select>
      </div>
      <div>
        <label class="etiqueta" for="cto">Contacto</label>
        <input id="cto" v-model="modal.form.contacto" class="input" />
      </div>
      <div>
        <label class="etiqueta" for="tel">Teléfono</label>
        <input id="tel" v-model="modal.form.telefono" class="input" type="tel" inputmode="tel" />
      </div>
      <div class="sm:col-span-2">
        <label class="etiqueta" for="em">Correo</label>
        <input id="em" v-model="modal.form.email" class="input" type="email" />
      </div>
      <div class="sm:col-span-2">
        <label class="etiqueta" for="dir">Dirección</label>
        <input id="dir" v-model="modal.form.direccion" class="input" />
      </div>
      <div class="sm:col-span-2">
        <label class="etiqueta" for="ncom">Nombre comercial (se imprime en los comprobantes)</label>
        <input id="ncom" v-model="modal.form.nombreComercial" class="input" maxlength="150" />
      </div>
      <div>
        <label class="etiqueta" for="cdet">Cuenta de detracciones (Banco de la Nación)</label>
        <input id="cdet" v-model="modal.form.cuentaDetracciones" class="input font-mono" maxlength="20" placeholder="00-000-000000" />
        <p class="mt-1 text-xs text-slate-500">Se imprime en las facturas sujetas a detracción.</p>
      </div>
      <label class="flex min-h-11 items-start gap-3 pt-1 sm:pt-6">
        <input v-model="modal.form.exceptuadoRetencion" type="checkbox" class="mt-0.5 size-5 accent-marca-700" />
        <span class="text-sm">Buen contribuyente o agente de retención <span class="block text-xs text-slate-500">Sus clientes no le retienen el 3% del IGV.</span></span>
      </label>
      <label class="flex min-h-11 items-start gap-3 sm:col-span-2">
        <input v-model="modal.form.buenContribuyente" type="checkbox" class="mt-0.5 size-5 accent-marca-700" />
        <span class="text-sm">Buen contribuyente / UESP en el cronograma de SUNAT <span class="block text-xs text-slate-500">Sus vencimientos mensuales (SIRE, declaraciones) son los de ese grupo y no los del último dígito del RUC.</span></span>
      </label>
      <label v-if="modal.id" class="flex min-h-11 items-center gap-3 sm:col-span-2">
        <input v-model="modal.form.activo" type="checkbox" class="size-5 accent-marca-700" /> Empresa activa
      </label>
    </form>
    <template #pie>
      <button class="btn-secundario" @click="modal.abierto = false">Cancelar</button>
      <button class="btn-primario" form="form-empresa" :disabled="modal.guardando">Guardar</button>
    </template>
  </BaseModal>
  <ModalFacturacion :abierto="!!empresaFacturacion" :empresa="empresaFacturacion" @cerrar="cerrarFacturacion" />
  <ModalSire :abierto="!!empresaSire" :empresa="empresaSire" @cerrar="cerrarSire" />
</template>
