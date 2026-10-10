import { expect, test } from "@playwright/test";

const start = { latitude: 54.7744, longitude: 9.4360 };
const end = { latitude: 54.7893, longitude: 9.4320 };

test("self-hosted engine routes between Flensburg locations", async ({ request }) => {
  const response = await request.post("/api/routes", { data: { start, end } });
  expect(response.status()).toBe(200);
  const route = await response.json();
  expect(route.geometry.type).toBe("LineString");
  expect(route.geometry.coordinates.length).toBeGreaterThan(2);
  expect(route.distanceMeters).toBeGreaterThan(1000);
  expect(route.distanceMeters).toBeLessThan(4000);
  expect(route.snappedStart.latitude).toBeCloseTo(start.latitude, 3);
  expect(route.snappedEnd.longitude).toBeCloseTo(end.longitude, 3);

  const outside = await request.post("/api/routes", { data: {
    start: { latitude: 52.52, longitude: 13.405 },
    end: { latitude: 52.53, longitude: 13.41 },
  } });
  expect(outside.status()).toBe(422);
  expect((await outside.json()).code).toBe("no_route");
});

test("map endpoint selection renders the real Flensburg walking route", async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", route => route.abort());
  await page.route("**/api/map-features?*", route => route.fulfill({ json: { features: [] } }));
  await page.route("**/api/observations?*", route => route.fulfill({ json: {
    observations: [start, end].map((location, index) => ({
      id: `routing-fixture-${index}`, location,
      accessibility: { wheelchairAccessible: null }, comment: "Routing fixture",
    })), nextCursor: null,
  } }));
  await page.goto("http://127.0.0.1:5173/");
  await page.getByRole("button", { name: "Menü", exact: true }).click();
  await page.getByRole("button", { name: "Route planen", exact: true }).click();
  await page.locator(".observation-marker").nth(0).press("Enter");
  await expect(page.getByText("Wählen Sie das Ziel auf der Karte.")).toBeVisible();
  await page.locator(".observation-marker").nth(1).press("Enter");
  await expect(page.getByText(/Kürzester Fußweg: .* km/)).toBeVisible();
  await expect(page.locator(".walking-route")).toHaveCount(1);
  await expect(page.locator(".route-marker")).toHaveCount(2);
  await expect(page.locator(".route-connector")).toHaveCount(2);
});
