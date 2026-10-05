import { createRouter, createWebHistory } from 'vue-router';
import { useAuth } from '@/stores/auth';
import { usePlataforma } from '@/stores/plataforma';

/** Basta uno de estos permisos para ver la sección de reportes. */
export const PERMISOS_REPORTES = ['reporte.stock.ver', 'reporte.movimientos.ver', 'reporte.valorizacion.ver', 'transferencia.ver'];

/**
 * meta.permisos → basta con uno de la lista
 * meta.publica  → no requiere sesión
 * meta.permiso  → código de permiso necesario (en cualquier alcance)
 */
const routes = [
  { path: '/login', name: 'login', component: () => import('@/views/auth/LoginView.vue'), meta: { publica: true, soloInvitado: true } },
  { path: '/olvide', name: 'olvide', component: () => import('@/views/auth/OlvideView.vue'), meta: { publica: true, soloInvitado: true } },
  { path: '/activar', name: 'activar', component: () => import('@/views/auth/PasswordTokenView.vue'), meta: { publica: true, modo: 'activar' } },
  { path: '/restablecer', name: 'restablecer', component: () => import('@/views/auth/PasswordTokenView.vue'), meta: { publica: true, modo: 'restablecer' } },
  {
    path: '/',
    component: () => import('@/layouts/AppLayout.vue'),
    children: [
      { path: '', name: 'inicio', component: () => import('@/views/InicioView.vue') },
      { path: 'inventario', name: 'inventario', component: () => import('@/views/kardex/InventarioView.vue'), meta: { permiso: 'kardex.stock.ver', titulo: 'Inventario' } },
      { path: 'movimientos', name: 'movimientos', component: () => import('@/views/kardex/MovimientosView.vue'), meta: { permiso: 'kardex.stock.ver', titulo: 'Movimientos' } },
      { path: 'movimientos/entrada', name: 'entrada', component: () => import('@/views/kardex/MovimientoFormView.vue'), meta: { permiso: 'kardex.entrada.crear', titulo: 'Nueva entrada', tipo: 'ENTRADA' } },
      { path: 'movimientos/salida', name: 'salida', component: () => import('@/views/kardex/MovimientoFormView.vue'), meta: { permiso: 'kardex.salida.crear', titulo: 'Nueva salida', tipo: 'SALIDA' } },
      { path: 'movimientos/:id', name: 'movimiento', component: () => import('@/views/kardex/MovimientoDetalleView.vue'), meta: { permiso: 'kardex.stock.ver', titulo: 'Movimiento' } },
      { path: 'kardex', name: 'kardex', component: () => import('@/views/kardex/KardexProductoView.vue'), meta: { permiso: 'kardex.stock.ver', titulo: 'Kardex por producto' } },
      { path: 'transferencias', name: 'transferencias', component: () => import('@/views/kardex/TransferenciasView.vue'), meta: { permiso: 'transferencia.ver', titulo: 'Transferencias' } },
      { path: 'transferencias/nueva', name: 'transferencia-nueva', component: () => import('@/views/kardex/TransferenciaFormView.vue'), meta: { permiso: 'transferencia.solicitar', titulo: 'Nueva transferencia' } },
      { path: 'transferencias/:id', name: 'transferencia', component: () => import('@/views/kardex/TransferenciaDetalleView.vue'), meta: { permiso: 'transferencia.ver', titulo: 'Transferencia' } },
      { path: 'reportes', name: 'reportes', component: () => import('@/views/ReportesView.vue'), meta: { permisos: PERMISOS_REPORTES, titulo: 'Reportes' } },
      { path: 'compras', name: 'compras', component: () => import('@/views/comercial/DocumentosView.vue'), meta: { permiso: 'compras.compra.ver', titulo: 'Compras', tipo: 'COMPRA' } },
      { path: 'compras/nueva', name: 'compras-nueva', component: () => import('@/views/comercial/DocumentoFormView.vue'), meta: { permiso: 'compras.compra.crear', titulo: 'Nueva', tipo: 'COMPRA' } },
      { path: 'compras/:id/editar', name: 'compras-editar', component: () => import('@/views/comercial/DocumentoFormView.vue'), meta: { permiso: 'compras.compra.crear', titulo: 'Editar', tipo: 'COMPRA' } },
      { path: 'compras/:id', name: 'compras-detalle', component: () => import('@/views/comercial/DocumentoDetalleView.vue'), meta: { permiso: 'compras.compra.ver', titulo: 'Compras', tipo: 'COMPRA' } },
      { path: 'ventas', name: 'ventas', component: () => import('@/views/comercial/DocumentosView.vue'), meta: { permiso: 'ventas.venta.ver', titulo: 'Ventas', tipo: 'VENTA' } },
      { path: 'ventas/nueva', name: 'ventas-nueva', component: () => import('@/views/comercial/DocumentoFormView.vue'), meta: { permiso: 'ventas.venta.crear', titulo: 'Nueva', tipo: 'VENTA' } },
      { path: 'ventas/:id/editar', name: 'ventas-editar', component: () => import('@/views/comercial/DocumentoFormView.vue'), meta: { permiso: 'ventas.venta.crear', titulo: 'Editar', tipo: 'VENTA' } },
      { path: 'ventas/:id', name: 'ventas-detalle', component: () => import('@/views/comercial/DocumentoDetalleView.vue'), meta: { permiso: 'ventas.venta.ver', titulo: 'Ventas', tipo: 'VENTA' } },
      { path: 'productos', name: 'productos', component: () => import('@/views/kardex/ProductosView.vue'), meta: { permiso: 'productos.producto.ver', titulo: 'Productos' } },
      { path: 'empresas', name: 'empresas', component: () => import('@/views/operacion/EmpresasView.vue'), meta: { permiso: 'empresas.empresa.ver', titulo: 'Empresas' } },
      { path: 'sedes', name: 'sedes', component: () => import('@/views/operacion/SedesView.vue'), meta: { permiso: 'sedes.sede.ver', titulo: 'Sedes' } },
      { path: 'almacenes', name: 'almacenes', component: () => import('@/views/operacion/AlmacenesView.vue'), meta: { permiso: 'almacenes.almacen.ver', titulo: 'Almacenes' } },
      { path: 'usuarios', name: 'usuarios', component: () => import('@/views/admin/UsuariosView.vue'), meta: { permiso: 'usuarios.usuario.ver', titulo: 'Usuarios' } },
      { path: 'usuarios/:id', name: 'usuario', component: () => import('@/views/admin/UsuarioDetalleView.vue'), meta: { permiso: 'usuarios.usuario.ver', titulo: 'Usuario' } },
      { path: 'roles', name: 'roles', component: () => import('@/views/admin/RolesView.vue'), meta: { permiso: 'usuarios.roles.ver', titulo: 'Roles y permisos' } },
      { path: 'roles/nuevo', name: 'rol-nuevo', component: () => import('@/views/admin/RolEditorView.vue'), meta: { permiso: 'usuarios.roles.gestionar', titulo: 'Nuevo rol' } },
      { path: 'roles/:id', name: 'rol', component: () => import('@/views/admin/RolEditorView.vue'), meta: { permiso: 'usuarios.roles.ver', titulo: 'Rol' } },
      { path: 'auditoria', name: 'auditoria', component: () => import('@/views/admin/AuditoriaView.vue'), meta: { permiso: 'auditoria.ver', titulo: 'Auditoría' } },
      { path: 'perfil', name: 'perfil', component: () => import('@/views/PerfilView.vue'), meta: { titulo: 'Mi perfil' } },
      { path: 'sin-acceso', name: 'sin-acceso', component: () => import('@/views/SinAccesoView.vue') },
    ],
  },
  // ── Plataforma SaaS (Módulo C): sesión y layout propios, separados de los estudios ──
  { path: '/plataforma/login', name: 'plataforma-login', component: () => import('@/views/plataforma/PlataformaLoginView.vue'), meta: { plataforma: true, publica: true, titulo: 'Plataforma' } },
  {
    path: '/plataforma',
    component: () => import('@/layouts/PlataformaLayout.vue'),
    meta: { plataforma: true },
    children: [
      { path: '', name: 'plataforma', component: () => import('@/views/plataforma/MonitoreoView.vue'), meta: { titulo: 'Monitoreo' } },
      { path: 'estudios', name: 'plataforma-estudios', component: () => import('@/views/plataforma/EstudiosView.vue'), meta: { titulo: 'Estudios' } },
      { path: 'estudios/:id', name: 'plataforma-estudio', component: () => import('@/views/plataforma/EstudioDetalleView.vue'), meta: { titulo: 'Estudio' } },
      { path: 'planes', name: 'plataforma-planes', component: () => import('@/views/plataforma/PlanesView.vue'), meta: { titulo: 'Planes' } },
      { path: 'facturacion', name: 'plataforma-facturacion', component: () => import('@/views/plataforma/FacturacionView.vue'), meta: { titulo: 'Facturación' } },
      { path: 'auditoria', name: 'plataforma-auditoria', component: () => import('@/views/plataforma/AuditoriaPlataformaView.vue'), meta: { titulo: 'Auditoría de plataforma' } },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach(async (to) => {
  // Rutas de plataforma: se validan SOLO con la sesión de plataforma
  if (to.matched.some((r) => r.meta.plataforma)) {
    const plataforma = usePlataforma();
    await plataforma.restaurar();
    if (!to.meta.publica && !plataforma.autenticado) return { name: 'plataforma-login', query: { redirect: to.fullPath } };
    if (to.name === 'plataforma-login' && plataforma.autenticado) return { name: 'plataforma' };
    return;
  }

  const auth = useAuth();
  await auth.restaurar();

  if (!to.meta.publica && !auth.autenticado) return { name: 'login', query: { redirect: to.fullPath } };
  if (to.meta.soloInvitado && auth.autenticado) return { name: 'inicio' };
  if (to.meta.permiso && !auth.canAlguno(to.meta.permiso)) return { name: 'sin-acceso' };
  if (to.meta.permisos && !to.meta.permisos.some((p) => auth.canAlguno(p))) return { name: 'sin-acceso' };
});

router.afterEach((to) => {
  const sufijo = to.matched.some((r) => r.meta.plataforma) ? 'Kardex Plataforma' : 'Kardex';
  document.title = to.meta.titulo ? `${to.meta.titulo} — ${sufijo}` : 'Kardex — Estudio Contable';
});

export default router;
