/** Fechas en hora de Lima (el negocio opera en Perú, aunque el navegador esté en otra zona) */
const formato = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' });
/** Hoy en Lima, AAAA-MM-DD */
export const hoyLima = () => formato.format(new Date());
/** Mes en curso en Lima, AAAA-MM */
export const mesActualLima = () => hoyLima().slice(0, 7);
/** AAAAMM ⇄ AAAA-MM */
export const aMes = (periodo) => `${periodo.slice(0, 4)}-${periodo.slice(4)}`;
export const aPeriodo = (mes) => mes.replace('-', '');
