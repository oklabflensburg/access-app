import { test, expect, type Page } from "@playwright/test";

test("upgrades existing Milestone 1 data without losing observations", async ({
  page,
}) => {
  const id = crypto.randomUUID();
  await page.addInitScript(
    ({ id }) => {
      const request = indexedDB.open("accessapp", 10); // Dexie v1 uses native IndexedDB version 10.
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore("observations", {
          keyPath: "id",
        });
        store.createIndex("createdAt", "createdAt");
        store.createIndex("syncStatus", "syncStatus");
        store.add({
          id,
          createdAt: "2026-09-09T12:00:00.000Z",
          location: {
            latitude: 52,
            longitude: 13,
            accuracy: 8,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
            timestamp: 1788955200000,
          },
          accessibility: {
            wheelchairAccessible: null,
            ramp: null,
            steps: null,
            accessibleToilet: null,
            elevator: null,
            surface: null,
          },
          comment: "Milestone 1 observation",
          syncStatus: "ready",
        });
      };
      request.onsuccess = () => request.result.close();
    },
    { id },
  );
  await page.goto("/observations");
  await expect(
    page.getByText("Milestone 1 observation", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Eintrag bearbeiten" }).click();
  await page.getByLabel("Kommentar").fill("Migrated and edited");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.route("**/api/observations", async (route) => {
    expect(route.request().headers().authorization).toMatch(
      /^Bearer [0-9a-f-]{36}$/,
    );
    expect(route.request().postDataJSON().revision).toBe(1);
    await route.fulfill({ json: { id, revision: 1 } });
  });
  await page.getByRole("button", { name: "Menü" }).click();
  await page.getByRole("button", { name: "Synchronisieren" }).click();
  // The button reads "Synchronisierung…" while a sync is running.
  await expect(
    page.getByRole("button", { name: "Synchronisieren" }),
  ).toBeVisible();
  await page.goto("/observations");
  await expect(page.getByText("Status: synced")).toBeVisible();
});

async function saveNew(page: Page, comment = "Ramp by the door") {
  await page.goto("/observation/new");
  await page.getByLabel("Kommentar").fill(comment);
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page).toHaveURL(/\/$/);
}
test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 52.52,
    longitude: 13.405,
    accuracy: 8,
  });
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
});

test("edits a saved observation, preserves location, and deletes it offline", async ({
  page,
  context,
}) => {
  await saveNew(page);
  await page.goto("/observations");
  await page.getByRole("link", { name: "Eintrag bearbeiten" }).click();
  await expect(page.getByText("52.520000, 13.405000")).toBeVisible();
  await context.setOffline(true);
  await page.getByLabel("Kommentar").fill("Updated entrance");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("button", { name: "Menü" }).click();
  await page.getByRole("link", { name: "Meine Beobachtungen" }).click();
  await expect(
    page.getByText("Updated entrance", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Löschen", exact: true }).click();
  await page.getByRole("button", { name: "Löschen bestätigen" }).click();
  await expect(
    page.getByText("Noch keine Einträge.", { exact: false }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Menü" }).click();
  await expect(page.getByText("1 offen")).toBeVisible();
});

test("compresses photos, persists previews, and removes a photo on edit", async ({
  page,
}) => {
  await page.goto("/observation/new");
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2400;
    canvas.height = 1200;
    canvas.getContext("2d")!.fillRect(0, 0, 2400, 1200);
    return canvas.toDataURL().split(",")[1];
  });
  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: "entrance.png",
    mimeType: "image/png",
    buffer: Buffer.from(base64!, "base64"),
  });
  await expect(page.getByAltText("Foto 1", { exact: true })).toBeVisible();
  expect(
    await page
      .getByAltText("Foto 1", { exact: true })
      .evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBe(1600);
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/observations");
  await expect(page.getByText("1 Fotos", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Eintrag bearbeiten" }).click();
  await expect(page.getByAltText("Foto 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Foto 1 entfernen" }).click();
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/observations");
  await expect(page.getByText("0 Fotos", { exact: false })).toBeVisible();
});

test("retries failed synchronization and never sends private edit tokens in the public body", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/observations", async (route) => {
    attempts++;
    const payload = route.request().postDataJSON();
    expect(payload.editToken).toBeUndefined();
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    await route.fulfill({
      status: attempts === 1 ? 503 : 200,
      json:
        attempts === 1
          ? { error: "Server unavailable" }
          : { id: payload.id, revision: payload.revision },
    });
  });
  await saveNew(page);
  await page.getByRole("button", { name: "Menü" }).click();
  await page.getByRole("button", { name: "Synchronisieren" }).click();
  // The button reads "Synchronisierung…" while a sync is running.
  await expect(
    page.getByRole("button", { name: "Synchronisieren" }),
  ).toBeVisible();
  await page.goto("/observations");
  await expect(page.getByText("Status: failed")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Menü" }).click();
  await page.getByRole("button", { name: "Synchronisieren" }).click();
  await expect(
    page.getByRole("button", { name: "Synchronisieren" }),
  ).toBeVisible();
  await page.goto("/observations");
  await expect(page.getByText("Status: synced")).toBeVisible();
  expect(attempts).toBe(2);
});

test("drafts are excluded from synchronization", async ({ page }) => {
  let posts = 0;
  await page.route("**/api/observations*", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { observations: [], nextCursor: null } });
    }
    posts++;
    const payload = route.request().postDataJSON();
    return route.fulfill({ json: { id: payload.id, revision: payload.revision } });
  });
  const draftId = crypto.randomUUID();
  const readyId = crypto.randomUUID();
  await page.addInitScript(
    ({ draftId, readyId }) => {
      const request = indexedDB.open("accessapp", 10); // Dexie v1 uses native IndexedDB version 10.
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore("observations", {
          keyPath: "id",
        });
        store.createIndex("createdAt", "createdAt");
        store.createIndex("syncStatus", "syncStatus");
        const base = {
          createdAt: "2026-10-03T12:00:00.000Z",
          location: {
            latitude: 52,
            longitude: 13,
            accuracy: null,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
            timestamp: 1789521600000,
          },
          accessibility: {
            wheelchairAccessible: null,
            ramp: null,
            steps: null,
            accessibleToilet: null,
            elevator: null,
            surface: null,
          },
          comment: "",
        };
        // The draft button is gone from the UI, but existing draft rows must
        // never be uploaded.
        store.add({
          ...base,
          id: draftId,
          syncStatus: "draft",
          revision: 0,
          editToken: crypto.randomUUID(),
        });
        store.add({
          ...base,
          id: readyId,
          syncStatus: "ready",
          revision: 0,
          editToken: crypto.randomUUID(),
        });
      };
      request.onsuccess = () => request.result.close();
    },
    { draftId, readyId },
  );
  await page.goto("/observations");
  await expect(page.getByText("Status: draft")).toBeVisible();
  await expect(page.getByText("Status: ready")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Menü" }).click();
  await page.getByRole("button", { name: "Synchronisieren" }).click();
  // The button reads "Synchronisierung…" while a sync is running.
  await expect(
    page.getByRole("button", { name: "Synchronisieren" }),
  ).toBeVisible();
  expect(posts).toBe(1); // Only the ready row is uploaded; the draft stays local.
  await page.goto("/observations");
  await expect(page.getByText("Status: synced")).toBeVisible();
  await expect(page.getByText("Status: draft")).toBeVisible();
});

test("unavailable sensors and cancelled permission prompts do not block saving", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: () => new Promise(() => {}),
    });
    Object.defineProperty(window, "AmbientLightSensor", { value: undefined });
  });
  await page.goto("/observation/new");
  await page.getByRole("button", { name: "Licht messen", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Neuer Eintrag" }).getByRole("alert"),
  ).toContainText("nicht verfügbar");
  await page.getByRole("button", { name: "Lärm messen", exact: true }).click();
  await page.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Speichern" }),
  ).toBeEnabled();
});

test("records raw motion and relative noise, then saves measurements outside the observation record", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const motion = class extends Event {};
    Object.defineProperty(window, "DeviceMotionEvent", { value: motion });
    Object.defineProperty(window, "DeviceOrientationEvent", {
      value: class extends Event {},
    });
    class FakeAudio {
      state = "running";
      resume() {
        return Promise.resolve();
      }
      close() {
        this.state = "closed";
        return Promise.resolve();
      }
      createMediaStreamSource() {
        return { connect() {} };
      }
      createAnalyser() {
        return {
          fftSize: 2048,
          getFloatTimeDomainData(array: Float32Array) {
            array.fill(0.25);
          },
        };
      }
    }
    Object.defineProperty(window, "AudioContext", { value: FakeAudio });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: () => Promise.resolve({ getTracks: () => [{ stop() {} }] }),
    });
  });
  await page.goto("/observation/new");
  await page.clock.install();
  await page.getByRole("button", { name: "Lärm messen", exact: true }).click();
  await expect(page.getByText("Lärm wird gemessen…")).toBeVisible();
  await page.clock.runFor(10100);
  await expect(page.getByText("Mittelwert: 0.250")).toBeVisible();
  await page
    .getByRole("button", { name: "Bewegung messen", exact: true })
    .click();
  await page.evaluate(() => {
    const event = new Event("devicemotion");
    Object.assign(event, {
      acceleration: { x: 1, y: 2, z: 3 },
      rotationRate: { alpha: 4, beta: 5, gamma: 6 },
    });
    window.dispatchEvent(event);
  });
  await page.clock.runFor(10100);
  await expect(page.getByText("1 Bewegungswerte")).toBeVisible();
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/observations");
  await page.getByRole("link", { name: "Eintrag bearbeiten" }).click();
  await expect(page.getByText("Mittelwert: 0.250")).toBeVisible();
  await expect(page.getByText("1 Bewegungswerte")).toBeVisible();
});
