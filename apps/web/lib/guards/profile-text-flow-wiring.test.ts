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

describe("Guard: unified capability surface (replaces the standalone section)", () => {
  // fix/cc/cv-unify-self-declared deleted components/app/profile-skill-
  // claims-section.tsx and moved the saved-chip display into the
  // unified CapabilityProfileSection. These assertions guarantee the
  // new component preserves the same invariants the standalone section
  // had (no duplicate CTA, no inline extract/save) AND the same
  // delete-affordance for owner-only cleanup.
  const capability = read(
    "components/app/capability-profile-section.tsx",
  );

  it("does NOT reference the suggest CTA i18n key (CTA stays in ProfileTextFirstFlow)", () => {
    const codeOnly = capability
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*\n/g, "");
    expect(codeOnly).not.toMatch(/t\(\s*["']suggestButton["']\s*\)/);
  });

  it("does NOT import the deterministic extractor (display-only)", () => {
    expect(capability).not.toMatch(
      /from\s+["']@\/lib\/profile\/skill-claim-extractor["']/,
    );
  });

  it("does NOT import the save server action (display-only)", () => {
    expect(capability).not.toMatch(/saveProfileSkillClaimsAction/);
  });

  it("preserves owner-only chip delete via deleteProfileSkillClaimAction", () => {
    expect(capability).toMatch(/deleteProfileSkillClaimAction/);
  });

  it("renders the self-declared chips as the FIRST sub-section", () => {
    // The product rule (PLATFORM_DOCTRINE §1) places the user's own
    // self-declared capabilities ahead of any work-context history,
    // because they belong to the person, not the context.
    const codeOnly = capability
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*\n/g, "");
    const claimsIdx = codeOnly.indexOf("hasClaims &&");
    const engagementsIdx = codeOnly.indexOf("hasEngagements &&");
    expect(claimsIdx, "self-declared block missing").toBeGreaterThan(-1);
    expect(engagementsIdx, "engagements block missing").toBeGreaterThan(
      -1,
    );
    expect(claimsIdx).toBeLessThan(engagementsIdx);
  });

  it("renders WITHOUT requiring engagements (works for non-worker users)", () => {
    // `if (!hasClaims && !hasEngagements) return null` — when the user
    // has chips but NO engagements (e.g. a pure company account that
    // typed profile text), the section still renders.
    expect(capability).toMatch(
      /if\s*\(\s*!hasClaims\s*&&\s*!hasEngagements\s*\)\s*return\s+null/,
    );
  });
});

describe("Guard: profile page is no longer construction-only gated", () => {
  const page = read("app/[locale]/dashboard/profile/page.tsx");

  it("does NOT gate the text-first composer on workerId presence", () => {
    // The old structure was `workerId ? <ProfileTextFirstFlow .../> :
    // <p>noProfession</p>` — the composer hidden from non-workers.
    // The fix renders the composer unconditionally; workerId only
    // gates the catalogued worker-skills picker in manualSlot.
    const codeOnly = page
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*\n/g, "");
    // No `{workerId ? <ProfileTextFirstFlow` anywhere — the composer
    // sits OUTSIDE any workerId ternary.
    expect(codeOnly).not.toMatch(
      /workerId\s*\?\s*\(\s*<\s*>[\s\S]*<ProfileTextFirstFlow/,
    );
    // The composer JSX is present at top level.
    expect(codeOnly).toMatch(/<ProfileTextFirstFlow\b/);
  });

  it("does NOT render the construction-only 'noProfession' dead-end branch", () => {
    // Previously: `: <p>{t("noProfession")}</p>` blocked non-workers.
    // The fix removes the branch entirely — non-workers get the
    // composer + their self-declared chips like everyone else.
    expect(page).not.toMatch(/noProfession/);
  });

  it("renders the unified CapabilityProfileSection (single canonical area)", () => {
    expect(page).toMatch(/<CapabilityProfileSection\b/);
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

describe("Guard: broad non-construction skills survive a construction-context narrative", () => {
  // PLATFORM_DOCTRINE §1: a user is not locked into one category.
  // The extended owner sentence mixes construction (statyti namus,
  // dengti stogus) with non-construction (programuoti, gaminti
  // patiekalus). All four canonical chips MUST be returned together —
  // the construction context cannot suppress the broad skills.
  it("extended owner sentence keeps Programavimas + Maisto gamyba alongside the construction skills", async () => {
    const { extractProfileSkillClaims } = await import(
      "../profile/skill-claim-extractor"
    );
    const labels = extractProfileSkillClaims(
      "Moku gerai programuoti ir statyti namus, dengti stogus ir gaminti lietuviškos virtuvės patiekalus",
    ).map((c) => c.label);
    expect(labels).toContain("Programavimas");
    expect(labels).toContain("Namų statyba");
    expect(labels).toContain("Stogų dengimas");
    expect(labels).toContain("Maisto gamyba");
    // The two "broad" non-construction chips must NOT come last just
    // because there are more construction matches — the dictionary
    // order in skill-claim-extractor.ts puts Programavimas first so
    // a refactor that re-orders by frequency or by category would be
    // caught here.
    expect(labels.indexOf("Programavimas")).toBeLessThan(
      labels.indexOf("Namų statyba"),
    );
  });
});

describe("Guard: capability-profile copy avoids fake verification", () => {
  for (const locale of ["lt", "en"] as const) {
    it(`${locale}.capabilityProfile keeps the self-declared status honest`, () => {
      const json = JSON.parse(read(`messages/${locale}.json`)) as Record<
        string,
        unknown
      >;
      const ns = json.capabilityProfile as Record<string, string>;
      expect(ns, "capabilityProfile namespace missing").toBeTruthy();
      // Required honest-status keys must be present.
      expect(ns.selfDeclaredStatus).toBeTruthy();
      expect(ns.notExternallyVerified).toBeTruthy();
      expect(ns.sourceProfileText).toBeTruthy();
      // The disclaimer is the only key allowed to NEGATE the words.
      const WHITELIST = new Set([
        "disclaimer",
        "notExternallyVerified",
        "selfDeclaredStatus",
      ]);
      for (const [key, val] of Object.entries(ns)) {
        if (WHITELIST.has(key)) continue;
        const lower = val.toLowerCase();
        expect(
          lower,
          `${locale}.capabilityProfile.${key} must not affirm verified/confirmed`,
        ).not.toMatch(/\bverified\b|\bconfirmed\b|\bpatvirtin\w*/);
      }
    });
  }
});
