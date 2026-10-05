/** Configuración de compras y ventas (mismas pantallas, distinto tipo). */
export const DOCUMENTOS = {
  COMPRA: {
    ruta: '/compras', api: '/compras', singular: 'Compra', plural: 'Compras', articulo: 'la compra',
    tercero: 'Proveedor', permiso: 'compras.compra', evento: 'compra:cambio',
    comprobantes: ['FACTURA', 'BOLETA', 'GUÍA DE REMISIÓN', 'OTRO'],
    efecto: 'Al confirmar, los productos ingresan al almacén (entrada de kardex al costo de la compra).',
  },
  VENTA: {
    ruta: '/ventas', api: '/ventas', singular: 'Venta', plural: 'Ventas', articulo: 'la venta',
    tercero: 'Cliente', permiso: 'ventas.venta', evento: 'venta:cambio',
    comprobantes: ['FACTURA', 'BOLETA', 'NOTA DE VENTA', 'OTRO'],
    efecto: 'Al confirmar, los productos salen del almacén (salida de kardex al costo de inventario).',
  },
};

export const ESTADOS_DOCUMENTO = {
  BORRADOR: { texto: 'Borrador', clase: 'bg-slate-100 text-slate-700' },
  CONFIRMADO: { texto: 'Confirmado', clase: 'bg-emerald-50 text-emerald-700' },
  ANULADO: { texto: 'Anulado', clase: 'bg-red-50 text-red-700' },
};

/** Solo para mostrar totales mientras se edita; el backend recalcula y es la fuente oficial. */
export const IGV_TASA = 0.18;

export const monedaFmt = (v, moneda = 'PEN') =>
  v === null || v === undefined ? '—' : `${moneda === 'USD' ? 'US$' : 'S/'} ${Number(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
