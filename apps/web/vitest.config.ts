import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dir = path.dirname(fileURLToPath(import.meta.url));

// Unit tests only (pure logic like lib/auth-errors). E2E stays in Playwright.
export default defineConfig({
  resolve: {
    // Mirror the tsconfig `@/*` -> `./*` mapping so tests can import route
    // modules and helpers using the same paths as production code.
    // `server-only` / `client-only` are marker packages that throw outside
    // their target environment; alias them to a no-op so server modules with
    // pure logic (e.g. lib/cv/extract) can be unit-tested under Node.
    alias: {
      "@": dir,
      "server-only": path.resolve(dir, "lib/test/server-only-stub.ts"),
      "client-only": path.resolve(dir, "lib/test/server-only-stub.ts"),
    },
  },
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
});
