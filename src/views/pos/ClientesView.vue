<script setup>
import { confirmar } from '@/utils/dialogos';
import { onMounted, reactive } from 'vue';
import { soles } from '@/utils/formato';
import { api, mensajeError } from '@/services/api';
import { useAuth } from '@/stores/auth';
import { useContexto } from '@/stores/contexto';
import { useToast } from '@/stores/toast';
import { useListado } from '@/composables/useListado';
import { TIPOS_DOCUMENTO } from '@/utils/pos';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import TablaResponsiva from '@/components/TablaResponsiva.vue';
import Paginacion from '@/components/Paginacion.vue';
import CampoBusqueda from '@/components/CampoBusqueda.vue';
import InsigniaEstado from '@/components/InsigniaEstado.vue';
import FormCliente from '@/components/FormCliente.vue';
import Icono from '@/components/Icono.vue';
import MenuAcciones from '@/components/MenuAcciones.vue';
import BotonColumnas from '@/components/BotonColumnas.vue';

const auth = useAuth();
const contexto = useContexto();
const toast = useToast();
const { filas, cargando, filtros, pag, cargar } = useListado('/clientes', { empresaId: contexto.empresaActivaId });
onMounted(cargar);

const columnas = [
  { clave: 'nombre', titulo: 'Cliente' },
  { clave: 'documento', titulo: 'Documento' },
  { clave: 'contacto', titulo: 'Contacto', ocultarEnTarjeta: true },
  { clave: 'credito', titulo: 'Crédito', ocultarEnTarjeta: false },
  { clave: '_count.comprobantes', titulo: 'Comprobantes', clase: 'text-center', ocultarEnTarjeta: true },
  { clave: 'activo', titulo: 'Estado' },
];
const form = reactive({ abierto: false, cliente: null });
const abrir = (c = null) => Object.assign(form, { abierto: true, cliente: c });
function guardado() {
  form.abierto = false;
  cargar();
}
async function eliminar(c) {
  if (!(await confirmar({ titulo: `¿Eliminar a ${c.nombre}?`, texto: 'Esta acción no se puede deshacer.', confirmar: 'Eliminar cliente', peligro: true }))) return;
  try {
    await api.delete(`/clientes/${c.id}`);
    toast.exito('Cliente eliminado');
    cargar();
  } catch (e) {
    toast.error(mensajeError(e));
  }
}

/** Acciones de cada cliente (menú ⋯) */
function accionesFila(f) {
  const puede = (p) => auth.canEnEmpresa(p, contexto.empresaActivaId);
  const eliminable = puede('clientes.cliente.eliminar') && !f._count.comprobantes;
  return [
    puede('clientes.cliente.editar') && { texto: 'Editar', icono: 'editar', alHacer: () => abrir(f) },
    f.creditoHabilitado && puede('cxc.cuenta.ver') && { texto: 'Ver estado de cuenta', icono: 'tarjeta', to: `/cuentas-por-cobrar/${f.id}` },
    eliminable && { separador: true },
    eliminable && { texto: 'Eliminar', icono: 'eliminar', peligro: true, alHacer: () => eliminar(f) },
  ];
}
</script>

<template>
  <EncabezadoPagina titulo="Clientes" :subtitulo="contexto.empresaActiva?.razonSocial">
    <button v-if="auth.canEnEmpresa('clientes.cliente.crear', contexto.empresaActivaId)" class="btn-primario" @click="abrir()">
      <Icono nombre="agregar" /> Nuevo cliente
    </button>
  </EncabezadoPagina>
  <div class="mb-4 flex gap-2"><div class="min-w-0 flex-1"><CampoBusqueda v-model="filtros.q" placeholder="Nombre, razón social, DNI o RUC" /></div><BotonColumnas :columnas="columnas" /></div>

  <TablaResponsiva :columnas="columnas" :filas="filas" :cargando="cargando" vacio="No hay clientes registrados">
    <template #celda-documento="{ fila }">
      <span class="whitespace-nowrap">{{ TIPOS_DOCUMENTO[fila.tipoDocumento] }} <span class="font-mono">{{ fila.numeroDocumento }}</span></span>
      <span v-if="fila.rucAsociado" class="block whitespace-nowrap text-xs text-slate-500">RUC <span class="font-mono">{{ fila.rucAsociado }}</span></span>
    </template>
    <template #celda-credito="{ fila }">
      <template v-if="fila.creditoHabilitado">
        <span class="insignia bg-sky-50 text-sky-700">{{ fila.limiteCredito != null ? `Hasta ${soles(fila.limiteCredito)}` : 'Sin tope' }} · {{ fila.diasCredito }} d</span>
        <RouterLink v-if="auth.canEnEmpresa('cxc.cuenta.ver', contexto.empresaActivaId)" :to="`/cuentas-por-cobrar/${fila.id}`" class="ml-1 text-xs text-marca-700 hover:underline">Estado de cuenta</RouterLink>
      </template>
      <span v-else class="text-slate-400">—</span>
    </template>
    <template #celda-contacto="{ fila }">{{ [fila.email, fila.telefono].filter(Boolean).join(' · ') || '—' }}</template>
    <template #celda-activo="{ fila }"><InsigniaEstado :activo="fila.activo" /></template>
    <template #acciones="{ fila }"><MenuAcciones :acciones="accionesFila(fila)" :etiqueta="`Acciones de ${fila.nombre}`" /></template>
  </TablaResponsiva>
  <Paginacion :pag="pag" />

  <FormCliente v-if="contexto.empresaActivaId" :abierto="form.abierto" :empresa-id="contexto.empresaActivaId" :cliente="form.cliente" @cerrar="form.abierto = false" @guardado="guardado" />
</template>
