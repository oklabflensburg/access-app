import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { getPublicMapFeatures, getPublicObservations } from "../services/api";
import { database } from "../services/storage";
import type { Observation } from "../types/observation";
import type { MapFeature } from "../types/map-feature";

export function usePublicMapData() {
  const { t } = useI18n();
  const publicObservations = ref<Observation[]>([]);
  const publicFeatures = ref<MapFeature[]>([]);
  const publicError = ref("");
  const publicBusy = ref(false);

  async function load() {
    publicBusy.value = true;
    publicError.value = "";
    try {
      const [result, featureResult] = await Promise.all([
        getPublicObservations(),
        getPublicMapFeatures(),
      ]);
      const [observationKeys, featureKeys] = await Promise.all([
        database.observations.toCollection().primaryKeys(),
        database.mapFeatures.toCollection().primaryKeys(),
      ]);
      const localIds = new Set(observationKeys);
      const localFeatureIds = new Set(featureKeys);
      publicObservations.value = result.observations.filter(
        (observation) => !localIds.has(observation.id),
      );
      publicFeatures.value = featureResult.features.filter(
        (feature) => !localFeatureIds.has(feature.id),
      );
      if (result.nextCursor)
        publicError.value = t("map.publicLimit");
    } catch {
      publicError.value = t("map.publicError");
    } finally {
      publicBusy.value = false;
    }
  }

  onMounted(() => void load());

  return {
    publicObservations,
    publicFeatures,
    publicError,
    publicBusy,
    load,
  };
}
