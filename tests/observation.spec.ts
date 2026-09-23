import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // External map tiles are not needed for testing local data collection.
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
});

test("draws a polygon and queues it for permanent storage", async ({ page }) => {
  await page.route("**/api/map-features*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { features: [] } });
      return;
    }
    const payload = route.request().postDataJSON();
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    await route.fulfill({ json: { id: payload.id } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Menü" }).click();
  await page.getByRole("button", { name: "Fläche zeichnen" }).click();
  const map = page.locator(".map");
  const bounds = await map.boundingBox();
  if (!bounds) throw new Error("Map is not visible");

  await page.mouse.click(bounds.x + 180, bounds.y + 160);
  await page.mouse.click(bounds.x + 300, bounds.y + 160);
  await page.mouse.click(bounds.x + 240, bounds.y + 260);
  await page.getByLabel("Name").fill("Nordrampe");
  await page.getByLabel("Typ").selectOption("ramp");
  const requestPromise = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/map-features") &&
      request.method() === "POST",
  );
  await page.getByRole("button", { name: "Schließen und speichern" }).click();
  const saved = (await requestPromise).postDataJSON();

  await expect(page.getByText("Fläche wurde dauerhaft gespeichert.")).toBeVisible();
  expect(saved?.geometry.type).toBe("Polygon");
  expect(saved?.name).toBe("Nordrampe");
  expect(saved?.type).toBe("ramp");
  expect(saved?.geometry.coordinates[0]).toHaveLength(4);
  expect(saved?.geometry.coordinates[0][0]).toEqual(
    saved?.geometry.coordinates[0][3],
  );
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(1);
  await page.locator(".leaflet-overlay-pane path").click({ force: true });
  const details = page.getByRole("form", { name: "Flächendetails" });
  await expect(details.getByLabel("Name")).toHaveValue("Nordrampe");
  await expect(details.getByLabel("Typ")).toHaveValue("ramp");
  await details.getByLabel("Name").fill("Nordeingang");
  await details.getByLabel("Typ").selectOption("entrance");
  const updateRequest = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/map-features") &&
      request.method() === "POST" &&
      request.postDataJSON().name === "Nordeingang",
  );
  await details.getByRole("button", { name: "Änderungen speichern" }).click();
  const updated = (await updateRequest).postDataJSON();
  expect(updated?.name).toBe("Nordeingang");
  expect(updated?.type).toBe("entrance");
  await expect(page.getByText("Die Flächendetails wurden aktualisiert.")).toBeVisible();

  const local = await page.evaluate(async () => {
    const request = indexedDB.open("accessapp");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = db.transaction("mapFeatures").objectStore("mapFeatures").getAll();
    return await new Promise<any[]>((resolve) => {
      read.onsuccess = () => resolve(read.result);
    });
  });
  expect(local).toHaveLength(1);
  expect(local[0].syncStatus).toBe("synced");
  expect(local[0].name).toBe("Nordeingang");
  expect(local[0].type).toBe("entrance");
});

test("opens a new observation at a long-pressed map point", async ({ page }) => {
  await page.goto("/");
  const map = page.locator(".map");
  const bounds = await map.boundingBox();
  if (!bounds) throw new Error("Map is not visible");

  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(750);
  await page.mouse.up();

  await expect(page).toHaveURL(
    /\/observation\/new\?latitude=[^&]+&longitude=[^&]+/,
  );
  const url = new URL(page.url());
  const latitude = Number(url.searchParams.get("latitude"));
  const longitude = Number(url.searchParams.get("longitude"));
  await expect(
    page.getByText(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`),
  ).toBeVisible();
});

test("captures a fresh location, saves the questionnaire, and restores its marker after reload", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 52.5201,
    longitude: 13.4049,
    accuracy: 8,
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Use my location" }).click();
  await expect(page.getByText("Within 8 m")).toBeVisible();
  await context.setGeolocation({
    latitude: 52.5212,
    longitude: 13.4058,
    accuracy: 5,
  });
  await page
    .getByRole("link", { name: "+ Add accessibility information" })
    .click();
  await expect(page.getByText("52.521200, 13.405800")).toBeVisible();
  await page
    .getByRole("group", { name: "Wheelchair accessible?", exact: true })
    .getByLabel("Yes", { exact: true })
    .check();
  await page
    .getByRole("group", { name: "Steps at entrance?", exact: true })
    .getByLabel("0", { exact: true })
    .check();
  await page
    .getByRole("group", { name: "Accessible toilet?", exact: true })
    .getByLabel("No", { exact: true })
    .check();
  await page.getByLabel("Surface", { exact: true }).selectOption("smooth");
  await page
    .getByLabel("Comment")
    .fill("<img src=x onerror=alert(1)> Side entrance");
  await page
    .getByRole("button", { name: "Save observation on this device" })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Observation saved on this device." }),
  ).toBeVisible();
  await expect(
    page.getByText("Saved observations (1)", { exact: false }),
  ).toBeVisible();
  await page.reload();
  const marker = page.getByRole("button", {
    name: "Observation 1: Wheelchair accessible",
    exact: true,
  });
  await expect(marker).toBeVisible();
  await marker.click();
  await expect(
    page.getByText("<img src=x onerror=alert(1)> Side entrance", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".leaflet-popup-content img")).toHaveCount(0);
  const rows = await page.evaluate(async () => {
    const request = indexedDB.open("accessapp");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = db
      .transaction("observations")
      .objectStore("observations")
      .getAll();
    return new Promise<any[]>((resolve) => {
      read.onsuccess = () => {
        db.close();
        resolve(read.result);
      };
    });
  });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    location: { latitude: 52.5212, longitude: 13.4058, accuracy: 5 },
    accessibility: {
      wheelchairAccessible: true,
      steps: 0,
      accessibleToilet: false,
      ramp: null,
      elevator: null,
      surface: "smooth",
    },
    syncStatus: "ready",
  });
});

test("denied location is explained and retry preserves answers", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let attempts = 0;
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition(
          success: PositionCallback,
          failure: PositionErrorCallback,
        ) {
          if (attempts++ === 0)
            failure({ code: 1 } as GeolocationPositionError);
          else
            success({
              coords: {
                latitude: 51,
                longitude: 7,
                accuracy: 12,
                altitude: null,
                altitudeAccuracy: null,
                heading: null,
                speed: null,
              },
              timestamp: Date.now(),
            } as GeolocationPosition);
        },
      },
    });
  });
  await page.goto("/observation/new");
  await expect(page.getByRole("alert")).toContainText(
    "Location permission was denied",
  );
  await expect(
    page.getByRole("button", { name: "Save observation on this device" }),
  ).toBeDisabled();
  await page.getByLabel("Comment").fill("Keep these answers");
  await page.getByRole("button", { name: "Try location again" }).click();
  await expect(page.getByLabel("Comment")).toHaveValue("Keep these answers");
  await expect(
    page.getByRole("button", { name: "Save observation on this device" }),
  ).toBeEnabled();
});

test("temporarily unavailable location falls back to a network position", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let attempts = 0;
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition(
          success: PositionCallback,
          failure: PositionErrorCallback,
          options?: PositionOptions,
        ) {
          if (attempts++ === 0) {
            failure({
              code: 2,
              POSITION_UNAVAILABLE: 2,
            } as GeolocationPositionError);
            return;
          }
          if (options?.enableHighAccuracy)
            throw new Error("Fallback should use normal accuracy");
          success({
            coords: {
              latitude: 52.52,
              longitude: 13.405,
              accuracy: 75,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          } as GeolocationPosition);
        },
      },
    });
  });

  await page.goto("/observation/new");
  await expect(page.getByText("52.520000, 13.405000")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save observation on this device" }),
  ).toBeEnabled();
});

test("manual coordinates allow collection when CoreLocation stays unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition(
          _success: PositionCallback,
          failure: PositionErrorCallback,
        ) {
          failure({ code: 2 } as GeolocationPositionError);
        },
      },
    });
  });

  await page.goto("/observation/new");
  await expect(page.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await page.getByLabel("Latitude").fill("52.5208");
  await page.getByLabel("Longitude").fill("13.4095");
  await page.getByRole("button", { name: "Use these coordinates" }).click();

  await expect(page.getByText("52.520800, 13.409500")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save observation on this device" }),
  ).toBeEnabled();
});

test("saves locally while offline without duplicate submissions", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 52, longitude: 13 });
  await page.goto("/observation/new");
  const save = page.getByRole("button", {
    name: "Save observation on this device",
  });
  await expect(save).toBeEnabled();
  await context.setOffline(true);
  await save.dblclick();
  await expect(
    page.getByText("Saved observations (1)", { exact: false }),
  ).toBeVisible();
});

test("storage failure keeps the questionnaire available for retry", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 52, longitude: 13 });
  await page.addInitScript(() => {
    IDBObjectStore.prototype.add = function () {
      throw new DOMException("Storage full", "QuotaExceededError");
    };
  });
  await page.goto("/observation/new");
  await page.getByLabel("Comment").fill("Do not lose this comment");
  await page
    .getByRole("button", { name: "Save observation on this device" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Could not save on this device",
  );
  await expect(page.getByLabel("Comment")).toHaveValue(
    "Do not lose this comment",
  );
  await expect(
    page.getByRole("button", { name: "Save observation on this device" }),
  ).toBeEnabled();
});

test("mobile layout fits the viewport and keyboard can reach the questionnaire", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("link", { name: "+ Add accessibility information" })
    .click();
  await expect(
    page.getByRole("heading", { name: "New observation" }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
