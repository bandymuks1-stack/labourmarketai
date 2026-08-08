# W13 — Communication & attention: the canonical baseline

**Status:** `W13_BASELINE_DEFINED_FROM_SHIPPED_NOTIFICATION_SPINE`
· `W13_SIGNAL_ADMISSION_MODEL_PROVEN` (§2.9, 2026-08-07)
· `W13_SEEN_CLEAR_LIFECYCLE_AUDITED_ONE_OWNER_GATED_PACKAGE_PREPARED` (§5.7, 2026-08-07)
**Date:** 2026-08-07 (revised same day, after the production ledger reconciliation)
**Method:** written **from current code truth**, not from a wish list. Every
migration state below is **production-verified read-only** rather than inferred
from a code comment — two comments turned out to disagree with production.
**Scope of this document:** definition only. It ships **no** signal, **no** migration
and **no** infrastructure.

---

## 0. Why this document exists, and what it corrects

The matrix carried W13 as *"Scope never defined — yet code exists"*. That framing
undersold the state of the repo. W13 is **not greenfield**: a complete, honest,
well-documented attention spine has shipped, with a stated design philosophy that
is stricter than most notification systems:

> A signal only exists when its count is REAL (loaded from an RLS-scoped
> per-surface model) **and** when a route exists that clears or resolves it —
> visiting the surface IS the read event, so the spine never needs a fake
> "mark read".
> — `lib/notifications/spine-signals.ts`

The corollary the codebase applies consistently, and which this baseline adopts as
**W13's first principle**:

> **A badge that cannot clear is permanent noise, not a signal.**

Two signals are held at zero *by design* because their seen-model migration is
unapplied, and one further signal is deliberately unwired for the same reason.
That is discipline, not incompleteness — and it is why the honest count of W13's
real gaps is small and specific.

---

## 1. The spine, as built

| Layer | File | What it owns |
|---|---|---|
| Catalogue (pure data) | `lib/notifications/spine-signals.ts` | `SPINE_SIGNALS`, `SpineCounts`, `buildSpineNotifications` |
| IO | `lib/notifications/spine.ts` | `getSpineCounts()` — one parallel pass, React `cache`d per request; `buildNavBadges()` |
| Bell UI | `components/app/notification-panel.tsx` | dialog panel, per-signal rows, "view all" |
| Mount | `components/app/spine-stream.tsx` | one read → bell + nav badges |
| Full surface | `app/[locale]/dashboard/activity/page.tsx` | the "view all" destination, same `getSpineCounts()` |
| Module badges | `lib/dashboard/dashboard-module-registry.ts` | `attentionSignalIds` per module card |
| Assistant | `lib/assist/assist.ts` | consumes the same `getSpineCounts()` |
| Guard | `lib/guards/notification-spine.test.ts` | every `href` is a real page; every `type` has LT/EN/RU copy; seen-model wiring |

**One source, five consumers.** The bell, the nav badges, the module cards, the
activity page and the assistant all read the same request-cached counts, so they
cannot disagree. This is the single strongest property W13 already has, and every
future slice must preserve it.

---

## 2. The eight signals, documented

Ordered as they display (the ladder: *a person waiting on you outranks passive news*).

### 2.1 `pending-invitations`

| | |
|---|---|
| Source | `listMyPendingWorkerInvitations()` — `company_worker_invitations` + `agency_worker_invitations`, matched on the caller's **email** |
| Audience | any signed-in person who has been invited |
| Context | **Personal** (email identity, not a workspace) |
| Count | number of pending invitation rows |
| Clearing | accept / decline on the **dashboard overview** card |
| Route | `/dashboard` · `featureKey: "overview"` |
| Fail-closed | `42P01` → `needs-migration` → 0 |
| Class | **ACTIONABLE** |

### 2.2 `unread-messages`

| | |
|---|---|
| Source | `getUnreadConversationCount()` → `conversation_participants.last_read_at` vs `conversation_messages.created_at`, `author_id ≠ me` |
| Audience | every participant |
| Context | **Personal** |
| Count | **conversations** with an unread counterpart message — not messages |
| Clearing | opening the thread stamps `last_read_at` |
| Route | `/dashboard/communication` · `featureKey: "communication"` |
| Fail-closed | any error → empty set → 0 |
| Class | **ACTIONABLE** |
| Known bound | the message scan is `.limit(500)` newest-first, so a conversation whose newest counterpart message falls outside that window is counted as READ. The error is always an **undercount**. **STALE-RISK** — full analysis and the prepared fix in **§5.7.3 / §5.7.4**. |

### 2.3 `incoming-service-requests`

| | |
|---|---|
| Source | `getPendingIncomingRequestCount()` → `service_offering_requests` where **`provider_id = auth.uid()`** |
| Audience | the provider |
| Context | **Personal** — see §4, this is a `profile_id`, not an organisation |
| Count | rows with `status = 'sent'` |
| Clearing | responding (accept / decline) changes the status |
| Route | `/dashboard/service-requests` · no `featureKey` (module-card badge) |
| Fail-closed | non-ok read → 0 |
| Class | **ACTIONABLE**, state-derived (no seen marker needed) |

### 2.4 `service-request-responses`

| | |
|---|---|
| Source | `getServiceRequestsNewCounts().buyerNew` vs `service_offering_requests_seen` |
| Audience | the requester (buyer) |
| Context | **Personal** |
| Count | provider accept/decline responses **since `seen_at`** |
| Clearing | visiting the requests surface stamps seen |
| Route | `/dashboard/service-requests` |
| Fail-closed | no seen row → 0 |
| Class | **INFORMATIONAL** (a response is news; the persistent accepted total lives on the page itself) |
| Migration | **RESOLVED 2026-08-07: `20260627181500_service_requests_seen` is APPLIED.** `service_offering_requests_seen` exists in production with **2 rows** — the seen model is live and in real use. It has no `APPLIED_LEDGER.md` row, which is a bookkeeping gap in the pre-`20260702130000` era the ledger never claimed to cover (see the coverage boundary now stated at the top of that file). Verified read-only. |

### 2.5 `pending-bookings`

| | |
|---|---|
| Source | `getPendingIncomingBookingCount()` → the caller's incoming `booking_requests` |
| Audience | the worker being booked |
| Context | **Personal** |
| Count | `status = 'proposed'` |
| Clearing | responding changes the status |
| Route | `/dashboard/bookings` |
| Fail-closed | non-ok → 0 |
| Class | **ACTIONABLE**, state-derived |

### 2.6 `booking-responses`

| | |
|---|---|
| Source | `getBookingResponsesNewCount()` vs `booking_requests_seen.seen_at` (RPC `mark_booking_requests_seen`) |
| Audience | the proposer |
| Context | **Personal** |
| Count | owner accept/decline **after** `seen_at`; the caller's own propose/withdraw never counts |
| Clearing | visiting `/dashboard/bookings` stamps seen |
| Route | `/dashboard/bookings` |
| Fail-closed | `seen_at` null (never opened **or** migration unapplied) → 0 |
| Migration | `20260706120000_booking_requests_seen` — **APPLIED 2026-07-06** (ledger line 811) |
| Class | **INFORMATIONAL** |

### 2.7 `open-task-attention`

| | |
|---|---|
| Source | `getTaskAttentionCounts()` → `work_tasks` where `assignee_profile_id = me OR created_by = me`, open statuses |
| Audience | assignee or creator |
| Context | **Personal** |
| Count | distinct total of **overdue + blocked** |
| Clearing | resolving / unblocking / rescheduling the task |
| Route | `/dashboard/tasks` · no `featureKey` (module-card badge) |
| Fail-closed | `42P01`/`42703` → `needs-migration` → 0 |
| Migration | `20260711210000_work_tasks_v1` — **APPLIED 2026-07-11** (ledger line 828) |
| Class | **ACTIONABLE**, state-derived — a real, live count |

> **Correction this audit makes.** `spine-signals.ts` still says this count is
> *"0 while the work_tasks migration is unapplied (control room PR D)"*. That
> comment is **stale**: the migration was applied on 2026-07-11. A reader
> trusting the comment would conclude the signal is dead in production; it is
> not. **FIXED 2026-08-07** — the comment now states the applied date and that
> the count reads 0 because `work_tasks` holds **0 rows** in production, which is
> a different and truthful fact.

### 2.8 `new-job-matches`

| | |
|---|---|
| Source | `getNewMarketplaceMatchCount()` → `loadWorkerOpportunityMatches({}).newCount` vs `worker_opportunity_seen` |
| Audience | workers only |
| Context | **Personal** |
| Count | **ONE aggregate row** for all unseen matching jobs — never a row per job (anti-spam is an explicit owner mandate). Derived over ALL recommendable matches, not the displayed slice |
| Clearing | rendering a recommendation marks it seen |
| Route | `/dashboard/opportunities` · no `featureKey` |
| Fail-closed | any throw → 0; non-worker → 0 |
| Migration | `20260714170000_worker_opportunity_seen_v1` — **owner-gated, UNAPPLIED** ⇒ **structurally 0 in production today** |
| Class | **PARTIALLY IMPLEMENTED** (code complete, data absent) |

---

## 2.9 THE SIGNAL ADMISSION MODEL (W13-0b) — the full contract, stated once

`W13_SIGNAL_ADMISSION_MODEL_PROVEN`, 2026-08-07.

A signal may enter the spine **only** when all four hold. Three were documented
in code comments; the fourth (host module) was discovered by attempting an
admission and being refused (§3.1).

| # | Requirement | Enforced by |
|---|---|---|
| 1 | A **real count** from an RLS-scoped per-surface reader that degrades to 0, never fabricates | `notification-spine.test.ts` |
| 2 | A **route that clears or resolves it** — visiting IS the read event, so no fake "mark read" ever exists | `notification-spine.test.ts` (href must be a real page under `/dashboard`) |
| 3 | **Copy for the type** in every active locale (`auth.notifications.types.<type>`) | `notification-spine.test.ts` |
| 4 | **A dashboard module that declares it** in `attentionSignalIds` | `activity-centre.test.ts` (×4) + `activityCentre.readSemantics.<type>` copy in all five active locales |

**Why #4 is not bureaucracy.** `lib/dashboard/activity-centre.ts` builds
`MODULE_BY_SIGNAL` by *inverting* the module registry. A signal with no
declaring module has no filter chip, no label source, and silently disappears
from `/dashboard/activity` — it would exist in the bell and nowhere else. The
module is what gives a signal a **presentation and action path**; without one,
the signal is not real to the product even if its count is.

### 2.9.1 Every shipped signal, against the contract

| Signal | Source truth | Audience | Host module | Destination | Clearing action | Context |
|---|---|---|---|---|---|---|
| `pending-invitations` | `company_worker_invitations` + `agency_worker_invitations` by **email** | anyone invited | `overview` | `/dashboard` | accept / decline on the overview card | Personal |
| `unread-messages` | `conversation_participants.last_read_at` vs `conversation_messages` | every participant | `communication` | `/dashboard/communication` | opening the thread stamps `last_read_at` | Personal |
| `incoming-service-requests` | `service_offering_requests.provider_id` | the provider | `service_requests` | `/dashboard/service-requests` | responding changes the status | Personal |
| `service-request-responses` | vs `service_offering_requests_seen` (**applied, 2 rows**) | the requester | `service_requests` | `/dashboard/service-requests` | visiting stamps seen | Personal |
| `pending-bookings` | incoming `booking_requests` | the worker booked | `bookings` | `/dashboard/bookings` | responding changes the status | Personal |
| `booking-responses` | vs `booking_requests_seen` (applied) | the proposer | `bookings` | `/dashboard/bookings` | visiting stamps seen | Personal |
| `open-task-attention` | `work_tasks` overdue+blocked (**applied, 0 rows**) | assignee or creator | `tasks` | `/dashboard/tasks` | resolve / unblock / reschedule | Personal |
| `new-job-matches` | recommendations vs `worker_opportunity_seen` (**absent**) | workers | `opportunities` | `/dashboard/opportunities` | rendering marks seen | Personal |

**8 of 8 satisfy all four requirements.** Two carry a `featureKey` and badge a
nav tab (`overview`, `communication`); the other six badge module cards only —
correct, because a `featureKey` is set *only* where the feature's primary
surface is the signal's own clearing surface.

**Every host module is distinct from every aggregating surface.** `activity`,
`assist`, the hubs and the workspace all declare **no** `attentionSignalIds`,
with explicit comments saying a badge there would double-count. Anti-double-
counting is already an enforced property, not a convention.

### 2.9.2 What happens when no host exists

The signal **cannot be admitted**. That is not a gap to route around — it is the
model working. A signal without a module has no place to be seen, no filter, and
no label, so admitting it would put a number in the bell that leads nowhere the
rest of the product acknowledges. §3 is the live instance.

---

## 3. The ninth signal that exists but is NOT in the spine

**`ConfirmPulse` — `components/app/arena/confirm-pulse.tsx`.**

| | |
|---|---|
| Source | `countReviewablePendingEntries()` → the gated `reviewable_journal_entry_ids` RPC |
| Audience | managers with journal entries awaiting confirmation |
| Count | real, RLS-gated, 0 when the RPC is absent |
| Clearing route | `/dashboard/inbox/quick` — a **real** one-tap confirm queue |
| Where it renders | three project surfaces only: `/dashboard/projects`, `/dashboard/projects/[id]`, `/dashboard/projects/[id]/operations` |
| In the spine? | **No.** No bell row, no nav badge, no module badge, not on `/dashboard/activity` |

It satisfies **both** documented spine admission criteria — a real count *and* a
route that clears it — and it is the clearest current defect in the attention
model: a manager with a non-empty confirm queue is told **only if they happen to
open a project**. It is not a duplicate: nothing else in the spine counts journal
confirmations, so admitting it cannot double-count.

### 3.1 A THIRD admission criterion exists, and was undocumented

This baseline attempted the wiring and **backed it out**, because the guards
refused it for a reason worth recording:

```
signal pending-confirmations must map to a source module: expected undefined to be truthy
```

`lib/dashboard/activity-centre.ts` builds `MODULE_BY_SIGNAL` by inverting the
dashboard module registry's `attentionSignalIds`. Every spine signal must
therefore be **declared by a dashboard module** — otherwise it silently vanishes
from `/dashboard/activity`, has no filter chip, and has no label source. The
guards pin this in four places, plus `activityCentre.readSemantics.<type>` copy in
all five active locales.

**No module hosts the confirm queue.** There is no `inbox` module, and the
`journal` module is `roles: ["worker"]` — while the confirm queue is a **manager**
confirming *other people's* entries. Attaching the signal there would badge the
wrong audience.

So the real admission rule, now written down for the first time, is:

> A spine signal needs a real count, a route that clears it, **and a dashboard
> module that owns it**.

That third requirement is a *good* invariant — it is what stops a signal existing
in the bell but nowhere else. It also means **W13-1 is not the trivially-safe
wiring slice it first appears to be**: it requires deciding where a manager's
confirm queue lives in the module catalogue, which is an IA decision (a new module
card is a visible product surface, and Product Gate A-09 governs new surfaces).

The attempt cost nothing and produced this finding; the code is unchanged.

### 3.2 ConfirmPulse — the classification, decided

The brief asks for an honest verdict among: canonical signal · separate
subsystem · obsolete · future candidate. Against the §2.9 contract:

| Requirement | ConfirmPulse |
|---|---|
| 1 — real count | ✅ gated `reviewable_journal_entry_ids` RPC, 0 when absent |
| 2 — clearing route | ✅ `/dashboard/inbox/quick`, a real one-tap confirm queue |
| 3 — type copy | ❌ none — `pending_confirmations` does not exist in any catalog |
| 4 — host module | ❌ **none.** No `inbox` module exists, and `journal` is `roles: ["worker"]` while confirming is a **manager** act |

**Verdict: `FUTURE_CANDIDATE`.** Not canonical, not obsolete, not a subsystem.

- **Not canonical** — it fails two of four requirements, and both failures are
  structural rather than clerical.
- **Not obsolete** — it renders a real, live, RLS-gated count on three project
  surfaces and its clearing route works today.
- **Not a separate subsystem** — it has no store, no lifecycle and no
  presentation of its own beyond a single card. Calling it a subsystem would
  dignify one component.

**Blocked on exactly one product question:** where does a manager's confirm queue
live in the module catalogue? A new module card is a visible product surface
governed by Product Gate A-09; widening `journal` to non-worker roles changes who
sees a worker-framed module. Either is a real decision; neither is a wiring task.

**Deliberately not forced into the spine** (the brief's instruction, and the
right call regardless): repeating the reverted wiring would produce a bell row
that `/dashboard/activity` cannot render and no filter chip can reach.

**The honest interim state is what ships today** — the count is visible where the
work is, and this baseline records that a manager who never opens a project is
not told. A stated limitation, not a silent one.

---

## 4. The structural finding: the spine is PERSON-scoped, not workspace-scoped

Every one of the eight readers keys on `auth.uid()`. **No spine reader takes the
active workspace as an input**, and none imports the workspace context:

- `service_offering_requests.provider_id = auth.uid()` — a **profile**, not an org
- bookings split incoming/outgoing by the caller as subject — a **profile**
- tasks: `assignee_profile_id = me OR created_by = me` — a **profile**
- invitations: matched on the caller's **email**
- unread: `conversation_participants.profile_id = me`

**Consequence.** After the W9 multi-org train, one person can act for several
organisations. Their bell does not change when they switch. Every count is the
merged personal total, and no row says which organisation a signal belongs to.

**This is not automatically wrong.** For invitations and unread messages, personal
scope is *correct* — they are facts about the human, exactly as W6's `experiences`
reasoning establishes. What is unresolved is whether org-bound work signals
(service requests, bookings, tasks) should be **filtered** by the active workspace
or merely **labelled** with their organisation.

Recorded as **W13-6** in §6 and as an owner decision in §7. It is stated here, and
deliberately not decided, because it is a product question with two defensible
answers and no code change can be honest until it is answered.

---

## 5. Audit of the surrounding surfaces

### 5.1 Migrations and their real state

| Migration | Table | State |
|---|---|---|
| `20260706120000_booking_requests_seen` | `booking_requests_seen` | **APPLIED** 2026-07-06 |
| `20260714170000_worker_opportunity_seen_v1` | `worker_opportunity_seen` | **UNAPPLIED**, owner-gated — table verified ABSENT in production 2026-08-07 → §2.8 sits at 0, correctly |
| `20260717150000_demand_interest_seen_v1` | `demand_interest_seen` | **UNAPPLIED**, owner-gated — table verified ABSENT in production 2026-08-07 → the interest-response signal is deliberately unwired |
| `20260627181500_service_requests_seen` | `service_offering_requests_seen` | **APPLIED** — table exists, **2 rows** (verified 2026-08-07) |

**W13-0 CLOSED 2026-08-07.** All four rows above are now production-verified
read-only, and the one open question is answered: `service_offering_requests_seen`
is applied and carries real data, so the `service-request-responses` signal has a
working seen model in production.

Its missing `APPLIED_LEDGER.md` row is a **bookkeeping** artefact of the
pre-`20260702130000` era, which that file has now been amended to say it never
claimed to cover. The full sweep —
`docs/audits/APPLIED_LEDGER_FULL_RECONCILIATION_2026-08.md` — reconciles all 190
repo migrations against all 187 production rows and found three genuinely new
unrecorded applies plus one migration whose gate state needs owner review.

### 5.2 The missing interest-response signal

`spine-signals.ts` documents the deferral explicitly: *"no seen-model exists for
interest signals, so a count could never clear by visiting."* The migration that
would unblock it (`20260717150000`) exists, is a structural mirror of the applied
`worker_opportunity_seen` model, and its ledger entry states that wiring lands
**only after** the owner applies it. **Nothing here is missing except an owner
decision** — no design work is outstanding.

### 5.3 Nav badges vs module badges

`buildNavBadges()` badges a nav tab **only** when a signal declares a `featureKey`,
and a `featureKey` is set **only** when the feature's primary surface is that
signal's own clearing surface. Two tabs qualify today: Overview (invitations) and
Messages (unread). The other six signals badge **module cards** via
`attentionSignalIds`, never a tab.

Several modules carry explicit *"declares NO `attentionSignalIds`"* comments with
reasons (finance, proposals, listings, and the aggregating hubs — *"a badge here
would double-count"*). **Anti-double-counting is already an enforced,
reasoned-about property.** No duplicated attention signal was found.

### 5.4 Relationship to chat

Chat is a **signal source**, not a notification channel: `unread-messages` is one
of eight rows, and it clears by reading the thread. The workspace's chat-first
architecture is untouched by W13, and the bell must not become a second inbox.

### 5.5 Email and push — the honest state

- **No notification email exists.** The only mail path is
  `lib/email/transactional.ts`, a provider-neutral adapter configured by
  `INVITE_EMAIL_PROVIDER` / `INVITE_EMAIL_API_KEY` / `INVITE_EMAIL_FROM`, used for
  **invitations**. It returns `not_configured` when unset and never fakes a send.
- **No push exists.** No service worker subscription, no `web-push`, no device token store.

Per this train's brief, **no push/email infrastructure is added in this baseline
slice.** The adapter is nonetheless the right seam for W13-5 when it comes.

### 5.6 Two-step confirmation

It does **not** belong in W13. `ConfirmPulse` is journal-evidence confirmation — a
**W5/W6 trust-domain workflow**. What belongs to W13 is only its *attention*
half: telling the person that a confirm queue is waiting (§3). W13 notifies; the
trust domain still owns the confirmation itself.

---

## 5.7 W13-7 — the seen/clear lifecycle, audited

`W13_SEEN_CLEAR_LIFECYCLE_AUDITED_ONE_OWNER_GATED_PACKAGE_PREPARED`, 2026-08-07.

### 5.7.1 Two clear models, and only two

| Model | Signals | How it clears | Needs a table? |
|---|---|---|---|
| **State-derived** | `pending-invitations`, `incoming-service-requests`, `pending-bookings`, `open-task-attention` | the underlying row changes state (accept, respond, resolve) | no |
| **Seen-marker** | `service-request-responses`, `booking-responses`, `new-job-matches` | visiting the surface stamps `seen_at` | yes |
| **Read-pointer** | `unread-messages` | opening a thread stamps `conversation_participants.last_read_at` | no (column) |

There is no third model and **no `mark all read` that fakes a clear** — the panel
has a `markAllReadLabel`, but every real clear happens on the destination
surface. That is the property to protect.

### 5.7.2 Seen-marker migrations — production-verified 2026-08-07

| Table | State | Consequence |
|---|---|---|
| `booking_requests_seen` | **applied** | `booking-responses` fully functional |
| `service_offering_requests_seen` | **applied, 2 rows** | `service-request-responses` fully functional — this replaced the previous "unknown" |
| `worker_opportunity_seen` | **ABSENT** (owner-gated) | `new-job-matches` pinned to 0 — correct under the first principle |
| `demand_interest_seen` | **ABSENT** (owner-gated) | interest-response signal deliberately unwired |

No stale seen-marker table was found: every seen table that exists has a live
reader, and every reader whose table is absent degrades to 0 rather than erroring.

### 5.7.3 ⚠️ The 500-row unread scan — the one real correctness defect

`getUnreadConversationIds` fetches the **newest 500 counterpart messages across
all of the caller's conversations**, then marks a conversation unread if its
newest message in that window post-dates `last_read_at`.

**Failure mode:** a conversation whose newest counterpart message falls *outside*
the 500-message window is simply absent from the result and is counted as
**read**. The error is always an **undercount** — the product can say "nothing
needs your attention" when something does. It can never over-report.

**Saturation condition:** more than 500 counterpart messages in the recent
window, with at least one unread conversation older than the 500th. Not
reachable at today's production volume — and that is a volume bet, not a
correctness argument, which is why it is recorded as a defect rather than
dismissed.

The empty state currently asserts **"Nothing needs your attention right now."**
Under saturation that sentence is unproven.

### 5.7.4 The prepared package (NOT implemented — owner-gated)

It is two halves, and the honest-copy half cannot ship alone because it depends
on the same plumbing.

**Half A — correctness (needs a migration ⇒ OWNER-GATED).**
The scan needs *one row per conversation*: `max(created_at) where author_id <>
me`, grouped by conversation. PostgREST cannot express that without an RPC, so
the fix is a `SECURITY DEFINER` reader (`auth.uid()`-bound, no parameters, RLS-
equivalent scoping) returning `(conversation_id, last_counterpart_at)` per
participant row. Cost: one indexed aggregate instead of a 500-row scan — also
**faster** than today on the hot dashboard path.
*Not written here:* preparing a migration file is itself a gated act in this
repo, and this train applies none.

**Half B — honest copy (no migration, but NOT a one-liner).**
The completeness flag has to cross the server→client hydration boundary:

`unread.ts` (return `{ids, complete}`) → `spine.ts` → `spine-stream.tsx` →
`SpineHydrator` → `applySpine()` → `AuthState` → `notification-panel.tsx`
empty-state branch → new copy in **five** active locales → a guard pinning that
the "nothing needs your attention" line is unreachable while `complete === false`.

**Explicitly rejected shortcut:** putting a boolean on `SpineCounts`. The guard
*"every spine count feeds at least one visible signal — no orphan loads"*
iterates every field of `SpineCounts` and requires each to render a row. A
non-count field would break it, and weakening that guard to allow one would
remove a real protection.

**Interim state, stated honestly:** the undercount is not reachable at current
production volume, and this baseline now records the exact condition under which
it becomes reachable. Nothing in the product claims otherwise.

---

## 6. W13 canonical scope

| # | Slice | Contains | Depends on |
|---|---|---|---|
| ~~**W13-0**~~ | ~~Ledger reconciliation~~ | **DONE 2026-08-07** — `20260627181500_service_requests_seen` is APPLIED (2 rows). Full sweep in `docs/audits/APPLIED_LEDGER_FULL_RECONCILIATION_2026-08.md` | — |
| ~~**W13-0b**~~ | ~~Stale-comment fix~~ | **DONE 2026-08-07** — `spine-signals.ts` corrected. `20260711210000_work_tasks_v1` applied 2026-07-11; `work_tasks` verified present in production with **0 rows**, so the signal is a live count that is legitimately zero | — |
| **W13-1** | In-app attention | The 8 shipped signals + admit `ConfirmPulse` as the 9th (§3). One source, five consumers — preserved | **a host-module decision (§3.1)** — no migration, but not zero-decision |
| **W13-2** | Unread / seen lifecycle | **AUDITED 2026-08-07 (§5.7)** — exactly three clear models (state-derived, seen-marker, read-pointer), no fake clear anywhere, no stale seen table. ONE correctness defect found: the 500-row unread scan can UNDERCOUNT (§5.7.3), so "nothing needs your attention" is unproven under saturation. Package prepared in §5.7.4: Half A needs an RPC ⇒ **owner-gated**; Half B (honest copy) is blocked on the same plumbing | Half A: a migration |
| **W13-3** | Actionable notifications | Every row reaches a route that resolves it. Already true for 8/8; keep it true | none |
| **W13-4** | Digest / escalation | **NOT STARTED.** Needs a delivery channel first, so it is blocked behind W13-5 | W13-5 |
| **W13-5** | Email / push policy | **NOT STARTED.** Requires an owner decision on channel, cadence and consent before any code. The transactional adapter is the seam | owner decision |
| **W13-6** | Context isolation | Decide filter-vs-label for org-bound signals (§4), then implement | **owner decision** |
| **W13-7** | Accessibility & mobile | The panel is a labelled `role="dialog"` with a close control; a full a11y pass at 1440 + 375 has **not** been run against it | none — **safe** |

**Explicitly out of W13:** the confirmation workflow itself (W5/W6), chat as a
product (W8), the calendar's conflict semantics (W12).

---

## 7. Owner decisions required

1. **Apply `20260714170000_worker_opportunity_seen_v1`?** Until then
   `new-job-matches` is permanently 0 in production — shipped code, no data.
2. **Apply `20260717150000_demand_interest_seen_v1`?** Until then the
   interest-response signal stays unwired by design.
3. **W13-6: filter or label?** Should org-bound signals follow the active
   workspace, or stay merged and carry an organisation label?
4. **W13-5: is there an email/push channel at all**, and with what consent model?
5. **W13-1: where does a manager's confirm queue live in the module catalogue?**
   (§3.1) A new module card, or an existing module widened to non-worker roles.
   Until this is answered the ninth signal cannot be admitted honestly.

*(`work_tasks` needs no decision — it was applied on 2026-07-11; only the code
comment claiming otherwise is stale. See §2.7.)*

## 8. What is safe to build next, without any owner input

**W13-7** (the panel accessibility pass). W13-0 and W13-0b are **both DONE**
(2026-08-07), settled by a read-only production reconciliation rather than left
as open questions.

**W13-1 was attempted in this slice and correctly refused** — see §3.1. It is the
highest-value remaining item, but it needs one IA answer first (owner decision 5),
not just wiring. The attempt is worth more than a guess: it converted "obvious
next slice" into a precise, one-question blocker.

---

## 9. Two signals are held at zero in production — and that is correct

Worth stating plainly, because it is easy to misread as brokenness:

- `new-job-matches` → 0 until `worker_opportunity_seen` is applied
- the interest-response signal → absent until `demand_interest_seen` is applied

In both cases the code is complete and the count is *deliberately* suppressed,
because without the seen table the count could never clear. Under this baseline's
first principle — **a badge that cannot clear is permanent noise** — showing them
would be the defect. The gap is an owner decision (§7 items 1–2), not missing work.
