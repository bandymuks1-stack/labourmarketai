import { defineConfig } from "vitest/config";

// Unit tests only (pure logic like lib/auth-errors). E2E stays in Playwright.
export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
});
