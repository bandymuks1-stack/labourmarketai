import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Historical date correction v1 (function 2.28): EVIDENCE ONLY, NOT APPLIED.
 *
 * Owner decision 2026-10-14, option C: hold all 165 dates, correct none.
 * Owner decision 2026-11-18: the production record list leaves the public
 * repository. The reviewed SQL (once a migration, never applied) and its
 * rollback live in the owner's private evidence store; this repository keeps
 * only the method, the counts and the two sha256 values that identify them.
 * These pins prove:
 *   - the README names both hashes, so the private copy stays traceable;
 *   - no file in the public evidence folder carries a record id, a 2023 date,
 *     the source workbook's name or an approval marker;
 *   - no migration or rollback for this correction exists, so nothing runs it.
 * Any future correction needs a new, separately approved proposal.
 */
const ROOT = join(__dirname, "../../../..");
const EVIDENCE_DIR = join(ROOT, "docs/evidence/historical-date-correction-v1");
const CORRECTION_SHA256 = "f59707090b0d176c1f63ffe3f44cfb610136858dd4aa22d675fca46728a0ca28";
const ROLLBACK_SHA256 = "ddaeb18ea7afbea0b45d2500a269a4232c65793381f848f3fafb270445c60fa1";

const README = readFileSync(join(EVIDENCE_DIR, "README.md"), "utf8");

describe("historical date correction v1 is held evidence, kept private (owner option C)", () => {
  it("the README names both private files' hashes and the held decision", () => {
    expect(README).toContain(CORRECTION_SHA256);
    expect(README).toContain(ROLLBACK_SHA256);
    expect(README).toMatch(/option C: hold all 165 dates/);
    expect(README).toMatch(/not in this repository/);
    expect(README).toMatch(/new, separately approved proposal/);
  });

  it("no public evidence file carries an identifier, a 2023 date, the workbook name or an approval marker", () => {
    const files = readdirSync(EVIDENCE_DIR);
    expect(files).toEqual(["README.md"]);
    for (const f of files) {
      const text = readFileSync(join(EVIDENCE_DIR, f), "utf8");
      expect(text, `${f}: a UUID`).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      expect(text, `${f}: a shortened id`).not.toMatch(/\b[0-9a-f]{8}…/i);
      expect(text, `${f}: a 2023 date`).not.toMatch(/\b2023-\d{2}-\d{2}\b/);
      expect(text, `${f}: a workbook file name`).not.toMatch(/\.xlsx?\b/i);
      expect(text, `${f}: an approval marker`).not.toMatch(/@human-gate-approved/);
    }
  });

  it("has no migration and no rollback in supabase/", () => {
    const pattern = /historical_date_correction/;
    for (const dir of ["supabase/migrations", "supabase/rollbacks"]) {
      expect(readdirSync(join(ROOT, dir)).filter((f) => pattern.test(f))).toEqual([]);
    }
    expect(existsSync(join(EVIDENCE_DIR, "README.md"))).toBe(true);
  });
});
