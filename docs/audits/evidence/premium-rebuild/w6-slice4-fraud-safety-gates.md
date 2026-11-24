# W6 Slice 4 — FRAUD AND SAFETY GATES

**Scope:** prove and lock that today's risk signals are ADVISORY — that no
signal is an automatic verdict, and no signal reaches an enforcement path.

**Deliberately NOT in scope:** a scoring model, an ML layer, a fraud platform,
or an enforcement mechanism. The audit found no enforcement path exists, so
the honest deliverable is a LOCK on that state — not a subsystem invented in
order to have something to gate.

**Independent of Slice 3.** This slice touches no migration and no experience
code. It does not depend on the owner-gated `experience_records` apply, and it
can merge while PR #974 waits at its human gate.

---

## 1. Signal inventory (what actually exists)

| # | Signal | Where | What it produces | Can it act? |
|---|---|---|---|---|
| 1 | **Admin Risk agent** | `lib/ai/registry/agents/admin-risk.ts` | A prioritized review queue: `item_ref`, `risk_reason`, `suggested_admin_action`, `severity` (low/medium/high enum) | **No.** Advisory by declared contract AND by reachability — see §2 |
| 2 | **Booking Risk agent** | `lib/ai/registry/agents/booking-risk.ts` | A risk narrative over canonical booking signals | **No.** Same |
| 3 | **Communication rate caps** | `lib/communication/rate-caps.ts` → `lib/communication/actions.ts` | `allowed` / `rate_limited` / `unavailable` on ONE write | **Only transiently** — see §4 |
| 4 | **Auto-confirm (learning policy)** | `lib/learning/*`, `lib/journal/review-status.ts` | A confirmation row, honestly marked `auto_confirm` | **Dormant** — see §5 |
| 5 | **Experience moderation** | `experience_records` (Slice 3, owner-gated) | Human moderator decision + mandatory reason + audit row | Human-only by construction; not merged, not applied |

### Signals that do NOT exist, despite appearances

- **`suspiciousPatterns`** is an *input field* on the admin-risk schema. Nothing
  in the tree computes or supplies it. The agent is not even fed suspicion data.
- **No confirmation-anomaly detector exists.** Searched for; there is none.
  Reporting one would have been fabrication.

---

## 2. The enforcement-path audit — the result is an ABSENCE

Each row was searched for across `apps/web/lib`, `apps/web/app` and
`supabase/migrations`.

| Path the directive asks about | Found? | Evidence |
|---|---|---|
| risk signal → account block | **No** | No user-facing table has a `banned` / `suspended` / `is_blocked` / `frozen` / `restricted` column. The only schema matches are `ai_runs.blocked_reason` (an AI run's own safety gate), `learning_policy_settings.disabled_at/by` (an operator policy toggle) and `project_stages.blocked_reason` (project workflow) — none is a person |
| risk signal → public flag | **No** | No `public_flag` / `fraud_badge` / `risk_badge` anywhere |
| risk signal → trust/reputation count | **No** | No module under `lib/trust` or `lib/journal` references either risk agent or the rate caps |
| risk signal → skill deletion | **No** | Exactly ONE code path deletes `worker_skills`: `app/api/workers/[workerId]/skills/route.ts`, which is the worker editing their OWN set (`ownsWorker` gate, 403 otherwise, diff of requested vs saved). It contains no risk vocabulary |
| risk signal → payment / earning hold | **No** | No `payment_hold` / `withhold_payment` / `hold_payout` / `freeze_earnings` exists |
| rate cap → permanent suspension | **No** | The cap returns a transient refusal and writes nothing — see §4 |
| AI agent recommendation → write without a human | **No** | The agents have **zero runtime consumers**. Outside `lib/ai/registry` and `lib/ai/evals`, nothing references them except one static map (§3). The AI runtime has no write-execution primitive at all |
| auto-confirm → capability or reputation | **No** | Dormant, and honestly labelled where it does appear — see §5 |

**Nothing had to be removed, because nothing was there.** The work of this
slice is therefore the guard file that makes the absence durable:
`apps/web/lib/guards/risk-signal-advisory.test.ts` (24 tests).

---

## 3. Two findings that looked like violations and were not

Both were flagged by the first draft of the guard, investigated, and turned
out to be false positives. They are recorded because a reader who repeats the
search will hit them again.

**`lib/ai/runtime/task-routing.ts` references `admin_risk` and `booking_risk`.**
It is a pure static map from agent key to task type (`admin_risk:
"explain_match"`). It holds no agent result and performs no write. The guard
was narrowed from "no file may mention these agents" to "no file that mentions
them may write", plus an explicit pin that this one file stays inert — so the
exemption cannot silently widen.

**`app/api/workers/[workerId]/skills/route.ts` deletes `worker_skills`.**
This is the worker saving their own skill selection: ownership-gated, 403
otherwise, and the delete is the diff of what the person deselected. Banning
it would have banned self-management, not enforcement. The guard now pins
*exactly one* deletion site, that it is owner-gated, and that it contains no
risk vocabulary.

A third false positive was in the guard itself: a lexical search for `photo`
flagged `confidence.ts`'s own doctrine comment ("must never consume …
photos-as-votes") — the sentence forbidding the thing being tested for. This
is the **third** time in W6 that a lexical check flagged the product's own
honesty copy. That test is now structural: it pins `ConfidenceInputs` as a
closed four-field set and checks the formula reads nothing else.

---

## 4. Rate caps — a limit on an action, not a judgement of a person

`MESSAGE_RATE_CAP` = 120 / rolling 60 min · `CONVERSATION_RATE_CAP` = 20 /
rolling 24 h.

What the guards pin:

- the decision vocabulary is `allowed` / `rate_limited` / `unavailable` — no
  punitive state exists to record;
- **default-closed**: `null`, `undefined`, `NaN` and negative counts all give
  `unavailable`, and the write is refused. A failed safety check is never a
  bypass;
- **rolling window**, so it expires on its own; both windows are ≤ 24 h, so a
  cap can never become a lasting ban;
- the module is **pure** — no `from(` / `.rpc(` / insert / update / delete /
  fetch, and no `server-only`. It cannot persist a mark even if asked to;
- hitting a cap records no strike, violation count or abuse record, and never
  escalates to suspension (pinned on `lib/communication/actions.ts`);
- counts are scoped to the caller's OWN windowed reads, so one person's flood
  cannot rate-limit anyone else, in any organization.

---

## 5. Auto-confirm stays dormant and honestly labelled

- `learning_policy_settings` and `learning_signals` are **empty** on the local
  stack. Production row counts were **not** read for this slice and are not
  claimed here.
- An automatic confirmation never renders identically to a hand-confirmed one
  (W6 slice 1's `rowIsAutomatic` qualifier, re-pinned here).
- A learning signal is **not** an input to `computeConfidence`: the input type
  is a closed set of four fields (`managerConfirmedEntries`,
  `selfLoggedEntries`, `uniqueConfirmers`, `lastConfirmationAt`), and the
  formula reads nothing outside it.
- Zero policy rows must render as absence, never as "the system is learning".

---

## 6. The enforcement contract — for whenever it is actually needed

There is no enforcement path today. The guard's final block is therefore
**vacuous by design**: it fails the moment a marker like `suspendAccount`,
`banUser`, `blockAccount`, `deactivateProfile`, `removeSkillForRisk` or
`holdEarnings` appears, and the failure message states what such a path must
carry before it may exist:

1. an authorized **human** decision;
2. a stated **reason**;
3. an **`audit_logs`** row;
4. **idempotency**;
5. a **reviewable** state;
6. **reversibility** / rollback;
7. **no cross-workspace effect**.

It also fails if any file that contains an enforcement marker also references
an AI agent — an agent must never be wired to a verdict.

Writing this as a failing-on-discovery test rather than a comment is the
point: "we forgot the audit row" becomes a red build instead of a hope.

---

## Validation

| Gate | Result |
|---|---|
| `risk-signal-advisory.test.ts` | 24 / 24 |
| vitest (full) | see PR |
| `tsc` / `lint` / `build` / Product Gate / CodeQL | see PR |
| New migration | **none** — this slice adds no SQL and no new human gate |
| Dependency on the Slice 3 migration | **none** |
