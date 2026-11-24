import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE LIVING CV AS ONE CHAIN (owner command 2026-09-29 §12):
 * WORK → RECORDS → CONFIRMATION → PROFESSIONAL HISTORY.
 *
 * Pins the floor this pass set on `/cv`:
 *  - every job is a node on one spine whose standing is said in WORDS
 *    (confirmed by someone else / recorded in the journal / stated by the
 *    person) — colour is never the only signal, and print keeps the words;
 *  - "confirmed" needs a confirmation NOT written by the person themself —
 *    a self-confirmation never lifts a job's standing (EVID-2);
 *  - a confirmation is printed under the job its entry was recorded for, by
 *    ROLE and date only (never a name), with the same qualifiers as the
 *    full register — which stays, unchanged, below.
 */
const ROOT = join(__dirname, "..", "..");
const PAGE = readFileSync(join(ROOT, "app/[locale]/cv/page.tsx"), "utf8");
const CORE = readFileSync(join(ROOT, "lib/cv-export/verified-cv.ts"), "utf8");

describe("living CV chain", () => {
  it("a proof row carries the engagement its own entry was recorded for — an id, never a name", () => {
    expect(CORE).toMatch(/engagementId: string \| null;/);
    expect(CORE).toMatch(/engagementId: entry\?\.engagementId \?\? null/);
    expect(CORE).toMatch(/\.select\("id, created_at, project_id, engagement_context_id, deleted_at, superseded_by, correction_of"\)/);
  });

  it("the standing is confirmed only by someone other than the person", () => {
    expect(PAGE).toMatch(/confirmations\.some\(\s*\(c\) => !c\.selfConfirmed,?\s*\)/);
    expect(PAGE).toMatch(/t\(`history\.chain\.\$\{standing\}`\)/);
    expect(PAGE).toContain('data-testid="cv-history-standing"');
  });

  it("nested confirmations are role + date with the register's own qualifiers", () => {
    expect(PAGE).toContain('data-testid="cv-history-confirmations"');
    expect(PAGE).toMatch(/history\.chain\.confirmedBy/);
    expect(PAGE).toMatch(/c\.automatic \?[\s\S]{0,120}autoConfirmQualifier/);
    expect(PAGE).toMatch(/c\.selfConfirmed \?[\s\S]{0,120}selfConfirmQualifier/);
  });

  it("the full confirmation register stays", () => {
    expect(PAGE).toContain('data-testid="cv-proof"');
  });
});
