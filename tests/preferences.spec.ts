import { expect, test, type Page } from "@playwright/test";

const featureTypes = ["area", "building", "entrance", "staircase", "ramp", "toilet", "elevator", "path"] as const;

function preference(priorities: Record<string, string>, revision: number) {
  return {
    id: "routing",
    featurePriorities: {
      ...Object.fromEntries(featureTypes.map((type) => [type, "neutral"])),
      ...priorities,
    },
    revision,
    updatedAt: "2026-10-10T10:00:00.000Z",
  };
}

test.beforeEach(async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", route => route.abort());
  await page.route("**/api/observations?*", route => route.fulfill({ json: { observations: [], nextCursor: null } }));
  await page.route("**/api/map-features?*", route => route.fulfill({ json: { features: [{
    id: "staircase-1",
    type: "staircase",
    name: "Steps",
    createdAt: "2026-10-10T10:00:00.000Z",
    geometry: { type: "Polygon", coordinates: [[[9.43, 54.78], [9.44, 54.78], [9.44, 54.79], [9.43, 54.78]]] },
  }] } }));
});

async function openMenu(page: Page) {
  await page.getByRole("button", { name: "Menü", exact: true }).click();
}

async function openPreferences(page: Page) {
  await page.goto("/");
  await openMenu(page);
  await page.getByRole("link", { name: "Routeneinstellungen" }).click();
}

async function setPriority(page: Page, typeLabel: string, priorityLabel: string) {
  const field = page.locator(".preference-field", { hasText: typeLabel });
  await field.getByRole("combobox").click();
  await page.getByRole("option", { name: priorityLabel, exact: true }).click();
  await page.locator(".p-select-overlay").waitFor({ state: "detached" });
  await expect(field).toContainText(priorityLabel);
}

async function clickPoint(page: Page, x: number, y: number) {
  const bounds = await page.locator(".map").boundingBox();
  if (!bounds) throw new Error("Map missing");
  await page.mouse.click(bounds.x + bounds.width * x, bounds.y + bounds.height * y);
}

test("feature type priorities are saved locally, synced, and sent with route requests", async ({ page }) => {
  let remote = preference({}, 0);
  let uploads = 0;
  await page.route("**/api/preferences/routing", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: remote });
    const body = route.request().postDataJSON();
    expect(body.revision).toBeGreaterThan(remote.revision);
    remote = preference(body.featurePriorities, body.revision);
    uploads++;
    return route.fulfill({ json: remote });
  });
  let routeBody: { featurePriorities?: Record<string, string>; priorityAreas?: { priority: string; geometry: unknown }[] } | undefined;
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

  await openPreferences(page);
  await setPriority(page, "Treppe", "Vermeiden");
  expect(uploads).toBe(0);

  // Escape is swallowed by the focused Select (PrimeVue stops propagation),
  // so close the dialog the way a user would: by clicking the mask.
  await page.locator(".p-dialog-mask").click({ position: { x: 8, y: 8 } });
  await openMenu(page);
  await page.getByRole("button", { name: /Synchronisieren/ }).click();
  await expect.poll(() => uploads).toBe(1);

  await page.getByRole("button", { name: "Route planen", exact: true }).click();
  await clickPoint(page, 0.2, 0.55);
  await clickPoint(page, 0.5, 0.75);
  await expect(page.getByText("Kürzester Fußweg: 1,23 km")).toBeVisible();
  expect(routeBody?.featurePriorities?.staircase).toBe("avoid");
  expect(routeBody?.priorityAreas).toEqual([{
    priority: "avoid",
    geometry: {
      type: "Polygon",
      coordinates: [[[9.43, 54.78], [9.44, 54.78], [9.44, 54.79], [9.43, 54.78]]],
    },
  }]);

  await page.reload();
  await openPreferences(page);
  await expect(page.locator(".preference-field", { hasText: "Treppe" })).toContainText("Vermeiden");
});
