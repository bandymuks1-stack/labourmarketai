/**
 * ENTITY BEHAVIOR MODEL — the final world lock.
 *
 * Owner text, locked 2026-07-28: `docs/product/ENTITY_BEHAVIOR_MODEL_V1.md`.
 *
 * THE TRIAD:
 *   Entity Type         — WHAT it is           (UNIFIED_WORLD_MODEL_V1)
 *   Entity Behavior     — WHAT IT CAN DO       (this file)
 *   Entity Relationship — WHO IT IS LINKED TO  (UNIFIED_WORLD_MODEL_V1)
 *   AI decides WHICH behavior applies in a given situation.
 *
 * The point of the lock, in the owner's words: the world must grow by CHANGING
 * BEHAVIOR — not by creating new tables, new modules or new architectures.
 *
 * Two consequences are load-bearing and are enforced below:
 *
 *  1. BEHAVIOR IS CONTEXTUAL. The same entity behaves differently in different
 *     contexts, so a behavior can NEVER be an enum column on the entity or a
 *     row in one fixed table. It is a BINDING of (entity type × behavior ×
 *     context), and the set is open.
 *
 *  2. NO SPECIAL CASES. No entity type may require logic of its own. If a new
 *     entity type needs new architecture, the design is wrong — not the type.
 *
 * This file defines the CONTRACT. It changes no database, no UI and no API.
 * Pure data + pure functions. No IO.
 */

import type { EntityType } from "./entity-model";

// ═══════════════════════════════════════════════════════════════════════════
// 1. Behaviors — an open registry, never an enum
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A behavior id is a verb the world can perform. Deliberately OPEN
 * (`string & {}`): registering a new behavior must never require editing a
 * union, a table or a migration — that is the whole point of the lock.
 */
export type BehaviorId =
  | "employ"
  | "arrange_worker_placement"
  | "administer_payroll"
  | "manage_projects"
  | "organize_training"
  | "apply"
  | "accept_offer"
  | "work"
  | "lead_team"
  | "mentor"
  | "accept_people"
  | "be_paused"
  | "be_completed"
  | "accept_workers"
  | "have_shifts"
  | "have_safety_requirements"
  | "find_candidates"
  | "analyse_cv"
  | "prepare_offers"
  | "monitor_changes"
  | (string & {});

/**
 * A context is the situation a behavior is evaluated in. Behavior is
 * contextual, so a binding without a context would be exactly the "one enum"
 * the owner forbids. `"any"` means the behavior always applies to that type.
 */
export type BehaviorContext =
  | "any"
  | "as_employer"
  | "as_workforce_provider"
  | "as_client"
  | "as_training_provider"
  | "as_candidate"
  | "as_employee"
  | "as_team_leader"
  | "while_active"
  | "while_paused"
  | "on_site"
  | (string & {});

/** WHAT a thing can do, in WHICH situation. Never a column on the entity. */
export interface BehaviorBinding {
  readonly entityType: EntityType;
  readonly behavior: BehaviorId;
  readonly context: BehaviorContext;
}

/**
 * The owner's worked examples, recorded so the shape is never re-invented.
 * This is a SEED, not the closed set — `behaviorsFor` works for any type.
 */
export const BEHAVIOR_BINDINGS: readonly BehaviorBinding[] = [
  // Organization
  { entityType: "organization", behavior: "employ", context: "as_employer" },
  { entityType: "organization", behavior: "arrange_worker_placement", context: "as_workforce_provider" },
  { entityType: "organization", behavior: "administer_payroll", context: "as_employer" },
  { entityType: "organization", behavior: "manage_projects", context: "any" },
  { entityType: "organization", behavior: "organize_training", context: "as_training_provider" },
  // Person
  { entityType: "person", behavior: "apply", context: "as_candidate" },
  { entityType: "person", behavior: "accept_offer", context: "as_candidate" },
  { entityType: "person", behavior: "work", context: "as_employee" },
  { entityType: "person", behavior: "lead_team", context: "as_team_leader" },
  { entityType: "person", behavior: "mentor", context: "any" },
  // Project
  { entityType: "project", behavior: "accept_people", context: "while_active" },
  { entityType: "project", behavior: "be_paused", context: "while_active" },
  { entityType: "project", behavior: "be_completed", context: "while_active" },
  // Worksite
  { entityType: "worksite", behavior: "accept_workers", context: "while_active" },
  { entityType: "worksite", behavior: "have_shifts", context: "any" },
  { entityType: "worksite", behavior: "have_safety_requirements", context: "on_site" },
  // AI Agent
  { entityType: "ai_agent", behavior: "find_candidates", context: "any" },
  { entityType: "ai_agent", behavior: "analyse_cv", context: "any" },
  { entityType: "ai_agent", behavior: "prepare_offers", context: "any" },
  { entityType: "ai_agent", behavior: "monitor_changes", context: "any" },
] as const;

/**
 * Which behaviors apply to an entity type right now.
 *
 * Note what this function does NOT do: it does not switch on the entity type.
 * A type it has never seen resolves through the same code path and simply has
 * no bindings yet — which is what "no special cases" means in practice.
 */
export function behaviorsFor(
  entityType: EntityType,
  context: BehaviorContext = "any",
  bindings: readonly BehaviorBinding[] = BEHAVIOR_BINDINGS,
): readonly BehaviorId[] {
  return bindings
    .filter(
      (b) =>
        b.entityType === entityType &&
        (context === "any" ? true : b.context === context || b.context === "any"),
    )
    .map((b) => b.behavior);
}

/** The same entity, two contexts, two different capability sets. */
export function isContextual(
  entityType: EntityType,
  a: BehaviorContext,
  b: BehaviorContext,
  bindings: readonly BehaviorBinding[] = BEHAVIOR_BINDINGS,
): boolean {
  const left = [...behaviorsFor(entityType, a, bindings)].sort().join(",");
  const right = [...behaviorsFor(entityType, b, bindings)].sort().join(",");
  return left !== right;
}

/** Registering a behavior is DATA: no union edit, no migration, no module. */
export function registerBehavior(
  bindings: readonly BehaviorBinding[],
  binding: BehaviorBinding,
): readonly BehaviorBinding[] {
  return [...bindings, binding];
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. The semantic triad
// ═══════════════════════════════════════════════════════════════════════════

export const WORLD_SEMANTIC_TRIAD = [
  { layer: "entity_type", answers: "what it is", lock: "UNIFIED_WORLD_MODEL_V1" },
  { layer: "entity_behavior", answers: "what it can do", lock: "ENTITY_BEHAVIOR_MODEL_V1" },
  { layer: "entity_relationship", answers: "who it is linked to", lock: "UNIFIED_WORLD_MODEL_V1" },
  { layer: "ai", answers: "which behavior applies right now", lock: "WORLD_STATE_UX_ARCHITECTURE_V1" },
] as const;

/**
 * "AI nesirenka puslapių. AI nesirenka modulių."
 * What the AI actually selects — four choices, none of them a page or a module.
 */
export const AI_SELECTS = [
  "which_entity_to_open",
  "which_relationship_to_use",
  "which_behavior_to_apply",
  "which_action_to_offer",
] as const;

/** Things the AI must never be the one to choose. */
export const AI_NEVER_SELECTS = ["page", "module"] as const;

// ═══════════════════════════════════════════════════════════════════════════
// 3. The six mandatory answers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The owner's six questions. Three are answered by fields this lock OWNS; three
 * are answered by the canonical fields of earlier locks, which this lock
 * REFERENCES rather than asking again:
 *
 *   Q1 "existing Entity Type?"      → `needsNewEntityType`      (UNIFIED_WORLD_MODEL_V1)
 *   Q4 "AI without arch. change?"   → `aiCanWorkWithIt`         (UNIFIED_WORLD_MODEL_V1)
 *   Q5 "can the Map render it?"     → `addableWithoutMapChange` (PRODUCT_UNIVERSE_LOCK_V2)
 *
 * Q1 mattered: this lock used to block when a new entity type appeared, while
 * the Unified World Model says a new type never blocks on its own. Two locks,
 * one fact, opposite verdicts. The Unified World Model wins — growth is allowed,
 * and `registrationIsEnough` is the single mechanism that decides. Adding a
 * BEHAVIOR or a RELATIONSHIP is that same mechanism applied to the other two
 * registries, which is why Q2 and Q3 remain here and still block.
 */
export const MANDATORY_BEHAVIOR_QUESTIONS = [
  { field: "needsNewEntityType", question: "Does it use an existing Entity Type?", ownedBy: "UNIFIED_WORLD_MODEL_V1" },
  { field: "newBehaviorIsEnough", question: "Is adding a new Behavior enough?", ownedBy: "ENTITY_BEHAVIOR_MODEL_V1" },
  { field: "newRelationshipIsEnough", question: "Is adding a new Relationship enough?", ownedBy: "ENTITY_BEHAVIOR_MODEL_V1" },
  { field: "aiCanWorkWithIt", question: "Can the AI use it without an architecture change?", ownedBy: "UNIFIED_WORLD_MODEL_V1" },
  { field: "addableWithoutMapChange", question: "Can the World Map render it?", ownedBy: "PRODUCT_UNIVERSE_LOCK_V2" },
  { field: "worldStateCanControlIt", question: "Can World State control it?", ownedBy: "ENTITY_BEHAVIOR_MODEL_V1" },
] as const;

export interface BehaviorAnswers {
  /** Owned by this lock: registering a BEHAVIOR must be enough. */
  readonly newBehaviorIsEnough: boolean;
  /** Owned by this lock: registering a RELATIONSHIP must be enough. */
  readonly newRelationshipIsEnough: boolean;
  /** Owned by this lock, and the owner's escalation: false ⇒ REDESIGN. */
  readonly worldStateCanControlIt: boolean;
}

export type BehaviorProblem =
  | "new_entity_type_instead_of_behavior"
  | "behavior_not_enough"
  | "relationship_not_enough"
  | "ai_needs_architecture_change"
  | "map_cannot_render_it"
  | "world_state_cannot_control_it"
  | "special_case_for_entity_type";

export interface BehaviorViolation {
  readonly id: string;
  readonly code: BehaviorProblem;
  readonly detail: string;
  /**
   * The owner singled out the LAST question: "Jeigu atsakymas į paskutinį
   * klausimą yra 'ne', sprendimas turi būti perprojektuotas." A failure there
   * is not a review note — the design goes back to the drawing board.
   */
  readonly redesignRequired: boolean;
}

/**
 * Validate the six answers.
 *
 * Every one of them is blocking, because "NO SPECIAL CASES" already says that
 * needing new architecture for a type makes the decision wrong. Question six
 * carries the owner's explicit escalation: redesign, not review.
 */
export function validateBehaviorAnswers(
  id: string,
  a: BehaviorAnswers,
): readonly BehaviorViolation[] {
  const out: BehaviorViolation[] = [];
  const push = (code: BehaviorProblem, detail: string, redesignRequired = false) =>
    out.push({ id, code, detail, redesignRequired });

  if (!a.newBehaviorIsEnough) {
    push(
      "behavior_not_enough",
      "adding a Behavior is NOT enough — something structural is required, which means the behavior model is being bypassed",
    );
  }
  if (!a.newRelationshipIsEnough) {
    push(
      "relationship_not_enough",
      "adding a Relationship is NOT enough — a new table or module is being introduced instead",
    );
  }
  // Q1, Q4 and Q5 are NOT re-checked here. `needsNewEntityType`,
  // `aiCanWorkWithIt` and `addableWithoutMapChange` are enforced once, by the
  // locks that own them. Re-checking would be a duplicate verdict, and two
  // verdicts on one fact is how a gate starts contradicting itself.
  if (!a.worldStateCanControlIt) {
    push(
      "world_state_cannot_control_it",
      "World State cannot control it — by the owner's rule this decision must be REDESIGNED, not merely reviewed",
      true,
    );
  }
  return out;
}

/** True when the PR must go back to design rather than to a reviewer. */
export function requiresRedesign(v: readonly BehaviorViolation[]): boolean {
  return v.some((x) => x.redesignRequired);
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Where the product still uses SPECIAL CASES (recorded, not fixed)
// ═══════════════════════════════════════════════════════════════════════════

export interface SpecialCase {
  readonly area: string;
  /** The concrete artefact — a file, a symbol, a count. Never a vibe. */
  readonly evidence: string;
  /** Which rule of this lock it breaks. */
  readonly breaks: "no_special_cases" | "behavior_is_contextual" | "ai_selects_no_pages";
}

/**
 * VERIFIED 2026-07-28 against the codebase at `611ad0f6`.
 *
 * The headline: there is no behavior concept in the product at all — zero
 * matches for a behavior/capability registry. The closest existing thing,
 * `lib/conversation/action-registry.ts`, is a genuinely good registry that is
 * keyed to the WRONG axis: it binds actions to the closed four-value RBAC
 * `Role` union, not to an entity and a context.
 */
export const SPECIAL_CASE_AUDIT: readonly SpecialCase[] = [
  {
    area: "No behavior layer exists",
    evidence:
      "0 files match entityBehavior / entity_behavior / behaviorRegistry / EntityCapability across lib, app and components",
    breaks: "no_special_cases",
  },
  {
    area: "Actions are keyed to actor ROLE, not to entity + context",
    evidence:
      "lib/conversation/action-registry.ts: `subject: Role` over the closed union worker|company|agency|customer; 30 actions namespaced worker(15) / company(10) / agency(5); `customer` holds 0 — a fourth actor type with no behaviors at all",
    breaks: "behavior_is_contextual",
  },
  {
    area: "Preconditions are per-type, not per-context",
    evidence:
      "ActionPrecondition is a closed union whose members name types directly: has_worker_row (5 uses), has_company (5), has_agency (3), has_agency_connection (1)",
    breaks: "behavior_is_contextual",
  },
  {
    area: "Executors are split by actor type",
    evidence:
      "lib/conversation/worker-executors.ts (193 lines) and lib/conversation/company-executors.ts (233 lines) are separate modules — a new actor type means a third module",
    breaks: "no_special_cases",
  },
  {
    area: "Every action is anchored to a page",
    evidence:
      "`advancedRoute` is a REQUIRED field on all 30 descriptors, and 9 of 30 still execute as handler kind `deep_link` — so today the AI does select a page",
    breaks: "ai_selects_no_pages",
  },
  {
    area: "The map renders per-kind, by design",
    evidence:
      'lib/market-map/spatial-entities.ts: SPATIAL_ENTITY_KINDS is a closed 3-value union and the source comment states "The three kinds NEVER share a rendering contract"',
    breaks: "no_special_cases",
  },
  {
    area: "Detail routes are per-type",
    evidence:
      "/dashboard/people/[workerId], /dashboard/projects/[id], /dashboard/communication/[conversationId], /dashboard/admin/users/[id] — there is no /entity/[id]",
    breaks: "ai_selects_no_pages",
  },
] as const;

export const BEHAVIOR_CONFORMANCE = {
  behaviorLayerExists: false,
  behaviorsAreContextual: false,
  actionsKeyedTo: "rbac_role" as const,
  actorTypesWithoutBehaviors: ["customer"] as readonly string[],
  // Census of `action-registry.ts`, pinned against the real source by
  // `product-gate.test.ts` ("the audit's claims still hold"). 30 → 31 in W6
  // slice 3: `worker.review-experiences`, the action that opens the
  // `experiences` result. The audit's CLAIM is unchanged by it — the new
  // action is anchored to a page like every other one, which is exactly the
  // conformance gap this census exists to keep visible.
  //
  // 31 → 34 in §7.1: `company.review-engagements`, `worker.review-engagements`
  // and `engagement.end`. All three are still anchored to a page, so the
  // conformance gap is unchanged — but the LAST of them is the first crack in
  // `actionsKeyedTo: "rbac_role"`, and it is recorded rather than smoothed
  // over. `engagement.end` is keyed to a RELATIONSHIP, because the employer
  // and the worker hold the same authority over the same row and naming the
  // act after one of them would have been a lie about who owns it.
  //
  // That is a small step TOWARD the behaviour model this audit says is
  // missing, not away from it: it is the first action whose availability is a
  // fact about a relationship rather than about an actor type. The verdict
  // stays `special_case_per_actor_type` because one action out of 34 does not
  // make a layer — and overstating it here is exactly what this census exists
  // to prevent.
  // 2026-09-04: +1 — `company.invite-worker` (roster invitation by sentence,
  // real recruiter pilot). Still anchored to a page; still keyed to an actor
  // type, so the verdict below is unchanged.
  // 2026-09-04 (owner contract §15): +4 — `company.create-programme`,
  // `company.create-cohort`, `company.assign-learner`,
  // `company.invite-learner` (the institution's commands by sentence over
  // the ONE dispatcher). Still anchored to a page; still keyed to an actor
  // type (the company holding `training_provider`), so the verdict stands.
  // 2026-09-05 (owner contract §11): +1 — `company.move-worker`, the what-if
  // move's confirmed commit over the two canonical assignment RPCs. Anchored
  // to the projects page; keyed to the company actor type; verdict unchanged.
  // 2026-09-05 (owner contract §14): +1 — `company.update-task-status`, a
  // task moved to a real status by sentence over the ONE status core. Its
  // role gate is the union company / agency / worker because the RPC
  // re-derives the row authority (creator / assignee / project manager) —
  // still keyed to actor TYPES, not to a relationship; anchored to the tasks
  // page; verdict unchanged.
  // 2026-09-05 (owner contract §11/§12/§16): +3 — the READINESS journey's
  // corrective actions offered right after "kas trūksta projektui X?":
  // `company.set-readiness-item`, `company.seed-readiness-checklist` (the
  // operations page's own checklist writes) and `company.request-readiness`
  // (a work instruction in the project's thread). Anchored to the projects
  // page; keyed to the company actor type; verdict unchanged.
  // 2026-09-05 (owner contract §14): +2 — `company.confirm-work` (the inbox's
  // one-tap confirm by chip) and `company.enable-journal-review` (the
  // membership RPC). Anchored to the inbox; keyed to the company actor
  // type; verdict unchanged.
  conversationActions: 51,
  actionsAnchoredToAPage: 51,
  /** The one action keyed to a relationship rather than to an RBAC role. */
  actionsKeyedToARelationship: 1,
  actionsThatOnlyDeepLink: 11,
  verdict: "special_case_per_actor_type" as const,
  /** The one thing that is already right, and is the seed of the migration. */
  strongestExistingFoundation:
    "lib/conversation/action-registry.ts is already declarative, LLM-proposable-but-not-executable, and precondition-aware — it needs re-keying from Role to (entity, context), not replacing.",
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// 5. The TRANSITIONAL WAIVER — the only way to be honest before E.7 / B.6
// ═══════════════════════════════════════════════════════════════════════════

/**
 * THE PROBLEM IT SOLVES. Four locks now ask a surface whether the World Map
 * carries it, whether World State controls it, and whether it lives in one
 * workspace. Until E.7 / B.6 ship — the map platform and the behavior binding —
 * the honest answer for a real surface is "not yet". Without a transition, the
 * only green path would be to answer untruthfully, and the locks explicitly say
 * nothing has to be rewritten today.
 *
 * WHAT IT IS NOT. It is not a bypass. It cannot excuse the questions that keep
 * the world one world:
 *   - `usesEntity`            — you may not stop being entity-based;
 *   - `registrationIsEnough`  — the growth mechanism is never waived;
 *   - `newBehaviorIsEnough` / `newRelationshipIsEnough`.
 * Only the three READINESS answers below may be waived, because only they
 * depend on architecture that does not exist yet.
 */
export const WAIVABLE_FIELDS = [
  "reflectedOnMap",
  "addableWithoutMapChange",
  "worldStateCanControlIt",
] as const;

export type WaivableField = (typeof WAIVABLE_FIELDS)[number];

/** The enabling steps. When one ships, the waivers that cite it expire. */
export const ENABLING_STEPS = ["E.7", "B.6"] as const;
export type EnablingStep = (typeof ENABLING_STEPS)[number];

export interface TransitionalWaiver {
  /** Why the honest answer is "not yet". Prose, not a checkbox. */
  readonly reason: string;
  /** Exactly which readiness answers it covers. Nothing else is excused. */
  readonly fields: readonly WaivableField[];
  /** The work whose arrival makes this waiver unnecessary. */
  readonly enablingStep: EnablingStep;
  /** Owner sign-off. An empty string is not an approval. */
  readonly ownerApproval: string;
}

export type WaiverProblem =
  | "waiver_not_approved"
  | "waiver_covers_unwaivable_field"
  | "waiver_expired";

/**
 * Validate a waiver against the world as it actually is.
 *
 * `enablingArchitectureExists` is computed by the Product Gate from the CODE —
 * not from a date and not from a promise: when the World Map stops being a
 * closed per-kind union, the waiver has nothing left to excuse and must go.
 * That is what makes this expire automatically instead of quietly becoming
 * permanent.
 */
export function validateWaiver(
  id: string,
  w: TransitionalWaiver,
  enablingArchitectureExists: boolean,
): readonly { id: string; code: WaiverProblem; detail: string }[] {
  const out: { id: string; code: WaiverProblem; detail: string }[] = [];

  if (w.ownerApproval.trim().length < 3) {
    out.push({
      id,
      code: "waiver_not_approved",
      detail:
        "a transitional waiver needs explicit owner approval recorded on the declaration — an unapproved waiver is just an unanswered question",
    });
  }
  for (const f of w.fields) {
    if (!(WAIVABLE_FIELDS as readonly string[]).includes(f)) {
      out.push({
        id,
        code: "waiver_covers_unwaivable_field",
        detail: `"${f}" may never be waived — only map/World-State READINESS answers can be, never whether the thing is an Entity or whether registering it is enough`,
      });
    }
  }
  if (enablingArchitectureExists) {
    out.push({
      id,
      code: "waiver_expired",
      detail: `${w.enablingStep} has shipped — the waiver has expired and must be removed, and the readiness answers must now be true`,
    });
  }
  return out;
}

/** A declaration is only excused for the fields its approved waiver names. */
export function isWaived(
  field: string,
  w: TransitionalWaiver | undefined,
  enablingArchitectureExists: boolean,
): boolean {
  if (!w || enablingArchitectureExists) return false;
  if (w.ownerApproval.trim().length < 3) return false;
  return (w.fields as readonly string[]).includes(field);
}
