<script setup>
import { onMounted, ref } from 'vue';
import { api } from '@/services/api';

/** Plan contratado por el estudio y su consumo (solo para administradores del estudio). */
const datos = ref(null);
onMounted(async () => (datos.value = (await api.get('/me/plan')).data));
const nombres = { empresas: 'Empresas', usuarios: 'Usuarios', almacenes: 'Almacenes' };
const pct = (u) => (u.maximo ? Math.min(100, Math.round((u.usados / u.maximo) * 100)) : 0);
</script>

<template>
  <section v-if="datos" class="tarjeta p-4 sm:p-5 lg:col-span-2">
    <h2 class="font-semibold">Plan del estudio: {{ datos.plan?.nombre ?? 'sin plan asignado' }}</h2>
    <p class="mb-3 text-sm text-slate-500">Para ampliar los límites, contacte a su proveedor del servicio.</p>
    <div class="grid gap-4 sm:grid-cols-3">
      <div v-for="(u, k) in datos.uso" :key="k">
        <div class="mb-1 flex justify-between text-sm">
          <span>{{ nombres[k] }}</span>
          <span class="tabular-nums" :class="u.maximo && u.usados >= u.maximo ? 'font-semibold text-red-600' : 'text-slate-600'">{{ u.usados }} / {{ u.maximo ?? '∞' }}</span>
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-slate-100">
          <div class="h-full rounded-full" :class="pct(u) >= 100 ? 'bg-red-500' : pct(u) >= 80 ? 'bg-amber-500' : 'bg-marca-600'" :style="{ width: `${u.maximo ? pct(u) : 4}%` }" />
        </div>
      </div>
    </div>
  </section>
</template>
