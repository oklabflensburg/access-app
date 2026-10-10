import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", route => route.abort());
  await page.route("**/api/observations?*", route => route.fulfill({ json: { observations: [], nextCursor: null } }));
  await page.route("**/api/map-features?*", route => route.fulfill({ json: { features: [] } }));
});

function result(start: { latitude: number; longitude: number }, end: { latitude: number; longitude: number }, distanceMeters = 1234) {
  return {
    geometry: { type: "LineString", coordinates: [[start.longitude, start.latitude], [start.longitude, end.latitude], [end.longitude, end.latitude]] },
    distanceMeters, snappedStart: start, snappedEnd: end,
  };
}

async function openRouting(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Menü", exact: true }).click();
  await page.getByRole("button", { name: "Route planen", exact: true }).click();
  await expect(page.getByText("Wählen Sie den Startpunkt auf der Karte.")).toBeVisible();
}

async function clickPoint(page: Page, x: number, y: number) {
  const bounds = await page.locator(".map").boundingBox();
  if (!bounds) throw new Error("Map missing");
  await page.mouse.click(bounds.x + bounds.width * x, bounds.y + bounds.height * y);
}

test("two clicks show a walking route; endpoints can be changed and cleared", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/routes", route => {
    calls++;
    const { start, end } = route.request().postDataJSON();
    expect(start.latitude).toBeGreaterThan(54);
    expect(start.longitude).toBeLessThan(10);
    return route.fulfill({ json: result(start, end) });
  });
  await openRouting(page);
  await clickPoint(page, 0.2, 0.55);
  await expect(page.getByText("Wählen Sie das Ziel auf der Karte.")).toBeVisible();
  await expect(page.locator(".route-marker")).toHaveCount(1);
  expect(calls).toBe(0);
  await clickPoint(page, 0.5, 0.75);
  await expect(page.getByText("Kürzester Fußweg: 1,23 km")).toBeVisible();
  await expect(page.locator(".walking-route")).toHaveCount(1);
  await expect(page.locator(".route-marker")).toHaveCount(2);
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "Start ändern", exact: true }).click();
  await expect(page.locator(".walking-route")).toHaveCount(0);
  await clickPoint(page, 0.25, 0.65);
  await expect(page.getByText("Kürzester Fußweg: 1,23 km")).toBeVisible();
  expect(calls).toBe(2);
  await page.getByRole("button", { name: "Route zurücksetzen" }).click();
  await expect(page.locator(".route-marker")).toHaveCount(0);
  await expect(page.locator(".walking-route")).toHaveCount(0);
  await expect(page.getByText("Wählen Sie den Startpunkt auf der Karte.")).toBeVisible();
  await page.getByRole("button", { name: "Routenplanung schließen" }).click();
  await expect(page.locator(".routing-panel")).toHaveCount(0);
});

test("routing errors can be retried and old requests cannot restore a cleared route", async ({ page }) => {
  let calls = 0;
  let release: (() => void) | undefined;
  await page.route("**/api/routes", async route => {
    const { start, end } = route.request().postDataJSON();
    calls++;
    if (calls === 1) return route.fulfill({ status: 422, json: { code: "no_route", error: "No route" } });
    if (calls === 3) await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ json: result(start, end, 350) }).catch(() => {});
  });
  await openRouting(page);
  await clickPoint(page, 0.2, 0.55);
  await clickPoint(page, 0.5, 0.75);
  await expect(page.getByRole("alert")).toContainText("Kein Fußweg gefunden");
  await page.getByRole("button", { name: "Erneut versuchen" }).click();
  await expect(page.getByText("Kürzester Fußweg: 350 m")).toBeVisible();
  await page.getByRole("button", { name: "Ziel ändern", exact: true }).click();
  await clickPoint(page, 0.3, 0.65);
  await expect(page.getByText("Fußweg wird berechnet…")).toBeVisible();
  await expect.poll(() => !!release).toBe(true);
  await page.getByRole("button", { name: "Route zurücksetzen" }).click();
  release!();
  await expect(page.getByText("Wählen Sie den Startpunkt auf der Karte.")).toBeVisible();
  await expect(page.locator(".walking-route")).toHaveCount(0);
});

test("polygon and observation clicks choose route points without opening details", async ({ page }) => {
  await page.route("**/api/map-features?*", route => route.fulfill({ json: { features: [{
    id: "polygon", name: "Test area", type: "area", createdAt: new Date().toISOString(),
    geometry: { type: "Polygon", coordinates: [[[9.42, 54.78], [9.44, 54.78], [9.44, 54.79], [9.42, 54.79], [9.42, 54.78]]] },
  }] } }));
  await page.route("**/api/observations?*", route => route.fulfill({ json: { observations: [{
    id: "public-observation", location: { latitude: 54.785, longitude: 9.43 },
    accessibility: { wheelchairAccessible: true }, comment: "Public observation",
  }], nextCursor: null } }));
  await page.route("**/api/routes", route => {
    const { start, end } = route.request().postDataJSON();
    return route.fulfill({ json: result(start, end) });
  });
  await openRouting(page);
  await page.locator(".observation-marker").click();
  await expect(page.getByText("Wählen Sie das Ziel auf der Karte.")).toBeVisible();
  await expect(page.locator(".leaflet-popup")).toHaveCount(0);
  // The polygon fills the visible map after initial bounds fit to the observation.
  await clickPoint(page, 0.3, 0.65);
  await expect(page.getByText("Kürzester Fußweg: 1,23 km")).toBeVisible();
  await expect(page.locator(".feature-panel")).toHaveCount(0);
});

test("other map workflows cancel routing and remain usable", async ({ page }) => {
  await openRouting(page);
  await clickPoint(page, 0.2, 0.55);
  await page.getByRole("button", { name: "Menü", exact: true }).click();
  await page.getByRole("button", { name: "Anlegen", exact: true }).click();
  await expect(page.locator(".routing-panel")).toHaveCount(0);
  await expect(page.locator(".route-marker")).toHaveCount(0);
  await clickPoint(page, 0.2, 0.55);
  await expect(page.getByRole("button", { name: "Punkt zurücknehmen" })).toBeEnabled();
  await page.getByRole("button", { name: "Menü", exact: true }).click();
  await page.getByRole("button", { name: "Route planen", exact: true }).click();
  await expect(page.getByRole("button", { name: "Punkt zurücknehmen" })).toHaveCount(0);
  await page.getByRole("button", { name: "Menü", exact: true }).click();
  await page.getByRole("button", { name: "Beobachtung anlegen", exact: true }).click();
  await expect(page.locator(".routing-panel")).toHaveCount(0);
  await clickPoint(page, 0.2, 0.55);
  await expect(page).toHaveURL(/observation\/new\?latitude=/);
});

test("keyboard users can select the map center and identical points are rejected", async ({ page }) => {
  await openRouting(page);
  await page.getByRole("button", { name: "Kartenmitte wählen" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Wählen Sie das Ziel auf der Karte.")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toContainText("Start und Ziel müssen verschieden sein");
});

test("offline routing is retryable and the mobile panel fits the screen", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRouting(page);
  await context.setOffline(true);
  await clickPoint(page, 0.2, 0.55);
  await clickPoint(page, 0.5, 0.75);
  await expect(page.getByRole("alert")).toContainText("Für eine neue Route ist eine Verbindung zum Server erforderlich");
  await expect(page.getByRole("button", { name: "Erneut versuchen" })).toBeVisible();
  const box = await page.locator(".routing-panel").boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
});
