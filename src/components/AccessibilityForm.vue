<script setup lang="ts">
import type { AccessibilityData } from "../types/observation";
import { useI18n } from "vue-i18n";
import RadioButton from "primevue/radiobutton";
import Select from "primevue/select";
const model = defineModel<AccessibilityData>({ required: true });
const { t } = useI18n();
const groups = [
  {
    key: "overview",
    label: "observation.overall",
    questions: [{ key: "wheelchairAccessible", label: "observation.wheelchair" }],
  },
  {
    key: "entrance",
    label: "observation.entrance",
    questions: [{ key: "ramp", label: "observation.ramp" }],
  },
  {
    key: "facilities",
    label: "observation.facilities",
    questions: [
      { key: "elevator", label: "observation.elevator" },
      { key: "accessibleToilet", label: "observation.toilet" },
    ],
  },
] as const;
const answers = [
  { label: "observation.yes", value: true },
  { label: "observation.no", value: false },
  { label: "observation.unknown", value: null },
];
</script>

<template>
  <section
    v-for="group in groups"
    :key="group.key"
    class="accessibility-group"
    :class="`accessibility-${group.key}`"
    :aria-labelledby="`accessibility-${group.key}-heading`"
  >
    <h3 :id="`accessibility-${group.key}-heading`">{{ t(group.label) }}</h3>
    <fieldset v-for="question in group.questions" :key="question.key">
      <legend>{{ t(question.label) }}</legend>
      <div class="choices" role="radiogroup" :aria-label="t(question.label)">
        <label v-for="answer in answers" :key="answer.label" class="choice">
          <RadioButton v-model="model[question.key]" :name="question.key" :value="answer.value" />
          <span>{{ t(answer.label) }}</span>
        </label>
      </div>
    </fieldset>
    <template v-if="group.key === 'entrance'">
      <fieldset>
        <legend>{{ t("observation.steps") }}</legend>
        <div class="choices wrap" role="radiogroup" :aria-label="t('observation.steps')">
          <label v-for="step in [0, 1, 2, 3] as const" :key="step" class="choice">
            <RadioButton v-model="model.steps" name="steps" :value="step" />
            <span>{{ step === 3 ? "3+" : step }}</span>
          </label>
          <label class="choice">
            <RadioButton v-model="model.steps" name="steps" :value="null" />
            <span>{{ t("observation.unknown") }}</span>
          </label>
        </div>
      </fieldset>
      <div class="field surface-field">
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
  </section>
</template>
