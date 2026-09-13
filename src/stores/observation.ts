import { defineStore } from "pinia";
import { ref } from "vue";
import { getObservations, saveObservation } from "../services/storage";
import type { Observation } from "../types/observation";
import type { Photo } from "../types/observation";
import type { SensorData } from "../types/sensors";
import { t } from "../i18n";

export const useObservationStore = defineStore("observation", () => {
  const observations = ref<Observation[]>([]);
  const error = ref("");
  const notice = ref("");
  async function load() {
    error.value = "";
    try {
      observations.value = await getObservations();
    } catch {
      error.value = t("errors.observations");
    }
  }
  async function save(
    observation: Observation,
    photos: Photo[] = [],
    sensors?: SensorData,
  ) {
    await saveObservation(observation, photos, sensors);
    await load();
    notice.value = t("app.saved");
  }
  return { observations, error, notice, load, save };
});
