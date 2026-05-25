/**
 * Pinning tests for the pilot-readiness-closure-and-sales sprint.
 *
 * Encodes the doctrine the sprint promised + ships docs land at known
 * paths + the new admin checklist card stays mounted.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(process.cwd(), "..", "..");
const APP_ROOT = process.cwd();
function r(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf-8");
}
function readApp(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf-8");
}
function exists(rel: string): boolean {
  return existsSync(join(REPO_ROOT, rel));
}

describe("Pilot readiness — final doc + sales packaging exist", () => {
  it.each([
    "docs/owner/pilot_start_readiness_final_v1.md",
    "docs/sales/pilot_offer_v1_LT.md",
    "docs/sales/pilot_offer_v1_EN.md",
    "docs/sales/company_intro_message_LT.md",
    "docs/sales/tester_invite_message_LT.md",
  ])("%s exists", (path) => {
    expect(exists(path)).toBe(true);
  });

  it("sales docs honestly disclaim pilot scope (no fake guarantees)", () => {
    const lt = r("docs/sales/pilot_offer_v1_LT.md");
    const en = r("docs/sales/pilot_offer_v1_EN.md");
    // Each doc must mention pilot + non-marketplace framing.
    expect(lt).toMatch(/Bandomoji|pilotas/i);
    expect(en).toMatch(/pilot/i);
    expect(en).toMatch(/not a marketplace|not the final|don't fake/i);
  });

  it("tester invite tells testers what to do AND how to report", () => {
    const invite = r("docs/sales/tester_invite_message_LT.md");
    expect(invite).toMatch(/Pranešti apie tekstą/);
    expect(invite).toMatch(/app\.labourmarket\.ai/);
  });
});

describe("Pilot Start Checklist — rendered on admin/agent-os", () => {
  const page = readApp("app/[locale]/dashboard/admin/agent-os/page.tsx");

  it("mounts a checklist section with the v1 testid", () => {
    expect(page).toMatch(/data-testid="pilot-start-checklist"/);
  });

  it("queries each of the six pilot signals from live tables", () => {
    // The page builds the checklist from live counts. Make sure all six
    // signals are wired so a quiet regression doesn't strip one without
    // anyone noticing.
    for (const key of [
      "login",
      "journal",
      "language",
      "telemetry",
      "drafts",
      "communication",
    ]) {
      expect(page).toMatch(
        new RegExp(`key:\\s*["']${key}["']\\s*,\\s*observed:`),
      );
    }
  });

  it("reads conversation_messages (NOT legacy messages) for the communication signal", () => {
    // Pinned to dodge the same legacy-collision trap as 0021 itself.
    expect(page).toContain('from("conversation_messages")');
    expect(page).not.toMatch(/from\("messages"\)/);
  });

  it("requires superadmin server-side (the page itself, not the checklist)", () => {
    expect(page).toMatch(/await\s+requireSuperadmin\(\s*locale\s*\)/);
  });
});

describe("Agent OS v2 — generate-pilot-owner-brief script", () => {
  it("apps/web/scripts/generate-pilot-owner-brief.ts exists", () => {
    expect(existsSync(join(APP_ROOT, "scripts/generate-pilot-owner-brief.ts"))).toBe(
      true,
    );
  });

  it("apps/web/package.json exposes generate-pilot-owner-brief script", () => {
    const pkg = JSON.parse(readApp("package.json"));
    expect(pkg.scripts?.["generate-pilot-owner-brief"]).toBe(
      "tsx scripts/generate-pilot-owner-brief.ts",
    );
  });

  it("brief script writes to runtime/ (gitignored), not into the repo tree", () => {
    const src = readApp("scripts/generate-pilot-owner-brief.ts");
    expect(src).toMatch(/"runtime"\s*,\s*"reports"/);
  });

  it("brief script reads counts only — never selects body / text columns", () => {
    const src = readApp("scripts/generate-pilot-owner-brief.ts");
    // Every Supabase select in the script is `.select("id", { count: "exact", head: true })`.
    // No `original_text`, `profile_text`, `comment`, `selected_text`, `body`.
    expect(src).not.toMatch(/select\(\s*["'].*original_text/);
    expect(src).not.toMatch(/select\(\s*["'].*profile_text/);
    expect(src).not.toMatch(/select\(\s*["'].*comment/);
    expect(src).not.toMatch(/select\(\s*["'].*selected_text/);
    expect(src).not.toMatch(/select\(\s*["'].*body/);
  });

  it("brief script is owner-side tooling (acknowledges service_role in CLI, not app runtime)", () => {
    const src = readApp("scripts/generate-pilot-owner-brief.ts");
    // The CLI script uses SUPABASE_SERVICE_ROLE_KEY explicitly — that's
    // ALLOWED for owner-side tooling (same pattern as admin-promote.ts).
    expect(src).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    // It must NOT import from the deployed app's runtime supabase clients.
    expect(src).not.toMatch(/from\s+["']@\/lib\/supabase\/(server|client|admin)["']/);
  });
});
