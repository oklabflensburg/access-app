<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { OsmStepWay } from "../types/map-feature";

defineProps<{
  way: OsmStepWay;
}>();
const emit = defineEmits<{
  close: [];
  adopt: [];
  observe: [];
}>();
const { t } = useI18n();
</script>

<template>
  <form class="feature-panel" :aria-label="t('map.osmStepDetails')" @submit.prevent>
    <div class="feature-panel-heading">
      <strong>{{ way.name || t("map.featureTypes.staircase") }}</strong>
      <button
        type="button"
        class="feature-panel-close"
        :aria-label="t('map.closeOsmStepDetails')"
        @click="emit('close')"
      >
        <i class="pi pi-times" aria-hidden="true" />
      </button>
    </div>
    <p class="feature-readonly">{{ t("map.osmStepDetails") }}</p>
    <p class="feature-readonly">{{ t("map.osmStepHint") }}</p>
    <button type="button" class="primary" @click="emit('adopt')">
      {{ t("map.osmStepAdopt") }}
    </button>
    <button type="button" class="secondary" @click="emit('observe')">
      {{ t("map.osmStepObserve") }}
    </button>
  </form>
</template>
