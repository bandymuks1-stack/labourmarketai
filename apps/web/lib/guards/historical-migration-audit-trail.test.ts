import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards the §4 audit trail for production-applied migration files that were
 * later edited in the repo (see `docs/audits/migrations/README.md`).
 *
 * The invariant: for every such file we keep a byte-identical copy of the SQL
 * production actually executed, and that copy's SHA-256 equals the value the
 * APPLIED_LEDGER recorded at apply time. If someone deletes the copy, edits it,
 * or edits the ledger's recorded hash, this test fails — the audit record
 * cannot be silently dropped.
 *
 * Note it deliberately does NOT assert anything about the CURRENT migration
 * file's hash: that file is expected to drift (that is the documented
 * correction). It is the ORIGINAL that must stay pinned.
 */
const REPO = join(__dirname, "..", "..", "..", "..");
const AUDIT_DIR = join(REPO, "docs", "audits", "migrations");
const LEDGER = join(REPO, "docs", "APPLIED_LEDGER.md");

type Entry = {
  version: string;
  /** SHA-256 of the SQL that production executed. */
  originalSha256: string;
  /** Commit that introduced the file. */
  originalCommit: string;
};

const ENTRIES: Entry[] = [
  {
    version: "20260722160000",
    originalSha256:
      "88ea8ef5a8a98cd5da7ea3ba24407a8b3e234c0be4052bc5f22376b086f6a286",
    originalCommit: "d9d7d7ff7a0d78451197c265cc2a8b8ab92562f9",
  },
  {
    version: "20260723053000",
    originalSha256:
      "eaf846175af66ae10d6e658cd3a18e162b23682973a9c953aa8ce7387c6027d7",
    originalCommit: "edc4e43dc85fa0a6fb389e66c873e8f612612547",
  },
];

const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");

describe("historical migration audit trail (edited production-applied migrations)", () => {
  it("keeps the audit README explaining the divergence", () => {
    const readme = join(AUDIT_DIR, "README.md");
    expect(existsSync(readme), `missing ${readme}`).toBe(true);
    const src = readFileSync(readme, "utf8");
    // The risk must never be recorded as "none" — the precise three-part
    // wording is the point of the record.
    expect(src).toMatch(/Production runtime state is UNCHANGED/);
    expect(src).toMatch(/production migration ledger is UNCHANGED/i);
    expect(src).toMatch(/canonical historical migration artefact HAS been modified/i);
  });

  for (const entry of ENTRIES) {
    describe(`migration ${entry.version}`, () => {
      const artefact = join(
        AUDIT_DIR,
        `${entry.version}_original-production-applied.sql`,
      );

      it("preserves the original production-applied SQL", () => {
        expect(existsSync(artefact), `missing audit artefact ${artefact}`).toBe(
          true,
        );
      });

      it("the preserved copy still hashes to the applied SHA-256", () => {
        const actual = sha256(readFileSync(artefact));
        expect(
          actual,
          `audit artefact for ${entry.version} was modified — it must stay byte-identical to what production ran`,
        ).toBe(entry.originalSha256);
      });

      it("records the original commit and hash in the README", () => {
        const src = readFileSync(join(AUDIT_DIR, "README.md"), "utf8");
        expect(src).toContain(entry.originalCommit);
        expect(src).toContain(entry.originalSha256);
      });

      it("the APPLIED_LEDGER still records that same applied SHA-256", () => {
        // Pins the two sources against each other: if either drifts, this fails.
        expect(readFileSync(LEDGER, "utf8")).toContain(entry.originalSha256);
      });

      it("the live migration file has genuinely diverged (audit record is warranted)", () => {
        const live = join(
          REPO,
          "supabase",
          "migrations",
          `${entry.version}_${
            entry.version === "20260722160000"
              ? "secdef_anon_reach_revoke_v1"
              : "contact_demand_owner_v1"
          }.sql`,
        );
        expect(existsSync(live)).toBe(true);
        // If these ever match again the file was reverted — then the audit
        // entry should be retired deliberately, not left claiming a divergence.
        expect(sha256(readFileSync(live))).not.toBe(entry.originalSha256);
      });
    });
  }
});
