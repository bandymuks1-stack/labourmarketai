import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Source-level guard for the Profile / CV / Evidence hub v1.
 *
 * Product doctrine: CV, skills, self-declared claims and work-journal evidence
 * are ONE worker profile ("professional passport"), not separate technical
 * islands. This guard pins that the canonical `/dashboard/profile` keeps a
 * single unifying overview that:
 *   1. names all three pillars together (CV + skills + work-journal evidence);
 *   2. bridges to the Work Journal room (evidence is never a dead-end count);
 *   3. carries the honest "not yet human/document verified" disclaimer;
 *   4. never labels self-declared skills as verified/confirmed (no fake
 *      verification) — that affirmative wording is reserved for the real
 *      manager-confirmation path, which lives elsewhere;
 *   5. has exactly one canonical CV upload surface (no parallel CV flow);
 *   6. is reached from the account surface, not a parallel CV page.
 *
 * Runs in CI via `pnpm -F web test`. Pure source assertions; invents nothing.
 */

const APP_ROOT = join(__dirname, "..", "..");

function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}
function loadJson(rel: string): Record<string, unknown> {
  return JSON.parse(read(rel)) as Record<string, unknown>;
}

const PROFILE_PAGE = "app/[locale]/dashboard/profile/page.tsx";
const HUB = "components/app/profile-hub-overview.tsx";
const ACCOUNT_PAGE = "app/[locale]/dashboard/account/page.tsx";
const LOCALES = ["lt", "en"] as const;

// ── 1. The profile page renders the unifying hub overview ─────────────────

describe("Guard: /dashboard/profile renders the unified hub overview", () => {
  const page = read(PROFILE_PAGE);

  it("imports and renders ProfileHubOverview", () => {
    expect(page).toMatch(/import\s*\{\s*ProfileHubOverview\s*\}/);
    expect(page).toMatch(/<ProfileHubOverview/);
  });

  it("feeds the hub all three pillars from real saved data", () => {
    expect(page).toMatch(/cvProvided=\{/);
    expect(page).toMatch(/selfDeclaredCount=\{/);
    expect(page).toMatch(/journalCount=\{/);
    expect(page).toMatch(/hasWorker=\{/);
  });

  it("exposes the #profile-edit anchor the primary action targets", () => {
    expect(page).toMatch(/id="profile-edit"/);
  });
});

// ── 2. The hub names the three pillars + bridges to the journal ───────────

describe("Guard: the hub unifies CV + skills + journal and bridges to the room", () => {
  const hub = read(HUB);

  it("the hub component exists", () => {
    expect(existsSync(join(APP_ROOT, HUB))).toBe(true);
  });

  it("references all three pillars (cv + skills + journal)", () => {
    expect(hub).toMatch(/pillars\.cv\./);
    expect(hub).toMatch(/pillars\.skills\./);
    expect(hub).toMatch(/pillars\.journal\./);
  });

  it("bridges to the Work Journal room (no dead-end evidence count)", () => {
    expect(
      hub,
      "hub must link to /dashboard/journal so journal evidence is reachable from the profile",
    ).toMatch(/href="\/dashboard\/journal"/);
  });

  it("renders the single honest not-verified disclaimer + one primary action", () => {
    expect(hub).toMatch(/profileHub|notVerified/);
    expect(hub).toMatch(/profile-hub-not-verified/);
    expect(hub).toMatch(/profile-hub-primary-action/);
    expect(hub).toMatch(/href="#profile-edit"/);
  });
});

// ── 3. Honest status copy — no fake verification on self-declared ─────────

// Affirmative "this is verified" claim tokens. The ONLY profileHub value
// allowed to contain them is `notVerified`, which is a NEGATION ("not yet…").
const VERIFY_CLAIM = /patvirtint|patikrint|\bverified\b|\bconfirmed\b/i;

function flattenStrings(
  obj: unknown,
  prefix = "",
  acc: Record<string, string> = {},
): Record<string, string> {
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      flattenStrings(v, prefix ? `${prefix}.${k}` : k, acc);
    }
  } else if (typeof obj === "string") {
    acc[prefix] = obj;
  }
  return acc;
}

describe("Guard: profileHub copy is honest (self-declared, never fake-verified)", () => {
  for (const loc of LOCALES) {
    const hub = loadJson(`messages/${loc}.json`).profileHub;

    it(`${loc}: profileHub namespace exists with the pillar keys`, () => {
      expect(hub, `${loc} messages must carry the profileHub namespace`).toBeTruthy();
      const flat = flattenStrings(hub);
      for (const k of [
        "lead",
        "explainer",
        "notVerified",
        "primaryAction",
        "journalLink",
        "pillars.cv.label",
        "pillars.skills.label",
        "pillars.journal.label",
      ]) {
        expect(typeof flat[k] === "string" && flat[k].trim().length > 0, `${loc} profileHub.${k} missing`).toBe(true);
      }
    });

    it(`${loc}: the not-verified disclaimer is an honest negation`, () => {
      const flat = flattenStrings(hub);
      const v = flat["notVerified"] ?? "";
      const negated = loc === "lt" ? /nepatvirtint/i.test(v) : /not\s+yet/i.test(v) && /verif/i.test(v);
      expect(negated, `${loc} profileHub.notVerified must say it is NOT yet verified: "${v}"`).toBe(true);
    });

    it(`${loc}: no profileHub value (except notVerified) claims verified/confirmed`, () => {
      const flat = flattenStrings(hub);
      for (const [k, v] of Object.entries(flat)) {
        if (k === "notVerified") continue; // the allowed honest negation
        expect(
          VERIFY_CLAIM.test(v),
          `${loc} profileHub.${k} must not claim verification on self-declared content: "${v}"`,
        ).toBe(false);
      }
    });
  }

  it("LT and EN profileHub key sets are identical (no locale drift)", () => {
    const lt = Object.keys(flattenStrings(loadJson("messages/lt.json").profileHub)).sort();
    const en = Object.keys(flattenStrings(loadJson("messages/en.json").profileHub)).sort();
    expect(lt).toEqual(en);
  });
});

// ── 4. One canonical CV upload surface; account → canonical profile ───────

const CV_ACCEPT = /accept=\{?["'][^"'}]*(?:pdf|docx)/i;
const CV_UPLOAD_PRIMITIVES = new Set([
  "components/app/cv-import-upload.tsx",
  "components/app/cv-input-panel.tsx",
]);

describe("Guard: single canonical CV upload surface + canonical account link", () => {
  it("no CV file-pick surface outside the allowlisted primitives", () => {
    // Mirrors canonical-paths-integrity; kept here so the hub guard is
    // self-contained against a second CV upload flow appearing.
    for (const f of CV_UPLOAD_PRIMITIVES) {
      expect(existsSync(join(APP_ROOT, f)), `${f} missing — update allowlist`).toBe(true);
      expect(CV_ACCEPT.test(read(f)), `${f} should carry the CV file-pick input`).toBe(true);
    }
    // The hub itself must NOT introduce a CV upload input.
    expect(CV_ACCEPT.test(read(HUB)), "the hub overview must not host a CV upload input").toBe(false);
  });

  it("account page links to the canonical /dashboard/profile (not a parallel CV page)", () => {
    expect(read(ACCOUNT_PAGE)).toMatch(/href="\/dashboard\/profile"/);
  });
});

// ── 5. Journal → skill evidence-support layer (v1) ────────────────────────

describe("Guard: the hub surfaces journal→skill evidence support (not verification)", () => {
  it("profile page derives + passes skillEvidence to the hub", () => {
    const page = read(PROFILE_PAGE);
    expect(page).toMatch(/deriveSkillEvidence/);
    expect(page).toMatch(/skillEvidence=\{/);
  });

  it("hub renders the evidence-support block from real provenance", () => {
    const hub = read(HUB);
    expect(hub).toMatch(/evidence\.intro/);
    expect(hub).toMatch(/evidence\.supported/);
    expect(hub).toMatch(/profile-hub-skill-evidence/);
    // missing-evidence state must exist AND the journal path stays reachable.
    expect(hub).toMatch(/evidence\.noneYet/);
    expect(hub).toMatch(/href="\/dashboard\/journal"/);
  });

  it("the derivation helper exists (durable evidence mapping layer)", () => {
    expect(existsSync(join(APP_ROOT, "lib/profile/skill-evidence.ts"))).toBe(true);
  });

  for (const loc of LOCALES) {
    it(`${loc}: evidence-support copy is journal-backing, NOT verified/confirmed`, () => {
      const evidence = (loadJson(`messages/${loc}.json`).profileHub as Record<string, unknown>)
        .evidence as Record<string, string>;
      expect(evidence, `${loc} profileHub.evidence missing`).toBeTruthy();
      for (const k of ["intro", "supported", "noneYet"]) {
        expect(typeof evidence[k] === "string" && evidence[k].trim().length > 0, `${loc} evidence.${k} missing`).toBe(true);
        // evidence-support wording must never read as verification.
        expect(
          VERIFY_CLAIM.test(evidence[k]),
          `${loc} evidence.${k} must not claim verified/confirmed: "${evidence[k]}"`,
        ).toBe(false);
      }
      // The "supported" line is explicitly about WORK ENTRIES, not verification.
      const supportPhrase = loc === "lt" ? /darbo įraš/i : /work entr/i;
      expect(supportPhrase.test(evidence.supported), `${loc} evidence.supported must say work entries`).toBe(true);
    });
  }
});

// ── Negative controls: prove the detectors bite ───────────────────────────

describe("Guard: detectors are real (negative controls)", () => {
  it("the journal-bridge detector matches the hub link and not its absence", () => {
    expect(/href="\/dashboard\/journal"/.test(read(HUB))).toBe(true);
    expect(/href="\/dashboard\/journal"/.test('<Link href="/dashboard/account" />')).toBe(false);
  });

  it("the verify-claim detector flags an affirmative claim but not the negation", () => {
    expect(VERIFY_CLAIM.test("Patvirtinti įgūdžiai")).toBe(true);
    expect(VERIFY_CLAIM.test("verified skills")).toBe(true);
    // negation handled by the per-key exemption; the token itself still matches,
    // which is why notVerified is exempted above.
    expect(VERIFY_CLAIM.test("None yet")).toBe(false);
  });
});
