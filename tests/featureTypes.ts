import type { Page } from "@playwright/test";
import type { FeatureTypeConfig } from "../src/types/map-feature";

/** The map feature types as served by GET /api/map-feature-types. */
export const featureTypeFixtures: FeatureTypeConfig[] = [
  { id: "area", path: false, routeSetting: false, osm: [] },
  { id: "point", path: false, routeSetting: false, osm: [] },
  { id: "building", path: false, routeSetting: false, osm: [] },
  { id: "entrance", path: false, routeSetting: false, osm: [] },
  {
    id: "steps",
    path: true,
    routeSetting: true,
    osm: [{ extract: "w/highway=steps", tags: { highway: "steps" } }],
  },
  {
    id: "ramp",
    path: false,
    routeSetting: false,
    osm: [{ extract: "w/ramp=wheelchair", tags: { ramp: "wheelchair" } }],
  },
  {
    id: "toilets",
    path: false,
    routeSetting: false,
    osm: [{ extract: "n/amenity=toilets", tags: { amenity: "toilets" } }],
  },
  {
    id: "elevator",
    path: false,
    routeSetting: false,
    osm: [{ extract: "n/highway=elevator", tags: { highway: "elevator" } }],
  },
  { id: "path", path: true, routeSetting: false, osm: [] },
];

export async function mockMapFeatureTypes(page: Page) {
  await page.route("**/api/map-feature-types", (route) =>
    route.fulfill({ json: { types: featureTypeFixtures } }),
  );
}
