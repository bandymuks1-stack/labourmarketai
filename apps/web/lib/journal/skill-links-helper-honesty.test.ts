import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Journal skill-link helper honesty (lane D, window 6).
 *
 * Measured on production 2026-09-06 (walk-living-evidence-loop, run 3): a
 * journal entry whose two linked skills had just been manager-confirmed
 * (worker_skills.verified = true, "Peržiūrėta · Peržiūrėjo Savininkas")
 * still read "✓ Metalo konstrukcijų montavimas … Dar neperžiūrėta." — the
 * helper's "not yet reviewed" default is the honest line for a self-asserted
 * link, and a false statement once every linked chip is confirmed.
 *
 * Pins:
 *   1. the component switches to `helperConfirmedLinks` ONLY under the
 *      `confirmed_by_person` predicate over EVERY linked chip (never on a
 *      mixed set, never when nothing is linked);
 *   2. every locale that carries the namespace carries the key;
 *   3. the confirmed variant makes no claim of its own — no "not reviewed"
 *      negation, and no verification/confirmation word (the silent-trust
 *      guard in lib/guards/journal-entry-skill-links.test.ts exempts only
 *      `helper`; this key must pass it unexempted).
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const COMPONENT = read("components/app/journal-entry-skill-links.tsx");
const NAMESPACE_LOCALES = ["lt", "en", "de", "nl", "ru"] as const;

const VERIFY_CLAIM = /patvirtint|patikrint|\bverified\b|\bconfirmed\b|geprüft|bevestigd|подтвержд/i;
const NOT_REVIEWED = /neperžiūr|not\s+reviewed|nicht geprüft|niet beoordeeld|не просмотрено/i;

describe("journal skill-link helper: 'not yet reviewed' never outlives the confirmation", () => {
  it("switches helpers only when EVERY linked chip is confirmed_by_person", () => {
    expect(COMPONENT).toMatch(
      /const allLinkedConfirmed =\s*linkedSelected\.length > 0 &&\s*linkedSelected\.every\(\(s\) => sourceOf\(s\.id\) === "confirmed_by_person"\)/,
    );
    expect(COMPONENT).toMatch(/allLinkedConfirmed \? t\("helperConfirmedLinks"\) : t\("helper"\)/);
  });

  for (const loc of NAMESPACE_LOCALES) {
    it(`${loc}: carries helperConfirmedLinks, without a negation and without a claim`, () => {
      const ns = JSON.parse(read(`messages/${loc}.json`)).journalSkillLinks as Record<string, string>;
      const v = ns.helperConfirmedLinks ?? "";
      expect(v.trim().length, `${loc} journalSkillLinks.helperConfirmedLinks`).toBeGreaterThan(0);
      expect(NOT_REVIEWED.test(v), `${loc}: "${v}" still says not reviewed`).toBe(false);
      expect(VERIFY_CLAIM.test(v), `${loc}: "${v}" claims verification`).toBe(false);
      // The default helper keeps its honest negation (the silent-trust rule).
      expect(NOT_REVIEWED.test(ns.helper ?? ""), `${loc}: default helper lost its honesty`).toBe(true);
    });
  }
});
