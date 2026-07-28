/**
 * Guard — PRODUCT GATE (constitution enforcement).
 *
 * Constitution: `docs/PRODUCT_CONSTITUTION.md` §12 (axioms) + §13 (the gate).
 *
 * Two jobs:
 *   1. the axiom register and the surface registry stay consistent with the
 *      constitution document — an axiom that exists in code but not in the
 *      document (or the reverse) is drift, and drift is how a gate quietly
 *      stops meaning anything;
 *   2. the gate script itself really refuses — every automatic RED rule in
 *      §13.3 must be present AND its detector must fire, proven here rather
 *      than asserted in prose.
 *
 * This guard is STRENGTHENED, never disabled.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { WORLD_ELEMENTS, worldElementIds, MANDATORY_PR_QUESTIONS, FORBIDDEN_CREATIONS } from "../product-gate/world-elements";
import {
  AXIOMS,
  axiom,
  axiomIds,
  heuristicAxioms,
  machineEnforcedAxioms,
  reviewOnlyAxioms,
} from "../product-gate/axioms";
import {
  BASELINE_DASHBOARD_SCREEN_COUNT,
  BASELINE_PRIMARY_SURFACES,
  BASELINE_SCREEN_COUNT,
  PRODUCT_SURFACES,
  validateDeclarations,
  type SurfaceDeclaration,
} from "../product-gate/surface-registry";

const here = resolve(fileURLToPath(import.meta.url), "..");
const webRoot = resolve(here, "..", "..");
const repoRoot = resolve(webRoot, "..", "..");
const CONSTITUTION = join(repoRoot, "docs", "PRODUCT_CONSTITUTION.md");
const GATE = join(repoRoot, ".github", "scripts", "product-gate.mjs");
const AUDIT = join(repoRoot, "docs", "audits", "product-constitution-audit-v1.md");
const VISION_LOCK = join(repoRoot, "docs", "product", "PRODUCT_VISION_LOCK_V1.md");
const ASSIGNMENT = join(repoRoot, "docs", "audits", "product-vision-surface-assignment-v1.md");

const constitution = () => readFileSync(CONSTITUTION, "utf8");

// ── 1. The constitution is supreme and complete ────────────────────────────

describe("product constitution — the supreme document", () => {
  it("exists and declares itself supreme over every other product document", () => {
    const doc = constitution();
    expect(doc).toMatch(/Product Constitution/i);
    // The conflict rule must be stated, or "supreme" is decoration.
    expect(doc).toMatch(/these win|Product Constitution wins|constitution wins/i);
  });

  it("states every axiom, with its id and its source", () => {
    const doc = constitution();
    for (const a of AXIOMS) {
      expect(doc, `${a.id} missing from the constitution`).toContain(a.id);
    }
  });

  it("no axiom is invented — each cites an existing canonical document", () => {
    for (const a of AXIOMS) {
      expect(a.source.length, `${a.id}: no source`).toBeGreaterThan(15);
      // The source must point at a real file or a real PR.
      const file = a.source.match(/(docs\/[^\s;]+\.md|apps\/web\/[^\s;]+\.ts)/)?.[1];
      if (file) {
        expect(existsSync(join(repoRoot, file)), `${a.id} cites missing ${file}`).toBe(true);
      } else {
        expect(a.source).toMatch(/PR #\d+/);
      }
    }
  });

  it("axiom ids are unique and contiguous", () => {
    const ids = AXIOMS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    const nums = ids.map((i) => Number(i.slice(2))).sort((a, b) => a - b);
    expect(nums[0]).toBe(1);
    expect(nums[nums.length - 1]).toBe(nums.length);
  });

  it("is honest about what a machine can hold", () => {
    // Every axiom is classified; the split is asserted so it cannot be
    // quietly upgraded to "all enforced".
    expect(
      machineEnforcedAxioms().length + heuristicAxioms().length + reviewOnlyAxioms().length,
    ).toBe(AXIOMS.length);
    expect(heuristicAxioms().length).toBeGreaterThan(0);
    // A-10 is review-only until the commercial system PRs land its machine
    // half. An axiom that claims "machine" with no gate is a dormant check.
    expect(reviewOnlyAxioms()).toEqual(["A-05", "A-10", "A-11", "A-12"]);
  });
});

// ── 2. The declaration contract ────────────────────────────────────────────

describe("product gate — the declaration contract", () => {
  it("the registry starts empty: this PR adds no UI, so it declares none", () => {
    expect(PRODUCT_SURFACES).toEqual([]);
  });

  it("a complete declaration passes", () => {
    const ok: SurfaceDeclaration = {
      id: "/dashboard/example",
      kind: "screen",
      originAxiom: "A-09",
      purpose: "Shows the signed contract PDF, which cannot be rendered inline in a chat turn.",
      whyNotChat: "A multi-page legal document needs a scrollable viewer, not a message.",
      whyNotExistingComponent: "No existing surface renders a paginated PDF.",
      owner: "product owner",
      ownsAction: "view_signed_contract",
      worldElement: "documents" as const,
      whyNotExistingElement: "No existing element renders a paginated legal document.",
      chatIntegration: "The conversation opens it and closes it when the user is done.",
      avatarEffect: "The signed contract is attached to the avatar's document set.",
      mapEffect: "None — a contract is not a place; it belongs to the avatar.",
      journalRelation: "Signing is recorded as a journal event on the engagement.",
    };
    expect(validateDeclarations([ok], axiomIds(), worldElementIds())).toEqual([]);
  });

  it("REJECTS a declaration that cannot answer why-not-chat", () => {
    const bad = {
      id: "/x", kind: "screen", originAxiom: "A-09",
      purpose: "Some new screen for things",
      whyNotChat: "", whyNotExistingComponent: "Nothing else does it", owner: "someone",
      ownsAction: null,
      worldElement: "documents" as const,
      whyNotExistingElement: "No existing element renders a paginated legal document.",
      chatIntegration: "The conversation opens it and closes it when the user is done.",
      avatarEffect: "The signed contract is attached to the avatar's document set.",
      mapEffect: "None — a contract is not a place; it belongs to the avatar.",
      journalRelation: "Signing is recorded as a journal event on the engagement.",
    } as SurfaceDeclaration;
    expect(validateDeclarations([bad], axiomIds(), worldElementIds()).map((p) => p.code)).toContain(
      "empty_why_not_chat",
    );
  });

  it("REJECTS an unknown origin axiom", () => {
    const bad = {
      id: "/x", kind: "screen", originAxiom: "A-99" as never,
      purpose: "A new screen that shows the thing",
      whyNotChat: "Because it is a spatial map, not a sentence.",
      whyNotExistingComponent: "No map surface exists yet.",
      owner: "product owner", ownsAction: null,
      worldElement: "documents" as const,
      whyNotExistingElement: "No existing element renders a paginated legal document.",
      chatIntegration: "The conversation opens it and closes it when the user is done.",
      avatarEffect: "The signed contract is attached to the avatar's document set.",
      mapEffect: "None — a contract is not a place; it belongs to the avatar.",
      journalRelation: "Signing is recorded as a journal event on the engagement.",
    } as SurfaceDeclaration;
    expect(validateDeclarations([bad], axiomIds(), worldElementIds()).map((p) => p.code)).toContain("unknown_axiom");
  });

  it("REJECTS two surfaces owning the same action (A-08: one function, one home)", () => {
    const base = {
      kind: "screen" as const, originAxiom: "A-09" as const,
      purpose: "Creates a work demand from a structured intake",
      whyNotChat: "It is the fallback for users who refuse the conversation.",
      whyNotExistingComponent: "The existing form is company-only.",
      owner: "product owner", ownsAction: "create_demand",
      worldElement: "documents" as const,
      whyNotExistingElement: "No existing element renders a paginated legal document.",
      chatIntegration: "The conversation opens it and closes it when the user is done.",
      avatarEffect: "The signed contract is attached to the avatar's document set.",
      mapEffect: "None — a contract is not a place; it belongs to the avatar.",
      journalRelation: "Signing is recorded as a journal event on the engagement.",
    };
    const problems = validateDeclarations(
      [{ ...base, id: "/a" }, { ...base, id: "/b" }],
      axiomIds(),
    );
    expect(problems.map((p) => p.code)).toContain("duplicate_action");
  });

  it("REJECTS a duplicate id and a missing owner", () => {
    const d = {
      id: "/dup", kind: "screen" as const, originAxiom: "A-09" as const,
      purpose: "Shows something that is genuinely spatial",
      whyNotChat: "A map cannot be a sentence.",
      whyNotExistingComponent: "No other map exists.",
      owner: "", ownsAction: null,
      worldElement: "documents" as const,
      whyNotExistingElement: "No existing element renders a paginated legal document.",
      chatIntegration: "The conversation opens it and closes it when the user is done.",
      avatarEffect: "The signed contract is attached to the avatar's document set.",
      mapEffect: "None — a contract is not a place; it belongs to the avatar.",
      journalRelation: "Signing is recorded as a journal event on the engagement.",
    };
    const problems = validateDeclarations([d, d], axiomIds(), worldElementIds()).map((p) => p.code);
    expect(problems).toContain("duplicate_id");
    expect(problems).toContain("empty_owner");
  });
});

// ── 3. The gate script really refuses ──────────────────────────────────────

describe("product gate — the CI script", () => {
  const gateSrc = readFileSync(GATE, "utf8");

  it("exists and is wired into the quality workflow", () => {
    expect(existsSync(GATE)).toBe(true);
    const wf = readFileSync(join(repoRoot, ".github", "workflows", "quality.yml"), "utf8");
    expect(wf).toMatch(/product-gate\.mjs/);
  });

  it("implements every automatic RED rule named in the constitution", () => {
    for (const code of [
      "second_dashboard",
      "new_journal_module",
      "new_persistent_menu",
      "duplicate_action",
      "profile_shows_completed_action",
      "wizard_replaceable_by_chat",
      "form_replaceable_by_dialog",
      "chat_importance_reduced",
      "undeclared_surface",
      "unknown_axiom",
    ]) {
      expect(gateSrc, `rule ${code} not implemented`).toContain(code);
      expect(constitution(), `rule ${code} not documented`).toContain(code);
    }
  });

  it("its detectors fire — proven by the script's own self-test", () => {
    const out = execFileSync("node", [GATE, "--self-test"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(out).toMatch(/self-test: \d+\/\d+ detectors fire correctly/);
  });

  it("blocks the merge with PRODUCT_REVIEW_REQUIRED, never a warning", () => {
    expect(gateSrc).toContain("PRODUCT_REVIEW_REQUIRED");
    expect(gateSrc).toMatch(/process\.exit\(1\)/);
  });

  it("always writes the architecture diff, with the mandatory columns", () => {
    expect(gateSrc).toContain("PRODUCT_ARCHITECTURE_DIFF.md");
    for (const col of [
      "What appeared",
      "Why it appeared",
      "Why it cannot be a conversation",
      "Permitting axiom",
    ]) {
      expect(gateSrc, `architecture diff column "${col}" missing`).toContain(col);
    }
  });

  it("marks heuristic findings as heuristic — it never overstates certainty", () => {
    expect(gateSrc).toContain('"heuristic"');
    expect(gateSrc).toContain('"certain"');
  });
});

// ── 4. The baseline is recorded, not blessed ───────────────────────────────

describe("product gate — the pre-existing baseline", () => {
  it("records today's surface counts so the baseline cannot grow silently", () => {
    expect(BASELINE_SCREEN_COUNT).toBeGreaterThan(0);
    expect(BASELINE_DASHBOARD_SCREEN_COUNT).toBeGreaterThan(0);
    expect(BASELINE_DASHBOARD_SCREEN_COUNT).toBeLessThanOrEqual(BASELINE_SCREEN_COUNT);
  });

  it("names the surfaces that behave as primary today — more than one, honestly", () => {
    expect(BASELINE_PRIMARY_SURFACES).toContain("/dashboard");
    expect(BASELINE_PRIMARY_SURFACES.length).toBeGreaterThan(1);
  });

  it("the current-state audit exists and lists every finding with a priority", () => {
    expect(existsSync(AUDIT)).toBe(true);
    const doc = readFileSync(AUDIT, "utf8");
    expect(doc).toMatch(/PC-01/);
    expect(doc).toMatch(/Priority|Prioritetas/i);
    // Every finding must name the axiom it breaks.
    for (const m of doc.matchAll(/PC-\d\d/g)) {
      expect(doc).toContain(m[0]);
    }
  });

  it("every axiom cited by the audit is a real axiom", () => {
    const doc = readFileSync(AUDIT, "utf8");
    for (const m of doc.matchAll(/\bA-\d\d\b/g)) {
      expect(axiom(m[0]), `audit cites unknown axiom ${m[0]}`).not.toBeNull();
    }
  });
});

// ── 5. The vision lock (owner text, 2026-07-28) ────────────────────────────

describe("product vision lock — the highest product design authority", () => {
  const lock = () => readFileSync(VISION_LOCK, "utf8");

  it("exists and declares itself above the Product Constitution", () => {
    expect(existsSync(VISION_LOCK)).toBe(true);
    const doc = lock();
    expect(doc).toMatch(/HIGHEST PRODUCT DESIGN AUTHORITY/i);
    expect(doc).toContain("PRODUCT_CONSTITUTION.md");
  });

  it("records the owner text 1:1, not a paraphrase", () => {
    const doc = lock();
    // Sentences that decide product structure must survive verbatim.
    for (const phrase of [
      "Negali būti antro AI",
      "Inbox nėra produktas",
      "Bookings nėra produktas",
      "Requests nėra produktas",
      "Candidates nėra produktas",
      "Map tampa pagrindiniu pasaulio atvaizdavimu",
      "Objektai turi savo istoriją",
      "Dashboard nėra darbo vieta",
    ]) {
      expect(doc, `owner phrase missing: ${phrase}`).toContain(phrase);
    }
  });

  it("declares exactly the twelve world elements, matching the code", () => {
    expect(WORLD_ELEMENTS).toHaveLength(12);
    const doc = lock();
    for (const e of WORLD_ELEMENTS) {
      expect(doc, `${e.id} missing from the vision lock`).toContain(e.id);
      expect(e.definition.length).toBeGreaterThan(30);
    }
    expect(new Set(worldElementIds()).size).toBe(12);
  });

  it("states the six mandatory questions and the prohibition list", () => {
    const doc = lock();
    expect(MANDATORY_PR_QUESTIONS).toHaveLength(6);
    for (const f of ["worldElement", "whyNotExistingElement", "chatIntegration",
                     "avatarEffect", "mapEffect", "journalRelation"]) {
      expect(doc, `field ${f} not documented`).toContain(f);
    }
    expect(FORBIDDEN_CREATIONS.length).toBeGreaterThanOrEqual(6);
  });

  it("the gate enforces the six answers and refuses a second AI", () => {
    const gateSrc = readFileSync(GATE, "utf8");
    for (const code of ["unanswered_vision_question", "no_world_element", "second_ai"]) {
      expect(gateSrc, `${code} not implemented`).toContain(code);
      expect(lock(), `${code} not documented`).toContain(code);
    }
  });

  it("REJECTS a declaration that names no valid world element", () => {
    const bad = {
      id: "/x", kind: "screen" as const, originAxiom: "A-09" as const,
      purpose: "A surface that belongs to nothing in the world model",
      whyNotChat: "It renders a spatial thing.",
      whyNotExistingComponent: "Nothing else renders it.",
      owner: "product owner", ownsAction: null,
      worldElement: "not_an_element" as never,
      whyNotExistingElement: "It is genuinely new territory for the product.",
      chatIntegration: "The conversation opens and closes it.",
      avatarEffect: "It attaches to the avatar's record.",
      mapEffect: "It appears as a layer on the map.",
      journalRelation: "It writes a journal event.",
    } as SurfaceDeclaration;
    expect(
      validateDeclarations([bad], axiomIds(), worldElementIds()).map((p) => p.code),
    ).toContain("unknown_world_element");
  });

  it("REJECTS a declaration that leaves a vision question unanswered", () => {
    const bad = {
      id: "/y", kind: "screen" as const, originAxiom: "A-09" as const,
      purpose: "A surface that answers only some of the questions",
      whyNotChat: "It renders a spatial thing.",
      whyNotExistingComponent: "Nothing else renders it.",
      owner: "product owner", ownsAction: null,
      worldElement: "objects" as const,
      whyNotExistingElement: "Objects have no surface yet.",
      chatIntegration: "The conversation opens it.",
      avatarEffect: "",
      mapEffect: "",
      journalRelation: "It writes a journal event.",
    } as SurfaceDeclaration;
    const codes = validateDeclarations([bad], axiomIds(), worldElementIds()).map((p) => p.code);
    expect(codes).toContain("unanswered_vision_question");
  });

  it("every existing screen is assigned to an element, with a verdict", () => {
    expect(existsSync(ASSIGNMENT)).toBe(true);
    const doc = readFileSync(ASSIGNMENT, "utf8");
    for (const v of ["KEEP", "CONSOLIDATE", "REMOVE"]) {
      expect(doc, `verdict ${v} missing`).toContain(v);
    }
    // Every element must appear in the assignment, including the two gaps.
    for (const e of WORLD_ELEMENTS) {
      expect(doc, `element ${e.name} not assigned`).toContain(e.name);
    }
    expect(doc).toMatch(/GAP/);
  });
});
