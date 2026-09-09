import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/pwa",
  outputDir: "test-results/pwa",
  use: { baseURL: "http://127.0.0.1:4173", channel: "chromium" },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
});
