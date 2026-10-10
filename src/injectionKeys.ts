import type { InjectionKey, Ref } from "vue";
import type { MapFeature } from "./types/map-feature";

export const mapFeaturesKey: InjectionKey<Ref<MapFeature[]>> =
  Symbol("mapFeatures");
