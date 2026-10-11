export type PolygonPosition = [longitude: number, latitude: number];

export type FeatureDrawingMode = "feature" | "child" | "path";

export interface PolygonGeometry {
  type: "Polygon";
  coordinates: [PolygonPosition[]];
}

export const mapFeatureTypes = [
  "area",
  "building",
  "entrance",
  "steps",
  "ramp",
  "toilets",
  "elevator",
  "path",
] as const;

export type MapFeatureType = (typeof mapFeatureTypes)[number];

export const pathFeatureTypes: readonly MapFeatureType[] = ["path", "steps"];

export interface MapFeature {
  id: string;
  type: MapFeatureType;
  name: string;
  geometry: PolygonGeometry;
  createdAt: string;
  parentFeatureId?: string | null;
  osmId?: number | null;
  syncStatus?: "ready" | "syncing" | "synced" | "failed";
  editToken?: string;
  lastError?: string;
  attempts?: number;
  nextRetryAt?: number;
  deleted?: boolean;
  remoteSynced?: boolean;
}

/**
 * A map feature from the static OpenStreetMap extract. Way features carry a
 * centerline, node features a single position; both become polygon features
 * when a user adopts them.
 */
export interface OsmFeature {
  osmId: number;
  type: MapFeatureType;
  name: string;
  way?: PolygonPosition[];
  node?: PolygonPosition;
}
