import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { chainHash } from "@/lib/organization-evidence/fingerprint";
import { correctionFingerprint } from "@/lib/organization-evidence/record-correction";

/**
 * Historical date correction v1 (function 2.28): EVIDENCE ONLY, NOT APPLIED.
 *
 * Owner decision 2026-10-14, option C: hold all 165 dates, correct none. The
 * reviewed SQL (once 20261118100000, before that 20261014150000, never applied)
 * now lives in docs/evidence/historical-date-correction-v1/ behind a NOT-APPLIED
 * header. These pins prove:
 *   - the evidence keeps the exact reviewed bytes (sha256 below the header);
 *   - no migration or rollback for it exists, so nothing can run it;
 *   - it is still the SAME correction correctRecord would write: the
 *     fingerprint and chain hash a production dry run (2026-10-14, rolled back)
 *     computed in SQL for one record equal what the TypeScript writer computes.
 * Any future correction needs a new, separately approved proposal.
 */
const ROOT = join(__dirname, "../../../..");
const EVIDENCE_DIR = join(ROOT, "docs/evidence/historical-date-correction-v1");
const MARKER = "-- ===== END OF EVIDENCE HEADER — original file bytes follow unchanged =====\n";
const MIGRATION_SHA256 = "f59707090b0d176c1f63ffe3f44cfb610136858dd4aa22d675fca46728a0ca28";
const ROLLBACK_SHA256 = "ddaeb18ea7afbea0b45d2500a269a4232c65793381f848f3fafb270445c60fa1";

function evidence(name: string) {
  const raw = readFileSync(join(EVIDENCE_DIR, name), "utf8");
  const at = raw.indexOf(MARKER);
  return { header: at < 0 ? "" : raw.slice(0, at), body: at < 0 ? "" : raw.slice(at + MARKER.length) };
}
const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

const MIGRATION_FILE = evidence("historical_date_correction_v1.sql");
const ROLLBACK_FILE = evidence("historical_date_correction_v1.down.sql");
const MIGRATION = MIGRATION_FILE.body;
const ROLLBACK = ROLLBACK_FILE.body;
const code = (sql: string) => sql.replace(/--[^\n]*/g, "");

describe("historical date correction v1 is held evidence, not a migration (owner option C)", () => {
  it("keeps the exact reviewed SQL bytes behind a NOT-APPLIED header", () => {
    expect(sha256(MIGRATION)).toBe(MIGRATION_SHA256);
    expect(sha256(ROLLBACK)).toBe(ROLLBACK_SHA256);
    for (const { header } of [MIGRATION_FILE, ROLLBACK_FILE]) {
      expect(header.startsWith("-- EVIDENCE ONLY. NOT APPLIED. NOT A MIGRATION. NEVER EXECUTE THIS FILE.")).toBe(true);
      expect(header).toMatch(/option C, HOLD all 165 dates/);
      expect(header).toMatch(/NEW, separately approved proposal/);
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

describe("historical date correction v1 (held SQL content)", () => {
  it("SQL fingerprint and chain hash equal the TypeScript correction writer (prod dry run sample)", () => {
    const id = "016709b4-f085-4023-8dc8-4e54c6d1341c";
    const recon = "2023-08-10";
    const note =
      "was 2023-03-30 (template day label reused across weeks); file week 32 = sheet week 32; weekday 4; person week total equals the source workbook";
    const fp = correctionFingerprint(id, {
      derivedPatch: { workDate: { value: recon, method: "source_week_reconstruction", confidence: 0.95, note } },
      overrides: { activityDate: recon },
    });
    expect(fp).toBe("ab9d1f135df76c008fffca4541ef77475f9bf0fbeb576c03a972cbb11097d584");
    expect(chainHash("94554bf253bfb3c843c3f335101a0fbf089920a5cc30f3bbc5b96e1070900e0a", fp, "2026-10-14T15:00:00.000Z")).toBe(
      "96f3d5232f823e6a6df5d069395af55d925846e689247f5711fcf6cc08146c8b",
    );
  });

  it("lists exactly the 165 unambiguous records, each once", () => {
    const rows = [...MIGRATION.matchAll(/\('([0-9a-f-]{36})'::uuid, date '(\d{4}-\d{2}-\d{2})', date '(\d{4}-\d{2}-\d{2})'\)/g)];
    expect(rows).toHaveLength(165);
    expect(new Set(rows.map((r) => r[1])).size).toBe(165);
    for (const r of rows) expect(r[2]).not.toBe(r[3]);
  });

  it("is INSERT-only: never updates or deletes a record, writes a corrected event per correction", () => {
    const c = code(MIGRATION);
    expect(c).not.toMatch(/update\s+public\.organization_evidence_records/i);
    expect(c).not.toMatch(/delete\s+from/i);
    expect(c).toMatch(/correction_of/);
    expect(c).toMatch(/'corrected'/);
    expect(c).toMatch(/insert into public\.audit_logs/);
  });

  it("aborts on any mismatch: source re-derivation, untouched originals, effective totals, 16 h days", () => {
    const c = code(MIGRATION);
    expect(c).toMatch(/do not re-derive their listed date from their own source line/);
    expect(c).toMatch(/an existing record changed/);
    expect(c).toMatch(/effective totals changed/);
    expect(c).toMatch(/differ from their original beyond the date/);
    expect(c).toMatch(/person-days above 16 h include a corrected record/);
    expect(c).toMatch(/already applied — nothing to do/);
    expect(c).toMatch(/organization absent — skipped/);
  });

  it("the rollback removes only this rule's corrections and refuses when anything builds on them", () => {
    const c = code(ROLLBACK);
    expect(c).toMatch(/historical-date-reconstruction\/v1 2026-10-14/);
    expect(c).toMatch(/correction_of/);
    expect(c).toMatch(/raise exception/);
  });
});
