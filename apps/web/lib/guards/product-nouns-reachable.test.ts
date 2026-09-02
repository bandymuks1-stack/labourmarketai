import { describe, expect, it } from "vitest";

import { classifyIntent } from "@/lib/conversation/intent-router";
import {
  PERSONAL_WORKSPACE_ID,
  workspaceDisplayLabels,
  type WorkspaceInfo,
} from "@/lib/company/organization-switch";

/**
 * A PERSON MUST NOT HAVE TO LEARN OUR WORDING TO REACH OUR PRODUCT.
 *
 * The owner audit recorded four sentences that a real user types and that the
 * product answered with the generic four-item fallback ("Galiu padėti su CV,
 * profiliu ir darbo pasiūlymais…"). Probing `classifyIntent` directly showed
 * why: the router's rule table never contained the product's OWN central
 * nouns. "galimybė"/"opportunity" — the literal name of the worker board
 * ("Man tinkamos galimybės") — appeared nowhere, and `open-project` listed
 * only the OPEN verbs, so "parodyk mano projektus" scored 0 too.
 *
 * Worse than silence: "kas susidomėjo mano poreikiu?" matched `need-workers`
 * on the bare stem `poreik` and opened the blank DEMAND-CREATION form. An
 * employer asking who had raised a hand was handed a form to post another job.
 *
 * These are behavioural invariants, not wording preferences — every case below
 * is a sentence from the audit. They are pinned per-language because the
 * router folds diacritics and a regression in one locale is invisible in
 * another.
 */

/** The exact sentence → the intent it must reach. */
const MUST_ROUTE: readonly (readonly [string, string])[] = [
  // ── The board's own noun (audit defect E) ────────────────────────────────
  ["kokias galimybes man gali pasiūlyti?", "opportunities"],
  ["kokias galimybes man gali pasiulyti?", "opportunities"], // no diacritics
  ["parodyk galimybes", "opportunities"],
  ["kokios galimybės man tinka", "opportunities"],
  ["show me opportunities", "opportunities"],
  ["what opportunities do i have", "opportunities"],
  ["какие возможности у меня есть", "opportunities"],
  ["welche möglichkeiten habe ich", "opportunities"],

  // ── Projects, asked for rather than opened (audit defect D; G8 moved the
  //    LIST reading to the `projects` chip's own handler) ───────────────────
  ["parodyk mano projektus", "projects"],
  ["mano projektai", "projects"],
  ["show my projects", "projects"],
  ["покажи мои проекты", "projects"],
  ["meine Projekte", "projects"],
  ["mijn projecten", "projects"],

  // ── Who raised a hand (audit defect C) ───────────────────────────────────
  ["kas susidomėjo mano poreikiu?", "interest-inbox"],
  ["kas susidomejo mano poreikiu?", "interest-inbox"],
  ["who showed interest in my demand", "interest-inbox"],
  ["кто заинтересовался", "interest-inbox"],

  // ── Plural / prefixed work search ────────────────────────────────────────
  ["surask man tinkamus darbus", "find-work"],
];

describe("the product's own nouns are reachable in words", () => {
  for (const [sentence, intent] of MUST_ROUTE) {
    it(`"${sentence}" → ${intent}`, () => {
      expect(classifyIntent(sentence).intent).toBe(intent);
    });
  }

  it("never returns the generic fallback for any audited sentence", () => {
    const unrouted = MUST_ROUTE.filter(
      ([s]) => classifyIntent(s).intent === "unknown",
    );
    expect(unrouted).toEqual([]);
  });

  /**
   * THE BACKSPACE TRAP. `p()` builds each rule from a STRING, so a pattern
   * written `"\bgalimyb"` in the source puts U+0008 (backspace) into the
   * regex instead of a word boundary — it compiles, it never matches, and
   * every test that only asserts "not unknown" still passes. Two of the rules
   * added for this fix shipped that way until a direct probe caught it.
   */
  it("no rule pattern smuggles a control character instead of a boundary", () => {
    const sentinels = [
      "galimybes",
      "opportunities",
      "projektus",
      "surask",
      "susidomejo",
    ];
    for (const s of sentinels) {
      expect(
        classifyIntent(s).intent,
        `"${s}" matched nothing — a \\b in the rule source is likely a literal backspace`,
      ).not.toBe("unknown");
    }
  });
});

/**
 * The employer sentences the new rules sit next to must not have moved. The
 * widened WORKER-side noun (`darbus`, `surask`) shares a stem family with the
 * employer-side `darbuotoj`, so this is the collision that would actually
 * happen.
 */
describe("widening the worker vocabulary steals no employer sentence", () => {
  const UNCHANGED: readonly (readonly [string, string])[] = [
    ["reikia darbuotojų", "need-workers"],
    ["ieškau darbuotojų", "need-workers"],
    ["surask darbuotojų", "find-workers"],
    // G8: the candidate noun means the REVIEW surface now (the same handler
    // the `candidates` chip runs), no longer the scouting workflow.
    ["parodyk kandidatus", "candidates"],
    ["ieškau darbo", "find-work"],
  ];
  for (const [sentence, intent] of UNCHANGED) {
    it(`"${sentence}" stays ${intent}`, () => {
      expect(classifyIntent(sentence).intent).toBe(intent);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// The switcher must answer "where am I?"
// ═══════════════════════════════════════════════════════════════════════════

function org(id: string, name: string): WorkspaceInfo {
  return { id, name, kind: "organization", accentIndex: 0 };
}
const PERSONAL: WorkspaceInfo = {
  id: PERSONAL_WORKSPACE_ID,
  name: "",
  kind: "personal",
  accentIndex: 0,
};
const LABELS = { personal: "Asmeninė erdvė", unnamedOrganization: "Įmonės erdvė" };

describe("workspace labels are never ambiguous", () => {
  /**
   * Reproduces production exactly: bandymuks1@gmail.com is a member of two
   * organizations and BOTH have an empty display_name and legal_name, so the
   * switcher showed the same fallback string twice.
   */
  it("two unnamed organizations never render as the same text", () => {
    const labels = workspaceDisplayLabels([PERSONAL, org("a", ""), org("b", "")], LABELS);
    expect(labels.get("a")).not.toBe(labels.get("b"));
    expect(new Set(labels.values()).size).toBe(3);
  });

  it("a single unnamed organization keeps the plain fallback (no stray number)", () => {
    const labels = workspaceDisplayLabels([PERSONAL, org("a", "")], LABELS);
    expect(labels.get("a")).toBe("Įmonės erdvė");
  });

  it("real names are never renumbered or rewritten", () => {
    const labels = workspaceDisplayLabels(
      [PERSONAL, org("a", "UAB NONSTOP GROUP"), org("b", "")],
      LABELS,
    );
    expect(labels.get("a")).toBe("UAB NONSTOP GROUP");
    expect(labels.get("b")).toBe("Įmonės erdvė");
  });

  it("two organizations that genuinely share a name are still distinguishable", () => {
    const labels = workspaceDisplayLabels([org("a", "Nonstop"), org("b", "Nonstop")], LABELS);
    expect(labels.get("a")).not.toBe(labels.get("b"));
  });

  it("a number is never invented in place of a name the row actually has", () => {
    const labels = workspaceDisplayLabels([org("a", "Statyba UAB")], LABELS);
    expect(labels.get("a")).toBe("Statyba UAB");
  });
});
