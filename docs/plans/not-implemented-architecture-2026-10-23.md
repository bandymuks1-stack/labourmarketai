# Not-implemented functions — architecture packs (2026-10-23)

> **SUPPORTING — NOT THE CANONICAL ARCHITECTURE.** The architecture is
> [`docs/OWNER_TARGET_ARCHITECTURE_V1.md`](../OWNER_TARGET_ARCHITECTURE_V1.md).
> This file is a set of implementation plans for capabilities that are not
> built yet. It adds no graph node, settles no owner decision and changes no
> target. Where it and the canonical file disagree, the canonical file wins.

**Owner order (2026-10-23):** every function that is not implemented gets a
real implementation plan. "No code yet" is not "blocked". Each pack names what
the function is, what already exists and is reused, the smallest useful
implementation, dependencies, tests, the owner decision it needs (as an exact
question) and the risk if it is done wrong.

**Rules every pack obeys**

- One graph, one store per concept: reuse or extend; a new structure only
  where the pack says why nothing existing can hold it (doctrine §2,
  decision 0016).
- No paid service is enabled, no price is published, no production permission
  changes. Any migration, RLS policy, grant or SECURITY DEFINER function is RED:
  a draft PR with `needs-human-gate`, never auto-merged, never applied by an
  agent.
- Code existence is not production proof. A pack's "done" means a real user
  did it in production.
- No personal data in this file.

**Contents**

| § | Function | Capability | Pack status |
|---|---|---|---|
| A | 6.13 Goods purchase lifecycle | MKT-2 | **Built as a RED draft, PR #2713** (see §A) |
| B | 6.14 Logistics / delivery | MKT-2 | **Built as a RED draft, PR #2713** (delivery fields only) |
| C | 6.12 Cross-border deals | MKT-4 + GEO-3 + MKT-2 | Decision memo — no module |
| D | 7.9, 7.11, 7.23, 7.24, 7.26 LMC credits and paid tiers | MKT-7, MKT-8 | Plan; owner-locked |
| E | 10.15 Agents OS runtime | GEO-4 | Plan |
| F | 10.16 AI agents as participants (provider mode) | AI-4 | Plan; AGENT-1..4 |
| G | 5.15 Voice as an equal door | COM-8 (+ COM-6) | Plan; partly built |
| H | 11.10 Recognised equivalence (RPL) | SKL-9 / SKL-10 / EDU-4, ARCH-2 | Plan; structure deferred by owner |
| I | 8.15 App store release | ARCH-6 | Plan; owner gates |

---

## A. 6.13 — Goods purchase lifecycle (built, RED draft)

**What it is.** A buyer asks to buy a goods listing: quantity, pickup or
delivery, a note, optionally for an organization they manage. The seller side
accepts, declines or marks it handed over; either side can cancel within the
rules. Both parties see it in their existing workspaces and talk in the one
conversation system. The product word is **purchase request** — "order" stays
out of in-app copy so one transaction dictionary survives (service request for
services, purchase request for goods; `lib/guards/concept-naming-drift.test.ts`).

**Reused.** `marketplace_listings` + `market_subject_types` (what is sold, which
domain), `market_index_v1` (discovery, unchanged), `manages_organization` (the
neighbouring tables' authority predicate), the conversation system through a
new grant `allowed_listing_purchase` (no second messaging path), the listings
page and the buyer workspace (no new route).

**Why one new table.** `marketplace_listings` is the thing offered (one row,
many buyers); `service_offering_requests` is bound by FK, RLS and conversation
source to `service_offerings`; `customer_requests` is demand, and a purchase is
a response to a published offer (SEP-4); proposals / agreements are
organization-scoped documents and person-party agreements are not built;
finance records are money facts and no money moves here.

**Built (PR #2713 — draft, RED, `needs-human-gate`, not applied).**

- Migration `20261023160000_listing_purchases_v1`: table `listing_purchases`
  (two-party RLS + managers of either side's organization + admin, select only),
  `request_listing_purchase_v1` and `transition_listing_purchase_v1` (SECURITY
  DEFINER, pinned `search_path`, revoked from public and anon), one open request
  per buyer per listing, a row lock on every transition, a terms snapshot
  (title, unit, stated price as shown when requested), `listing_id ON DELETE SET
  NULL` so deleting a listing never erases a purchase, GDPR erasure decisions
  for both person columns, a guarded rollback.
- Lifecycle `requested → accepted → fulfilled`, `requested → declined`,
  `requested | accepted → cancelled` (buyer), `accepted → cancelled` (seller).
- `lib/marketplace/listing-purchase-model.ts` (pure mirror of the SQL),
  `lib/marketplace/listing-purchases.ts` (RLS reads, RPC-only writes, honest
  `needs-migration`), `lib/marketplace/listing-purchase-conversation.ts`.
- UI: "Request to buy" on a purchasable discovery card (hidden until the
  migration exists), a purchases section on `/dashboard/listings` (both sides)
  and on `/dashboard/buyer` (buying side). Copy in lt, en, ru, de, pl, nl.

**No payment.** `payment_arrangement` has one value, `direct_between_parties`,
and the screen says so. A later checkout is the extension point: an owner-armed
payment (MKT-7, two owner acts) adds a value to that CHECK and a payment
reference; it never repurposes a column.

**Tests.** `listing-purchase-model.test.ts` (state machine, purchasable rule,
input bounds, refusal mapping, side resolution), `lib/guards/listing-purchases.test.ts`
(migration shape, no payment, RPC-only writes, hidden door, both workspaces,
conversation gate), the grant guards, and a real PostgreSQL 16 proof
`scripts/db-proof/listing-purchases-v1.sh` (56 checks: grants, every refusal,
visibility per actor, every transition, deletion keeps the purchase, guarded
rollback, re-apply).

**Owner decisions.**
1. *"Do you approve applying migration `20261023160000_listing_purchases_v1`
   (one table, two SECURITY DEFINER functions, select grant to authenticated)
   to production?"*
2. *"What retention period applies to a goods purchase request after one party
   erases their account?"* Until answered, the erasure plan routes a person
   with purchases to human review (the same state service requests hold).

**Residue (named, not hidden).** The conversation carries no typed source
(`conversations.source_type` is a closed CHECK; adding `listing_purchase` is a
separate RED widening). No notification on a new purchase request yet (the
service-request "seen" pattern is the model to reuse). Rentals are not
purchasable; a rental booking is a separate lifecycle.

**Risk if done wrong.** A second "order" store next to service requests; a
purchase that disappears when the seller deletes a listing; an org manager who
cannot act for the organization; a payment claim the platform cannot honour.

## B. 6.14 — Logistics / delivery (built inside §A, PR #2713, RED draft)

**What it is.** How the goods reach the buyer — and only that. Pickup or
delivery; for delivery an **address reference** (a short label the buyer
chooses to share, e.g. a site gate or depot, never a structured home address),
a country and a requested date; a seller-written carrier / handover note.

**Reused.** The purchase row of §A. No carrier integration, no tracking number
field, no fee, no route planning.

**Tests.** Covered by §A (delivery needs a place; pickup stores no place; the
carrier note is seller-only and set on accept or hand-over).

**Owner decision.** *"Should a later version link delivery to a project site
(`projects` / sites) instead of a free-text reference?"* — only worth asking
once real purchases exist.

**Risk if done wrong.** Home addresses stored as structured personal data with
no retention rule; a "shipment tracking" claim with no carrier behind it.

## C. 6.12 — Cross-border deals: decision memo (no module)

**Question for the owner.** *Do 6.6 contracts (MKT-4) + 6.11 cross-border
readiness (GEO-3, SKL-8) + the new goods purchases (§A) cover cross-border
deals, so that no separate "deals" module is built?*

**Recommendation: yes — no separate module.** A "deal" is not a new object; it
is one of three existing objects with a jurisdiction attached:

| A cross-border deal is… | …already this object | Jurisdiction fact today |
|---|---|---|
| a service or project contract | `agreements` / proposals (MKT-4, `lib/agreements`) | none on the agreement |
| a worker or brigade placed in another country | engagement / assignment + readiness (GEO-3, `lib/country-readiness`) | country requirement rows, a checklist |
| goods bought from another country | `listing_purchases` (§A) | `delivery_country` + listing country |

A deals module would duplicate all three and create a fourth store of
counterparties and terms (doctrine §2).

**The exact remaining gap (each is small, none is a module):**

1. **Agreement jurisdiction.** `agreements` has no governing-law / place-of-
   performance country. Smallest fix: two nullable columns + the readiness
   check run against the place of performance. RED (schema).
2. **Person-party agreements.** Agreements are organization-scoped; a person
   contracting across a border cannot hold one. Already an open MKT-4 gap
   ("person-party agreements NOT BUILT").
3. **Counterparty send / accept.** MKT-4 works for the owner side only — no
   counterparty send, accept or proposal → agreement link. Without it no deal
   of any kind is bilateral.
4. **Posting / permit workflow.** GEO-3 is a checklist; there is no posted-
   worker declaration workflow (e.g. A1 certificate, host-country notification).
   This is the one genuinely cross-border piece; it belongs on the engagement,
   not on a deal.
5. **Currency and VAT on goods.** Purchases record the stated currency; no VAT
   or customs logic exists, and none should until payments are armed (MKT-7).

**Dependencies.** 3 before 1–2; 4 independent; 5 after MKT-7.

**Risk if a module is built anyway.** Two places to record the same contract;
readiness checks that run on one and not the other; a "deal" UI that implies
legal compliance the platform does not check.

## D. 7.9, 7.11, 7.23, 7.24, 7.26 — LMC credits and paid tiers (owner-locked)

**What they are.**
- 7.9 — further paid products (LMC top-ups, media add-ons, an AI plan, agency
  tiers, referral rates).
- 7.11 — deferred plans `worker_plus`, `agency_pilot`.
- 7.23 — LMC one-time top-up (1 LMC = 1 EUR).
- 7.24 — LMC granted only for a confirmed payment, exactly once.
- 7.26 — LMC spend on paid features, and reversal on refund.

**This pack publishes no price and enables nothing.** Every figure is an owner
decision; none is restated here.

**Reused (already built).** The LMC ledger (MKT-8: five `lmc_*` tables, two
views, sixteen RPCs, all seven flags false, spend / compensate functions with no
caller), the plan catalogue (`lib/commercial/plan-catalogue.ts`,
`DEFERRED_PLAN_KEYS = worker_plus, agency_pilot`), the entitlement resolver
(`lib/billing/entitlements-v1.ts`), the Stripe boundary (`/api/billing` stays
LMC-free, guarded by `stripe-lmc-separation`), the decision register in
`docs/product/lmc-canonical-commercial-catalogue-v1.md` §9 (MDD-01..21).

**Already drafted.** PR #2647 (RED, draft, not applied): TEST-mode top-up
checkout and webhook under `/api/lmc`, exactly-once crediting keyed on the
payment intent and enforced by a unique index
(`20261021150000_lmc_purchase_payment_reference_unique_v1`), refunds recorded
as `refund_pending_owner_decision`, an empty package list. That PR is the 7.23 +
7.24 implementation; this pack does not duplicate it.

**Minimal implementation, in order.**

| Step | Function | What | Class | Waits on |
|---|---|---|---|---|
| D1 | 7.24 | Apply the unique purchase-reference index (#2647) | RED | owner approval |
| D2 | 7.23 | Fill the server package list; arm TEST mode only | GREEN code + owner config | MDD-03/04/05 |
| D3 | 7.26 | One spend call site behind the entitlement resolver: a feature checks plan entitlement first, then LMC balance, then calls `lmc_spend_v1` with an idempotency key; refund → `lmc_compensate_spend_v1` | RED (service_role path) | MDD-09/10/11, MDD-08 |
| D4 | 7.11 | Move a deferred plan to sellable: catalogue entry already exists; needs a Stripe price id slot and the plan's boundary copy | RED (billing) | MDD-01/02, MKT-7 |
| D5 | 7.9 | Each further product = one catalogue row + one entitlement key; no product-specific table | RED (billing) | per product: price, VAT, refund |
| D6 | all | Wallet UI (balance, history, top-up) on `/dashboard/account` where the disabled LMC section already renders | GREEN | MDD-21 |

**Tests.** Exactly-once crediting under replay and concurrency (exists in
#2647); spend refused without balance; compensation restores the exact amount
once; entitlement precedence (plan before LMC); no LMC string in any locale
before D6; flags-off routes return 503.

**Owner decisions (exact questions).**
1. *"Which package sizes, minimum and maximum top-up, and bonus (if any)?"*
   (MDD-03/04/05)
2. *"What is the VAT treatment of a credit purchase, and the refund rule for
   unspent purchased LMC?"* (MDD-06, MDD-08)
3. *"Which features may be bought with LMC, at what LMC price each, and how
   does a spend map to an entitlement?"* (MDD-09/10/11)
4. *"Do you approve applying the unique purchase-reference index from #2647?"*
5. *"Which deferred plan, if any, becomes sellable first, and at what price?"*
   (MDD-01/02, then MKT-7's two owner acts)

**Risk if done wrong.** Credits sold with nothing to spend them on (a euro
liability); a double credit on a replayed webhook; a refund that leaves the
credit spendable; a price shown before the owner approved it.

## E. 10.15 — Agents OS runtime (autonomous internal agents)

**What it is.** Internal agents that run platform work on a schedule or a
trigger, without a person pressing a button — distinct from the chat (a
person's turn) and from MCP (an external agent acting for a person).

**Outcome required.** Such work proposes and never writes a fact on its own
(SEP-1, SEP-3); it reuses the one existing AI runtime with its cost ceilings and
audit, never a second runtime; and it is off until the owner chooses which jobs
may run. The implementation design is internal and lives in the Agentai OS
Internal Brain, not in this public repository (AGENTS.md, information boundary).

**Owner decisions.** Which internal jobs may run autonomously first, under which
identity, and whether any of them may ever write without a human confirmation
(recommended: none).

## F. 10.16 — AI agents as labour-market participants (provider mode)

**What it is.** OWNER_TARGET_ARCHITECTURE_V1 §1.13: an AI agent may itself be
the work subject offering a digital service (PROVIDER mode), with a required
responsible operator. DELEGATE mode (an agent acting for a person through the
MCP door) is built.

**Reused.** Everything in `docs/integrations/AI_AGENT_PARTICIPANTS_V1.md` §4
"What already exists and is reused": the actor model and entity model
(`lib/product-gate/entity-model.ts`), the Living CV evidence states (decision
0023), the journal and review structures, service offerings / proposals, teams,
the MCP door with OAuth and receipts.

**Minimal implementation.** Exactly the phase plan P0–P7 of
`AI_AGENT_PARTICIPANTS_V1.md` §5 — not repeated here. The first useful slice
is P0 (receipts name the OAuth client) + P1 (the subject kind with a required
operator), then P4 (an agent as provider on a service offering with the
mandatory disclosure). Data minimization §4a binds every phase.

**Tests.** An agent can never confirm its own competence; every agent surface
discloses "AI agent, operated by …"; an agent is never matched to human-only
work; no agent-side financial commitment exists in any code path.

**Owner decisions.** AGENT-1, AGENT-2, AGENT-3, AGENT-4 exactly as recorded in
§10 of the canonical architecture. P1 cannot start before AGENT-1.

**Risk if done wrong.** A second, separate "AI marketplace"; an agent shown as
a person; planned competence shown as acquired (SEP-1); unbounded record growth.

## G. 5.15 — Voice as an equal door (COM-8)

**What it is.** Voice and visual input are two equal doors over the same
canonical action spine: whatever a person can do by tapping, they can start by
speaking, and every commit is still the existing on-screen confirmation.

**Reality check (search by concept and history).** More exists than COM-8's
register note says. `docs/VOICE_DOOR_ADAPTER_V1.md` records a generic voice door
over the typed chat spine (`components/app/voice/voice-capture-panel.tsx`,
mounted in `components/app/conversation/chat/conversation-chat.tsx`), the voice
journal (COM-6), a signed single-use upload to a self-hosted STT service
(`services/transcribe/`), and a boundary guard
(`lib/guards/voice-door-adapter-boundary.test.ts`). Its own status is
`VOICE_FIRST = NOT_GREEN`: the production recognition service
(`VOICE_TRANSCRIBE_URL`) is unverified and there is no real-device proof. The
capability register's COM-8 entry is corrected in this same change (PARTIAL,
CODE_PROVEN, production limits stated).

**Minimal implementation (what is actually missing).**
1. Production STT host verified (COM-6 open decision) — without it every voice
   door honestly shows `service_unavailable`.
2. A real-device proof (iOS Safari, Android Chrome) of the chat voice door.
3. Breadth: the read / navigation / draft-form intents classified
   `VOICE_READ_SAFE` / `VOICE_DRAFT_SAFE` in the adapter inventory reachable by
   voice, still through the same router.
4. Mobile app: the same door in `apps/mobile` (depends on ARCH-6 scope).
No second intent router, no voice-only action, no spoken confirmation.

**Tests.** Already present: boundary guard, capture-model states, upload token
single-use and expiry. Add: an end-to-end walk with a recorded audio fixture
against the real STT contract; a guard that every voice-reachable intent is in
the read/draft classes.

**Owner decisions.**
1. *"Which transcription host runs in production, and do you accept its
   cost?"* (COM-6; no paid service is enabled by this pack)
2. *"Is voice required in the mobile apps for the first store release?"*
   (ARCH-6)

**Risk if done wrong.** A second architecture for voice; a spoken "yes" treated
as a confirmation; audio sent to a third party without disclosure.

## H. 11.10 — Recognised equivalence (RPL) structure (ARCH-2)

**What it is.** The act of recognising that demonstrated capability satisfies
a formal requirement — asserted by an authorized independent assessor,
training or education provider, sector body or public body; never by the
beneficiary, never by a self-interested employer (canonical §1.10).

**Reused (named by §1.10 itself).** The independence pattern of
`organization_evidence_events` (`independently_verified` only when the actor
does not manage the organization and carries an `actor_organization_id`), its
`actor_role` vocabulary (`assessor`, `verifier`, `training_provider`,
`education_provider`, `sector_body`, `public_body`), the formal requirement
rows (`lib/country-readiness` requirement rows / qualification requirements),
the Living CV evidence states (decision 0023), and SEP-6
(`hasRecognizedEquivalence` stays false until this exists).

**Minimal implementation.** One table `recognised_equivalences` with the five
mandatory properties of §1.10: evidence reference, provenance (assessor org +
role + time), requirement linkage (required, not nullable), validity window +
revocation, a subject-visible receipt (the subject can read every row about
them). Writes through one SECURITY DEFINER function that reuses the
independence predicate. The matcher reads it to set `hasRecognizedEquivalence`.

**Dependencies.** At least one real training-provider / assessor organization
on the platform (production holds none, per §1.10); the Institution / RPL chain
reaching its dependency point.

**Tests.** The beneficiary and an employer managing the subject's organization
are refused; a row without a requirement is refused; a revoked or expired row
no longer satisfies the requirement; the subject sees every row; SEP-6 guard
(demonstrated capability alone never sets equivalence).

**Owner decision.** ARCH-2's principle is approved and its implementation
deferred by the owner. The question that remains: *"Which first assessor or
training provider will assert equivalences, and against which requirement set
(country, sector)?"* — building before that answer serves nobody.

**Risk if done wrong.** Self-asserted equivalence; an equivalence with no
requirement; a demonstrated skill silently treated as a qualification (SEP-6).

## I. 8.15 — App store release (ARCH-6)

**What it is.** Publishing the native apps to Google Play and the App Store.

**Reused.** `apps/mobile` (Expo; the record-and-review slice), the readiness
and submission documents in `docs/mobile/` (`STORE_RELEASE_READINESS_2026-09-13.md`,
`SIGNING_AND_SUBMISSION_RUNBOOK_2026-10-15.md`, `MOBILE_STATUS_2026-10-14.md`),
the beta merge / rollback plan PR (#2449) and the release preparation PR (#2447).

**Minimal implementation.** Ship the existing slice as an internal / closed
test track first (Play internal testing, TestFlight), not a public listing:
signed build from CI, the truthful data-collection declaration, real
screenshots, support contact. Public listing only after a real device walk.

**Dependencies (all owner-held, `STORE_RELEASE_READINESS` §4).** Icon art or
approval, Apple Developer account, Google Play account + upload key, the data
safety declaration, store metadata wording, support contact, real screenshots
from a signed-in device session.

**Tests.** CI build of both platforms; the existing mobile unit suite; a
device checklist (sign-in, record, review, offline queue) recorded as evidence
before any public listing.

**Owner decisions.**
1. ARCH-6: *"Which capabilities must the native apps carry before the first
   public store release — is the current record-and-review slice enough for a
   closed test track?"*
2. *"Will you create the store accounts and hold the signing keys, and approve
   the data-collection declaration?"*

**Risk if done wrong.** A store listing that over-claims the app; a false data
declaration the stores hold the publisher to; a signing key held by an agent.
