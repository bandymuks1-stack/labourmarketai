import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dir = path.dirname(fileURLToPath(import.meta.url));

// Unit tests only (pure logic like lib/auth-errors). E2E stays in Playwright.
export default defineConfig({
  // Transform component JSX with the automatic runtime (react/jsx-runtime) so a
  // guard test can render a real client component to static markup for a DOM
  // order proof. vitest 4 transforms with oxc, which otherwise inherits
  // tsconfig `jsx: preserve` (kept for Next) and refuses to emit runnable JS.
  // Production uses Next's own SWC pipeline; this only affects vitest loads.
  oxc: { jsx: { runtime: "automatic" } },
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
