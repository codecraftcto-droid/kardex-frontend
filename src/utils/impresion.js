/**
 * Hoja de impresión de la página: A4 o rollo térmico de 80 mm.
 * CSS no acepta `size: 80mm auto` (el navegador lo descarta y cae en A4), así que el ticket
 * se mide ya dibujado y la hoja se fija en 80 mm × su alto, justo antes de cada impresión.
 * Devuelve la función que retira la hoja al salir de la vista.
 */
export function usarHojaImpresion(ticket, margenA4 = '12mm') {
  const estilo = document.createElement('style');
  const fondo = 'body { background: #fff !important }';
  const ajustar = () => {
    if (!ticket) {
      estilo.textContent = `@page { size: A4; margin: ${margenA4} } ${fondo}`;
      return;
    }
    const el = document.querySelector('.ticket');
    const altoMm = el ? Math.ceil((el.getBoundingClientRect().height * 25.4) / 96) + 4 : 200;
    // Chrome puede maquetar la impresión más ancha que la hoja: el documento se fija a 80 mm
    // y el ticket va pegado al borde, para que no quede centrado en un ancho mayor y se corte
    estilo.textContent = `@page { size: 80mm ${altoMm}mm; margin: 0 } ${fondo}
      @media print { html, body { width: 80mm !important; min-width: 0 !important; margin: 0 !important; padding: 0 !important; overflow: hidden }
      .ticket { margin: 0 !important; width: 80mm !important; } }`;
  };
  ajustar();
  document.head.appendChild(estilo);
  window.addEventListener('beforeprint', ajustar);
  return () => {
    window.removeEventListener('beforeprint', ajustar);
    estilo.remove();
  };
}
