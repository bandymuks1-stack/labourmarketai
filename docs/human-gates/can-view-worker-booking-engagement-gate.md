# Owner decision memo — should `can_view_worker` admit an active booking engagement?

**Date:** 2026-08-09
**Branch:** `feat/cc/can-view-worker-booking-engagement-v1`
**Predicate under review:** `public.can_view_worker(uuid)` (defined by applied
migration `20260711130000_privacy_consent_and_disclosure_v1`)
**Follow-up from:** Draft PR #1095 (`fix/cc/caller-manages-worker-engagements`),
beta-audit P1 defect A1.
**Status:** RECOMMENDATION — **YES, with three named conditions.** Nothing is
applied. The migration in this PR ships UNAPPLIED and RED.

---

## 0. One-paragraph summary

`can_view_worker` is the GDPR identity-disclosure predicate. Its body
deliberately separates a **consent** basis (employer discovery, requires a
current granted `profile_discoverability`) from a **contract / legitimate
interest** basis (active company roster, active agency roster, active
`engagement_contexts`, active managed-project assignment). It has no
`company_worker_engagements` branch. The recommendation is to add one, mirroring
PR #1095's branch shape exactly. The decisive fact is not the absence-list
cosmetic defect — it is that **the engaging company already reads that worker's
`display_name` in production today**, through the SECURITY DEFINER RPC
`list_booking_engagement_workers_v1` (applied 2026-07-23, prod ledger
`20260723182516`), which bypasses `can_view_worker` entirely. The owner already
took this disclosure decision. Adding the branch makes the RLS predicate agree
with a disclosure the database already performs, and extends it to the
professional-summary tables. It is not a new disclosure class.

---

## 1. What is actually broken, and how badly

After PR #1095 lands, an employer holding an ACTIVE accepted-booking engagement
can **see and approve** that worker's absence request (`worker_absences` RLS and
`review_worker_absence_v1` both gate on `caller_manages_worker`, which #1095
teaches about engagements). But `getManagerPendingAbsences()`
([apps/web/lib/leave/absences.ts:112](apps/web/lib/leave/absences.ts:112)) reads
`"... status, workers(display_name)"` — and that joined `workers` read is gated
by `workers_select = can_view_worker(id)`, which has no engagement branch. The
join returns null and the UI falls back to `absences.unknownWorker`
("Worker" / "Darbuotojas").

**Severity: low as a defect, high as a coherence signal.** It is honest
degradation, not a break — and in the realistic flow the worker granted
discoverability consent during scouting, so the name usually shows. What it
actually exposes is an incoherent authority model: post-#1095 an employer may
read a worker's **leave request** (an absence reason is arguably the more
sensitive datum of the two) but not that worker's **chosen display name**. The
absence surface is the messenger, not the disease.

---

## 2. What identity fields would become readable, and to whom

### 2.1 To whom — exactly one party per engagement

The proposed branch is `owns_company(e.company_id)` — `companies.profile_id =
auth.uid()`. That is **one profile**: the owner of the company that holds the
engagement. Not org managers, not company members, not the agency, not other
companies owned by the same person (the predicate is per-engagement-row, and an
engagement binds one company to one worker).

### 2.2 What — the four tables gated by `can_view_worker`

| Table | Policy | What the engaging company owner would gain |
|---|---|---|
| `public.workers` | `workers_select using (can_view_worker(id))` | the whole row (below) |
| `public.worker_skills` | `worker_skills_select using (can_view_worker(worker_id))` | skill ids, `self_rated_level`, `verified`, `verified_by`, `verified_at` |
| `public.worker_professions` | `worker_professions_select using (can_view_worker(worker_id))` | profession ids, `is_primary` |
| `public.worker_languages` | `worker_languages_select using (can_view_worker(worker_id))` | `lang`, `level` |

The `public.workers` row, enumerated from `0001` plus the four later
`alter table public.workers add column` migrations:

`id`, `profile_id`, `display_name`, `headline`, `bio`, `experience_years`,
`current_location_country`, `preferred_countries`, `availability_status`,
`available_from`, `salary_min_eur`, `salary_max_eur`, `trust_score`,
`profile_completeness`, `work_card_confirmed_at`, `docs_aggregate_consent`,
`willing_to_relocate`, `needs_accommodation`, `has_transport`, `max_trip_days`,
`preferred_contract_type`, `team_available`, `solo_available`,
`availability_note`, `pay_basis_preference`, `night_shifts_ok`,
`weekend_shifts_ok`, `overtime_ok`, `driving_licence_categories`, `own_vehicle`,
`own_tools`.

Two of these deserve to be called out rather than buried in a list:

- **`bio`** is free text. The legal-basis matrix's own Art. 9 note says free-text
  fields "may incidentally contain what a user writes". This is the single most
  sensitive field in the set, and the widening reaches it.
- **`trust_score`** is the dormant §19 violation already on record
  (`trust-score-column-debt`) — a column with no reader. Widening the predicate
  does not create a reader, but it does put a person-level score one `select *`
  away from a party that has a live commercial relationship. Not blocking;
  another reason to retire the column.

### 2.3 What would NOT become readable

- **Contact details.** `profiles` is `profiles_select using (id = auth.uid() or
  is_admin())`. Email and phone live there and are untouched by this predicate.
  `canViewWorkerContact()` returns `false` unconditionally in the app layer.
- **Documents.** `worker_documents` and `worker_external_profiles` are
  owner-or-admin only; `external-profiles-consent.test.ts` pins that
  `worker_external_profiles` must contain no `can_view_worker` clause at all.
- **Journal entries.** Gated by the engagement-context RPCs, not by this
  predicate.
- **Private absence reasons.** #1089's narrowing holds: managers reach only
  `status='requested'` rows and the scheduling view carries no `note` column.

### 2.4 The delta is smaller than it looks — and this is the crux

`list_booking_engagement_workers_v1` (migration `20260723120000`, **applied to
production 2026-07-23**) is `security definer` and returns:

```sql
select e.id, e.worker_id, w.profile_id,
       coalesce(nullif(trim(w.display_name), ''), 'Kandidatas ' || left(e.worker_id::text, 6)),
       e.source_booking_id, e.started_at
  from public.company_worker_engagements e
  join public.companies c on c.id = e.company_id
  join public.workers   w on w.id = e.worker_id
 where e.worker_id is not null and e.status = 'active'
   and c.profile_id is not distinct from auth.uid();
```

Same three conditions as the proposed branch, and it hands the engaging company
owner `w.display_name` and `w.profile_id` **today, in production, bypassing
`can_view_worker`**. The owner's 2026-07-23 decision already authorised
disclosing the engaged worker's name to the engaging company.

So the honest accounting of the marginal change is:

- **`display_name`, `profile_id`: no new disclosure.** Already live via the RPC.
  The change moves them from a definer bypass onto the declared predicate.
- **The remaining ~29 `workers` columns + skills + professions + languages: a
  real new disclosure**, to that one company owner, for the duration of the
  active engagement.

That second bullet is the actual decision. It is a professional-summary
disclosure — precisely the field set the legal-basis matrix already scopes to
"Employer DISCOVERY" — being granted on a relationship basis instead of a
consent basis.

---

## 3. Does it belong on the legitimate-interest arm?

**Yes.** Three independent reasons.

**3.1 The matrix already says so.**
[docs/legal/legal-basis-matrix-v1.md](docs/legal/legal-basis-matrix-v1.md) row 4
reads:

> Visibility inside an ACCEPTED work relationship (company/agency roster,
> engagement journal review, managed-project operations) … Art. 6(1)(b) contract
> / 6(1)(f) legitimate interest of an ACTIVE, worker-accepted relationship
> (**invitation accepted / engagement active / assignment active**) …
> relationship clauses in `can_view_worker`

"engagement active" is already named in the enforced-basis column, and the
"Where enforced" column already points at `can_view_worker`. The document
describes a state the code does not implement. This change makes the code match
the document rather than the other way round. (Caveat, stated plainly: that
document was written before `company_worker_engagements` existed, and "engagement
active" there most likely meant `engagement_contexts`. The wording covers the
booking engagement; it was probably not written with it in mind. It supports the
decision; it does not pre-authorise it — which is why this memo exists.)

**3.2 The accept is a stronger act than the toggle.**
`profile_discoverability` is a global, undirected opt-in: "any employer may see
a summary of me." Accepting a booking is directed at **one named company**, for
**one dated engagement**, via `respond_booking_request_v3`, which refuses any
caller who is not the addressed worker and any booking not in `proposed`. If the
global toggle is sufficient to disclose the professional summary to *every*
employer, a specific accept is sufficient to disclose it to *that one*.

**3.3 It is already reachable one step later.**
`can_view_worker` admits `project_worker_assignments` where the caller
`can_manage_project`. Under #1095 the engaging company can assign the engaged
worker to its own project — at which point the full read is granted anyway. The
branch's real effect is to close a **timing gap** between accept and first
assignment, not to open a new door. The employer who wants the data today
assigns the worker to a throwaway project and gets it.

### Counter-argument, stated fairly

The consent/contract split exists precisely so that a relationship cannot
silently absorb a consent decision. Every branch added to the legitimate-interest
arm makes the consent arm matter less, and this is the fourth such branch. If the
answer to "can I see this worker without consent?" is always "get any kind of
relationship", the discoverability toggle becomes decorative. That is a real
long-term erosion risk and it is the reason for condition C3 below (no fifth
branch without a matrix update). It is not, in my judgement, a reason to refuse
this one — because the relationship in question requires the worker's own signed
act, and because the disclosure it authorises is already half-performed.

---

## 4. Is `worker_id is not null` + `status='active'` + `owns_company` the right narrowness?

**Yes — and it must be byte-identical to PR #1095's branch, not merely similar.**

| Condition | Why | If dropped |
|---|---|---|
| `e.worker_id is not null` | #856 GDPR model-A detach rule: a detached audit row grants nothing | Structurally it would still be false (`null = null`), but the intent would not survive a refactor. It is stated, exactly as #1095 states it. |
| `e.status = 'active'` | matches `end_company_worker_engagement_v1/v2` semantics; an ended engagement grants nothing | Ending would not revoke. Fatal. |
| `public.owns_company(e.company_id)` | caller-bound, same authority level the existing roster branches use and the same level `list_booking_engagement_workers_v1` already uses | Would leak across companies. Fatal. |

**Deliberately NOT admitted: `manages_organization`.** An org manager who is not
the company owner gets nothing from this branch. This is the same exclusion
#1095 made, and it matters more here: `can_view_worker` is the GDPR predicate,
and org-manager authority over engagement-based identity disclosure is a separate
owner decision. Note the resulting asymmetry is *consistent*, not accidental —
the `engagement_contexts` branch below it uses `manages_organization`, because
that model is organization-membership-shaped; the booking engagement is
company-owner-shaped, exactly like `company_workers` above it.

**Rejected: narrowing further by the booking's dates.**
`booking_requests.expected_end_date` is available, and gating on it would make
visibility expire with the work. Rejected for this migration because it would put
**two different definitions of "engaged"** in the database — `caller_manages_worker`
(#1095) would say active while `can_view_worker` said expired, and the absence
list would go back to showing "Worker" for a worker the employer may still
approve leave for. One definition of the relationship, in one place. The expiry
question is real and belongs to the engagement lifecycle (§6.2), not to this
predicate.

**Rejected: a narrower column projection for engagement-based reads.** RLS is
row-level; a column-level distinction would mean a second view or a definer RPC,
i.e. a third place where "who may see a worker" is decided. The existing
architecture already answers this: the app layer anonymises where it must
(`toScoutSafeCandidate`, `assertContactSafe`), and the public data-access matrix
already promises "an anonymised preview only — no name and no contact details
without the worker's permission" for the scouting surface specifically.

---

## 5. Does ending an engagement correctly revoke it?

**Mostly yes — with one honest caveat the owner must see.**

**What works.** `can_view_worker` is `stable`, evaluated per query. The moment
`end_company_worker_engagement_v2` sets `status='ended'`, the branch is false on
the next statement. There is no cache, no materialised grant, no row copied
anywhere. Both sides hold the right to end — `owns_company(e.company_id) OR the
engagement's own worker` — and both sides can **reach** it in the product:
`conversation.actions.worker.reviewEngagements` ("My engagements — See who you
are working with and end an engagement") and the company mirror, both routed
through the single write path
[apps/web/lib/engagements/end-engagement.ts](apps/web/lib/engagements/end-engagement.ts).
Worker erasure sets `worker_id` NULL (`on delete set null`), which fails the
first condition — and the `workers` row is gone anyway, so the predicate is
unreachable by construction.

**The caveat.** Ending the engagement does **not** necessarily end the
visibility, because `can_view_worker` is a disjunction. If the employer assigned
the worker to a project while the engagement was active, the
`project_worker_assignments` branch keeps the read alive until that assignment is
also ended. This is pre-existing behaviour and arguably correct — an active
project assignment *is* an active relationship — but a worker who clicks "End
engagement" will reasonably believe they revoked everything. **They did not.**

This is not introduced by this migration and I am not fixing it here (it would
mean cascading engagement-end into assignment-end, which is a data-mutating
product decision). It is recorded as follow-up F2 because the memo would be
dishonest without it.

---

## 6. Interaction with the #856 GDPR detach model

**6.1 Compatible; adds no erasure blocker.** The migration creates no table, no
column, no FK, no constraint, no trigger. `company_worker_engagements.worker_id`
remains `on delete set null`; `subject_key` remains the surviving pseudonymised
audit subject. Nothing in this change can make a worker deletion fail. The
`worker_id is not null` guard is the same one `caller_has_booking_engagement_for_project`,
`list_booking_engagement_workers_v1`, `end_company_worker_engagement_v2` and
#1095's branch all carry — this is the fifth copy of one consistent rule, not a
new rule.

**6.2 The retention question this raises (follow-up, not blocking).**
`company_worker_engagements` has **no automatic expiry**. I searched: no cron
job, no trigger, no date-driven transition anywhere sets `status='ended'`. A
one-week booking from January produces an engagement that is still `active` in
December unless a human ends it. Today that means an indefinite *project-assign*
right; after this change it also means an **indefinite professional-summary read
right**, on a legitimate-interest basis whose factual predicate ("we are working
together") may have stopped being true months ago.

The roster arm has the same shape (`company_workers.status='active'`, no expiry),
so this is not a new class. But a roster membership is an open-ended employment
relation, whereas a booking carries an `expected_end_date` the engagement
ignores. That asymmetry is the weakest point in the whole proposal and the owner
should see it named rather than discover it later. Recorded as F1.

---

## 7. THE KEY RISK: does this make discoverability consent bypassable?

Framed honestly, in both directions.

### 7.1 The case that it IS a bypass

`propose_booking_request` (migration `20260613100100`, `security definer`) checks
exactly two things about the target: the caller owns the demand, and

```sql
if not exists (select 1 from public.workers w where w.id = p_worker_id) then
  raise exception 'Unknown worker' using errcode = 'P0002';
end if;
```

**It does not call `can_view_worker`.** Because it is SECURITY DEFINER, RLS does
not stop it either. So an employer holding a worker's `workers.id` UUID can
propose a booking to a worker who has **never** granted discoverability, or who
has **withdrawn** it. `propose_booking_request_v3` adds only rate limits (10 open,
30/24h) and delegates.

The realistic exploitation path is not a stranger — it is **withdrawal**:

1. Worker grants `profile_discoverability`. Employer scouts, sees the candidate,
   retains the `workerId` (it is in the scouting payload and in
   `demand_shortlist.worker_id`, which is owner-scoped and permanent).
2. Worker withdraws consent. `worker_profile_discoverable` goes false on the
   next query; the worker disappears from scouting. From the worker's point of
   view, that employer can no longer see them.
3. Employer proposes a booking using the retained UUID. The worker receives it.
4. Worker accepts. Engagement mints. **Under this change the employer's full
   professional-summary read comes back**, with no live discovery consent.

That is a genuine narrowing of what "withdraw" means, and I will not describe it
as anything else.

### 7.2 The case that it is NOT a bypass

- **The worker's own accept is the gate.** `respond_booking_request_v3` refuses
  any caller who is not the addressed worker (`workers.profile_id = auth.uid()`)
  and any booking not in `proposed`. No employer action, and no accumulation of
  employer actions, mints an engagement. Declining, ignoring, or letting it
  expire all produce nothing. The bypass requires the data subject to
  affirmatively say yes to a named company for dated work.
- **GDPR-wise the bases are genuinely distinct.** Withdrawing consent for purpose
  A (open discovery by any employer) does not invalidate a different lawful basis
  for purpose B (operating an accepted engagement with one company). Art. 7(3)
  withdrawal is purpose-bound. Treating the accept as re-granting *discovery*
  consent would be wrong; treating it as establishing a contract/6(1)(f)
  relationship is the ordinary reading — and is exactly what the roster arm has
  always done, since accepting an email invitation grants
  `company_workers`-based visibility with no reference to the discoverability
  toggle at all.
- **UUIDs are not enumerable.** `gen_random_uuid()`, 122 bits. Step 1 above is a
  necessary precondition, and it requires the worker to have consented at some
  point, or the UUID to have leaked out of band. There is no path from "I have
  never been discoverable" to "an arbitrary employer books me".
- **This already happens.** Under 20260723120000 (live), accepting that booking
  already discloses `display_name` and `profile_id` to that company via
  `list_booking_engagement_workers_v1`. The withdrawal-then-booking path already
  defeats the toggle for the worker's *name* today. This change extends the same
  defeat to the professional summary; it does not create it.

### 7.3 My reading

**It is not a legal bypass. It is an expectation bypass**, and the fix for an
expectation bypass is copy, not a narrower predicate. The booking-accept
confirmation currently says:

> `conversation.booking.confirmAcceptBody` — "Accepting confirms your engagement
> with the employer — it is a firm step, not a draft."

That is true and says nothing about disclosure. A worker accepting a booking is
not told that the company will thereby be able to read their profile. Under
Art. 5(1)(a) (transparency) and the product's own §7 honesty doctrine, the accept
screen has to say so **before** this predicate widens. That is condition C1, and
it is the one I would actually hold the migration on.

---

## 8. Recommendation

**YES — add the branch, mirroring PR #1095 exactly, subject to C1–C3.**

**C1 (blocking, app-side, not in this PR).** The booking-accept confirmation must
state the disclosure before the worker accepts — in the order of `en` / `lt` /
`ru`, e.g. "Accepting lets this company see your professional profile (skills,
professions, languages, availability) for as long as the engagement is active.
Your contact details are not shared. You can end the engagement at any time."
Without this the widening is technically lawful and experientially dishonest.
This is a copy change, no migration, and it can ship before or with the apply.

**C2 (blocking, docs).** Update
[docs/legal/legal-basis-matrix-v1.md](docs/legal/legal-basis-matrix-v1.md) row 4
so "engagement active" explicitly names `company_worker_engagements` alongside
`engagement_contexts`, and update the public data-access matrix
(`legal.dataAccess.matrix.rows.workerCard.seeNote`) so the "anonymised preview
only" promise is scoped to *scouting* and the engagement case is stated. The
page's stated purpose is that it "claims nothing broader than what the rules
actually do"; after this change the reverse would be true — it would claim
something *narrower*.

**C3 (standing).** No further branch is added to `can_view_worker` without a
paired legal-basis-matrix entry in the same PR. Four relationship branches
becoming five by accretion is how the consent arm becomes decorative.

**Follow-ups, explicitly NOT in this PR:**

- **F1 — engagement expiry (§6.2).** Owner decision: should an engagement
  auto-end at `booking_requests.expected_end_date` (+ grace), or stay manual? A
  data-mutating change; needs its own gate.
- **F2 — end-engagement does not end assignments (§5).** Either cascade, or say
  so in the end-engagement confirmation copy.
- **F3 — `propose_booking_request` does not check visibility (§7.1).** Whether an
  employer should be able to propose a booking to a worker they cannot currently
  see is a separate product question. Adding a `can_view_worker` check there
  would close the withdrawal path — and would also break legitimate re-booking of
  a past worker. Do not change it as a side effect of this memo.
- **F4 — `workers.trust_score` (§2.2).** Pre-existing §19 debt; retire it.

**If the owner says NO:** the correct alternative is *not* to leave the
asymmetry. It is to revert `list_booking_engagement_workers_v1` to stop returning
`display_name`, and accept `absences.unknownWorker` as the permanent, honest
rendering of an unnamed engaged worker. Half a disclosure is the worst of the
three options.

---

## 9. What this PR contains

| Artefact | Note |
|---|---|
| `supabase/migrations/20260809120000_can_view_worker_booking_engagement_v1.sql` | ONE `create or replace function`. No table, column, policy, index, trigger, grant or DML change. Ships **without** `@human-gate-approved` → `migration-safety` stays RED by design. |
| `supabase/rollbacks/20260809120000_can_view_worker_booking_engagement_v1.down.sql` | Restores the `20260711130000` body verbatim. |
| `scripts/db-proof/can-view-worker-booking-engagement.sh` (+ `.prelude.sql`, `.seed.sql`) | Throwaway Postgres; executes the migration and rollback **verbatim**; per-role probes under `set local role authenticated`/`anon`; BEFORE → AFTER → ROLLBACK → RE-APPLY. |
| `apps/web/lib/guards/can-view-worker-booking-engagement.test.ts` | Pins the branch shape, the untouched consent arm, the grant posture and the paired rollback. |
| Ratchet bumps | `product-readiness.test.ts` SPRINT_BASELINE and `market-map-read-layer-v1.test.ts`, both 194 → 195, with reasons. |

**Apply protocol if approved:** Supabase MCP `apply_migration` only, never
`db push`. Independent of PR #1095 — neither migration references the other's
objects — but both bump the same shared ratchet slot, so whichever merges second
must RECOUNT (`git ls-tree -r origin/main supabase/migrations/`), never sum.
