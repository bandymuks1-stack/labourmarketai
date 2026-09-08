import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A SELF-CONFIRMATION MAY NOT READ AS SOMEBODY ELSE'S WORD (EVID-2).
 *
 * THE DEFECT, measured on production 2026-09-08. `journal_entry_confirmations`
 * holds 13 confirmations and **3 of them are the worker confirming their own
 * entry**. Every one of the 13 carries `confirmer_role = 'owner'`, so the
 * stored row does not distinguish the two cases at all — self-ness is only
 * derivable by joining `journal_entries -> workers.profile_id` back to
 * `confirmer_id`.
 *
 * `buildVerifiedCv` then reads that table into "Confirmed work proof" and
 * selected `confirmer_role` alone. So the exported CV — the document a person
 * hands an employer — presented a self-confirmation identically to an
 * employer's confirmation. The page already qualified `automatic`
 * confirmations, which proves the pattern was understood; self-confirmation
 * was simply not on the list.
 *
 * SEP-3, EVIDENCE ≠ VERIFICATION, is the rule this keeps.
 *
 * WHAT THIS FIX DELIBERATELY DOES NOT DO. It does not delete the three rows,
 * does not rewrite their `confirmer_role`, and does not drop them from the CV.
 * Self-reported work is real work. The owner's instruction was to preserve
 * provenance and make the semantics safe BEFORE any data change, so the flag
 * is DERIVED at read time (`confirmer_id === the subject's own profile id`)
 * and the rows on production are untouched. Blocking NEW self-confirmations
 * from claiming an external state is a schema change and stays owner-gated.
 *
 * The confirmer's identity never leaves the reader: `confirmer_id` is compared
 * and discarded, and the proof row carries a boolean. The role-only privacy
 * rule is unchanged.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const LOCALES = ["en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl", "ru"] as const;

describe("a self-confirmation is never presented as external proof", () => {
  const core = read("lib/cv-export/verified-cv.ts");

  it("the CV proof row carries a selfConfirmed flag", () => {
    expect(core).toMatch(/selfConfirmed:\s*boolean/);
  });

  it("it is DERIVED from the confirmer id, never from the role", () => {
    // confirmer_role is 'owner' on all 13 production rows including the 3
    // self-confirmed ones, so a role-based rule would silently pass them.
    expect(core).toContain("confirmer_id");
    expect(core).toMatch(/c\.confirmer_id === user\.id/);
  });

  it("the confirmer's identity is never carried into the proof row", () => {
    // The row exposes a boolean. If the confirmer's id ever becomes a FIELD on
    // the exported type, the default-closed role-only rule has been broken.
    // Comments are stripped first: this asserts on the shape, not on prose —
    // the field's own documentation legitimately names the column it derives
    // from, and an assertion that trips on its own explanation is a bad guard.
    const typeBlock = core.slice(
      core.indexOf("export type VerifiedCvProofRow"),
      core.indexOf("export type VerifiedCvLanguage"),
    );
    const fieldsOnly = typeBlock
      .split("\n")
      .filter((l) => {
        const t = l.trim();
        return t.length > 0 && !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*");
      })
      .join("\n");
    expect(fieldsOnly).not.toMatch(/\bconfirmer(Id|_id)\s*[?]?\s*:/);
  });

  it("the CV page renders the qualifier, so it cannot be silently dropped", () => {
    const page = read("app/[locale]/cv/page.tsx");
    expect(page).toContain("cv-proof-self-confirm-qualifier");
    expect(page).toContain("selfConfirmQualifier");
    expect(page).toMatch(/row\.selfConfirmed/);
  });

  it("the row is LABELLED, not hidden — self-reported work is still work", () => {
    const page = read("app/[locale]/cv/page.tsx");
    // A filter would erase the person's own record from their own CV. The
    // honest move is to say what it is, exactly as `automatic` does.
    expect(page).not.toMatch(/proof\.filter\([^)]*selfConfirmed/);
  });

  it("every locale carries the qualifier — a missing key renders as the key", () => {
    for (const loc of LOCALES) {
      const messages = JSON.parse(read(`messages/${loc}.json`)) as {
        evidenceTier?: Record<string, unknown>;
      };
      const value = messages.evidenceTier?.selfConfirmQualifier;
      expect(typeof value, `${loc}: evidenceTier.selfConfirmQualifier`).toBe("string");
      expect(String(value).trim().length, `${loc} must not be blank`).toBeGreaterThan(3);
      // next-intl resolves a missing key TO ITSELF, so an untranslated locale
      // would ship the literal "selfConfirmQualifier" to a person.
      expect(String(value)).not.toBe("selfConfirmQualifier");
    }
  });
});
