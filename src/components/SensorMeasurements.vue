<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { measureNoise } from "../services/noise";
import { measureMotion } from "../services/motion";
import { measureLight } from "../services/light";
import type { SensorData } from "../types/sensors";
const model = defineModel<SensorData>({ required: true });
const emit = defineEmits<{ busy: [value: boolean] }>();
const active = ref("");
const error = ref("");
let controller: AbortController | undefined;
async function record(kind: "noise" | "motion" | "light") {
  if (active.value) return;
  error.value = "";
  active.value = kind;
  emit("busy", true);
  controller = new AbortController();
  try {
    if (kind === "noise")
      model.value = {
        ...model.value,
        noise: await measureNoise(controller.signal),
      };
    if (kind === "motion")
      model.value = {
        ...model.value,
        motion: await measureMotion(controller.signal),
      };
    if (kind === "light")
      model.value = {
        ...model.value,
        light: await measureLight(controller.signal),
      };
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? cause.message
        : "Measurement unavailable or permission denied.";
  } finally {
    active.value = "";
    emit("busy", false);
  }
}
const visibility = () => {
  if (document.hidden) controller?.abort();
};
onMounted(() => document.addEventListener("visibilitychange", visibility));
onBeforeUnmount(() => {
  controller?.abort();
  document.removeEventListener("visibilitychange", visibility);
});
</script>
<template>
  <section class="optional-section" aria-labelledby="sensors-heading">
    <h2 id="sensors-heading">
      Measurements <span class="optional">(optional)</span>
    </h2>
    <p class="small">
      Noise uses the microphone for 10 seconds. Only relative average and peak
      levels are kept, never audio. These are not calibrated decibels.
    </p>
    <button
      type="button"
      class="secondary"
      :disabled="!!active"
      @click="record('noise')"
    >
      Measure noise
    </button>
    <p v-if="model.noise">
      Relative average: {{ model.noise.averageLevel.toFixed(3) }} · Peak:
      {{ model.noise.peakLevel.toFixed(3) }} ·
      {{ model.noise.duration.toFixed(1) }} s
      <button
        type="button"
        class="secondary"
        @click="model = { ...model, noise: undefined }"
      >
        Remove noise
      </button>
    </p>
    <p class="small">
      Motion records raw acceleration, rotation, and orientation for 10 seconds.
      It does not determine wheelchair accessibility.
    </p>
    <button
      type="button"
      class="secondary"
      :disabled="!!active"
      @click="record('motion')"
    >
      Record motion
    </button>
    <p v-if="model.motion?.length">
      {{ model.motion.length }} raw motion samples
      <button
        type="button"
        class="secondary"
        @click="model = { ...model, motion: undefined }"
      >
        Remove motion
      </button>
    </p>
    <p class="small">
      Ambient light is available only on some devices; it takes 5 seconds.
    </p>
    <button
      type="button"
      class="secondary"
      :disabled="!!active"
      @click="record('light')"
    >
      Measure light
    </button>
    <p v-if="model.light?.length">
      {{ model.light.length }} light readings
      <button
        type="button"
        class="secondary"
        @click="model = { ...model, light: undefined }"
      >
        Remove light
      </button>
    </p>
    <p v-if="active" role="status">
      {{ active }} measurement in progress…
      <button type="button" class="secondary" @click="controller?.abort()">
        Cancel measurement
      </button>
    </p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </section>
</template>
