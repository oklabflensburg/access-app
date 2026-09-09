import { test, expect } from "@playwright/test";
const payload = () => ({
  id: crypto.randomUUID(),
  revision: 1,
  createdAt: new Date().toISOString(),
  location: { latitude: 52.52, longitude: 13.405 },
  accessibility: {
    wheelchairAccessible: true,
    steps: 0,
    ramp: null,
    accessibleToilet: false,
    elevator: null,
    surface: "smooth",
  },
  comment: "API integration fixture",
  photoIds: [] as string[],
});

test("UI synchronizes photos after a partial failure, then propagates edits and deletion", async ({
  page,
  context,
  request,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 52.52, longitude: 13.405 });
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  let id = "";
  let authorization = "";
  let uploads = 0;
  page.on("request", (req) => {
    if (req.url().endsWith("/api/observations") && req.method() === "POST") {
      id = req.postDataJSON().id;
      authorization = req.headers().authorization!;
    }
  });
  await page.route("**/api/observations/*/photos", async (route) => {
    uploads++;
    if (uploads === 1)
      await route.fulfill({
        status: 503,
        json: { error: "Temporary photo failure" },
      });
    else await route.continue();
  });
  try {
    await page.goto("http://127.0.0.1:5173/observation/new");
    const base64 = await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 32;
      c.height = 32;
      return c.toDataURL("image/jpeg").split(",")[1];
    });
    await page
      .getByLabel("Choose photos", { exact: true })
      .setInputFiles({
        name: "ramp.jpg",
        mimeType: "image/jpeg",
        buffer: Buffer.from(base64!, "base64"),
      });
    await page.getByLabel("Comment").fill("Full sync fixture");
    await page
      .getByRole("button", { name: "Save observation on this device" })
      .click();
    await expect(page).toHaveURL(/\/$/);
    await page
      .getByRole("link", { name: "My observations", exact: true })
      .click();
    await page.getByRole("button", { name: "Share & sync now" }).click();
    await expect(page.getByText("Status: failed")).toBeVisible();
    await page.getByRole("button", { name: "Share & sync now" }).click();
    await expect(page.getByText("Status: synced")).toBeVisible();
    const remote = await (await request.get(`/api/observations/${id}`)).json();
    expect(remote.comment).toBe("Full sync fixture");
    expect(remote.photoIds).toHaveLength(1);
    expect(
      (
        await request.get(
          `/api/observations/${id}/photos/${remote.photoIds[0]}`,
        )
      ).status(),
    ).toBe(200);
    await page.getByRole("link", { name: "Edit observation" }).click();
    await page.getByRole("button", { name: "Remove photo 1" }).click();
    await page.getByLabel("Comment").fill("Updated after sharing");
    await page
      .getByRole("button", { name: "Save observation on this device" })
      .click();
    await expect(page).toHaveURL(/\/$/);
    await page
      .getByRole("link", { name: "My observations", exact: true })
      .click();
    await page.getByRole("button", { name: "Share & sync now" }).click();
    await expect(page.getByText("Status: synced")).toBeVisible();
    expect(
      (await (await request.get(`/api/observations/${id}`)).json()).comment,
    ).toBe("Updated after sharing");
    expect(
      (
        await request.get(
          `/api/observations/${id}/photos/${remote.photoIds[0]}`,
        )
      ).status(),
    ).toBe(404);
    await page
      .getByRole("button", { name: "Delete observation", exact: true })
      .click();
    await page.getByRole("button", { name: "Confirm delete" }).click();
    await page.getByRole("button", { name: "Share & sync now" }).click();
    await expect(page.getByText("Online · 0 queued changes")).toBeVisible();
    expect((await request.get(`/api/observations/${id}`)).status()).toBe(404);
  } finally {
    if (id)
      await request.delete(`/api/observations/${id}`, {
        headers: { Authorization: authorization },
        data: { revision: 100 },
      });
  }
});

test("persists, deduplicates, authorizes, updates, bounds queries, and deletes with tombstones", async ({
  request,
}) => {
  const record = payload();
  const headers = { Authorization: `Bearer ${crypto.randomUUID()}` };
  try {
    for (let i = 0; i < 2; i++) {
      const response = await request.post("/api/observations", {
        headers,
        data: record,
      });
      expect(await response.json()).toEqual({ id: record.id, revision: 1 });
    }
    const read = await request.get(`/api/observations/${record.id}`);
    expect(await read.json()).toMatchObject({
      id: record.id,
      comment: record.comment,
    });
    expect((await read.json()).editToken).toBeUndefined();
    expect(
      (
        await request.post("/api/observations", {
          headers: { Authorization: `Bearer ${crypto.randomUUID()}` },
          data: record,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await request.post("/api/observations", {
          headers,
          data: { ...record, revision: 2, comment: "Updated" },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await request.post("/api/observations", { headers, data: record })
      ).status(),
    ).toBe(409);
    const bbox = await request.get("/api/observations?bbox=13,52,14,53");
    expect(
      (await bbox.json()).observations.some(
        (o: { id: string }) => o.id === record.id,
      ),
    ).toBe(true);
    expect((await request.get("/api/observations?bbox=bad")).status()).toBe(
      400,
    );
    for (let i = 0; i < 2; i++)
      expect(
        (
          await request.delete(`/api/observations/${record.id}`, {
            headers,
            data: { revision: 3 },
          })
        ).status(),
      ).toBe(200);
    expect((await request.get(`/api/observations/${record.id}`)).status()).toBe(
      404,
    );
    expect(
      (
        await request.post("/api/observations", {
          headers,
          data: { ...record, revision: 4 },
        })
      ).status(),
    ).toBe(410);
  } finally {
    await request.delete(`/api/observations/${record.id}`, {
      headers,
      data: { revision: 100 },
    });
  }
});

test("validates data and photo ownership, stores JPEGs, and makes deleted photos inaccessible", async ({
  request,
  page,
}) => {
  const record = payload();
  const photoId = crypto.randomUUID();
  record.photoIds = [photoId];
  const headers = { Authorization: `Bearer ${crypto.randomUUID()}` };
  const base64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 32;
    c.height = 32;
    return c.toDataURL("image/jpeg").split(",")[1];
  });
  const multipart = {
    id: photoId,
    revision: "1",
    photo: {
      name: "photo.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from(base64!, "base64"),
    },
  };
  try {
    expect(
      (
        await request.post("/api/observations", {
          headers,
          data: { ...record, location: { latitude: 200, longitude: 0 } },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await request.post("/api/observations", { headers, data: record })
      ).status(),
    ).toBe(200);
    for (let i = 0; i < 2; i++) {
      const result = await request.post(
        `/api/observations/${record.id}/photos`,
        { headers, multipart },
      );
      expect(await result.json()).toEqual({ id: photoId });
    }
    const image = await request.get(
      `/api/observations/${record.id}/photos/${photoId}`,
    );
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/jpeg");
    expect(
      (
        await request.post(`/api/observations/${record.id}/photos`, {
          headers,
          multipart: { ...multipart, id: crypto.randomUUID() },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await request.post("/api/observations", {
          headers,
          data: { ...record, revision: 2, photoIds: [] },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await request.get(`/api/observations/${record.id}/photos/${photoId}`)
      ).status(),
    ).toBe(404);
  } finally {
    await request.delete(`/api/observations/${record.id}`, {
      headers,
      data: { revision: 100 },
    });
  }
});
