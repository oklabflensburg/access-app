import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/api",
  outputDir: "test-results/api",
  use: { baseURL: "http://127.0.0.1:8080", channel: "chromium" },
  fullyParallel: true,
  webServer: {
    command: "npm run dev -- --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
  },
});
