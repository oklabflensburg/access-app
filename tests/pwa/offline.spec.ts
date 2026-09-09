import { test, expect } from "@playwright/test";

test("provides an installable web app manifest", async ({ page }) => {
  await page.goto("/");

  const manifest = await page.evaluate(async () => {
    const href = document.querySelector<HTMLLinkElement>(
      'link[rel="manifest"]',
    )?.href;
    if (!href) throw new Error("Manifest link is missing");

    return (await fetch(href)).json();
  });

  expect(manifest).toMatchObject({
    id: "/",
    name: "AccessApp Accessibility Map",
    short_name: "AccessApp",
    start_url: "/",
    scope: "/",
    display: "standalone",
  });
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        src: "/pwa-192x192.png",
        sizes: "192x192",
        type: "image/png",
      }),
      expect.objectContaining({
        src: "/pwa-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      }),
    ]),
  );
});

test("installed app shell opens and restores observations after an offline reload", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 52.52, longitude: 13.405 });
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page
    .getByRole("link", { name: "+ Add accessibility information" })
    .click();
  await page.getByLabel("Comment").fill("Available offline");
  await page
    .getByRole("button", { name: "Save observation on this device" })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await page
    .getByRole("link", { name: "My observations", exact: true })
    .click();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "My observations", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Available offline", { exact: true }),
  ).toBeVisible();
});
