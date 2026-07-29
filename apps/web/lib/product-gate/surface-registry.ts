/**
 * PRODUCT SURFACE REGISTRY — the declaration a new UI element must carry.
 *
 * Human half: `docs/PRODUCT_CONSTITUTION.md` §13.
 * Enforced by: `.github/scripts/product-gate.mjs` + `lib/guards/product-gate.test.ts`.
 *
 * THE RULE: a PR that adds a screen, a menu item, a dashboard element, a popup,
 * a module, a wizard or a persistent card must add its declaration here — with
 * the five answers the Product Constitution demands. A surface nobody can
 * justify in five short sentences is a surface that should not exist.
 *
 * THE BASELINE: everything that existed on 2026-07-28 is grandfathered. This
 * PR fixes nothing and redesigns nothing (that was the explicit scope); it
 * stops the NEXT undeclared surface. The known violations in today's baseline
 * are recorded in `docs/audits/product-constitution-audit-v1.md`, not silently
 * blessed here.
 *
 * Pure data. No IO.
 */

import type { AxiomId } from "./axioms";
import type { WorldElementId } from "./world-elements";
import { validateUniverseAnswers, type UniverseAnswers } from "./universal-object-model";
import { validateWorldStateAnswers, type WorldStateAnswers } from "./world-state";
import { validateEntityAnswers, type EntityAnswers } from "./entity-model";
import {
  validateBehaviorAnswers,
  type BehaviorAnswers,
  type TransitionalWaiver,
} from "./behavior-model";

export type SurfaceKind =
  | "screen"
  | "menu_item"
  | "dashboard_element"
  | "popup"
  | "module"
  | "wizard"
  | "persistent_card";

export interface SurfaceDeclaration {
  /** Stable id — the route, the nav id, or the component path. */
  readonly id: string;
  readonly kind: SurfaceKind;
  /** Which axiom PERMITS this to exist. Must be a real axiom id. */
  readonly originAxiom: AxiomId;
  /** What it is for, in one concrete sentence. */
  readonly purpose: string;
  /** Why a conversation cannot do this job. The hardest question, asked first. */
  readonly whyNotChat: string;
  /** Why an existing component cannot carry it. */
  readonly whyNotExistingComponent: string;
  /** The accountable role. */
  readonly owner: string;
  /**
   * The canonical action this surface OWNS. Two surfaces may not own the same
   * action (A-08). `null` = it owns no action (a pure read surface).
   */
  readonly ownsAction: string | null;

  // ── The six mandatory answers (PRODUCT_VISION_LOCK_V1, owner 2026-07-28) ──
  /** 1. Which core world element is being extended? */
  readonly worldElement: WorldElementId;
  /** 2. Why can an existing element not be used? */
  readonly whyNotExistingElement: string;
  /** 3. How does this integrate into the AI conversation? */
  readonly chatIntegration: string;
  /** 4. How is it reflected in the Avatar's state? */
  readonly avatarEffect: string;
  /** 5. How is it reflected in the World Map? */
  readonly mapEffect: string;
  /** 6. How is it related to the Work Journal? */
  readonly journalRelation: string;

  // ── The nine universe answers (PRODUCT_UNIVERSE_LOCK_V2, owner 2026-07-28) ─
  /** Which of the four pillars is extended. */
  readonly pillar: string;
  /** Which world object type it acts on. */
  readonly objectType: string;
  /** Is that type registered in the Universal Object Model? (blocking) */
  readonly registeredInObjectModel: boolean;
  /** Does the object have a Timeline? (blocking) */
  readonly hasTimeline: boolean;
  /** Does the object have History? (blocking) */
  readonly hasHistory: boolean;
  /** Can it be added WITHOUT changing World Map architecture? (blocking) */
  readonly addableWithoutMapChange: boolean;

  // ── The five world-state answers (WORLD_STATE_UX_ARCHITECTURE_V1) ─────────
  // All five are blocking: "Jeigu bent vienas atsakymas yra 'ne', sprendimas
  // laikomas neatitinkančiu PRODUCT_VISION_LOCK."
  readonly changesWorldState: boolean;
  readonly reflectedOnMap: boolean;
  readonly aiControlled: boolean;
  readonly usableWithoutLeavingWorkspace: boolean;
  readonly needsNoNewPage: boolean;

  // ── The entity answers (UNIFIED_WORLD_MODEL_V1, owner 2026-07-28) ─────────
  // Entity is the only base thing in the world. Growth happens by REGISTRATION:
  // `registrationIsEnough` is the mechanism, and it blocks. Needing a new type,
  // role or relationship never blocks on its own — that is how the world grows.
  // The map question is NOT repeated here: `addableWithoutMapChange` above is
  // the canonical one, and the entity validator reads it.
  /** Does it use Entity at all? (blocking) */
  readonly usesEntity: boolean;
  /** Does it need a new Entity Type? (never blocks — growth is allowed) */
  readonly needsNewEntityType: boolean;
  /** Is registering it enough? THE growth mechanism. (blocking) */
  readonly registrationIsEnough: boolean;
  /** Does it create a new Role? (never blocks — roles are dynamic) */
  readonly createsNewRole: boolean;
  /** Does it create a new Relationship? (never blocks — predicates register) */
  readonly createsNewRelationship: boolean;
  /** Can the AI work with this Entity? (blocking) */
  readonly aiCanWorkWithIt: boolean;
  // ── The behavior answers (ENTITY_BEHAVIOR_MODEL_V1, owner 2026-07-28) ─────
  // The world grows by CHANGING BEHAVIOR — not by new tables, modules or
  // architectures. All six of the owner's questions are still asked; three are
  // answered by fields ABOVE, which their own locks own, so nothing is judged
  // twice:
  //   "existing Entity Type?"     → `needsNewEntityType`      (entity block)
  //   "AI without arch. change?"  → `aiCanWorkWithIt`         (entity block)
  //   "can the Map render it?"    → `addableWithoutMapChange` (universe block)
  /** Is adding a new Behavior enough? (blocking) */
  readonly newBehaviorIsEnough: boolean;
  /** Is adding a new Relationship enough? (blocking) */
  readonly newRelationshipIsEnough: boolean;
  /** Can World State control it? — false means REDESIGN, not review. */
  readonly worldStateCanControlIt: boolean;

  /**
   * TEMPORARY, owner-approved, self-expiring. Present only while the enabling
   * architecture (E.7 map platform / B.6 behavior binding) does not exist. It
   * may excuse ONLY the readiness answers in `WAIVABLE_FIELDS`; it can never
   * excuse `usesEntity` or `registrationIsEnough`, and the Product Gate turns
   * it into a hard error the moment the enabling architecture ships.
   */
  readonly transitionalWaiver?: TransitionalWaiver;
}

/**
 * Declarations added from this PR onward.
 *
 * The FIRST entry is the Context Panel (W3). It is declared even though no
 * detection pattern in the Product Gate would have caught it — it is not a
 * page, not a modal, not a wizard and not a `*-card.tsx`. Declaring it anyway
 * is the point of the constitution: this is the largest UI addition since the
 * conversation itself, and a surface nobody can justify in five sentences is a
 * surface that should not exist. The alternative — shipping it silently because
 * the regexes happen not to match — would be following the letter of the gate
 * while defeating it.
 */
export const PRODUCT_SURFACES: readonly SurfaceDeclaration[] = [
  {
    id: "components/app/world-state/context-panel.tsx",
    kind: "dashboard_element",
    // A-01 does not merely permit this — it NAMES it: "AI Conversation + World
    // Map + Context Panel are ONE workspace".
    originAxiom: "A-01",
    purpose:
      "The third part of the one workspace: it always answers 'what is in front of me right now' — the person's real work context when nothing is selected, and the selected entity's facts, requirements, history, deterministic next steps and real actions when something is.",
    whyNotChat:
      "The conversation answers a question once and the answer scrolls away. Selection state is PERSISTENT context: while a person compares an opportunity against their own skills they need the facts to stay in view while they keep talking. Re-asking the assistant for the same demand every turn is the failure this replaces — and the panel still performs no action of its own, it dispatches into the conversation.",
    whyNotExistingComponent:
      "No existing component is keyed on an ENTITY. Every detail view in the product today is a page per domain (/dashboard/people/[id], /dashboard/projects/[id], the opportunities board), which is exactly the page-based shape WORLD_STATE_UX_ARCHITECTURE_V1 forbids. The panel replaces those detail pages with one entity-typed lens that any registered entity type reaches without new UI.",
    owner: "Product architecture (DI)",
    // It owns the ACT of opening an entity in the workspace. Every domain
    // action it offers still belongs to that domain's canonical control — the
    // express-interest write stays at lib/opportunities/interest-actions.ts.
    ownsAction: "world_state.open_entity",

    // ── PRODUCT_VISION_LOCK_V1: the six answers ─────────────────────────────
    worldElement: "ai_conversation",
    whyNotExistingElement:
      "It IS this element, not a new one: the AI Conversation element is defined as the interface that 'opens the context it needs, closes it, and returns to the conversation'. Before W3 the product had no way to open context without leaving the conversation, so the element was only half built.",
    chatIntegration:
      "One World State: a selection made in the chat opens the panel, and every action the panel offers is dispatched back into the chat's existing chip handler. The panel owns no dispatcher, no flow and no write path of its own.",
    avatarEffect:
      "It changes nothing about the avatar by itself. It shows the avatar's own state against a selected entity — which of the demand's required skills the person actually holds — and routes the fix to the work journal, where skills really come from.",
    mapEffect:
      "W6 delivered it: the workspace map (components/app/world-state/workspace-map.tsx) subscribes to the SAME World State — the selection flies the map to the entity's place, and clicking a marker dispatches open_object so the panel and the conversation follow. Real rows only, clustered per city, approximate centroids labelled.",
    journalRelation:
      "The panel's primary recommendation for a missing required skill is to log the work that proves it — the journal stays the source of skills, and the panel never offers a self-declaration shortcut around it.",

    // ── PRODUCT_UNIVERSE_LOCK_V2: the universe answers ──────────────────────
    pillar: "ai_conversation",
    objectType: "job",
    registeredInObjectModel: true, // EXAMPLE_OBJECT_TYPES includes "job"
    hasTimeline: true, // the person's own interest signal is dated state
    hasHistory: true, // interest + saved state, read from real rows
    addableWithoutMapChange: true, // no map file is touched by this slice

    // ── WORLD_STATE_UX_ARCHITECTURE_V1: the five answers ────────────────────
    changesWorldState: true, // it IS a World State slot (context_panel)
    reflectedOnMap: true, // W6: the workspace map reacts to the selection
    aiControlled: true, // opened/closed through the conversation's own state
    usableWithoutLeavingWorkspace: true,
    needsNoNewPage: true, // no route was added by this slice

    // ── UNIFIED_WORLD_MODEL_V1: the entity answers ──────────────────────────
    usesEntity: true, // it opens an EntityRef, never a per-domain screen
    needsNewEntityType: false, // "job" already exists in the registry
    registrationIsEnough: true, // a second type = one line in resolvers.ts
    createsNewRole: false,
    createsNewRelationship: false,
    aiCanWorkWithIt: true,

    // ── ENTITY_BEHAVIOR_MODEL_V1: the behavior answers ──────────────────────
    newBehaviorIsEnough: true,
    newRelationshipIsEnough: true,
    worldStateCanControlIt: true,

    // The W3-era transitional waiver (reflectedOnMap) was DELETED in W6: the
    // workspace map now genuinely reacts to the selection, so the answer is a
    // real yes and nothing is excused any more.
  },
] as const;

/**
 * BASELINE — surfaces that existed before the gate. Recorded as PATHS only:
 * a grandfathered surface is not a justified one, it is an un-audited one.
 * The gate ignores these; the audit document lists which of them already
 * conflict with an axiom and at what priority.
 *
 * Generated from `apps/web/app/[locale]/**\/page.tsx` on 2026-07-28.
 * The COUNT is pinned by the guard, so the baseline cannot grow silently.
 */
export const BASELINE_SCREEN_COUNT = 118;
export const BASELINE_DASHBOARD_SCREEN_COUNT = 79;
export const BASELINE_DATE = "2026-07-28";

/**
 * The routes that behave as a PRIMARY surface today. Recorded because A-01
 * (chat-first) is about how many of these exist, and the honest answer today
 * is "more than one" — see the audit.
 */
export const BASELINE_PRIMARY_SURFACES: readonly string[] = [
  "/dashboard", // the canonical chat-first root (PR #864)
  "/dashboard/advanced", // documented module escape hatch
  "/dashboard/visual-os", // NOT in any registry — audit finding PC-01
  "/dashboard/start", // activity setup hub — audit finding PC-04
] as const;

export function surface(id: string): SurfaceDeclaration | null {
  return PRODUCT_SURFACES.find((s) => s.id === id) ?? null;
}

export type DeclarationViolation =
  | "unknown_axiom"
  | "unknown_pillar"
  | "not_registered_object_type"
  | "requires_map_architecture_change"
  | "not_world_state_driven"
  | "not_reflected_on_map"
  | "not_ai_controlled"
  | "requires_leaving_workspace"
  | "requires_new_page"
  | "unknown_world_element"
  | "not_entity_based"
  | "new_base_entity"
  | "registration_not_enough"
  | "map_does_not_support_type"
  | "ai_cannot_work_with_entity"
  | "new_entity_type_instead_of_behavior"
  | "behavior_not_enough"
  | "relationship_not_enough"
  | "ai_needs_architecture_change"
  | "map_cannot_render_it"
  | "world_state_cannot_control_it"
  | "special_case_for_entity_type"
  | "unanswered_vision_question"
  | "empty_purpose"
  | "empty_why_not_chat"
  | "empty_why_not_existing_component"
  | "empty_owner"
  | "duplicate_id"
  | "waiver_not_approved"
  | "waiver_covers_unwaivable_field"
  | "waiver_expired"
  | "duplicate_action";

export interface DeclarationProblem {
  readonly id: string;
  readonly code: DeclarationViolation;
  readonly detail: string;
}

/**
 * Validate the registry itself. A declaration that answers "why not chat?"
 * with a blank is not a declaration — it is paperwork.
 */
export function validateDeclarations(
  declarations: readonly SurfaceDeclaration[],
  knownAxiomIds: readonly string[],
  knownWorldElementIds: readonly string[] = [],
): readonly DeclarationProblem[] {
  const problems: DeclarationProblem[] = [];
  const seenIds = new Set<string>();
  const actionOwners = new Map<string, string>();

  for (const d of declarations) {
    if (seenIds.has(d.id)) {
      problems.push({ id: d.id, code: "duplicate_id", detail: "declared twice" });
    }
    seenIds.add(d.id);

    if (!knownAxiomIds.includes(d.originAxiom)) {
      problems.push({
        id: d.id,
        code: "unknown_axiom",
        detail: `origin axiom ${d.originAxiom} is not in the Product Constitution`,
      });
    }
    if (d.purpose.trim().length < 10) {
      problems.push({ id: d.id, code: "empty_purpose", detail: "purpose is not stated" });
    }
    if (d.whyNotChat.trim().length < 10) {
      problems.push({
        id: d.id,
        code: "empty_why_not_chat",
        detail: "why a conversation cannot do this is not answered",
      });
    }
    if (d.whyNotExistingComponent.trim().length < 10) {
      problems.push({
        id: d.id,
        code: "empty_why_not_existing_component",
        detail: "why an existing component cannot carry this is not answered",
      });
    }
    if (d.owner.trim().length < 2) {
      problems.push({ id: d.id, code: "empty_owner", detail: "no accountable owner" });
    }
    // The six mandatory vision answers. A blank is not an answer.
    if (!knownWorldElementIds.includes(d.worldElement)) {
      problems.push({
        id: d.id,
        code: "unknown_world_element",
        detail: `"${d.worldElement}" is not one of the twelve world elements`,
      });
    }
    for (const [field, value] of [
      ["whyNotExistingElement", d.whyNotExistingElement],
      ["chatIntegration", d.chatIntegration],
      ["avatarEffect", d.avatarEffect],
      ["mapEffect", d.mapEffect],
      ["journalRelation", d.journalRelation],
    ] as const) {
      if (value.trim().length < 10) {
        problems.push({
          id: d.id,
          code: "unanswered_vision_question",
          detail: `${field} is unanswered — PRODUCT_VISION_LOCK_V1 requires all six answers`,
        });
      }
    }

    // The nine universe answers. A blocking "no" stops the PR (owner rule).
    for (const problem of validateUniverseAnswers(d.id, d as UniverseAnswers)) {
      problems.push({
        id: problem.id,
        code: problem.code as DeclarationViolation,
        detail: problem.detail,
      });
    }

    // The entity answers. registrationIsEnough is the growth mechanism.
    for (const problem of validateEntityAnswers(d.id, d as EntityAnswers)) {
      problems.push({
        id: problem.id,
        code: problem.code as DeclarationViolation,
        detail: problem.detail,
      });
    }

    // The five world-state answers. Any "no" breaks the vision lock.
    for (const problem of validateWorldStateAnswers(d.id, d as WorldStateAnswers)) {
      problems.push({
        id: problem.id,
        code: problem.code as DeclarationViolation,
        detail: problem.detail,
      });
    }

    // The six behavior answers. The last one escalates to REDESIGN.
    for (const problem of validateBehaviorAnswers(d.id, d as BehaviorAnswers)) {
      problems.push({
        id: problem.id,
        code: problem.code as DeclarationViolation,
        detail: problem.redesignRequired
          ? `${problem.detail} — REDESIGN REQUIRED`
          : problem.detail,
      });
    }

    if (d.ownsAction) {
      const existing = actionOwners.get(d.ownsAction);
      if (existing) {
        problems.push({
          id: d.id,
          code: "duplicate_action",
          detail: `action "${d.ownsAction}" is already owned by ${existing} (A-08: one function, one home)`,
        });
      } else {
        actionOwners.set(d.ownsAction, d.id);
      }
    }
  }
  return problems;
}
