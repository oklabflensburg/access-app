import { expect, test, type Page } from "@playwright/test";
import { parseOsmStepsGeoJson, staircaseGeometryFromWay } from "../src/domain/map/osmSteps";
import type { MapFeature, PolygonPosition } from "../src/types/map-feature";

function positions(points: [number, number][], latitude = 54.78): PolygonPosition[] {
  const latitudeScale = 6371000 * Math.PI / 180;
  const longitudeScale = latitudeScale * Math.cos(latitude * Math.PI / 180);
  return points.map(([x, y]) => [9.43 + x / longitudeScale, latitude + y / latitudeScale]);
}

test("steps extract keeps staircase ways and drops nodes, invalid and duplicate ids", () => {
  const line = (id: string | number | undefined, coordinates: number[][] = [[9.43, 54.78], [9.431, 54.781]]) => ({
    type: "Feature",
    ...(id === undefined ? {} : { id }),
    geometry: { type: "LineString", coordinates },
    properties: {},
  });
  const ways = parseOsmStepsGeoJson({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "w4016315",
        geometry: { type: "LineString", coordinates: [[9.43, 54.78], [9.431, 54.781]] },
        properties: { highway: "steps", name: "  Bahnhofstreppe " },
      },
      { type: "Feature", id: "n21919376", geometry: { type: "Point", coordinates: [9.43, 54.78] }, properties: {} },
      line("w0"),
      line(undefined),
      line("not-a-way"),
      line(47110815, [[9.43, 54.78], [9.431, 54.781], [9.432, 54.782]]),
      line("w4016315", [[9.44, 54.79], [9.441, 54.791]]),
    ],
  });
  expect(ways).toEqual([
    {
      osmWayId: 4016315,
      name: "Bahnhofstreppe",
      coordinates: [[9.43, 54.78], [9.431, 54.781]],
    },
    {
      osmWayId: 47110815,
      name: "",
      coordinates: [[9.43, 54.78], [9.431, 54.781], [9.432, 54.782]],
    },
  ]);
  expect(parseOsmStepsGeoJson(null)).toEqual([]);
  expect(parseOsmStepsGeoJson({ type: "FeatureCollection" })).toEqual([]);
});

test("staircase ways buffer into the 10 metre corridor, long ones simplify, tight turns fail", () => {
  const short = staircaseGeometryFromWay(positions([[0, 0], [100, 0]]));
  expect(short).not.toBeNull();
  expect(short!.coordinates[0]).toHaveLength(5);

  const zigzag = positions(
    Array.from({ length: 200 }, (_, index) => [index * 10, (index % 2) * 0.1] as [number, number]),
  );
  const simplified = staircaseGeometryFromWay(zigzag);
  expect(simplified).not.toBeNull();

  // A hairpin narrower than the corridor cannot become a valid polygon.
  expect(staircaseGeometryFromWay(positions([[0, 0], [100, 0], [100, 5], [0, 5]]))).toBeNull();
});

const stepsFixture = {
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

test.beforeEach(async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", route => route.abort());
  await page.route("**/api/observations*", route =>
    route.fulfill({ json: { observations: [], nextCursor: null } }));
  await page.route("**/api/map-features*", route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { features: [] } });
    return route.fulfill({ json: { id: route.request().postDataJSON().id } });
  });
  await page.route("**/data/steps.geojson", route => route.fulfill({ json: stepsFixture }));
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

test("an OSM staircase can be adopted as an editable feature and shadows the OSM line", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("path.osm-step")).toHaveCount(1);
  await clickMapCenter(page);
  const panel = page.getByRole("form", { name: "Treppe aus OpenStreetMap" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Kanutreppe")).toBeVisible();

  await panel.getByRole("button", { name: "Als eigenes Objekt bearbeiten" }).click();
  const details = page.getByRole("form", { name: "Flächendetails" });
  await expect(details.getByLabel("Name")).toHaveValue("Kanutreppe");
  await expect(details.getByLabel("Typ")).toHaveValue("staircase");

  const [feature] = await readFeatures(page);
  expect(feature.type).toBe("staircase");
  expect(feature.name).toBe("Kanutreppe");
  expect(feature.osmWayId).toBe(47110815);
  expect(feature.geometry.coordinates[0].length).toBeGreaterThanOrEqual(5);
  expect(feature.geometry.coordinates[0][0]).toEqual(feature.geometry.coordinates[0].at(-1));

  // The adopted way replaces the static OSM line on the map.
  await expect(page.locator("path.osm-step")).toHaveCount(0);
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(1);
});

test("adopting for an observation preselects the staircase as the observed object", async ({ page }) => {
  await page.goto("/");
  await clickMapCenter(page);
  const panel = page.getByRole("form", { name: "Treppe aus OpenStreetMap" });
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Beobachtung hinzufügen" }).click();

  await expect(page).toHaveURL(/\/observation\/new\?latitude=54\.78\d+&longitude=9\.43\d+/);
  await expect(page.getByRole("heading", { name: "Kanutreppe" })).toBeVisible();

  const [feature] = await readFeatures(page);
  expect(feature.osmWayId).toBe(47110815);
  expect(feature.type).toBe("staircase");
});
