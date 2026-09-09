<script setup lang="ts">
import type { AccessibilityData } from "../types/observation";
const model = defineModel<AccessibilityData>({ required: true });
const questions = [
  { key: "wheelchairAccessible", label: "Wheelchair accessible?" },
  { key: "ramp", label: "Ramp available?" },
  { key: "accessibleToilet", label: "Accessible toilet?" },
  { key: "elevator", label: "Elevator available?" },
] as const;
const answers = [
  { label: "Yes", value: true },
  { label: "No", value: false },
  { label: "Unknown", value: null },
];
</script>

<template>
  <fieldset v-for="question in questions" :key="question.key">
    <legend>{{ question.label }}</legend>
    <div class="choices">
      <label v-for="answer in answers" :key="answer.label" class="choice">
        <input
          v-model="model[question.key]"
          type="radio"
          :name="question.key"
          :value="answer.value"
        />{{ answer.label }}
      </label>
    </div>
  </fieldset>
  <fieldset>
    <legend>Steps at entrance?</legend>
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
        />Unknown</label
      >
    </div>
  </fieldset>
  <div class="field">
    <label for="surface">Surface</label>
    <select id="surface" v-model="model.surface">
      <option :value="null">Unknown</option>
      <option value="smooth">Smooth</option>
      <option value="uneven">Uneven</option>
      <option value="cobblestone">Cobblestone</option>
      <option value="gravel">Gravel</option>
      <option value="other">Other</option>
    </select>
  </div>
</template>
