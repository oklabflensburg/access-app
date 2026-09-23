export type PolygonPosition = [longitude: number, latitude: number];

export interface PolygonGeometry {
  type: "Polygon";
  coordinates: [PolygonPosition[]];
}

export const mapFeatureTypes = [
  "area",
  "building",
  "entrance",
  "staircase",
  "ramp",
  "toilet",
  "elevator",
  "path",
] as const;

export type MapFeatureType = (typeof mapFeatureTypes)[number];

export interface MapFeature {
  id: string;
  type: MapFeatureType;
  name: string;
  geometry: PolygonGeometry;
  createdAt: string;
  syncStatus?: "ready" | "syncing" | "synced" | "failed";
  editToken?: string;
  lastError?: string;
  attempts?: number;
  nextRetryAt?: number;
  deleted?: boolean;
  remoteSynced?: boolean;
}
