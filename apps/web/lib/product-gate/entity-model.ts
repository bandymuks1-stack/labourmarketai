/**
 * UNIFIED WORLD MODEL — Entity is the only base thing in the world.
 *
 * Owner text, locked 2026-07-28: `docs/product/UNIFIED_WORLD_MODEL_V1.md`.
 *
 * THE CORE PRINCIPLE:
 *   "Visas Labourmarket.ai pasaulis sudarytas iš Entity. Entity yra vienintelė
 *    bazinė pasaulio esybė. Nė vienas būsimas modulis negali kurti naujos
 *    bazinės esybės. Keičiasi tik Entity Type."
 *
 * Roles are NOT entities. Relationships are NOT tables. Adding an entity type,
 * a role or a relationship must be a REGISTRATION, never an architecture change.
 *
 * This file defines the CONTRACT. It changes no database, no table, no UI and
 * no API — the owner was explicit, and the guard asserts it.
 *
 * Pure data + pure functions. No IO.
 */

// ═══════════════════════════════════════════════════════════════════════════
// 1. Entity types — a registry, never a closed union
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The minimum the system must support. This is a REGISTRY: a new type is
 * registered, and `EntityType` deliberately stays open (`string & {}`) so a
 * future type needs no edit here either.
 */
export const ENTITY_TYPES = [
  "avatar",
  "person",
  "organization",
  "project",
  "job",
  "object",
  "worksite",
  "vehicle",
  "document",
  "training",
  "event",
  "ai_agent",
  "league",
  "partner",
  "client",
  "team",
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number] | (string & {});

// ═══════════════════════════════════════════════════════════════════════════
// 2. The common entity model — every entity has these
// ═══════════════════════════════════════════════════════════════════════════

/** Minimum attributes every Entity carries. Everything else is an extension. */
export const COMMON_ENTITY_ATTRIBUTES = [
  "entity_id",
  "entity_type",
  "name",
  "status",
  "location",
  "timeline",
  "history",
  "relationships",
  "permissions",
  "owner",
  "metadata",
  "tags",
  "documents",
  "media",
  "actions",
  "visibility",
  "extensions",
] as const;

export type CommonEntityAttribute = (typeof COMMON_ENTITY_ATTRIBUTES)[number];

// ═══════════════════════════════════════════════════════════════════════════
// 3. Roles — dynamic assignments, not types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * "Roles nėra Entity. Roles nėra Organization Type. Roles nėra Person Type.
 *  Roles yra dinaminiai priskyrimai."
 *
 * The same person may be candidate AND employee AND team leader at once; the
 * same organization employer AND client AND training provider.
 */
export const PERSON_ROLES = [
  "candidate",
  "employee",
  "team_leader",
  "client",
  "owner",
  "trainer",
  "partner",
] as const;

export const ORGANIZATION_ROLES_UNIFIED = [
  "employer",
  "workforce_provider",
  "client",
  "training_provider",
  "partner",
  "logistics_provider",
  "payroll_provider",
  "verification_provider",
] as const;

export type EntityRole = string;

export interface RoleAssignment {
  readonly entityId: string;
  readonly roles: readonly EntityRole[];
}

/** A role assignment is dynamic: many roles, at the same time, no type column. */
export function isMultiRole(a: RoleAssignment): boolean {
  return a.roles.length > 1;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Relationships — the world is built from these, not from tables
// ═══════════════════════════════════════════════════════════════════════════

/**
 * "Pasaulis statomas ne lentelėmis, o ryšiais tarp Entity."
 * The predicates the owner named. Open by design — a future predicate is
 * registered, never migrated.
 */
export const RELATIONSHIP_PREDICATES = [
  "works_on",
  "employs",
  "owns",
  "located_at",
  "represents",
  "recommends",
] as const;

export type RelationshipPredicate = (typeof RELATIONSHIP_PREDICATES)[number] | (string & {});

export interface EntityRelationship {
  readonly from: { readonly type: EntityType; readonly id: string };
  readonly predicate: RelationshipPredicate;
  readonly to: { readonly type: EntityType; readonly id: string };
}

/** The owner's worked examples, kept so the shape is never re-invented. */
export const RELATIONSHIP_EXAMPLES: readonly {
  from: EntityType;
  predicate: RelationshipPredicate;
  to: EntityType;
}[] = [
  { from: "person", predicate: "works_on", to: "project" },
  { from: "organization", predicate: "employs", to: "person" },
  { from: "organization", predicate: "owns", to: "project" },
  { from: "project", predicate: "located_at", to: "object" },
  { from: "avatar", predicate: "represents", to: "person" },
  { from: "ai_agent", predicate: "recommends", to: "job" },
] as const;

// ═══════════════════════════════════════════════════════════════════════════
// 5. World State — what it holds
// ═══════════════════════════════════════════════════════════════════════════

/** The owner's list, verbatim in structure. The AI changes only this. */
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

// ═══════════════════════════════════════════════════════════════════════════
// 6. The seven mandatory answers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * "Jeigu atsakymas yra 'ne', architektūra laikoma neteisinga."
 * Every one is therefore blocking.
 */
export const MANDATORY_ENTITY_QUESTIONS = [
  { field: "usesEntity", question: "Does it use Entity?" },
  { field: "needsNewEntityType", question: "Does it need a new Entity Type?", invert: true },
  { field: "registrationIsEnough", question: "Is registering the new type enough?" },
  { field: "createsNewRole", question: "Does it create a new Role?", invert: true },
  { field: "createsNewRelationship", question: "Does it create a new Relationship?", invert: true },
  { field: "mapSupportsAutomatically", question: "Is the new type automatically supported by World Map?" },
  { field: "aiCanWorkWithIt", question: "Can the AI work with this Entity?" },
] as const;

export interface EntityAnswers {
  readonly usesEntity: boolean;
  /** A new type is FINE — as long as registering it is enough. */
  readonly needsNewEntityType: boolean;
  readonly registrationIsEnough: boolean;
  readonly createsNewRole: boolean;
  readonly createsNewRelationship: boolean;
  readonly mapSupportsAutomatically: boolean;
  readonly aiCanWorkWithIt: boolean;
}

export type EntityProblem =
  | "not_entity_based"
  | "new_base_entity"
  | "registration_not_enough"
  | "map_does_not_support_type"
  | "ai_cannot_work_with_entity";

/**
 * Validate the seven answers.
 *
 * Note the asymmetry the owner's wording implies: needing a NEW TYPE, a NEW
 * ROLE or a NEW RELATIONSHIP is perfectly fine — the world is meant to grow
 * that way. What is NOT fine is needing an architecture change to add them.
 * So `registrationIsEnough` is the question that actually decides.
 */
export function validateEntityAnswers(
  id: string,
  a: EntityAnswers,
): readonly { id: string; code: EntityProblem; detail: string }[] {
  const out: { id: string; code: EntityProblem; detail: string }[] = [];

  if (!a.usesEntity) {
    out.push({
      id,
      code: "not_entity_based",
      detail:
        "it does not use Entity — Entity is the only base thing in the world, and no module may create a second one",
    });
  }
  if (!a.registrationIsEnough) {
    out.push({
      id,
      code: "registration_not_enough",
      detail:
        "registering the type/role/relationship is NOT enough — an architecture change is required, so the architecture is wrong",
    });
  }
  if (a.needsNewEntityType && !a.mapSupportsAutomatically) {
    out.push({
      id,
      code: "map_does_not_support_type",
      detail:
        "a new entity type that the World Map does not support automatically means the map still knows what things are",
    });
  }
  if (!a.aiCanWorkWithIt) {
    out.push({
      id,
      code: "ai_cannot_work_with_entity",
      detail:
        "the AI cannot work with this Entity — the AI opens an Entity, never a Worker/Company/Project screen",
    });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. Conformance of today's model (recorded, not fixed)
// ═══════════════════════════════════════════════════════════════════════════

export interface EntityConformance {
  readonly baseTables: number;
  readonly entityTableExists: boolean;
  readonly relationshipTableExists: boolean;
  /** A generic predicate registry — `relationship_types` is domain-scoped only. */
  readonly genericRelationshipRegistry: boolean;
  readonly rolesAreDynamic: boolean;
  readonly conceptsSplitAcrossTables: readonly string[];
  readonly precedent: string;
  readonly verdict: "unified" | "table_per_concept";
  readonly evidence: string;
}

/**
 * VERIFIED 2026-07-28 against production.
 */
export const ENTITY_CONFORMANCE: EntityConformance = {
  baseTables: 131,
  entityTableExists: false,
  relationshipTableExists: false,
  genericRelationshipRegistry: false,
  rolesAreDynamic: false,
  conceptsSplitAcrossTables: [
    "person → profiles (31) + workers (31) + candidate_drafts",
    "organization → organizations (9) + companies (6) + agencies (3) + customers",
    "job → job_demands + marketplace_listings + service_offerings",
    "document → worker_documents + customer_request_attachments + conversation_message_attachments + journal_entry_photos",
  ],
  precedent:
    "organizations already unified companies+agencies (6+3=9) and keeps legacy_company_id / legacy_agency_id — the Entity migration pattern is already proven in this codebase.",
  verdict: "table_per_concept",
  evidence:
    "131 base tables; no entity table, no relationship table; relationship_types holds employment relationship kinds (owner/employee/manager/...) scoped to engagement_contexts, not a generic predicate registry; roles live in typed columns (organization_type, profile_roles).",
};
