/** Avance de un registro SIRE (RVIE / RCE) en un período */
export const ESTADOS_SIRE = {
  PENDIENTE: { texto: 'Pendiente', clase: 'bg-slate-100 text-slate-600', punto: 'bg-slate-400' },
  PROPUESTA: { texto: 'Propuesta descargada', clase: 'bg-sky-50 text-sky-700', punto: 'bg-sky-500' },
  CON_DIFERENCIAS: { texto: 'Con diferencias', clase: 'bg-amber-50 text-amber-800', punto: 'bg-amber-500' },
  CONCILIADO: { texto: 'Conciliado', clase: 'bg-indigo-50 text-indigo-700', punto: 'bg-indigo-500' },
  GENERADO: { texto: 'Generado', clase: 'bg-emerald-50 text-emerald-700', punto: 'bg-emerald-500' },
};

/** Texto y color del plazo: vencido, por vencer (≤ 5 días) o con holgura */
export function plazo(dias) {
  if (dias == null) return null;
  if (dias < 0) return { texto: `Vencido hace ${-dias} día${dias === -1 ? '' : 's'}`, clase: 'bg-red-50 text-red-700' };
  if (dias === 0) return { texto: 'Vence hoy', clase: 'bg-red-50 text-red-700' };
  if (dias <= 5) return { texto: `Vence en ${dias} día${dias === 1 ? '' : 's'}`, clase: 'bg-amber-50 text-amber-800' };
  return { texto: `En ${dias} días`, clase: 'bg-slate-100 text-slate-600' };
}

export const REGISTROS_SIRE = {
  RVIE: { nombre: 'Registro de Ventas e Ingresos', corto: 'Ventas (RVIE)' },
  RCE: { nombre: 'Registro de Compras', corto: 'Compras (RCE)' },
};

/** Tipos de diferencia al conciliar, con lo que conviene hacer en cada caso */
export const TIPOS_DIFERENCIA = {
  SOLO_SUNAT: { texto: 'Solo en SUNAT', clase: 'bg-sky-50 text-sky-700', ayuda: 'SUNAT lo tiene y el sistema no. Si corresponde a la empresa, acéptelo.' },
  SOLO_SISTEMA: { texto: 'Falta en SUNAT', clase: 'bg-red-50 text-red-700', ayuda: 'Está registrado en el sistema pero SUNAT no lo tiene.' },
  MONTO: { texto: 'Monto distinto', clase: 'bg-amber-50 text-amber-800', ayuda: 'El total o el IGV no coinciden. La propuesta lleva el monto de SUNAT.' },
  ESTADO: { texto: 'Anulado en un lado', clase: 'bg-violet-50 text-violet-700', ayuda: 'Anulado en uno y vigente en el otro: revise la comunicación de baja.' },
};

export const RESOLUCIONES = {
  PENDIENTE: { texto: 'Por resolver', clase: 'bg-amber-50 text-amber-800' },
  ACEPTADA: { texto: 'Aceptado SUNAT', clase: 'bg-emerald-50 text-emerald-700' },
  JUSTIFICADA: { texto: 'Justificado', clase: 'bg-indigo-50 text-indigo-700' },
  INCLUIDA: { texto: 'Incluido', clase: 'bg-emerald-50 text-emerald-700' },
  EXCLUIDA: { texto: 'Excluido', clase: 'bg-slate-100 text-slate-700' },
};
