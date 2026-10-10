import { computed, onBeforeUnmount, onMounted, ref, type Ref } from "vue";
import { liveQuery } from "dexie";
import { useI18n } from "vue-i18n";
import {
  getLocalMapFeatures,
  saveMapFeature,
  updateMapFeatureProperties,
} from "../services/storage";
import type {
  MapFeature,
  MapFeatureType,
  PolygonGeometry,
} from "../types/map-feature";

export function useMapFeatures(publicFeatures: Ref<MapFeature[]>) {
  const { t } = useI18n();
  const localFeatures = ref<MapFeature[]>([]);
  const selectedFeatureId = ref("");
  const notice = ref("");
  const error = ref("");
  const saving = ref(false);
  let subscription: { unsubscribe(): void } | undefined;

  const features = computed(() => {
    const localIds = new Set(localFeatures.value.map((feature) => feature.id));
    return [
      ...localFeatures.value,
      ...publicFeatures.value.filter((feature) => !localIds.has(feature.id)),
    ];
  });
  const selectedFeature = computed(() =>
    features.value.find(({ id }) => id === selectedFeatureId.value),
  );
  const selectedParentFeature = computed(() =>
    features.value.find(({ id }) => id === selectedFeature.value?.parentFeatureId),
  );

  function selectFeature(id: string) {
    if (!features.value.some((candidate) => candidate.id === id)) return;
    selectedFeatureId.value = id;
  }

  function closeFeature() {
    selectedFeatureId.value = "";
  }

  async function createFeature({
    geometry,
    name,
    type,
    parentFeatureId,
  }: {
    geometry: PolygonGeometry;
    name: string;
    type: MapFeatureType;
    parentFeatureId: string | null;
  }) {
    notice.value = "";
    try {
      const feature = await saveMapFeature(geometry, name, type, parentFeatureId);
      localFeatures.value = await getLocalMapFeatures();
      selectFeature(feature.id);
      const parent = parentFeatureId
        ? features.value.find((candidate) => candidate.id === parentFeatureId)
        : undefined;
      notice.value = parent
        ? t("map.featureSavedAsChild", {
            name: parent.name || t(`map.featureTypes.${parent.type}`),
          })
        : t("map.featureSavedOffline");
    } catch (cause) {
      error.value =
        cause instanceof Error ? cause.message : t("map.featureSaveError");
    }
  }

  async function updateFeature(changes: {
    name: string;
    type: MapFeatureType;
  }) {
    if (!selectedFeature.value?.editToken) return;
    saving.value = true;
    notice.value = "";
    error.value = "";
    try {
      await updateMapFeatureProperties(
        selectedFeature.value.id,
        changes.name,
        changes.type,
      );
      notice.value = t("map.featureUpdatedOffline");
    } catch (cause) {
      error.value = cause instanceof Error
        ? cause.message
        : t("map.featureUpdateError");
    } finally {
      saving.value = false;
    }
  }

  onMounted(() => {
    subscription = liveQuery(getLocalMapFeatures).subscribe({
      next: (result) => {
        localFeatures.value = result;
      },
      error: () => {
        error.value = t("map.featureSaveError");
      },
    });
  });
  onBeforeUnmount(() => subscription?.unsubscribe());

  return {
    features,
    selectedFeature,
    selectedParentFeature,
    notice,
    error,
    saving,
    selectFeature,
    closeFeature,
    createFeature,
    updateFeature,
  };
}
