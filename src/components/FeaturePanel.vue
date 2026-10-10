<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  mapFeatureTypes,
  type MapFeature,
  type MapFeatureType,
} from "../types/map-feature";

const props = defineProps<{
  feature: MapFeature;
  parentFeature?: MapFeature;
  saving: boolean;
}>();
const emit = defineEmits<{
  close: [];
  selectParent: [id: string];
  update: [changes: { name: string; type: MapFeatureType }];
}>();
const { t } = useI18n();
const featureName = ref(props.feature.name);
const featureType = ref<MapFeatureType>(props.feature.type);
const canEdit = computed(() => Boolean(props.feature.editToken));
watch(
  () => props.feature.id,
  () => {
    featureName.value = props.feature.name;
    featureType.value = props.feature.type;
  },
);
function submit() {
  emit("update", { name: featureName.value, type: featureType.value });
}
</script>

<template>
  <form
    class="feature-panel"
    :aria-label="t('map.featureDetails')"
    @submit.prevent="submit"
  >
    <div class="feature-panel-heading">
      <strong>{{ t("map.featureDetails") }}</strong>
      <button type="button" class="feature-panel-close" :aria-label="t('map.closeFeatureDetails')" @click="emit('close')">
        <i class="pi pi-times" aria-hidden="true" />
      </button>
    </div>
    <button
      v-if="parentFeature"
      type="button"
      class="secondary"
      @click="emit('selectParent', parentFeature!.id)"
    >
      {{ t("map.showParentFeature") }}
    </button>
    <label for="selected-feature-name">{{ t("map.featureName") }}</label>
    <input
      id="selected-feature-name"
      v-model="featureName"
      type="text"
      maxlength="120"
      :readonly="!canEdit"
    />
    <label for="selected-feature-type">{{ t("map.featureType") }}</label>
    <select id="selected-feature-type" v-model="featureType" :disabled="!canEdit">
      <option v-for="type in mapFeatureTypes" :key="type" :value="type">
        {{ t(`map.featureTypes.${type}`) }}
      </option>
    </select>
    <p v-if="!canEdit" class="feature-readonly">{{ t("map.featureReadOnly") }}</p>
    <button v-else type="submit" class="primary" :disabled="saving">
      {{ saving ? t("map.featureUpdating") : t("map.updateFeature") }}
    </button>
  </form>
</template>
