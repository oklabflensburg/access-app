import { expect, test, type Page } from "@playwright/test";
import { createPathGeometry, MAX_PATH_POINTS } from "../src/domain/map/pathGeometry";
import type { MapFeature, PolygonGeometry, PolygonPosition } from "../src/types/map-feature";

function positions(points: [number, number][], latitude = 54.78): PolygonPosition[] {
  const latitudeScale = 6371000 * Math.PI / 180;
  const longitudeScale = latitudeScale * Math.cos(latitude * Math.PI / 180);
  return points.map(([x, y]) => [9.43 + x / longitudeScale, latitude + y / latitudeScale]);
}

function distance(a: PolygonPosition, b: PolygonPosition): number {
  const scale = 6371000 * Math.PI / 180;
  return Math.hypot((b[0] - a[0]) * scale * Math.cos((a[1] + b[1]) / 2 * Math.PI / 180),
    (b[1] - a[1]) * scale);
}

test("path buffer has 2 metre width and flat end caps in every direction", () => {
  for (const latitude of [0, 54.78, 70]) {
    for (const end of [[100, 0], [0, 100], [80, 60], [-80, -60]] as [number, number][]) {
      const geometry = createPathGeometry(positions([[0, 0], end], latitude));
      expect(geometry).not.toBeNull();
      const ring = geometry!.coordinates[0];
      expect(ring).toHaveLength(5);
      expect(ring[0]).toEqual(ring.at(-1));
      expect(distance(ring[0], ring[3])).toBeCloseTo(2, 3);
      expect(distance(ring[1], ring[2])).toBeCloseTo(2, 3);
      expect(distance(ring[0], ring[1])).toBeCloseTo(100, 2);
    }
  }
});

test("path buffer follows bends, bevels sharp corners, and ignores consecutive duplicates", () => {
  for (const points of [
    [[0, 0], [100, 0], [100, 100]],
    [[0, 0], [100, 0], [20, 30]],
    [[0, 0], [100, 0], [20, -30]],
  ] as [number, number][][]) {
    const line = positions(points);
    const geometry = createPathGeometry(line);
    expect(geometry).not.toBeNull();
    expect(geometry!.coordinates[0].length).toBeGreaterThan(5);
    expect(createPathGeometry([line[0], line[0], ...line.slice(1)])).toEqual(geometry);
  }
});

test("path buffer rejects crossings, retracing, overlapping width, and invalid coordinates", () => {
  for (const points of [
    [[0, 0], [100, 100], [0, 100], [100, 0]],
    [[0, 0], [100, 0], [20, 0]],
    [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]],
    [[0, 0], [100, 0], [100, 0.5], [0, 0.5]],
  ] as [number, number][][]) {
    expect(createPathGeometry(positions(points))).toBeNull();
  }
  expect(createPathGeometry([])).toBeNull();
  expect(createPathGeometry([[9, 54], [9, 54]])).toBeNull();
  expect(createPathGeometry([[NaN, 54], [9, 54]])).toBeNull();
  expect(createPathGeometry([[9, 91], [10, 91]])).toBeNull();
});

test("path point limit produces a ring accepted by the existing storage limit", () => {
  const line = positions(Array.from({ length: MAX_PATH_POINTS }, (_, index) => [index * 10, index % 2 * 10]));
  const geometry = createPathGeometry(line);
  expect(geometry).not.toBeNull();
  expect(geometry!.coordinates[0].length).toBeLessThanOrEqual(501);
  expect(createPathGeometry([...line, positions([[MAX_PATH_POINTS * 10, 0]])[0]])).toBeNull();
});

test.beforeEach(async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", route => route.abort());
  await page.route("**/api/observations*", route => route.fulfill({ json: { observations: [], nextCursor: null } }));
  await page.route("**/api/map-features*", route => route.fulfill({ json: { features: [] } }));
});

async function openDrawing(page: Page) {
  await page.getByRole("button", { name: "Menü", exact: true }).click();
  await page.getByRole("button", { name: "Weg anlegen", exact: true }).click();
  await expect(page.getByRole("group", { name: "Weg zeichnen" })).toBeVisible();
}

async function clickPoint(page: Page, x: number, y: number) {
  const bounds = await page.locator(".map").boundingBox();
  if (!bounds) throw new Error("Map missing");
  await page.mouse.click(bounds.x + x, bounds.y + y);
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

test("two points save a Weg with fixed width, survive reload, and synchronize", async ({ page }) => {
  let uploaded: { type: string; geometry: PolygonGeometry } | undefined;
  await page.route("**/api/map-features*", route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { features: [] } });
    uploaded = route.request().postDataJSON();
    return route.fulfill({ json: { id: route.request().postDataJSON().id } });
  });
  await page.goto("/");
  await openDrawing(page);
  const save = page.getByRole("button", { name: "Speichern", exact: true });
  await expect(save).toBeDisabled();
  await clickPoint(page, 180, 300);
  await expect(save).toBeDisabled();
  await clickPoint(page, 420, 300);
  await expect(save).toBeEnabled();
  expect(await readFeatures(page)).toHaveLength(0);
  expect(uploaded).toBeUndefined();
  await save.click();
  await expect(page.getByRole("form", { name: "Flächendetails" }).getByLabel("Typ")).toHaveValue("path");
  const [feature] = await readFeatures(page);
  expect(feature.geometry.coordinates[0]).toHaveLength(5);
  expect(distance(feature.geometry.coordinates[0][0], feature.geometry.coordinates[0][3])).toBeCloseTo(2, 3);
  expect(feature.parentFeatureId).toBeNull();
  await page.reload();
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(1);
  await page.getByRole("button", { name: "Menü", exact: true }).click();
  await page.getByRole("button", { name: /^Synchronisieren/ }).click();
  await expect.poll(() => uploaded?.type).toBe("path");
  expect(uploaded?.geometry).toEqual(feature.geometry);
});

test("drawing continues through intermediate points; undo, duplicates, and cancel work", async ({ page }) => {
  await page.goto("/");
  await openDrawing(page);
  const save = page.getByRole("button", { name: "Speichern", exact: true });
  await clickPoint(page, 180, 300);
  await clickPoint(page, 180, 300);
  await expect(save).toBeDisabled();
  await clickPoint(page, 420, 300);
  await clickPoint(page, 420, 450);
  await expect(save).toBeEnabled();
  expect(await readFeatures(page)).toHaveLength(0);
  await page.getByRole("button", { name: "Punkt zurücknehmen" }).click();
  await page.getByRole("button", { name: "Punkt zurücknehmen" }).click();
  await expect(save).toBeDisabled();
  await clickPoint(page, 420, 300);
  await clickPoint(page, 420, 450);
  await save.click();
  const [feature] = await readFeatures(page);
  expect(feature.geometry.coordinates[0]).toHaveLength(7);
  await page.getByRole("button", { name: "Flächendetails schließen" }).click();
  await openDrawing(page);
  await page.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await expect(page.getByRole("group", { name: "Weg zeichnen" })).toHaveCount(0);
  expect(await readFeatures(page)).toHaveLength(1);
});

test("invalid crossings keep the draft and can be corrected with undo", async ({ page }) => {
  await page.goto("/");
  await openDrawing(page);
  for (const [x, y] of [[180, 300], [420, 450], [180, 450], [420, 300]]) {
    await clickPoint(page, x, y);
  }
  const controls = page.getByRole("group", { name: "Weg zeichnen" });
  await expect(controls.getByRole("alert")).toContainText("Der Weg darf sich nicht kreuzen");
  await controls.getByRole("button", { name: "Speichern", exact: true }).click();
  expect(await readFeatures(page)).toHaveLength(0);
  await expect(controls).toBeVisible();
  await controls.getByRole("button", { name: "Punkt zurücknehmen" }).click();
  await expect(controls.getByRole("alert")).toHaveCount(0);
  await controls.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByRole("form", { name: "Flächendetails" }).getByLabel("Typ")).toHaveValue("path");
  expect(await readFeatures(page)).toHaveLength(1);
});

test("generated path polygons use existing parent and overlap rules", async ({ page }) => {
  await page.route("**/api/map-features*", route => route.fulfill({ json: { features: [{
    id: "parent", name: "Testfläche", type: "area", createdAt: new Date().toISOString(),
    geometry: { type: "Polygon", coordinates: [[[9.42, 54.78], [9.44, 54.78], [9.44, 54.79], [9.42, 54.79], [9.42, 54.78]]] },
  }] } }));
  await page.goto("/");
  const polygon = page.locator(".leaflet-overlay-pane path").first();
  await expect(polygon).toBeVisible();
  // Initial bounds fit animates the map.
  await page.waitForTimeout(800);
  const box = await polygon.boundingBox();
  const mapBox = await page.locator(".map").boundingBox();
  if (!box || !mapBox) throw new Error("Map missing");
  const y = box.y + box.height * 0.65;
  await openDrawing(page);
  await page.mouse.click(box.x + box.width * 0.35, y);
  await page.mouse.click(box.x + box.width * 0.65, y);
  await expect(page.getByText('Wird als Unterobjekt von „Testfläche“ gespeichert.')).toBeVisible();
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByRole("form", { name: "Flächendetails" })).toBeVisible();
  expect((await readFeatures(page))[0].parentFeatureId).toBe("parent");
  await page.getByRole("button", { name: "Flächendetails schließen" }).click();
  await openDrawing(page);
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.8);
  await page.mouse.click(box.x - 20, box.y + box.height * 0.8);
  const controls = page.getByRole("group", { name: "Weg zeichnen" });
  await expect(controls.getByRole("alert")).toContainText("überlappt „Testfläche“");
  await controls.getByRole("button", { name: "Speichern", exact: true }).click();
  expect(await readFeatures(page)).toHaveLength(1);
});

test("a way crossing an existing way becomes its child", async ({ page }) => {
  await page.route("**/api/map-features*", route => route.fulfill({ json: { features: [{
    id: "way", name: "Testweg", type: "path", createdAt: new Date().toISOString(),
    geometry: createPathGeometry(positions([[0, 0], [200, 0]]))!,
  }] } }));
  await page.goto("/");
  const polygon = page.locator(".leaflet-overlay-pane path").first();
  await expect(polygon).toBeVisible();
  // Initial bounds fit animates the map.
  await page.waitForTimeout(800);
  const box = await polygon.boundingBox();
  if (!box) throw new Error("Map missing");
  await openDrawing(page);
  await page.mouse.click(box.x + box.width * 0.5, box.y - 20);
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height + 20);
  await expect(page.getByText('Wird als Unterobjekt von „Testweg“ gespeichert.')).toBeVisible();
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByRole("form", { name: "Flächendetails" })).toBeVisible();
  const [feature] = await readFeatures(page);
  expect(feature.parentFeatureId).toBe("way");
});

test("point limit is explained and drawing can still be saved", async ({ page }) => {
  await page.goto("/");
  await openDrawing(page);
  for (let index = 0; index <= MAX_PATH_POINTS; index++) {
    await clickPoint(page, 180 + index * 2, 350);
  }
  const controls = page.getByRole("group", { name: "Weg zeichnen" });
  await expect(controls.getByRole("alert")).toContainText("höchstens 126 Punkte");
  await controls.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByRole("form", { name: "Flächendetails" })).toBeVisible();
  const [feature] = await readFeatures(page);
  expect(feature.geometry.coordinates[0]).toHaveLength(MAX_PATH_POINTS * 2 + 1);
});

test("shortcut works after closing the objects dialog and cancels active routing", async ({ page }) => {
  await page.goto("/map-features");
  await expect(page.getByRole("dialog", { name: "Meine Objekte" })).toBeVisible();
  await page.getByRole("dialog", { name: "Meine Objekte" }).getByRole("button", { name: "Close" }).click();
  await openDrawing(page);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await page.getByRole("button", { name: "Menü", exact: true }).click();
  await page.getByRole("button", { name: "Route planen", exact: true }).click();
  await expect(page.locator(".routing-panel")).toBeVisible();
  await openDrawing(page);
  await expect(page.locator(".routing-panel")).toHaveCount(0);
});

test("mobile controls fit the viewport and zoom does not change path width", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.locator(".leaflet-control-zoom-in").click();
  await page.waitForTimeout(350);
  await openDrawing(page);
  await clickPoint(page, 70, 300);
  await clickPoint(page, 280, 300);
  const controls = page.getByRole("group", { name: "Weg zeichnen" });
  await expect(controls).toContainText("Die Breite beträgt automatisch 2 Meter.");
  const box = await controls.boundingBox();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  expect(box!.y + box!.height).toBeLessThanOrEqual(812);
  await page.screenshot({ path: testInfo.outputPath("mobile-path-drawing.png") });
  await controls.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByRole("form", { name: "Flächendetails" })).toBeVisible();
  const [feature] = await readFeatures(page);
  expect(distance(feature.geometry.coordinates[0][0], feature.geometry.coordinates[0][3])).toBeCloseTo(2, 3);
});
