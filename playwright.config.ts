import { defineConfig, devices } from "@playwright/test";

/**
 * e2e : lance `next dev` avec un round court (NEXT_PUBLIC_ROUND_SECONDS) pour
 * ne pas attendre 60 s, et pilote un iPhone. La persistance en base est déjà
 * couverte par les tests d'intégration ; ici on valide le parcours de jeu.
 *
 * Prérequis une fois : `npx playwright install chromium`.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "iphone",
      use: { ...devices["iPhone 13"] },
    },
  ],
  webServer: {
    command: "next dev -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_ROUND_SECONDS: "3",
    },
  },
});
