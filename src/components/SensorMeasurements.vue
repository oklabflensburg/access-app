<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { measureNoise } from "../services/noise";
import { measureMotion } from "../services/motion";
import { measureLight } from "../services/light";
import type { SensorData } from "../types/sensors";
import { useI18n } from "vue-i18n";
const model = defineModel<SensorData>({ required: true });
const emit = defineEmits<{ busy: [value: boolean] }>();
const { t } = useI18n();
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
        : t("observation.measurementError");
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
      {{ t("observation.measurements") }} <span class="optional">({{ t("observation.optional") }})</span>
    </h2>
    <button
      type="button"
      class="secondary"
      :disabled="!!active"
      @click="record('noise')"
    >
      {{ t("observation.noise") }}
    </button>
    <p v-if="model.noise">
      {{ t("observation.noiseValue", { average: model.noise.averageLevel.toFixed(3), peak: model.noise.peakLevel.toFixed(3) }) }}
      <button
        type="button"
        class="secondary"
        @click="model = { ...model, noise: undefined }"
      >
        {{ t("observation.removeNoise") }}
      </button>
    </p>
    <button
      type="button"
      class="secondary"
      :disabled="!!active"
      @click="record('motion')"
    >
      {{ t("observation.motion") }}
    </button>
    <p v-if="model.motion?.length">
      {{ t("observation.motionValue", { count: model.motion.length }) }}
      <button
        type="button"
        class="secondary"
        @click="model = { ...model, motion: undefined }"
      >
        {{ t("observation.removeMotion") }}
      </button>
    </p>
    <button
      type="button"
      class="secondary"
      :disabled="!!active"
      @click="record('light')"
    >
      {{ t("observation.light") }}
    </button>
    <p v-if="model.light?.length">
      {{ t("observation.lightValue", { count: model.light.length }) }}
      <button
        type="button"
        class="secondary"
        @click="model = { ...model, light: undefined }"
      >
        {{ t("observation.removeLight") }}
      </button>
    </p>
    <p v-if="active" role="status">
      {{ t("observation.measuring", { kind: active }) }}
      <button type="button" class="secondary" @click="controller?.abort()">
        {{ t("observation.cancel") }}
      </button>
    </p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </section>
</template>
