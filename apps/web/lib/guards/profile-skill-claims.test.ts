/**
 * Guards for the profile_text → self-declared skill claims slice.
 *
 *   1. Profile narrative is written to `profiles.profile_text` only — never
 *      to `workers.bio` (employer-readable via is_employer() RLS).
 *   2. The dedicated server-action surface for self-declared claims
 *      (profile-skill-claims*.ts + profile-skill-claims-section.tsx) MUST
 *      NOT mention "verified" / "confirmed" — those are reserved for a
 *      later external-confirmation flow.
 *   3. The 0015 migration must define `profile_skill_claims` as
 *      RLS-protected, with policies anchored at `profile_id = auth.uid()`
 *      (no `is_employer()` reader path).
 *   4. The i18n disclaimer copy actually shipped in both LT + EN.
 *
 * These tests read source files as plain text (no runtime imports), so
 * they catch regressions even if a future PR rewires the components.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Guard: profile narrative never written to workers.bio", () => {
  it("saveWorkerProfileText updates profiles, not workers", () => {
    const src = read("lib/worker/profile-text-actions.ts");
    expect(src).toMatch(/\.from\(["']profiles["']\)\s*\n?\s*\.update\(\{[^}]*profile_text/);
    // The action file must not write to the workers table.
    expect(src).not.toMatch(/\.from\(["']workers["']\)\s*\n?\s*\.update/);
    expect(src).not.toMatch(/workers.*\.update.*\bbio\b/);
  });

  it("profile-skill-claims server module does not touch workers/workers.bio", () => {
    const src = read("lib/profile/profile-skill-claims.ts");
    expect(src).not.toMatch(/\bfrom\(["']workers["']\)/);
    expect(src).not.toMatch(/\bbio\b/);
  });

  it("capability-profile-section (the canonical CV/skills surface) does not write to workers/bio", () => {
    // Replaces the prior assertion on profile-skill-claims-section.tsx,
    // which was deleted in fix/cc/cv-unify-self-declared after the
    // self-declared chips moved into the unified CapabilityProfileSection.
    const src = read("components/app/capability-profile-section.tsx");
    expect(src).not.toMatch(/\bfrom\(["']workers["']\)/);
    expect(src).not.toMatch(/\bworkers\.bio\b/);
  });
});

describe("Guard: no fake verified/confirmed copy on self-declared claims", () => {
  // The disclaimer copy KEY uses the words intentionally; assert against
  // the JSON VALUES only (no `verified`/`confirmed` may appear in any
  // value under the profileSkillClaims namespace).
  function readClaimsNamespace(locale: "lt" | "en"): Record<string, string> {
    const file = read(`messages/${locale}.json`);
    const json = JSON.parse(file) as Record<string, unknown>;
    const ns = json.profileSkillClaims as Record<string, string> | undefined;
    if (!ns) throw new Error(`profileSkillClaims missing in ${locale}.json`);
    return ns;
  }

  for (const locale of ["lt", "en"] as const) {
    describe(`${locale}.json`, () => {
      const ns = readClaimsNamespace(locale);
      const values = Object.entries(ns);

      it("has the required keys", () => {
        const required = [
          "title",
          "intro",
          "disclaimer",
          "suggestButton",
          "saveButton",
        ];
        for (const k of required) {
          expect(ns[k], `missing key ${k} in ${locale}.json`).toBeTruthy();
        }
      });

      it("no value affirms verification / external confirmation", () => {
        for (const [key, value] of values) {
          if (key === "disclaimer") continue; // disclaimer NEGATES these words
          const lower = value.toLowerCase();
          expect(
            lower,
            `${locale}.profileSkillClaims.${key} must not affirm verified/confirmed`,
          ).not.toMatch(/\bverified\b|\bpatvirtinta(s|i)?\b|\bconfirmed\b/);
        }
      });
    });
  }

  it("the disclaimer explicitly says NOT reviewed (LT, silent-trust rule)", () => {
    const lt = read("messages/lt.json");
    expect(lt).toMatch(/dar neperžiūrėti/);
  });

  it("the disclaimer explicitly says NOT reviewed (EN, silent-trust rule)", () => {
    const en = read("messages/en.json");
    expect(en).toMatch(/not yet reviewed/);
  });
});

describe("Guard: migration 0015 is owner-only and uses explicit grants", () => {
  const sql = read("../../supabase/migrations/0015_profile_skill_claims.sql");

  it("enables RLS", () => {
    expect(sql).toMatch(/alter table public\.profile_skill_claims enable row level security/i);
  });

  it("select policy anchors at profile_id = auth.uid()", () => {
    expect(sql).toMatch(/profile_skill_claims_select[\s\S]*profile_id\s*=\s*auth\.uid\(\)/);
  });

  it("never opens reads to is_employer()", () => {
    // Catch a future regression where someone adds `or is_employer()` to
    // the select policy — that would leak self-declared narrative-derived
    // claims to every company/agency account.
    const policyBlock = sql.match(
      /create policy profile_skill_claims_select[\s\S]*?;/,
    );
    expect(policyBlock?.[0] ?? "").not.toMatch(/is_employer\(\)/);
  });

  it("write policies anchor at profile_id = auth.uid()", () => {
    for (const verb of ["insert", "update", "delete"] as const) {
      const re = new RegExp(
        `create policy profile_skill_claims_${verb}[\\s\\S]*profile_id\\s*=\\s*auth\\.uid\\(\\)`,
      );
      expect(sql, `${verb} policy missing owner anchor`).toMatch(re);
    }
  });

  it("grants explicit CRUD to the authenticated role", () => {
    expect(sql).toMatch(
      /grant\s+select,\s*insert,\s*update,\s*delete\s+on\s+public\.profile_skill_claims\s+to\s+authenticated/i,
    );
  });

  it("constraints status/source/visibility to safe defaults only", () => {
    expect(sql).toMatch(/status\s+text[\s\S]*check\s*\(\s*status\s+in\s*\(\s*['"]self_declared['"]\s*\)/);
    expect(sql).toMatch(/source\s+text[\s\S]*check\s*\(\s*source\s+in\s*\(\s*['"]profile_text['"]\s*\)/);
    expect(sql).toMatch(/visibility\s+text[\s\S]*check\s*\(\s*visibility\s+in\s*\(\s*['"]closed['"]\s*\)/);
  });
});
