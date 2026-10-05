<script setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import Icono from './Icono.vue';

/**
 * Lector de código de barras con la cámara trasera del celular (EAN-13/8, UPC, Code 128/39, QR).
 * - continuo=false: lee un código y se cierra.
 * - continuo=true: sigue leyendo (ideal para registrar varios productos seguidos).
 * La cámara requiere contexto seguro: HTTPS o http://localhost.
 */
const props = defineProps({ abierto: Boolean, continuo: Boolean, titulo: { type: String, default: 'Escanear código' } });
const emit = defineEmits(['leido', 'cerrar']);

const video = ref(null);
const error = ref('');
const ultimo = ref('');
const linterna = ref(false);
const conLinterna = ref(false);
let controles = null;
let anterior = { codigo: '', hora: 0 };

const hints = new Map([
  [DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF, BarcodeFormat.QR_CODE,
  ]],
  [DecodeHintType.TRY_HARDER, true],
]);

function avisar() {
  navigator.vibrate?.(80);
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    osc.frequency.value = 1500;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch { /* sin audio */ }
}

async function iniciar() {
  error.value = '';
  ultimo.value = '';
  if (!window.isSecureContext) {
    error.value = 'La cámara solo funciona con HTTPS. En pruebas desde el celular use "npm run dev:movil".';
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    error.value = 'Este navegador no permite usar la cámara.';
    return;
  }
  try {
    const lector = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });
    controles = await lector.decodeFromConstraints(
      { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
      video.value,
      (resultado) => {
        if (!resultado) return;
        const codigo = resultado.getText();
        const ahora = Date.now();
        // Ignora lecturas repetidas del mismo código en menos de 1.5 s
        if (codigo === anterior.codigo && ahora - anterior.hora < 1500) return;
        anterior = { codigo, hora: ahora };
        ultimo.value = codigo;
        avisar();
        emit('leido', codigo);
        if (!props.continuo) cerrar();
      },
    );
    conLinterna.value = typeof controles.switchTorch === 'function';
  } catch (e) {
    error.value =
      e?.name === 'NotAllowedError'
        ? 'Permita el acceso a la cámara en la configuración del navegador.'
        : e?.name === 'NotFoundError'
          ? 'No se encontró una cámara en este dispositivo.'
          : 'No se pudo iniciar la cámara.';
  }
}

function detener() {
  controles?.stop();
  controles = null;
  linterna.value = false;
}

function cerrar() {
  detener();
  emit('cerrar');
}

async function alternarLinterna() {
  linterna.value = !linterna.value;
  await controles?.switchTorch?.(linterna.value);
}

watch(() => props.abierto, (v) => (v ? setTimeout(iniciar, 50) : detener()));
onBeforeUnmount(detener);
</script>

<template>
  <Teleport to="body">
    <div v-if="abierto" class="fixed inset-0 z-[55] flex flex-col bg-black" role="dialog" aria-modal="true" :aria-label="titulo">
      <header class="flex items-center justify-between gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 text-white">
        <h2 class="font-medium">{{ titulo }}</h2>
        <div class="flex gap-1">
          <button v-if="conLinterna" class="btn px-2 text-white hover:bg-white/10" :aria-pressed="linterna" aria-label="Linterna" @click="alternarLinterna">
            <Icono nombre="linterna" :clase="linterna ? 'size-6 text-amber-300' : 'size-6'" />
          </button>
          <button class="btn px-2 text-white hover:bg-white/10" aria-label="Cerrar escáner" @click="cerrar"><Icono nombre="cerrar" clase="size-6" /></button>
        </div>
      </header>

      <div class="relative flex-1 overflow-hidden">
        <video ref="video" class="absolute inset-0 size-full object-cover" playsinline muted />
        <!-- Marco de lectura -->
        <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div class="h-40 w-[80%] max-w-md rounded-xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
            <div class="mx-4 mt-[4.9rem] h-0.5 animate-pulse bg-red-500/80" />
          </div>
        </div>
        <p v-if="error" class="absolute inset-x-4 top-4 rounded-lg bg-red-600 px-3 py-2 text-sm text-white">{{ error }}</p>
      </div>

      <footer class="px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-sm text-white/80">
        <p v-if="ultimo" class="mb-2 font-mono text-base text-white">Leído: {{ ultimo }}</p>
        <p>Apunte al código de barras dentro del recuadro{{ continuo ? '; puede escanear varios seguidos' : '' }}.</p>
        <button v-if="continuo" class="btn-primario mt-3 w-full" @click="cerrar">Terminar</button>
      </footer>
    </div>
  </Teleport>
</template>
