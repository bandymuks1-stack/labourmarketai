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
    note:
      "The read filter is FIXED and on main — the previous note, that it sat in an open PR, was stale. `save_self_declared_work_history_v1` has accepted student/volunteer since 2026-08-27, and #1290 put `PRACTICE_RELATIONSHIPS` into the one canonical list in `lib/player-card/work-history-model.ts`, which the profile page, the CV export, the worklog engagement read, the capabilities registry and the invite surface all import rather than copy. `historyKindOf` derives employment-vs-practice from the relationship, so a placement is carried as practice and never relabelled as a job; `manager` correctly stays out of history as an administrative relationship. PARTIAL is now a statement about VOLUME, not correctness: production holds 1 student engagement and 0 volunteer engagements, so the path is real but thinly walked.",
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
    note:
      "No AI required - the recognition path is deterministic (I-7). MEASURED on production 2026-09-08, the chain runs on real work: 28 journal entries carry a pipeline_version marker (2026-07-19 to 2026-09-04) and journal_entry_skills holds 21 links with provenance `recognized` across 12 entries and 4 workers, plus 27 older links from before provenance existed. " +
      "THE ACCEPT / REJECT / CORRECT LOOP IS BUILT AND REACHABLE, and it was built the right way: confirmJournalSkillCandidate accepts, rejectJournalSkillCandidate records an entry-scoped APPEND-ONLY marker (`skill_rejected` / `skill_claim_rejected` / `unresolved_dismissed`) that the derivation keeps showing, and confirmJournalAmbiguousChoice resolves an ambiguous candidate. The metric lane is never updated or deleted, so a correction cannot erase what was originally suggested. " +
      "WHAT THE NUMBERS SAY HONESTLY: 0 links carry `confirmed`, 0 carry `manual`, and there are 0 rejection markers of any kind. The loop has never been exercised by a human. That is ADOPTION, not absence, and it is the reason this row must not be read as proof that correction works in practice - only that it exists and is reachable.",
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
    status: "PARTIAL",
    strongestEvidence: "PRODUCTION_DATA_PATH_PROVEN",
    anchors: ["lib/esco/esco-semantics.ts", "lib/esco/esco-lookup.ts", "lib/taxonomy/esco-autocomplete.ts"],
    // The REACHABLE ESCO core today is the typeahead, not the new semantic
    // layer: lib/esco has no consumer yet and saying otherwise would be the
    // exact false-reachability claim this register exists to catch. The
    // register's own guard refused the stronger version of this line.
    coreModule: "lib/taxonomy/esco-autocomplete.ts",
    surfaces: [
      "components/app/skill-clarify-form.tsx",
      "components/app/structure-need-form.tsx",
    ],
    note:
      "TWO CLAIMS HERE WERE STALE, corrected 2026-09-08 from production. (1) 'The capability has never read a row' - it reads rows on BOTH sides of the market today: the ESCO typeahead is mounted in skill-clarify (worker) and structure-need (employer demand). (2) The bridge being inert does not make the catalogue unreadable. What IS still true: 0 of 161 platform skills and 0 of 49 professions carry an esco_uri, so nothing joins ESCO to the platform taxonomy. " +
      "The catalogue itself is substantial and now measured: 1,045,186 labels over 28 locales, 13,939 skills, 3,039 occupations, 126,051 occupation-skill relations (67,600 essential / 58,451 optional). RLS on, authenticated SELECT, no anon. " +
      "Read live under a real user 2026-09-08: a Lithuanian phrase resolves to an ESCO occupation and the SAME concept comes back as en=construction scaffolder, de=Gerustbauer, sv=stallningsbyggare, no=stillasarbeider, pl=monter rusztowan, nl=steigerbouwer - the cross-language bridge working on real data, and Norway is exactly where the one production supply row points. The occupation decomposes into its essential ESCO skills bilingually (build/dismantle scaffolding, work-at-height safety, interpret 2D/3D plans). A non-construction control behaves the same (lt slaugytojas specialistas -> no spesialsykepleier, 68 essential skills), so the model is not construction-shaped. " +
      "PERFORMANCE IS A CONTRACT, not a detail: esco_labels_typeahead_idx leads with `locale`, so the same lookup measured 1.5 ms with a locale and 10,076 ms without - 6,500x. lib/esco therefore REQUIRES locales and fans out one indexed query per locale. " +
      "WHAT IS NOT CONNECTED, stated plainly: the new lib/esco semantic layer (concept resolution, the cross-language bridge, and the occupation-skill relation reader) has NO product consumer yet. It is CODE_PROVEN as TypeScript and its query shapes are proven on production; it is not reachable by a human, and this entry does not pretend otherwise. " +
      "THE LINKAGE IS NOW APPLIED (2026-09-08, owner-approved on #1635, ledger 20260908082301), so the line above about 0 of 161 skills and 0 of 49 professions is superseded: production now carries 65 mappings - 31 of 161 skills and 34 of 49 professions. The corrected set is what shipped, NOT the set the owner refused: the six objectively wrong mappings are absent and the two ambiguous ones are deliberately left UNMAPPED. `teacher` and `caregiver` are NULL on production and that is the intended outcome, because UNKNOWN is the correct answer for an ambiguous occupation and a confidently wrong one propagates into matching. Verified by FINGERPRINT rather than by eye - the applied rows and the migration file both hash to 4a86d46c3701871e06d8c355d76173f4 over 65 sorted type|slug|uri triples. The migration can only fill a NULL: it asserts every slug exists and every URI is in the corpus, and refuses to overwrite a different esco_uri. The remaining 130 skills and 15 professions stay unmapped rather than guessed.",
    // ownerDecision RESOLVED 2026-09-08. The gate did its job: #1355 was
    // refused as written, the wrong mappings were corrected in #1635, and the
    // corrected migration was owner-approved and applied as ledger
    // 20260908082301. #1355 is closed as superseded (its head is an ancestor
    // of #1635, verified before closing). A structurally valid URI is not a
    // correct meaning - that is what the gate caught, and it is why `teacher`
    // and `caregiver` remain unmapped rather than plausibly wrong.

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
    domain: "work_execution",
    title: "Tasks",
    worldElement: "projects",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "PRODUCTION_PERSISTENCE_PROVEN",
    anchors: ["lib/tasks"],
    coreModule: null,
    surfaces: [
      "app/[locale]/dashboard/tasks",
      "app/[locale]/dashboard/projects/[id]/operations",
    ],
    note:
      "Corrected 2026-09-08: this said `no_navigation`, and tasks is one of the BEST-connected capabilities in the product. `/dashboard/tasks` carries a surfaceRoute in the dashboard module registry, the chat action registry routes to it twice, notification hrefs point at it, the planning model links to it, journal task-evidence builds links into it, and primary-route-smoke covers it. Production carries 2 `work_tasks` and 3 `work_task_events`, so writes have persisted and been acted on. The old note quoted the migration calling it 'reachable, functional and pointless' - that was a judgement about VALUE (`follow_up_tasks` overlaps it), not about reachability, and it was read here as if it meant unreachable. Whether the two task stores should be merged is a real open question; it is not this field.",
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
    note: "ASSIGNMENT is genuinely missing: no FK ties a team to a project assignment, so a brigade cannot be assigned as a UNIT. The rest of the team layer is NOT missing, and this note used to imply it was — re-measured against production 2026-09-09: `organization_type='team'` is in the live CHECK constraint, `create_team_v1` and `get_team_capability_summary_v1` both EXIST, `team_details` and `team_enquiries` both EXIST, `invitations.invitation_type` carries `join_team`, and `authenticated` HAS execute on `create_team_v1` — so a team can be created, given members by consent (the existing `engagement_contexts`, 80 rows in real use), described with availability/location, and enquired about. What is 0 is USAGE: 0 teams, 0 team_details, 0 team_enquiries, 0 join_team invitations. Nobody has created one, which is a human fact and not a code gap (the same distinction the institution's `members 0` needed). The sentence front door was the real reachability defect and is fixed (see `a-brigade-can-offer-itself.test.ts`).",
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
    note: "0 rows; no human path opens it. Measured 2026-09-08: `defects` and `defect_corrections` both hold 0 rows, and neither `/dashboard/quality` nor any defects route carries a surfaceRoute in the dashboard module registry. Genuinely unreachable - this one is correct.",
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
    note: "`project_handover_entries` has no reader surface. Measured 2026-09-08: `project_handover_entries` holds 1 row, so it HAS been written once. There is no dashboard-module-registry entry for it; it is reachable only from inside project operations and the handover panel. `no_navigation` is therefore accurate as written - no nav entry of its own - but it is not unreachable.",
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
    note: "`project_budgets` exists with no surface. Measured 2026-09-08: `project_budgets` holds 0 rows and no economics/budgets route carries a surfaceRoute in the dashboard module registry. Genuinely unreachable - this one is correct.",
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
    note:
      "The product's strongest chain: chat, journal, MCP and the API all reach one core. It is already CHAT-FIRST, not form-first, and the copy audit on 2026-09-08 found NO coaching of the person to write for the recognizer - no keyword advice, no required template, no ESCO terminology asked of a human. The opposite, in fact: when recognition finds nothing the copy says so plainly and offers a manual link, and the picker hint states outright that those skills are NOT recognized from the entry, keeping the raw statement separate from the inference. " +
      "THE ONE REAL GAP, measured the same day: a work-evidence conversation does not survive a turn. `conversation-goal.ts` is the canonical multi-turn memory - it carries an active goal, accumulates stated constraints and remembers what was offered and refused - and `GOAL_BEARING_INTENTS` lists eight intents (find-work, opportunities, need-workers, find-workers, need-service, offer-value, availability, offer-capacity). `log-work` is NOT among them. So 'Siandien montavau PERI klojinius.' followed by 'Sienas.' does not accumulate into ONE evidence context; the second sentence re-classifies from scratch. " +
      "AND THE ONE-LINE FIX IS THE WRONG FIX, which is why this is recorded rather than shipped: the goal layer accumulates onto the canonical DiscoveryFilterState, a SEARCH vocabulary. Adding `log-work` to that set without an evidence-shaped goal payload would push work-evidence text into a discovery filter - a semantic collapse, and a second meaning for the same field. The correct slice is an evidence goal payload beside the discovery one, reusing the same goal machinery. Nothing here is a second Work Journal or a second evidence model. " +
      "RESOLVED 2026-09-08, in part. `log-work` is now goal-bearing and the goal carries an EVIDENCE payload (lib/conversation/evidence-goal.ts) beside `filters`, never inside it: stated facts, the recognizer's separate derived readings, and the dimensions already asked. The live chat dispatcher passes it, so a second sentence about the same day now enriches ONE account instead of re-classifying. Facts are read with the journal's OWN recognizer - no second parser - and the trick that makes it work needs none: when the system has asked about a dimension, the next short sentence IS the answer to it, so 'Sienas.' resolves without parsing. Proven by 17 tests including the addendum's exact three-turn journey and five occupations (construction, warehouse, automotive, hospitality, healthcare); the question is chosen by WHAT IS MISSING, never by a trade list. " +
      "WHAT IS STILL OPEN IS AN ARCHITECTURAL DECISION, not a missing function. The product does not capture work as a conversation: `startWorkLog` opens an embedded FORM with prefilled fields, and its own comment records why - repeated clarify questions once made the journal unfillable for a real tester, and the form was the fix. So asking the follow-up IN CHAT would partly revert a deliberate repair of a measured defect. The recommended shape is therefore ASK-THEN-PREFILL, not ask-instead-of-form: when exactly one materially useful dimension is missing, ask it, then open the SAME flow with the richer draft. That keeps one intake, one save path, and the anti-loop the form was built to provide (the payload caps at 2 questions and never repeats one). Not shipped here, because replacing a capture model on the strength of a test suite alone is the kind of change that needs a human walk.",
  },
  {
    id: "EVID-1",
    domain: "evidence",
    title: "Organization historical evidence import",
    worldElement: "work_journal",
    status: "PARTIAL",
    strongestEvidence: "PRODUCTION_DATA_PATH_PROVEN",
    anchors: [
      "lib/organization-evidence/import-core.ts",
      "lib/organization-evidence/evidence-state.ts",
      "lib/organization-evidence/competency-signals.ts",
    ],
    coreModule: "lib/organization-evidence/import-core.ts",
    surfaces: ["app/[locale]/dashboard/profile", "components/app/evidence-import-section.tsx"],
    note:
      "UNBLOCKED 2026-09-08. The owner approved EVID-1 and 20260907220000_evidence_parties_recursion_fix_v1 was applied via Supabase MCP as ledger 20260908080950. The history matters, because this row was wrong twice: it first claimed PRODUCTION_DATA_PATH_PROVEN while four of the eight tables could not be read at all, and the verification that missed it had exercised organization_people (no cross-table policy, works fine) and then checked that the other policies EXISTED rather than reading THROUGH them. Policy presence is not policy reachability - SEP-8 caught inside this register's own evidence. MEASURED AFTER THE APPLY, against the live database, not inferred: (1) READ - all four formerly-recursing tables (records, parties, events, competency_signals) now return cleanly under a real organization manager's own auth where every one previously raised 42P17; (2) WRITE - a full chain ran under that same manager inside ONE transaction that was then ROLLED BACK: evidence_import_sessions -> organization_people -> organization_evidence_records INSERT ... RETURNING -> organization_evidence_parties INSERT ... RETURNING, returning records_written=1, parties_written=1. That RETURNING is precisely what used to die with the read; (3) BOUNDARY - a person who manages nothing reads 0 records, 0 parties, 0 signals, with no error, so it fails closed AND quietly; (4) RESOLVER - is_evidence_record_subject is SECURITY DEFINER, stable, search_path=public, EXECUTE held by authenticated and REFUSED to anon; (5) RESIDUE - re-counted after the rollback: all six tables back to 0. Nothing was left behind. The closed sets are unchanged and still enforcing: evidence_state admits no attested or verified value, and competency method admits only exact_term_match / synonym_term_match, so ai_inference is refused 23514 at the schema. Rollback is a faithful inverse of the pre-apply policy (verified against a snapshot taken before the apply) and reintroduces the recursion by design - prefer fixing forward. PARTIAL, not BUILT_AND_USABLE, and the reason is volume rather than correctness: both surfaces are wired and reachable (the importer on /dashboard/company, the subject's view on /dashboard/profile) but NO HUMAN HAS EVER COMPLETED AN IMPORT and all eight tables still hold 0 rows. The subject's right to REFUSE what an organization recorded is still unbuilt, and it is a WRITE-PATH gap rather than a missing screen - this row said 'no surface offers the act', which reads as UI work and is not. Measured on production 2026-09-08: organization_evidence_events carries exactly two INSERT policies, and neither can ever admit the subject. The attest policy requires manages_organization(organization_id), which the subject of an imported record is not, by definition - an organization is recording a person who does not manage it. The verify policy admits only independently_verified and then excludes the subject explicitly with NOT EXISTS over the linked profile. No SECURITY DEFINER function writes to the table either: the three dispute RPCs in pg_proc all belong to experience_records (EVID-6), a different table. And no application code anywhere emits event_type = 'disputed' - the only two writers in import-core.ts are the importing organization's own rollback/reinstate and its own attestation. Meanwhile deriveEvidenceStanding ranks DISPUTED second in its precedence order, so the model computes a state that no actor in the system can cause. Shipping the button alone would hand the one person it exists for a 42501. Closing it needs a narrow subject-only write path, which is RED and owner-gated.",
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
  {
    id: "EVID-7",
    domain: "evidence",
    title: "Work intelligence: hours · activities · skill practice · evidence strength",
    worldElement: "work_journal",
    status: "PARTIAL",
    strongestEvidence: "TEST_PROVEN",
    anchors: [
      "lib/journal/work-intelligence.ts",
      "lib/journal/work-intelligence-read.ts",
      "lib/journal/work-evidence-archetypes.ts",
      "lib/journal/fragment-skill-evidence.ts",
      "lib/journal/work-time-plausibility.ts",
    ],
    coreModule: "lib/journal/work-intelligence.ts",
    surfaces: [
      "app/[locale]/dashboard/journal",
      "app/[locale]/cv",
      "app/[locale]/dashboard/people/[workerId]",
      "components/app/journal-work-intelligence.tsx",
    ],
    note:
      "Issue #1689 (2026-09-11). ONE attribution layer over the canonical work-time rule answers, from persisted rows only: hours today / 7 / 30 / 365 days / all time (every entry once), main activity, hours per activity with a 30-vs-30 trend, per-skill ATTRIBUTED practice time (when the entry links ONE skill, or — since the fragment-evidence slice of the same issue — for the fragment a link was recognised on: `fragment_skill` rows written by the skill pipeline and by the worker's candidate confirmation, so ‘6 h tiles, 2 h plaster’ gives 6 h to tiling and 2 h to skim-coating from the worker's own split; a fragment two linked skills sit on, an unlinked skill's row and an entry-level duration all stay involvement) kept apart from INVOLVEMENT (entries · days · contexts · shared hours, never summed — an 8 h entry with four skills is 8 h, not 32), confirmed hours from approved confirmations only, evidence strength (confirmed / photos / original document / self-only), outputs in their recorded units, contexts, months, adjacent directions from EVIDENCED skills only, and the provenance of every hour. The SAME model reaches the Living CV (hours on skill chips) and the conversation (`journal-recent` now looks BACK 14 days and states the total; `figures` states recorded hours instead of denying a ledger). Also FIXED on the way: the journal's own day totals read only the entry-level metric and showed 0 h for fragment-recorded days while the calendar showed the real figure. " +
      "The universal-journal extension path is data, not forms: `work-evidence-archetypes.ts` carries 31 work-evidence archetypes and an ISCO-08 map covering all 43 sub-major groups (3,039 ESCO occupations resolve through ~50 rows), with `composeJournal` as the assembly contract; guarded against occupation switches and core-slug collisions. Plausibility checks (owner §13, `work-time-plausibility.ts`) warn over the same lines — a day above 24 h, a long day, one duration longer than a day, an entry-level figure the rule set aside — in the section and right after a save in the chat flow and the composer; they never change a figure, and the worker's acknowledgement is an append-only `work_time_override` row with a reason that keeps the check visible. Organization view (owner §14): the person page composes the SAME reader for a member under the database's org-manager RLS branch — a manager sees hours, kinds of work, skill practice and evidence strength from exactly the entries logged against their own organization's engagements, with confirmed hours from their own approved confirmations; no checks, directions or diary links, no second timesheet read. PARTIAL because the composer does not yet render archetype modules and no human has walked the section on production; it never manufactures precision the rows do not hold.",
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
    note:
      "80,708 vacancies live (47,710 active) and NO scheduler - ingestion is a manual script or an admin panel action. THE PUBLIC SURFACE WAS FAILING AND THIS ENTRY DID NOT SAY SO, corrected 2026-09-08 from production logs: `search_public_vacancy_previews_v1` computed total_count with `count(*) over ()`, walking every live row per call, and the 24 h to 2026-09-08 carried 1,595 statement timeouts of which EVERY ONE was that function under `postgrest`/`authenticator` - real anonymous traffic at ~66/hour, answered to the person as HTTP 500. Owner-approved and fixed the same day (ledger 20260908110702): the unfiltered total now reads the cron singleton. Measured under the real `anon` role with statement_timeout=3s - unfiltered 2.7 ms (was 3,351 ms cold), warm 1.0-1.3 ms, total_count 47,710 correct, per-filter totals correct, projection unchanged, privileges unchanged, and `anon` still refused 42501 on both `public_vacancies` and the counts singleton. The last organic timeout was 10:49:51, seventeen minutes BEFORE the apply, and none has followed. The profession-filtered path is ~14 ms slower because its total became a second scan - recorded, not hidden. PARTIAL is now about the MISSING SCHEDULER, not about the board falling over.",
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
    note: "Admin route only — that is the real gap, and it is a REACHABILITY gap, not a missing engine: `matchTeamToNeed` is complete (coverage, set blockers, per-member results, honest `insufficient_data` terminals). Re-measured 2026-09-09: 0 teams exist, so connecting it to the employer surface would today render an honest empty state — worth doing, but it is adoption that is missing, not the matcher. The clause 'no team exists to match' was true about the DATA and was being read as a statement about the capability; the team layer itself is applied and live (see WRK-6). A brigade can now also SAY it is available in all five routed locales — `a-brigade-can-offer-itself.test.ts`.",
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
    note:
      "The three-state fix is ON MAIN (#1600, `lib/conversation/capacity.ts`) — the previous note, that it sat in an open RED PR, was stale. Capacity no longer reads one signal: FREE means neither an approved absence nor a commitment overlaps the window, UNAVAILABLE means an absence does, COMMITTED means only work does, and an input that did not answer is reported as unknown (`absencesKnown` / `commitmentsKnown`) rather than as 'no' — SEP-7 held at the read. Re-measured on production 2026-09-08, unchanged from the day the defect was found: `worker_absences` 0 rows, `booking_requests` 1 accepted, `project_worker_assignments` 3 active, so the two signals that were invisible are exactly the ones carrying all the real data. PARTIAL now rests on CAL-3's four incompatible availability vocabularies, which remain recorded debt.",
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
    domain: "marketplace",
    title: "Physical resource listings",
    worldElement: "objects",
    status: "PARTIAL",
    strongestEvidence: "CODE_PROVEN",
    anchors: ["lib/marketplace"],
    coreModule: null,
    surfaces: [
      "app/[locale]/dashboard/listings",
      "app/[locale]/business/[slug]",
    ],
    note:
      "Corrected 2026-09-08: `no_navigation` was wrong. `/dashboard/listings` exists AND carries a surfaceRoute in the dashboard module registry; the public business page reads listings; chat references them. It is reachable. What is true is the rest of the old note: `marketplace_listings` holds 0 rows on production and there is no bridge to `assets`, so nothing proves the surface works end to end. PARTIAL and CODE_PROVEN for exactly that reason - reachable, wired, never once exercised. Reachability and use are different claims, and collapsing them is what produced the wrong status.",
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
    note: "No route; an anchor only. Measured 2026-09-08: `procurement_inquiries`, `procurement_offers` and `procurement_events` all hold 0 rows, and no procurement route carries a surfaceRoute in the dashboard module registry. Genuinely unreachable - this one is correct.",
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
    note: "Never reaches the calendar. Measured 2026-09-08: `business_trips` and `business_trip_events` both hold 0 rows and no trips route carries a surfaceRoute in the dashboard module registry. Genuinely unreachable - this one is correct.",
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
    note:
      "CORRECTED 2026-09-08. This said flatly that all twenty are emitted. They were NOT: service_role held no write grant on notification_events, so every emitter failed 42501 from July until the grant was applied on 2026-09-08 (ledger 20260908061619, and the recipient-discovery SELECTs at 20260908065654 - the write grant alone left the cron returning 503, because the sweep could not read journal_entries or workers to find a recipient). The claim was true of the CODE and false of the PRODUCT, which is the distinction this register exists to keep. NOW MEASURED END TO END on production: 6 events exist, 4 of them written today after the grant; every row carries a recipient; and the readback is correctly scoped - a real recipient reads exactly their own 1 of 6, a person who is not a recipient reads 0. Emission and read are proven; the email channel is still inert because no provider is configured, which is what keeps this PARTIAL.",
  },
  {
    id: "COM-4",
    domain: "communication",
    title: "Weekly digest",
    worldElement: "communication",
    status: "PARTIAL",
    strongestEvidence: "PRODUCTION_PERSISTENCE_PROVEN",
    anchors: ["lib/notifications"],
    coreModule: null,
    surfaces: [],
    note:
      "PROMOTED 2026-09-08 from TEST_PROVEN on real evidence, not on a green suite: the cron actually ran and PERSISTED, writing 4 weekly_digest rows to notification_events at 07:09 and 07:28 UTC - the first digests this product has ever stored. Until that morning it could not: it returned HTTP 503 because service_role could read neither journal_entries nor workers to find a recipient. The only cron in the product. Still PARTIAL because DELIVERY is not persistence - the email channel remains inert with no provider configured, so a digest is stored and readable in-product and reaches nobody by mail.",
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
    note:
      "One programme, one cohort, zero members in production - the journey has never run end to end. The WRITE paths are all present and reachable: create programme, create cohort, assign learner and remove member are all on `/dashboard/company`, and production holds 1 accepted `student` invitation, so the assignable list is not empty. What is missing is a human doing it, not a control to do it with. " +
      "ONE REAL GAP, measured 2026-09-08: a programme cannot be CORRECTED. `education_programs` carries a single SELECT policy and every write goes through `create_education_program_v1`; there is no update function in `pg_proc`. Name, target profession, education type and description are fixed at creation, so a field skipped once is skipped permanently - and because the target profession is what activates the employer-demand signal (EDU-6), the one live programme reads `demandUnknown` and always will.",
  },
  {
    id: "EDU-3",
    domain: "education",
    title: "Learner outcomes",
    worldElement: "reputation",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "PRODUCTION_DATA_PATH_PROVEN",
    anchors: ["lib/education/institution-outcomes.ts"],
    coreModule: "lib/education/institution-outcomes.ts",
    surfaces: [
      "components/app/institution-learners-section.tsx",
      "lib/conversation/education-answers.ts",
    ],
    note:
      "This entry was WRONG on both counts and is corrected from production, 2026-09-08. It claimed the learner-outcomes store has no writer a human can reach. There is no such TABLE at all - only an aggregate function taking the organization id, which DERIVES counts over the institution's existing active `student` contexts. A derived report needs no writer by construction, so `no_writer` was not a gap but a category error. Nor was it disconnected: it has two real consumers, the institution learners section and the chat education answers. (The function is named in lib/education/institution-outcomes.ts, the single permitted caller - deliberately not repeated here, because a guard pins that caller by searching for the name and a register entry is documentation, not a call site.) Proven live under real auth: a manager of a `training_provider` organization got learners=1 with suppressed=true - the k-anonymity floor of 5 doing its job, the four counts null so a number can never identify one person - and someone who does not manage that institution was REFUSED 42501. The privacy boundary is the function itself: counts only, never an id, a name, an employer or a request. What is still missing for J-INSTITUTION-OUTCOME is the OTHER half of that link - the institution seeing employer demand - not this half.",
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
    note: "/dashboard/learning has zero inbound links — re-checked 2026-09-07: every reference to it in the codebase is a `revalidatePath` call, and no surface anywhere carries an href to it. A person can only arrive by typing the URL. Measured 2026-09-08: `learning_signals`, `learning_review_queue` and `learning_policy_settings` all hold 0 rows and no learning route carries a surfaceRoute in the dashboard module registry. Genuinely unreachable - this one is correct.",
  },
  {
    id: "EDU-6",
    domain: "education",
    title: "Institution reporting",
    worldElement: "organizations",
    status: "PARTIAL",
    strongestEvidence: "PRODUCTION_DATA_PATH_PROVEN",
    anchors: ["lib/education/programs.ts"],
    coreModule: "lib/education/programs.ts",
    surfaces: ["components/app/institution-programs-section.tsx"],
    note:
      "CORRECTED 2026-09-08. This row said MISSING with no anchors, no surfaces and 'Programmes exist; no report and no export', and the journey register repeated it as 'an institution cannot see employer demand'. HALF of that was already false, and a register REDDER than the product is not a safe error: it invites the next window to build a demand reader that exists, which is how a second demand model gets born. " +
      "WHAT IS BUILT AND MEASURED ON PRODUCTION: `readInstitutionPrograms` already composes `count_public_vacancies_by_profession_v1`, the canonical per-profession count over the public vacancy pool. Verified live: the function EXISTS, returns 39 professions with real active-vacancy counts, and holds EXECUTE for `authenticated` and NOT for `anon`. `institution-programs-section.tsx` renders it per programme at `program-demand-<id>`, and the surface is mounted on `/dashboard/company`, so it is reachable by a training-provider manager rather than orphaned. It is also HONEST where it cannot answer: a programme with no target profession renders `demandUnknown`, never 0 - SEP-7 held at the surface. Nothing here needed building; it needed measuring. " +
      "WHAT IS GENUINELY MISSING is narrower than the old note claimed, and it is two things. FIRST, there is no report and no export - an institution can read demand on screen and cannot take it anywhere. SECOND, and this is the one that bites today: production's single programme carries NO target profession, so the number it would show is `demandUnknown` FOREVER. `education_programs` has exactly ONE policy, a SELECT; every write goes through `create_education_program_v1`, and no update function exists in `pg_proc`. A programme is immutable after creation, so an institution that skipped the optional profession field at creation can never turn the market signal on. The demand reader is not the blocker - correcting a programme is.",
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
    note:
      "One read-only secret arms two gates that are inert today: the live anon SECURITY DEFINER allowlist check and the repo<->production migration-parity check. Both currently report SKIPPED with a warning. THIS IS NOT THEORETICAL - on 2026-09-08 production ran AHEAD of main: two notification grants were applied to production while their migration files existed only on an unmerged branch, and no CI gate caught it. The parity gate is exactly the check that would have. Partial cover was added the same day instead: the snapshot was refreshed from the live ledger (266 -> 272 rows, max 20260908082301) and snapshot-mode parity PASSES - 272 applied, 274 files, every production migration has a repository file. A snapshot carries no freshness contract, so it is a weaker substitute and says so.",
    ownerDecision:
      "Add a READ-ONLY `SUPABASE_DB_URL` as a GitHub Actions secret (repo Settings -> Secrets and variables -> Actions -> New repository secret). It must never be pasted into a chat, a file or a PR - an agent may not handle it, and this entry deliberately does not ask for the value. Use a role with SELECT only; the gates read `supabase_migrations.schema_migrations` and `pg_proc`/`pg_policies` and write nothing.",
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
    note:
      "DECIDED 2026-09-08, as an engineering call rather than an owner gate (the owner delegated it explicitly). The suite is ACCEPTED AS A LOCAL-ONLY TOOL and CI keeps the unauthenticated smoke subset. The alternative - an authenticated fixture strategy - means minting real sessions in CI, which needs either long-lived seeded credentials in a secret or a login flow against production; both put a real identity into CI for a signal that local runs already give. The cost is not the fixtures, it is what they would have to hold. WHAT THIS COSTS, stated so nobody misreads a green CI: authenticated journeys are NOT covered by CI, so `quality` passing says nothing about whether a signed-in worker, employer, agency or institution can complete their chain. That evidence comes from local runs and from production walks, and the evidence ladder already refuses to promote either to HUMAN_UI_PROVEN on CI alone. Revisit only if CI gains a way to hold a session without holding a credential.",
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
