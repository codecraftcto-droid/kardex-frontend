/** Catálogos y formato del punto de venta. */
export const TIPOS_COMPROBANTE = {
  BOLETA: { texto: 'Boleta', largo: 'Boleta de venta electrónica' },
  FACTURA: { texto: 'Factura', largo: 'Factura electrónica' },
  NOTA_VENTA: { texto: 'Nota de venta', largo: 'Nota de venta' },
  NOTA_CREDITO: { texto: 'Nota de crédito', largo: 'Nota de crédito electrónica' },
};
export const TIPOS_DOCUMENTO = {
  DNI: 'DNI',
  RUC: 'RUC',
  CARNE_EXTRANJERIA: 'Carné de extranjería',
  PASAPORTE: 'Pasaporte',
  SIN_DOCUMENTO: 'Sin documento',
};
export const MEDIOS_PAGO = {
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
  YAPE: 'Yape',
  PLIN: 'Plin',
  TRANSFERENCIA: 'Transferencia',
  OTRO: 'Otro',
};
export const MOTIVOS_NC = {
  '01': 'Anulación de la operación',
  '06': 'Devolución total',
  '07': 'Devolución por ítem',
};
export const AFECTACION_IGV = { 10: 'Gravado', 20: 'Exonerado', 30: 'Inafecto' };

/** Debe coincidir con el backend (BOLETA_UMBRAL_IDENTIFICACION). */
export const UMBRAL_BOLETA = 700;
export const IGV = 0.18;

export const numeroCompleto = (c) => `${c.serie}-${String(c.numero).padStart(8, '0')}`;
export const FORMAS_PAGO = { CONTADO: 'Contado', CREDITO: 'Crédito' };
export const estiloEstado = (c) => (c.estado === 'ANULADO' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700');

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Descuento de una línea en soles (el cajero lo indica en S/ o en %). */
export function descuentoLinea(it) {
  const bruto = r2(Number(it.cantidad || 0) * Number(it.precio || 0));
  return it.tipoDescuento === '%' ? r2((bruto * Number(it.descuento || 0)) / 100) : r2(Number(it.descuento || 0));
}

/**
 * Mismo cálculo que el backend (precios con IGV) para mostrar los totales mientras se vende.
 * global: { tipo: 'MONTO' | 'PORCENTAJE', valor } se prorratea entre las líneas según su importe.
 * Devuelve además `rebaja`: el mayor % de rebaja frente al precio de lista (para el tope de la caja).
 */
export function totales(items, global = null) {
  const lineas = items.map((it) => {
    const bruto = r2(Number(it.cantidad || 0) * Number(it.precio || 0));
    return { it, bruto, desc: Math.min(bruto, descuentoLinea(it)) };
  });
  const neto = lineas.reduce((s, l) => s + l.bruto - l.desc, 0);
  let dGlobal = 0;
  if (global && Number(global.valor) > 0 && neto > 0) {
    dGlobal = Math.min(r2(neto), global.tipo === 'PORCENTAJE' ? r2((neto * Number(global.valor)) / 100) : r2(Number(global.valor)));
    let repartido = 0;
    let mayor = 0;
    lineas.forEach((l, i) => {
      l.parte = r2((dGlobal * (l.bruto - l.desc)) / neto);
      repartido += l.parte;
      if (l.bruto - l.desc > lineas[mayor].bruto - lineas[mayor].desc) mayor = i;
    });
    lineas[mayor].parte = r2(lineas[mayor].parte + dGlobal - repartido);
  }
  let gravada = 0, exonerada = 0, inafecta = 0, igv = 0, total = 0, descuento = 0, rebaja = 0;
  for (const l of lineas) {
    const d = l.desc + (l.parte || 0);
    const linea = r2(l.bruto - d);
    const af = l.it.producto.afectacionIgv ?? '10';
    const base = af === '10' ? r2(linea / (1 + IGV)) : linea;
    if (af === '10') gravada += base;
    else if (af === '20') exonerada += base;
    else inafecta += base;
    igv += linea - base;
    total += linea;
    descuento += d;
    const lista = r2(Number(l.it.cantidad || 0) * Number(l.it.producto.precioReferencial ?? l.it.precio ?? 0));
    if (lista > 0) rebaja = Math.max(rebaja, ((lista - linea) * 100) / lista);
    l.it.importe = linea;
  }
  return {
    gravada: r2(gravada), exonerada: r2(exonerada), inafecta: r2(inafecta), igv: r2(igv), total: r2(total), descuento: r2(descuento),
    descuentoGlobal: dGlobal, rebaja: r2(rebaja),
  };
}

/** Fecha de hoy en Perú (AAAA-MM-DD) y suma de días. */
export const hoyLima = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
export function sumarDias(iso, dias) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Cuotas iguales cada `dias` días; la última absorbe el redondeo (igual que el backend). */
export function cuotasIguales(monto, cantidad, dias) {
  const n = Math.max(1, Math.min(36, Number(cantidad) || 1));
  const base = Math.floor((monto / n) * 100) / 100;
  const hoy = hoyLima();
  return Array.from({ length: n }, (_, i) => ({
    monto: (i === n - 1 ? r2(monto - base * (n - 1)) : base).toFixed(2),
    fechaVencimiento: sumarDias(hoy, (Number(dias) || 30) * (i + 1)),
  }));
}

/** RUC 10 que corresponde a un DNI (10 + DNI + dígito verificador). */
export function rucDesdeDni(dni) {
  if (!/^\d{8}$/.test(dni)) return '';
  for (let d = 0; d <= 9; d += 1) if (rucValido(`10${dni}${d}`)) return `10${dni}${d}`;
  return '';
}

export const TRAMOS = { porVencer: 'Por vencer', d1_30: '1-30 días', d31_60: '31-60 días', d61_90: '61-90 días', d90: '+90 días' };

/** Valida el RUC con su dígito verificador (igual que el backend). */
export function rucValido(ruc) {
  if (!/^(10|15|16|17|20)\d{9}$/.test(ruc)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((s, p, i) => s + p * Number(ruc[i]), 0);
  const resto = 11 - (suma % 11);
  return (resto === 10 ? 0 : resto === 11 ? 1 : resto) === Number(ruc[10]);
}
