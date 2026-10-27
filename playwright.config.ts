// E2E do PWA: sobe a build estática (dist) e atesta os fluxos que não
// dependem de login. Dados de teste não batem no Supabase real: as chamadas
// RPC são interceptadas por `page.route` em cada teste.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:8082",
    viewport: { width: 420, height: 900 },
  },
  webServer: {
    command: "python3 -m http.server 8082 --directory dist",
    url: "http://127.0.0.1:8082",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
