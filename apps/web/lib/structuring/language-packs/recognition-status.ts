/**
 * Per-slug recognition-status classification (owner guard mandate 2026-07-04,
 * Task 5 §6): a skill added to the canonical catalogue MUST be explicitly
 * classified, or CI fails. This kills the silent class-B pattern (installed
 * in DB + named in locales, but recognisable in no language).
 *
 * Statuses:
 *  - "core": recognised in LT/EN/RU (base lexicon) AND every registered
 *    offline language pack — guard-enforced against the packs themselves.
 *  - "deferred": recognised in LT/EN/RU only (or partially); the note says
 *    why and where the plan lives. Honest YELLOW, never silent.
 *  - "not-text-recognizable": by design never recognised from free text
 *    (the note says why); locale display names still exist.
 *
 * lib/guards/offline-language-pack.test.ts enforces:
 *  - every SKILL_HINTS_LT slug appears here;
 *  - every "core" slug has needles in every registered pack;
 *  - every pack slug is classified and canonically seeded.
 */

export type SkillRecognitionStatus =
  | { readonly kind: "core" }
  | { readonly kind: "deferred"; readonly note: string }
  | { readonly kind: "not-text-recognizable"; readonly note: string };

const CORE: SkillRecognitionStatus = { kind: "core" };
const deferred = (note: string): SkillRecognitionStatus => ({ kind: "deferred", note });

/** Shared note for specialist construction sub-trades: LT/EN/RU depth exists
 *  and is kept; per-language needles for the 9 pack languages arrive with the
 *  construction wave (audit §"remaining", PR3D scope). */
const CONSTRUCTION_DEPTH = deferred(
  "specialist construction sub-trade — full LT/EN/RU needles kept; other-language needles tracked in runtime/audits/offline-multilingual-skill-recognition-audit-2026-07-04.md",
);

export const SKILL_RECOGNITION_STATUS: Readonly<Record<string, SkillRecognitionStatus>> = {
  // ── Core cross-language set (must exist in EVERY pack — see core-slugs) ──
  "data-entry": CORE,
  "office-software": CORE,
  "document-handling": CORE,
  bookkeeping: CORE,
  reception: CORE,
  administration: CORE,
  "warehouse-operations": CORE,
  "order-picking": CORE,
  "barcode-scanning": CORE,
  "pallet-handling": CORE,
  "stock-taking": CORE,
  driving: CORE,
  "delivery-driving": CORE,
  "cargo-transport": CORE,
  "forklift-operation": CORE,
  cooking: CORE,
  "kitchen-help": CORE,
  dishwashing: CORE,
  baking: CORE,
  "barista-work": CORE,
  "waiting-tables": CORE,
  cashier: CORE,
  "customer-service": CORE,
  "call-centre": CORE,
  merchandising: CORE,
  "sales-assistant": CORE,
  "cleaning-services": CORE,
  laundry: CORE,
  "window-cleaning": CORE,
  housekeeping: CORE,
  "auto-repair": CORE,
  "appliance-repair": CORE,
  "handyman-work": CORE,
  hairdressing: CORE,
  barbering: CORE,
  "nail-care": CORE,
  recruitment: CORE,
  "personnel-admin": CORE,
  programming: CORE,
  "it-support": CORE,
  gardening: CORE,
  "farm-work": CORE,
  childcare: CORE,
  "elderly-care": CORE,
  bricklaying: CORE,
  painting: CORE,
  tiling: CORE,
  plastering: CORE,
  flooring: CORE,
  "welding-blueprint": CORE,
  roofing: CORE,
  "electrical-install": CORE,
  plumbing: CORE,
  carpentry: CORE,
  demolition: CORE,
  "furniture-fitting": CORE,
  "assembly-work": CORE,
  "production-line": CORE,
  packaging: CORE,
  "event-setup": CORE,
  teaching: CORE,
  translation: CORE,

  // ── Deferred: LT/EN/RU needles only (honest YELLOW, noted) ───────────────
  drywall: CONSTRUCTION_DEPTH,
  "ceiling-systems": CONSTRUCTION_DEPTH,
  "partition-walls": CONSTRUCTION_DEPTH,
  "skim-coating": CONSTRUCTION_DEPTH,
  "floor-screeding": CONSTRUCTION_DEPTH,
  insulation: CONSTRUCTION_DEPTH,
  waterproofing: CONSTRUCTION_DEPTH,
  "concrete-pouring": CONSTRUCTION_DEPTH,
  "rebar-cutting": CONSTRUCTION_DEPTH,
  scaffolding: CONSTRUCTION_DEPTH,
  "site-cleaning": CONSTRUCTION_DEPTH,
  "site-management": CONSTRUCTION_DEPTH,
  earthworks: CONSTRUCTION_DEPTH,
  wallpapering: CONSTRUCTION_DEPTH,
  "timber-framing": CONSTRUCTION_DEPTH,
  formwork: CONSTRUCTION_DEPTH,
  "blueprint-reading": CONSTRUCTION_DEPTH,
  "general-labour": CONSTRUCTION_DEPTH,
  drainage: CONSTRUCTION_DEPTH,
  pipefitting: CONSTRUCTION_DEPTH,
  ventilation: CONSTRUCTION_DEPTH,
  "hvac-install": CONSTRUCTION_DEPTH,
  "heating-install": CONSTRUCTION_DEPTH,
  "sanitary-install": CONSTRUCTION_DEPTH,
  "team-coordination": deferred(
    "cross-sector ability; LT/EN/RU needles only — phrasing is too idiomatic per language for low-risk needles, revisit with real journal data",
  ),
  "quality-control": deferred(
    "cross-sector ability; LT/EN/RU needles only — 'quality' cognates false-positive too easily, revisit with real journal data",
  ),
  "work-scheduling": deferred(
    "cross-sector ability; LT/EN/RU needles only — schedule cognates collide with shift-plan smalltalk, revisit with real journal data",
  ),
  "equipment-operation": deferred(
    "LT/EN/RU needles only — per-language machine words vary by trade; covered indirectly via forklift/production slugs",
  ),
  "winter-service": deferred(
    "seasonal niche; LT/EN/RU needles only — per-language needles with the seasonal wave",
  ),
  "qa-testing": deferred(
    "LT/EN/RU needles only — QA vocabulary is mostly English worldwide; EN needles already catch the common phrasing",
  ),
  "web-design": deferred(
    "LT/EN/RU needles only — design vocabulary is mostly English; EN needles catch the common phrasing",
  ),
  "graphic-design": deferred(
    "LT/EN/RU needles only — design vocabulary is mostly English; EN needles catch the common phrasing",
  ),
  bartending: deferred(
    "LT/EN/RU needles only — 'barman/bartender' cognates already match most languages via the base needles",
  ),
  "animal-care": deferred(
    "LT/EN/RU needles only — per-language animal words collide with pet smalltalk; revisit with real journal data",
  ),
  "first-aid": deferred(
    "LT/EN/RU needles only — regulated-adjacent phrasing per language needs owner review (no medical claims, doctrine §7)",
  ),
};
