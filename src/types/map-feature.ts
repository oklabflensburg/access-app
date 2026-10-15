import featureTypeConfig from "../../backend/config/map-features.json" with { type: "json" };

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

/** The configured feature types; earlier types win when OSM tags match several. */
export const featureTypes: readonly FeatureTypeConfig[] =
  featureTypeConfig.types as FeatureTypeConfig[];

export const mapFeatureTypes: readonly MapFeatureType[] = featureTypes.map((type) => type.id);

export type MapFeatureType = string;

export const pathFeatureTypes: readonly MapFeatureType[] =
  featureTypes.filter((type) => type.path).map((type) => type.id);

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
