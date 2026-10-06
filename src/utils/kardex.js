export const MOTIVOS = {
  COMPRA: 'Compra',
  DEVOLUCION_CLIENTE: 'Devolución de cliente',
  AJUSTE_POSITIVO: 'Ajuste positivo',
  VENTA: 'Venta',
  MERMA: 'Merma',
  AJUSTE_NEGATIVO: 'Ajuste negativo',
  ANULACION: 'Anulación',
  TRANSFERENCIA_SALIDA: 'Transferencia (salida)',
  TRANSFERENCIA_ENTRADA: 'Transferencia (entrada)',
};

export const ESTADOS_TRANSFERENCIA = {
  SOLICITADA: { texto: 'Solicitada', clase: 'bg-sky-50 text-sky-700' },
  APROBADA: { texto: 'Aprobada', clase: 'bg-indigo-50 text-indigo-700' },
  DESPACHADA: { texto: 'En tránsito', clase: 'bg-amber-50 text-amber-700' },
  RECIBIDA: { texto: 'Recibida', clase: 'bg-emerald-50 text-emerald-700' },
  RECHAZADA: { texto: 'Rechazada', clase: 'bg-red-50 text-red-700' },
  CANCELADA: { texto: 'Cancelada', clase: 'bg-slate-100 text-slate-600' },
};
export const MOTIVOS_POR_TIPO = {
  ENTRADA: ['COMPRA', 'DEVOLUCION_CLIENTE', 'AJUSTE_POSITIVO'],
  SALIDA: ['VENTA', 'MERMA', 'AJUSTE_NEGATIVO'],
};
export const TIPOS_DOCUMENTO = ['FACTURA', 'BOLETA', 'GUÍA DE REMISIÓN', 'NOTA DE CRÉDITO', 'NOTA DE DÉBITO', 'INTERNO'];

export const estiloTipo = (tipo) => (tipo === 'ENTRADA' ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700');

/** Estado del stock respecto a sus límites. */
export function estadoStock(s) {
  const c = Number(s.cantidad);
  if (s.stockMinimo != null && c < Number(s.stockMinimo)) return { texto: 'Bajo mínimo', clase: 'bg-red-50 text-red-700' };
  if (s.stockMaximo != null && c > Number(s.stockMaximo)) return { texto: 'Sobre máximo', clase: 'bg-amber-50 text-amber-700' };
  if (c === 0) return { texto: 'Sin stock', clase: 'bg-slate-100 text-slate-600' };
  return { texto: 'Normal', clase: 'bg-emerald-50 text-emerald-700' };
}

/** Columnas elegibles del kardex (cada una se repite en Entradas, Salidas y Saldo). */
export const columnasKardex = (costos) => [
  { clave: 'movimiento', titulo: 'Fecha y movimiento' },
  { clave: 'detalle', titulo: 'Motivo y documento' },
  ...(costos ? [{ clave: 'cunit', titulo: 'Costo unitario' }, { clave: 'total', titulo: 'Costo total' }] : []),
];
