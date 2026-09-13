<script setup lang="ts">
import type { AccessibilityData } from "../types/observation";
import { useI18n } from "vue-i18n";
import RadioButton from "primevue/radiobutton";
import Select from "primevue/select";
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
    <div class="choices" role="radiogroup">
      <label v-for="answer in answers" :key="answer.label" class="choice">
        <RadioButton
          v-model="model[question.key]"
          :name="question.key"
          :value="answer.value"
        /> <span>{{ t(answer.label) }}</span>
      </label>
    </div>
  </fieldset>
  <fieldset>
    <legend>{{ t("observation.steps") }}</legend>
    <div class="choices wrap" role="radiogroup">
      <label v-for="step in [0, 1, 2, 3] as const" :key="step" class="choice"
        ><RadioButton
          v-model="model.steps"
          name="steps"
          :value="step"
        /> <span>{{ step === 3 ? "3+" : step }}</span></label
      >
      <label class="choice"
        ><RadioButton
          v-model="model.steps"
          name="steps"
          :value="null"
        /> <span>{{ t("observation.unknown") }}</span></label
      >
    </div>
  </fieldset>
  <div class="field">
    <label for="surface">{{ t("observation.surface") }}</label>
    <Select
      id="surface"
      v-model="model.surface"
      :options="[
        { label: t('observation.unknown'), value: null },
        { label: t('observation.smooth'), value: 'smooth' },
        { label: t('observation.uneven'), value: 'uneven' },
        { label: t('observation.cobblestone'), value: 'cobblestone' },
        { label: t('observation.gravel'), value: 'gravel' },
        { label: t('observation.other'), value: 'other' },
      ]"
      option-label="label"
      option-value="value"
    />
  </div>
</template>
