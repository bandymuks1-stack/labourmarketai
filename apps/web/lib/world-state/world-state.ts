/**
 * WORLD STATE — the runtime object, W3.
 *
 * The CONTRACT lives in `lib/product-gate/world-state.ts`
 * (`WORLD_STATE_UX_ARCHITECTURE_V1`, owner text 2026-07-28). That file is the
 * lock: it names the slots, the operator actions and what the AI may never
 * change. This file is the first RUNTIME implementation of that contract — the
 * state the one workspace actually holds while a person uses it.
 *
 * ONE DEFINITION PER CONCEPT. The slot names are IMPORTED from the lock, never
 * restated here: `WORLD_STATE_SLOTS` remains the single definition, and the
 * guard asserts every slot in the lock has a field in this state.
 *
 * WHAT W3 ACTUALLY WRITES. The Context Panel needs selection, so W3 writes
 * `active_entity`, `context_panel` and `conversation_state`. The remaining
 * slots are typed and initialised to their empty value and NOTHING in this
 * phase writes them — `active_filters` and `map_state` become live when the AI
 * writes dimensions (W4) and the map subscribes (W6). They are declared rather
 * than invented later because they are the lock's own list; they are honestly
 * marked below as not-yet-written, and the guard pins that claim so this file
 * cannot quietly grow a half-built filter engine.
 *
 * THE RULE THIS FILE EXISTS TO KEEP:
 *   "AI nekeičia puslapių. AI nekeičia maršrutų. AI nekeičia darbo vietos.
 *    AI keičia tik World State."
 * There is therefore no route, no href, no router and no page in this module —
 * structurally, not by convention. The guard checks it.
 *
 * Pure data + a pure reducer. No IO, no React, no network.
 */

import type { EntityType } from "@/lib/product-gate/entity-model";
import { WORLD_STATE_SLOTS } from "@/lib/product-gate/world-state";

// ═══════════════════════════════════════════════════════════════════════════
// Entity reference — how the world addresses a thing
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The address of one thing in the world. `UNIFIED_WORLD_MODEL_V1`: Entity is
 * the only base thing, and the only difference between two things is the
 * Entity Type. So the workspace opens an ENTITY — never a "worker screen", a
 * "company screen" or a "project screen".
 *
 * `type` is the open registry type from the unified model (a new type is
 * registered, never migrated); `id` is that domain's real row id.
 */
export interface EntityRef {
  readonly type: EntityType;
  readonly id: string;
}

export function sameEntity(a: EntityRef | null, b: EntityRef | null): boolean {
  if (a === null || b === null) return a === b;
  return a.type === b.type && a.id === b.id;
}

/** Stable key for React lists / caches. Never parsed back — ids may contain
 *  anything a uuid column allows, so this is one-way on purpose. */
export function entityKey(ref: EntityRef): string {
  return `${ref.type}:${ref.id}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// The state
// ═══════════════════════════════════════════════════════════════════════════

/** What the Context Panel is currently showing. */
export type ContextPanelState =
  /** No entity selected — the panel shows the person's real work context. */
  | { readonly mode: "work_context" }
  /** An entity is selected and its context is being read. */
  | { readonly mode: "entity"; readonly ref: EntityRef };

/**
 * The world as this session currently sees it.
 *
 * Every field maps 1:1 onto a slot in the lock's `WORLD_STATE_SLOTS`. Fields
 * W3 does not write are typed `null` / empty and documented as such — an empty
 * value here means "not written yet", never "measured as nothing".
 */
export interface WorldState {
  /** slot: active_avatar — whose world this is. Written by the auth context,
   *  carried so a later phase does not have to re-plumb it. */
  readonly activeAvatarId: string | null;
  /** slot: active_entity — the ONE entity the workspace is focused on. */
  readonly activeEntity: EntityRef | null;
  /** slot: selected_entities — multi-selection (comparison). */
  readonly selectedEntities: readonly EntityRef[];
  /** slot: active_filters — NOT WRITTEN IN W3. The AI writes dimensions in W4. */
  readonly activeFilters: Readonly<Record<string, string>>;
  /** slot: ai_goal — NOT WRITTEN IN W3 (W4 owns the AI operator). */
  readonly aiGoal: string | null;
  /** slot: context_panel — what the panel shows right now. */
  readonly contextPanel: ContextPanelState;
  /** slot: map_state — NOT WRITTEN IN W3. The map subscribes in W6. */
  readonly mapState: null;
  /** slot: conversation_state — the panel and the conversation agree on which
   *  entity the dialogue is about. */
  readonly conversationState: { readonly aboutEntity: EntityRef | null };
  /** slot: active_actions — the actions currently offered for the selection.
   *  Ids only; the panel resolves them to real controls. */
  readonly activeActions: readonly string[];
}

export const INITIAL_WORLD_STATE: WorldState = {
  activeAvatarId: null,
  activeEntity: null,
  selectedEntities: [],
  activeFilters: {},
  aiGoal: null,
  contextPanel: { mode: "work_context" },
  mapState: null,
  conversationState: { aboutEntity: null },
  activeActions: [],
};

/**
 * Which state field carries which slot of the lock. Exported so the guard can
 * assert COVERAGE against `WORLD_STATE_SLOTS` — if the owner adds a slot to the
 * lock, this map (and therefore this state) must grow with it, and CI says so.
 */
export const SLOT_FIELDS: Readonly<Record<(typeof WORLD_STATE_SLOTS)[number], keyof WorldState>> = {
  active_avatar: "activeAvatarId",
  active_entity: "activeEntity",
  selected_entities: "selectedEntities",
  active_filters: "activeFilters",
  ai_goal: "aiGoal",
  context_panel: "contextPanel",
  map_state: "mapState",
  conversation_state: "conversationState",
  active_actions: "activeActions",
};

/** The slots W3 genuinely writes. The rest are declared, empty and honest. */
export const SLOTS_WRITTEN_IN_W3 = [
  "active_avatar",
  "active_entity",
  "context_panel",
  "conversation_state",
  "active_actions",
] as const;

// ═══════════════════════════════════════════════════════════════════════════
// The operator actions — exactly the lock's AI_OPERATOR_ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * What may happen to the world. These are the lock's `AI_OPERATOR_ACTIONS`
 * expressed as a reducer alphabet: the AI (W4), a click in the conversation
 * (W3) and the map (W6) all reach the world through THIS set and nothing else.
 * There is deliberately no `navigate`, no `open_page` and no `set_route`.
 */
export type WorldStateAction =
  /** The workspace learned whose world this is. */
  | { readonly kind: "set_avatar"; readonly avatarId: string | null }
  /** open_object — focus one entity; the panel follows. */
  | { readonly kind: "open_object"; readonly ref: EntityRef }
  /** close_object — drop the focus; the panel returns to the work context. */
  | { readonly kind: "close_object" }
  /** change_world_state — write filter dimensions (W4 uses it; W3 does not). */
  | { readonly kind: "change_world_state"; readonly dimension: string; readonly value: string | null }
  /** show_information — the actions currently available for the selection. */
  | { readonly kind: "show_information"; readonly actions: readonly string[] }
  /** return_to_conversation — the selection stays, the panel yields focus. */
  | { readonly kind: "return_to_conversation" };

/**
 * The one transition function. Pure, total, and side-effect free: given the
 * same state and action it always yields the same state, which is what makes
 * "the AI may never change the page" a testable property rather than a promise.
 */
export function worldStateReducer(state: WorldState, action: WorldStateAction): WorldState {
  switch (action.kind) {
    case "set_avatar":
      if (state.activeAvatarId === action.avatarId) return state;
      return { ...state, activeAvatarId: action.avatarId };

    case "open_object": {
      if (sameEntity(state.activeEntity, action.ref)) return state;
      return {
        ...state,
        activeEntity: action.ref,
        contextPanel: { mode: "entity", ref: action.ref },
        // The conversation is now ABOUT this entity — "Tolimesnis pokalbis
        // vyksta apie pasirinktą objektą." One selection, one subject.
        conversationState: { aboutEntity: action.ref },
        // Stale actions belong to the previous entity; the resolver supplies
        // the new ones. Carrying them over would offer an action for a thing
        // the user is no longer looking at.
        activeActions: [],
      };
    }

    case "close_object":
      if (state.activeEntity === null && state.contextPanel.mode === "work_context") {
        return state;
      }
      return {
        ...state,
        activeEntity: null,
        contextPanel: { mode: "work_context" },
        conversationState: { aboutEntity: null },
        activeActions: [],
      };

    case "change_world_state": {
      const next = { ...state.activeFilters };
      if (action.value === null) delete next[action.dimension];
      else next[action.dimension] = action.value;
      return { ...state, activeFilters: next };
    }

    case "show_information":
      return { ...state, activeActions: [...action.actions] };

    case "return_to_conversation":
      // The selection is NOT dropped: the conversation continues about the
      // same entity. Only the panel's claim on attention ends.
      return state;
  }
}

/** True when the panel should render an entity rather than the work context. */
export function panelShowsEntity(state: WorldState): boolean {
  return state.contextPanel.mode === "entity";
}
