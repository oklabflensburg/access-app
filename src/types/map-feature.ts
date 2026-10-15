export type PolygonPosition = [longitude: number, latitude: number];

export type FeatureDrawingMode = "feature" | "child" | "path";

export interface PolygonGeometry {
  type: "Polygon";
  coordinates: [PolygonPosition[]];
}

/** One OSM tag mapping of a feature type: an extraction filter plus the tags that classify a match. */
export interface OsmTagRule {
  extract: string;
  tags: Record<string, string>;
}

export interface FeatureTypeConfig {
  id: string;
  path: boolean;
  routeSetting: boolean;
  osm: OsmTagRule[];
}

export type MapFeatureType = string;

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
