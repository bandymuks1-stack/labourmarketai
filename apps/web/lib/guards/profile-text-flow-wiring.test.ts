/**
 * Production wiring regression tests for the profile-text → self-declared
 * skill claims slice (`fix/cc/profile-text-skills-production-wiring`).
 *
 * Background: PR #45 shipped a deterministic LT+EN skill-claim extractor
 * plus a `profile_skill_claims` table, but kept the new "suggest" CTA in
 * a SEPARATE section. The owner's production test pasted text into the
 * existing composer above the new section, clicked the composer's
 * "Pasiūlykite struktūrą" button (which only ran the OLD extractor whose
 * vocabulary lacks "programuoti"/"statyti namus"), and saw `Rasti
 * įgūdžiai = 0` while the new bucket stayed dormant. Two competing
 * suggestion systems, the prominent one lost.
 *
 * These guards lock the fix in place:
 *
 *   1. The integrated composer (ProfileTextFirstFlow) MUST import the
 *      PR #45 extractor and the profile_skill_claims save server action.
 *   2. ProfileTextFirstFlow MUST keep the existing OLD extractor too —
 *      the catalogued-skills bucket is still useful.
 *   3. The standalone ProfileSkillClaimsSection MUST NOT carry its own
 *      `Pasiūlykite struktūrą` / `suggestButton` CTA anymore (single CTA
 *      invariant).
 *   4. No profile-text-flow i18n value uses "Patvirtinta" / "patvirtintus"
 *      / "Confirmed" / "Verified" (whitelist: the disclaimer keys that
 *      explicitly NEGATE these words).
 *   5. The new structuring bucket key `selfDeclared` exists in LT + EN
 *      with the slice-spec wording.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const APP_ROOT = join(__dirname, "..", "..");

function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}

describe("Guard: profile-text composer is single-canonical (no dual-system UI)", () => {
  const flow = read("components/app/profile-text-first-flow.tsx");

  it("imports the deterministic skill-claim extractor", () => {
    expect(flow).toMatch(
      /from\s+["']@\/lib\/profile\/skill-claim-extractor["']/,
    );
    expect(flow).toMatch(/extractProfileSkillClaims/);
  });

  it("imports the profile_skill_claims save server action", () => {
    expect(flow).toMatch(
      /from\s+["']@\/lib\/profile\/profile-skill-claims-actions["']/,
    );
    expect(flow).toMatch(/saveProfileSkillClaimsAction/);
  });

  it("DOES NOT import the legacy `extractProfileSuggestions` (duplicate-system removal)", () => {
    // Owner production smoke showed the OLD bucket grid surfaced
    // "Stogdengys" via this legacy extractor while the new canonical
    // upper bucket stayed empty — a confusing dual-system UI. Removing
    // the import is the single hard guarantee that the legacy flow
    // can't re-enter through ProfileTextFirstFlow. Comments are stripped
    // first so the file's "Removed in …" header doesn't false-trigger.
    const codeOnly = flow
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*\n/g, "");
    expect(codeOnly).not.toMatch(/extractProfileSuggestions/);
    expect(codeOnly).not.toMatch(
      /from\s+["']@\/lib\/structuring\/extract-profile-suggestions["']/,
    );
  });

  it("renders ONLY the selfDeclared bucket — no catalogued / directions / roles / experience / cvEntries renders", () => {
    // The legacy bucket grid is gone. Each old bucket KEY must not
    // appear as a tBucket(...) argument. Comments are stripped before
    // the match so explanatory headers don't false-trigger.
    const codeOnly = flow
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*\n/g, "");
    expect(codeOnly).toMatch(/tBucket\(["']selfDeclared["']\)/);
    for (const old of ["skills", "directions", "roles", "experience", "cvEntries"]) {
      expect(
        codeOnly,
        `tBucket('${old}') must not render on the profile-text flow`,
      ).not.toMatch(new RegExp(`tBucket\\(["']${old}["']\\)`));
    }
  });

  it("apply path persists self-declared confirmations via saveProfileSkillClaimsAction", () => {
    expect(flow).toMatch(/selfDeclared[\s\S]{0,300}\.filter\([\s\S]{0,80}["']confirmed["']/);
    expect(flow).toMatch(/saveProfileSkillClaimsAction\s*\(/);
  });

  it("apply path no longer POSTs to /api/workers/:id/skills from this surface", () => {
    // Catalogued worker_skills saves now live ONLY behind the manual
    // picker (manualSlot → WorkerTradeProfile). Re-introducing a POST
    // here would resurrect the dual-system save path that owner
    // production smoke rejected.
    expect(flow).not.toMatch(
      /fetch\(\s*[`'"]\/api\/workers\//,
    );
  });
});

describe("Guard: standalone section is display-only (no duplicate CTA)", () => {
  const section = read("components/app/profile-skill-claims-section.tsx");

  it("does NOT reference the suggest CTA i18n key", () => {
    // The old duplicate CTA called `t('suggestButton')`. A pure display-
    // only section never does. Comments are stripped before matching so
    // an explanatory header that mentions the old button by name doesn't
    // false-trigger.
    const codeOnly = section
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*\n/g, "");
    expect(codeOnly).not.toMatch(/t\(\s*["']suggestButton["']\s*\)/);
  });

  it("does NOT import the deterministic extractor (no inline suggest path)", () => {
    expect(section).not.toMatch(
      /from\s+["']@\/lib\/profile\/skill-claim-extractor["']/,
    );
  });

  it("does NOT import the save server action (no inline save path)", () => {
    expect(section).not.toMatch(/saveProfileSkillClaimsAction/);
  });

  it("still allows deleting saved chips (read+delete surface)", () => {
    expect(section).toMatch(/deleteProfileSkillClaimAction/);
  });

  it("renders nothing when there are no saved claims", () => {
    expect(section).toMatch(/if\s*\(\s*savedClaims\.length\s*===\s*0\s*\)\s*return\s+null/);
  });
});

describe("Guard: misleading 'Patvirtinta/Confirmed/Verified' copy is gone from this flow", () => {
  // The values inspected below MUST NOT affirm verification. The
  // disclaimer-style keys (which explicitly NEGATE these words) are
  // listed in WHITELIST and skipped.

  const WHITELIST = new Set([
    // structuring.buckets.selfDeclaredDisclaimer — explicit "not yet confirmed"
    "selfDeclaredDisclaimer",
    // skills.textFirst.textClaimNotVerified — explicit "not externally verified yet"
    "textClaimNotVerified",
    // skills.textFirst.needsExternalConfirmation — describes a FUTURE state
    "needsExternalConfirmation",
    // profileSkillClaims.disclaimer — explicit "not yet confirmed by..."
    "disclaimer",
  ]);

  for (const locale of ["lt", "en"] as const) {
    describe(`${locale}.json — skills.textFirst.*`, () => {
      const json = JSON.parse(read(`messages/${locale}.json`)) as Record<
        string,
        unknown
      >;
      const skills = json.skills as Record<string, unknown>;
      const textFirst = skills.textFirst as Record<string, string>;
      const entries = Object.entries(textFirst);

      it("has the expected updated wording on the apply CTA + saved status", () => {
        const apply = textFirst.applyAll.toLowerCase();
        const confirmed = textFirst.confirmedByYou.toLowerCase();
        if (locale === "lt") {
          expect(apply).toContain("pasirinkt");
          expect(apply).not.toMatch(/patvirtint/);
          expect(confirmed).toContain("paties nurodyt");
          expect(confirmed).not.toMatch(/patvirtint/);
        } else {
          expect(apply).toContain("selected");
          expect(apply).not.toMatch(/confirmed/);
          expect(confirmed).toContain("self-declared");
          expect(confirmed).not.toMatch(/confirmed/);
        }
      });

      it("no value affirms verified/confirmed/patvirtint outside the whitelist", () => {
        for (const [key, val] of entries) {
          if (WHITELIST.has(key)) continue;
          const lower = val.toLowerCase();
          expect(
            lower,
            `${locale}.skills.textFirst.${key} must not affirm verified/confirmed`,
          ).not.toMatch(/\bverified\b|\bconfirmed\b|\bpatvirtin\w*/);
        }
      });
    });

    describe(`${locale}.json — structuring.actions/status/buckets.*`, () => {
      const json = JSON.parse(read(`messages/${locale}.json`)) as Record<
        string,
        unknown
      >;
      const structuring = json.structuring as Record<string, unknown>;

      it("has the new selfDeclared bucket key + disclaimer", () => {
        const buckets = structuring.buckets as Record<string, string>;
        expect(buckets.selfDeclared, `${locale}.structuring.buckets.selfDeclared missing`).toBeTruthy();
        expect(buckets.selfDeclaredDisclaimer, `${locale}.structuring.buckets.selfDeclaredDisclaimer missing`).toBeTruthy();
        if (locale === "lt") {
          expect(buckets.selfDeclared).toContain("Paties nurodyti");
          expect(buckets.selfDeclaredDisclaimer).toContain("dar nėra patvirtinti");
        } else {
          expect(buckets.selfDeclared.toLowerCase()).toContain("self-declared");
          expect(buckets.selfDeclaredDisclaimer.toLowerCase()).toContain(
            "not yet confirmed",
          );
        }
      });

      it("per-card action/status no longer say Patvirtinti/Confirmed", () => {
        const actions = structuring.actions as Record<string, string>;
        const status = structuring.status as Record<string, string>;
        if (locale === "lt") {
          expect(actions.confirm).toBe("Pasirinkti");
          expect(status.confirmed).toBe("Pasirinkta");
        } else {
          expect(actions.confirm).toBe("Select");
          expect(status.confirmed).toBe("Selected");
        }
      });
    });
  }
});

describe("Goal example: extractor returns Programavimas + Namų statyba", () => {
  // The extractor itself has unit tests in
  // lib/profile/skill-claim-extractor.test.ts. This guard repeats the
  // exact owner-example assertion in the SAME file as the wiring guards
  // so future regressions surface in the same diff/CI failure that
  // touches the flow.
  it("anchor: owner text → 2 self-declared chip labels", async () => {
    const { extractProfileSkillClaims } = await import(
      "../profile/skill-claim-extractor"
    );
    const labels = extractProfileSkillClaims(
      "Moku gerai programuoti ir statyti namus",
    ).map((c) => c.label);
    expect(labels).toContain("Programavimas");
    expect(labels).toContain("Namų statyba");
  });
});
