import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CLAIMING A PUBLIC INTAKE NEVER OVERWRITES AN OPEN DRAFT (audit 2026-10-20).
 * The draft save keeps one draft per profile + kind: a second claim (or a
 * claim while the wizard draft was open) replaced it, and the first intake was
 * already marked converted. The claim now refuses over an open draft and
 * stamps the acting company (v2), like the dashboard draft form.
 */
const src = readFileSync(resolve(__dirname, "..", "company", "claim-public-intake.ts"), "utf8");

describe("claim public intake keeps an open draft", () => {
  const fn = src.slice(src.indexOf("export async function claimPublicIntake"));
  it("checks for the caller's own open company draft before saving", () => {
    const check = fn.indexOf('.eq("status", "draft")');
    expect(check).toBeGreaterThan(-1);
    expect(fn.indexOf('"save_demand_draft_v2"')).toBeGreaterThan(check);
    expect(fn).toMatch(/return \{ ok: false, reason: "draft_exists" \}/);
  });
  it("stamps the acting company through v2, falling back to v1 only when v2 is absent", () => {
    expect(fn).toMatch(/p_organization_id: employer\.ok \? employer\.organizationId : null/);
    expect(fn).toMatch(/\["42883", "PGRST202"\]\.includes/);
  });
});
