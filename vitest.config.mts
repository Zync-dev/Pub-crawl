import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Enhedstest af src/lib. Kører uden netværk. Databasetesten har sin egen config (vitest.db.config.mts).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
    unstubGlobals: true,
  },
});
