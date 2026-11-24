import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CI wiring guard for the primary-route smoke / dead-UI guard.
 *
 * PR #136 added the guard + `check:primary-route-smoke` script. This test pins
 * the CI integration that runs it on every push/PR, so the gate cannot be
 * silently dropped from the workflow. It is a static file-content check — no
 * network, no GitHub API.
 */

// lib/guards -> apps/web -> apps -> repo root
const repoRoot = resolve(__dirname, "..", "..", "..", "..");
const workflowPath = resolve(repoRoot, ".github", "workflows", "quality.yml");

describe("CI quality-gate workflow", () => {
  it("exists at .github/workflows/quality.yml", () => {
    expect(existsSync(workflowPath)).toBe(true);
  });

  const body = existsSync(workflowPath) ? readFileSync(workflowPath, "utf-8") : "";

  it("runs the primary-route smoke guard", () => {
    expect(body).toContain("pnpm check:primary-route-smoke");
  });

  it("runs alongside the existing placeholder governance gate", () => {
    expect(body).toContain("pnpm placeholders:check");
  });

  it("triggers on push to main and on pull requests", () => {
    expect(body).toContain("pull_request");
    expect(body).toMatch(/branches:\s*\[main\]/);
  });
});
