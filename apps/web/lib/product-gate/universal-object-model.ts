/**
 * UNIVERSAL OBJECT MODEL + the four pillars.
 *
 * Owner text, locked 2026-07-28: `docs/product/PRODUCT_UNIVERSE_LOCK_V2.md`
 * (the HIGHEST product authority — supersedes PRODUCT_VISION_LOCK_V1, which
 * remains valid as the element-level detail underneath the four pillars).
 *
 * THE ARCHITECTURAL RULE THIS ENCODES, in the owner's words:
 *
 *   "Naujas objektų tipas turi būti registruojamas, o ne reikalauti Map
 *    perprojektavimo. Jeigu naujo objekto įdiegimui reikia keisti pačią World
 *    Map architektūrą, architektūra laikoma neteisinga."
 *
 * That is a testable property, not a slogan — see `MAP_ARCHITECTURE_FILES` and
 * the `map_architecture_change` rule in the Product Gate.
 *
 * Pure data. No IO.
 */

// ═══════════════════════════════════════════════════════════════════════════
// 1. The four pillars — everything else is an extension of these
// ═══════════════════════════════════════════════════════════════════════════

export type PillarId = "ai_conversation" | "avatar" | "world_map" | "work_journal";

export interface Pillar {
  readonly id: PillarId;
  readonly name: string;
  readonly definition: string;
  /** The V1 world elements that live UNDER this pillar (nothing was removed). */
  readonly elements: readonly string[];
}

export const PILLARS: readonly Pillar[] = [
  {
    id: "ai_conversation",
    name: "AI Conversation",
    definition:
      "One AI. One conversation. The AI is the main operator; every action is initiated through the conversation.",
    elements: ["ai_conversation", "communication"],
  },
  {
    id: "avatar",
    name: "Avatar",
    definition:
      "Not a picture — an active participant of the world, with a position, history, journal, skills, reputation, teams, organizations, projects, states and available actions. Every user action is performed in the avatar's name.",
    elements: ["user_avatar", "skills", "reputation", "documents", "teams", "organizations"],
  },
  {
    id: "world_map",
    name: "World Map",
    definition:
      "Not a job-search page, not a navigation screen, not a module — the primary view of the entire labour-market world. All objects exist in ONE shared space.",
    elements: ["market_world_map", "objects", "projects"],
  },
  {
    id: "work_journal",
    name: "Work Journal",
    definition:
      "The primary source of professional history. Skills, experience, reputation, recommendations and achievements are all formed from it.",
    elements: ["work_journal"],
  },
] as const;

export function pillar(id: string): Pillar | null {
  return PILLARS.find((p) => p.id === id) ?? null;
}

export function pillarIds(): readonly string[] {
  return PILLARS.map((p) => p.id);
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. The Universal Object Model — what EVERY world object inherits
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The eighteen properties every world object must have. This is a CONTRACT the
 * object registry must satisfy — not a table definition, and not a type union.
 */
export const UNIVERSAL_OBJECT_PROPERTIES = [
  "object_id",
  "object_type",
  "location",
  "geometry",
  "status",
  "history",
  "relationships",
  "permissions",
  "events",
  "documents",
  "media",
  "timeline",
  "metadata",
  "actions",
  "visibility",
  "tags",
  "custom_extensions",
] as const;

export type UniversalObjectProperty = (typeof UNIVERSAL_OBJECT_PROPERTIES)[number];

/**
 * Object types the owner named as EXAMPLES. This list is deliberately not a
 * closed union and not a constraint: "Sistema privalo būti pasirengusi priimti
 * neribotą objektų tipų skaičių."
 *
 * A new type is REGISTERED — adding one here (or in the future runtime
 * registry) must never require touching map architecture.
 */
export const EXAMPLE_OBJECT_TYPES = [
  "avatar",
  "company",
  "construction_site",
  "factory",
  "warehouse",
  "office",
  "project",
  "job",
  "training",
  "event",
  "league",
  "partner",
  "vehicle",
  "meeting_point",
  "ai_agent",
  "temporary_zone",
] as const;

/** A world object may do all of these — the world is alive, not static. */
export const LIVE_WORLD_CAPABILITIES = [
  "appear",
  "disappear",
  "change_state",
  "move",
  "communicate",
  "invite",
  "accept",
  "perform_actions",
  "accumulate_history",
] as const;

// ═══════════════════════════════════════════════════════════════════════════
// 3. The map-as-platform rule (machine-checkable)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Files that ARE the World Map's architecture. If adding an object type
 * requires editing one of these, the architecture is — by the owner's
 * definition — wrong, and the Product Gate says so.
 */
export const MAP_ARCHITECTURE_FILES = [
  "apps/web/lib/market-map/spatial-entities.ts",
  "apps/web/components/app/market-map-entity-layers.tsx",
  "apps/web/components/app/market-map-base.tsx",
] as const;

/**
 * Today's map model, assessed against the platform rule.
 *
 * VERIFIED 2026-07-28 by reading `lib/market-map/spatial-entities.ts`:
 *   - `SPATIAL_ENTITY_KINDS` is a CLOSED 3-value union
 *     (person_presence, company_territory, project_location);
 *   - `SpatialRenderContract` is a closed 3-value union, bound 1:1 to those
 *     kinds ("The three kinds NEVER share a rendering contract");
 *   - `i18nKey` is a closed union of the same three.
 *
 * Consequence: adding a construction site, a training event or a vehicle today
 * requires editing the map's own type unions and render contract. That is
 * exactly the state the owner declares incorrect. It is recorded here — and
 * NOT changed by this slice, which migrates nothing.
 */
export interface MapPlatformAssessment {
  readonly typeRegistryIsOpen: boolean;
  readonly renderContractIsData: boolean;
  readonly newTypeNeedsMapEdit: boolean;
  readonly currentKindCount: number;
  readonly verdict: "platform" | "not_yet_a_platform";
  readonly evidence: string;
}

export const MAP_PLATFORM_ASSESSMENT: MapPlatformAssessment = {
  typeRegistryIsOpen: false,
  renderContractIsData: false,
  newTypeNeedsMapEdit: true,
  currentKindCount: 3,
  verdict: "not_yet_a_platform",
  evidence:
    "lib/market-map/spatial-entities.ts: SPATIAL_ENTITY_KINDS and SpatialRenderContract are closed unions bound 1:1; a fourth object type cannot be added without editing them.",
};

// ═══════════════════════════════════════════════════════════════════════════
// 4. The nine mandatory PR answers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The owner's rule: "Jeigu bent vienas atsakymas yra 'ne' arba 'nežinoma', PR
 * stabdomas žmogaus peržiūrai." The three boolean answers are therefore
 * blocking when false — not advisory.
 */
export const MANDATORY_UNIVERSE_QUESTIONS = [
  { field: "pillar", question: "Which of the four pillars does it extend?", blocking: true },
  { field: "objectType", question: "Which world object type does it use?", blocking: true },
  { field: "registeredInObjectModel", question: "Is the object registered in the Universal Object Model?", blocking: true },
  { field: "mapEffect", question: "Is it shown on the World Map?", blocking: false },
  { field: "hasTimeline", question: "Does it have a Timeline?", blocking: true },
  { field: "hasHistory", question: "Does it have History?", blocking: true },
  { field: "avatarEffect", question: "Does it change the Avatar's state?", blocking: false },
  { field: "journalRelation", question: "Does it leave a Work Journal record?", blocking: false },
  { field: "addableWithoutMapChange", question: "Can it be added WITHOUT changing World Map architecture?", blocking: true },
] as const;

export type UniverseAnswerProblem =
  | "unknown_pillar"
  | "unanswered_universe_question"
  | "not_registered_object_type"
  | "requires_map_architecture_change";

export interface UniverseAnswers {
  readonly pillar: string;
  readonly objectType: string;
  readonly registeredInObjectModel: boolean;
  readonly hasTimeline: boolean;
  readonly hasHistory: boolean;
  readonly addableWithoutMapChange: boolean;
}

/**
 * Validate the nine answers for one surface. A `false` on a blocking question
 * is a stop, not a note — the PR goes to human review.
 */
export function validateUniverseAnswers(
  id: string,
  a: UniverseAnswers,
): readonly { id: string; code: UniverseAnswerProblem; detail: string }[] {
  const out: { id: string; code: UniverseAnswerProblem; detail: string }[] = [];
  if (!pillarIds().includes(a.pillar)) {
    out.push({
      id,
      code: "unknown_pillar",
      detail: `"${a.pillar}" is not one of the four pillars — everything is an extension of exactly these`,
    });
  }
  if (a.objectType.trim().length < 2) {
    out.push({
      id,
      code: "unanswered_universe_question",
      detail: "objectType is unanswered — every surface acts on a world object type",
    });
  }
  if (!a.registeredInObjectModel) {
    out.push({
      id,
      code: "not_registered_object_type",
      detail:
        "the object type is not registered in the Universal Object Model — types are registered, never hardcoded in logic",
    });
  }
  if (!a.hasTimeline || !a.hasHistory) {
    out.push({
      id,
      code: "unanswered_universe_question",
      detail:
        "every world object must have a Timeline and History — a world object without history cannot accumulate one",
    });
  }
  if (!a.addableWithoutMapChange) {
    out.push({
      id,
      code: "requires_map_architecture_change",
      detail:
        "adding this requires changing World Map architecture — by the owner's definition the architecture is then wrong, and this PR stops for human review",
    });
  }
  return out;
}
