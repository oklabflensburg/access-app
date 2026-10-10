import { defineStore } from "pinia";
import { ref } from "vue";
import {
  adoptRemoteRoutingPreferences,
  getRoutingPreferences,
  saveRoutingPreferences,
} from "../services/storage";
import { fetchRoutingPreferences } from "../services/api";
import { t } from "../i18n";

export const usePreferencesStore = defineStore("preferences", () => {
  const wheelchairAccessible = ref(false);
  const saving = ref(false);
  const error = ref("");

  async function load() {
    error.value = "";
    try {
      wheelchairAccessible.value = (await getRoutingPreferences()).wheelchairAccessible;
    } catch {
      error.value = t("errors.preferences");
    }
  }

  async function save(value: boolean) {
    if (saving.value) return;
    saving.value = true;
    error.value = "";
    try {
      await saveRoutingPreferences(value);
      wheelchairAccessible.value = value;
    } catch {
      error.value = t("errors.preferences");
    } finally {
      saving.value = false;
    }
  }

  // The routing preference is global: adopt the server value when it moved on.
  async function refresh() {
    try {
      const remote = await fetchRoutingPreferences();
      if (await adoptRemoteRoutingPreferences(remote))
        wheelchairAccessible.value = remote.wheelchairAccessible;
    } catch {
      /* Offline: the local value stays until the next sync. */
    }
  }

  return { wheelchairAccessible, saving, error, load, save, refresh };
});
