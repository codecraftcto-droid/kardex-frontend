import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api, descargar, mensajeError } from '@/services/api';
import { useToast } from './toast';

/**
 * Exportaciones de reportes en segundo plano. El backend las encola y avisa por
 * Socket.io (progreso / listo / error). Si la pestaña que la pidió sigue abierta,
 * la descarga empieza sola al terminar.
 */
export const useExportaciones = defineStore('exportaciones', () => {
  const lista = ref([]);
  const pedidasAqui = new Set();

  async function cargar() {
    lista.value = (await api.get('/reportes/exportaciones')).data;
  }

  async function solicitar(tipo, formato, parametros) {
    const toast = useToast();
    try {
      const { data } = await api.post('/reportes/exportaciones', { tipo, formato, parametros });
      pedidasAqui.add(data.id);
      toast.info('Generando el reporte… puede seguir trabajando, le avisaremos al terminar');
      await cargar();
      return data.id;
    } catch (e) {
      toast.error(mensajeError(e, 'No se pudo solicitar la exportación'));
      return null;
    }
  }

  function actualizar(id, cambios) {
    const item = lista.value.find((x) => x.id === id);
    if (item) Object.assign(item, cambios);
    else cargar();
  }

  async function bajar(item) {
    try {
      await descargar(`/reportes/exportaciones/${item.id}/archivo`, {}, item.nombreArchivo);
    } catch (e) {
      useToast().error(mensajeError(e, 'No se pudo descargar'));
      cargar();
    }
  }

  // ── Eventos de tiempo real (registrados en AppLayout) ──
  const alProgreso = (d) => actualizar(d.id, { estado: d.estado, progreso: d.progreso, filas: d.filas ?? null });
  async function alListo(d) {
    await cargar();
    const item = lista.value.find((x) => x.id === d.id);
    if (pedidasAqui.has(d.id) && item) {
      pedidasAqui.delete(d.id);
      useToast().exito(`Reporte listo: ${d.titulo} (${d.filas.toLocaleString('es-PE')} filas). Descargando…`);
      bajar(item);
    } else {
      useToast().exito(`Reporte listo: ${d.titulo}. Descárguelo en Reportes → Mis exportaciones`);
    }
  }
  function alError(d) {
    pedidasAqui.delete(d.id);
    actualizar(d.id, { estado: 'ERROR', error: d.error });
    useToast().error(`No se pudo generar el reporte: ${d.error}`);
  }

  return { lista, cargar, solicitar, bajar, alProgreso, alListo, alError };
});
