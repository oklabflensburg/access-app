import { defineStore } from "pinia";
import { ref } from "vue";
import {
  adoptRemoteRoutingPreferences,
  getRoutingPreferences,
  saveRoutingPreferences,
} from "../services/storage";
import { fetchRoutingPreferences } from "../services/api";
import { defaultFeaturePriorities, type FeaturePrioritySettings } from "../types/preferences";
import { t } from "../i18n";

export const usePreferencesStore = defineStore("preferences", () => {
  const featurePriorities = ref<FeaturePrioritySettings>(defaultFeaturePriorities());
  const saving = ref(false);
  const error = ref("");

  async function load() {
    error.value = "";
    try {
      featurePriorities.value = (await getRoutingPreferences()).featurePriorities;
    } catch {
      error.value = t("errors.preferences");
    }
  }

  async function save(settings: FeaturePrioritySettings) {
    if (saving.value) return;
    saving.value = true;
    error.value = "";
    try {
      await saveRoutingPreferences(settings);
      featurePriorities.value = settings;
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
        featurePriorities.value = remote.featurePriorities;
    } catch {
      /* Offline: the local value stays until the next sync. */
    }
  }

  return { featurePriorities, saving, error, load, save, refresh };
});
