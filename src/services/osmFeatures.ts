import type { FeatureTypeConfig, OsmFeature } from "../types/map-feature";
import { parseOsmFeaturesGeoJson } from "../domain/map/osmFeatures";

const featuresUrl = import.meta.env.VITE_OSM_FEATURES_URL ?? "/data/osm-features.geojson";

export async function fetchOsmFeatures(
  featureTypes: readonly FeatureTypeConfig[],
  signal?: AbortSignal,
): Promise<OsmFeature[]> {
  const response = await fetch(featuresUrl, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseOsmFeaturesGeoJson(await response.json(), featureTypes);
}
