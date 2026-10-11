import type { OsmStepWay } from "../types/map-feature";
import { parseOsmStepsGeoJson } from "../domain/map/osmSteps";

const stepsUrl = import.meta.env.VITE_OSM_STEPS_URL ?? "/data/steps.geojson";

export async function fetchOsmSteps(signal?: AbortSignal): Promise<OsmStepWay[]> {
  const response = await fetch(stepsUrl, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseOsmStepsGeoJson(await response.json());
}
