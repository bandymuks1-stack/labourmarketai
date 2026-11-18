import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FEATURES,
  NON_WORKER_WORKSPACES,
  nonWorkerSpacesState,
  type CatalogClaim,
  type CatalogEvidence,
} from "@/lib/config/feature-availability";
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
function rows(id: string, register: string): string[] {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return register.split("\n").filter((l) => new RegExp(`^\\|\\s*${esc}\\s*\\|`).test(l));
}
const VERIFIED = /\|\s*(LIVE_VERIFIED|PASS|complete)\s*\|/;
const BROKEN = /\|\s*(FAIL|NOT[ _]VERIFIED|BLOCKED|NOT_IMPLEMENTED)\s*\||\bREGRESSION\b/;

/** null when the register (the real one unless a control passes another)
 *  holds a verified row `e.register` that still carries `e.proof`. */
function proven(e: CatalogEvidence, register: string = REGISTER): string | null {
  const found = rows(e.register, register);
  if (found.length === 0) return `register row ${e.register} not found`;
  const carrying = found.filter((l) => l.includes(e.proof));
  if (carrying.length === 0) return `register row ${e.register} does not carry "${e.proof}"`;
  if (!carrying.some((l) => VERIFIED.test(l) && !BROKEN.test(l)))
    return `register row ${e.register} carrying "${e.proof}" is not verified`;
  return null;
}

type Row = { id: string; availability: string; evidence?: readonly CatalogEvidence[]; reason?: string };
const CATALOGUES: Record<string, Row[]> = {
  // A partial claim honestly cites an unverified row; it is checked by
  // claimProblem() below. Here an active feature needs at least one VERIFIED claim.
  features: FEATURES.map((f) => ({ id: f.key, availability: f.availability, evidence: f.claims?.filter((c) => !c.partial), reason: f.reason })),
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

/**
 * WHAT THE DESCRIPTION SAYS = WHAT PRODUCTION PROVED (owner P0 2026-11-11).
 * Present tense alone does not make a description true. Each active feature
 * lists its `claims`; the description users read is exactly those claim
 * sentences joined, in every active locale, so it cannot name a capability
 * without a claim. Each claim cites a verified register row that carries a
 * production walk run id (an owner session is not enough). A claim on a row
 * that is not verified must be `partial` and its sentence must say so.
 *
 * Limit, stated plainly: the test proves every sentence has its own verified
 * walk and that nothing unclaimed is written; whether one sentence fairly
 * reads its walk is checked by the reviewer of that one-line pair.
 */
const MESSAGES = Object.fromEntries(
  activeLocales.map((l) => [l, JSON.parse(readFileSync(join(__dirname, "..", "..", "messages", `${l}.json`), "utf8"))]),
) as Record<string, { features: Record<string, { description?: string; claims?: Record<string, string> }> & { notCheckedYet?: string } }>;
/** A GitHub Actions run id — what a production walk leaves in the register. */
const WALK_RUN_ID = /^\d{10,12}$/;

type FeatureCopy = { description?: string; claims?: Record<string, string> };

/** null when a feature's copy says exactly its claims: every claim has a
 *  sentence, a partial claim's sentence carries the not-checked marker, no
 *  claim message is unused, and the description is the sentences joined. */
function copyProblem(claims: readonly CatalogClaim[], node: FeatureCopy | undefined, marker: string): string | null {
  const sentences = claims.map((c) => node?.claims?.[c.id] ?? "");
  for (const [i, c] of claims.entries()) {
    if (!/\S/.test(sentences[i])) return `claim ${c.id} has no sentence`;
    if (c.partial && !sentences[i].includes(marker)) return `partial claim ${c.id} does not say it is not checked`;
  }
  const extra = Object.keys(node?.claims ?? {}).filter((k) => !claims.some((c) => c.id === k));
  if (extra.length > 0) return `claim messages without a claim: ${extra.join(", ")}`;
  if (node?.description !== sentences.join(" ")) return "the description is not exactly its claim sentences";
  return null;
}

/** null when a claim may stand: its proof is a walk run id, and its row is
 *  verified — or, for a partial claim, its row is honestly not verified. */
function claimProblem(c: CatalogClaim, register: string = REGISTER): string | null {
  if (!WALK_RUN_ID.test(c.proof)) return `proof "${c.proof}" is not a walk run id`;
  const problem = proven(c, register);
  if (c.partial) {
    if (rows(c.register, register).length === 0) return `register row ${c.register} not found`;
    return problem ? null : "marked partial but its row is verified";
  }
  return problem;
}

describe("an active feature's description is its proven claims, in every locale", () => {
  for (const f of FEATURES.filter((x) => x.availability === "active")) {
    const claims: readonly CatalogClaim[] = f.claims ?? [];
    it(`${f.key}: every claim has a verified walk`, () => {
      expect(claims.length, `${f.key} has no claims`).toBeGreaterThan(0);
      expect(new Set(claims.map((c) => c.id)).size, `${f.key} claim ids are unique`).toBe(claims.length);
      for (const c of claims) expect(claimProblem(c), `${f.key}.${c.id}`).toBeNull();
    });
    for (const locale of activeLocales) {
      it(`${locale}: ${f.key} says exactly its claims`, () => {
        const marker = MESSAGES[locale].features.notCheckedYet ?? "";
        expect(copyProblem(claims, MESSAGES[locale].features[f.key], marker), `${locale} ${f.key}`).toBeNull();
      });
    }
  }

  it("a claim on an unverified row cannot pass as verified (A-2 today)", () => {
    expect(proven({ register: "A-2", proof: "agency-chain" })).not.toBeNull();
  });

  it("every locale has the not-checked marker a partial claim must carry", () => {
    for (const locale of activeLocales) expect(MESSAGES[locale].features.notCheckedYet, locale).toMatch(/\S/);
  });
});

/**
 * NEGATIVE CONTROLS (owner P0 2026-11-11). The same two checks the guard runs
 * above, fed a deliberately broken copy or register. Each one MUST report a
 * problem — if a control ever passes, the guard has stopped guarding.
 */
describe("negative controls: the guard catches a broken description or register", () => {
  const f = FEATURES.find((x) => x.key === "market_map")!;
  const claims = f.claims ?? [];
  const en = MESSAGES.en.features.market_map;
  const marker = MESSAGES.en.features.notCheckedYet ?? "";
  const row = rows(claims[0].register, REGISTER)[0];

  it("control baseline: the real copy and register pass", () => {
    expect(copyProblem(claims, en, marker)).toBeNull();
    expect(claimProblem(claims[0])).toBeNull();
  });

  it("(a) the description gains a capability no claim carries", () => {
    const broken = { ...en, description: `${en.description} It also plans your routes.` };
    expect(copyProblem(claims, broken, marker)).not.toBeNull();
  });

  it("(a) the description is reworded but the claims are not", () => {
    const broken = { ...en, description: "A map marks work, people and prices." };
    expect(copyProblem(claims, broken, marker)).not.toBeNull();
  });

  it("(a) a claim sentence is added to the copy without a claim in the config", () => {
    const broken = { ...en, claims: { ...en.claims, routes: "It plans your routes." } };
    expect(copyProblem(claims, broken, marker)).not.toBeNull();
  });

  it("(b) the cited register row turns FAIL", () => {
    expect(claimProblem(claims[0], REGISTER.replace(row, row.replace("| LIVE_VERIFIED |", "| FAIL |")))).not.toBeNull();
  });

  it("(b) the cited register row turns NOT VERIFIED", () => {
    expect(claimProblem(claims[0], REGISTER.replace(row, row.replace("| LIVE_VERIFIED |", "| NOT VERIFIED |")))).not.toBeNull();
  });

  it("(b) the cited register row loses its walk run id", () => {
    expect(claimProblem(claims[0], REGISTER.replace(row, row.split(claims[0].proof).join("")))).not.toBeNull();
  });

  it("(b) the cited register row disappears", () => {
    expect(claimProblem(claims[0], REGISTER.replace(row, ""))).not.toBeNull();
  });

  it("an owner session is not a walk run id", () => {
    expect(claimProblem({ id: "x", register: "12.1", proof: "owner session 10-23" })).not.toBeNull();
  });

  it("a partial claim on an unverified row passes when its sentence says so (Codex P2 on #3212)", () => {
    const partial: CatalogClaim = { id: "docs", register: "A-2", proof: "41787046374", partial: true };
    const copy = { description: `Agency documents. ${marker}`, claims: { docs: `Agency documents. ${marker}` } };
    expect(claimProblem(partial)).toBeNull();
    expect(copyProblem([partial], copy, marker)).toBeNull();
  });

  it("a partial claim must say it is not checked", () => {
    const partial: CatalogClaim[] = [{ ...claims[0], partial: true }];
    expect(copyProblem(partial, en, marker)).not.toBeNull();
  });
});

describe("an active row never describes itself as coming later", () => {
  // Codex P2 on #3212: /vision renders the description beside the working
  // badge, so "you will later be able to…" under "works" contradicts itself.
  const FUTURE: Record<string, RegExp> = {
    en: /\b(later|soon|will)\b|when (they are )?ready/i,
    lt: /\b(vėliau|netrukus|greitai)\b|\bgalės(i|ite)?\b|\bbus\b/i,
    de: /\b(später|bald|demnächst|künftig)\b|wird[^.]*können/i,
    pl: /(później|wkrótce|niebawem|będzie|będziesz)/i,
    nl: /\b(later|binnenkort|straks|zal|zullen)\b/i,
    ru: /(позже|скоро|вскоре|в будущем|будет|сможете)/i,
  };
  for (const [locale, future] of Object.entries(FUTURE)) {
    it(`${locale}: active feature descriptions are in the present tense`, () => {
      for (const f of FEATURES.filter((x) => x.availability === "active"))
        expect(MESSAGES[locale].features[f.key]?.description, `${locale} ${f.key}`).not.toMatch(future);
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

describe("/vision's control room reads the catalogue, not a fixed 'coming soon'", () => {
  const map = readFileSync(join(__dirname, "..", "..", "components", "marketing", "labour-market-os-map.tsx"), "utf8");
  it("the company / agency / customer row follows the three workspaces' availability (Codex P2 on #3212)", () => {
    expect(map).toContain("const nonWorker = nonWorkerSpacesState();");
    expect(map).toContain("kind: nonWorker,");
    expect(map).toContain('nonWorker === "active" ? "vision.controlRoom.nonWorkerStatusActive" : "vision.controlRoom.nonWorkerStatus"');
    // Today all three are proven active, so the row says "working".
    expect(nonWorkerSpacesState()).toBe("active");
    for (const locale of activeLocales)
      expect(JSON.parse(readFileSync(join(__dirname, "..", "..", "messages", `${locale}.json`), "utf8")).vision.controlRoom.nonWorkerStatusActive, locale).toMatch(/\S/);
  });

  it("no row on the page is hard-wired to 'preparing' or to a 'coming soon' status", () => {
    // Every status chip in the component is derived: a literal preparing kind
    // or the bare nonWorkerStatus key outside its condition would bring back
    // a fixed "coming soon" beside the active catalogue.
    expect(map).not.toMatch(/kind:\s*"preparing"/);
    expect(map.match(/"vision\.controlRoom\.nonWorkerStatus"/g)?.length).toBe(1);
    expect(map).toMatch(/: "vision\.controlRoom\.nonWorkerStatus"/);
  });

  it("negative control: one workspace not active turns the row back to preparing", () => {
    for (const key of NON_WORKER_WORKSPACES) {
      const broken = FEATURES.map((f) => (f.key === key ? { ...f, availability: "preparing" as const } : f));
      expect(nonWorkerSpacesState(broken), key).toBe("preparing");
    }
    expect(nonWorkerSpacesState(FEATURES.filter((f) => f.key !== "agency_workspace"))).toBe("preparing");
  });
});

describe("the account page shows a held live role as working", () => {
  const page = readFileSync(join(__dirname, "..", "..", "app", "[locale]", "dashboard", "account", "page.tsx"), "utf8");
  it("a held worker / company / agency / customer role gets the active chip", () => {
    expect(page).toContain("const heldLive = !isAdminRole && isLiveRoleId(r.role);");
    expect(page).toMatch(/: heldLive\s*\?\s*"roles\.status\.active"/);
  });
});
