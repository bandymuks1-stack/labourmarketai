/**
 * PERMANENT JOURNEY CONTRACTS — the chains that must not break.
 *
 * Owner text, window 10 (2026-09-07), recorded in
 * `docs/PRODUCT_CONSTITUTION.md` §16.
 *
 * WHY THE EXISTING REACHABILITY GUARDS ARE NOT ENOUGH. This repository has 800+
 * guards, several of them named `*-reachability.test.ts`, and every one asserts
 * that a specific link a human once thought of still exists. On 2026-09-07 the
 * reconciliation found capabilities that were built, tested, merged and
 * unreachable — `work-verification-state.ts` with zero consumers, the employer
 * calendar that never calls `getPlanning()`, `/dashboard/learning` with no
 * inbound link, a complete service-offering loop nobody can open. Not one guard
 * failed, because a route rendering is not a journey working.
 *
 * So a journey is declared as an ORDERED CHAIN, and every link carries its own
 * honest state. A link may be `LIVE`, `BROKEN` or `NOT_BUILT` — and `BROKEN`
 * and `NOT_BUILT` must say why, in words, in the file. The guard
 * (`lib/guards/product-graph-journeys.test.ts`) enforces BOTH directions:
 *
 *   · a link claiming LIVE whose capabilities are not live is a CI failure —
 *     nobody can mark a chain green by hoping;
 *   · a link claiming BROKEN or NOT_BUILT that is REDDER than every capability
 *     under it is also a CI failure — added 2026-09-08, after five steps had
 *     drifted that way while CI stayed green.
 *
 * The second direction was missing for a reason worth remembering: underclaiming
 * feels safe. It is not. `product-truth.mjs` prints these steps as "the real
 * backlog", so a stale BROKEN tells the owner and every future agent that
 * something which works does not — and it lets the two registers contradict
 * each other in the one place the product records its own status.
 *
 * Journey ids are PERMANENT. A journey is retired by recording a retirement,
 * never by deleting it — a deleted journey is a product that got smaller with
 * nobody noticing.
 *
 * Pure data. No IO.
 */

export type JourneyActor = "worker" | "company" | "agency" | "institution" | "any";

export type LinkState =
  /** Every capability behind this step is live and a human path reaches it. */
  | "LIVE"
  /** The pieces exist and the chain does not connect. Must say why. */
  | "BROKEN"
  /** Not built at any layer. Must say why it is still in the contract. */
  | "NOT_BUILT";

export interface JourneyStep {
  /** What actually happens, in the actor's language. */
  readonly step: string;
  /** Capability ids from `capability-register.ts` that carry this step. */
  readonly capabilities: readonly string[];
  readonly link: LinkState;
  /** Required for BROKEN and NOT_BUILT. The honest reason. */
  readonly because?: string;
  /** The strongest proof this specific step has actually reached. */
  readonly proof?: string;
  /**
   * Deliberate acknowledgement that this BROKEN step's every capability is
   * BUILT_AND_USABLE, so the break is in the CONNECTION between them and not
   * in any one part. The guard demands it, because the far commoner cause of
   * that shape is a stale step: five of them were on 2026-09-08. Setting it
   * means `because` must name what fails BETWEEN the capabilities.
   */
  readonly breakIsBetweenCapabilities?: true;
}

export interface Journey {
  /** Permanent id. Never reused, never deleted. */
  readonly id: string;
  readonly actor: JourneyActor;
  readonly title: string;
  /** Why this chain matters to the product, not to the code. */
  readonly why: string;
  readonly steps: readonly JourneyStep[];
  readonly retired?: { readonly on: string; readonly why: string };
}

export const JOURNEY_REGISTER: readonly Journey[] = [
  {
    id: "J-WORKER-EVIDENCE",
    actor: "worker",
    title: "Real work → journal → evidence → verification → living profile → capability",
    why: "The chain that makes a person's history an asset instead of a claim. If it breaks, the product is a CV builder.",
    steps: [
      {
        step: "A person records what they actually did",
        capabilities: ["EVID-0"],
        link: "LIVE",
        proof: "HUMAN_UI_PROVEN — chat and journal transports reach one core",
      },
      {
        step: "The entry carries photos, tasks and hours",
        capabilities: ["EVID-4", "EVID-5"],
        link: "LIVE",
        proof: "PRODUCTION_PERSISTENCE_PROVEN — 8 photos live",
      },
      {
        step: "The entry knows whether anyone can verify it, and says so",
        capabilities: ["EVID-3"],
        link: "LIVE",
        because: undefined,
        proof: "TEST_PROVEN only — wired 2026-09-07, never walked by a human",
      },
      {
        step: "A manager receives and confirms it",
        capabilities: ["EVID-2"],
        link: "LIVE",
        proof: "HUMAN_UI_PROVEN — 13 confirmations in production, 3 of them self-confirmed",
      },
      {
        step: "Confirmation raises the evidence tier, and self-confirmation does not read as employer confirmation",
        capabilities: ["SKL-3"],
        link: "LIVE",
        proof: "HUMAN_UI_PROVEN",
      },
      {
        step: "Recognised skills land on the living profile",
        capabilities: ["SKL-2", "PER-5"],
        link: "LIVE",
        proof: "HUMAN_UI_PROVEN — deterministic, no AI required",
      },
      {
        step: "Demonstrated capability is recognised against a formal requirement",
        capabilities: ["SKL-9"],
        link: "NOT_BUILT",
        because:
          "RPL / equivalence exists at no layer. It stays in the contract because 'five years of real work' currently reads as 'certificate missing', which is the wrong answer, not a missing feature.",
      },
    ],
  },
  {
    id: "J-COMPANY-EXECUTION",
    actor: "company",
    title: "People → project/site → assignment → capacity → need → supply → execution → report → verified history",
    why: "The chain that makes a company a living workforce actor instead of a profile with vacancies.",
    steps: [
      {
        step: "The company knows who it has",
        capabilities: ["ORG-3", "ORG-6"],
        link: "LIVE",
        proof: "PRODUCTION_PERSISTENCE_PROVEN — with four parallel roster truths as recorded debt",
      },
      {
        step: "It creates a project and a site",
        capabilities: ["WRK-1", "WRK-2"],
        link: "LIVE",
        proof: "PRODUCTION_PERSISTENCE_PROVEN — 9 projects, 1 work object",
      },
      {
        step: "It assigns people to the project",
        capabilities: ["WRK-5"],
        link: "LIVE",
        proof: "PRODUCTION_PERSISTENCE_PROVEN — assignment warns on overlap, never blocks (SEP-2)",
      },
      {
        step: "It assigns a whole team or brigade",
        capabilities: ["WRK-6"],
        link: "BROKEN",
        because:
          "NOT_BUILT → BROKEN, 2026-09-15: the ASSIGNING now exists and the UNIT does not. From the team panel a manager assigns the whole brigade to a project they manage; each member goes through the ONE existing per-person write and the database's own gates, each outcome is named, and each assigned member's calendar gets its own verdict for the project's window — so a brigade assignment cannot silently put a person in two places (WRK-6 PARTIAL, TEST_PROVEN). What does not exist is the record that they were assigned AS A UNIT: no team↔project link, so the brigade cannot be ended as one act and a brigade match has nothing to point at. That link is new schema — RED, owner-gated — and its packet is the remaining half. Production holds 0 teams (a human fact, not a code gap), so no walk is possible until someone creates one.",

      {
        step: "It sees who is free and who is committed",
        capabilities: ["CAL-4", "CAL-3"],
        link: "LIVE",
        proof:
          "PRODUCTION_DATA_PATH_PROVEN — the three-state read is on main (`lib/conversation/capacity.ts`, #1600) and consults all three signals, not one. Re-measured on production 2026-09-08 and unchanged from the day the defect was found: `worker_absences` 0 rows, `booking_requests` 1 accepted, `project_worker_assignments` 3 active. FREE means neither an absence nor a commitment overlaps the window, UNAVAILABLE means an absence does, COMMITTED means only work does — and an input that did not answer is reported as unknown (`absencesKnown` / `commitmentsKnown`), never as 'no'. CAL-3's four availability vocabularies remain recorded debt, which is why the capability stays PARTIAL while this step is live.",
      },
      {
        step: "It records a need",
        capabilities: ["DEM-1"],
        link: "LIVE",
        proof: "HUMAN_UI_PROVEN — 20 real requests",
      },
      {
        step: "It discovers external supply for that need",
        capabilities: ["DEM-9", "DEM-5"],
        link: "LIVE",
        proof:
          "PRODUCTION_RPC_PROVEN — the reader is no longer a rolled-back candidate. `20260907153000_employer_supply_discovery_v1` was owner-approved (DEM-9, gate HG-2026-09-07) and APPLIED as ledger `20260907180546`, and the app half shipped on main in #1600 (`lib/supply/employer-supply-discovery.ts` → `AvailableSupplySection`, rendered unconditionally near the top of the scouting page so an employer with no demand of their own still sees it). Re-measured against the LIVE function on 2026-09-08 under four real auth contexts: a manager of two organizations who authored neither row saw 2 of 2; the agency that authored one saw 1 of 2 (self-exclusion holds); a manager of one organization saw 2 of 2; a person who manages nothing saw 0 with no error; `anon` is refused `42501` at the privilege level, not merely filtered. DEM-5 stays PARTIAL — matching that supply to the need is the weaker half, discovery is not.",
      },
      {
        step: "Work is executed and reported",
        capabilities: ["EVID-0", "EVID-5", "WRK-7"],
        link: "LIVE",
        proof: "HUMAN_UI_PROVEN",
      },
      {
        step: "The report becomes verified history the company can rely on",
        capabilities: ["EVID-2", "EVID-6"],
        link: "LIVE",
        proof: "PRODUCTION_PERSISTENCE_PROVEN — and the subject's right of reply became readable on 2026-09-07; it had been write-only since the domain shipped (EVID-6)",
      },
    ],
  },
  {
    id: "J-AGENCY-SUPPLY",
    actor: "agency",
    title: "Declare workforce supply → discoverable to authorized demand → demand → match → assignment",
    why: "Organizational supply is not a job application. If this chain breaks, the product silently becomes demand-only and an agency's capacity reads as its need.",
    steps: [
      {
        step: "An agency declares available workforce as SUPPLY, not as a need",
        capabilities: ["DEM-2"],
        link: "LIVE",
        proof: "HUMAN_UI_PROVEN — kind `agency_offer`, shipped 2026-09-06 (#1587)",
      },
      {
        step: "Every surface reads that direction correctly",
        capabilities: ["DEM-2"],
        link: "LIVE",
        proof:
          "PRODUCTION_RPC_PROVEN — the database half is applied. Every own-rows surface classifies direction (#1588/#1596, then the market map, the org demand rollup, the scouting list and the chat starter count), and the half that was missing — `list_open_demand_for_workers` having no `kind` to classify — closed when `worker_board_excludes_supply_v1` was applied as ledger `20260906194911` (with `agency_board_excludes_supply_v1` as `20260906202628`). Re-measured on production 2026-09-08 under a real worker's auth: the board served 7 rows and leaked 0 of the 3 `agency_offer` rows. SUPPLY is never served as DEMAND, on the surfaces or under them.",
      },
      {
        step: "An authorized employer can discover that supply",
        capabilities: ["DEM-9"],
        link: "LIVE",
        proof:
          "PRODUCTION_RPC_PROVEN — same applied reader as J-COMPANY-EXECUTION (ledger `20260907180546`), re-verified 2026-09-08. It is no longer true that only the declaring agency can read its own declaration: a real employer who authored none of the rows read 2 of 2, and the declaring agency is excluded from its own. What an employer learns is deliberately six non-identifying columns — work type, country, team size, start, duration, declared-at — never the supplying organization's name, profile, notes or contact. Making contact stays a separate consented act, and this read creates no path to one.",
      },
      {
        step: "Supply meets a real need",
        capabilities: ["DEM-5", "DEM-3"],
        link: "LIVE",
        proof: "PRODUCTION_DATA_PATH_PROVEN — 20 criteria, both directions",
      },
      {
        step: "A match becomes a booking and then an engagement",
        capabilities: ["CAL-6"],
        link: "LIVE",
        proof: "PRODUCTION_PERSISTENCE_PROVEN — booking → engagement → project assignment, 1 accepted booking",
      },
      {
        step: "A whole brigade is offered and matched as a unit",
        capabilities: ["DEM-6", "WRK-6"],
        link: "BROKEN",
        because:
          "Corrected 2026-09-14: this said NOT_BUILT — \"not built at any layer\" — while `matchTeamToNeed` is complete (coverage, set blockers, per-member results, honest insufficient_data terminals) and DEM-6 is PARTIAL. The engine exists; the CHAIN does not connect, for one reason: offering a brigade as a unit against a specific demand needs DEMAND-scoped consent, and the only consent relation that exists (`team_enquiries`) is ORGANIZATION-scoped. Substituting it would weaken ARCH-4, so E6 stays owner-blocked. WRK-6 (team → project assignment) is separately MISSING. Production holds 0 teams, so nothing is walkable regardless.",
      },
    ],
  },
  {
    id: "J-INSTITUTION-OUTCOME",
    actor: "institution",
    title: "Programme → cohort → person → practice/work → evidence → competency → qualification → employer demand → outcome",
    why: "A learner's practice must join the SAME living profile as their later employment. A separate student registry would be a second product.",
    steps: [
      {
        step: "An institution holds the training-provider capability",
        capabilities: ["EDU-1"],
        link: "LIVE",
        proof: "PRODUCTION_PERSISTENCE_PROVEN — the relationship is data, not an invitation type",
      },
      {
        step: "It creates a programme and a cohort",
        capabilities: ["EDU-2"],
        link: "LIVE",
        proof: "PRODUCTION_PERSISTENCE_PROVEN — 1 programme, 1 cohort",
      },
      {
        step: "Learners join the cohort",
        capabilities: ["EDU-2"],
        link: "LIVE",
        proof:
          "PRODUCTION_PERSISTENCE_PROVEN (rolled back) — 2026-09-15. This step was BROKEN for 'zero cohort members', and zero rows is adoption, not a broken chain: the honest question is whether the EDGE works, and it was never walked. Walked on production under the real institution manager's auth in ONE transaction (`scripts/db-proof/b4-learner-joins-cohort.sql`): an outsider calling `set_education_cohort_member_v1` was refused `42501 not_manager`; the manager assigning a person NOT linked as a student was refused `42501 not_a_linked_learner`; the manager assigning the linked student succeeded, and the row read back as 1 under the manager's RLS AND as 1 under the student's own RLS, while an outsider read 0; marking `left` set `left_at`. Then rolled back — `education_cohort_members` re-counted at 0, cohorts 1, programmes 1. Every layer above the RPC is mounted: `AssignLearnerForm` → `setCohortMemberAction` → the RPC, on `/dashboard/company` behind the `training_provider` capability, and the assignable list is drawn from accepted `student` invitations (1 in production). What is still weak, and LIVE does not claim otherwise: no human has pressed the button. HUMAN_UI_PROVEN = NO; EDU-2 stays PARTIAL on volume.",
      },
      {
        step: "A learner's practice is recorded as real work on their own profile",
        capabilities: ["PER-7", "EVID-0"],
        link: "LIVE",
        proof:
          "PRODUCTION_DATA_PATH_PROVEN — the filter fix merged as #1290 and is on main. `PRACTICE_RELATIONSHIPS` (student, volunteer) sits in the ONE canonical list in `lib/player-card/work-history-model.ts`, and every consumer reads it rather than a copy: the profile page, the CV export, the worklog engagement read, the capabilities registry and the invite surface. `historyKindOf` derives employment-vs-practice from the relationship and never guesses, so a placement is carried as practice rather than relabelled as a job. Production holds 1 `student` engagement, so the path has real data under it. PER-7 stays PARTIAL on volume, not on correctness — one learner is not yet a proven vertical.",
      },
      {
        step: "Practice becomes evidence and then competency",
        capabilities: ["SKL-2", "SKL-5"],
        link: "LIVE",
        proof: "PRODUCTION_DATA_PATH_PROVEN — 8 transversal capabilities carry the non-trade vocabulary",
      },
      {
        step: "Competency becomes a qualification or a recognised equivalence",
        capabilities: ["SKL-9", "SKL-10"],
        link: "BROKEN",
        because:
          "Corrected 2026-09-14: NOT_BUILT was too red. SKL-9 (RPL / equivalence) is genuinely MISSING and deferred by ARCH-2 — but SKL-10, the training and certification register, is APPLIED and PARTIAL. So a piece of this step exists and the chain does not connect, and it does not connect BY DECISION: the register deliberately writes nothing into the skill ladder, because a certificate is not a demonstrated competency (SEP-6). The missing half is the recognition path, not the register.",
      },
      {
        step: "The institution sees employer demand and reports outcomes",
        capabilities: ["EDU-3", "EDU-6"],
        link: "LIVE",
        proof:
          "TEST_PROVEN for the export, PRODUCTION_DATA_PATH_PROVEN for both reads. This step was BROKEN for two stated reasons and BOTH are now closed, 2026-09-13. " +
          "REASON ONE - 'there is NO REPORT AND NO EXPORT, so the institution can read demand and not take it anywhere' - was real and is now built: `lib/education/institution-report.ts` composes the two reads this surface ALREADY performs into a CSV, served under `/dashboard/company/institution-report/` and linked from the programmes section whenever a programme exists. It opens no second demand or outcome reader, so the file cannot disagree with the screen, and it borrows the outcomes aggregate's own authorisation (manager of a `training_provider` organisation) rather than writing a membership rule of its own. " +
          "REASON TWO - 'the signal is inert in practice ... NO update function exists ... a programme is immutable after creation, production's single programme has no target profession, and its demand number is `demandUnknown` permanently' - was FALSE WHEN WRITTEN and this register repeated it for five days. Read-only SQL against production 2026-09-13 contradicts every clause: `update_education_program_v1(uuid,text,text,text,text)` exists (SECURITY DEFINER, migration `20260908120000`), `EditProgramForm` is mounted beside the create form, and the live programme carries `builder` / `vocational` - it HAS been corrected. Its demand tile shows 0 live vacancies, and that is CORRECT - a measured zero, not a gap. Verified directly on production 2026-09-13: the reader asks `count_public_vacancies_by_profession_v1` for `p_limit: 100` and receives 39 rows; 39 < 100, so the grouping is exhaustive, and `public_vacancies` holds zero active unexpired `builder` rows. THIS STEP HAS NOW CARRIED THE WRONG CLAIM TWICE, in opposite directions - first that the tile read `demandUnknown` when the reader was mapping absence to `?? 0`, then that every absence was unknown when a real zero was being hidden. An unknown dressed as a zero and a zero dressed as an unknown are the same defect (SEP-7 cuts both ways), and both were found by review, not by a test. The rule now lives once in `lib/market/public-demand` - absence is a zero only when the returned list was SHORTER than the limit it asked for - and both readers of that function, this one and the learning compass, share it. " +
          "WHAT IS STILL WEAK, and LIVE does not claim otherwise: no human has downloaded the export and it has not been run against production. HUMAN_UI_PROVEN = NO.",
      },
    ],
  },
  {
    id: "J-IMPORT-HISTORY",
    actor: "any",
    title: "Source → parse → reconciliation → preview → commit → readback → provenance → reversal",
    why: "Historical work is the product's foundational data. An import that cannot be previewed, attributed or reversed is not an import — it is contamination.",
    steps: [
      {
        step: "A person imports their own CV, fact by fact",
        capabilities: ["PER-4"],
        link: "LIVE",
        proof: "HUMAN_UI_PROVEN — extraction proposes, the person confirms each fact",
      },
      {
        step: "An organization imports its own historical work records",
        capabilities: ["EVID-1"],
        link: "LIVE",
        proof:
          "PRODUCTION_DATA_PATH_PROVEN — the recursion that took this down is repaired. The owner approved EVID-1 on 2026-09-08 and `20260907220000_evidence_parties_recursion_fix_v1` was applied as ledger `20260908080950`. Measured against the live database afterwards: all four formerly-recursing tables now read cleanly under a real organization manager where each previously raised `42P17`, and the full write chain ran under that same manager in ONE transaction that was then ROLLED BACK — sessions → people → records `INSERT ... RETURNING` → parties `INSERT ... RETURNING`, returning 1 and 1. Zero residue: all six tables re-counted at 0 afterwards. Both surfaces are reachable — the importer on `/dashboard/company`, the subject's view on `/dashboard/profile`. LIVE describes the CHAIN; EVID-1 stays PARTIAL because no human has yet completed an import and all eight tables still hold 0 rows.",
      },
      {
        step: "An import can never write an attested or verified state",
        capabilities: ["SKL-3", "EVID-1"],
        link: "LIVE",
        proof:
          "PRODUCTION_DATA_PATH_PROVEN — the guarantee is APPLIED, enforcing, and now exercised by an import that can actually run. Verified on production 2026-09-08: `organization_evidence_records_evidence_state_check` admits only SELF_REPORTED, ORGANIZATION_REPORTED, LEGACY_IMPORTED, UNVERIFIED and NEEDS_REVIEW, so no import can write an attested or verified state even if the code tried, and `organization_evidence_competency_signals_method_check` admits only exact_term_match and synonym_term_match, so `ai_inference` is refused 23514. A real import write then completed through those constraints (ORGANIZATION_REPORTED accepted) in a rolled-back transaction. SEP-3 (EVIDENCE ≠ VERIFICATION) is a schema guarantee here, not a code convention — inference cannot dress itself as verification even by mistake.",
      },
      {
        step: "The subject sees what an organization recorded about them, and may refuse it",
        capabilities: ["EVID-1", "PER-12"],
        link: "BROKEN",
        because:
          "HALF of this step is repaired and half is genuinely unbuilt, so it stays BROKEN. The SEEING half worked again on 2026-09-08: the subject's branch of `organization_evidence_parties_select` was the exact path the 42P17 cycle killed — answering 'who else stands in this record' required a subquery back into `organization_evidence_records` — and the applied fix (ledger `20260908080950`) lifts that predicate into the SECURITY DEFINER boolean `is_evidence_record_subject`, which returns no rows and leaks no column, restoring the read WITHOUT widening any policy. The person the data is about can read it again. REFUSING is what is missing, and THE PREVIOUS REASON MIS-SIZED IT: it said 'UI work, not a migration', and that is wrong. Re-measured against production 2026-09-08 at three levels. (1) RLS: `organization_evidence_events` has exactly two INSERT policies. `..._attest` requires `manages_organization(organization_id)`, which the subject of an imported record is not — that is the whole point of the import, an organization recording a person who is not one of its managers. `..._verify` admits only `independently_verified` and then explicitly excludes the subject with `NOT EXISTS (... op.linked_profile_id = auth.uid())`. So no INSERT policy in existence admits a subject, for any event_type. (2) No SECURITY DEFINER function writes to the table — `pg_proc` carries three dispute RPCs and all three belong to `experience_records` (EVID-6), a different table with a different meaning. (3) Application code: the only two writers are in `import-core.ts` — the importing organization's rollback/reinstate and its own attestation — and NOTHING anywhere emits `event_type = 'disputed'`. Meanwhile `deriveEvidenceStanding` ranks DISPUTED second in precedence, so the model computes a state no actor can cause. A UI-only slice would therefore ship a refuse button that returns 42501 to the one person it exists for, which is worse than no button. The gap needs a write path — a narrow subject-only SECURITY DEFINER RPC or a third INSERT policy — so it is RED and owner-gated, not GREEN UI work. The packet is in `docs/launch/OWNER_GATE_PACKETS_2026-09-08.md`.",
      },
    ],
  },
  {
    id: "J-TIME-FREEDOM",
    actor: "any",
    title: "Commitment → overlap detection → warning → alternatives → authorized decision → override → audit → actual result → learning",
    why: "The product models reality; it does not constrain human agency. A contractor with a full month may still take another project — the system's job is to inform, not to forbid.",
    steps: [
      {
        step: "A commitment is recorded",
        capabilities: ["WRK-5", "CAL-6"],
        link: "LIVE",
        proof: "PRODUCTION_PERSISTENCE_PROVEN",
      },
      {
        step: "An overlapping commitment is DETECTED",
        capabilities: ["CAL-4", "WRK-5"],
        link: "LIVE",
        proof: "TEST_PROVEN — detection exists; see SEP-2 for the rule it must obey",
      },
      {
        step: "The actor is WARNED, not blocked",
        capabilities: ["WRK-5"],
        link: "LIVE",
        proof: "TEST_PROVEN — no overlap constraint exists anywhere, by decision",
      },
      {
        step: "Alternatives are shown",
        capabilities: ["CAL-4", "DEM-5"],
        link: "LIVE",
        proof:
          "TEST_PROVEN — 2026-09-15. The composition that was missing exists: `lib/workforce/commitment-alternatives.ts` (pure) proposes, for a KNOWN clash, the nearest free window of the SAME length for the same person in each direction (bounded to a year, never before today) and anyone on the roster whose own verdict for the same window is clear; `lib/planning/assignment-alternatives.ts` reads the whole roster's commitments ONCE through the existing employer readers and derives every candidate's verdict from that one result. It renders where the warning already renders — under the CAL-7 notice on the assignment form — after the write, never able to fail it. Three honesties are structural: a proposal under an `unknown` verdict is `not_applicable` (no dates proposed around commitments that could not be read); a window that overlaps no DATED commitment while an undated one exists is `unconfirmed`, and so is a candidate whose reads did not answer; and `none` (searched, found nothing) is distinct from `not_applicable` (did not search). Nothing is stored — a date the manager adopts becomes the plan by their act (SEP-1), and the clash they were warned about remains theirs to accept (SEP-2). Fifteen unit tests; no human has seen it. HUMAN_UI_PROVEN = NO.",
      },
      {
        step: "The authorized actor decides, and an explicit override is recorded with a receipt",
        capabilities: ["CAL-7"],
        link: "BROKEN",
        because:
          "OWNER-GATED, 2026-09-15 — the receipt is BUILT and UNAPPLIED. DETECT → WARN → ALTERNATIVES → DECIDE is real (CAL-7 PARTIAL since 2026-09-14, step 4 LIVE since 2026-09-15) and the decision is the actor's. The RECEIPT could not be carried by anything that exists: the assignment row has no column for it and is UPDATE-able; `audit_logs` is admin-only on INSERT and SELECT, so the one person it protects — the worker whose calendar now holds two things — could never read it. So the receipt is a new append-only relation with a definer writer, which is RED by route. The packet is prepared: `20260915120000_commitment_override_receipts_v1` (table + trigger refusing UPDATE/DELETE + SELECT policy whose second arm is the worker + `record_commitment_override_v1`, requiring a manager of THIS project and an ACTIVE assignment, snapshotting the window from the project row) with a guarded rollback. Its full body was DRY-RUN ON PRODUCTION inside a rolled-back transaction, nine stages: another company's manager refused 42501; a worker not assigned to the project refused 22023; a malformed collision refused 22023; the right manager recorded it and read 1; the WORKER read 1 under their own RLS; the other manager read 0; UPDATE and DELETE refused 42501 even as owner; anon refused execute; zero objects left behind. The app half ships with it and degrades honestly — the form under the clash notice answers 'prepared, not enabled' until the owner applies, and both parties read the same rows (`OverrideReceiptsSection` on project operations and on the worker's planning page). What no agent may do is apply it. Owner decision: apply `20260915120000_commitment_override_receipts_v1` via MCP `apply_migration`, or decline.",
      },
      {
        step: "The actual result is captured against the plan",
        capabilities: ["CAL-10"],
        link: "LIVE",
        proof:
          "TEST_PROVEN — `project_stages` has carried planned_start/planned_end AND actual_start/actual_end since 20260718140000; the approved wave (2026-09-14) added the reading that compares them and renders it on the project operations board. The old reason, \"nothing compares planned to actual\", became false that day. Production currently holds 1 stage and 0 finished stages with recorded actuals, so a walk sees nothing — that is empty evidence, not a broken chain, and below three observations the reading deliberately shows no median.",
      },
      {
        step: "Learned durations improve the next forecast — labelled as forecast",
        capabilities: ["CAL-10", "CAL-9"],
        link: "LIVE",
        proof:
          "TEST_PROVEN — 2026-09-15. The question the previous reason left open — where a suggestion lives without hardening into a record — is answered: NOWHERE. `lib/workforce/duration-forecast.ts` derives a forecast at render from the SAME learned readings CAL-10 shows (the median, its observation count, its date span, its source rows), dates it from the planned start being typed, and the stages panel offers it as a prefill with a one-line label that says it is a forecast and that nothing is saved until the dates are set. Adopting it writes `planned_end` — a PLAN, by the planner's act. No column, no row, no cache holds the forecast; FACT (actual dates) → DERIVED (median) → FORECAST (this value) and only the first is stored (SEP-1). Below three observations there is no forecast at all, not a rough one. Production holds 0 finished stages with actuals, so a walk today sees no forecast — empty evidence, not a broken chain. Seven unit tests; HUMAN_UI_PROVEN = NO.",
      },
    ],
  },
];

export function journeyById(id: string): Journey | undefined {
  return JOURNEY_REGISTER.find((j) => j.id === id);
}

/** Steps that are honestly not working — the product's real backlog. */
export function brokenLinks(): readonly { journey: string; step: JourneyStep }[] {
  return JOURNEY_REGISTER.flatMap((j) =>
    j.steps.filter((s) => s.link !== "LIVE").map((step) => ({ journey: j.id, step })),
  );
}
