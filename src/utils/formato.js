const LOCALE = 'es-PE';

/** Número con separadores (acepta Decimal serializado como texto). */
export function num(v, decimales = 2) {
  if (v === null || v === undefined || v === '') return '—';
  return Number(v).toLocaleString(LOCALE, { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

/** Cantidad: sin decimales si es entera, hasta 4 si no. */
export function cant(v) {
  if (v === null || v === undefined || v === '') return '—';
  return Number(v).toLocaleString(LOCALE, { maximumFractionDigits: 4 });
}

export const soles = (v) => (v === null || v === undefined ? '—' : `S/ ${num(v, 2)}`);
/**
 * Las fechas sin hora (fecha de emisión, de documento) llegan como medianoche UTC:
 * se muestran en UTC para que en Perú (UTC−5) no aparezcan como el día anterior.
 */
const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}(T00:00:00(\.000)?Z)?$/;
export const fecha = (v) =>
  v ? new Date(v).toLocaleDateString(LOCALE, SOLO_FECHA.test(String(v)) ? { timeZone: 'UTC' } : undefined) : '—';
export const fechaHora = (v) =>
  v ? new Date(v).toLocaleString(LOCALE, { dateStyle: 'short', timeStyle: 'short' }) : '—';
