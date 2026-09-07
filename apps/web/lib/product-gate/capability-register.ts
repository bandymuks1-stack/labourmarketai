/**
 * CAPABILITY REGISTER — the EXECUTABLE half of `docs/CAPABILITY_INVENTORY.md` §6.
 *
 * WHY THIS FILE EXISTS. §6 was written on 2026-09-07 as the product's
 * anti-forgetting mechanism, and it was documentation only. Documentation does
 * not fail CI. The reconciliation that produced §6 measured the cost of that
 * exactly: sixteen migrations documented as "not applied" were applied, a code
 * comment claimed zero AI runs while production held 47, and
 * `lib/journal/work-verification-state.ts` shipped with the full model and zero
 * consumers — a capability that existed, was tested, and could not be reached
 * by a single human being. 803 guard files did not notice, because every one of
 * them asserts something a human already thought to assert.
 *
 * This register is the list of things the product HAS. A guard reads it and
 * checks each claim against the filesystem and the import graph, so that the
 * three failure modes that actually happened cannot happen silently again:
 *
 *   1. a capability is REGISTERED but its implementation is gone
 *      → `anchors` must all exist on disk;
 *   2. a capability is BUILT but nothing CONSUMES it
 *      → a usable capability needs a real non-test importer and a real surface;
 *   3. a capability DISAPPEARS from the product
 *      → ids are permanent; removal requires an explicit `retired` record, and
 *        every canonical graph node must keep at least one live capability.
 *
 * THIS IS NOT A SECOND INVENTORY. `docs/CAPABILITY_INVENTORY.md` §6 and this
 * file are two halves of one register: the document carries the reasoning, the
 * 2026-09-07 snapshot and the owner queue; this file carries the machine-
 * checkable claims. A capability id in one and not the other is a CI failure
 * (`lib/guards/capability-register.test.ts`).
 *
 * STATUS is the owner's six-value classification (window 10, 2026-09-07).
 * EVIDENCE is the owner's evidence ladder. Neither may be raised without the
 * proof its own definition names — a green unit suite is `TEST_PROVEN`, and
 * `TEST_PROVEN` is not `HUMAN_UI_PROVEN`.
 *
 * Pure data. No IO.
 */

import type { WorldElementId } from "./world-elements";

/**
 * The owner's six-value classification. Every capability is exactly one of
 * these — there is no seventh value and no "mostly done".
 */
export type CapabilityStatus =
  /** A human can reach it and it does its job. */
  | "BUILT_AND_USABLE"
  /** The implementation exists and no product path leads to it. */
  | "BUILT_NOT_CONNECTED"
  /** Works for some actors, inputs, languages or directions only. */
  | "PARTIAL"
  /** Recorded, deliberately not implemented. The architecture keeps its place. */
  | "ARCHITECTURE_ONLY"
  /** Not implemented at any layer. Kept here so it cannot be forgotten. */
  | "MISSING"
  /** Implementation exists but an owner decision, credential or gate stops it. */
  | "BLOCKED";

/**
 * The evidence ladder, weakest to strongest. `strongestEvidence` records the
 * strongest level ACTUALLY REACHED — never the level the work deserves.
 */
export type EvidenceLevel =
  | "NONE"
  /** The code exists and was read. */
  | "CODE_PROVEN"
  /** A test exercises it. Says nothing about production. */
  | "TEST_PROVEN"
  /** An RPC/function was executed against production. */
  | "PRODUCTION_RPC_PROVEN"
  /** Production data flowed through the real read path. */
  | "PRODUCTION_DATA_PATH_PROVEN"
  /** A write reached production storage and was read back. */
  | "PRODUCTION_PERSISTENCE_PROVEN"
  /** A human drove it in a browser and the side effects were checked. */
  | "HUMAN_UI_PROVEN";

export const EVIDENCE_ORDER: readonly EvidenceLevel[] = [
  "NONE",
  "CODE_PROVEN",
  "TEST_PROVEN",
  "PRODUCTION_RPC_PROVEN",
  "PRODUCTION_DATA_PATH_PROVEN",
  "PRODUCTION_PERSISTENCE_PROVEN",
  "HUMAN_UI_PROVEN",
];

/** The twelve register domains — §6.2's headings A..L, in order. */
export type CapabilityDomain =
  | "person"
  | "skills"
  | "organization"
  | "work_execution"
  | "evidence"
  | "demand_supply"
  | "time_capacity"
  | "marketplace"
  | "communication"
  | "map_intelligence"
  | "education"
  | "platform";

export interface CapabilityRow {
  /** Permanent id. §6's id. Never reused, never renumbered, never deleted. */
  readonly id: string;
  readonly domain: CapabilityDomain;
  /** Must match the capability's name in `docs/CAPABILITY_INVENTORY.md` §6. */
  readonly title: string;
  /** Which world element this capability extends (PRODUCT_VISION_LOCK_V1). */
  readonly worldElement: WorldElementId;
  readonly status: CapabilityStatus;
  readonly strongestEvidence: EvidenceLevel;
  /**
   * Repo-relative paths (from `apps/web/`) that carry the implementation.
   * Every one must exist while the status is anything but `MISSING`.
   * `MISSING` capabilities carry none — that is what makes them checkable.
   */
  readonly anchors: readonly string[];
  /**
   * The module a human path must actually import. A `BUILT_AND_USABLE` or
   * `PARTIAL` capability whose core module has no non-test importer outside
   * its own directory is `BUILT_NOT_CONNECTED` and the register is lying.
   */
  readonly coreModule: string | null;
  /**
   * A surface a human can reach (route file or component). Required for
   * `BUILT_AND_USABLE`: a capability nobody can open is not usable.
   */
  readonly surfaces: readonly string[];
  /** One sentence of honest current truth. Debt goes here, not in silence. */
  readonly note: string;
  /**
   * HOW a `BUILT_NOT_CONNECTED` capability is disconnected. Required for that
   * status, because "nothing leads to it" is not one claim but several, and
   * they are checked in different ways:
   *
   *   `no_importer`   no module imports it — the import graph proves this, and
   *                   the guard checks it against the real graph;
   *   `no_navigation` reachable in code and in the URL bar, and no surface
   *                   links to it — the guard checks that no `href` exists;
   *   `orphan_route`  a route with zero inbound links of any kind;
   *   `no_writer`     readable, and nothing a human can reach creates the data;
   *   `inert_bridge`  the code runs and the data it links to does not exist.
   *
   * Conflating these is itself the SEP-8 collapse: reachable, visible and
   * actionable are different properties, and a claim that does not say WHICH
   * one is missing cannot be falsified — so it rots.
   */
  readonly disconnectedBecause?:
    | "no_importer"
    | "no_navigation"
    | "orphan_route"
    | "no_writer"
    | "inert_bridge";
  /**
   * True when the USER of this capability is the repository or CI, not a
   * person — governance, gates, registers. The surface and reachability rules
   * do not apply, because there is no surface to reach. Nothing else may set
   * it: an `internal` product capability is a contradiction.
   */
  readonly internal?: true;
  /** Set when an owner decision — not engineering — is what is missing. */
  readonly ownerDecision?: string;
  /** True only for `ARCHITECTURE_ONLY` that is a deliberate postponement. */
  readonly deferredByDesign?: true;
  /**
   * A capability is removed from the PRODUCT by recording its retirement here,
   * never by deleting the row. The row survives so the next agent can see that
   * the product once did this and why it stopped.
   */
  readonly retired?: { readonly on: string; readonly why: string };
}

// ── A. PERSON ───────────────────────────────────────────────────────────────

const PERSON: readonly CapabilityRow[] = [
  {
    id: "PER-1",
    domain: "person",
    title: "Account, auth, onboarding, locale",
    worldElement: "user_avatar",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "HUMAN_UI_PROVEN",
    anchors: ["lib/auth/session-profile.ts", "lib/onboarding"],
    coreModule: "lib/auth/session-profile.ts",
    surfaces: ["app/[locale]/auth", "app/[locale]/dashboard/page.tsx"],
    note: "Google OAuth + password; email confirmation gate verified 2026-09-02.",
  },
  {
    id: "PER-2",
    domain: "person",
    title: "Professional profile + owner narrative",
    worldElement: "user_avatar",
    status: "PARTIAL",
    strongestEvidence: "HUMAN_UI_PROVEN",
    anchors: ["lib/profile", "lib/worker"],
    coreModule: "lib/worker/work-card-core.ts",
    surfaces: ["app/[locale]/dashboard/profile/page.tsx"],
    note: "`workers.headline` and `workers.bio` still have no person-facing editor.",
  },
  {
    id: "PER-3",
    domain: "person",
    title: "Work card (availability, pay, locations)",
    worldElement: "user_avatar",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "HUMAN_UI_PROVEN",
    anchors: ["lib/worker/work-card-core.ts"],
    coreModule: "lib/worker/work-card-core.ts",
    surfaces: ["components/app/conversation"],
    note: "Editor mounts inside the chat workspace, not on /dashboard/profile.",
  },
  {
    id: "PER-4",
    domain: "person",
    title: "CV import (PDF/DOCX) → confirm-each-fact",
    worldElement: "user_avatar",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "HUMAN_UI_PROVEN",
    anchors: ["lib/cv", "app/api/cv"],
    coreModule: "lib/cv/extract.ts",
    surfaces: ["app/[locale]/dashboard/profile/page.tsx"],
    note: "Extraction is a proposal; every fact is confirmed by the person (A-05).",
  },
  {
    id: "PER-5",
    domain: "person",
    title: "Living CV / player card / EU format export",
    worldElement: "user_avatar",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "HUMAN_UI_PROVEN",
    anchors: ["lib/player-card", "lib/cv-export"],
    coreModule: "lib/player-card/player-card.ts",
    surfaces: ["app/[locale]/cv"],
    note: "/cv is absent from the primary-route smoke set.",
  },
  {
    id: "PER-6",
    domain: "person",
    title: "Work history (employment)",
    worldElement: "user_avatar",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "PRODUCTION_PERSISTENCE_PROVEN",
    anchors: ["lib/player-card/work-history-model.ts"],
    coreModule: "lib/player-card/work-history-model.ts",
    surfaces: ["app/[locale]/dashboard/profile/page.tsx"],
    note: "`engagement_contexts` + `save_self_declared_work_history_v1`.",
  },
  {
    id: "PER-7",
    domain: "person",
    title: "Practice / volunteering history",
    worldElement: "user_avatar",
    status: "PARTIAL",
    strongestEvidence: "PRODUCTION_DATA_PATH_PROVEN",
    anchors: ["lib/player-card/work-history-model.ts"],
    coreModule: "lib/player-card/work-history-model.ts",
    surfaces: ["app/[locale]/dashboard/profile/page.tsx"],
    note: "RPC accepts student/volunteer since 2026-08-27; the profile read filtered them out — fix is in the open evidence-import PR, not on main.",
  },
  {
    id: "PER-8",
    domain: "person",
    title: "Education records",
    worldElement: "user_avatar",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "PRODUCTION_DATA_PATH_PROVEN",
    anchors: ["lib/education"],
    coreModule: "lib/worker/worker-education-model.ts",
    surfaces: ["app/[locale]/dashboard/profile/page.tsx"],
    note: "Applied; an in-code comment still says DRAFT (§6.0 rule 1).",
  },
  {
    id: "PER-9",
    domain: "person",
    title: "Achievements / declared certificates",
    worldElement: "documents",
    status: "PARTIAL",
    strongestEvidence: "CODE_PROVEN",
    anchors: ["lib/worker"],
    coreModule: null,
    surfaces: ["app/[locale]/dashboard/profile/page.tsx"],
    note: "`confirmed_by_manager` has no write path, so it is permanently false.",
  },
  {
    id: "PER-10",
    domain: "person",
    title: "Languages",
    worldElement: "user_avatar",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "PRODUCTION_DATA_PATH_PROVEN",
    anchors: ["lib/worker/worker-languages-model.ts"],
    coreModule: null,
    surfaces: ["app/[locale]/dashboard/profile/page.tsx"],
    note: "No `verified` concept — a declared language stays declared (A-05).",
  },
  {
    id: "PER-11",
    domain: "person",
    title: "External profile links",
    worldElement: "user_avatar",
    status: "BLOCKED",
    strongestEvidence: "CODE_PROVEN",
    anchors: ["lib/worker/external-profiles.ts"],
    coreModule: "lib/worker/external-profiles.ts",
    surfaces: ["app/[locale]/dashboard/profile/page.tsx"],
    note: "`20260713210000_multi_source_talent_v1` never applied; the UI ships an honest 'not enabled yet'.",
    ownerDecision:
      "Apply a split external_profiles_v1 carrying only the one table its live UI needs, or retire the section (§6.4 item 4).",
  },
  {
    id: "PER-12",
    domain: "person",
    title: "Privacy: consent, disclosure ledger, export, deletion",
    worldElement: "user_avatar",
    status: "PARTIAL",
    strongestEvidence: "PRODUCTION_DATA_PATH_PROVEN",
    anchors: ["lib/privacy"],
    coreModule: "lib/privacy/export-data.ts",
    surfaces: ["app/[locale]/dashboard/account"],
    note: "GDPR export covers 6 relations; ~14 personal relations are not in it.",
  },
  {
    id: "PER-13",
    domain: "person",
    title: "Requirement ledger (what is missing for a role)",
    worldElement: "skills",
    status: "PARTIAL",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/player-card/requirement-ledger.ts"],
    coreModule: "lib/player-card/requirement-ledger.ts",
    surfaces: ["app/[locale]/dashboard/projects"],
    note: "Built for three contexts, mounted for one (`project`).",
  },
];

// ── B. SKILLS · COMPETENCY · QUALIFICATION ──────────────────────────────────

const SKILLS: readonly CapabilityRow[] = [
  {
    id: "SKL-1",
    domain: "skills",
    title: "Skill catalogue + professions",
    worldElement: "skills",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "HUMAN_UI_PROVEN",
    anchors: ["lib/skills", "lib/taxonomy"],
    coreModule: "lib/skills.ts",
    surfaces: ["app/[locale]/dashboard/profile/page.tsx"],
    note: "161 skills across 49 professions, 12 languages.",
  },
  {
    id: "SKL-2",
    domain: "skills",
    title: "Deterministic recognition (journal → skill)",
    worldElement: "skills",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "HUMAN_UI_PROVEN",
    anchors: ["lib/structuring"],
    coreModule: "lib/structuring/extract-journal-suggestions.ts",
    surfaces: ["components/app/conversation"],
    note: "No AI required — the recognition path is deterministic (I-7).",
  },
  {
    id: "SKL-3",
    domain: "skills",
    title: "Evidence tier ladder",
    worldElement: "reputation",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "HUMAN_UI_PROVEN",
    anchors: ["lib/evidence"],
    coreModule: "lib/evidence/evidence-tier.ts",
    surfaces: ["app/[locale]/dashboard/profile/page.tsx"],
    note: "Self-confirmation must never read as employer confirmation (EVID-2).",
  },
  {
    id: "SKL-4",
    domain: "skills",
    title: "Free-label skill claims",
    worldElement: "skills",
    status: "PARTIAL",
    strongestEvidence: "PRODUCTION_DATA_PATH_PROVEN",
    anchors: ["lib/skills"],
    coreModule: null,
    surfaces: ["app/[locale]/dashboard/profile/page.tsx"],
    note: "Two live stores plus `candidate_skills` frozen at 0 rows — duplicated truth (debt).",
  },
  {
    id: "SKL-5",
    domain: "skills",
    title: "Transversal capabilities (8 slugs)",
    worldElement: "skills",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "PRODUCTION_DATA_PATH_PROVEN",
    anchors: ["lib/skills"],
    coreModule: null,
    surfaces: ["app/[locale]/dashboard/profile/page.tsx"],
    note: "Applied 2026-08-27; the education vertical's vocabulary blocker.",
  },
  {
    id: "SKL-6",
    disconnectedBecause: "inert_bridge",
    domain: "skills",
    title: "ESCO taxonomy",
    worldElement: "skills",
    status: "BUILT_NOT_CONNECTED",
    strongestEvidence: "CODE_PROVEN",
    anchors: ["lib/taxonomy"],
    coreModule: null,
    surfaces: [],
    note: "1,045,186 labels sit in production and 0 of 161 platform skills carry an `esco_uri`, so the bridge is inert. The import ran against production; the CAPABILITY has never read a row, which is why the evidence is CODE_PROVEN and not the data-path level the row count would suggest.",
    ownerDecision: "PR #1355 canonical ESCO linkage stays owner-gated.",
  },
  {
    id: "SKL-7",
    domain: "skills",
    title: "Documents / credential validity",
    worldElement: "documents",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/documents"],
    coreModule: "lib/documents/readiness.ts",
    surfaces: ["app/[locale]/dashboard/documents"],
    note: "One download door, versioned, acknowledgement-bound.",
  },
  {
    id: "SKL-8",
    domain: "skills",
    title: "Country requirement matrix",
    worldElement: "documents",
    status: "PARTIAL",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/country-readiness"],
    coreModule: "lib/country-readiness/requirements.ts",
    surfaces: ["app/[locale]/dashboard/documents"],
    note: "`country_document_requirements` is empty; the matrix lives in code, with no route of its own.",
  },
  {
    id: "SKL-9",
    domain: "skills",
    title: "Qualification recognition / RPL / equivalence",
    worldElement: "skills",
    status: "MISSING",
    strongestEvidence: "NONE",
    anchors: [],
    coreModule: null,
    surfaces: [],
    note: "Nothing at any layer. Demonstrated capability must never silently satisfy a formal requirement — see SEP-6.",
  },
  {
    id: "SKL-10",
    domain: "skills",
    title: "Training & certification register",
    worldElement: "skills",
    status: "PARTIAL",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/training"],
    coreModule: "lib/training/training-model.ts",
    surfaces: ["app/[locale]/dashboard/company"],
    note: "Applied, 0 rows; writes nothing into the skill ladder, by decision.",
  },
];

// ── C. ORGANIZATION · WORKSPACE · AUTHORITY ─────────────────────────────────

const ORGANIZATION: readonly CapabilityRow[] = [
  {
    id: "ORG-1",
    domain: "organization",
    title: "Organization creation + identity + verification",
    worldElement: "organizations",
    status: "PARTIAL",
    strongestEvidence: "PRODUCTION_PERSISTENCE_PROVEN",
    anchors: ["lib/organizations", "lib/company"],
    coreModule: "lib/company/active-organization.ts",
    surfaces: ["app/[locale]/dashboard/company"],
    note: "Identity is split across `companies` (write) and `organizations` (read, mirrored).",
  },
  {
    id: "ORG-2",
    domain: "organization",
    title: "Multi-capability organization",
    worldElement: "organizations",
    status: "BLOCKED",
    strongestEvidence: "PRODUCTION_DATA_PATH_PROVEN",
    anchors: ["lib/product-gate/organization-roles.ts"],
    coreModule: "lib/product-gate/organization-roles.ts",
    surfaces: ["app/[locale]/dashboard/company"],
    note: "`organization_roles` is live, and `companies.company_type='staffing_agency'` still hard-gates seven agency features.",
    ownerDecision:
      "Migrate the seven gates to organization_roles, or keep the industry lock deliberately (§6.3 item 5).",
  },
  {
    id: "ORG-3",
    domain: "organization",
    title: "Memberships + invitations + roles",
    worldElement: "organizations",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "PRODUCTION_PERSISTENCE_PROVEN",
    anchors: ["lib/invitations"],
    coreModule: "lib/invitations/model.ts",
    surfaces: ["app/[locale]/dashboard/company"],
    note: "",
  },
  {
    id: "ORG-4",
    domain: "organization",
    title: "Workspace context + switching",
    worldElement: "organizations",
    status: "PARTIAL",
    strongestEvidence: "PRODUCTION_DATA_PATH_PROVEN",
    anchors: ["lib/company/active-organization.ts", "lib/workspace"],
    coreModule: "lib/company/active-organization.ts",
    surfaces: ["components/app"],
    note: "`getActiveOrganizationContext` is owner-only while `getWorkspaceContext` is not.",
  },
  {
    id: "ORG-5",
    domain: "organization",
    title: "Cross-org isolation",
    worldElement: "organizations",
    status: "PARTIAL",
    strongestEvidence: "PRODUCTION_RPC_PROVEN",
    anchors: ["lib/company"],
    coreModule: null,
    surfaces: [],
    note: "Seven authority helpers; an org MANAGER cannot read `company_workers` because `owns_company` excludes managers.",
  },
  {
    id: "ORG-6",
    domain: "organization",
    title: "Roster (employees, historical, agency)",
    worldElement: "organizations",
    status: "PARTIAL",
    strongestEvidence: "PRODUCTION_DATA_PATH_PROVEN",
    anchors: ["lib/engagements"],
    coreModule: null,
    surfaces: ["app/[locale]/dashboard/company"],
    note: "Four parallel roster truths: `engagement_contexts` plus four legacy link tables (debt).",
  },
  {
    id: "ORG-7",
    domain: "organization",
    title: "Candidates / talent pool / scouting",
    worldElement: "organizations",
    status: "PARTIAL",
    strongestEvidence: "PRODUCTION_DATA_PATH_PROVEN",
    anchors: ["lib/candidates", "lib/scouting"],
    coreModule: "lib/candidates/candidate-drafts.ts",
    surfaces: ["app/[locale]/dashboard/candidates"],
    note: "The surface a person actually reaches is `/dashboard/candidates`, linked from the planning zone, the operations board and the setup choice. `/dashboard/talent` is a superadmin sample preview with NO inbound link anywhere — it was named as this row's surface until the navigation guard proved nothing leads there.",
  },
  {
    id: "ORG-8",
    domain: "organization",
    title: "Agency ↔ client bridge",
    worldElement: "organizations",
    status: "PARTIAL",
    strongestEvidence: "PRODUCTION_DATA_PATH_PROVEN",
    anchors: ["lib/agency"],
    coreModule: "lib/agency/clients.ts",
    surfaces: ["app/[locale]/dashboard/company"],
    note: "`agency_client_connections` is live; `agency_clients` is a second, unapplied client model (§6.4 item 1).",
  },
  {
    id: "ORG-9",
    domain: "organization",
    title: "Public organization profile",
    worldElement: "organizations",
    status: "PARTIAL",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["app/[locale]/business"],
    coreModule: null,
    surfaces: ["app/[locale]/business"],
    note: "Per-organization page exists; no index or directory route.",
  },
];

// ── D. WORK EXECUTION ───────────────────────────────────────────────────────

const WORK_EXECUTION: readonly CapabilityRow[] = [
  {
    id: "WRK-1",
    domain: "work_execution",
    title: "Projects",
    worldElement: "projects",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "PRODUCTION_PERSISTENCE_PROVEN",
    anchors: ["lib/projects"],
    coreModule: "lib/projects/create-project-core.ts",
    surfaces: ["app/[locale]/dashboard/projects"],
    note: "`start_date` / `end_date` have no writer — a project has no dates a human set.",
  },
  {
    id: "WRK-2",
    domain: "work_execution",
    title: "Objects / sites",
    worldElement: "objects",
    status: "PARTIAL",
    strongestEvidence: "PRODUCTION_DATA_PATH_PROVEN",
    anchors: ["lib/objects"],
    coreModule: "lib/objects/objects-model.ts",
    surfaces: ["app/[locale]/dashboard/company"],
    note: "One row in production; a section of the company workspace, no route of its own.",
  },
  {
    id: "WRK-3",
    domain: "work_execution",
    title: "Stages",
    worldElement: "projects",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/projects"],
    coreModule: null,
    surfaces: ["app/[locale]/dashboard/projects"],
    note: "",
  },
  {
    id: "WRK-4",
    disconnectedBecause: "no_navigation",
    domain: "work_execution",
    title: "Tasks",
    worldElement: "projects",
    status: "BUILT_NOT_CONNECTED",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/tasks"],
    coreModule: null,
    surfaces: [],
    note: "Its own migration says it is 'reachable, functional and pointless'; `follow_up_tasks` duplicates it.",
  },
  {
    id: "WRK-5",
    domain: "work_execution",
    title: "Worker → project assignment",
    worldElement: "projects",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "PRODUCTION_PERSISTENCE_PROVEN",
    anchors: ["lib/projects"],
    coreModule: null,
    surfaces: ["app/[locale]/dashboard/projects"],
    note: "No overlap constraint of any kind — by design, see SEP-2 (a commitment is not a prohibition).",
  },
  {
    id: "WRK-6",
    domain: "work_execution",
    title: "Team → project assignment",
    worldElement: "teams",
    status: "MISSING",
    strongestEvidence: "NONE",
    anchors: [],
    coreModule: null,
    surfaces: [],
    note: "No FK exists anywhere; teams are `organizations` rows with `organization_type='team'` and 0 of them exist.",
  },
  {
    id: "WRK-7",
    domain: "work_execution",
    title: "Readiness / operational status",
    worldElement: "projects",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/readiness"],
    coreModule: "lib/readiness/worker-readiness.ts",
    surfaces: ["app/[locale]/dashboard/projects"],
    note: "",
  },
  {
    id: "WRK-8",
    disconnectedBecause: "no_navigation",
    domain: "work_execution",
    title: "Defects / corrections",
    worldElement: "projects",
    status: "BUILT_NOT_CONNECTED",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/quality"],
    coreModule: null,
    surfaces: [],
    note: "0 rows; no human path opens it.",
  },
  {
    id: "WRK-9",
    disconnectedBecause: "no_navigation",
    domain: "work_execution",
    title: "Handover passport",
    worldElement: "projects",
    status: "BUILT_NOT_CONNECTED",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/projects"],
    coreModule: null,
    surfaces: [],
    note: "`project_handover_entries` has no reader surface.",
  },
  {
    id: "WRK-10",
    disconnectedBecause: "no_navigation",
    domain: "work_execution",
    title: "Project economics",
    worldElement: "projects",
    status: "BUILT_NOT_CONNECTED",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/economics"],
    coreModule: null,
    surfaces: [],
    note: "`project_budgets` exists with no surface.",
  },
];

// ── E. EVIDENCE · JOURNAL ───────────────────────────────────────────────────

const EVIDENCE: readonly CapabilityRow[] = [
  {
    id: "EVID-0",
    domain: "evidence",
    title: "Work Journal (four transports, one core)",
    worldElement: "work_journal",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "HUMAN_UI_PROVEN",
    anchors: ["lib/journal/journal-write-core.ts", "lib/journal/journal-list-core.ts"],
    coreModule: "lib/journal/journal-write-core.ts",
    surfaces: ["app/[locale]/dashboard/journal", "components/app/conversation"],
    note: "The product's strongest chain: chat, journal, MCP and the API all reach one core.",
  },
  {
    id: "EVID-1",
    domain: "evidence",
    title: "Organization historical evidence import",
    worldElement: "work_journal",
    status: "BLOCKED",
    strongestEvidence: "CODE_PROVEN",
    anchors: [
      "lib/organization-evidence/import-core.ts",
      "lib/organization-evidence/evidence-state.ts",
      "lib/organization-evidence/competency-signals.ts",
    ],
    coreModule: "lib/organization-evidence/import-core.ts",
    surfaces: ["app/[locale]/dashboard/profile", "components/app/evidence-import-section.tsx"],
    note:
      "BLOCKED ON PRODUCTION BY AN RLS RECURSION - and the earlier entry here claiming PRODUCTION_DATA_PATH_PROVEN was WRONG. Applied 2026-09-07 (ledger 20260907180944), then measured again more thoroughly on the same day: FOUR of the eight tables cannot be read at all. Every SELECT on organization_evidence_records, organization_evidence_parties, organization_evidence_events and organization_evidence_competency_signals fails 42P17 'infinite recursion detected in policy'. organization_evidence_records_select subqueries organization_evidence_parties, and organization_evidence_parties_select subqueries organization_evidence_records - a mutual cycle. This takes the import DOWN, not merely degrades it: commitImport ends in .select('id, import_row_id'), and an INSERT ... RETURNING needs the SELECT policy, so the write dies too. WHY THE FIRST VERIFICATION MISSED IT: it exercised organization_people (which has no cross-table policy and works fine) and then checked that the other tables' policies EXISTED, rather than reading through them. Policy presence is not policy reachability - SEP-8 caught in this register's own evidence. The fix is proven, not guessed: a SECURITY DEFINER resolver breaks the cycle on one side, and with it applied in a rolled-back production transaction the whole chain runs - record INSERT ... RETURNING OK, two competency signals written, an 'ai_inference' method REFUSED 23514, a record DELETE still BLOCKED 42501, and a stranger reading 0 records and 0 signals. It ships as a RED draft; production still carries the defect and all eight tables hold 0 rows.",
    ownerDecision:
      "Apply 20260907220000_evidence_parties_recursion_fix_v1 - the SECURITY DEFINER resolver that breaks the organization_evidence_records <-> organization_evidence_parties policy cycle. Until it is applied the whole import is 42P17 on production, read AND write.",
  },
  {
    id: "EVID-2",
    domain: "evidence",
    title: "Manager review / receive loop",
    worldElement: "work_journal",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "HUMAN_UI_PROVEN",
    anchors: ["lib/journal"],
    coreModule: null,
    surfaces: ["app/[locale]/dashboard/journal"],
    note: "13 confirmations in production, 3 of them self-confirmed by one person holding an owner engagement.",
    ownerDecision:
      "Block self-confirmation in review_journal_entry, or rely on the weaker classification (§6.3 item 1).",
  },
  {
    id: "EVID-3",
    domain: "evidence",
    title: "Work verification state (eight states)",
    worldElement: "work_journal",
    status: "PARTIAL",
    strongestEvidence: "PRODUCTION_DATA_PATH_PROVEN",
    anchors: [
      "lib/journal/work-verification-state.ts",
      "lib/journal/verifier-read.ts",
    ],
    coreModule: "lib/journal/work-verification-state.ts",
    surfaces: ["app/[locale]/dashboard/journal", "app/[locale]/dashboard/profile"],
    note:
      "Shipped 2026-09-06 with ZERO consumers, wired 2026-09-07 (#1598). The chain was then MEASURED against production on 2026-09-08 and it holds end to end - no invented verifier anywhere. Of 79 engagement contexts, 56 carry no organization; of 40 journal entries, 22 (55%) sit in one of those and 18 do not. Zero entries have no context at all. Those 22 are exactly the dead-end population, and the model names them rather than hiding them: `contextIsLive` requires an organization, so they resolve to self_reported / verifier none / nextAction identify_verifier - kept as real evidence, never silently devalued and never attached to an invented employer. The route out is real and reachable: the journal renders identify_verifier as a LINK to /dashboard/profile#capabilities, the anchor exists, and a DetailsHashOpener opens that collapsed <details> on arrival, so the person does not land on a closed accordion (the reachability defect class). A read failure stays UNKNOWN and never renders as 'nobody can confirm your work'. PARTIAL only because no human has walked it in a browser; every layer beneath that is proven.",
  },
  {
    id: "EVID-4",
    domain: "evidence",
    title: "Photos / task evidence",
    worldElement: "work_journal",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "PRODUCTION_PERSISTENCE_PROVEN",
    anchors: ["lib/journal"],
    coreModule: null,
    surfaces: ["app/[locale]/dashboard/journal"],
    note: "8 photos in production.",
  },
  {
    id: "EVID-5",
    domain: "evidence",
    title: "Hours: journal metrics · allocations · timesheets",
    worldElement: "work_journal",
    status: "PARTIAL",
    strongestEvidence: "PRODUCTION_DATA_PATH_PROVEN",
    anchors: ["lib/work-hours", "lib/timesheets"],
    coreModule: "lib/work-hours/allocations-model.ts",
    surfaces: ["app/[locale]/dashboard/company"],
    note: "Three stores plus one dead one, reconciled inside ONE SQL function; no TypeScript reader unions them.",
  },
  {
    id: "EVID-6",
    domain: "evidence",
    title: "Experience records + disputes + right of reply",
    worldElement: "reputation",
    status: "PARTIAL",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/evidence", "lib/trust/experience-records.ts"],
    coreModule: "lib/trust/experience-records.ts",
    surfaces: ["components/app/workspace/experiences-result.tsx"],
    note: "The right of reply got a READER on 2026-09-07 — `experience_responses` had shipped with a schema, an RPC, a policy and a form, and no surface had ever rendered a reply, to either side. The reply now shows with its own moderation state, and an unreadable reply says so rather than reading as none. Not yet walked by a human, so the evidence drops to TEST_PROVEN until it is.",
    ownerDecision:
      "The v1 select policy compares an unqualified `moderation_status` inside a subquery over `experience_records`, so it resolves to the RECORD's status and hands the experience author a reply moderation has not published. The surface now withholds it; correcting the policy is a schema change (RED).",
  },
];

// ── F. DEMAND · SUPPLY · MATCHING ───────────────────────────────────────────

const DEMAND_SUPPLY: readonly CapabilityRow[] = [
  {
    id: "DEM-1",
    domain: "demand_supply",
    title: "Canonical demand intake",
    worldElement: "market_world_map",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "HUMAN_UI_PROVEN",
    anchors: ["lib/demand"],
    coreModule: "lib/demand/demand-request.ts",
    surfaces: ["components/app/conversation"],
    note: "`customer_requests` with four kinds is the ONE demand truth; `job_demands` is dead.",
  },
  {
    id: "DEM-2",
    domain: "demand_supply",
    title: "Demand/supply semantic boundary",
    worldElement: "market_world_map",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "PRODUCTION_DATA_PATH_PROVEN",
    anchors: ["lib/demand/market-direction.ts"],
    coreModule: "lib/demand/market-direction.ts",
    surfaces: ["app/[locale]/dashboard/opportunities"],
    note:
      "CLOSED, and the owner gate this entry used to carry was STALE. The database half was applied on 2026-09-06 (ledger 20260906194911 and 20260906202628) and did not need the `kind` column the gate asked for: it fixed the direction inside each function with a closed allow-list, which is the stronger form. Read live from production 2026-09-07, all three board readers now classify by direction in the DATABASE — `list_open_demand_for_workers` and `list_open_demand_for_agencies` both admit only (`kind is null or kind in ('company_request','buyer_request')`), and `list_open_supply_for_employers` only (`kind in ('agency_offer')`). Proven, not inferred: called as a real worker, the board returned 7 demand rows and leaked 0 of the 3 agency_offer supply rows. The `kind is null` branch is deliberate — the pre-`kind` rows from migration 0028 are genuine demand. Every allow-list is closed, so the NEXT kind added defaults to invisible rather than to the wrong board.",
  },
  {
    id: "DEM-3",
    domain: "demand_supply",
    title: "Worker opportunity board + interest",
    worldElement: "market_world_map",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "HUMAN_UI_PROVEN",
    anchors: ["lib/opportunities/interest.ts"],
    coreModule: "lib/opportunities/interest.ts",
    surfaces: ["app/[locale]/dashboard/opportunities"],
    note: "",
  },
  {
    id: "DEM-4",
    domain: "demand_supply",
    title: "External vacancy ingestion",
    worldElement: "market_world_map",
    status: "PARTIAL",
    strongestEvidence: "PRODUCTION_DATA_PATH_PROVEN",
    anchors: ["lib/vacancy-import", "lib/vacancy-store"],
    coreModule: "lib/vacancy-store/vacancy-read.ts",
    surfaces: ["app/[locale]/(marketing)/jobs"],
    note: "77k vacancies live and NO scheduler — ingestion is a manual script or an admin panel action.",
  },
  {
    id: "DEM-5",
    domain: "demand_supply",
    title: "Matching engine (20 criteria, both directions)",
    worldElement: "market_world_map",
    status: "PARTIAL",
    strongestEvidence: "PRODUCTION_DATA_PATH_PROVEN",
    anchors: ["lib/market/match-v1.ts"],
    coreModule: "lib/market/match-v1.ts",
    surfaces: ["app/[locale]/dashboard/opportunities"],
    note: "One frozen fork is still reachable at /match-preview — a second matching truth (debt).",
  },
  {
    id: "DEM-6",
    domain: "demand_supply",
    title: "Team matching",
    worldElement: "teams",
    status: "PARTIAL",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/market/match-team-v1.ts"],
    coreModule: "lib/market/match-team-v1.ts",
    surfaces: ["app/[locale]/dashboard/admin"],
    note: "Admin route only, and no team exists to match (WRK-6). Registered as DISCONNECTED until the reachability guard proved the admin route does reach it.",
  },
  {
    id: "DEM-7",
    domain: "demand_supply",
    title: "Anonymous public need intake",
    worldElement: "market_world_map",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "PRODUCTION_PERSISTENCE_PROVEN",
    anchors: ["lib/requests"],
    coreModule: null,
    surfaces: ["app/[locale]/(marketing)/company-need"],
    note: "Two real intakes in production.",
  },
  {
    id: "DEM-8",
    domain: "demand_supply",
    title: "Saved searches / alerts",
    worldElement: "market_world_map",
    status: "MISSING",
    strongestEvidence: "NONE",
    anchors: [],
    coreModule: null,
    surfaces: [],
    note: "Bookmarks exist; a recurring query that notifies does not.",
  },
  {
    id: "DEM-9",
    domain: "demand_supply",
    title: "Organizational supply discovery (agency capacity → employer)",
    worldElement: "market_world_map",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "PRODUCTION_DATA_PATH_PROVEN",
    anchors: ["lib/supply/employer-supply-discovery.ts"],
    coreModule: "lib/supply/employer-supply-discovery.ts",
    surfaces: [
      "app/[locale]/dashboard/company/scouting",
      "components/app/available-supply-section.tsx",
    ],
    note:
      "Owner-approved and APPLIED 2026-09-07 (ledger 20260907180546), then called on the LIVE function under three real users' auth: a manager of two organizations saw 2 of 2 supply rows, the agency that authored one saw 1 of 2, someone who manages nothing saw 0 with no error, and anon is refused 42501 at the privilege level. The supply side of the market is readable for the first time. PROVEN END TO END on production 2026-09-07, in one bounded transaction that was ROLLED BACK. A real agency manager declared available workforce through the SAME path the product uses - submit_demand_request_v2 with kind agency_offer, then the structured UPDATE - and the row came back kind=agency_offer status=submitted role=scaffolder country=NO team=6 start=this_week. An authorized employer who authored none of it then discovered it through list_open_supply_for_employers WITH ITS FULL SHAPE (rows=1: scaffolder / NO / 6 / this_week), and saw 3 supply rows in total. The supplying agency itself saw 0 of its own. A worker's demand board leaked 0 of the agency_offer rows, so the direction holds: SUPPLY is never served as DEMAND. Zero residue afterwards - still 3 rows, newest still 2026-06-12. This also settles why the three stored rows look shapeless, and it is NOT a defect in the declaration path: they are dated 2026-05-31 to 2026-06-12 and simply PREDATE the structured columns, which company_request rows written as recently as 2026-09-05 do populate. An earlier note in this register blamed demand-drafts.ts for failing to map free text into those columns; that was wrong twice over - drafts are not the submit path, and the submit path works. What remains is adoption, not repair: no agency has declared supply since 2026-06-12, so the three visible rows stay shapeless until someone declares again. Remaining evidence step is a browser walk; every layer beneath it is proven. Do NOT widen the read to project payload - the migration refuses that deliberately, because payload is free text with no closed set.",
  },
];

// ── G. TIME · CAPACITY · BOOKING ────────────────────────────────────────────

const TIME_CAPACITY: readonly CapabilityRow[] = [
  {
    id: "CAL-1",
    domain: "time_capacity",
    title: "Calendar (five views, single projection)",
    worldElement: "projects",
    status: "PARTIAL",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/planning"],
    coreModule: "lib/planning/planning-model.ts",
    surfaces: ["app/[locale]/dashboard/planning"],
    note: "Eight sources reach the projection; ten further dated stores never do.",
  },
  {
    id: "CAL-2",
    domain: "time_capacity",
    title: "Employer calendar",
    worldElement: "organizations",
    status: "PARTIAL",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/planning/employer-availability.ts"],
    coreModule: "lib/planning/employer-availability.ts",
    surfaces: ["app/[locale]/dashboard/company/planning"],
    note: "CORRECTED 2026-09-07: recorded as disconnected on the claim that the employer page never reads the planning projection. It does — `/dashboard/company/planning` reads `getEmployerWorkerAvailability`, which reuses the canonical planning model\'s own date projection, and the absences page and two conversation paths read it too. What it deliberately does NOT read is the full worker agenda: the employer projection omits `note` and `absence_type` at the QUERY, so an employer learns that somebody is unavailable and never why. Whether an employer also needs a month view is a product question, not a broken wire.",
  },
  {
    id: "CAL-3",
    domain: "time_capacity",
    title: "Availability",
    worldElement: "user_avatar",
    status: "PARTIAL",
    strongestEvidence: "PRODUCTION_DATA_PATH_PROVEN",
    anchors: ["lib/worker/work-card-core.ts"],
    coreModule: "lib/worker/work-card-core.ts",
    surfaces: ["components/app/conversation"],
    note: "Four incompatible availability vocabularies, none derived from another (debt).",
  },
  {
    id: "CAL-4",
    domain: "time_capacity",
    title: "Capacity / gap timeline",
    worldElement: "organizations",
    status: "PARTIAL",
    strongestEvidence: "PRODUCTION_DATA_PATH_PROVEN",
    anchors: ["lib/workforce"],
    coreModule: "lib/workforce/capacity-model.ts",
    surfaces: ["app/[locale]/dashboard/company"],
    note: "Read one signal — approved absences, of which production has zero rows — and ignored the bookings and assignments that do exist; the three-state fix is in the open RED PR.",
  },
  {
    id: "CAL-5",
    domain: "time_capacity",
    title: "Absences / leave",
    worldElement: "user_avatar",
    status: "PARTIAL",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/leave"],
    coreModule: "lib/leave/absences-model.ts",
    surfaces: ["app/[locale]/dashboard/planning"],
    note: "0 rows; the privacy-narrowed manager view is correct and deliberate.",
  },
  {
    id: "CAL-6",
    domain: "time_capacity",
    title: "Booking request → accept → engagement",
    worldElement: "organizations",
    status: "PARTIAL",
    strongestEvidence: "PRODUCTION_PERSISTENCE_PROVEN",
    anchors: ["lib/booking"],
    coreModule: "lib/booking/booking-state.ts",
    surfaces: ["app/[locale]/dashboard/bookings"],
    note: "Nothing exists past `accepted`; the expiry RPC has no scheduler.",
  },
  {
    id: "CAL-7",
    domain: "time_capacity",
    title: "Capacity reservation",
    worldElement: "organizations",
    status: "MISSING",
    strongestEvidence: "NONE",
    anchors: [],
    coreModule: null,
    surfaces: [],
    note: "Nothing decrements anything. A reservation must warn, never prohibit (SEP-2).",
  },
  {
    id: "CAL-8",
    domain: "time_capacity",
    title: "Shifts / rotas / rosters",
    worldElement: "organizations",
    status: "MISSING",
    strongestEvidence: "NONE",
    anchors: [],
    coreModule: null,
    surfaces: [],
    note: "'Roster' in this product means the active `company_workers` list, never a schedule (§6.0 rule 3).",
  },
  {
    id: "CAL-9",
    domain: "time_capacity",
    title: "Utilisation / FTE",
    worldElement: "organizations",
    status: "MISSING",
    strongestEvidence: "NONE",
    anchors: [],
    coreModule: null,
    surfaces: [],
    note: "Needs the actual-vs-planned capture that does not exist yet.",
  },
  {
    id: "CAL-10",
    domain: "time_capacity",
    title: "Planned vs actual → learned duration / capacity",
    worldElement: "projects",
    status: "MISSING",
    strongestEvidence: "NONE",
    anchors: [],
    coreModule: null,
    surfaces: [],
    note: "The learning loop of the canonical flywheel. A forecast may never be stored as a fact (SEP-1).",
  },
];

// ── H. MARKETPLACE · COMMERCE ───────────────────────────────────────────────

const MARKETPLACE: readonly CapabilityRow[] = [
  {
    id: "MKT-1",
    domain: "marketplace",
    title: "Service offerings + request loop",
    worldElement: "market_world_map",
    status: "PARTIAL",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/services"],
    coreModule: "lib/services/service-offerings-shared.ts",
    surfaces: ["app/[locale]/dashboard/service-requests"],
    note: "CORRECTED 2026-09-07: the note this row carried — \"no navigation leads to it, a human reaches it only by typing the URL\" — was false. Bookings, the market map, the opportunities board, the services page, the marketplace loop section, the spine signals and the planning zone all link to it. The claim came from the reconciliation\'s prose and was never checked; the navigation guard added with this correction is what would have caught it. What is actually true: the loop is complete and reachable, and the 2026-09-07 snapshot records no service offerings in production, so nothing has been through it.",
  },
  {
    id: "MKT-2",
    disconnectedBecause: "no_navigation",
    domain: "marketplace",
    title: "Physical resource listings",
    worldElement: "objects",
    status: "BUILT_NOT_CONNECTED",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/marketplace"],
    coreModule: null,
    surfaces: [],
    note: "0 rows; no bridge to `assets`.",
  },
  {
    id: "MKT-3",
    domain: "marketplace",
    title: "Assets / tools / equipment",
    worldElement: "objects",
    status: "PARTIAL",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/assets"],
    coreModule: "lib/assets/assets-model.ts",
    surfaces: ["app/[locale]/dashboard/company"],
    note: "`issue_asset_v1` has no availability guard and no lock.",
  },
  {
    id: "MKT-4",
    domain: "marketplace",
    title: "Proposals / contracts / agreements",
    worldElement: "organizations",
    status: "PARTIAL",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/agreements"],
    coreModule: null,
    surfaces: [],
    note: "Three stores, 0 rows; `contracts` is legacy of `agreements` (debt).",
  },
  {
    id: "MKT-5",
    disconnectedBecause: "no_navigation",
    domain: "marketplace",
    title: "Procurement",
    worldElement: "organizations",
    status: "BUILT_NOT_CONNECTED",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/procurement"],
    coreModule: null,
    surfaces: [],
    note: "No route; an anchor only.",
  },
  {
    id: "MKT-6",
    disconnectedBecause: "no_navigation",
    domain: "marketplace",
    title: "Business trips",
    worldElement: "objects",
    status: "BUILT_NOT_CONNECTED",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/trips"],
    coreModule: null,
    surfaces: [],
    note: "Never reaches the calendar.",
  },
  {
    id: "MKT-7",
    domain: "marketplace",
    title: "Billing / plans / entitlements",
    worldElement: "organizations",
    status: "BLOCKED",
    strongestEvidence: "PRODUCTION_RPC_PROVEN",
    anchors: ["lib/billing"],
    coreModule: "lib/billing/entitlements-v1.ts",
    surfaces: ["app/[locale]/(marketing)/pricing"],
    note: "Stripe LIVE keys exist and no payment has ever been taken; zero-money proven via checkout.session.expired.",
    ownerDecision: "Two independent owner acts arm real charging.",
  },
  {
    id: "MKT-8",
    domain: "marketplace",
    title: "LMC credit ledger",
    worldElement: "organizations",
    status: "ARCHITECTURE_ONLY",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/lmc"],
    coreModule: null,
    surfaces: [],
    deferredByDesign: true,
    note: "Five tables and sixteen RPCs live; all six flags are false in code AND in the database. Spend has no reversal — that is the recorded blocker.",
  },
];

// ── I. COMMUNICATION · ATTENTION ────────────────────────────────────────────

const COMMUNICATION: readonly CapabilityRow[] = [
  {
    id: "COM-1",
    domain: "communication",
    title: "Conversations + attachments + unread",
    worldElement: "communication",
    status: "PARTIAL",
    strongestEvidence: "PRODUCTION_PERSISTENCE_PROVEN",
    anchors: ["lib/communication"],
    coreModule: null,
    surfaces: ["app/[locale]/dashboard/inbox"],
    note: "No organization participant type, so `team` threads are always RESTRICTED.",
  },
  {
    id: "COM-2",
    domain: "communication",
    title: "Contact disclosure",
    worldElement: "communication",
    status: "PARTIAL",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/privacy"],
    coreModule: null,
    surfaces: ["app/[locale]/dashboard/inbox"],
    note: "0 rows; the expiry RPC has no caller, so requests never expire.",
  },
  {
    id: "COM-3",
    domain: "communication",
    title: "Notifications (20 types)",
    worldElement: "communication",
    status: "PARTIAL",
    strongestEvidence: "PRODUCTION_DATA_PATH_PROVEN",
    anchors: ["lib/notifications"],
    coreModule: "lib/notifications/spine-signals.ts",
    surfaces: ["components/app"],
    note: "All twenty are emitted; the email channel is inert because no provider is configured.",
  },
  {
    id: "COM-4",
    domain: "communication",
    title: "Weekly digest",
    worldElement: "communication",
    status: "PARTIAL",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/notifications"],
    coreModule: null,
    surfaces: [],
    note: "The only cron in the product; delivery depends on COM-3's inert channel.",
  },
  {
    id: "COM-5",
    domain: "communication",
    title: "Attention / activity centre",
    worldElement: "communication",
    status: "PARTIAL",
    strongestEvidence: "HUMAN_UI_PROVEN",
    anchors: ["lib/notifications/spine-signals.ts"],
    coreModule: "lib/notifications/spine-signals.ts",
    surfaces: ["components/app"],
    note: "Fragmented across four surfaces.",
  },
];

// ── J. MAP · MOBILITY · INTELLIGENCE ────────────────────────────────────────

const MAP_INTELLIGENCE: readonly CapabilityRow[] = [
  {
    id: "GEO-1",
    domain: "map_intelligence",
    title: "Market map / world view",
    worldElement: "market_world_map",
    status: "PARTIAL",
    strongestEvidence: "HUMAN_UI_PROVEN",
    anchors: ["lib/market-map"],
    coreModule: "lib/market-map/signal-model.ts",
    surfaces: ["app/[locale]/dashboard"],
    note: "Owner-scoped only; the cross-user aggregate is deliberately absent.",
  },
  {
    id: "GEO-2",
    domain: "map_intelligence",
    title: "Personal location privacy",
    worldElement: "user_avatar",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "PRODUCTION_DATA_PATH_PROVEN",
    anchors: ["lib/location"],
    coreModule: null,
    surfaces: ["app/[locale]/dashboard/profile/page.tsx"],
    note: "No coordinates exist for people, by schema construction — not by policy.",
  },
  {
    id: "GEO-3",
    domain: "map_intelligence",
    title: "Mobility / cross-border requirements",
    worldElement: "documents",
    status: "PARTIAL",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/country-readiness"],
    coreModule: "lib/country-readiness/requirements.ts",
    surfaces: ["app/[locale]/dashboard/documents"],
    note: "A checklist; no permit or posting workflow.",
  },
  {
    id: "GEO-4",
    domain: "map_intelligence",
    title: "Labour-market intelligence",
    worldElement: "market_world_map",
    status: "PARTIAL",
    strongestEvidence: "PRODUCTION_DATA_PATH_PROVEN",
    anchors: ["lib/intelligence"],
    coreModule: null,
    surfaces: ["app/[locale]/dashboard/admin"],
    note: "76 observations; exactly one path leads into an operational action.",
  },
  {
    id: "GEO-5",
    domain: "map_intelligence",
    title: "Public answer engine / SEO",
    worldElement: "market_world_map",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "PRODUCTION_DATA_PATH_PROVEN",
    anchors: ["lib/answer-engine"],
    coreModule: "lib/answer-engine/registry.ts",
    surfaces: ["app/[locale]/(marketing)/questions"],
    note: "",
  },
];

// ── K. EDUCATION ────────────────────────────────────────────────────────────

const EDUCATION: readonly CapabilityRow[] = [
  {
    id: "EDU-1",
    domain: "education",
    title: "Institution capability + learner link",
    worldElement: "organizations",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "PRODUCTION_PERSISTENCE_PROVEN",
    anchors: ["lib/product-gate/organization-roles.ts"],
    coreModule: "lib/product-gate/organization-roles.ts",
    surfaces: ["app/[locale]/dashboard/company"],
    note: "The relationship is DATA (`engagement_contexts` `student`), never an invitation type.",
  },
  {
    id: "EDU-2",
    domain: "education",
    title: "Programmes / cohorts / members",
    worldElement: "organizations",
    status: "PARTIAL",
    strongestEvidence: "PRODUCTION_PERSISTENCE_PROVEN",
    anchors: ["lib/education"],
    coreModule: "lib/education/programs.ts",
    surfaces: ["app/[locale]/dashboard/company"],
    note: "One programme, one cohort, zero members in production — the journey has never run end to end.",
  },
  {
    id: "EDU-3",
    disconnectedBecause: "no_writer",
    domain: "education",
    title: "Learner outcomes",
    worldElement: "reputation",
    status: "BUILT_NOT_CONNECTED",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/education"],
    coreModule: null,
    surfaces: [],
    note: "`institution_learner_outcomes` has no writer a human can reach.",
  },
  {
    id: "EDU-4",
    domain: "education",
    title: "Learning compass (student path)",
    worldElement: "skills",
    status: "PARTIAL",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/learning/learning-compass.ts"],
    coreModule: "lib/learning/learning-compass.ts",
    surfaces: ["app/[locale]/dashboard"],
    note: "Reachable from the person's dashboard; production holds zero cohort members, so no learner has ever seen it.",
  },
  {
    id: "EDU-5",
    disconnectedBecause: "orphan_route",
    domain: "education",
    title: "Human-in-loop learning review",
    worldElement: "skills",
    status: "BUILT_NOT_CONNECTED",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/learning"],
    coreModule: null,
    surfaces: [],
    note: "/dashboard/learning has zero inbound links — re-checked 2026-09-07: every reference to it in the codebase is a `revalidatePath` call, and no surface anywhere carries an href to it. A person can only arrive by typing the URL.",
  },
  {
    id: "EDU-6",
    domain: "education",
    title: "Institution reporting",
    worldElement: "organizations",
    status: "MISSING",
    strongestEvidence: "NONE",
    anchors: [],
    coreModule: null,
    surfaces: [],
    note: "Programmes exist; no report and no export.",
  },
];

// ── L. PLATFORM · AI · GOVERNANCE ───────────────────────────────────────────

const PLATFORM: readonly CapabilityRow[] = [
  {
    id: "AI-1",
    domain: "platform",
    title: "MCP door (capability contract)",
    worldElement: "ai_conversation",
    status: "PARTIAL",
    strongestEvidence: "PRODUCTION_DATA_PATH_PROVEN",
    anchors: ["lib/capabilities/registry.ts", "lib/mcp", "app/api/mcp"],
    coreModule: "lib/capabilities/registry.ts",
    surfaces: ["app/api/mcp"],
    note: "Proven read+write through ChatGPT; no MCP end-to-end spec, and the OAuth authorization server is not enabled by the owner.",
  },
  {
    id: "AI-2",
    domain: "platform",
    title: "Conversation action backbone",
    worldElement: "ai_conversation",
    status: "PARTIAL",
    strongestEvidence: "HUMAN_UI_PROVEN",
    anchors: ["lib/conversation/action-registry.ts"],
    coreModule: "lib/conversation/action-registry.ts",
    surfaces: ["components/app/conversation"],
    note: "Most action tokens carry `stateFingerprint = 'n/a'`, so a stale confirmation cannot always be detected.",
  },
  {
    id: "AI-3",
    domain: "platform",
    title: "AI runtime: providers, model registry, cost ceilings, egress",
    worldElement: "ai_conversation",
    status: "PARTIAL",
    strongestEvidence: "PRODUCTION_PERSISTENCE_PROVEN",
    anchors: ["lib/ai/runtime"],
    coreModule: "lib/ai/runtime/run-core.ts",
    surfaces: ["app/api"],
    note: "47 real runs with real spend; six registered agents still have zero call sites.",
  },
  {
    id: "AI-4",
    domain: "platform",
    title: "AI agent subjects (human / agent / team)",
    worldElement: "user_avatar",
    status: "ARCHITECTURE_ONLY",
    strongestEvidence: "CODE_PROVEN",
    anchors: ["lib/product-gate/entity-model.ts"],
    coreModule: "lib/product-gate/entity-model.ts",
    surfaces: [],
    deferredByDesign: true,
    note: "Recorded in ARCHITECTURE §5.1; deliberately not now.",
  },
  {
    id: "GOV-1",
    domain: "platform",
    internal: true,
    title: "Migration safety + parity gates",
    worldElement: "organizations",
    status: "PARTIAL",
    strongestEvidence: "TEST_PROVEN",
    anchors: [".github/scripts/migration-safety.mjs"],
    coreModule: null,
    surfaces: [],
    note: "The repo→applied direction is unchecked; one read-only secret arms two inert gates.",
    ownerDecision: "Provide SUPABASE_DB_URL (§6.3 item 3).",
  },
  {
    id: "GOV-2",
    domain: "platform",
    internal: true,
    title: "Quality gates (typecheck, lint, unit, copy/doctrine guards)",
    worldElement: "organizations",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "PRODUCTION_DATA_PATH_PROVEN",
    anchors: [".github/workflows/quality.yml", "lib/guards"],
    coreModule: null,
    surfaces: [],
    note: "Strong on syntax and copy; until this register existed, blind to a capability with no consumer.",
  },
  {
    id: "GOV-3",
    domain: "platform",
    internal: true,
    title: "E2E in CI",
    worldElement: "organizations",
    status: "PARTIAL",
    strongestEvidence: "TEST_PROVEN",
    anchors: [".github/workflows/e2e-smoke.yml"],
    coreModule: null,
    surfaces: [],
    note: "A small subset of the local suite runs in CI.",
    ownerDecision: "Build an authenticated fixture strategy, or accept the suite as a local-only tool (§6.3 item 6).",
  },
  {
    id: "GOV-4",
    domain: "platform",
    title: "Telemetry / funnel",
    worldElement: "organizations",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "PRODUCTION_PERSISTENCE_PROVEN",
    anchors: ["lib/telemetry"],
    coreModule: "lib/telemetry/funnel-events.ts",
    surfaces: ["app/[locale]/dashboard/admin"],
    note: "3,329 events in production.",
  },
  {
    id: "GOV-5",
    domain: "platform",
    title: "Localization",
    worldElement: "communication",
    status: "PARTIAL",
    strongestEvidence: "HUMAN_UI_PROVEN",
    anchors: ["lib/i18n", "messages"],
    coreModule: null,
    surfaces: [],
    note: "Eleven locales, five active; the inactive five carry large [EN] blocks and are not ratchet-tracked. A missing key renders as the key itself — only a walk sees it.",
  },
  {
    id: "GOV-6",
    domain: "platform",
    title: "Search / discovery",
    worldElement: "market_world_map",
    status: "PARTIAL",
    strongestEvidence: "PRODUCTION_DATA_PATH_PROVEN",
    anchors: ["lib/search"],
    coreModule: null,
    surfaces: ["app/[locale]/(marketing)/jobs"],
    note: "Four incompatible stacks; no people search anywhere, by design.",
  },
  {
    id: "GOV-7",
    domain: "platform",
    title: "Reporting / export",
    worldElement: "documents",
    status: "PARTIAL",
    strongestEvidence: "HUMAN_UI_PROVEN",
    anchors: ["lib/reports"],
    coreModule: null,
    surfaces: ["app/[locale]/dashboard/admin"],
    note: "Six real downloads, CSV/JSON only; no PDF or XLSX generator.",
  },
  {
    id: "GOV-8",
    domain: "platform",
    internal: true,
    title: "Security / RLS",
    worldElement: "organizations",
    status: "PARTIAL",
    strongestEvidence: "PRODUCTION_RPC_PROVEN",
    anchors: ["lib/security"],
    coreModule: null,
    surfaces: [],
    note:
      "RLS on every table. Of the two owner-only Auth settings this entry used to gate on, one is DONE and the other cannot be done at all on this plan. Email OTP expiry was changed 14400 → 3600s by the owner on 2026-09-07 and verified from the live security advisors afterwards: `auth_otp_long_expiry` no longer appears. Leaked-password protection (HaveIBeenPwned) is BLOCKED_BY_PLAN — Supabase refused the configuration because the project is on the free plan. It stays a real, open security recommendation, but it is an economic decision for the owner and NOT unresolved implementation work; no agent may resolve it and it must not be reported as forgotten.",
  },
  {
    id: "GOV-9",
    domain: "platform",
    internal: true,
    title: "Executable product constitution (this register + graph + journeys)",
    worldElement: "organizations",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "TEST_PROVEN",
    anchors: [
      "lib/product-gate/capability-register.ts",
      "lib/product-gate/product-graph.ts",
      "lib/product-gate/journey-register.ts",
      "lib/product-gate/semantic-separations.ts",
      ".github/scripts/product-truth.mjs",
    ],
    coreModule: "lib/product-gate/capability-register.ts",
    surfaces: [],
    note: "What a new agent meets before it can narrow the product. Machine-checked; the parts that cannot be machine-checked are named in `docs/PRODUCT_CONSTITUTION.md` §17.",
  },
];

export const CAPABILITY_REGISTER: readonly CapabilityRow[] = [
  ...PERSON,
  ...SKILLS,
  ...ORGANIZATION,
  ...WORK_EXECUTION,
  ...EVIDENCE,
  ...DEMAND_SUPPLY,
  ...TIME_CAPACITY,
  ...MARKETPLACE,
  ...COMMUNICATION,
  ...MAP_INTELLIGENCE,
  ...EDUCATION,
  ...PLATFORM,
];

/** Every id ever issued, including retired ones. Ids are never reused. */
export const CAPABILITY_IDS: readonly string[] = CAPABILITY_REGISTER.map((c) => c.id);

export function capabilityById(id: string): CapabilityRow | undefined {
  return CAPABILITY_REGISTER.find((c) => c.id === id);
}

export function capabilitiesInDomain(domain: CapabilityDomain): readonly CapabilityRow[] {
  return CAPABILITY_REGISTER.filter((c) => c.domain === domain);
}

/** A capability a human can reach today. Used by the journey guard. */
export function isLive(row: CapabilityRow): boolean {
  return row.status === "BUILT_AND_USABLE" || row.status === "PARTIAL";
}

export function evidenceRank(level: EvidenceLevel): number {
  return EVIDENCE_ORDER.indexOf(level);
}
