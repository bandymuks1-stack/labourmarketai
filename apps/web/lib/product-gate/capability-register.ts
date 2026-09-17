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
    note: "Extraction is a proposal; every fact is confirmed by the person (A-05). AND NOW WITHDRAWABLE (2026-09-14). A confirmed work-history fact was one-way: the profile carried a form writing through `save_self_declared_work_history_v1`, while its sibling `remove_self_declared_work_history_v1` — applied and callable since migration 20260714161000 — was named in NO source file at all. A living CV whose statements cannot be taken back is the wrong shape. The control appears only on the person's OWN self-declared, non-primary engagements, which are exactly the RPC's preconditions, and the RPC re-checks all of them; an entry a journal record points at answers `in_use` and is refused rather than destroyed (the FK is RESTRICT), which the surface states instead of swallowing. `not_found` stays merged for a missing row and an unauthorized one, so nothing became an existence oracle. No migration, no new authority. Guard: lib/guards/self-declared-history-can-be-taken-back.test.ts.",
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
    note: "`confirmed_by_manager` has no write path, so it is permanently false. STEP C (2026-09-14) STOPPED this: it is DEFERRED BY DESIGN, not half-built. The creating migration (20260714160000) says so in the column comment — 'Only a REAL confirmation flow (future, SECURITY DEFINER) may set true' — and the column is deliberately excluded from the authenticated insert/update grants. Building that flow means a new SECURITY DEFINER RPC and a decision about who may confirm an achievement: NEW structure plus a new authority boundary, neither authorized in Step C. Production: 2 achievements, 0 confirmed.",
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
    status: "PARTIAL",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/worker/external-profiles.ts"],
    coreModule: "lib/worker/external-profiles.ts",
    surfaces: ["app/[locale]/dashboard/profile/page.tsx"],
    note:
      "UNBLOCKED 2026-09-15. The owner decision this row carried — apply a split or retire the section — was MADE and EXECUTED in #1740: `20260914210000_external_profiles_v1`, the one-table split, is applied as production ledger `20260915042406`. Verified read-only 2026-09-15: `worker_external_profiles` exists with RLS enabled and exactly one SELECT policy, `authenticated` holds SELECT only so writes stay RPC-only, and both `save_worker_external_profile_v1` and `disconnect_external_profile_v1` are present. THE EXCLUSION HELD: `talent_source_records` and `identity_resolution_events` — the two tables of the 601-line parent that no live surface needs — are absent, and the parent is recorded SUPERSEDED-IN-PART / NEVER APPLY AS A WHOLE in the applied ledger. All three pre-apply conditions are met: the table is in `EXPORTED_RELATIONS` (personal-relations.ts, which export-data.ts imports — the migration header names export-data.ts, but the registration is real and drives the bundle), it is in the deletion-plan accounting as `externalProfiles` with the worker FK cascade unchanged as the actual mechanism, and `external-profiles-consent.test.ts` enforces its invariants against the shipping file. " +
      "NO CODE CHANGE WAS NEEDED to light the surface: the read answers `needs-migration` only on 42P01, so with the table present the section stops rendering 'not enabled yet' by itself. PARTIAL, not BUILT_AND_USABLE, and deliberately: the table holds 0 rows, nothing has traversed the write path on production, and no human has walked the section. The previous note — '20260713210000_multi_source_talent_v1 never applied; the UI ships an honest not-enabled-yet' — was true of the PARENT and stayed on the row after the SPLIT landed.",
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
    note: "GDPR export now covers 48 relations, up from 6. The count in this note was itself wrong: it said ~14 were missing; a production sweep on 2026-09-14 found 60 person-keyed tables, so ~30 were neither exported nor named while the bundle's `excluded` list invited the reader to assume anything unmentioned was included. Every person-keyed relation is now EXPORTED, WITHHELD with a reason that travels in the bundle, or declared non-product (lib/privacy/personal-relations.ts), enforced by `privacy-export-completeness.test.ts`, which derives the table set from the MIGRATIONS so a new person-keyed table fails CI the day it lands. That guard immediately found four the production sweep had missed (dashboard_preferences, demand_interest_seen, worker_external_profiles, worker_opportunity_seen) — they are in migrations that are NOT applied to production. Bundle format is v2; a relation this database does not have reports as empty, not as unread. Still RLS-scoped as the person: no service role, guarded.",
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
    note: "Built for three contexts, mounted for TWO. `project` renders under an instruction (/dashboard/instructions); `opportunity` now renders inside the opportunity card (/dashboard/opportunities) through `loadOwnOpportunityLedgers` — the loader branch that existed with no caller until Step B. Both surfaces render the SAME `RequirementLedgerRows` with the SAME copy (lib/player-card/requirement-ledger-labels.ts), so 'what is missing for me' cannot acquire two wordings. `role` (professionSlug + country) remains unmounted: it needs a surface where a person picks a profession to aim at, which does not exist yet.",
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
    // `inert_bridge` REMOVED 2026-09-15, falsified by production. The kind
    // means "the code runs and the data it links to does not exist", and the
    // note asserted "0 of 161 platform skills and 0 of 49 professions carry an
    // esco_uri". Measured read-only on 2026-09-15: 34 of 49 professions and 31
    // of 161 skills DO carry one. The join the claim denied is the same one
    // the occupation path has been resolving live since 2026-09-12. Nothing in
    // the suite could contradict `inert_bridge`, which is why it survived —
    // the canonical guard now checks the kind (see capability-register.test.ts).
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
      "TWO CLAIMS HERE WERE STALE, corrected 2026-09-08 from production. (1) 'The capability has never read a row' - it reads rows on BOTH sides of the market today: the ESCO typeahead is mounted in skill-clarify (worker) and structure-need (employer demand). (2) The bridge being inert does not make the catalogue unreadable. THAT SENTENCE IS NOW FALSE TOO, corrected 2026-09-15 from production: it claimed '0 of 161 platform skills and 0 of 49 professions carry an esco_uri, so nothing joins ESCO to the platform taxonomy'. Measured read-only 2026-09-15: 34 of 49 professions and 31 of 161 skills carry one, against 3,039 esco_occupations and 13,939 esco_skills. The join exists and is the same one the occupation path has resolved live since 2026-09-12 — which this very note describes two sentences later, so the row contradicted itself. The `inert_bridge` kind is removed with it: nothing in the guard suite could falsify that kind, and it is now checked. What remains true is narrower and is stated below: the SEMANTIC layer (concept resolver, cross-language bridge, occupation-skill reader) still has no product consumer. " +
      "The catalogue itself is substantial and now measured: 1,045,186 labels over 28 locales, 13,939 skills, 3,039 occupations, 126,051 occupation-skill relations (67,600 essential / 58,451 optional). RLS on, authenticated SELECT, no anon. " +
      "Read live under a real user 2026-09-08: a Lithuanian phrase resolves to an ESCO occupation and the SAME concept comes back as en=construction scaffolder, de=Gerustbauer, sv=stallningsbyggare, no=stillasarbeider, pl=monter rusztowan, nl=steigerbouwer - the cross-language bridge working on real data, and Norway is exactly where the one production supply row points. The occupation decomposes into its essential ESCO skills bilingually (build/dismantle scaffolding, work-at-height safety, interpret 2D/3D plans). A non-construction control behaves the same (lt slaugytojas specialistas -> no spesialsykepleier, 68 essential skills), so the model is not construction-shaped. " +
      "PERFORMANCE IS A CONTRACT, not a detail: esco_labels_typeahead_idx leads with `locale`, so the same lookup measured 1.5 ms with a locale and 10,076 ms without - 6,500x. lib/esco therefore REQUIRES locales and fans out one indexed query per locale. " +
      "WHAT IS CONNECTED (corrected 2026-09-12): the lib/esco semantic layer has its first product consumer a person reaches without an admin screen - the Work Journal's occupation path (`iscoGroupsForEscoUris` in esco-lookup, read by `lib/journal/journal-occupation-path.ts`): the worker's own profession -> professions.esco_uri -> esco_occupations.isco_group -> the archetype modules both journal editors compose (a tiler, 7122, gets inspection fields; a software developer, 2512, software delivery). The concept resolver, the cross-language bridge and the occupation-skill relation reader still have NO product consumer; they are CODE_PROVEN as TypeScript with query shapes proven on production, and this entry does not pretend otherwise. " +
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
    note: "Applied, 0 rows; writes nothing into the skill ladder, by decision. A COURSE CAN NOW BE CORRECTED AND RETIRED (2026-09-14). `update_training_program_v1` and its \"Course updated.\" notice in all eleven locales shipped with the module and no control called them: a course name typed wrong stayed wrong, and a course the organization had stopped running stayed assignable right up to the point where `assign_training_v1` refused it as `inactive_program` with nothing on screen saying why. Each course now opens in place, shows whether it is still running, and can be retired or brought back; retiring is a flag and the assignments already made are untouched. No migration, no new authority. `link_training_skill_v1` was checked in the same sweep and DELIBERATELY LEFT UNCONNECTED: the creating migration documents the skill seam as not crossed on purpose (worker_skills carries a closed provenance vocabulary, journal_entry_skills requires a real journal entry, and admitting a training provenance into the canonical ladder is named there as a later train and an owner decision), and nothing reads `training_skill_links` — connecting the write alone would make a write-only store. That is a bounded capability, not a missing one."
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
    coreModule: "lib/company/active-organization.ts",
    surfaces: ["app/[locale]/dashboard/company"],
    note: "Seven authority helpers; an org MANAGER cannot read `company_workers` because `owns_company` excludes managers. STEP C (2026-09-14) STOPPED this: it is a NEW AUTHORITY BOUNDARY, not a wiring gap. Verified against production — `owns_company` = company creator OR an active `owner`/`admin` company_membership, and the migration that widened it (20260904060000) records in its own proof note that a manager-role member deliberately satisfies neither arm. Meanwhile `manages_organization` DOES include manager/external_manager (20260806180000), so the two helpers encode two intentionally different authority levels and `company_workers_select` uses the narrower one. Pointing that policy at the wider helper would let managers read the roster (worker personal data) — RLS-loosening, RED class, owner gate. Production: 1 active manager, 7 company_workers rows, so exactly one real person is affected.",
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
    note: "`agency_client_connections` is live. `agency_clients` was APPLIED 2026-09-14 (owner item 4d, ledger `20260914202322`) under the confirmed canonical Model B: its policy is `owns_company(company_id) OR is_admin()` - company/org authority, never the legacy `owns_agency` - so applying it did not revive Model A (see ORG-10). The two are NOT rivals and this row used to imply they were: `agency_client_connections` is an invitation-based bidirectional bridge to a real platform organization, `agency_clients` is an agency's own private record of a client who may not be on the platform. `AgencyClientsSection` on /dashboard/company had been degrading against a 42P01 since it shipped; read back under a REAL staffing-agency owner's auth after the apply, the relation now reads cleanly (0 rows). 0 rows is adoption, not breakage - 4 staffing-agency companies can now use it. The demand link is one additive nullable column, `customer_requests.agency_client_id`; `customer_requests` was re-counted at 20 rows after the apply, unchanged, 0 linked.",
  },
  {
    id: "ORG-10",
    disconnectedBecause: "no_importer",
    domain: "organization",
    title: "Agency worker pool (legacy `agencies` world)",
    worldElement: "organizations",
    status: "BUILT_NOT_CONNECTED",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/agency/pool.ts", "lib/agency/pool-actions.ts"],
    coreModule: "lib/agency/pool.ts",
    surfaces: [],
    retired: {
      on: "2026-09-14",
      why:
        "Owner decision 2026-09-14: Model B is canonical and this Model A surface is retired-and-recorded (B1). The product once answered `who is in my agency pool and are they ready?` here - docs-readiness aggregates, country readiness, bridge-gated journal evidence - and it stopped because the actor model moved, not because the question stopped mattering. THE QUESTION IS NOT RETIRED, only this answer: a Model-B-native workforce/pool surface is to be reconsidered when real agency workforce evidence exists (owner, same decision). WHY B WON, measured on production 2026-09-14 rather than argued: the SUPPLY side of the market - `list_open_supply_for_employers`, owner-approved and proven end to end 2026-09-07 - resolves authority through `engagement_contexts` + `company_memberships` + `manages_organization` and contains NO reference to `agencies`. Model A holds exactly one reader, `list_open_demand_for_agencies`, which keys off `public.agencies.profile_id`, and it is the one with no surface. NOTHING IS LOST, checked in both directions: all 3 `agencies` rows are already mirrored into `organizations` (organization_type='agency', legacy_agency_id back-pointer) by the `mirror_agency_to_org` trigger; 2 of the 3 profiles additionally own a `companies` row with company_type='staffing_agency'; the third authored 2 `agency_offer` supply rows, which live in `customer_requests` keyed by profile_id and are read by the Model B supply function - so its real evidence never depended on this world either. `agency_workers` holds 0 rows, so `getAgencyPool()` would return an empty pool for every caller alive. NOTHING IS DROPPED: `agencies`, `agency_workers`, `owns_agency`, `list_open_demand_for_agencies` and `mark_agency_can_offer` all remain in the database untouched, and both modules remain in the tree. Retirement here is a statement about what the PRODUCT offers, not a deletion. The route `/dashboard/agency/pool` has redirected to `/dashboard/company#company-team` since W1 (next.config.ts), so no human path changes today.",
    },
    note:
      "RETIRED as a product surface, not deleted. `lib/agency/pool.ts` has no importer among routes or components - only guards and the redirect map reference it - which is why `no_importer` is the honest disconnection kind rather than `no_navigation`. The anti-revival guard is `lib/guards/agency-model-b-canonical-v1.test.ts`: it bans the legacy pool modules from EVERY route and component, not just the company page, so this cannot quietly become a second agency product model again. Extending `agency-direction-a.test.ts`, which already banned them from `/dashboard/company` alone. Writing that guard surfaced a SECOND Model A leftover this row did not know about: `components/app/agency-workers-section.tsx` still imports `lib/agency/actions` and `lib/agency/agency-workers`. It is dead - nothing renders it, and `company-workers-section.tsx` (Model B) is its replacement, referring to it only in a comment. It is kept rather than deleted, for the same retire-and-record reason, and the guard allow-lists that one file while separately asserting it stays ORPHANED, so the exception cannot quietly hide a live surface.",
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
    note: "Per-organization page exists (/business/[slug], public, opted-in orgs only via `get_public_business_profile_v1`); no index or directory route. Step B STOPPED this item on a hard dependency rather than building it: there is no listing read. `organizations` SELECT is hardened to owner/member/admin (20260802170000), and the one cross-org reader, `search_organizations_directory_v1`, is revoked from anon, requires a >=2-char term, and deliberately refuses a wildcard dump — and it does NOT filter on `public_profile_enabled`, so using it for a directory would list organizations that never opted in. An index therefore needs a NEW SECURITY DEFINER listing RPC granted to anon: RED class (needs-human-gate), and NEW is not authorized in Step B.",
  },
  {
    id: "ORG-11",
    domain: "organization",
    title: "Universal invitation / referral network",
    worldElement: "organizations",
    status: "BLOCKED",
    strongestEvidence: "TEST_PROVEN",
    anchors: [
      "lib/invitations/external-sources.ts",
      "lib/invitations/external-referral-contract.ts",
      "lib/invitations/external-referral-receive.ts",
      "lib/invitations/public-preview.ts",
      "lib/api/external-referral-auth.ts",
      "app/api/referrals/external/v1/route.ts",
      "components/app/referral-context-review.tsx",
    ],
    coreModule: "lib/invitations/model.ts",
    surfaces: ["app/[locale]/invite/[token]", "app/[locale]/dashboard/network"],
    note:
      "ONE distribution primitive over the canonical token `invitations` system (ORG-3), extended in place by 20260917120000: an open shareable link (no addressee), a bounded multi-use campaign link (1..500 seats, each acceptance its own person and its own `invitation_acceptances` ledger row), an employer → person invitation to a canonical need (`invite_to_demand` → customer_requests; acceptance writes a demand_interest_signals row whose snapshot names `employer_invitation` and carries no match band), and an approved-external-source referral door (`/api/referrals/external/v1`, one machine secret per registered source, consent re-checked in the database, idempotent on (source, reference), no worker table of its own). The logged-out landing shows a minimal preview and both doors (register / sign in) with the safe `?next=` return; the person who accepts an external referral reviews each declared line (accept / reject / correct) and NOTHING is written to their skills or professions by any of it. PREPARED, NOT APPLIED: every v2 RPC is behind the RED migration, the app code falls back to the v1 functions until it is applied, and the partner door answers `not_enabled` (503) rather than storing anything. TEST_PROVEN only — no browser walk can reach the v2 paths before the apply.",
    ownerDecision:
      "Apply 20260917120000_universal_invitation_referral_network_v1 (RED: seven SECURITY DEFINER functions incl. two service_role-only, two DROP NOT NULL on invitations, CHECK widening on invitations + notification_events) and set the first source secret (`EXTERNAL_REFERRAL_TOKEN_NONSTOP`) in Vercel. Until both: no external referral can be received and no open/campaign link can be minted.",
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
    note: "One row in production. NOT unreachable, and the earlier note read as if it were: work objects render on /dashboard/company (WorkObjectsSection), on /dashboard/tasks (listVisibleActiveObjects) and in the organization document register — three surfaces. Step B considered giving them a route of their own and did NOT: that would be a fourth surface over the same rows with no new outcome, and route-truth-map states the DUPLICATE_DRIFT list must shrink, never grow. What is missing is usage (one row), not reachability.",
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
    domain: "work_execution",
    title: "Defects / corrections",
    worldElement: "projects",
    status: "PARTIAL",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/quality"],
    coreModule: "lib/quality/quality.ts",
    surfaces: ["app/[locale]/dashboard/projects/[id]/operations"],
    note:
      "Corrected 2026-09-14, and this is the WRK-4 defect a second time. The old note said `no human path opens it` and called that `Genuinely unreachable - this one is correct`. It was not correct. `ProjectDefectsPanel` is rendered on `/dashboard/projects/[id]/operations`, fed by `getProjectDefects` in `lib/quality/quality.ts`, with all four write actions (`report_defect_v1`, `set_defect_status_v1`, `add_defect_correction_v1`, `delete_defect_v1`) wired through `lib/quality/quality-actions.ts`. That route is linked from at least six places outside its own directory - the project page, the project map, the company home field section, the assignment manager, the admin page and a chat action chip. The claim survived because the row declared `coreModule: null` and `surfaces: []`, which is exactly the shape the reachability guards SKIP: a row that names nothing to check cannot be falsified, so it rots. That is the SEP-8 collapse happening inside the register that exists to prevent it. What IS true: `/dashboard/quality` does not exist and no defects route carries a surfaceRoute in the dashboard module registry - no nav entry of its own, the WRK-9 wording. And measured on production 2026-09-14, `defects` and `defect_corrections` both still hold 0 rows against 9 projects, so nobody has used it. 0 rows is USAGE, not disconnection - the same distinction this register already applied to WRK-6 teams. PARTIAL rather than BUILT_AND_USABLE for a reason that is NOT navigation: the manager half is complete and the worker half does not exist. `defects_select` admits `can_manage_project(project_id) OR reporter_id = auth.uid() OR is_admin()`, and `assignee_profile_id` - the column that records who must fix the defect - appears in no policy. A worker assigned a defect cannot read the row naming them. That was WRK-8's real gate. CLOSED 2026-09-14: the owner approved the minimum one-disjunct widening (decision 2a) and `20260914200000_defects_assignee_read_v1` was applied via Supabase MCP as ledger `20260914195053`. `defects_select` now reads `can_manage_project(project_id) OR reporter_id = auth.uid() OR assignee_profile_id = auth.uid() OR is_admin()`. PROVEN ON PRODUCTION, not inferred: three defects were seeded on ONE project differing only in assignee, inside a transaction that was then ROLLED BACK, and read under four real users' auth. The assigned worker saw exactly 1 row - their own - and the unassigned defect and the defect assigned to a different worker ON THE SAME PROJECT both came back invisible (f, f), which is what makes this a per-ROW disclosure and not a per-project one. A second worker saw only the defect assigned to them. A worker with no assignment saw 0 rows with no error, so it fails closed. The manager saw all 3, unchanged. The assignee saw 0 `defect_corrections`, so owner decision 2b (DEFER) holds at the database rather than only in the UI. Residue re-counted after the rollback: `defects` and `defect_corrections` both back to 0. Grants untouched - `authenticated` still holds SELECT and no INSERT/UPDATE/DELETE, writes stay RPC-only. Rollback: `supabase/rollbacks/20260914200000_defects_assignee_read_v1.down.sql`, a faithful inverse that reintroduces the defect by design. What is still NOT proven is a human: no defect has ever been written by a real person, so the worker-facing read has no surface exercising it yet and the evidence stays TEST_PROVEN.",
  },
  {
    id: "WRK-9",
    domain: "work_execution",
    title: "Handover passport",
    worldElement: "projects",
    status: "PARTIAL",
    strongestEvidence: "PRODUCTION_PERSISTENCE_PROVEN",
    anchors: ["lib/projects"],
    coreModule: "lib/projects/handover-passport.ts",
    surfaces: ["app/[locale]/dashboard/projects/[id]/operations"],
    note:
      "Corrected 2026-09-15 (falsifiability sweep). This claimed `no_navigation` while naming NO module and NO surface — the WRK-8 shape, which every reachability guard skips. Measured: `lib/projects/handover-passport.ts` is the read service, `HandoverPassportPanel` renders on `/dashboard/projects/[id]/operations`, and the passport is also reachable from `/dashboard/tasks` and the workspace project result. The route carries inbound links from six places. Production holds **1** `project_handover_entries` row, so this has been WRITTEN by a real path at least once — which is why the evidence is PRODUCTION_PERSISTENCE_PROVEN and the status PARTIAL, not disconnected. The old note already admitted it is not unreachable, in those words, while the STATUS still said BUILT_NOT_CONNECTED; the row now says one thing. What remains true: no dashboard-module-registry entry of its own, so there is no nav tile — reachable from inside project operations, not from a menu.",
  },
  {
    id: "WRK-10",
    domain: "work_execution",
    title: "Project economics",
    worldElement: "projects",
    status: "PARTIAL",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/economics"],
    coreModule: "lib/economics/economics.ts",
    surfaces: ["app/[locale]/dashboard/projects/[id]/operations"],
    note:
      "Corrected 2026-09-15 (falsifiability sweep). Claimed `no_navigation` with no module and no surface named. Measured: `lib/economics/economics.ts` is the read service and `ProjectEconomicsPanel` renders at `app/[locale]/dashboard/projects/[id]/operations/page.tsx:570`, a route linked from six places. `project_budgets` holds 0 rows — that is ADOPTION, not disconnection, the same distinction this register already applied to WRK-6 and WRK-8. PARTIAL because the manager path is wired and nobody has used it yet.",
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
      "lib/organization-evidence/work-context.ts",
      "lib/organization-evidence/import-projections.ts",
      "lib/organization-evidence/worker-evidence-read.ts",
      "lib/organization-evidence/time-semantics.ts",
    ],
    coreModule: "lib/organization-evidence/import-core.ts",
    surfaces: [
      "app/[locale]/dashboard/profile",
      "app/[locale]/dashboard/company/history",
      "components/app/evidence-import-section.tsx",
      "components/app/evidence-import-reconstruction.tsx",
      "components/app/historical-player-card.tsx",
      "components/app/historical-field-board.tsx",
    ],
    note:
      "2026-09-16 later (owner human walk of #1748 on production): cleaner but not the product; the 800 h / 165 h figures were aggregate work-from-home hours over months, not a day. Corrected: time-semantics.ts classifies a figure a day cannot hold from the source's words (never the numbers) into period_aggregate / unknown as a blocking question; resolveTimeSemantics records the human's answer; the commit writes a period record when the period is known, else a dated fact with duration UNKNOWN; only daily hours reach the ledger. The history-card variant of the ONE player identity and a read-only historical field board render the same projection. Awaits the owner's HUMAN acceptance; not proven. Earlier: 2026-09-16 (HUMAN walk, production): the owner staged a real 158-row XLSX (session 47627d4a, 7 people, 8 source weeks) and the preview rendered after #1747; 0 records written, commit deliberately not authorized. The walk exposed and this slice fixed: the object cell is composite ('Hoofdgracht 3; Kantoor') and was read as ONE label, so 37 composite objects would have been created; an activity and a duration note in that column would have become sites; 23 rows carried their site only in the text, misspelled; per-place hours written in the text were not read; 800 h / 165 h day rows were flagged but still committable; context_label was written null; and the first screen was the 158-row sheet. Now: lib/organization-evidence/work-context.ts splits, classifies, resolves typos by house number, reads sites and per-place hours from the text; the reading is DERIVED under derived.workContexts with method and confidence; label-level and acknowledgement decisions are staging-only writes; the reconstruction (understood -> issues -> people -> places -> calendar -> company) is the first screen with the rows behind disclosure; and organization_evidence_records finally has a reader outside the import module - worker-evidence-read.ts feeds the ONE work model through the person's LINKED roster row, so history reaches Work in Numbers, the Living CV and the team roll-up with no second upload. TEST_PROVEN against an anonymised structure-for-structure fixture of that real file; the new first screen awaits the owner's HUMAN acceptance and is not claimed as proven. Earlier history follows. UNBLOCKED 2026-09-08. The owner approved EVID-1 and 20260907220000_evidence_parties_recursion_fix_v1 was applied via Supabase MCP as ledger 20260908080950. The history matters, because this row was wrong twice: it first claimed PRODUCTION_DATA_PATH_PROVEN while four of the eight tables could not be read at all, and the verification that missed it had exercised organization_people (no cross-table policy, works fine) and then checked that the other policies EXISTED rather than reading THROUGH them. Policy presence is not policy reachability - SEP-8 caught inside this register's own evidence. MEASURED AFTER THE APPLY, against the live database, not inferred: (1) READ - all four formerly-recursing tables (records, parties, events, competency_signals) now return cleanly under a real organization manager's own auth where every one previously raised 42P17; (2) WRITE - a full chain ran under that same manager inside ONE transaction that was then ROLLED BACK: evidence_import_sessions -> organization_people -> organization_evidence_records INSERT ... RETURNING -> organization_evidence_parties INSERT ... RETURNING, returning records_written=1, parties_written=1. That RETURNING is precisely what used to die with the read; (3) BOUNDARY - a person who manages nothing reads 0 records, 0 parties, 0 signals, with no error, so it fails closed AND quietly; (4) RESOLVER - is_evidence_record_subject is SECURITY DEFINER, stable, search_path=public, EXECUTE held by authenticated and REFUSED to anon; (5) RESIDUE - re-counted after the rollback: all six tables back to 0. Nothing was left behind. The closed sets are unchanged and still enforcing: evidence_state admits no attested or verified value, and competency method admits only exact_term_match / synonym_term_match, so ai_inference is refused 23514 at the schema. Rollback is a faithful inverse of the pre-apply policy (verified against a snapshot taken before the apply) and reintroduces the recursion by design - prefer fixing forward. PARTIAL, not BUILT_AND_USABLE, and the reason is volume rather than correctness: both surfaces are wired and reachable (the importer on /dashboard/company, the subject's view on /dashboard/profile) but NO HUMAN HAS EVER COMPLETED AN IMPORT and all eight tables still hold 0 rows. The subject's right to REFUSE what an organization recorded is still unbuilt, and it is a WRITE-PATH gap rather than a missing screen - this row said 'no surface offers the act', which reads as UI work and is not. Measured on production 2026-09-08: organization_evidence_events carries exactly two INSERT policies, and neither can ever admit the subject. The attest policy requires manages_organization(organization_id), which the subject of an imported record is not, by definition - an organization is recording a person who does not manage it. The verify policy admits only independently_verified and then excludes the subject explicitly with NOT EXISTS over the linked profile. No SECURITY DEFINER function writes to the table either: the three dispute RPCs in pg_proc all belong to experience_records (EVID-6), a different table. And no application code anywhere emits event_type = 'disputed' - the only two writers in import-core.ts are the importing organization's own rollback/reinstate and its own attestation. Meanwhile deriveEvidenceStanding ranks DISPUTED second in its precedence order, so the model computes a state that no actor in the system can cause. Shipping the button alone would hand the one person it exists for a 42501. Closing it needs a narrow subject-only write path, which is RED and owner-gated.",
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
    note: "STEP D (2026-09-14): this convergence WAS ALREADY DONE, and the note described a state that no longer exists. OWNER RULING 2026-08-18 made `journal_entry_metrics` the canonical persisted source and `lib/journal/work-time.ts` THE one derivation rule; its header records the exact defect it closed (three computations gave 0 h, 5 h and 9 h for the same production entry) and states that SQL mirrors it byte-for-byte with a guard pinning the pair. The stores are a PIPELINE, not parallel truths: `timesheet_compute_lines_v1` is labelled THE CANONICAL HOUR FACT and carries an explicit allocation-wins dedupe — an entry referenced by a live allocation is excluded so its hours count exactly once. A TypeScript reader that UNIONED the stores, which the old note asked for, would double-count by construction. Duplicate finding classified FALSE. CORRECTION REACHED THE SURFACE 2026-09-14. Until then an hour record was write-once from every screen: `recordCorrectionAction` — which writes a NEW allocation carrying `correction_of` and stamps the original's `superseded_by`, so both numbers and the link survive — had no control anywhere, and neither did anything else, because there is no delete path in the code or the database. Production held the whole apparatus unused: the two columns present, `authenticated` granted UPDATE, the update policy `manages_organization(organization_id) OR owns_worker(worker_id)`, 5 allocations and 0 superseded rows. Each entry on the quick-entry list now opens in place with its own object, hours and note; WHO and WHEN are carried hidden and never re-opened, because moving a record onto another person or day is a different act. The corrected original leaves every list by the `superseded_by is null` filter all three reads already carried — no new read, no new authority, no migration. Guard: lib/guards/work-hours-correction-reachable.test.ts.",
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
      "lib/journal/journal-module-fields.ts",
    ],
    coreModule: "lib/journal/work-intelligence.ts",
    surfaces: [
      "app/[locale]/dashboard/journal",
      "app/[locale]/cv",
      "app/[locale]/dashboard/people/[workerId]",
      "app/[locale]/dashboard/reports",
      "app/[locale]/dashboard/work-in-numbers",
      "components/app/journal-work-intelligence.tsx",
    ],
    note:
      "Issue #1689 (2026-09-11). ONE attribution layer over the canonical work-time rule answers, from persisted rows only: hours today / 7 / 30 / 365 days / all time (every entry once), main activity, hours per activity with a 30-vs-30 trend, per-skill ATTRIBUTED practice time (when the entry links ONE skill, or — since the fragment-evidence slice of the same issue — for the fragment a link was recognised on: `fragment_skill` rows written by the skill pipeline and by the worker's candidate confirmation, so ‘6 h tiles, 2 h plaster’ gives 6 h to tiling and 2 h to skim-coating from the worker's own split; a fragment two linked skills sit on, an unlinked skill's row and an entry-level duration all stay involvement) kept apart from INVOLVEMENT (entries · days · contexts · shared hours, never summed — an 8 h entry with four skills is 8 h, not 32), confirmed hours from approved confirmations only, evidence strength (confirmed / photos / original document / self-only), outputs in their recorded units, contexts, months, adjacent directions from EVIDENCED skills only, and the provenance of every hour. The SAME model reaches the Living CV (hours on skill chips) and the conversation (`journal-recent` now looks BACK 14 days and states the total; `figures` states recorded hours instead of denying a ledger). Also FIXED on the way: the journal's own day totals read only the entry-level metric and showed 0 h for fragment-recorded days while the calendar showed the real figure. " +
      "The universal-journal extension path is data, not forms: `work-evidence-archetypes.ts` carries 31 work-evidence archetypes and an ISCO-08 map covering all 43 sub-major groups (3,039 ESCO occupations resolve through ~50 rows), with `composeJournal` as the assembly contract; guarded against occupation switches and core-slug collisions. Plausibility checks (owner §13, `work-time-plausibility.ts`) warn over the same lines — a day above 24 h, a long day, one duration longer than a day, an entry-level figure the rule set aside — in the section and right after a save in the chat flow and the composer; they never change a figure, and the worker's acknowledgement is an append-only `work_time_override` row with a reason that keeps the check visible. Organization view (owner §14): the person page composes the SAME reader for a member under the database's org-manager RLS branch — a manager sees hours, kinds of work, skill practice and evidence strength from exactly the entries logged against their own organization's engagements, with confirmed hours from their own approved confirmations; no checks, directions or diary links, no second timesheet read. The organization's per-member roll-up on /dashboard/reports (the windowed journal report) derives every member's hours, confirmed hours, days worked and main kind of work through the same model over the window's own rows — the hub tile and the daily panel stay count-sized (work time is null there, not zero) — and its review counts now mean what they say (confirmed = approved; rejected / changes-requested = returned; the rest await review — before, any confirmation row counted as confirmed). Archetype modules reach the person (owner §12) through `journal-module-fields.ts`: the entry's engagement RELATIONSHIP resolves archetypes, `composeJournal` unions their modules, and both editors (the compact drawer and the composer) render exactly those fields behind their existing disclosure — a placement shows supervision level / competency practised / learning outcome, volunteering the field-project modules; each field is one worker_input `journal_entry_metrics` row under the same atomic save, accepted server-side only when the SAVED engagement's composition allows the slug (refused by name, never dropped), preloaded on edit and shown back on the entry in plain words. The occupation path is live since 2026-09-12 (the slug↔ESCO linkage was applied 2026-09-08, ledger 20260908082301): `journal-occupation-path.ts` resolves the worker's OWN professions → `professions.esco_uri` → `esco_occupations.isco_group` server-side, the editors compose `archetypesForIsco` ∪ `archetypesForRelationship` (a tiler under an employee context sees place and crew, materials and tools, conditions and safety, inspection), all 25 modules / 87 field slugs carry plain-word labels in the five journal locales, and the server's accept set is the worker's own families plus the engagement's relationship — never a client-posted slug. A profession without an `esco_uri` (15 of 49; `teacher`, `caregiver` unmapped on purpose) composes nothing on this path — nothing is manufactured for it. On the way, the journal page now filters contexts by the canonical PROFESSIONAL_HISTORY_RELATIONSHIPS (a placement context the chat could write into was invisible to the page). PARTIAL because no human has walked the section, the organization views or the module fields on production; it never manufactures precision the rows do not hold.",
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
    note: "One frozen fork is reachable at /match-preview. STEP D (2026-09-14) tested it against the five-point convergence proof and classifies the DUPLICATE FINDING AS FALSE — preserve both. The fork and `match-v1` differ on every axis that matters: PERMISSIONS (anonymous marketing page vs authenticated board), PROVENANCE (two hand-typed intake schemas vs a subject assembled from the person's real rows with manager_confirmed/work_journal/self_declared tiers), LIFECYCLE (nothing persisted vs a board carrying interest and booking), and USER INTENT (a stranger deciding whether to sign up vs a member deciding whether to raise their hand). The fork's output shape is also the HONEST one for its input: it returns five blocker verdicts and refuses to produce a score, because there is no evidence behind typed input — re-pointing it at the canonical engine would run an evidence-weighted ranking over data with no provenance and hand a stranger a weak verdict for a perfect fit. Copy verified honest ('preview tool … does not book or save'). It remains real debt (two engines to maintain) and stays FROZEN by `staffing-fit-frozen.test.ts`; it is not a convergence candidate.",
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
    note: "Admin route only — that is the real gap, and it is a REACHABILITY gap, not a missing engine: `matchTeamToNeed` is complete (coverage, set blockers, per-member results, honest `insufficient_data` terminals). Re-measured 2026-09-09: 0 teams exist, so connecting it to the employer surface would today render an honest empty state — worth doing, but it is adoption that is missing, not the matcher. The clause 'no team exists to match' was true about the DATA and was being read as a statement about the capability; the team layer itself is applied and live (see WRK-6). A brigade can now also SAY it is available in all five routed locales — `a-brigade-can-offer-itself.test.ts`. STEP B (2026-09-14) STOPPED the employer surface on a missing consent relation, not on effort. The plan scopes it 'reachable only where a team has offered its supply against that employer's demand' (ARCH-4). No such relation exists: `team_enquiries` runs employer -> team and carries NO demand / customer_request reference, so consent there is ORG-scoped, not DEMAND-scoped. Implementing B4 as written needs a new demand-linked offer relation (NEW + migration, not authorized in Step B); implementing it on `team_enquiries` instead would silently widen the consent boundary the owner set in ARCH-4 from one demand to every demand that employer holds. That is an owner decision. Production 2026-09-14: 0 teams, 0 team_enquiries, 0 team_details — nobody is served either way today."
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
    status: "PARTIAL",
    strongestEvidence: "PRODUCTION_RPC_PROVEN",
    anchors: [
      "lib/opportunities/saved-search-model.ts",
      "lib/opportunities/saved-searches.ts",
      "components/app/saved-searches-strip.tsx",
    ],
    coreModule: "lib/opportunities/saved-search-model.ts",
    surfaces: ["app/[locale]/dashboard/opportunities"],
    note: "APPLIED TO PRODUCTION 2026-09-14 (ledger 20260914144310), owner approval same message, Decision 2, applied after Decision 1 was verified. The only item in the wave that genuinely needed new storage. THE GAP, in the register’s own earlier words: \"Bookmarks exist; a recurring query that notifies does not\" — `worker_saved_opportunities` remembers ONE opportunity already found; nothing remembered the QUESTION. ONE worker-owned table with three gated RPCs, shaped on the saved-opportunities precedent. NO second notification path and no second matcher: the alert is one more `notification_events` type written by the ONE audited emitter honouring the SAME preferences, and the matching is `applyDiscoveryFilters` — the board’s own — run over the cards the worker’s own read returned, so the count and the results cannot disagree. POINTER-ONLY like the weekly digest, exactly-once per search per ISO week through a deterministic entity id whose implementation was DE-DUPLICATED out of the digest emitter rather than copied. SEP-7: `newSinceSeen` is null, never zero, when a match carries no date, and an unknown count can never raise an alert. No demand facts are copied, so a saved search cannot go stale. BOUNDARIES PROVEN ON PRODUCTION in one rollback-guaranteed probe, acting as the `authenticated` role with a real `request.jwt.claim.sub`, first as one worker then as another: the saving worker saw 1 row, a DIFFERENT worker saw 0; an eighth criteria key was refused by the CHECK; a direct INSERT bypassing the RPC was refused with `permission denied for table worker_saved_searches`. Readback: 0 rows. Post-apply readback also confirms exactly ONE policy and it is SELECT, table ACL `authenticated=r`, all three RPCs `authenticated=X` with `anon` absent, the type constraint a strict superset (still carries `weekly_digest`), and notification preference rows still 0 — so NO email was activated by the apply (that channel defaults off, needs explicit opt-in, and needs a transactional path that is not configured). Pre-apply the paired db-proof (`scripts/db-proof/worker-saved-searches.sh`, 26/26) caught two defects that would otherwise have reached production: a CHECK containing a subquery (illegal in PostgreSQL — the apply would have failed) and a rollback whose data guard printed its refusal and then dropped the table anyway. Stays PARTIAL: delivery reaches a worker who opens the board — reaching those who do not is the email half, deliberately owner-gated behind notification consent.",
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
    note: "STEP D (2026-09-14) classifies this duplicate finding FALSE: the vocabularies describe four different SUBJECTS, not one subject four ways. `WORK_CARD_AVAILABILITY_STATUSES` (available|busy|unavailable) is a PERSON's current state on `workers.availability_status`; `TeamAvailabilityStatus` (available_now|available_from|not_available) is a TEAM's deployability on `team_details`, pairing a state with a start date; `ASSET_AVAILABILITY` (available|assigned|maintenance|retired) is EQUIPMENT. Different subject, table, lifecycle and authority in each case — they share only the English word 'available'. Worker availability itself is read consistently against one literal across admin/league, launch-readiness and worker-readiness: no same-subject duplication found. Converging them would collapse three real distinctions.",
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
      "The three-state fix is ON MAIN (#1600, `lib/conversation/capacity.ts`) — the previous note, that it sat in an open RED PR, was stale. Capacity no longer reads one signal: FREE means neither an approved absence nor a commitment overlaps the window, UNAVAILABLE means an absence does, COMMITTED means only work does, and an input that did not answer is reported as unknown (`absencesKnown` / `commitmentsKnown`) rather than as 'no' — SEP-7 held at the read. Re-measured on production 2026-09-08, unchanged from the day the defect was found: `worker_absences` 0 rows, `booking_requests` 1 accepted, `project_worker_assignments` 3 active, so the two signals that were invisible are exactly the ones carrying all the real data. CORRECTED 2026-09-14: this said PARTIAL “rests on CAL-3’s four incompatible availability vocabularies, which remain recorded debt” — but STEP D classified that finding FALSE the same week (four different SUBJECTS, not one subject four ways; converging them would collapse three real distinctions). Two register rows contradicted each other about the same fact, which is the defect the journey guard’s own header warns about. PARTIAL now rests on something measured instead: the assessment can say “I could not tell” — `unknownWorkerIds`, a stated language level outside the closed CEFR set — and until 2026-09-14 that reached no screen at all. The count is now carried to the planning zone (`unknownCapacityWorkers`) and rendered beside the shortfall, so a manager reads the number WITH its uncertainty rather than a confident figure built partly on people nobody could assess. What keeps it PARTIAL: only the LANGUAGE dimension can currently produce an unknown — skills and certificates answer yes/no with no third state — so a worker whose certificate cannot be interpreted is still silently a miss.",
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
    note: "Nothing exists past `accepted`; the expiry RPC has no scheduler — and STEP C found the scheduler is not the blocker. `expire_stale_booking_requests_v1` raises 'Admin only' unless `auth.uid()` is non-null and `is_admin()`, and is granted to `authenticated`, not service_role; a Vercel cron request is a machine with no identity. The platform DOES already have a scheduler (vercel.json crons + `authorizeCronRequest`, fail-closed) — what is missing is an authority path for a machine caller, which is RED. Everything past `accepted` is separate and needs new state.",
  },
  {
    id: "CAL-7",
    domain: "time_capacity",
    title: "Capacity reservation",
    worldElement: "organizations",
    status: "PARTIAL",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/workforce/commitment-reservation.ts", "lib/planning/worker-reservation.ts"],
    coreModule: "lib/workforce/commitment-reservation.ts",
    surfaces: ["app/[locale]/dashboard/projects"],
    note: "Built by REUSE — no table, no RPC, no migration (owner-approved 2026-09-14, E2). The product could already answer \"who is free this week?\"; nothing asked at the moment somebody is COMMITTED. `reserveCapacity` is the one reservation rule and imports the calendar’s inclusive-range overlap from `planning-model` rather than forking it; `checkWorkerReservation` composes the two EXISTING authorized employer reads (`getEmployerWorkerCommitments`, `getEmployerWorkerAvailability`) and adds no query of its own; since 2026-09-14 the first of those also carries APPROVED business trips, so “already somewhere else” finally includes actually being somewhere else. It WARNS and cannot prohibit (SEP-2): the verdict has three states and no refusal, it is computed AFTER the assign RPC inside a try/catch so it can never fail a write, and it rides back on the OK result. `clear` is issued only when every source answered — an unreadable read, an undated window, or an assignment to an undated project all yield `unknown` with a named reason (SEP-7); `getEmployerWorkerCommitments` gained `undatedProjects` so those stop being silently dropped. Absence carries no label at any step, so an employer learns THAT, never why. PARTIAL because ONE commitment moment is wired — the manager assigning someone to a project. BOTH its surfaces now state the same verdict: the projects page renders the collisions as a list, and the chat, whose `company.assign-worker` / `company.move-worker` executors first DISCARDED it, appends the fact and the count to its success sentence. (An earlier note here claimed closing that needed a cross-cutting change to the shared inline-action “done” state; that was wrong — the chat’s assign path is its own callback, `runAssignWorker`, and the connection was local. Corrected 2026-09-14.) `unknown` is its own sentence on both surfaces and the note rides the SUCCESS branch only, so it can never become a refusal. Booking accept already has its own DB-level overlap guard; agency placement and demand commitment do not consult this yet.",
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
    status: "PARTIAL",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/workforce/utilisation.ts", "lib/planning/roster-utilisation.ts"],
    coreModule: "lib/workforce/utilisation.ts",
    surfaces: ["app/[locale]/dashboard/company/planning"],
    note: "Built by REUSE — no table, no RPC, no migration (owner-approved 2026-09-14, E4). NOT FTE, and the code says so: checked across every migration 2026-09-14, the schema records no PERSON-side contracted hours, FTE fraction or working pattern. `hours_per_week` does exist — twice, both inside the DEMAND payload projection, i.e. what an opening asks for; treating that as a worker’s capacity would collapse SEP-4 (DEMAND ≠ SUPPLY), and a guard names those two occurrences so a third gets reviewed. With no available time to divide by, a percentage against an assumed 8-hour day or 5-day week would be a number invented in code and read as a measurement. `measureUtilisation` therefore answers the narrower question it can measure — how many days of a STATED window a person is already committed for — and exports UTILISATION_DENOMINATOR = calendar_days so no caller can mistake \"18 of 30 days\" for \"60% FTE\"; the window travels with every answer. Days are counted as a SET, so two overlapping commitments are one committed day and nobody is 200% committed. Four states (SEP-7): `measured`; `partial` when something real cannot be placed on a calendar, where the counts are a FLOOR and the ratio is withheld because a ratio on an incomplete numerator looks complete; `unknown` with NULL counts when a source could not be read, never zero; `invalid_window`. The roster summary counts only the workers it could count into the denominator and issues a percentage only when EVERY worker is measured. Reuses the CAL-7 commitment and gap vocabulary and the same two authorized employer reads — including, since 2026-09-14, approved business trips, so a person away for three days is no longer counted as free for them. PARTIAL: this is COMMITTED-day coverage, not worked-vs-available utilisation — the latter stays unbuildable until the product records a capacity denominator, and inventing one is the thing this entry refuses to do.",
  },
  {
    id: "CAL-10",
    domain: "time_capacity",
    title: "Planned vs actual → learned duration / capacity",
    worldElement: "projects",
    status: "PARTIAL",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/workforce/learned-duration.ts", "lib/projects/learned-stage-duration.ts"],
    coreModule: "lib/workforce/learned-duration.ts",
    surfaces: ["app/[locale]/dashboard/projects/[id]/operations"],
    note: "Built by REUSE — no table, no RPC, no migration (owner-approved 2026-09-14, E3). Both halves already existed: every `project_stages` row carries planned_start/planned_end AND actual_start/actual_end, so every finished stage has been a measured planned-vs-actual answer since 20260718140000, and nothing read them back. `learnDurations` groups finished stages by a casefolded stage name — no stemming, no synonym table, because guessing that two names mean the same work would pool two bodies of evidence invisibly — and reports the median actual, the median planned and the median of the PER-OBSERVATION ratios (never the ratio of the medians, which would pair one stage’s plan with another’s outcome). SEP-1 is the whole discipline: nothing is written, nothing is cached, the reading is derived on every render, there is no `predictedDays` field anywhere, and a guard fails any migration that gives a learned duration a table. Sparse evidence stays sparse — below MIN_OBSERVATIONS=3 the medians are null and only the count is reported, and the panel renders nothing at all. Provenance rides with each reading (count, first/last observed day, source row ids). A stage marked done with no recorded actual dates is skipped, not assumed to have met its plan. PARTIAL: one surface reads it (the project operations board) and the unit of learning is the stage name; duration learned per profession, per team or per productivity unit is not attempted.",
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
    strongestEvidence: "PRODUCTION_RPC_PROVEN",
    anchors: ["lib/assets"],
    coreModule: "lib/assets/assets-model.ts",
    surfaces: ["app/[locale]/dashboard/company"],
    note: "APPLIED TO PRODUCTION 2026-09-14 (ledger 20260914144053), owner approval \"OWNER APPROVAL — BOTH RED APPLIES APPROVED\" Decision 1. THE DEFECT IT CLOSED: `issue_asset_v1` checked authority, required a target and validated the condition enum, then inserted an `issued` assignment and set `assets.availability = assigned` WITHOUT testing current availability, without checking for an existing open assignment, and without `for update` — so two managers could issue the same physical asset twice, and `lib/assets/assets.ts` kept only the FIRST open assignment per asset, hiding the second from the very screen that should have shown it. THE FIX: a partial unique index on one open assignment per asset, plus `select … for update` on the asset row in issue/transfer/return before any decision is read. PROVEN ON PRODUCTION, read-only plus two rollback-guaranteed probes (final RAISE aborts the transaction; readback confirmed 0 assets / 0 assignments after each): the index refused a second open assignment (`duplicate key value violates unique constraint \"asset_assignments_one_open_per_asset\"`), and the REAL RPC path, called as a live org manager, issued once then refused with \"asset is already issued and must be returned before it can be issued again\" and refused a maintenance asset with \"asset is not issuable while it is maintenance\". The two-session concurrency half (loser BLOCKING 2046ms on the row lock) was proven pre-apply on a real PostgreSQL 16 cluster against byte-identical bodies (`scripts/db-proof/asset-single-open-assignment.sh`, 22/22) — two concurrent sessions cannot be held through the MCP transport. AUTHORITY UNCHANGED, measured: the three lifecycle RPCs’ ACLs read `postgres=X | authenticated=X` both before and after, with `anon` absent in both, and the policy count on `assets` / `asset_assignments` is unchanged. Production exposure: 0 assets, 0 asset_assignments — the fix is in place ahead of first use. Stays PARTIAL because the asset surface itself is one manager screen: no handover signature, no condition photo, no maintenance schedule.",

  },
  {
    id: "MKT-4",
    domain: "marketplace",
    title: "Proposals / contracts / agreements",
    worldElement: "organizations",
    status: "PARTIAL",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/agreements"],
    coreModule: "lib/agreements/agreements.ts",
    surfaces: ["app/[locale]/dashboard/commercial"],
    note: "Three stores, 0 rows; `contracts` is legacy of `agreements` (debt).",
  },
  {
    id: "MKT-5",
    domain: "marketplace",
    title: "Procurement",
    worldElement: "organizations",
    status: "PARTIAL",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/procurement"],
    coreModule: "lib/procurement/procurement.ts",
    surfaces: ["app/[locale]/dashboard/finance"],
    note:
      "Corrected 2026-09-15 (falsifiability sweep). Claimed `no_navigation` with nothing named. Measured: `lib/procurement/procurement.ts` is the read service and `ProcurementSection` renders on `/dashboard/finance` (page line 280). That route is NOT orphaned — `/dashboard/reports` and `components/app/commercial-panel.tsx` both link to it. Production: `procurement_inquiries` 0, `procurement_offers` 0 — adoption, not reachability.",
  },
  {
    id: "MKT-6",
    domain: "marketplace",
    title: "Business trips",
    worldElement: "objects",
    status: "PARTIAL",
    strongestEvidence: "TEST_PROVEN",
    anchors: ["lib/trips"],
    coreModule: "lib/trips/trips.ts",
    surfaces: ["app/[locale]/dashboard/finance"],
    note:
      "Corrected 2026-09-15 (falsifiability sweep). Claimed `no_navigation` with nothing named. Measured: `lib/trips/trips.ts` is the read service and `TripsSection` renders on `/dashboard/finance` (page line 285), a route with real inbound links. This row was especially wrong in context: business trips already participate in commitment/capacity reality (commit b7b7936), so a capability feeding the planning loop was recorded as reachable by nobody. Production: `business_trips` 0, `business_trip_events` 0 — adoption.",
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
    coreModule: "lib/lmc/lmc-account.ts",
    surfaces: ["app/[locale]/dashboard/account"],
    deferredByDesign: true,
    note: "Corrected 2026-09-15: SEVEN lmc_* tables are live in production (lmc_accounts, lmc_account_balances, lmc_lots, lmc_lot_balances, lmc_lot_consumptions, lmc_transactions, lmc_settings), not five — re-counted from information_schema, and the note had drifted. Sixteen RPCs live; all six flags remain false in code AND in the database. Spend has no reversal — that is the recorded blocker, and it is why this stays ARCHITECTURE_ONLY + deferredByDesign even though the machinery exists: the capability is deliberately unarmed, not unbuilt. Arming it is MKT-7, an owner decision (two independent owner acts). The row now names `lib/lmc/lmc-account.ts` and `/dashboard/account`, where LmcBalanceSection renders the disabled state — so the claim is checkable rather than merely asserted. Naming them does not arm anything.",
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
    note: "0 rows; the expiry RPC has no caller, so requests never expire. STEP C established WHY, and it is not a missing cron entry: `expire_contact_disclosure_requests_v1` is granted to `authenticated` only (never service_role) and returns not_authorized unless `auth.uid()` is non-null AND `is_admin()`. A scheduler is a machine with no user identity, so it cannot satisfy either condition. Connecting it needs a grant change plus an authority-model change — RED, owner gate. The same is true of `expire_stale_booking_requests_v1` (CAL-6) and `expire_stale_team_enquiries_v1`.",
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
    coreModule: "lib/notifications/weekly-digest-emitter.ts",
    surfaces: ["app/[locale]/dashboard/activity"],
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
      "THE 'ONE REAL GAP' THIS ROW CARRIED IS CLOSED, and the row said otherwise for five days. It asserted, as current truth, that a programme cannot be CORRECTED - 'there is no update function in `pg_proc`', so a field skipped once is skipped permanently and the one live programme 'reads `demandUnknown` and always will'. Every clause of that was measured false against production on 2026-09-13: `update_education_program_v1(uuid,text,text,text,text)` EXISTS (SECURITY DEFINER, migration `20260908120000_education_program_correction_v1`), `EditProgramForm` is MOUNTED in `institution-programs-section.tsx` beside the create form, and the single live programme now carries `builder` / `vocational` - it has in fact been corrected. The fix shipped on 2026-09-08 and this note was never updated with it. A register REDDER than the product is not a safe error: this one told two windows to go build a correction path that already existed. " +
      "WHAT IS STILL TRUE: one programme, one cohort, ZERO members in production - the vertical has never run end to end. All five write paths are present and reachable on `/dashboard/company` (create programme, correct programme, create cohort, assign learner, remove member) and production holds 1 accepted `student` invitation, so the assignable list is not empty. What is missing is a human doing it, not a control to do it with.",
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
    coreModule: "lib/learning/learning.ts",
    surfaces: ["app/[locale]/dashboard/learning"],
    note:
      "Made FALSIFIABLE 2026-09-15 without changing the verdict. The row claimed `orphan_route` while naming no module and no surface, so the claim could not be checked at all - the same unfalsifiable shape as WRK-8. It now names `lib/learning/learning.ts` and `app/[locale]/dashboard/learning`, and the claim VERIFIES: grep finds ZERO inbound links to `/dashboard/learning` from any route or component outside its own directory, so a person reaches it only by typing the URL. THE LIMITATION IS DELIBERATE AND PRESERVED - EDU-5 remains parked on F-N1 by owner instruction and this sweep does not bypass it; the capability stays BUILT_NOT_CONNECTED. Note the module IS imported (the learning page and two sections import it), which is exactly why `orphan_route` and not `no_importer` is the right kind: the code is reached, the ROUTE is not. Production: `learning_review_queue` 0, `learning_signals` 0. ORIGINAL NOTE: /dashboard/learning has zero inbound links — re-checked 2026-09-07: every reference to it in the codebase is a `revalidatePath` call, and no surface anywhere carries an href to it. A person can only arrive by typing the URL. Measured 2026-09-08: `learning_signals`, `learning_review_queue` and `learning_policy_settings` all hold 0 rows and no learning route carries a surfaceRoute in the dashboard module registry. Genuinely unreachable - this one is correct.",
  },
  {
    id: "EDU-6",
    domain: "education",
    title: "Institution reporting",
    worldElement: "organizations",
    status: "BUILT_AND_USABLE",
    strongestEvidence: "PRODUCTION_DATA_PATH_PROVEN",
    anchors: ["lib/education/programs.ts", "lib/education/institution-report.ts"],
    coreModule: "lib/education/programs.ts",
    surfaces: ["components/app/institution-programs-section.tsx"],
    note:
      "CORRECTED 2026-09-08. This row said MISSING with no anchors, no surfaces and 'Programmes exist; no report and no export', and the journey register repeated it as 'an institution cannot see employer demand'. HALF of that was already false, and a register REDDER than the product is not a safe error: it invites the next window to build a demand reader that exists, which is how a second demand model gets born. " +
      "WHAT IS BUILT AND MEASURED ON PRODUCTION: `readInstitutionPrograms` already composes `count_public_vacancies_by_profession_v1`, the canonical per-profession count over the public vacancy pool. Verified live: the function EXISTS, returns 39 professions with real active-vacancy counts, and holds EXECUTE for `authenticated` and NOT for `anon`. `institution-programs-section.tsx` renders it per programme at `program-demand-<id>`, and the surface is mounted on `/dashboard/company`, so it is reachable by a training-provider manager rather than orphaned. It is also HONEST where it cannot answer: a programme with no target profession renders `demandUnknown`, never 0 - SEP-7 held at the surface. Nothing here needed building; it needed measuring. " +
      "BOTH OF THE GAPS THIS ROW NAMED ARE NOW CLOSED, 2026-09-13. It said two things were missing. " +
      "THE SECOND WAS ALREADY FALSE WHEN IT WAS WRITTEN, and stayed on the row for five days: 'production\'s single programme carries NO target profession ... a programme is immutable after creation ... no update function exists in `pg_proc`'. Measured against production 2026-09-13: the update function EXISTS (SECURITY DEFINER, migration `20260908120000`), its form is mounted beside the create form, and the live programme carries `builder` / `vocational`. See EDU-2, corrected in the same pass. " +
      "THE FIRST - no report and no export - WAS REAL AND IS NOW BUILT: `lib/education/institution-report.ts` (PURE, DB-free) serialises the two reads this surface already performs into a CSV, served by the export route under `/dashboard/company/institution-report/`, linked from this section whenever there is a programme to report on. It opens NO second reader: the programme half is `readInstitutionPrograms`, the outcomes half is the single permitted caller of the learner-outcomes aggregate, so the file cannot disagree with the screen. Authorisation is BORROWED, not re-implemented - the organisation id arrives in the query string as a CLAIM, and the outcomes read (manager of a `training_provider` organisation, 42501 to anyone else) runs first and decides; the route refuses 503 rather than export when that gate is itself unreachable. The honesty rules travel with the data: an unmeasured demand prints `unknown` and never `0` (SEP-7), a count the k-anonymity floor nulled prints `suppressed` and never `0`, and no person appears in the file - the programme block counts learners, it never names one. " +
      "WHERE THE REMAINING UNKNOWN IS. The demand read is PRODUCTION_DATA_PATH_PROVEN; the EXPORT is TEST_PROVEN only - it is new, no human has downloaded it and it has not been run against production. " +
      "AND A CORRECTION THIS ROW TOOK THREE ATTEMPTS TO GET RIGHT, recorded because the shape of the mistake matters more than the value. Version one claimed the live programme\'s tile \'reads `demandUnknown`\'; it did not, it read \'0 live vacancies\', because `readInstitutionPrograms` mapped an absent profession to `?? 0`. Version two \'fixed\' that by returning null for every absence - which HID a real zero. Both are the same defect: an unknown dressed as a zero, then a zero dressed as an unknown. " +
      "THE MEASURED TRUTH, taken directly from production 2026-09-13: the reader asks `count_public_vacancies_by_profession_v1` for `p_limit: 100` and gets 39 rows. 39 < 100, so the grouping is EXHAUSTIVE - every profession with an active public vacancy is in it. `builder` is absent, and `public_vacancies` holds ZERO active unexpired builder rows. The tile therefore correctly reads 0 live vacancies, and the export correctly writes 0. The earlier \'20 professions, not the 39 recorded on 2026-09-08\' line in this row was my own measurement error - I called the function at its DEFAULT limit of 20 instead of the limit the application passes. The 2026-09-08 figure of 39 was right. " +
      "The rule now lives once, in `lib/market/public-demand`: absence is a measured ZERO when the list came back shorter than the limit it asked for, and NOT MEASURED when it came back full. `lib/learning/learning-compass.ts` already had it correct and inline while `programs.ts` carried a second, wrong copy - two readers of one function answering differently about the same profession. Both now read the one rule.",
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
    note: "47 real runs with real spend. SEVEN of the thirteen registered agents have zero call sites (admin_risk, booking_risk, country_readiness, document_assistant, skill_evidence, support_onboarding, translation_copy) — this note said SIX until it was counted on 2026-09-14; the count is now derived by `lib/guards/ai-agent-call-sites.test.ts` so it cannot drift again. Each one's domain is already answered DETERMINISTICALLY and connected (documents-gap, readiness-overview, skill-pipeline, the booking-conflict logic, the DeepL route, the country-readiness matrix), so giving them call sites would add a second model-based answer beside a working one, or seven new surfaces — an owner decision, not a wiring task.",
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
    coreModule: "lib/i18n/config.ts",
    surfaces: ["components/layouts"],
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
