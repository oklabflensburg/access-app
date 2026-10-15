import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { getMapFeatureTypes } from "../services/api";
import type { FeatureTypeConfig, MapFeatureType } from "../types/map-feature";

const cacheKey = "map-feature-types";

function readCache(): FeatureTypeConfig[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(cacheKey) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * The map feature types requested from the backend; earlier types win when
 * OSM tags match several. The last response is cached so the app keeps its
 * types offline.
 */
export const useFeatureTypesStore = defineStore("featureTypes", () => {
  const types = ref<readonly FeatureTypeConfig[]>(readCache());
  const loaded = ref(false);

  const codes = computed<readonly MapFeatureType[]>(() =>
    types.value.map((type) => type.id));
  const pathCodes = computed<readonly MapFeatureType[]>(() =>
    types.value.filter((type) => type.path).map((type) => type.id));
  const routeSettingCodes = computed<readonly MapFeatureType[]>(() =>
    types.value.filter((type) => type.routeSetting).map((type) => type.id));

  let pending: Promise<void> | undefined;

  async function fetchTypes(): Promise<void> {
    try {
      const { types: fetched } = await getMapFeatureTypes();
      if (fetched.length) {
        types.value = fetched;
        localStorage.setItem(cacheKey, JSON.stringify(fetched));
      }
    } catch {
      /* Offline: the cached types stay until the next successful request. */
    } finally {
      loaded.value = true;
    }
  }

  function load(): Promise<void> {
    pending ??= fetchTypes().then(() => {
      pending = undefined;
    });
    return pending;
  }

  return { types, loaded, codes, pathCodes, routeSettingCodes, load };
});
