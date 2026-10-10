import { mapFeatureTypes, type MapFeatureType, type PolygonGeometry } from "./map-feature";

export const routingPreferencesId = "routing";

export const featurePriorities = ["neutral", "avoid", "reduce", "prefer"] as const;

export type FeaturePriority = (typeof featurePriorities)[number];

export type FeaturePrioritySettings = Record<MapFeatureType, FeaturePriority>;

// Feature types currently offered in the route settings; more will follow.
export const routeSettingFeatureTypes: readonly MapFeatureType[] = ["staircase"];

export function defaultFeaturePriorities(): FeaturePrioritySettings {
  return Object.fromEntries(
    mapFeatureTypes.map((type) => [type, "neutral"]),
  ) as FeaturePrioritySettings;
}

export interface PriorityArea {
  priority: Exclude<FeaturePriority, "neutral">;
  geometry: PolygonGeometry;
}

export interface RoutingPreferences {
  id: typeof routingPreferencesId;
  featurePriorities: FeaturePrioritySettings;
  revision: number;
  updatedAt: string;
  syncStatus: "ready" | "syncing" | "synced" | "failed";
  attempts: number;
  nextRetryAt: number;
  lastError: string;
}

export interface RemoteRoutingPreferences {
  featurePriorities: FeaturePrioritySettings;
  revision: number;
  updatedAt: string;
}
