import { defineStore } from "pinia";
import { ref } from "vue";
import { getObservations, saveObservation } from "../services/storage";
import type { Observation } from "../types/observation";
import type { Photo } from "../types/observation";
import type { SensorData } from "../types/sensors";

export const useObservationStore = defineStore("observation", () => {
  const observations = ref<Observation[]>([]);
  const error = ref("");
  const notice = ref("");
  async function load() {
    error.value = "";
    try {
      observations.value = await getObservations();
    } catch {
      error.value =
        "Could not read saved observations. Check that browser storage is enabled, then retry.";
    }
  }
  async function save(
    observation: Observation,
    photos: Photo[] = [],
    sensors?: SensorData,
  ) {
    await saveObservation(observation, photos, sensors);
    await load();
    notice.value = "Observation saved on this device.";
  }
  return { observations, error, notice, load, save };
});
