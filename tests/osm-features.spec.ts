import { expect, test, type Page } from "@playwright/test";
import {
  nodeFeatureGeometry,
  parseOsmFeaturesGeoJson,
  wayFeatureGeometry,
} from "../src/domain/map/osmFeatures";
import type { MapFeature, PolygonPosition } from "../src/types/map-feature";
import { featureTypeFixtures, mockMapFeatureTypes } from "./featureTypes";

function positions(points: [number, number][], latitude = 54.78): PolygonPosition[] {
  const latitudeScale = 6371000 * Math.PI / 180;
  const longitudeScale = latitudeScale * Math.cos(latitude * Math.PI / 180);
  return points.map(([x, y]) => [9.43 + x / longitudeScale, latitude + y / latitudeScale]);
}

test("extract keeps classified ways and nodes and drops the rest", () => {
  const line = (id: string | number | undefined, coordinates: number[][] = [[9.43, 54.78], [9.431, 54.781]], properties: Record<string, string> = { highway: "steps" }) => ({
    type: "Feature",
    ...(id === undefined ? {} : { id }),
    geometry: { type: "LineString", coordinates },
    properties,
  });
  const features = parseOsmFeaturesGeoJson({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "w4016315",
        geometry: { type: "LineString", coordinates: [[9.43, 54.78], [9.431, 54.781]] },
        properties: { highway: "steps", name: "  Bahnhofstreppe " },
      },
      // A ramped staircase stays steps: the first matching rule wins.
      line("w77", [[9.43, 54.78], [9.431, 54.781]], { highway: "steps", ramp: "wheelchair" }),
      line("w78", [[9.43, 54.78], [9.431, 54.781]], { ramp: "wheelchair", name: "Rampe" }),
      {
        type: "Feature",
        id: "n311171853",
        geometry: { type: "Point", coordinates: [9.43, 54.78] },
        properties: { highway: "elevator", name: "Aufzug" },
      },
      {
        type: "Feature",
        id: "n262401790",
        geometry: { type: "Point", coordinates: [9.44, 54.79] },
        properties: { amenity: "toilets" },
      },
      // Referenced nodes without matching tags, area polygons and broken
      // entries are dropped.
      { type: "Feature", id: "n21919376", geometry: { type: "Point", coordinates: [9.43, 54.78] }, properties: { crossing: "unmarked" } },
      { type: "Feature", id: "a170584882", geometry: { type: "MultiPolygon", coordinates: [[[[9.43, 54.78]]]] }, properties: { highway: "steps" } },
      line("w0"),
      line(undefined),
      line("not-a-way"),
      line(47110815, [[9.43, 54.78], [9.431, 54.781], [9.432, 54.782]]),
      line("w4016315", [[9.44, 54.79], [9.441, 54.791]]),
    ],
  }, featureTypeFixtures);
  expect(features).toEqual([
    {
      osmId: 4016315,
      type: "steps",
      name: "Bahnhofstreppe",
      way: [[9.43, 54.78], [9.431, 54.781]],
    },
    { osmId: 77, type: "steps", name: "", way: [[9.43, 54.78], [9.431, 54.781]] },
    { osmId: 78, type: "ramp", name: "Rampe", way: [[9.43, 54.78], [9.431, 54.781]] },
    { osmId: 311171853, type: "elevator", name: "Aufzug", node: [9.43, 54.78] },
    { osmId: 262401790, type: "toilets", name: "", node: [9.44, 54.79] },
    { osmId: 47110815, type: "steps", name: "", way: [[9.43, 54.78], [9.431, 54.781], [9.432, 54.782]] },
  ]);
  expect(parseOsmFeaturesGeoJson(null, featureTypeFixtures)).toEqual([]);
  expect(parseOsmFeaturesGeoJson({ type: "FeatureCollection" }, featureTypeFixtures)).toEqual([]);
});

test("ways buffer into the 10 metre corridor, long ones simplify, tight turns fail", () => {
  const short = wayFeatureGeometry(positions([[0, 0], [100, 0]]));
  expect(short).not.toBeNull();
  expect(short!.coordinates[0]).toHaveLength(5);

  const zigzag = positions(
    Array.from({ length: 200 }, (_, index) => [index * 10, (index % 2) * 0.1] as [number, number]),
  );
  const simplified = wayFeatureGeometry(zigzag);
  expect(simplified).not.toBeNull();

  // A hairpin narrower than the corridor cannot become a valid polygon.
  expect(wayFeatureGeometry(positions([[0, 0], [100, 0], [100, 5], [0, 5]]))).toBeNull();
});

test("nodes buffer into a small closed circle polygon", () => {
  const geometry = nodeFeatureGeometry([9.43, 54.78]);
  const ring = geometry.coordinates[0];
  expect(ring.length).toBeGreaterThanOrEqual(4);
  expect(ring[0]).toEqual(ring.at(-1));
  const latitudeScale = 6371000 * Math.PI / 180;
  const longitudeScale = latitudeScale * Math.cos(54.78 * Math.PI / 180);
  const radii = ring.slice(0, -1).map(([lng, lat]) =>
    Math.hypot((lng - 9.43) * longitudeScale, (lat - 54.78) * latitudeScale));
  expect(Math.min(...radii)).toBeGreaterThan(4);
  expect(Math.max(...radii)).toBeLessThan(6);
});

const wayFixture = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "w47110815",
      geometry: {
        type: "LineString",
        coordinates: [[9.432, 54.7833], [9.4345, 54.7833]],
      },
      properties: { highway: "steps", name: "Kanutreppe" },
    },
  ],
};

const nodeFixture = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "n311171853",
      geometry: { type: "Point", coordinates: [9.4333, 54.7833] },
      properties: { highway: "elevator", name: "Aufzug Bahnhof" },
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", route => route.abort());
  await mockMapFeatureTypes(page);
  await page.route("**/api/observations*", route =>
    route.fulfill({ json: { observations: [], nextCursor: null } }));
  await page.route("**/api/map-features*", route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { features: [] } });
    return route.fulfill({ json: { id: route.request().postDataJSON().id } });
  });
  await page.route("**/data/osm-features.geojson", route =>
    route.fulfill({ json: { type: "FeatureCollection", features: [] } }));
});

async function clickMapCenter(page: Page) {
  const bounds = await page.locator(".map").boundingBox();
  if (!bounds) throw new Error("Map missing");
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
}

async function readFeatures(page: Page): Promise<MapFeature[]> {
  return page.evaluate(async () => {
    const open = indexedDB.open("accessapp");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      const read = db.transaction("mapFeatures").objectStore("mapFeatures").getAll();
      return await new Promise<MapFeature[]>((resolve, reject) => {
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error);
      });
    } finally {
      db.close();
    }
  });
}

test("an OSM way can be adopted as an editable feature and shadows the OSM line", async ({ page }) => {
  await page.route("**/data/osm-features.geojson", route => route.fulfill({ json: wayFixture }));
  await page.goto("/");
  await expect(page.locator("path.osm-feature")).toHaveCount(1);
  await clickMapCenter(page);
  const panel = page.getByRole("form", { name: "Objekt aus OpenStreetMap" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Kanutreppe")).toBeVisible();

  await panel.getByRole("button", { name: "Als eigenes Objekt bearbeiten" }).click();
  const details = page.getByRole("form", { name: "Flächendetails" });
  await expect(details.getByLabel("Name")).toHaveValue("Kanutreppe");
  await expect(details.getByLabel("Typ")).toHaveValue("steps");

  const [feature] = await readFeatures(page);
  expect(feature.type).toBe("steps");
  expect(feature.name).toBe("Kanutreppe");
  expect(feature.osmId).toBe(47110815);
  expect(feature.geometry.coordinates[0].length).toBeGreaterThanOrEqual(5);
  expect(feature.geometry.coordinates[0][0]).toEqual(feature.geometry.coordinates[0].at(-1));

  // The adopted way replaces the static OSM line on the map.
  await expect(page.locator("path.osm-feature")).toHaveCount(0);
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(1);
});

test("an OSM node can be adopted as an editable feature and shadows the OSM marker", async ({ page }) => {
  await page.route("**/data/osm-features.geojson", route => route.fulfill({ json: nodeFixture }));
  await page.goto("/");
  await expect(page.locator("path.osm-feature")).toHaveCount(1);
  await clickMapCenter(page);
  const panel = page.getByRole("form", { name: "Objekt aus OpenStreetMap" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Aufzug Bahnhof")).toBeVisible();

  await panel.getByRole("button", { name: "Als eigenes Objekt bearbeiten" }).click();
  const details = page.getByRole("form", { name: "Flächendetails" });
  await expect(details.getByLabel("Name")).toHaveValue("Aufzug Bahnhof");
  await expect(details.getByLabel("Typ")).toHaveValue("elevator");

  const [feature] = await readFeatures(page);
  expect(feature.type).toBe("elevator");
  expect(feature.osmId).toBe(311171853);
  const ring = feature.geometry.coordinates[0];
  expect(ring.length).toBeGreaterThanOrEqual(4);
  expect(ring[0]).toEqual(ring.at(-1));

  // The adopted node replaces the static OSM marker on the map.
  await expect(page.locator("path.osm-feature")).toHaveCount(0);
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(1);
});

test("adopting for an observation preselects the OSM feature as the observed object", async ({ page }) => {
  await page.route("**/data/osm-features.geojson", route => route.fulfill({ json: wayFixture }));
  await page.goto("/");
  await clickMapCenter(page);
  const panel = page.getByRole("form", { name: "Objekt aus OpenStreetMap" });
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Beobachtung hinzufügen" }).click();

  await expect(page).toHaveURL(/\/observation\/new\?latitude=54\.78\d+&longitude=9\.43\d+/);
  await expect(page.getByRole("heading", { name: "Kanutreppe" })).toBeVisible();

  const [feature] = await readFeatures(page);
  expect(feature.osmId).toBe(47110815);
  expect(feature.type).toBe("steps");
});
