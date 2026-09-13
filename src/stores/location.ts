import { defineStore } from "pinia";
import { ref } from "vue";
import { getCurrentLocation } from "../services/geolocation";
import type { LocationData } from "../types/location";
import { t } from "../i18n";

export const useLocationStore = defineStore("location", () => {
  const current = ref<LocationData | null>(null);
  const loading = ref(false);
  const error = ref("");
  let pending: Promise<LocationData | null> | null = null;
  function locate(): Promise<LocationData | null> {
    if (pending) return pending;
    pending = capture().finally(() => {
      pending = null;
    });
    return pending;
  }
  async function capture(): Promise<LocationData | null> {
    loading.value = true;
    error.value = "";
    try {
      current.value = await getCurrentLocation();
      return { ...current.value };
    } catch (cause) {
      error.value =
        cause instanceof Error
          ? cause.message
          : t("errors.location");
      return null;
    } finally {
      loading.value = false;
    }
  }
  function setManualLocation(location: LocationData) {
    current.value = { ...location };
    error.value = "";
  }
  return { current, loading, error, locate, setManualLocation };
});
