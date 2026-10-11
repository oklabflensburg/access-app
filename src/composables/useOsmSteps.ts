import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import type { OsmStepWay } from "../types/map-feature";
import { getOsmStepsCache, saveOsmStepsCache } from "../services/storage";
import { fetchOsmSteps } from "../services/osmSteps";

const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function useOsmSteps() {
  const { t } = useI18n();
  const osmSteps = ref<OsmStepWay[]>([]);
  const osmStepsError = ref("");

  async function load() {
    const cached = await getOsmStepsCache();
    if (cached) osmSteps.value = cached.ways;
    if (!navigator.onLine) return;
    if (cached && Date.now() - Date.parse(cached.fetchedAt) < CACHE_MAX_AGE_MS) return;
    try {
      const ways = await fetchOsmSteps();
      await saveOsmStepsCache(ways);
      osmSteps.value = ways;
      osmStepsError.value = "";
    } catch {
      if (!cached) osmStepsError.value = t("map.osmStepsError");
    }
  }

  onMounted(() => void load());

  return { osmSteps, osmStepsError, load };
}
