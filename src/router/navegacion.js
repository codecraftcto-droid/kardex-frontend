import { PERMISOS_REPORTES } from '@/router';

/**
 * Navegación del sistema en un solo lugar. El menú lateral muestra ÁREAS; las pantallas de cada
 * área aparecen como pestañas sobre el contenido. Cada pantalla declara el permiso que la habilita
 * (permiso: uno exacto; permisos: basta con uno de la lista). periodo: la pantalla trabaja por mes
 * y muestra el selector de período de trabajo en la cabecera. Un área se ve si el usuario puede
 * abrir al menos una de sus pantallas, y su enlace lleva a la primera que puede abrir.
 */
const IMPORTAR = ['clientes.cliente.crear', 'productos.producto.crear', 'kardex.entrada.crear', 'contabilidad.asiento.registrar'];
const PLE = ['contabilidad.asiento.ver', 'contabilidad.plan.ver', 'kardex.costos.ver'];

export const SECCIONES = [
  {
    nombre: 'Operación',
    areas: [
      { id: 'inicio', etiqueta: 'Inicio', icono: 'inicio', paginas: [{ to: '/', etiqueta: 'Inicio' }] },
      { id: 'caja', etiqueta: 'Caja', icono: 'caja', paginas: [{ to: '/pos', etiqueta: 'Caja', permiso: 'pos.venta.crear' }] },
      {
        id: 'ventas', etiqueta: 'Ventas', icono: 'comprobante',
        paginas: [
          { to: '/comprobantes', etiqueta: 'Comprobantes emitidos', permiso: 'pos.venta.ver' },
          { to: '/ventas', etiqueta: 'Ventas registradas', permiso: 'ventas.venta.ver' },
          { to: '/clientes', etiqueta: 'Clientes', permiso: 'clientes.cliente.ver' },
          { to: '/cuentas-por-cobrar', etiqueta: 'Cuentas por cobrar', permiso: 'cxc.cuenta.ver' },
        ],
      },
      { id: 'compras', etiqueta: 'Compras', icono: 'entrada', paginas: [{ to: '/compras', etiqueta: 'Compras', permiso: 'compras.compra.ver' }] },
      {
        id: 'inventario', etiqueta: 'Inventario', icono: 'inventario',
        paginas: [
          { to: '/inventario', etiqueta: 'Stock', permiso: 'kardex.stock.ver' },
          { to: '/movimientos', etiqueta: 'Movimientos', permiso: 'kardex.stock.ver' },
          { to: '/kardex', etiqueta: 'Kardex por producto', permiso: 'kardex.stock.ver' },
          { to: '/transferencias', etiqueta: 'Transferencias', permiso: 'transferencia.ver' },
          { to: '/guias', etiqueta: 'Guías de remisión', permiso: 'gre.guia.ver' },
          { to: '/productos', etiqueta: 'Productos', permiso: 'productos.producto.ver' },
        ],
      },
      { id: 'reportes', etiqueta: 'Reportes', icono: 'reportes', paginas: [{ to: '/reportes', etiqueta: 'Reportes', permisos: PERMISOS_REPORTES }] },
    ],
  },
  {
    nombre: 'Contabilidad y SUNAT',
    areas: [
      {
        id: 'contabilidad', etiqueta: 'Contabilidad', icono: 'kardex',
        paginas: [
          { to: '/contabilidad/asientos', etiqueta: 'Asientos', permiso: 'contabilidad.asiento.ver', periodo: true },
          { to: '/contabilidad/libros', etiqueta: 'Libros Diario y Mayor', permiso: 'contabilidad.asiento.ver', periodo: true },
          { to: '/contabilidad/estados', etiqueta: 'Estados financieros', permiso: 'contabilidad.estados.ver', periodo: true },
          { to: '/contabilidad/plan', etiqueta: 'Plan contable', permiso: 'contabilidad.plan.ver' },
        ],
      },
      {
        id: 'sunat', etiqueta: 'SUNAT', icono: 'calendario',
        paginas: [
          { to: '/sire/panel', etiqueta: 'Panel del estudio', permiso: 'sire.periodo.ver' },
          { to: '/sire', etiqueta: 'SIRE de la empresa', permiso: 'sire.periodo.ver' },
          { to: '/declaraciones', etiqueta: 'Declaraciones', permiso: 'declaraciones.pdt.ver', periodo: true },
          { to: '/ple', etiqueta: 'Libros PLE', permisos: PLE, periodo: true },
        ],
      },
    ],
  },
  {
    nombre: 'Administración',
    areas: [
      {
        id: 'configuracion', etiqueta: 'Configuración', icono: 'empresa',
        paginas: [
          { to: '/empresas', etiqueta: 'Empresas', permiso: 'empresas.empresa.ver' },
          { to: '/sedes', etiqueta: 'Sedes', permiso: 'sedes.sede.ver' },
          { to: '/almacenes', etiqueta: 'Almacenes', permiso: 'almacenes.almacen.ver' },
          { to: '/cajas', etiqueta: 'Cajas y series', permisos: ['pos.caja.configurar', 'pos.caja.ver'] },
          { to: '/importar', etiqueta: 'Importar datos', permisos: IMPORTAR },
        ],
      },
      {
        id: 'seguridad', etiqueta: 'Seguridad', icono: 'roles',
        paginas: [
          { to: '/usuarios', etiqueta: 'Usuarios', permiso: 'usuarios.usuario.ver' },
          { to: '/roles', etiqueta: 'Roles y permisos', permiso: 'usuarios.roles.ver' },
          { to: '/auditoria', etiqueta: 'Auditoría', permiso: 'auditoria.ver' },
        ],
      },
    ],
  },
];

/** Acciones rápidas (solo en el buscador Ctrl+K) */
export const ACCIONES = [
  { to: '/pos', etiqueta: 'Nueva venta en caja', icono: 'caja', permiso: 'pos.venta.crear', grupo: 'Acción' },
  { to: '/movimientos/entrada', etiqueta: 'Registrar entrada', icono: 'entrada', permiso: 'kardex.entrada.crear', grupo: 'Acción' },
  { to: '/movimientos/salida', etiqueta: 'Registrar salida', icono: 'salida', permiso: 'kardex.salida.crear', grupo: 'Acción' },
  { to: '/transferencias/nueva', etiqueta: 'Nueva transferencia', icono: 'transferencias', permiso: 'transferencia.solicitar', grupo: 'Acción' },
  { to: '/guias/nueva', etiqueta: 'Nueva guía de remisión', icono: 'transferencias', permiso: 'gre.guia.crear', grupo: 'Acción' },
  { to: '/compras/nueva', etiqueta: 'Registrar compra', icono: 'entrada', permiso: 'compras.compra.crear', grupo: 'Acción' },
  { to: '/perfil', etiqueta: 'Mi perfil y sesiones', icono: 'perfil', grupo: 'Cuenta' },
];

/** ¿El usuario puede abrir la pantalla? (can = auth.canAlguno) */
export const puedeVer = (p, can) => (!p.permiso || can(p.permiso)) && (!p.permisos || p.permisos.some((x) => can(x)));

/** Secciones y áreas visibles para el usuario, cada área con sus pantallas permitidas y su enlace */
export function navegacionVisible(can) {
  return SECCIONES.map((s) => ({
    ...s,
    areas: s.areas
      .map((a) => ({ ...a, paginas: a.paginas.filter((p) => puedeVer(p, can)) }))
      .filter((a) => a.paginas.length)
      .map((a) => ({ ...a, to: a.paginas[0].to })),
  })).filter((s) => s.areas.length);
}

/** Todas las rutas declaradas (para resolver cuál está activa: gana la más específica) */
export const TODAS = SECCIONES.flatMap((s) => s.areas.flatMap((a) => a.paginas.map((p) => ({ ...p, area: a.id }))));

/** La pantalla del menú que corresponde a una ruta (/comprobantes/123 → /comprobantes) */
export function paginaDe(path) {
  const coincide = (to) => (to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`));
  return TODAS.filter((p) => coincide(p.to)).sort((a, b) => b.to.length - a.to.length)[0] ?? null;
}
