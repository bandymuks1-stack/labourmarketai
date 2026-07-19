import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Universal Journal Recall v2 — CV read-side guards.
 *
 * The Verified CV must include ACCEPTED journal outcomes and must honour
 * entry-scoped rejections without inventing a global one:
 *   • journal-derived `skill_claim` metrics from LIVE entries surface as
 *     declared-tier claims with journal origin (never verified);
 *   • labels with a `skill_claim_rejected` marker never surface;
 *   • worker_skills (the pipeline's added/confirmed skills) feed the tiers;
 *   • deleted / superseded entries never contribute claims.
 */

const APP = process.cwd();
const CV = readFileSync(join(APP, "lib/cv-export/verified-cv.ts"), "utf-8");

describe("verified CV — journal recall read side", () => {
  it("reads journal skill_claim metrics from LIVE entries only", () => {
    expect(CV).toMatch(/skill_claim/);
    expect(CV).toMatch(/deleted_at == null/);
    expect(CV).toMatch(/superseded_by == null/);
  });

  it("honours rejection markers ENTRY-SCOPED (P2 integrity fix)", () => {
    expect(CV).toMatch(/skill_claim_rejected/);
    // Pairing key is entry_id + normalized label — a rejection on one
    // entry must never hide the same un-rejected claim from another.
    expect(CV).toMatch(/rejectedByEntry/);
    expect(CV).toMatch(/\$\{m\.entry_id\}\|/);
    expect(CV).toMatch(/selectJournalClaimLabels/);
  });

  it("journal claims stay in the DECLARED tier with journal origin", () => {
    expect(CV).toMatch(/origin:\s*"journal"/);
    // never presented as verified from this lane
    expect(CV).not.toMatch(/origin:\s*"verified"/);
  });

  it("worker_skills feed the tiers (added pipeline skills reach the CV)", () => {
    expect(CV).toMatch(/from\("worker_skills"\)/);
    expect(CV).toMatch(/groupCvSkillTiers/);
  });
});
