import Swal from 'sweetalert2/dist/sweetalert2.esm.js';
import 'sweetalert2/dist/sweetalert2.min.css';

/**
 * Diálogos de confirmación (SweetAlert2) con el diseño del sistema: reemplazan al confirm()
 * del navegador. Los avisos breves ("guardado", "error") siguen siendo los toasts propios.
 */
const CLASES = {
  popup: 'dialogo',
  title: 'dialogo-titulo',
  htmlContainer: 'dialogo-texto',
  actions: 'dialogo-acciones',
  cancelButton: 'btn-secundario',
  confirmButton: 'btn-primario',
  input: 'input',
  validationMessage: 'dialogo-validacion',
};
const base = Swal.mixin({
  buttonsStyling: false,
  reverseButtons: true, // Cancelar a la izquierda, acción a la derecha (como los modales)
  showCancelButton: true,
  cancelButtonText: 'Cancelar',
  focusCancel: true,
  returnFocus: true,
  customClass: CLASES,
});

/**
 * ¿Confirma la acción? → true / false.
 * peligro: botón rojo y ícono de advertencia (eliminar, anular, suspender…).
 */
export async function confirmar({ titulo, texto = '', confirmar: textoConfirmar = 'Confirmar', peligro = false, icono } = {}) {
  const r = await base.fire({
    title: titulo,
    text: texto,
    icon: icono ?? (peligro ? 'warning' : 'question'),
    iconColor: peligro ? '#dc2626' : '#0f766e',
    confirmButtonText: textoConfirmar,
    customClass: { ...CLASES, confirmButton: peligro ? 'btn-peligro' : 'btn-primario' },
  });
  return r.isConfirmed;
}

/** Pide un texto (p. ej. un motivo). Devuelve el texto o null si cancela. */
export async function pedirTexto({ titulo, texto = '', etiqueta = '', valor = '', confirmar: textoConfirmar = 'Aceptar', minimo = 1 } = {}) {
  const r = await base.fire({
    title: titulo,
    text: texto,
    input: 'text',
    inputLabel: etiqueta,
    inputValue: valor,
    confirmButtonText: textoConfirmar,
    focusCancel: false,
    inputValidator: (v) => (String(v).trim().length < minimo ? `Escriba al menos ${minimo} caracteres` : undefined),
  });
  return r.isConfirmed ? String(r.value).trim() : null;
}
