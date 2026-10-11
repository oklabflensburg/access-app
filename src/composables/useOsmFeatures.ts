import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import type { OsmFeature } from "../types/map-feature";
import { getOsmFeaturesCache, saveOsmFeaturesCache } from "../services/storage";
import { fetchOsmFeatures } from "../services/osmFeatures";

const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function useOsmFeatures() {
  const { t } = useI18n();
  const osmFeatures = ref<OsmFeature[]>([]);
  const osmFeaturesError = ref("");

  async function load() {
    const cached = await getOsmFeaturesCache();
    if (cached) osmFeatures.value = cached.features;
    if (!navigator.onLine) return;
    if (cached && Date.now() - Date.parse(cached.fetchedAt) < CACHE_MAX_AGE_MS) return;
    try {
      const features = await fetchOsmFeatures();
      await saveOsmFeaturesCache(features);
      osmFeatures.value = features;
      osmFeaturesError.value = "";
    } catch {
      if (!cached) osmFeaturesError.value = t("map.osmFeaturesError");
    }
  }

  onMounted(() => void load());

  return { osmFeatures, osmFeaturesError, load };
}
