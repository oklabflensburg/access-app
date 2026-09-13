<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { measureNoise } from "../services/noise";
import { measureMotion } from "../services/motion";
import { measureLight } from "../services/light";
import type { SensorData } from "../types/sensors";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import Message from "primevue/message";
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
    <Button
      type="button"
      outlined
      :disabled="!!active"
      @click="record('noise')"
      :label="t('observation.noise')"
    />
    <p v-if="model.noise">
      {{ t("observation.noiseValue", { average: model.noise.averageLevel.toFixed(3), peak: model.noise.peakLevel.toFixed(3) }) }}
      <Button
        type="button"
        outlined
        @click="model = { ...model, noise: undefined }"
        :label="t('observation.removeNoise')"
      />
    </p>
    <Button
      type="button"
      outlined
      :disabled="!!active"
      @click="record('motion')"
      :label="t('observation.motion')"
    />
    <p v-if="model.motion?.length">
      {{ t("observation.motionValue", { count: model.motion.length }) }}
      <Button
        type="button"
        outlined
        @click="model = { ...model, motion: undefined }"
        :label="t('observation.removeMotion')"
      />
    </p>
    <Button
      type="button"
      outlined
      :disabled="!!active"
      @click="record('light')"
      :label="t('observation.light')"
    />
    <p v-if="model.light?.length">
      {{ t("observation.lightValue", { count: model.light.length }) }}
      <Button
        type="button"
        outlined
        @click="model = { ...model, light: undefined }"
        :label="t('observation.removeLight')"
      />
    </p>
    <p v-if="active" role="status">
      {{ t("observation.measuring", { kind: active }) }}
      <Button type="button" outlined @click="controller?.abort()" :label="t('observation.cancel')" />
    </p>
    <Message v-if="error" severity="error" role="alert">{{ error }}</Message>
  </section>
</template>
