import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", route => route.abort());
  await page.route("**/api/observations?*", route => route.fulfill({ json: { observations: [], nextCursor: null } }));
  await page.route("**/api/map-features?*", route => route.fulfill({ json: { features: [] } }));
});

function preference(wheelchairAccessible: boolean, revision: number) {
  return {
    id: "routing",
    wheelchairAccessible,
    revision,
    updatedAt: "2026-10-10T10:00:00.000Z",
  };
}

async function openMenu(page: Page) {
  await page.getByRole("button", { name: "Menü", exact: true }).click();
}

async function openPreferences(page: Page) {
  await page.goto("/");
  await openMenu(page);
  await page.getByRole("link", { name: "Routeneinstellungen" }).click();
  return page.getByRole("switch", { name: "Rollstuhlgerechte Wege bevorzugen" });
}

async function clickPoint(page: Page, x: number, y: number) {
  const bounds = await page.locator(".map").boundingBox();
  if (!bounds) throw new Error("Map missing");
  await page.mouse.click(bounds.x + bounds.width * x, bounds.y + bounds.height * y);
}

test("the wheelchair preference is saved locally, synced, and sent with route requests", async ({ page }) => {
  let remote = preference(false, 0);
  let uploads = 0;
  await page.route("**/api/preferences/routing", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: remote });
    const body = route.request().postDataJSON();
    expect(body.revision).toBeGreaterThan(remote.revision);
    remote = preference(body.wheelchairAccessible, body.revision);
    uploads++;
    return route.fulfill({ json: remote });
  });
  let routeBody: { wheelchairAccessible?: boolean } | undefined;
  await page.route("**/api/routes", async route => {
    routeBody = route.request().postDataJSON();
    const { start, end } = routeBody;
    return route.fulfill({
      json: {
        geometry: {
          type: "LineString",
          coordinates: [[start.longitude, start.latitude], [end.longitude, end.latitude]],
        },
        distanceMeters: 1234,
        snappedStart: start,
        snappedEnd: end,
      },
    });
  });

  const toggle = await openPreferences(page);
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  expect(uploads).toBe(0);

  await page.keyboard.press("Escape");
  await openMenu(page);
  await page.getByRole("button", { name: /Synchronisieren/ }).click();
  await expect.poll(() => uploads).toBe(1);

  await page.getByRole("button", { name: "Route planen", exact: true }).click();
  await clickPoint(page, 0.2, 0.55);
  await clickPoint(page, 0.5, 0.75);
  await expect(page.getByText("Kürzester Fußweg: 1,23 km")).toBeVisible();
  expect(routeBody?.wheelchairAccessible).toBe(true);

  await page.reload();
  const reloaded = await openPreferences(page);
  await expect(reloaded).toHaveAttribute("aria-checked", "true");
});
