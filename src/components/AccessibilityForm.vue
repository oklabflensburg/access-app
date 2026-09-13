<script setup lang="ts">
import type { AccessibilityData } from "../types/observation";
import { useI18n } from "vue-i18n";
const model = defineModel<AccessibilityData>({ required: true });
const { t } = useI18n();
const questions = [
  { key: "wheelchairAccessible", label: "observation.wheelchair" },
  { key: "ramp", label: "observation.ramp" },
  { key: "accessibleToilet", label: "observation.toilet" },
  { key: "elevator", label: "observation.elevator" },
] as const;
const answers = [
  { label: "observation.yes", value: true },
  { label: "observation.no", value: false },
  { label: "observation.unknown", value: null },
];
</script>

<template>
  <fieldset v-for="question in questions" :key="question.key">
    <legend>{{ t(question.label) }}</legend>
    <div class="choices">
      <label v-for="answer in answers" :key="answer.label" class="choice">
        <input
          v-model="model[question.key]"
          type="radio"
          :name="question.key"
          :value="answer.value"
        />{{ t(answer.label) }}
      </label>
    </div>
  </fieldset>
  <fieldset>
    <legend>{{ t("observation.steps") }}</legend>
    <div class="choices wrap">
      <label v-for="step in [0, 1, 2, 3] as const" :key="step" class="choice"
        ><input
          v-model="model.steps"
          type="radio"
          name="steps"
          :value="step"
        />{{ step === 3 ? "3+" : step }}</label
      >
      <label class="choice"
        ><input
          v-model="model.steps"
          type="radio"
          name="steps"
          :value="null"
        />{{ t("observation.unknown") }}</label
      >
    </div>
  </fieldset>
  <div class="field">
    <label for="surface">{{ t("observation.surface") }}</label>
    <select id="surface" v-model="model.surface">
      <option :value="null">{{ t("observation.unknown") }}</option>
      <option value="smooth">{{ t("observation.smooth") }}</option>
      <option value="uneven">{{ t("observation.uneven") }}</option>
      <option value="cobblestone">{{ t("observation.cobblestone") }}</option>
      <option value="gravel">{{ t("observation.gravel") }}</option>
      <option value="other">{{ t("observation.other") }}</option>
    </select>
  </div>
</template>
