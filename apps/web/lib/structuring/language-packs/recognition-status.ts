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

/** Transversal professional capabilities (presenting, teamwork, …) added for
 *  the education pilot. LT/EN/RU needles ship with the family; the nine
 *  offline pack languages are not covered yet, so these stay DEFERRED rather
 *  than claiming a multilingual reach they do not have. */
const TRANSVERSAL_LT_EN_RU = deferred(
  "transversal professional capability — LT/EN/RU needles ship with the education-pilot family; the 9 offline pack languages arrive with the next language wave",
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
  "vehicle-cleaning": deferred(
    "P1 recall repair 2026-07-19 — LT/EN/RU needles only; per-language car-wash phrasings ride a future pack wave",
  ),
  "first-aid": deferred(
    "LT/EN/RU needles only — regulated-adjacent phrasing per language needs owner review (no medical claims, doctrine §7)",
  ),

  // ── Class-B needle wave (PR3D): now recognisable in LT/EN/RU ────────────
  "arc-welding": CONSTRUCTION_DEPTH,
  "mig-mag-welding": CONSTRUCTION_DEPTH,
  "tig-welding": CONSTRUCTION_DEPTH,
  "gas-cutting": CONSTRUCTION_DEPTH,
  "crane-operator": CONSTRUCTION_DEPTH,
  "tower-crane": CONSTRUCTION_DEPTH,
  "mobile-crane": CONSTRUCTION_DEPTH,
  "excavator-operator": CONSTRUCTION_DEPTH,
  "bulldozer-operator": CONSTRUCTION_DEPTH,
  "grader-operator": CONSTRUCTION_DEPTH,
  "loader-operator": CONSTRUCTION_DEPTH,
  "compactor-operator": CONSTRUCTION_DEPTH,
  blockwork: CONSTRUCTION_DEPTH,
  "stone-masonry": CONSTRUCTION_DEPTH,
  grouting: CONSTRUCTION_DEPTH,
  "mosaic-tiling": CONSTRUCTION_DEPTH,
  "large-format-tiling": CONSTRUCTION_DEPTH,
  "decorative-plaster": CONSTRUCTION_DEPTH,
  "facade-plaster": CONSTRUCTION_DEPTH,
  "spray-painting": CONSTRUCTION_DEPTH,
  "door-window-install": CONSTRUCTION_DEPTH,
  glazing: CONSTRUCTION_DEPTH,
  "gutter-install": CONSTRUCTION_DEPTH,
  "roof-tiling": CONSTRUCTION_DEPTH,
  "flat-roofing": CONSTRUCTION_DEPTH,
  "roof-insulation": CONSTRUCTION_DEPTH,
  "mortar-prep": CONSTRUCTION_DEPTH,
  "concrete-finishing": CONSTRUCTION_DEPTH,
  "concrete-vibration": CONSTRUCTION_DEPTH,
  "steel-fixing": CONSTRUCTION_DEPTH,
  "structural-steel": CONSTRUCTION_DEPTH,
  "precast-install": CONSTRUCTION_DEPTH,
  "cable-pulling": CONSTRUCTION_DEPTH,
  "lighting-install": CONSTRUCTION_DEPTH,
  "panel-install": CONSTRUCTION_DEPTH,
  "electrical-testing": CONSTRUCTION_DEPTH,
  "low-voltage": CONSTRUCTION_DEPTH,
  "industrial-electric": CONSTRUCTION_DEPTH,
  rigging: CONSTRUCTION_DEPTH,
  "setting-out": CONSTRUCTION_DEPTH,
  surveying: CONSTRUCTION_DEPTH,
  "quantity-takeoff": CONSTRUCTION_DEPTH,
  "site-supervision": CONSTRUCTION_DEPTH,
  "manual-handling": deferred(
    "LT/EN/RU needles only (PR3D) — loading/unloading phrasing per pack language arrives with real journal data",
  ),
  "material-transport": deferred(
    "LT/EN/RU needles only (PR3D) — per-language phrasing with real journal data",
  ),
  "hand-tools": deferred(
    "LT/EN/RU needles only (PR3D) — generic tool mention; per-language needles kept narrow to avoid noise",
  ),
  "materials-management": deferred(
    "LT/EN/RU needles only (PR3D) — per-language phrasing with real journal data",
  ),
  "safety-officer": deferred(
    "LT/EN/RU needles only (PR3D) — per-language regulatory vocabulary needs native review",
  ),

  // ── Class-B remainder: deliberately WITHOUT needles (explicit, audited) ──
  "concrete-works": deferred(
    "umbrella slug — real phrases already resolve to concrete-pouring/concrete-finishing/concrete-vibration; a needle here would double-suggest",
  ),
  "formwork-carpentry": deferred(
    "covered by the formwork needles (klojin/опалубк); dedicated phrasing indistinguishable in worker text",
  ),
  joinery: deferred(
    "EN 'joinery' deliberately maps to the carpentry skill (synonyms.ts) — a second mapping would double-suggest; revisit only with owner input",
  ),
  "forklift-operator": deferred(
    "catalogue twin of forklift-operation — recognition routes to forklift-operation so one sentence never yields both twins",
  ),
  "load-signaling": deferred(
    "niche signalling role — no reliable low-risk phrasing found; needs real journal data (rigging covers the adjacent work)",
  ),
  "rebar-detailing": deferred(
    "drawing-office niche — worker text says 'вязал арматуру'/'rišau armatūrą' which resolves to steel-fixing/rebar-cutting; detailing needs owner input",
  ),
  "waterproofing-tiles": deferred(
    "wet-room niche — real phrases resolve to the parent waterproofing needles (hidroizoli/гидроизоляц); a dedicated needle would double-suggest",
  ),

  // ── Transversal professional capabilities (2026-08-27) ───────────────────
  // The education-pilot family. DEFERRED, not core, and deliberately so: the
  // needles are LT/EN/RU only, and `core` is guard-enforced to mean "has
  // needles in EVERY registered offline pack". Claiming core here would be a
  // false multilingual claim — the honest YELLOW this file exists to keep
  // visible. The nine pack languages arrive with the next language wave.
  presenting: TRANSVERSAL_LT_EN_RU,
  "stakeholder-engagement": TRANSVERSAL_LT_EN_RU,
  "partnership-development": TRANSVERSAL_LT_EN_RU,
  negotiation: TRANSVERSAL_LT_EN_RU,
  "project-coordination": TRANSVERSAL_LT_EN_RU,
  "report-writing": TRANSVERSAL_LT_EN_RU,
  teamwork: TRANSVERSAL_LT_EN_RU,
  research: TRANSVERSAL_LT_EN_RU,
};
