/**
 * WORLD STATE — the central architectural object of the AI-first workspace.
 *
 * Owner text, locked 2026-07-28:
 * `docs/product/WORLD_STATE_UX_ARCHITECTURE_V1.md` — a REFINEMENT of
 * PRODUCT_UNIVERSE_LOCK_V2, and the final UX direction.
 *
 * THE CORRECTION IT MAKES, in the owner's words:
 *
 *   "Tikslas nėra Chat-first. Tikslas nėra Map-first. Tikslas yra AI-FIRST."
 *
 * There is no separate Chat screen, no separate Map screen, no separate Search
 * or Filter screen. AI Conversation + World Map + Context Panel are ONE
 * component — one workspace. The AI never sends the user to another page: it
 * changes WORLD STATE, and the map redraws itself.
 *
 * WHAT THIS FILE IS NOT. It is not a World State engine, not a store, not a
 * router and not a new Map. The owner was explicit that none of those are
 * required now. This is the CONTRACT that future work must satisfy, so the
 * product cannot drift into a chat-first or a map-first shape.
 *
 * SOLE OWNER OF WORLD STATE. World State is defined here and nowhere else:
 * the structural slots (`WORLD_STATE_SLOTS`), the filter dimensions
 * (`KNOWN_WORLD_STATE_DIMENSIONS`), and the two blocking questions this lock
 * owns — `reflectedOnMap` and `aiControlled`. Other locks import them.
 *
 * Pure data + pure functions. No IO.
 */

// ═══════════════════════════════════════════════════════════════════════════
// 1. The one workspace
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The three parts of the single workspace. "Tai nėra trys produktai. Tai vienas
 * komponentas." — so they are declared as PARTS, never as surfaces.
 */
export const WORKSPACE_PARTS = ["ai_conversation", "world_map", "context_panel"] as const;
export type WorkspacePart = (typeof WORKSPACE_PARTS)[number];

/** Screens the lock says do not exist as separate surfaces. */
export const FORBIDDEN_SEPARATE_SCREENS = ["chat", "map", "search", "filter"] as const;

/** What the AI does INSTEAD of navigating the user somewhere. */
export const AI_OPERATOR_ACTIONS = [
  "change_world_state",
  "update_map",
  "open_object",
  "close_object",
  "show_information",
  "return_to_conversation",
] as const;

// ═══════════════════════════════════════════════════════════════════════════
// 2. World State — what the AI actually changes
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The owner's worked examples, recorded as the canonical shape of a World State
 * mutation. These are EXAMPLES of the dimension space, not a closed schema —
 * a new dimension must be addable without re-architecting anything (the same
 * platform rule the map obeys).
 */
export interface WorldStateExample {
  readonly utterance: string;
  readonly dimension: string;
  readonly value: string;
}

export const WORLD_STATE_EXAMPLES: readonly WorldStateExample[] = [
  { utterance: "Ieškau darbo Amsterdame", dimension: "location", value: "Amsterdam" },
  { utterance: "Ieškau darbo Amsterdame", dimension: "objectType", value: "Jobs" },
  { utterance: "Noriu bent 20 €/h", dimension: "salary", value: ">=20" },
  { utterance: "Tik su apgyvendinimu", dimension: "housing", value: "true" },
  { utterance: "Tik lietuviškai", dimension: "language", value: "LT" },
  { utterance: "Tik pilnas etatas", dimension: "employment", value: "FullTime" },
  { utterance: "Rodyk tik statybas", dimension: "industry", value: "Construction" },
  { utterance: "Ne toliau kaip 20 km", dimension: "radius", value: "20km" },
] as const;

/** The dimensions the owner named. Open by design — new ones are added as data. */
export const KNOWN_WORLD_STATE_DIMENSIONS = [
  "location",
  "objectType",
  "salary",
  "housing",
  "language",
  "employment",
  "industry",
  "radius",
] as const;

/**
 * WHAT WORLD STATE HOLDS — the structural slots, as opposed to the filter
 * DIMENSIONS above. This lock owns the World State concept, so the slots live
 * here and every other lock imports them; `UNIFIED_WORLD_MODEL_V1` references
 * this list rather than restating it.
 *
 * Owner text: "World State saugo: aktyvų Avatar; aktyvią Entity; pasirinktas
 * Entity; aktyvius filtrus; AI tikslą; Context Panel; Map būseną; Conversation
 * būseną; aktyvius veiksmus."
 */
export const WORLD_STATE_SLOTS = [
  "active_avatar",
  "active_entity",
  "selected_entities",
  "active_filters",
  "ai_goal",
  "context_panel",
  "map_state",
  "conversation_state",
  "active_actions",
] as const;

export type WorldStateSlot = (typeof WORLD_STATE_SLOTS)[number];

/**
 * What the AI may change, and what it may NEVER change. This is the whole
 * architecture in four lines:
 *   "AI nekeičia puslapių. AI nekeičia maršrutų. AI nekeičia darbo vietos.
 *    AI keičia tik World State."
 */
export const AI_MAY_CHANGE = ["world_state", "context_panel", "conversation", "world_map"] as const;
export const AI_MAY_NEVER_CHANGE = ["page", "route", "workspace"] as const;

/**
 * The map reacts to World State automatically. No Apply / Search / Go button
 * may exist — pressing something to make the world catch up is the failure
 * mode this rule names.
 */
export const FORBIDDEN_COMMIT_CONTROLS = ["apply filters", "apply", "search", "go"] as const;

// ═══════════════════════════════════════════════════════════════════════════
// 3. Object interaction — a click opens the Context Panel, never a page
// ═══════════════════════════════════════════════════════════════════════════

/** What the Context Panel shows for a selected object. */
export const CONTEXT_PANEL_CONTENT = [
  "title",
  "description",
  "salary",
  "schedule",
  "contacts",
  "requirements",
  "history",
  "related_objects",
  "ai_recommendations",
  "available_actions",
] as const;

/**
 * After selecting an object the conversation is ABOUT that object — the user
 * does not go anywhere to ask about it.
 */
export const OBJECT_CONTEXT_EXAMPLES = [
  "Ar ši įmonė suteikia būstą?",
  "Kiek čia dirba lietuvių?",
  "Parodyk panašius darbus.",
  "Susisiek.",
] as const;

/** Universal context: none of these may become a module. */
export const UNIVERSAL_CONTEXT_DOMAINS = [
  "jobs",
  "workers",
  "companies",
  "projects",
  "objects",
  "partners",
  "training",
  "leagues",
  "ai_agents",
] as const;

// ═══════════════════════════════════════════════════════════════════════════
// 4. The five mandatory answers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * "Jeigu bent vienas atsakymas yra 'ne', sprendimas laikomas neatitinkančiu
 * PRODUCT_VISION_LOCK." — all five are therefore blocking.
 */
export const MANDATORY_WORLD_STATE_QUESTIONS = [
  { field: "changesWorldState", question: "Does it change World State?" },
  { field: "reflectedOnMap", question: "Is it reflected on the World Map?" },
  { field: "aiControlled", question: "Is it controlled by the AI?" },
  { field: "usableWithoutLeavingWorkspace", question: "Can it be used without leaving the main workspace?" },
  { field: "needsNoNewPage", question: "Does it need no new page?" },
] as const;

export interface WorldStateAnswers {
  readonly changesWorldState: boolean;
  readonly reflectedOnMap: boolean;
  readonly aiControlled: boolean;
  readonly usableWithoutLeavingWorkspace: boolean;
  readonly needsNoNewPage: boolean;
}

export type WorldStateProblem =
  | "not_world_state_driven"
  | "not_reflected_on_map"
  | "not_ai_controlled"
  | "requires_leaving_workspace"
  | "requires_new_page";

const FIELD_TO_PROBLEM: Record<keyof WorldStateAnswers, WorldStateProblem> = {
  changesWorldState: "not_world_state_driven",
  reflectedOnMap: "not_reflected_on_map",
  aiControlled: "not_ai_controlled",
  usableWithoutLeavingWorkspace: "requires_leaving_workspace",
  needsNoNewPage: "requires_new_page",
};

/**
 * Validate the five answers. Any `false` means the decision does not conform to
 * the vision lock — the owner's rule, applied literally.
 */
export function validateWorldStateAnswers(
  id: string,
  a: WorldStateAnswers,
): readonly { id: string; code: WorldStateProblem; detail: string }[] {
  const out: { id: string; code: WorldStateProblem; detail: string }[] = [];
  for (const q of MANDATORY_WORLD_STATE_QUESTIONS) {
    const field = q.field as keyof WorldStateAnswers;
    if (a[field] !== true) {
      out.push({
        id,
        code: FIELD_TO_PROBLEM[field],
        detail: `"${q.question}" is not YES — the decision does not conform to the vision lock (AI-first, one workspace, no page switching)`,
      });
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Where the product stands against this today (recorded, not fixed)
// ═══════════════════════════════════════════════════════════════════════════

export interface WorkspaceAssessment {
  readonly separateChatScreen: boolean;
  readonly separateMapScreen: boolean;
  readonly contextPanelExists: boolean;
  readonly worldStateEngineExists: boolean;
  readonly objectClickOpensPage: boolean;
  readonly verdict: "one_workspace" | "still_page_based";
  readonly evidence: string;
}

/**
 * VERIFIED 2026-07-29, re-measured after W3 (Context Panel).
 *
 * This block records FACTS, so it moves when the facts move. What W3 changed:
 *   - a World State object now exists at runtime (`lib/world-state/world-state.ts`
 *     + the provider mounted in the workspace) — its slots are this lock's
 *     `WORLD_STATE_SLOTS`, and W3 writes the selection ones;
 *   - the Context Panel exists (`components/app/world-state/context-panel.tsx`)
 *     and is mounted in the workspace, always available;
 *   - selecting an opportunity in the workspace opens the PANEL, not a page.
 *
 * What W3 did NOT change, and is therefore still recorded as false:
 *   - `/dashboard` is still a chat-shaped surface and `/dashboard/market-map`
 *     is still a separate map surface (the map joins the workspace at W6);
 *   - the per-domain detail pages (`/dashboard/people/[workerId]`,
 *     `/dashboard/projects/[id]`) still exist and still navigate — the panel
 *     resolves ONE entity type (`job`) so far, so those pages are not yet
 *     replaceable. `objectClickOpensPage` stays TRUE until they are.
 *
 * The verdict therefore stays `still_page_based`. Half a workspace is not a
 * workspace, and softening the verdict because the first part shipped is
 * exactly the drift this lock exists to prevent.
 */
export const WORKSPACE_ASSESSMENT: WorkspaceAssessment = {
  separateChatScreen: true,
  separateMapScreen: true,
  contextPanelExists: true,
  worldStateEngineExists: true,
  objectClickOpensPage: true,
  verdict: "still_page_based",
  evidence:
    "W3 shipped World State (lib/world-state/world-state.ts, mounted by components/app/world-state/world-state-provider.tsx) and the Context Panel (components/app/world-state/context-panel.tsx), and selecting an opportunity in the workspace opens the panel instead of navigating. Still page-based overall: /dashboard/market-map remains a separate map surface (W6), and the per-domain detail pages /dashboard/people/[workerId] and /dashboard/projects/[id] still exist and still navigate, because only the `job` entity type has a registered resolver so far.",
};
