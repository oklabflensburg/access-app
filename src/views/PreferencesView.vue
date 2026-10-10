<script setup lang="ts">
import { onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Select from "primevue/select";
import { usePreferencesStore } from "../stores/preferences";
import type { MapFeatureType } from "../types/map-feature";
import {
  featurePriorities,
  routeSettingFeatureTypes,
  type FeaturePriority,
  type FeaturePrioritySettings,
} from "../types/preferences";

const { t } = useI18n();
const router = useRouter();
const preferences = usePreferencesStore();
onMounted(() => void preferences.load());

const options = featurePriorities.map((priority) => ({
  label: t(`preferences.priorities.${priority}`),
  value: priority,
}));

function close() {
  void router.push({ name: "map" });
}

function update(type: MapFeatureType, priority: FeaturePriority) {
  const settings: FeaturePrioritySettings = {
    ...preferences.featurePriorities,
    [type]: priority,
  };
  void preferences.save(settings);
}
</script>

<template>
  <Dialog
    modal
    dismissable-mask
    :visible="true"
    class="list-dialog preferences-dialog"
    aria-labelledby="preferences-dialog-title"
    @update:visible="close"
  >
    <template #header>
      <h1 id="preferences-dialog-title" class="dialog-title">{{ t("preferences.title") }}</h1>
    </template>
    <Message v-if="preferences.error" severity="error" role="alert">
      {{ preferences.error }}
    </Message>
    <p class="small">{{ t("preferences.priorityHint") }}</p>
    <div
      v-for="type in routeSettingFeatureTypes"
      :key="type"
      class="preference-field"
    >
      <label :for="`priority-${type}`">{{ t(`map.featureTypes.${type}`) }}</label>
      <Select
        :id="`priority-${type}`"
        :model-value="preferences.featurePriorities[type]"
        :options="options"
        option-label="label"
        option-value="value"
        :disabled="preferences.saving"
        :aria-label="t(`map.featureTypes.${type}`)"
        @update:model-value="(priority: FeaturePriority) => update(type, priority)"
      />
    </div>
    <p class="small">{{ t("preferences.saveHint") }}</p>
  </Dialog>
</template>

<style scoped>
.preference-field {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  padding: 12px 16px;
  border: 1px solid #dce4dc;
  border-radius: 12px;
  background: #fff;
}
.preference-field label {
  font-weight: 600;
}
</style>
