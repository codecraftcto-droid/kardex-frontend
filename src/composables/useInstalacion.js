import { ref } from 'vue';

/**
 * Instalación como PWA. El navegador emite `beforeinstallprompt` una sola vez y muy
 * temprano, por eso se captura al cargar el módulo (importado desde main.js).
 */
const evento = ref(null);
const instalada = ref(window.matchMedia?.('(display-mode: standalone)').matches ?? false);

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  evento.value = e;
});
window.addEventListener('appinstalled', () => {
  instalada.value = true;
  evento.value = null;
});

export function useInstalacion() {
  async function instalar() {
    if (!evento.value) return;
    evento.value.prompt();
    await evento.value.userChoice;
    evento.value = null;
  }
  return { disponible: evento, instalada, instalar };
}
