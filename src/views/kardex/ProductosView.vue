<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { api, mensajeError } from '@/services/api';
import { useAuth } from '@/stores/auth';
import { useContexto } from '@/stores/contexto';
import { useToast } from '@/stores/toast';
import { useListado } from '@/composables/useListado';
import { useTiempoReal } from '@/composables/useTiempoReal';
import { soles } from '@/utils/formato';
import EncabezadoPagina from '@/components/EncabezadoPagina.vue';
import TablaResponsiva from '@/components/TablaResponsiva.vue';
import Paginacion from '@/components/Paginacion.vue';
import CampoBusqueda from '@/components/CampoBusqueda.vue';
import BaseModal from '@/components/BaseModal.vue';
import InsigniaEstado from '@/components/InsigniaEstado.vue';
import Icono from '@/components/Icono.vue';

const auth = useAuth();
const contexto = useContexto();
const toast = useToast();
const { filas, cargando, filtros, pag, cargar } = useListado('/productos', {
  empresaId: contexto.empresaActivaId,
  categoriaId: '',
  activo: '',
});
useTiempoReal('producto:cambio', cargar);

const categorias = ref([]);
const unidades = ref([]);
async function cargarCatalogos() {
  if (!contexto.empresaActivaId) return;
  const [c, u] = await Promise.all([
    api.get('/catalogos/categorias', { params: { empresaId: contexto.empresaActivaId } }),
    unidades.value.length ? { data: unidades.value } : api.get('/catalogos/unidades'),
  ]);
  categorias.value = c.data;
  unidades.value = u.data;
}
onMounted(() => {
  cargar();
  cargarCatalogos();
});

const empresaId = computed(() => contexto.empresaActivaId);
const puedeCrear = computed(() => auth.canEnEmpresa('productos.producto.crear', empresaId.value));
const puedeEditar = computed(() => auth.canEnEmpresa('productos.producto.editar', empresaId.value));
const puedeEliminar = computed(() => auth.canEnEmpresa('productos.producto.eliminar', empresaId.value));

const columnas = [
  { clave: 'nombre', titulo: 'Producto' },
  { clave: 'sku', titulo: 'SKU' },
  { clave: 'categoria.nombre', titulo: 'Categoría' },
  { clave: 'unidad.codigo', titulo: 'Unidad' },
  { clave: 'precioReferencial', titulo: 'Precio ref.', clase: 'text-right' },
  { clave: 'activo', titulo: 'Estado' },
];

const vacio = () => ({ sku: '', nombre: '', codigoBarras: '', categoriaId: '', unidadId: unidades.value.find((u) => u.codigo === 'NIU')?.id || '', precioReferencial: '', descripcion: '', activo: true });
const modal = reactive({ abierto: false, id: null, guardando: false, form: vacio(), nuevaCategoria: '' });

function abrir(fila) {
  modal.id = fila?.id ?? null;
  modal.nuevaCategoria = '';
  modal.form = fila
    ? {
        sku: fila.sku, nombre: fila.nombre, codigoBarras: fila.codigoBarras ?? '', categoriaId: fila.categoriaId ?? '',
        unidadId: fila.unidadId, precioReferencial: fila.precioReferencial ?? '', descripcion: fila.descripcion ?? '', activo: fila.activo,
      }
    : vacio();
  modal.abierto = true;
}

async function crearCategoria() {
  if (!modal.nuevaCategoria.trim()) return;
  try {
    const { data } = await api.post('/catalogos/categorias', { empresaId: empresaId.value, nombre: modal.nuevaCategoria });
    categorias.value = [...categorias.value, data].sort((a, b) => a.nombre.localeCompare(b.nombre));
    modal.form.categoriaId = data.id;
    modal.nuevaCategoria = '';
  } catch (e) {
    toast.error(mensajeError(e));
  }
}

async function guardar() {
  modal.guardando = true;
  try {
    const datos = { ...modal.form, precioReferencial: modal.form.precioReferencial === '' ? null : modal.form.precioReferencial };
    if (modal.id) await api.put(`/productos/${modal.id}`, datos);
    else {
      delete datos.activo;
      await api.post('/productos', { ...datos, empresaId: empresaId.value });
    }
    toast.exito(modal.id ? 'Producto actualizado' : 'Producto creado');
    modal.abierto = false;
    cargar();
  } catch (e) {
    toast.error(mensajeError(e));
  } finally {
    modal.guardando = false;
  }
}

async function eliminar(fila) {
  if (!confirm(`¿Eliminar "${fila.nombre}"?`)) return;
  try {
    await api.delete(`/productos/${fila.id}`);
    toast.exito('Producto eliminado');
    cargar();
  } catch (e) {
    toast.error(mensajeError(e));
  }
}
</script>

<template>
  <EncabezadoPagina titulo="Productos" :subtitulo="contexto.empresaActiva?.razonSocial">
    <button v-if="puedeCrear" class="btn-primario" @click="abrir()"><Icono nombre="agregar" /> Nuevo producto</button>
  </EncabezadoPagina>

  <div class="mb-4 grid gap-2 sm:grid-cols-[1fr_14rem_10rem]">
    <CampoBusqueda v-model="filtros.q" placeholder="Nombre, SKU o código de barras" />
    <select v-model="filtros.categoriaId" class="input">
      <option value="">Todas las categorías</option>
      <option v-for="c in categorias" :key="c.id" :value="c.id">{{ c.nombre }}</option>
    </select>
    <select v-model="filtros.activo" class="input">
      <option value="">Todos</option>
      <option value="true">Activos</option>
      <option value="false">Inactivos</option>
    </select>
  </div>

  <TablaResponsiva :columnas="columnas" :filas="filas" :cargando="cargando" vacio="No hay productos en esta empresa">
    <template #celda-nombre="{ fila }">
      <span class="font-medium">{{ fila.nombre }}</span>
      <p v-if="fila.codigoBarras" class="font-mono text-xs text-slate-400">{{ fila.codigoBarras }}</p>
    </template>
    <template #celda-sku="{ fila }"><span class="font-mono text-xs">{{ fila.sku }}</span></template>
    <template #celda-precioReferencial="{ fila }">{{ soles(fila.precioReferencial) }}</template>
    <template #celda-activo="{ fila }"><InsigniaEstado :activo="fila.activo" /></template>
    <template #acciones="{ fila }">
      <RouterLink :to="{ name: 'kardex', query: { productoId: fila.id } }" class="btn-texto"><Icono nombre="kardex" clase="size-4" /> Kardex</RouterLink>
      <button v-if="puedeEditar" class="btn-texto" @click="abrir(fila)"><Icono nombre="editar" clase="size-4" /> Editar</button>
      <button v-if="puedeEliminar" class="btn-texto text-red-600 hover:bg-red-50" @click="eliminar(fila)"><Icono nombre="eliminar" clase="size-4" /></button>
    </template>
  </TablaResponsiva>
  <Paginacion :pag="pag" />

  <BaseModal :abierto="modal.abierto" :titulo="modal.id ? 'Editar producto' : 'Nuevo producto'" ancho="sm:max-w-2xl" @cerrar="modal.abierto = false">
    <form id="form-producto" class="grid gap-4 sm:grid-cols-2" @submit.prevent="guardar">
      <div class="sm:col-span-2">
        <label class="etiqueta" for="nom">Nombre *</label>
        <input id="nom" v-model="modal.form.nombre" class="input" required />
      </div>
      <div>
        <label class="etiqueta" for="sku">SKU *</label>
        <input id="sku" v-model="modal.form.sku" class="input uppercase" maxlength="40" required />
      </div>
      <div>
        <label class="etiqueta" for="cb">Código de barras</label>
        <input id="cb" v-model="modal.form.codigoBarras" class="input font-mono" inputmode="numeric" maxlength="50" />
      </div>
      <div>
        <label class="etiqueta" for="uni">Unidad de medida *</label>
        <select id="uni" v-model="modal.form.unidadId" class="input" required>
          <option v-for="u in unidades" :key="u.id" :value="u.id">{{ u.nombre }} ({{ u.codigo }})</option>
        </select>
      </div>
      <div>
        <label class="etiqueta" for="pre">Precio referencial (S/)</label>
        <input id="pre" v-model="modal.form.precioReferencial" class="input" type="number" inputmode="decimal" min="0" step="0.01" />
      </div>
      <div class="sm:col-span-2">
        <label class="etiqueta" for="cat">Categoría</label>
        <div class="flex flex-col gap-2 sm:flex-row">
          <select id="cat" v-model="modal.form.categoriaId" class="input sm:flex-1">
            <option value="">Sin categoría</option>
            <option v-for="c in categorias" :key="c.id" :value="c.id">{{ c.nombre }}</option>
          </select>
          <div class="flex gap-2 sm:flex-1">
            <input v-model="modal.nuevaCategoria" class="input" placeholder="Nueva categoría" @keydown.enter.prevent="crearCategoria" />
            <button type="button" class="btn-secundario shrink-0" :disabled="!modal.nuevaCategoria.trim()" @click="crearCategoria">Crear</button>
          </div>
        </div>
      </div>
      <div class="sm:col-span-2">
        <label class="etiqueta" for="desc">Descripción</label>
        <textarea id="desc" v-model="modal.form.descripcion" class="input py-2" rows="2" maxlength="500" />
      </div>
      <label v-if="modal.id" class="flex min-h-11 items-center gap-3 sm:col-span-2">
        <input v-model="modal.form.activo" type="checkbox" class="size-5 accent-marca-700" /> Producto activo
      </label>
    </form>
    <template #pie>
      <button class="btn-secundario" @click="modal.abierto = false">Cancelar</button>
      <button class="btn-primario" form="form-producto" :disabled="modal.guardando">Guardar</button>
    </template>
  </BaseModal>
</template>
