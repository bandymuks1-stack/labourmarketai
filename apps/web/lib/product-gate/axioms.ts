/**
 * PRODUCT CONSTITUTION — the machine-readable axiom register.
 *
 * Human half: `docs/PRODUCT_CONSTITUTION.md` §12 (BINDING, supreme).
 * Enforced by: `.github/scripts/product-gate.mjs` + `lib/guards/product-gate.test.ts`.
 *
 * NOTHING HERE IS NEW. Every axiom is a rule that already exists in a merged
 * canonical document; the `source` field cites it verbatim-locatable. This
 * register exists so a CI gate can point at a rule by id instead of a human
 * remembering which of ~40 product documents applies.
 *
 * If a source document and this register ever disagree, the Product
 * Constitution wins and the drift is a defect in whichever file is wrong.
 *
 * Pure data. No IO.
 */

export type AxiomId =
  | "A-01" | "A-02" | "A-03" | "A-04" | "A-05" | "A-06"
  | "A-07" | "A-08" | "A-09" | "A-10" | "A-11" | "A-12";

/** Can a CI gate prove a violation, or is it a human judgement? */
export type AxiomEnforcement = "machine" | "heuristic" | "review";

export interface Axiom {
  readonly id: AxiomId;
  /** The rule, as it already reads in its source document. */
  readonly rule: string;
  /** Where it was already decided — never invented here. */
  readonly source: string;
  readonly enforcement: AxiomEnforcement;
  /** What the gate actually checks (empty for `review`). */
  readonly gateCheck: string;
}

export const AXIOMS: readonly Axiom[] = [
  {
    id: "A-01",
    rule:
      "AI-FIRST — not chat-first and not map-first. AI Conversation + World Map + Context Panel are ONE workspace; the AI changes World State instead of navigating the user to another page.",
    source:
      "docs/product/WORLD_STATE_UX_ARCHITECTURE_V1.md (owner 2026-07-28, supersedes the chat-first wording of the canonical vision §15 and PR #864)",
    enforcement: "machine",
    gateCheck:
      "A diff may not remove the conversation root, drop chat from the core nav, or add a second competing primary surface.",
  },
  {
    id: "A-02",
    rule:
      "ONE canonical underlying system: every entry path normalises into the same canonical objects; no duplicate objects and no re-entering data another path already captured.",
    source: "docs/product/labour-market-os-constitution-v1.md §1.1",
    enforcement: "machine",
    gateCheck: "Two declared surfaces may not claim the same canonical action.",
  },
  {
    id: "A-03",
    rule:
      "ONE core work loop, rendered identically everywhere: chat → journal → calendar → messages. A second parallel navigation system is the defect this rule exists to prevent.",
    source: "apps/web/lib/config/navigation.ts (CORE_NAV_IDS, rebuild W5)",
    enforcement: "machine",
    gateCheck: "A diff may not add a persistent primary nav item without a declaration.",
  },
  {
    id: "A-04",
    rule:
      "Multiple valid entry points, suggestions not coercion, progressive completion — no mandatory long wizard, and no path may be blocked.",
    source: "docs/product/labour-market-os-constitution-v1.md §1.1",
    enforcement: "heuristic",
    gateCheck:
      "A new wizard/stepper or multi-field form must declare why a conversation cannot do the same job.",
  },
  {
    id: "A-05",
    rule:
      "Non-locking role / intention: a user is never locked into one role, and one user may hold multiple activity spaces.",
    source: "docs/PRODUCT_CONSTITUTION.md §1, §2",
    enforcement: "review",
    gateCheck: "",
  },
  {
    id: "A-06",
    rule:
      "No fake anything: no fake AI, matching, verification, jobs, candidates or companies; unfinished surfaces are marked, never simulated.",
    source: "docs/PRODUCT_CONSTITUTION.md §5, §9; docs/PLATFORM_DOCTRINE.md §7, §18",
    enforcement: "machine",
    gateCheck:
      "Existing guards (product-copy-forbidden-terms, no-sample-data, honesty suites) remain the enforcement; the gate refuses a surface declaring a preview/demo purpose.",
  },
  {
    id: "A-07",
    rule:
      "The profile is a living work identity, not a form and not a log of completed actions — completed work lives in the journal/engagement records.",
    source: "docs/PRODUCT_CONSTITUTION.md §3",
    enforcement: "heuristic",
    gateCheck:
      "A new profile-surface component that renders completed-action state is flagged for review.",
  },
  {
    id: "A-08",
    rule:
      "One function has ONE home. The same action may not be reachable as a distinct implementation from several surfaces.",
    source:
      "docs/product/labour-market-os-constitution-v1.md §1.1 (one canonical underlying system); enforced today by canonical-paths-integrity + dashboard-duplicate-removal guards",
    enforcement: "machine",
    gateCheck: "Duplicate `action` claims across declared surfaces are RED.",
  },
  {
    id: "A-09",
    rule:
      "Every surface must locate itself on the canonical chain (future work → … → work result). A feature that cannot is out of scope.",
    source: "docs/product/labour-market-os-constitution-v1.md §1",
    enforcement: "machine",
    gateCheck: "Every declared surface must cite an origin axiom and a purpose.",
  },
  {
    id: "A-10",
    rule:
      "No new commercial surface without the commercial system: price, LMC rule, Stripe object and entitlement live in exactly one catalogue.",
    source: "docs/product/lmc-canonical-commercial-catalogue-v1.md (the merged canonical record, PR #894)",
    enforcement: "review",
    gateCheck:
      "HUMAN GATE until the commercial system ships. The machine half (commercial-single-source + commercial-gate) arrives with docs/product/commercial-system-v1.md in PR #895/#896; claiming machine enforcement before then would be a dormant check. The rule itself is unchanged and binding.",
  },
  {
    id: "A-11",
    rule:
      "No feature is launched without a known economic model (payer, unit cost, margin) — financial safety is a merge gate, not a review note.",
    source: "PR #896 — commercial sustainability v1 (CSP-002, FSR-001, FSR-005), not yet merged",
    enforcement: "review",
    gateCheck:
      "HUMAN GATE until PR #896 merges and brings the Commercial Gate with it. The rule is binding now; claiming machine enforcement before its gate exists would be a dormant check.",
  },
  {
    id: "A-12",
    rule:
      "A metric or state that is not measured is reported as unmeasured — never as a zero, never as a reassuring default.",
    source: "PR #897 — Business Health Engine v1, not yet merged",
    enforcement: "review",
    gateCheck:
      "HUMAN GATE until PR #897 merges and brings the business-health guard with it. The honesty rule itself is binding now.",
  },
] as const;

export function axiom(id: string): Axiom | null {
  return AXIOMS.find((a) => a.id === id) ?? null;
}

export function axiomIds(): readonly string[] {
  return AXIOMS.map((a) => a.id);
}

export function machineEnforcedAxioms(): readonly AxiomId[] {
  return AXIOMS.filter((a) => a.enforcement === "machine").map((a) => a.id);
}

export function heuristicAxioms(): readonly AxiomId[] {
  return AXIOMS.filter((a) => a.enforcement === "heuristic").map((a) => a.id);
}

export function reviewOnlyAxioms(): readonly AxiomId[] {
  return AXIOMS.filter((a) => a.enforcement === "review").map((a) => a.id);
}
