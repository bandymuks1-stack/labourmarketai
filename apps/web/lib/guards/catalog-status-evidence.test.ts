import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FEATURES, type CatalogEvidence } from "@/lib/config/feature-availability";
import { LABOUR_MARKET_ROLES, LIVE_ROLE_IDS } from "@/lib/config/roles";
import { ACTIVITY_TYPES } from "@/lib/config/activity-types";
import { activeLocales } from "@/lib/i18n/config";

/**
 * CATALOGUE STATUS = PRODUCTION EVIDENCE (owner P0 2026-11-10).
 *
 * /vision listed eight features as "coming soon" that had run in production for
 * weeks: lib/config/feature-availability.ts, roles.ts and activity-types.ts
 * were never updated after delivery. Owner rule: MERGED ≠ DEPLOYED ≠ WORKS;
 * "works" needs a production check of the user's path.
 *
 * Every `active` row names its proof (a FUNCTION_REGISTER row + a text that
 * appears IN that row: a walk run id or the recorded owner session), and this
 * test reads the register: the row must exist, be verified (LIVE_VERIFIED /
 * PASS / complete), and still carry the proof. A register row that turns FAIL,
 * REGRESSION or NOT VERIFIED fails the catalogue too, so the two cannot drift.
 * Every `preparing` / `hidden` row names a concrete reason — never the generic
 * "will be enabled later".
 */
const REGISTER = readFileSync(
  join(__dirname, "..", "..", "..", "..", "docs", "program", "FUNCTION_REGISTER.md"),
  "utf8",
);

/** All register table rows whose first cell is `id`. */
function rows(id: string): string[] {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return REGISTER.split("\n").filter((l) => new RegExp(`^\\|\\s*${esc}\\s*\\|`).test(l));
}
const VERIFIED = /\|\s*(LIVE_VERIFIED|PASS|complete)\s*\|/;
const BROKEN = /\|\s*(FAIL|NOT[ _]VERIFIED|BLOCKED|NOT_IMPLEMENTED)\s*\||\bREGRESSION\b/;

function proven(e: CatalogEvidence): string | null {
  const found = rows(e.register);
  if (found.length === 0) return `register row ${e.register} not found`;
  const carrying = found.filter((l) => l.includes(e.proof));
  if (carrying.length === 0) return `register row ${e.register} does not carry "${e.proof}"`;
  if (!carrying.some((l) => VERIFIED.test(l) && !BROKEN.test(l)))
    return `register row ${e.register} carrying "${e.proof}" is not verified`;
  return null;
}

type Row = { id: string; availability: string; evidence?: readonly CatalogEvidence[]; reason?: string };
const CATALOGUES: Record<string, Row[]> = {
  features: FEATURES.map((f) => ({ id: f.key, availability: f.availability, evidence: f.evidence, reason: f.reason })),
  roles: LABOUR_MARKET_ROLES.map((r) => ({ id: r.id, availability: r.availability, evidence: r.evidence, reason: r.reason })),
  activityTypes: ACTIVITY_TYPES.map((a) => ({ id: a.id, availability: a.availability, evidence: a.evidence, reason: a.reason })),
};

describe("every active catalogue row is proven in production", () => {
  for (const [name, list] of Object.entries(CATALOGUES)) {
    for (const row of list.filter((r) => r.availability === "active")) {
      it(`${name}.${row.id}`, () => {
        expect(row.evidence?.length ?? 0, `${name}.${row.id} has no evidence`).toBeGreaterThan(0);
        for (const e of row.evidence ?? []) expect(proven(e), `${name}.${row.id}`).toBeNull();
      });
    }
  }
});

describe("every row that is not active says why, concretely", () => {
  for (const [name, list] of Object.entries(CATALOGUES)) {
    for (const row of list.filter((r) => r.availability !== "active")) {
      it(`${name}.${row.id} (${row.availability})`, () => {
        expect((row.reason ?? "").length, `${name}.${row.id} needs a reason`).toBeGreaterThan(30);
        expect(row.reason ?? "").not.toMatch(/enabled later|coming soon|preparing_generic/i);
      });
    }
  }

  it("no feature points at the generic 'will be enabled later' reason", () => {
    expect(FEATURES.filter((f) => f.preparingReasonKey === "features.preparing_generic_reason").map((f) => f.key)).toEqual([]);
  });

  it("a hidden LIVE role keeps the proof that its holders' workspace works", () => {
    for (const r of LABOUR_MARKET_ROLES.filter((x) => (LIVE_ROLE_IDS as readonly string[]).includes(x.id)))
      for (const e of r.evidence ?? []) expect(proven(e), r.id).toBeNull();
    for (const id of ["agency", "customer"]) {
      const r = LABOUR_MARKET_ROLES.find((x) => x.id === id)!;
      expect(r.evidence?.length ?? 0, id).toBeGreaterThan(0);
    }
  });
});

describe("an active row never describes itself as coming later", () => {
  // Codex P2 on #3212: /vision renders the description beside the working
  // badge, so "you will later be able to…" under "works" contradicts itself.
  const FUTURE: Record<string, RegExp> = {
    en: /\blater\b|will be able|when (they are )?ready/i,
    lt: /\bvėliau\b|\bgalės(i|ite)?\b|kai (jie |jos )?bus paruošt/i,
  };
  for (const [locale, future] of Object.entries(FUTURE)) {
    it(`${locale}: active feature descriptions are in the present tense`, () => {
      const m = JSON.parse(readFileSync(join(__dirname, "..", "..", "messages", `${locale}.json`), "utf8"));
      const text = (key: string) => key.split(".").reduce((o, k) => o?.[k], m) as unknown as string;
      for (const f of FEATURES.filter((x) => x.availability === "active"))
        expect(text(f.descriptionKey), `${locale} ${f.key}`).not.toMatch(future);
    });
  }
});

describe("AI matching is never shown as working", () => {
  it("rule-based matching is active, AI matching is not", () => {
    expect(FEATURES.find((f) => f.key === "rule_matching")?.availability).toBe("active");
    expect(FEATURES.find((f) => f.key === "matching")?.availability).not.toBe("active");
  });

  for (const locale of activeLocales) {
    it(`${locale}: the AI matching reason says it is switched off`, () => {
      const f = JSON.parse(readFileSync(join(__dirname, "..", "..", "messages", `${locale}.json`), "utf8")).features;
      expect(f.matching_reason).toBeTruthy();
      expect(f.rule_matching.label).toBeTruthy();
      expect(f.rule_matching.description).not.toMatch(/\bAI\b|\bKI\b|\bDI\b|\bИИ\b/);
    });
  }
});

describe("the account page shows a held live role as working", () => {
  const page = readFileSync(join(__dirname, "..", "..", "app", "[locale]", "dashboard", "account", "page.tsx"), "utf8");
  it("a held worker / company / agency / customer role gets the active chip", () => {
    expect(page).toContain("const heldLive = !isAdminRole && isLiveRoleId(r.role);");
    expect(page).toMatch(/: heldLive\s*\?\s*"roles\.status\.active"/);
  });
});
