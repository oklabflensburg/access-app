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
  await page.getByRole("link", { name: "Edit observation" }).click();
  await page.getByLabel("Comment").fill("Migrated and edited");
  await page
    .getByRole("button", { name: "Save observation on this device" })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await page
    .getByRole("link", { name: "My observations", exact: true })
    .click();
  await page.route("**/api/observations", async (route) => {
    expect(route.request().headers().authorization).toMatch(
      /^Bearer [0-9a-f-]{36}$/,
    );
    expect(route.request().postDataJSON().revision).toBe(2);
    await route.fulfill({ json: { id, revision: 2 } });
  });
  await page.getByRole("button", { name: "Share & sync now" }).click();
  await expect(page.getByText("Status: synced")).toBeVisible();
});

async function saveNew(page: Page, comment = "Ramp by the door") {
  await page.goto("/observation/new");
  await page.getByLabel("Comment").fill(comment);
  await page
    .getByRole("button", { name: "Save observation on this device" })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByText("Observation saved on this device.", { exact: true }),
  ).toBeVisible();
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
  await page
    .getByRole("link", { name: "My observations", exact: true })
    .click();
  await page.getByRole("link", { name: "Edit observation" }).click();
  await expect(page.getByText("52.520000, 13.405000")).toBeVisible();
  await context.setOffline(true);
  await page.getByLabel("Comment").fill("Updated entrance");
  await page
    .getByRole("button", { name: "Save observation on this device" })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await page
    .getByRole("link", { name: "My observations", exact: true })
    .click();
  await expect(
    page.getByText("Updated entrance", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete observation", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expect(
    page.getByText("No observations yet.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Offline · 1 queued changes")).toBeVisible();
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
  await page.getByLabel("Choose photos", { exact: true }).setInputFiles({
    name: "entrance.png",
    mimeType: "image/png",
    buffer: Buffer.from(base64!, "base64"),
  });
  await expect(page.getByAltText("Observation photo 1")).toBeVisible();
  expect(
    await page
      .getByAltText("Observation photo 1")
      .evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBe(1600);
  await page
    .getByRole("button", { name: "Save observation on this device" })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await page
    .getByRole("link", { name: "My observations", exact: true })
    .click();
  await expect(page.getByText("1 photos", { exact: false })).toBeVisible();
  await page.reload();
  await page.getByRole("link", { name: "Edit observation" }).click();
  await expect(page.getByAltText("Observation photo 1")).toBeVisible();
  await page.getByRole("button", { name: "Remove photo 1" }).click();
  await page
    .getByRole("button", { name: "Save observation on this device" })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await page
    .getByRole("link", { name: "My observations", exact: true })
    .click();
  await expect(page.getByText("0 photos", { exact: false })).toBeVisible();
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
  await page
    .getByRole("link", { name: "My observations", exact: true })
    .click();
  await page.getByRole("button", { name: "Share & sync now" }).click();
  await expect(page.getByText("Status: failed")).toBeVisible();
  await page.getByRole("button", { name: "Share & sync now" }).click();
  await expect(page.getByText("Status: synced")).toBeVisible();
  expect(attempts).toBe(2);
});

test("drafts are excluded from synchronization", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/observations", async (route) => {
    requests++;
    await route.abort();
  });
  await page.goto("/observation/new");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page
    .getByRole("link", { name: "My observations", exact: true })
    .click();
  await expect(page.getByText("Status: draft")).toBeVisible();
  await page.getByRole("button", { name: "Share & sync now" }).click();
  await expect(
    page.getByText("0 synchronized.", { exact: false }),
  ).toBeVisible();
  expect(requests).toBe(0);
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
  await page
    .getByRole("button", { name: "Measure light", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("unavailable");
  await page
    .getByRole("button", { name: "Measure noise", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel measurement" }).click();
  await expect(
    page.getByRole("button", { name: "Save observation on this device" }),
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
  await page
    .getByRole("button", { name: "Measure noise", exact: true })
    .click();
  await expect(page.getByText("noise measurement in progress…")).toBeVisible();
  await page.clock.runFor(10100);
  await expect(
    page.getByText("Relative average: 0.250", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Record motion", exact: true })
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
  await expect(page.getByText("1 raw motion samples")).toBeVisible();
  await page
    .getByRole("button", { name: "Save observation on this device" })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await page
    .getByRole("link", { name: "My observations", exact: true })
    .click();
  await page.getByRole("link", { name: "Edit observation" }).click();
  await expect(
    page.getByText("Relative average: 0.250", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("1 raw motion samples")).toBeVisible();
});
