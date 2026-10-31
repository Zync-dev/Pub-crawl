import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integrationstest mod Supabase-projektet i .env.local. Kræver netværk og anonyme logins.
try {
  process.loadEnvFile(".env.local");
} catch {
  // Så skal variablerne komme fra miljøet.
}

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    // Logger testbrugerne ind én gang og genbruger dem (se tests/db/setup.ts).
    globalSetup: ["tests/db/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Testene bygger videre på hinanden i én tur.
    sequence: { concurrent: false },
    fileParallelism: false,
  },
});
