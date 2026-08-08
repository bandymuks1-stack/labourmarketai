# W7 CLOSURE AUDIT — P1-3 and P2-1

Reality-audits the two remaining W7 items that were never slices, and ships the
part of P2-1 that needs no schema change. Both audits were done against current
`main`, not against the descriptions in the matrix — and in both cases the
matrix description turned out to be incomplete.

| | |
|---|---|
| Starting `origin/main` | `7632f428e109f3710c6a61c2459c16c93f7a024a` (W7-S5, merged as #1055) |
| Branch | `feat/cc/w7-closure-audit` |
| Worktree | `C:/Users/Mano/Documents/claud darbai/labourmarketai-wt/w7-close` |
| Migration | **none** |

---

## 1. W7 P1-3 — conversation memory

The matrix records: *"conversation memory — SQL still in `docs/proposals/`,
never a migration"*. Verified, and the surrounding truth established.

### What persists today: nothing

| question | answer | evidence |
|---|---|---|
| what conversation state persists? | **none** | `conversation-chat.tsx:374` — `const [items, setItems] = useState<ThreadItem[]>(initial)`. Plain React state, re-seeded from `initial` each mount. Reload resets the thread. |
| is anything cached client-side? | **no** — one exception, and it is not memory | the only `sessionStorage` use is a voice-transcript hand-off (`VOICE_TRANSCRIPT_DRAFT_KEY`), read **once** and `removeItem`-ed immediately (`:1292–1299`) |
| does the schema support it? | **no** | `assistant_conversations` / `assistant_messages` do not exist in `supabase/migrations/` — grep returns nothing |
| per user / workspace / result? | **n/a** — there is no store to scope | — |

So the honest statement is stronger than "the SQL is only a proposal": **the
AI-control thread has no persistence layer of any kind.** Nothing is being
retained that should not be, which is worth stating explicitly for the privacy
side of the question — there is no conversation-memory retention risk today
because there is no conversation memory.

### The design exists and is intact

`docs/proposals/assistant-transcript-v1/` holds a complete, doctrine-checked
design: two tables, three `SECURITY DEFINER` RPCs, append-only hash-chained
messages, a default-closed RLS matrix, a four-way separation from
`conversation_messages` / `journal_entries` / action results, a 24-month
retention proposal, export + erasure RPCs, and a 7-point test plan.

**Integrity verified** — the README pins SHA-256 for both files and asks that
they be recomputed before apply:

| file | README | recomputed | verdict |
|---|---|---|---|
| `…_v1.sql` | `de0e3ff8…97f` | `de0e3ff8…97f` | ✅ match |
| `…_v1.down.sql` | `ea8e83c2…737` | `ea8e83c2…737` | ✅ match |

> **Operational note for whoever runs this check on Windows.** `sha256sum` on
> the working-tree file returns `bc4eaddd…` / `7284ddf3…` and looks like a
> failed integrity check. It is not: this repo checks out CRLF, and the pinned
> hashes are of the committed LF content. Verify with
> `git show HEAD:<path> | sha256sum`, which matches exactly. A false integrity
> alarm on an owner-gated migration is exactly the kind of thing that stops a
> correct apply, so it is recorded here rather than left to be rediscovered.

### Verdict — `W7_CONVERSATION_MEMORY_BLOCKED_MIGRATION_GATE`

A migration is required; per the execution brief this sub-slice **stops at the
human gate**. No duplicate work was done: the package already exists as
**Draft PR #883** (`feat(assistant): transcript persistence migration`),
itself stacked on the owner-gated **#879**.

**Exact owner action required**

1. Review Draft PR #883 (and #879 beneath it).
2. Confirm the 24-month retention default and the erasure model
   (whole-thread hard delete, so the hash chain never fractures mid-thread).
3. Copy the proposal SQL to `supabase/migrations/` + `supabase/rollbacks/`
   per the README's §16 naming, bump the two pinned baselines.
4. Apply via Supabase MCP `apply_migration` — **never** `supabase db push`.
5. Record `APPLIED TO PROD` in the ledger.

Nothing in this PR pre-empts any of that.

---

## 2. W7 P2-1 — open-ended booking conflict

The matrix records: *"open-ended bookings skip the overlap guard"*. **True, and
the mechanism is exact.**

### The mechanism

`supabase/migrations/20260802150000_booking_atomic_double_booking_v1.sql`
defines a booking's conflict band, in both the structural constraint and the
hand-rolled guard inside `respond_booking_request_v3`, as:

```sql
daterange(start_date, coalesce(expected_end_date, start_date), '[]')
```

With `expected_end_date IS NULL` this collapses to `daterange(d, d, '[]')` —
**a single day**. The migration says so itself, deliberately: *"a NULL end
collapses to the start day (a one-day booking)"*.

The `EXCLUDE USING gist` constraint is partial —
`where (status = 'accepted' and start_date is not null)` — so an accepted
booking with no end date participates in conflict detection **on its start day
only**. Day two onward is unguarded, and a second company can have an accepted
booking for the same worker from day two with no error raised.

### Three incompatible readings of one NULL

| reader | treats an empty end as | evidence |
|---|---|---|
| the conflict guard | **one day** | `coalesce(expected_end_date, start_date)` |
| the bookings list | **no end stated** — renders nothing, reading as ongoing | `bookings/page.tsx:409` appends `"Until {date}"` only when an end exists |
| the form / schema | **"not stated"** | `candidates-result.tsx` — *"the schema's nullable fields mean 'not stated'"* |

The form offered a plain optional `<input type="date">` labelled "Expected end"
with **nothing anywhere saying what leaving it empty does**. An employer who
leaves it blank meaning "ongoing" gets a one-day hold, and the bookings list
then shows no end — quietly confirming the wrong belief.

**This is a real-user harm, not a modelling nicety:** the worker double-booking
protection that W12 built is silently absent for every booking after its first
day.

### What ships here, and what does not

| half | status |
|---|---|
| **honesty** — the form states what an empty end actually does | ✅ **shipped in this PR**, no schema change |
| **capability** — genuinely open-ended bookings that are conflict-safe | ⛔ **owner-gated** — see below |

Shipped: `conversation.results.bookingEndHint` in all five locales, rendered
under the field and bound with `aria-describedby` so a screen-reader user gets
it too — *"Leave empty to book a single day — an empty end does not hold the
worker beyond the start date."*

Pinned by `lib/guards/w7-p2-1-open-ended-booking-honesty.test.ts` (10
assertions), including an assertion that the migration still uses
`coalesce(expected_end_date, start_date)` — so if the interval semantics ever
change, the copy asserting "a single day" must be revisited in the same change
rather than silently becoming a lie.

### The gated half — definitions the owner must settle first

Supporting real open-ended bookings is **not** a one-line schema change,
because "open-ended" is currently undefined in the product. These need
deciding before any migration is written:

| question | why it blocks |
|---|---|
| does an open-ended booking mean *until cancelled*, or *until an unknown but finite end*? | determines whether the band is `[start, ∞)` or needs a review date |
| provisional vs committed | an indefinite **proposal** blocking a worker forever is a denial-of-service on that worker's availability |
| who may end it, and does ending it backdate? | affects whether historical overlaps become representable |
| cross-company | an open-ended booking at company A blocking every booking at company B forever is a commercial decision, not a technical one |
| interaction with `worker_absences`, project stages, travel | explicitly **out of scope** of the current constraint, by its own scope-boundary comment |

**Migration shape, when approved** (not written here, deliberately): the band
becomes `daterange(start_date, expected_end_date, '[)')` with a NULL upper
bound meaning unbounded, in **both** the `EXCLUDE` constraint and
`respond_booking_request_v3`; requires drop + re-add of
`booking_requests_no_overlapping_accepted`, a rollback restoring the current
expression, and a preflight for pre-existing rows that would become
conflicting. Production preflight is mandatory: the original migration
recorded 0 accepted rows, and that count must be re-checked, because a
non-empty table would make `ADD CONSTRAINT` fail loudly (which is the correct
behaviour, but must be planned for rather than discovered).

### Verdict — `W7_OPEN_ENDED_BOOKING_CONFLICT_MODEL_HONEST_CAPABILITY_GATED`

---

## 3. W7 status after this audit

W7-S4 and W7-S5 shipped and merged (#1054, #1055). Of the remaining items:

| item | state |
|---|---|
| P1-3 conversation memory | **BLOCKED — migration gate.** Package exists (#883), verified intact. No repo-side work remains. |
| P2-1 open-ended booking | **PARTIAL — honesty shipped, capability gated.** Needs five product definitions before a migration can even be written. |
| W7-S5b non-worker identity | a pure company/agency identity silently loses 12 of 21 profile sections with no copy acknowledging it. **Safe, unblocked, not yet done.** |
| A-2 touch targets | 28–29 sub-44 px targets remain on the profile |
| content | `workerPrefs.hasTransport` vs `v2.ownVehicle` are the same claim in two fields |
| copy | the `marketplaceHub` namespace is a misnomer after W7-S4 |

**W7 is therefore `W7_REMAINING_GAPS_EXPLICIT`, not `W7_WORKER_JOURNEY_DONE`.**

Two of the six remaining items cannot be closed without the owner. The other
four are safe and unblocked, so W7 is not owner-blocked as a whole — it is
simply not finished. Marking it DONE because the *planned slices* were
exhausted is exactly the failure the brief forbids, so it stays PARTIAL with
the gaps named above.
