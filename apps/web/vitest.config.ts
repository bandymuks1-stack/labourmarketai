import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dir = path.dirname(fileURLToPath(import.meta.url));

// Unit tests only (pure logic like lib/auth-errors). E2E stays in Playwright.
export default defineConfig({
  resolve: {
    // Mirror the tsconfig `@/*` -> `./*` mapping so tests can import route
    // modules and helpers using the same paths as production code.
    alias: { "@": dir },
  },
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
});
