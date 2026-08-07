import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { deriveNonWorkerIdentityNotice } from "@/lib/profile/non-worker-identity";

/**
 * W7-S5b — a non-worker identity on `/dashboard/profile` is EXPLICIT.
 *
 * The audited premise ("a pure company/agency identity silently loses 13
 * blocks") is unreachable for normally-created accounts: migration 0009's
 * `on_profile_created_ensure_worker` trigger gives EVERY profile a `workers`
 * row, so the page's `workerId` gates never fire for them. The real,
 * reachable defect: an account holding no person ROLE (identity truth =
 * `profile_roles`, the set the RoleSwitcher computes held/missing identities
 * from) saw a worker-framed page — "Your professional passport" — around
 * person sections that are empty, with no word about why.
 *
 *  1. The derivation keys on IDENTITY (roles); the entity row only picks the
 *     honest presentation variant (sections-empty vs sections-hidden).
 *  2. The page mounts THE one notice, resolved in the ONE translation batch
 *     (never a standalone await — W7-S3 ratchet).
 *  3. The FeatureNote no longer shows worker copy to non-worker identities —
 *     and its gate is identity, not the never-null `workerId`.
 *  4. The notice explains without fabricating a person profile and without
 *     silo framing, in every shipped locale.
 */
const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

const PROFILE = code("app/[locale]/dashboard/profile/page.tsx");
const NOTICE = code("components/app/non-worker-identity-notice.tsx");

// Active locales (lt/en/ru/nl/de) must carry real copy; da carries real
// Danish because the DA debt ratchet forbids new `[EN]` strings.
const REAL_LOCALES = ["lt", "en", "ru", "nl", "de", "da"] as const;
const KEYS = [
  "title",
  "bodySectionsEmpty",
  "bodySectionsHidden",
  "companyProfileHint",
  "companyProfileLink",
  "addIdentityHint",
] as const;

describe("W7-S5b — derivation keys on identity, presents the entity truth", () => {
  it("hidden whenever the person role is held — the page is genuinely theirs", () => {
    expect(
      deriveNonWorkerIdentityNotice({ workerId: "w-1", roles: ["worker"] }),
    ).toEqual({ kind: "hidden" });
    expect(
      deriveNonWorkerIdentityNotice({
        workerId: "w-1",
        roles: ["worker", "company"],
      }),
    ).toEqual({ kind: "hidden" });
    // Degraded (role without entity row) still counts as a chosen person
    // identity — the per-section needs-migration states own that story.
    expect(
      deriveNonWorkerIdentityNotice({ workerId: null, roles: ["worker"] }),
    ).toEqual({ kind: "hidden" });
  });

  it("organization-only for company / agency / customer identities", () => {
    for (const role of ["company", "agency", "customer"] as const) {
      expect(
        deriveNonWorkerIdentityNotice({ workerId: "w-1", roles: [role] }),
      ).toEqual({
        kind: "visible",
        reason: "organization-only",
        presentation: "sections-empty",
      });
    }
  });

  it("the entity row picks the presentation variant, never the visibility", () => {
    expect(
      deriveNonWorkerIdentityNotice({ workerId: null, roles: ["company"] }),
    ).toEqual({
      kind: "visible",
      reason: "organization-only",
      presentation: "sections-hidden",
    });
    expect(deriveNonWorkerIdentityNotice({ workerId: null, roles: [] })).toEqual(
      {
        kind: "visible",
        reason: "no-person-role",
        presentation: "sections-hidden",
      },
    );
    expect(
      deriveNonWorkerIdentityNotice({ workerId: "w-1", roles: [] }),
    ).toEqual({
      kind: "visible",
      reason: "no-person-role",
      presentation: "sections-empty",
    });
  });
});

describe("W7-S5b — the page mounts THE one notice honestly", () => {
  it("the notice renders only in the visible state, with both facts", () => {
    expect(PROFILE).toMatch(
      /identityNotice\.kind === "visible"[\s\S]{0,200}<NonWorkerIdentityNotice/,
    );
    expect(PROFILE).toMatch(/presentation=\{identityNotice\.presentation\}/);
    expect(
      (PROFILE.match(/<NonWorkerIdentityNotice/g) ?? []).length,
      "exactly one mount",
    ).toBe(1);
  });

  it("the body says the sentence that is true for the presentation", () => {
    expect(PROFILE).toMatch(/"bodySectionsEmpty"/);
    expect(PROFILE).toMatch(/"bodySectionsHidden"/);
  });

  it("its namespace joined the ONE translation batch — no new await", () => {
    expect(PROFILE).toMatch(/getTranslations\("profileIdentityNotice"\)/);
    expect(PROFILE).not.toMatch(
      /await getTranslations\("profileIdentityNotice"\)/,
    );
  });

  it("the derivation reads data the page already fetched", () => {
    expect(PROFILE).toMatch(
      /deriveNonWorkerIdentityNotice\(\{ workerId, roles \}\)/,
    );
    // W7-S4 still holds: explaining the absence must not re-import the
    // organisation readers the page deliberately dropped.
    expect(PROFILE).not.toMatch(/getOwnedOrganizations\(/);
  });

  it("the FeatureNote gate is identity — a workerId gate would never fire", () => {
    expect(PROFILE).toMatch(
      /identityNotice\.kind === "hidden"\s*\?\s*tFeatureNotes\("workerProfile"\)\s*:\s*tFeatureNotes\("identityModel"\)/,
    );
    expect(PROFILE).not.toMatch(
      /workerId\s*\?\s*tFeatureNotes\("workerProfile"\)/,
    );
  });
});

describe("W7-S5b — the notice component explains, never fabricates", () => {
  it("exposes machine-readable reason and presentation", () => {
    expect(NOTICE).toMatch(/data-testid="profile-identity-context-notice"/);
    expect(NOTICE).toMatch(/data-reason=\{reason\}/);
    expect(NOTICE).toMatch(/data-presentation=\{presentation\}/);
  });

  it("the company pointer renders only when an organisation identity exists", () => {
    expect(NOTICE).toMatch(
      /reason === "organization-only"[\s\S]{0,400}\/dashboard\/company/,
    );
  });

  it("the company link is a 44px target (A-2 doctrine)", () => {
    expect(NOTICE).toMatch(
      /min-h-11[^"]*"[\s\S]{0,120}data-testid="profile-identity-company-link"/,
    );
  });

  it("presentational only: no data reads, no person fabrication", () => {
    expect(NOTICE).not.toMatch(/supabase|createClient|getTranslations/);
  });
});

describe("W7-S5b — copy is real, honest and silo-free in every shipped locale", () => {
  const SILO = /\bspace\b|erdvė|пространств|workspace/i;
  for (const locale of REAL_LOCALES) {
    const messages = JSON.parse(read(`messages/${locale}.json`)) as {
      profileIdentityNotice?: Record<string, string>;
    };
    const ns = messages.profileIdentityNotice;
    it(`${locale}: all keys present, non-empty, not [EN] shells`, () => {
      expect(ns, `${locale} namespace`).toBeTruthy();
      for (const key of KEYS) {
        const value = ns?.[key] ?? "";
        expect(value.trim(), `${locale}.${key}`).not.toBe("");
        expect(value.startsWith("[EN]"), `${locale}.${key} is a shell`).toBe(
          false,
        );
      }
    });
    it(`${locale}: no silo framing, no verification claim`, () => {
      for (const key of KEYS) {
        expect(ns?.[key] ?? "").not.toMatch(SILO);
      }
      // The notice must never imply the person sections were "verified" or
      // that a person profile exists.
      for (const key of ["bodySectionsEmpty", "bodySectionsHidden"] as const) {
        expect(ns?.[key] ?? "").not.toMatch(/verified|patvirtinta|подтвержд/i);
      }
    });
  }
});
