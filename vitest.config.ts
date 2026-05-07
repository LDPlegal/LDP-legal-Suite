import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    testTimeout: 30_000,
    setupFiles: ["./tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd()),
    },
  },
});
