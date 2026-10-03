import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // External map tiles are not needed for testing local data collection.
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
});

test("draws a polygon and queues it for permanent storage", async ({ page }) => {
  let postRequests = 0;
  await page.route("**/api/map-features*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { features: [] } });
      return;
    }
    if (route.request().method() === "DELETE") {
      await route.fulfill({
        json: { id: route.request().url().split("/").at(-1) },
      });
      return;
    }
    const payload = route.request().postDataJSON();
    postRequests++;
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    await route.fulfill({ json: { id: payload.id } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Menü" }).click();
  await page.getByRole("button", { name: "Anlegen", exact: true }).click();
  const map = page.locator(".map");
  const bounds = await map.boundingBox();
  if (!bounds) throw new Error("Map is not visible");

  await page.mouse.click(bounds.x + 180, bounds.y + 160);
  await page.mouse.click(bounds.x + 300, bounds.y + 160);
  await page.mouse.click(bounds.x + 240, bounds.y + 260);
  await page.getByRole("button", { name: "Speichern", exact: true }).click();

  await expect(
    page.getByText("Fläche wurde lokal gespeichert und wird später synchronisiert."),
  ).toBeVisible();
  expect(postRequests).toBe(0);
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(1);
  const details = page.getByRole("form", { name: "Flächendetails" });
  await expect(details.getByLabel("Name")).toHaveValue("");
  await details.getByLabel("Name").fill("Nordeingang");
  await details.getByLabel("Typ").selectOption("entrance");
  await details.getByRole("button", { name: "Änderungen speichern" }).click();
  await expect(
    page.getByText(
      "Die Änderungen wurden lokal gespeichert und werden später synchronisiert.",
    ),
  ).toBeVisible();
  expect(postRequests).toBe(0);

  const syncRequest = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/map-features") &&
      request.method() === "POST" &&
      request.postDataJSON().name === "Nordeingang",
  );
  await page.getByRole("button", { name: "Menü" }).click();
  await page.getByRole("button", { name: /Synchronisieren/ }).click();
  const saved = (await syncRequest).postDataJSON();
  expect(saved?.geometry.type).toBe("Polygon");
  expect(saved?.name).toBe("Nordeingang");
  expect(saved?.type).toBe("entrance");
  expect(saved?.geometry.coordinates[0]).toHaveLength(4);
  expect(saved?.geometry.coordinates[0][0]).toEqual(
    saved?.geometry.coordinates[0][3],
  );
  await expect.poll(() => postRequests).toBe(1);

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

  await page.getByRole("link", { name: "Meine Objekte" }).click();
  await expect(
    page.getByRole("heading", { name: "Meine Objekte" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nordeingang" })).toBeVisible();
  await page.getByRole("button", { name: "Kartenobjekt bearbeiten" }).click();
  const editDialog = page.getByRole("dialog", { name: "Meine Objekte" });
  await editDialog.getByLabel("Name").fill("Nordrampe barrierefrei");
  await editDialog.getByLabel("Typ").selectOption("ramp");
  await editDialog.getByRole("button", { name: "Änderungen speichern" }).click();
  await expect(
    page.getByRole("heading", { name: "Nordrampe barrierefrei" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Kartenobjekt löschen" }).click();
  await page.getByRole("button", { name: "Löschen bestätigen" }).click();
  await expect(page.getByText("Noch keine Kartenobjekte.")).toBeVisible();
  await page
    .getByRole("dialog", { name: "Meine Objekte" })
    .getByRole("button", { name: "Close" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const deleteRequest = page.waitForRequest(
    (request) =>
      request.method() === "DELETE" &&
      request.url().includes(`/api/map-features/${saved.id}`),
  );
  await page.getByRole("button", { name: "Menü" }).click();
  await page.getByRole("button", { name: /Synchronisieren/ }).click();
  await deleteRequest;
});

async function readMapFeatures(page: import("@playwright/test").Page) {
  return await page.evaluate(async () => {
    const request = indexedDB.open("accessapp");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = db
      .transaction("mapFeatures")
      .objectStore("mapFeatures")
      .getAll();
    return await new Promise<any[]>((resolve) => {
      read.onsuccess = () => resolve(read.result);
    });
  });
}

test("saves a feature drawn inside an existing one as its subobject", async ({
  page,
}) => {
  const posted: any[] = [];
  await page.route("**/api/map-features*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { features: [] } });
      return;
    }
    if (route.request().method() === "DELETE") {
      await route.fulfill({
        json: { id: route.request().url().split("/").at(-1) },
      });
      return;
    }
    const payload = route.request().postDataJSON();
    posted.push(payload);
    await route.fulfill({ json: { id: payload.id } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Menü" }).click();
  await page.getByRole("button", { name: "Anlegen", exact: true }).click();
  const map = page.locator(".map");
  const bounds = await map.boundingBox();
  if (!bounds) throw new Error("Map is not visible");

  await page.mouse.click(bounds.x + 200, bounds.y + 150);
  await page.mouse.click(bounds.x + 420, bounds.y + 150);
  await page.mouse.click(bounds.x + 310, bounds.y + 300);
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(
    page.getByText("Fläche wurde lokal gespeichert und wird später synchronisiert."),
  ).toBeVisible();

  const details = page.getByRole("form", { name: "Flächendetails" });
  await details.getByLabel("Name").fill("Hauptgebäude");
  await details.getByLabel("Typ").selectOption("building");
  await details.getByRole("button", { name: "Änderungen speichern" }).click();
  await page.getByRole("button", { name: "Flächendetails schließen" }).click();

  // Saving refits the map to the drawn feature; wait for the animation to settle.
  await page.waitForTimeout(800);
  const polygonBox = await page
    .locator(".leaflet-overlay-pane path")
    .first()
    .boundingBox();
  if (!polygonBox) throw new Error("The drawn feature is not rendered");
  const centerX = polygonBox.x + polygonBox.width / 2;
  const centerY = polygonBox.y + polygonBox.height / 3;
  const delta = Math.min(polygonBox.width, polygonBox.height) * 0.1;

  await page.getByRole("button", { name: "Menü" }).click();
  await page.getByRole("button", { name: "Anlegen", exact: true }).click();
  await page.mouse.click(centerX - delta, centerY);
  await page.mouse.click(centerX + delta, centerY);
  await page.mouse.click(centerX, centerY + delta * 1.5);
  await expect(
    page.getByText('Wird als Unterobjekt von „Hauptgebäude“ gespeichert.'),
  ).toBeVisible();
  await page.getByRole("button", { name: "Speichern", exact: true }).click();

  await expect(
    page.getByText(
      'Das Objekt wurde als Unterobjekt von „Hauptgebäude“ lokal gespeichert und wird später synchronisiert.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Übergeordnetes Objekt anzeigen" }),
  ).toBeVisible();
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(2);

  await page.getByRole("button", { name: "Menü" }).click();
  await page.getByRole("button", { name: /Synchronisieren/ }).click();
  await expect.poll(() => posted.length).toBe(2);
  const parent = posted.find((payload) => !payload.parentFeatureId);
  const child = posted.find((payload) => payload.parentFeatureId);
  expect(parent?.name).toBe("Hauptgebäude");
  expect(child?.parentFeatureId).toBe(parent?.id);
  expect(posted.indexOf(child)).toBeGreaterThan(posted.indexOf(parent));

  const local = await readMapFeatures(page);
  expect(local).toHaveLength(2);
  const localChild = local.find((feature) => feature.parentFeatureId);
  const localParent = local.find((feature) => !feature.parentFeatureId);
  expect(localChild.parentFeatureId).toBe(localParent.id);
});

test("clicking a subobject first selects it and then its parent", async ({
  page,
}) => {
  await page.route("**/api/map-features*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { features: [] } });
      return;
    }
    if (route.request().method() === "DELETE") {
      await route.fulfill({
        json: { id: route.request().url().split("/").at(-1) },
      });
      return;
    }
    const payload = route.request().postDataJSON();
    await route.fulfill({ json: { id: payload.id } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Menü" }).click();
  await page.getByRole("button", { name: "Anlegen", exact: true }).click();
  const map = page.locator(".map");
  const bounds = await map.boundingBox();
  if (!bounds) throw new Error("Map is not visible");

  await page.mouse.click(bounds.x + 200, bounds.y + 150);
  await page.mouse.click(bounds.x + 420, bounds.y + 150);
  await page.mouse.click(bounds.x + 310, bounds.y + 300);
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(
    page.getByText("Fläche wurde lokal gespeichert und wird später synchronisiert."),
  ).toBeVisible();

  const details = page.getByRole("form", { name: "Flächendetails" });
  await details.getByLabel("Name").fill("Hauptgebäude");
  await details.getByLabel("Typ").selectOption("building");
  await details.getByRole("button", { name: "Änderungen speichern" }).click();
  await page.getByRole("button", { name: "Flächendetails schließen" }).click();

  // Saving refits the map to the drawn feature; wait for the animation to settle.
  await page.waitForTimeout(800);
  const parentBox = await page
    .locator(".leaflet-overlay-pane path")
    .first()
    .boundingBox();
  if (!parentBox) throw new Error("The drawn feature is not rendered");
  const centerX = parentBox.x + parentBox.width / 2;
  const centerY = parentBox.y + parentBox.height / 3;
  const delta = Math.min(parentBox.width, parentBox.height) * 0.1;

  await page.getByRole("button", { name: "Menü" }).click();
  await page.getByRole("button", { name: "Anlegen", exact: true }).click();
  await page.mouse.click(centerX - delta, centerY);
  await page.mouse.click(centerX + delta, centerY);
  await page.mouse.click(centerX, centerY + delta * 1.5);
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(
    page.getByText(
      'Das Objekt wurde als Unterobjekt von „Hauptgebäude“ lokal gespeichert und wird später synchronisiert.',
    ),
  ).toBeVisible();
  await details.getByLabel("Name").fill("Eingang");
  await details.getByRole("button", { name: "Änderungen speichern" }).click();
  await page.getByRole("button", { name: "Flächendetails schließen" }).click();

  // Saving refits the map to the drawn features; wait for the animation to settle.
  await page.waitForTimeout(800);
  const boxes = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".leaflet-overlay-pane path")).map(
      (path) => {
        const box = path.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      },
    ),
  );
  const childBox = boxes.reduce((smallest, box) =>
    box.width * box.height < smallest.width * smallest.height ? box : smallest,
  );
  const clickX = childBox.x + childBox.width / 2;
  const clickY = childBox.y + childBox.height / 2;

  await page.mouse.click(clickX, clickY);
  await expect(details.getByLabel("Name")).toHaveValue("Eingang");
  await expect(
    page.getByRole("button", { name: "Übergeordnetes Objekt anzeigen" }),
  ).toBeVisible();

  await page.mouse.click(clickX, clickY);
  await expect(details.getByLabel("Name")).toHaveValue("Hauptgebäude");
  await expect(
    page.getByRole("button", { name: "Übergeordnetes Objekt anzeigen" }),
  ).toHaveCount(0);
});

test("rejects a feature that only partially overlaps an existing one", async ({
  page,
}) => {
  await page.route("**/api/map-features*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { features: [] } });
      return;
    }
    const payload = route.request().postDataJSON();
    await route.fulfill({ json: { id: payload.id } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Menü" }).click();
  await page.getByRole("button", { name: "Anlegen", exact: true }).click();
  const map = page.locator(".map");
  const bounds = await map.boundingBox();
  if (!bounds) throw new Error("Map is not visible");

  await page.mouse.click(bounds.x + 200, bounds.y + 150);
  await page.mouse.click(bounds.x + 420, bounds.y + 150);
  await page.mouse.click(bounds.x + 310, bounds.y + 300);
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(
    page.getByText("Fläche wurde lokal gespeichert und wird später synchronisiert."),
  ).toBeVisible();

  const details = page.getByRole("form", { name: "Flächendetails" });
  await details.getByLabel("Name").fill("Hauptgebäude");
  await details.getByLabel("Typ").selectOption("building");
  await details.getByRole("button", { name: "Änderungen speichern" }).click();
  await page.getByRole("button", { name: "Flächendetails schließen" }).click();

  // Saving refits the map to the drawn feature; wait for the animation to settle.
  await page.waitForTimeout(800);
  const polygonBox = await page
    .locator(".leaflet-overlay-pane path")
    .first()
    .boundingBox();
  if (!polygonBox) throw new Error("The drawn feature is not rendered");
  const centerX = polygonBox.x + polygonBox.width / 2;
  const centerY = polygonBox.y + polygonBox.height / 3;
  const delta = Math.min(polygonBox.width, polygonBox.height) * 0.1;

  await page.getByRole("button", { name: "Menü" }).click();
  await page.getByRole("button", { name: "Anlegen", exact: true }).click();
  await page.mouse.click(centerX - delta, centerY);
  await page.mouse.click(centerX + delta, centerY);
  // The third point lies left of the existing polygon, so the drawing only partially overlaps it.
  await page.mouse.click(
    polygonBox.x + polygonBox.width * 0.05,
    polygonBox.y + polygonBox.height * 0.25,
  );
  await expect(
    page.getByText('Die neue Fläche überlappt „Hauptgebäude“'),
  ).toBeVisible();

  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(
    page.getByText('Die neue Fläche überlappt „Hauptgebäude“'),
  ).toBeVisible();
  const local = await readMapFeatures(page);
  expect(local).toHaveLength(1);
  expect(local[0].name).toBe("Hauptgebäude");

  await page.getByRole("button", { name: "Abbrechen" }).click();
  await expect(
    page.getByRole("button", { name: "Speichern", exact: true }),
  ).toHaveCount(0);
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

async function readObservations(page: import("@playwright/test").Page) {
  return await page.evaluate(async () => {
    const request = indexedDB.open("accessapp");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = db
      .transaction("observations")
      .objectStore("observations")
      .getAll();
    return await new Promise<any[]>((resolve) => {
      read.onsuccess = () => resolve(read.result);
    });
  });
}

async function mockEmptyPublicApi(page: import("@playwright/test").Page) {
  await page.route("**/api/observations*", (route) => {
    if (route.request().method() !== "GET") {
      return route.fulfill({ json: { id: "uploaded", revision: 2 } });
    }
    return route.fulfill({ json: { observations: [], nextCursor: null } });
  });
  await page.route("**/api/map-features*", (route) => {
    if (route.request().method() !== "GET") {
      return route.fulfill({ json: { id: "uploaded" } });
    }
    return route.fulfill({ json: { features: [] } });
  });
}

test("captures a fresh location, saves the questionnaire, and restores its marker after reload", async ({
  page,
  context,
}) => {
  await mockEmptyPublicApi(page);
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 52.5201,
    longitude: 13.4049,
    accuracy: 8,
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Standort", exact: true }).click();
  await expect(page.locator(".position-marker")).toBeVisible();
  await context.setGeolocation({
    latitude: 52.5212,
    longitude: 13.4058,
    accuracy: 5,
  });
  await page.getByRole("button", { name: "Menü" }).click();
  await page.getByRole("link", { name: "Anlegen" }).click();
  await expect(page.getByText("52.521200, 13.405800")).toBeVisible();
  await expect(page.getByText("± 5 m")).toBeVisible();
  await page
    .getByRole("group", { name: "Rollstuhlgerecht?" })
    .getByLabel("Ja", { exact: true })
    .check();
  await page
    .getByRole("group", { name: "Stufen am Eingang?" })
    .getByLabel("0", { exact: true })
    .check();
  await page
    .getByRole("group", { name: "Barrierefreies WC?" })
    .getByLabel("Nein", { exact: true })
    .check();
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: "Glatt" }).click();
  await page
    .getByLabel("Kommentar")
    .fill("<img src=x onerror=alert(1)> Seiteneingang");
  await page.getByRole("button", { name: "Speichern" }).click();
  const marker = page.getByRole("button", {
    name: "Eintrag 1: Rollstuhlgerecht",
    exact: true,
  });
  await expect(marker).toBeVisible();
  await page.reload();
  await expect(marker).toBeVisible();
  await marker.click();
  await expect(
    page.getByRole("heading", { name: "Eintrag bearbeiten" }),
  ).toBeVisible();
  await expect(page.getByLabel("Kommentar")).toHaveValue(
    "<img src=x onerror=alert(1)> Seiteneingang",
  );
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  const rows = await readObservations(page);
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
  await mockEmptyPublicApi(page);
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
  await expect(
    page.getByRole("dialog", { name: "Neuer Eintrag" }).getByRole("alert"),
  ).toContainText("Standortfreigabe wurde verweigert");
  await expect(
    page.getByRole("button", { name: "Speichern" }),
  ).toBeDisabled();
  await page.getByLabel("Kommentar").fill("Antworten behalten");
  await page.getByRole("button", { name: "Standort verwenden" }).click();
  await expect(page.getByLabel("Kommentar")).toHaveValue("Antworten behalten");
  await expect(page.getByText("51.000000, 7.000000")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Standort aktualisieren" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Speichern" }),
  ).toBeEnabled();
});

test("temporarily unavailable location falls back to a network position", async ({
  page,
}) => {
  await mockEmptyPublicApi(page);
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
    page.getByRole("button", { name: "Speichern" }),
  ).toBeEnabled();
});

test("manual coordinates allow collection when CoreLocation stays unavailable", async ({
  page,
}) => {
  await mockEmptyPublicApi(page);
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
  await expect(
    page.getByRole("dialog", { name: "Neuer Eintrag" }).getByRole("alert"),
  ).toContainText("vorübergehend nicht verfügbar");
  await page.getByLabel("Breitengrad").fill("52.5208");
  await page.getByLabel("Längengrad").fill("13.4095");
  await page.getByRole("button", { name: "Koordinaten verwenden" }).click();

  await expect(page.getByText("52.520800, 13.409500")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Speichern" }),
  ).toBeEnabled();
});

test("saves locally while offline without duplicate submissions", async ({
  page,
  context,
}) => {
  await mockEmptyPublicApi(page);
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 52, longitude: 13 });
  await page.goto("/observation/new");
  const save = page.getByRole("button", { name: "Speichern" });
  await expect(save).toBeEnabled();
  await context.setOffline(true);
  await save.dblclick();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".observation-marker--owned")).toHaveCount(1);
  const rows = await readObservations(page);
  expect(rows).toHaveLength(1);
});

test("storage failure keeps the questionnaire available for retry", async ({
  page,
  context,
}) => {
  await mockEmptyPublicApi(page);
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 52, longitude: 13 });
  await page.addInitScript(() => {
    IDBObjectStore.prototype.add = function () {
      throw new DOMException("Storage full", "QuotaExceededError");
    };
  });
  await page.goto("/observation/new");
  await page.getByLabel("Kommentar").fill("Diesen Kommentar nicht verlieren");
  await page
    .getByRole("button", { name: "Speichern" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Eintrag konnte nicht gespeichert werden",
  );
  await expect(page.getByLabel("Kommentar")).toHaveValue(
    "Diesen Kommentar nicht verlieren",
  );
  await expect(
    page.getByRole("button", { name: "Speichern" }),
  ).toBeEnabled();
});

test("mobile layout fits the viewport and keyboard can reach the questionnaire", async ({
  page,
}) => {
  await mockEmptyPublicApi(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Zum Inhalt" }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  // Move focus off the skip link (it overlays the menu button while focused)
  // and open the menu with the keyboard.
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.getByRole("link", { name: "Anlegen" }).click();
  await expect(
    page.getByRole("heading", { name: "Neuer Eintrag" }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() => !!document.activeElement?.closest(".p-dialog")),
    )
    .toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
