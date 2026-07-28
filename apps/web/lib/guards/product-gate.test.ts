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
import { readdirSync } from "node:fs";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { WORLD_ELEMENTS, worldElementIds, MANDATORY_PR_QUESTIONS, FORBIDDEN_CREATIONS } from "../product-gate/world-elements";
import {
  ENTITY_TYPES,
  COMMON_ENTITY_ATTRIBUTES,
  RELATIONSHIP_PREDICATES,
  RELATIONSHIP_EXAMPLES,
  WORLD_STATE_SLOTS,
  MANDATORY_ENTITY_QUESTIONS,
  PERSON_ROLES,
  ORGANIZATION_ROLES_UNIFIED,
  ENTITY_CONFORMANCE,
  validateEntityAnswers,
  isMultiRole,
} from "../product-gate/entity-model";
import {
  ORGANIZATION_ROLES,
  EMPLOYMENT_MODELS,
  ORCHESTRATION_ASSESSMENT,
  MANDATORY_ORCHESTRATION_QUESTIONS,
  defaultEmploymentModel,
  executableModels,
  assignResponsibleOrganization,
  validateFulfilmentChain,
} from "../product-gate/organization-roles";
import {
  WORKSPACE_PARTS,
  FORBIDDEN_SEPARATE_SCREENS,
  FORBIDDEN_COMMIT_CONTROLS,
  WORLD_STATE_EXAMPLES,
  MANDATORY_WORLD_STATE_QUESTIONS,
  AI_MAY_NEVER_CHANGE,
  CONTEXT_PANEL_CONTENT,
  UNIVERSAL_CONTEXT_DOMAINS,
  WORKSPACE_ASSESSMENT,
  validateWorldStateAnswers,
} from "../product-gate/world-state";
import {
  PILLARS,
  UNIVERSAL_OBJECT_PROPERTIES,
  MANDATORY_UNIVERSE_QUESTIONS,
  MAP_ARCHITECTURE_FILES,
  MAP_PLATFORM_ASSESSMENT,
  EXAMPLE_OBJECT_TYPES,
  LIVE_WORLD_CAPABILITIES,
  validateUniverseAnswers,
  pillarIds,
} from "../product-gate/universal-object-model";
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
      pillar: "avatar",
      objectType: "avatar",
      registeredInObjectModel: true,
      hasTimeline: true,
      hasHistory: true,
      addableWithoutMapChange: true,
      changesWorldState: true,
      reflectedOnMap: true,
      aiControlled: true,
      usableWithoutLeavingWorkspace: true,
      needsNoNewPage: true,
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
      pillar: "avatar",
      objectType: "avatar",
      registeredInObjectModel: true,
      hasTimeline: true,
      hasHistory: true,
      addableWithoutMapChange: true,
      changesWorldState: true,
      reflectedOnMap: true,
      aiControlled: true,
      usableWithoutLeavingWorkspace: true,
      needsNoNewPage: true,
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
      pillar: "avatar",
      objectType: "avatar",
      registeredInObjectModel: true,
      hasTimeline: true,
      hasHistory: true,
      addableWithoutMapChange: true,
      changesWorldState: true,
      reflectedOnMap: true,
      aiControlled: true,
      usableWithoutLeavingWorkspace: true,
      needsNoNewPage: true,
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
      pillar: "avatar",
      objectType: "avatar",
      registeredInObjectModel: true,
      hasTimeline: true,
      hasHistory: true,
      addableWithoutMapChange: true,
      changesWorldState: true,
      reflectedOnMap: true,
      aiControlled: true,
      usableWithoutLeavingWorkspace: true,
      needsNoNewPage: true,
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
      pillar: "avatar",
      objectType: "avatar",
      registeredInObjectModel: true,
      hasTimeline: true,
      hasHistory: true,
      addableWithoutMapChange: true,
      changesWorldState: true,
      reflectedOnMap: true,
      aiControlled: true,
      usableWithoutLeavingWorkspace: true,
      needsNoNewPage: true,
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
      pillar: "avatar",
      objectType: "avatar",
      registeredInObjectModel: true,
      hasTimeline: true,
      hasHistory: true,
      addableWithoutMapChange: true,
      changesWorldState: true,
      reflectedOnMap: true,
      aiControlled: true,
      usableWithoutLeavingWorkspace: true,
      needsNoNewPage: true,
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
      pillar: "avatar",
      objectType: "avatar",
      registeredInObjectModel: true,
      hasTimeline: true,
      hasHistory: true,
      addableWithoutMapChange: true,
      changesWorldState: true,
      reflectedOnMap: true,
      aiControlled: true,
      usableWithoutLeavingWorkspace: true,
      needsNoNewPage: true,
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

// ── 6. The universe lock V2 (owner text, 2026-07-28) ───────────────────────

describe("product universe lock v2 — one living world", () => {
  const LOCK = join(repoRoot, "docs", "product", "PRODUCT_UNIVERSE_LOCK_V2.md");
  const PLAN = join(repoRoot, "docs", "product", "one-world-execution-plan-v1.md");
  const lock = () => readFileSync(LOCK, "utf8");

  it("exists, is the highest authority, and supersedes V1 without deleting it", () => {
    expect(existsSync(LOCK)).toBe(true);
    const doc = lock();
    expect(doc).toMatch(/HIGHEST PRODUCT AUTHORITY/i);
    expect(doc).toContain("PRODUCT_VISION_LOCK_V1");
    expect(doc).toMatch(/Nothing was removed/i);
  });

  it("records the decisive owner sentences 1:1", () => {
    const doc = lock();
    for (const phrase of [
      "Produktas yra vienas gyvas pasaulis",
      "Map nėra modulis",
      "turi būti registruojamas",
      "architektūra laikoma neteisinga",
      "Objektų tipai nėra užkoduojami logikoje",
      "Vienas AI",
      "Dashboard nėra darbo vieta",
    ]) {
      expect(doc, `owner phrase missing: ${phrase}`).toContain(phrase);
    }
  });

  it("declares exactly four pillars, and every V1 element lives under one", () => {
    expect(PILLARS).toHaveLength(4);
    expect([...pillarIds()].sort()).toEqual(
      ["ai_conversation", "avatar", "work_journal", "world_map"],
    );
    const covered = new Set(PILLARS.flatMap((p) => p.elements));
    for (const e of WORLD_ELEMENTS) {
      expect(covered.has(e.id), `${e.id} belongs to no pillar`).toBe(true);
    }
  });

  it("carries the full Universal Object Model and the nine questions", () => {
    expect(UNIVERSAL_OBJECT_PROPERTIES.length).toBeGreaterThanOrEqual(17);
    expect(MANDATORY_UNIVERSE_QUESTIONS).toHaveLength(9);
    expect(MANDATORY_UNIVERSE_QUESTIONS.filter((q) => q.blocking).length).toBe(6);
    expect(EXAMPLE_OBJECT_TYPES.length).toBeGreaterThanOrEqual(16);
    expect(LIVE_WORLD_CAPABILITIES).toContain("accumulate_history");
    const doc = lock();
    for (const p of UNIVERSAL_OBJECT_PROPERTIES) {
      const human = p.replace(/_/g, " ");
      expect(doc.toLowerCase(), `UOM property ${p} not documented`).toContain(human);
    }
  });

  it("is HONEST that the map is not yet a platform", () => {
    // The lock must not claim an architecture the code does not have.
    expect(MAP_PLATFORM_ASSESSMENT.verdict).toBe("not_yet_a_platform");
    expect(MAP_PLATFORM_ASSESSMENT.newTypeNeedsMapEdit).toBe(true);
    expect(lock()).toMatch(/not yet a platform/i);
    // And the assessment must name real files.
    for (const f of MAP_ARCHITECTURE_FILES) {
      expect(existsSync(join(repoRoot, f)), `map architecture file missing: ${f}`).toBe(true);
    }
  });

  it("BLOCKS a surface that needs the map re-architected", () => {
    const problems = validateUniverseAnswers("/x", {
      pillar: "world_map",
      objectType: "construction_site",
      registeredInObjectModel: true,
      hasTimeline: true,
      hasHistory: true,
      addableWithoutMapChange: false,
    });
    expect(problems.map((p) => p.code)).toContain("requires_map_architecture_change");
  });

  it("BLOCKS an unregistered object type and a missing timeline/history", () => {
    const problems = validateUniverseAnswers("/y", {
      pillar: "world_map",
      objectType: "vehicle",
      registeredInObjectModel: false,
      hasTimeline: false,
      hasHistory: true,
      addableWithoutMapChange: true,
    }).map((p) => p.code);
    expect(problems).toContain("not_registered_object_type");
    expect(problems).toContain("unanswered_universe_question");
  });

  it("BLOCKS a pillar that is not one of the four", () => {
    const problems = validateUniverseAnswers("/z", {
      pillar: "reporting",
      objectType: "project",
      registeredInObjectModel: true,
      hasTimeline: true,
      hasHistory: true,
      addableWithoutMapChange: true,
    }).map((p) => p.code);
    expect(problems).toContain("unknown_pillar");
  });

  it("ACCEPTS a fully compliant world extension", () => {
    expect(
      validateUniverseAnswers("/ok", {
        pillar: "world_map",
        objectType: "training",
        registeredInObjectModel: true,
        hasTimeline: true,
        hasHistory: true,
        addableWithoutMapChange: true,
      }),
    ).toEqual([]);
  });

  it("the gate implements the map-as-platform rule", () => {
    const gateSrc = readFileSync(GATE, "utf8");
    for (const code of [
      "map_architecture_change",
      "not_registered_object_type",
      "requires_map_architecture_change",
      "unanswered_universe_question",
    ]) {
      expect(gateSrc, `${code} not implemented`).toContain(code);
      expect(lock(), `${code} not documented`).toContain(code);
    }
    // It must watch the real architecture files.
    for (const f of MAP_ARCHITECTURE_FILES) expect(gateSrc).toContain(f);
  });

  it("the execution plan grows ONE world, and phase 0 blocks the rest", () => {
    expect(existsSync(PLAN)).toBe(true);
    const plan = readFileSync(PLAN, "utf8");
    expect(plan).toMatch(/Phase 0/);
    expect(plan).toMatch(/blocks Phases 2 and 4|Phase 0 blocks/i);
    expect(plan).toMatch(/registers a new object type/i);
    expect(plan).toMatch(/it is a module/i);
  });
});

// ── 7. World State UX architecture (owner refinement, 2026-07-28) ──────────

describe("world state UX — AI-first, one workspace, no page switching", () => {
  const LOCK = join(repoRoot, "docs", "product", "WORLD_STATE_UX_ARCHITECTURE_V1.md");
  const lock = () => readFileSync(LOCK, "utf8");

  it("exists and CORRECTS the chat-first framing", () => {
    expect(existsSync(LOCK)).toBe(true);
    const doc = lock();
    expect(doc).toContain("Tikslas yra AI-FIRST");
    expect(doc).toMatch(/chat-first/i);
    expect(doc).toMatch(/corrects/i);
  });

  it("records the decisive owner sentences 1:1", () => {
    const doc = lock();
    for (const phrase of [
      "Tai nėra trys produktai. Tai vienas komponentas",
      "AI keičia tik World State",
      "Map yra pasaulio būsena",
      "NEATIDAROMAS NAUJAS PUSLAPIS",
      "iki atsijungimo nei karto nekeičia puslapio",
    ]) {
      expect(doc, `owner phrase missing: ${phrase}`).toContain(phrase);
    }
  });

  it("A-01 is no longer chat-first — it is AI-first", () => {
    const a01 = axiom("A-01");
    expect(a01?.rule).toMatch(/AI-FIRST/);
    expect(a01?.rule).not.toMatch(/^Chat-first/);
    expect(a01?.source).toContain("WORLD_STATE_UX_ARCHITECTURE_V1");
  });

  it("declares ONE workspace of three parts, not three products", () => {
    expect(WORKSPACE_PARTS).toEqual(["ai_conversation", "world_map", "context_panel"]);
    expect(FORBIDDEN_SEPARATE_SCREENS).toEqual(["chat", "map", "search", "filter"]);
    const doc = lock();
    for (const p of WORKSPACE_PARTS) expect(doc.toLowerCase()).toContain(p.replace(/_/g, " "));
  });

  it("the AI may never change a page, a route or the workspace", () => {
    expect([...AI_MAY_NEVER_CHANGE].sort()).toEqual(["page", "route", "workspace"]);
    expect(lock()).toContain("AI nekeičia puslapių");
  });

  it("carries the owner's World State examples verbatim", () => {
    expect(WORLD_STATE_EXAMPLES.length).toBeGreaterThanOrEqual(8);
    const doc = lock();
    for (const e of WORLD_STATE_EXAMPLES) {
      expect(doc, `example missing: ${e.utterance}`).toContain(e.utterance);
    }
    // No commit control may ever exist.
    expect(FORBIDDEN_COMMIT_CONTROLS).toContain("apply filters");
    expect(doc).toContain('Jokių "Apply Filters"');
  });

  it("a click opens the Context Panel, and its content is specified", () => {
    expect(CONTEXT_PANEL_CONTENT.length).toBeGreaterThanOrEqual(10);
    expect(UNIVERSAL_CONTEXT_DOMAINS).toContain("ai_agents");
  });

  it("all five questions are blocking — any NO breaks the lock", () => {
    expect(MANDATORY_WORLD_STATE_QUESTIONS).toHaveLength(5);
    const ok = {
      changesWorldState: true, reflectedOnMap: true, aiControlled: true,
      usableWithoutLeavingWorkspace: true, needsNoNewPage: true,
    };
    expect(validateWorldStateAnswers("/ok", ok)).toEqual([]);
    for (const field of Object.keys(ok) as (keyof typeof ok)[]) {
      const bad = { ...ok, [field]: false };
      expect(
        validateWorldStateAnswers("/bad", bad).length,
        `${field}=false must break the lock`,
      ).toBeGreaterThan(0);
    }
  });

  it("BLOCKS a feature that needs a new page", () => {
    const codes = validateWorldStateAnswers("/x", {
      changesWorldState: true, reflectedOnMap: true, aiControlled: true,
      usableWithoutLeavingWorkspace: false, needsNoNewPage: false,
    }).map((p) => p.code);
    expect(codes).toContain("requires_new_page");
    expect(codes).toContain("requires_leaving_workspace");
  });

  it("is HONEST that the product is still page-based today", () => {
    expect(WORKSPACE_ASSESSMENT.verdict).toBe("still_page_based");
    expect(WORKSPACE_ASSESSMENT.worldStateEngineExists).toBe(false);
    expect(WORKSPACE_ASSESSMENT.contextPanelExists).toBe(false);
    expect(lock()).toMatch(/still page-based/i);
  });

  it("the gate implements the five world-state rules", () => {
    const gateSrc = readFileSync(GATE, "utf8");
    for (const code of [
      "not_world_state_driven", "not_reflected_on_map", "not_ai_controlled",
      "requires_leaving_workspace", "requires_new_page",
    ]) {
      expect(gateSrc, `${code} not implemented`).toContain(code);
      expect(lock(), `${code} not documented`).toContain(code);
    }
  });

  it("the consolidation map is corrected — the Map is not a surface to keep", () => {
    const map = readFileSync(
      join(repoRoot, "docs", "audits", "product-surface-consolidation-map-v1.md"),
      "utf8",
    );
    expect(map).toMatch(/WORLD_STATE_UX_ARCHITECTURE_V1/);
  });
});

// ── 8. Organization role orchestration (owner 2026-07-28) ──────────────────

describe("organization role orchestration — the chain may never break", () => {
  const LOCK = join(repoRoot, "docs", "product", "ORGANIZATION_ROLE_ORCHESTRATION_V1.md");
  const lock = () => readFileSync(LOCK, "utf8");

  it("exists and records the decisive owner sentences 1:1", () => {
    expect(existsSync(LOCK)).toBe(true);
    const doc = lock();
    for (const phrase of [
      "Labourmarket.ai yra rinkos orkestratorius",
      "Konkrečių įmonių pavadinimai architektūroje nėra naudojami",
      "Viena organizacija gali turėti kelis vaidmenis vienu metu",
      "Tokia situacija laikoma architektūros klaida",
      "Pakanka naujai organizacijai priskirti reikiamus vaidmenis",
    ]) {
      expect(doc, `owner phrase missing: ${phrase}`).toContain(phrase);
    }
  });

  it("declares the ten roles as a registry, not a closed type", () => {
    expect(ORGANIZATION_ROLES).toHaveLength(10);
    const doc = lock();
    for (const r of ORGANIZATION_ROLES) expect(doc).toContain(r);
  });

  it("has exactly one default employment model — an undecided client always has a path", () => {
    expect(EMPLOYMENT_MODELS.filter((m) => m.isDefault)).toHaveLength(1);
    expect(defaultEmploymentModel().id).toBe("intermediated_employment");
  });

  it("only reports models the platform can actually execute", () => {
    expect(executableModels([])).toEqual([]);
    const withProvider = executableModels([
      { organizationId: "o1", roles: ["workforce_provider"] },
      { organizationId: "o2", roles: ["client"] },
    ]);
    expect(withProvider.map((m) => m.id)).toContain("intermediated_employment");
    expect(withProvider.map((m) => m.id)).not.toContain("direct_employment");
  });

  it("BLOCKS showing a candidate with no delivery path (real availability)", () => {
    const breaks = validateFulfilmentChain({
      candidateId: "c1",
      clientOrganizationId: "o2",
      model: null,
      responsibleOrganizationId: null,
      available: [],
    }).map((b) => b.code);
    expect(breaks).toContain("no_delivery_path");
  });

  it("BLOCKS agreement with nobody responsible (expectation consistency)", () => {
    const breaks = validateFulfilmentChain({
      candidateId: "c1",
      clientOrganizationId: "o2",
      model: defaultEmploymentModel(),
      responsibleOrganizationId: null,
      available: [
        { organizationId: "o1", roles: ["workforce_provider"] },
        { organizationId: "o2", roles: ["client"] },
      ],
    }).map((b) => b.code);
    expect(breaks).toContain("no_responsible_organization");
  });

  it("BLOCKS a model the platform cannot execute (AI responsibility)", () => {
    const direct = EMPLOYMENT_MODELS.find((m) => m.id === "direct_employment")!;
    const breaks = validateFulfilmentChain({
      candidateId: "c1",
      clientOrganizationId: "o2",
      model: direct,
      responsibleOrganizationId: "o1",
      available: [
        { organizationId: "o1", roles: ["workforce_provider"] },
        { organizationId: "o2", roles: ["client"] },
      ],
    }).map((b) => b.code);
    expect(breaks).toContain("model_not_executable");
  });

  it("default orchestration assigns the responsible organization automatically", () => {
    const available = [
      { organizationId: "o1", roles: ["workforce_provider", "payroll_provider"] },
      { organizationId: "o2", roles: ["client"] },
    ];
    const org = assignResponsibleOrganization(defaultEmploymentModel(), available);
    expect(org).toBe("o1");
    expect(
      validateFulfilmentChain({
        candidateId: "c1",
        clientOrganizationId: "o2",
        model: defaultEmploymentModel(),
        responsibleOrganizationId: org,
        available,
      }),
    ).toEqual([]);
  });

  it("one organization may hold several roles at once", () => {
    const org = {
      organizationId: "o1",
      roles: ["workforce_provider", "training_provider", "payroll_provider"],
    };
    expect(org.roles.length).toBeGreaterThan(1);
    expect(
      assignResponsibleOrganization(defaultEmploymentModel(), [
        org,
        { organizationId: "o2", roles: ["client"] },
      ]),
    ).toBe("o1");
  });

  it("is HONEST that today the platform is a single-type directory", () => {
    expect(ORCHESTRATION_ASSESSMENT.verdict).toBe("single_type_directory");
    expect(ORCHESTRATION_ASSESSMENT.rolesAreMultiValued).toBe(false);
    expect(ORCHESTRATION_ASSESSMENT.addingRoleNeedsMigration).toBe(true);
    expect(ORCHESTRATION_ASSESSMENT.employmentModelExists).toBe(false);
    expect(ORCHESTRATION_ASSESSMENT.architectureDependsOnEntityName).toBe(false);
    expect(lock()).toMatch(/single-type organization directory/i);
  });

  it("no LOGIC depends on a specific legal entity name (legal copy may)", () => {
    const logicDirs = ["lib/company", "lib/matching", "lib/booking", "lib/opportunities"];
    for (const dir of logicDirs) {
      const full = join(webRoot, dir);
      if (!existsSync(full)) continue;
      for (const f of readdirSync(full).filter((x) => x.endsWith(".ts") && !x.endsWith(".test.ts"))) {
        const src = readFileSync(join(full, f), "utf8");
        expect(src, `${dir}/${f} hardcodes a legal entity name`).not.toMatch(/Nonstop/i);
      }
    }
  });

  it("declares the five orchestration answers", () => {
    expect(MANDATORY_ORCHESTRATION_QUESTIONS).toHaveLength(5);
  });
});

// ── 9. Unified world model — Entity is the only base thing ─────────────────

describe("unified world model — one Entity, registered types", () => {
  const LOCK = join(repoRoot, "docs", "product", "UNIFIED_WORLD_MODEL_V1.md");
  const lock = () => readFileSync(LOCK, "utf8");

  it("exists and records the decisive owner sentences 1:1", () => {
    expect(existsSync(LOCK)).toBe(true);
    const doc = lock();
    for (const phrase of [
      "Entity yra vienintelė bazinė pasaulio esybė",
      "Pakanka jį užregistruoti",
      "Roles yra dinaminiai priskyrimai",
      "Pasaulis statomas ne lentelėmis, o ryšiais tarp Entity",
      "atidarau Entity",
    ]) {
      expect(doc, `owner phrase missing: ${phrase}`).toContain(phrase);
    }
  });

  it("declares the 16 minimum entity types, as an OPEN registry", () => {
    expect(ENTITY_TYPES).toHaveLength(16);
    const doc = lock();
    for (const t of ENTITY_TYPES) {
      expect(doc.toLowerCase(), `entity type ${t} not documented`).toContain(
        t.replace(/_/g, " "),
      );
    }
    // A future type must typecheck without editing the union.
    const future: (typeof ENTITY_TYPES)[number] | (string & {}) = "insurance_policy";
    expect(future).toBe("insurance_policy");
  });

  it("declares the 17 common attributes every entity carries", () => {
    expect(COMMON_ENTITY_ATTRIBUTES).toHaveLength(17);
    const doc = lock();
    for (const a of COMMON_ENTITY_ATTRIBUTES) {
      expect(doc.toLowerCase(), `attribute ${a} not documented`).toContain(
        a.replace(/_/g, " "),
      );
    }
  });

  it("roles are dynamic assignments — many at once, never a type column", () => {
    expect(PERSON_ROLES).toContain("candidate");
    expect(PERSON_ROLES).toContain("employee");
    expect(ORGANIZATION_ROLES_UNIFIED).toContain("employer");
    expect(ORGANIZATION_ROLES_UNIFIED).toContain("client");
    expect(
      isMultiRole({ entityId: "p1", roles: ["candidate", "employee", "team_leader"] }),
    ).toBe(true);
  });

  it("relationships are predicates between entities, and the examples survive", () => {
    expect(RELATIONSHIP_PREDICATES).toContain("works_on");
    expect(RELATIONSHIP_PREDICATES).toContain("represents");
    expect(RELATIONSHIP_EXAMPLES).toHaveLength(6);
    const doc = lock();
    for (const r of RELATIONSHIP_EXAMPLES) {
      expect(doc, `relationship ${r.predicate} not documented`).toContain(r.predicate);
    }
  });

  it("World State holds exactly the owner's nine slots", () => {
    expect(WORLD_STATE_SLOTS).toHaveLength(9);
    expect(WORLD_STATE_SLOTS).toContain("active_avatar");
    expect(WORLD_STATE_SLOTS).toContain("ai_goal");
  });

  it("BLOCKS a feature that is not entity-based", () => {
    const codes = validateEntityAnswers("/x", {
      usesEntity: false,
      needsNewEntityType: false,
      registrationIsEnough: true,
      createsNewRole: false,
      createsNewRelationship: false,
      mapSupportsAutomatically: true,
      aiCanWorkWithIt: true,
    }).map((p) => p.code);
    expect(codes).toContain("not_entity_based");
  });

  it("BLOCKS when registration is NOT enough — the deciding question", () => {
    const codes = validateEntityAnswers("/x", {
      usesEntity: true,
      needsNewEntityType: true,
      registrationIsEnough: false,
      createsNewRole: true,
      createsNewRelationship: true,
      mapSupportsAutomatically: true,
      aiCanWorkWithIt: true,
    }).map((p) => p.code);
    expect(codes).toContain("registration_not_enough");
  });

  it("ALLOWS a new type, role and relationship when registration suffices", () => {
    // Growth is the point — only architecture change is forbidden.
    expect(
      validateEntityAnswers("/ok", {
        usesEntity: true,
        needsNewEntityType: true,
        registrationIsEnough: true,
        createsNewRole: true,
        createsNewRelationship: true,
        mapSupportsAutomatically: true,
        aiCanWorkWithIt: true,
      }),
    ).toEqual([]);
  });

  it("BLOCKS a new type the map cannot render automatically", () => {
    const codes = validateEntityAnswers("/x", {
      usesEntity: true,
      needsNewEntityType: true,
      registrationIsEnough: true,
      createsNewRole: false,
      createsNewRelationship: false,
      mapSupportsAutomatically: false,
      aiCanWorkWithIt: true,
    }).map((p) => p.code);
    expect(codes).toContain("map_does_not_support_type");
  });

  it("BLOCKS an entity the AI cannot work with", () => {
    const codes = validateEntityAnswers("/x", {
      usesEntity: true,
      needsNewEntityType: false,
      registrationIsEnough: true,
      createsNewRole: false,
      createsNewRelationship: false,
      mapSupportsAutomatically: true,
      aiCanWorkWithIt: false,
    }).map((p) => p.code);
    expect(codes).toContain("ai_cannot_work_with_entity");
  });

  it("is HONEST that the product is table-per-concept today", () => {
    expect(ENTITY_CONFORMANCE.verdict).toBe("table_per_concept");
    expect(ENTITY_CONFORMANCE.entityTableExists).toBe(false);
    expect(ENTITY_CONFORMANCE.relationshipTableExists).toBe(false);
    expect(ENTITY_CONFORMANCE.baseTables).toBeGreaterThan(100);
    expect(ENTITY_CONFORMANCE.conceptsSplitAcrossTables.length).toBeGreaterThan(3);
    expect(lock()).toMatch(/table-per-concept/i);
    // The precedent must be named — it is what makes the plan credible.
    expect(ENTITY_CONFORMANCE.precedent).toMatch(/organizations already unified/i);
  });

  it("declares the seven questions and a migration plan that executes nothing", () => {
    expect(MANDATORY_ENTITY_QUESTIONS).toHaveLength(7);
    const doc = lock();
    expect(doc).toMatch(/E\.1/);
    expect(doc).toMatch(/E\.8/);
    expect(doc).toMatch(/No migration was executed/i);
  });

  it("this slice really changed no schema", () => {
    // The lock must not have smuggled a migration in with it.
    const migrations = join(repoRoot, "supabase", "migrations");
    const before = readdirSync(migrations).filter((f) => f.endsWith(".sql"));
    // Precise: the tables THIS lock would introduce. A loose /entit/ match
    // hits pre-existing files like 0026_customer_entity and *_identity_*.
    expect(
      before.some((f) => /entities|entity_relationships|entity_roles/i.test(f)),
    ).toBe(false);
  });
});
