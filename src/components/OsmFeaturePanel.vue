<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { OsmFeature } from "../types/map-feature";

defineProps<{
  feature: OsmFeature;
}>();
const emit = defineEmits<{
  close: [];
  adopt: [];
  observe: [];
}>();
const { t } = useI18n();
</script>

<template>
  <form class="feature-panel" :aria-label="t('map.osmFeatureDetails')" @submit.prevent>
    <div class="feature-panel-heading">
      <strong>{{ feature.name || t(`map.featureTypes.${feature.type}`) }}</strong>
      <button
        type="button"
        class="feature-panel-close"
        :aria-label="t('map.closeOsmFeatureDetails')"
        @click="emit('close')"
      >
        <i class="pi pi-times" aria-hidden="true" />
      </button>
    </div>
    <p class="feature-readonly">{{ t("map.osmFeatureDetails") }}</p>
    <p class="feature-readonly">{{ t("map.osmFeatureHint") }}</p>
    <button type="button" class="primary" @click="emit('adopt')">
      {{ t("map.osmFeatureAdopt") }}
    </button>
    <button type="button" class="secondary" @click="emit('observe')">
      {{ t("map.osmFeatureObserve") }}
    </button>
  </form>
</template>
