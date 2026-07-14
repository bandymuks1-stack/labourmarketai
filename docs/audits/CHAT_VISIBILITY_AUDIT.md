# Chat Visibility Audit — conversations / participants / messages

> **Status:** Complete. **Date:** 2026-06-12. **Author:** Claude Code (ChiefOperator).
> **Scope:** `conversations`, `conversation_participants`, `conversation_messages`
> — RLS, every API/server-action path, and the service-role surface.
> **Doctrine:** §4 (default-closed), §3 (append-only / evidence), §7.x.
> **Verdict:** Default-closed **holds for data**, but the audit found one
> **active correctness/DoS bug** (F0) and three **defense-in-depth gaps**
> (F1–F4). All are fixed in migration
> `20260612170000_conversation_participant_revocation.sql` (**RED tier** —
> draft PR + `needs-human-gate`; prod apply via Supabase MCP after DI review).

---

## 1. What was tested

Every claim below is backed by an **automated hostile negative test** in
`apps/web/tests/e2e/chat-visibility-rls.spec.ts` (runs serial against the
LOCAL Supabase stack via `pnpm e2e:local`; seeds throwaway identities with the
service key, then probes exclusively through anon-key user sessions). The
schema/code invariants that make those results hold are pinned in CI by the
static guard `apps/web/lib/guards/chat-visibility-rls.test.ts` (doctrine-guard
§7 — survives refactors without needing a database).

| # | Negative scenario (the promise) | Result after fix |
|---|---|---|
| 1 | A **same-org** employee who is NOT a participant sees nothing — conversation list, direct-ID probe, message fetch, participant probe — and cannot post. | ✅ Zero rows on all probes; INSERT rejected. |
| 2 | A user from **another org** sees nothing, including by guessing the conversation ID. | ✅ Zero rows. |
| 3 | The **object owner (customer / užsakovas)** sees a conversation ONLY while an explicit, un-revoked grant row exists, and loses access the instant `revoked_at` is set. | ✅ Both directions: invisible → granted → visible → revoked → invisible. |
| 4 | **anon** role: zero access to all three tables. | ✅ After fix: zero rows AND hard permission-denied (grants revoked); INSERT rejected. |
| 5 | **No service-role bypass** in any user-facing chat read/write. | ✅ Audited — see §4. Zero service-role in chat paths. |
| 6 | **Participant removal is a `revoked_at` UPDATE, never a DELETE** (history = evidence, §3/§4.3). | ✅ No DELETE policy/grant; a delete attempt removes nothing; revoked rows persist; self-un-revoke rejected. |

Sanity (non-vacuous): a real participant DOES see the conversation + messages
(test 0), so the negative results are meaningful, not blanket failures.

---

## 2. What was found

### F0 — RLS infinite recursion → `stack depth limit exceeded` (ACTIVE BUG)

`is_conversation_participant()` shipped (migration `0021`) as **`SECURITY
INVOKER`** and reads `conversation_participants`. But that table's own SELECT
policy *calls `is_conversation_participant()`*. So a plain authenticated
`SELECT` on `conversations` recurses: policy → function → table read → policy →
… until Postgres aborts with **SQLSTATE 54001 `stack depth limit exceeded`**.

Reproduced on the current schema before any fix:

```
prosecdef = f   (SECURITY INVOKER)
conversations SELECT (as authenticated): stack depth limit exceeded (54001)
```

**Impact:** the chat read path is broken / trivially DoS-able for any
authenticated user. It has gone unnoticed only because the prod chat tables are
still empty. **Fix:** `is_conversation_participant()` → **`SECURITY DEFINER`**
with `set search_path = public` (the canonical Supabase pattern) so its internal
read bypasses RLS and cannot re-enter the policy. The body is a fixed existence
check bound to `auth.uid()`, so DEFINER cannot be steered to read another user's
membership.

### F1 — Grants were flags, not records (no `revoked_at`)

`conversation_participants` had no `revoked_at`/`revoked_by`. Doctrine §4.3
("grants are records, not flags; revocation = setting `revoked_at`") was
literally unimplementable, and the object-owner scenario (test 3) could not be
satisfied. **Fix:** add `revoked_at timestamptz` + `revoked_by uuid`; the
participant-check helper now requires `revoked_at IS NULL`, so the cut-off
propagates atomically to every policy that calls it.

### F2 — No revocation path at all

There was no DELETE policy (correct — append-only) but also **no way to
withdraw access**. **Fix:** `revoke_conversation_participant(conversation_id,
profile_id)` — `SECURITY DEFINER`, **creator-or-admin only**, performs an
**UPDATE** that sets `revoked_at`/`revoked_by` (never a DELETE), and writes an
`audit_logs` row (`action='conversation_participant_revoked'`, §3.4). The
creator's own grant is not revocable through this path.

### F3 — Over-broad own-row UPDATE

`0021` granted `UPDATE` on the whole `conversation_participants` row to
`authenticated`; the own-row UPDATE policy was only ever meant for
`last_read_at`. Once `revoked_at` exists, a revoked user could `UPDATE` their
own row to clear it (self-un-revocation). **Fix:** column-level grant —
`REVOKE UPDATE … ; GRANT UPDATE (last_read_at) …`. Test 5 confirms a revoked
user's `revoked_at = null` UPDATE is rejected.

### F4 — `anon` (and `authenticated`) held the broad default grant

Observed on the table:

```
anon          : SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
authenticated : SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
```

Only RLS (keyed on `auth.uid()`, which is null for anon) stood between `anon`
and the data — the classic "RLS is on, so we're safe" trap. RLS did hold the
data closed (anon saw zero rows), but the privilege surface was wide and
`authenticated` held DELETE/UPDATE(all-cols) that no policy should satisfy.
**Fix (defense-in-depth + append-only §3.1 at the grant layer):**

- `anon` / `public`: **zero** privileges on all three tables.
- `authenticated`: exactly `SELECT, INSERT` on conversations + messages
  (append-only — no UPDATE, no DELETE) and `SELECT, INSERT, UPDATE(last_read_at)`
  on participants.

After the fix, `anon` SELECT returns a hard permission error (not just empty),
and `authenticated` shows only `INSERT, SELECT` on `conversations`.

---

## 3. What was fixed (and how it ships)

| Finding | Fix | Layer |
|---|---|---|
| F0 recursion | `is_conversation_participant()` → `SECURITY DEFINER` + pinned `search_path` | function |
| F1 no revocation field | `revoked_at` + `revoked_by` columns; helper filters `revoked_at IS NULL` | schema + function |
| F2 no revoke path | `revoke_conversation_participant()` RPC (SECURITY DEFINER, creator/admin, UPDATE, audit-logged) | RPC |
| F3 broad own-row UPDATE | `GRANT UPDATE (last_read_at)` only | grant |
| F4 broad anon/auth grants | revoke all from anon/public; authenticated → SELECT/INSERT (+ last_read_at) | grant |

All in `supabase/migrations/20260612170000_conversation_participant_revocation.sql`.

**Tier: RED.** It changes RLS-relevant semantics (the participant-check
function + the grant surface). Per the Auto-merge Safety Envelope it ships as a
**draft PR** with the **`needs-human-gate`** label and the exact SQL in the
description. **Prod apply is manual, via Supabase MCP `apply_migration` after DI
approval — never `db push`.** The migration is additive + reversible (explicit
ROLLBACK block); note that rolling back F0 reintroduces the recursion bug, and
dropping the revocation columns discards revocation history (which is evidence,
§3/§4.3).

The app code already uses the user-session client everywhere and the documented
write surface (SELECT/INSERT on all three, UPDATE(last_read_at) on participants,
plus the new SECURITY DEFINER RPC), so **no application code change is required**
for the grant narrowing — verified against `lib/communication/actions.ts`,
`direct-conversation.ts`, and the two communication pages.

---

## 4. Service-role surface (brief item 5) — full inventory

The service-role client (`lib/supabase/admin.ts`, `createAdminClient()`,
`server-only`) **BYPASSES RLS**. Every usage in the repo:

| File | Kind | Touches chat tables? | Verdict |
|---|---|---|---|
| `lib/supabase/admin.ts` | helper definition | — | the only factory; `server-only` |
| `app/api/leads/route.ts` | **runtime** | **No** — writes `leads` only (anon funnel, §17.2) | ✅ legitimate; RLS-less by design for anonymous capture |
| `lib/billing/subscription-store.ts` | **runtime** | **No** — billing tables only (Stripe TEST webhook; no user session exists) | ✅ legitimate; billing tables carry no authenticated write policy by design |
| `lib/admin/billing-actions.ts` | **runtime** | **No** — billing tables only (admin manual pilot override, `isSuperadmin`-gated) | ✅ legitimate; same billing-table design |
| `lib/admin/company-need-intakes.ts` | **runtime** | **No** — reads/updates `company_need_public_intakes` only (Public Intake Owner Queue v1, `isSuperadmin`-gated) | ✅ legitimate; the table has no anon/authenticated RLS policy by design (PR #678: write-only via anon RPC, read-only via service role); status update only, writes nothing outbound |
| `lib/sales/lead-intake.ts` | **runtime** | **No** — READ-ONLY `waitlist` SELECT (§8.14 intake panel, `isSuperadmin`-gated) | ✅ legitimate; `waitlist` has no authenticated read policy by design (0005: anon INSERT only, reads service-role only); writes nothing |
| `lib/env.ts` | env plumbing (`requireSupabaseServiceEnv`) | No | ✅ |
| `scripts/admin-promote.ts` | CLI (interactive) | No (`profiles`) | ✅ operator tool |
| `scripts/admin-grant-superadmin.ts` | CLI (dry-run + double flag) | No (`profiles`/`profile_roles`) | ✅ operator tool |
| `scripts/generate-pilot-owner-brief.ts` | CLI report | No | ✅ |
| `scripts/e2e-*.ts`, `tests/e2e/*` | test harness (local only) | seeds only | ✅ never prod |

**The audited runtime `createAdminClient()` callers are exactly the five
rows above — `app/api/leads/route.ts` (writes `leads` only), the two
billing paths (billing tables only), the superadmin-gated read-only
`waitlist` intake read, and the superadmin-gated
`company_need_public_intakes` owner queue — never a conversation table.** No
user-facing chat read or write uses the service role. This inventory is pinned
in CI: `chat-visibility-rls.test.ts` fails if a new runtime `createAdminClient()`
caller appears or if any chat path imports the admin client, forcing this doc to
be updated and the new bypass justified.

---

## 5. Prod migration required?

**Yes — one RED migration**, applied manually after review:

- `20260612170000_conversation_participant_revocation.sql` — via Supabase MCP
  `apply_migration` after DI approves the draft PR. (Verified to apply cleanly
  on the local stack; all 7 hostile tests pass against the result.)

Also queued from the RU-locale PR (separate, GREEN): the additive
`original_language` CHECK widening (`20260612130000`) — independent of this
audit.

---

## 6. Permanent CI protection (doctrine-guard §7)

- `apps/web/tests/e2e/chat-visibility-rls.spec.ts` — the 7 hostile negative
  tests; the behavioural proof (local stack).
- `apps/web/lib/guards/chat-visibility-rls.test.ts` — 19 static assertions that
  pin F0–F4 fixes, append-only, the no-service-role-bypass inventory, and the
  existence/serial-wiring of the e2e. Runs in plain CI (`pnpm -F web test`),
  with no database, so the negative-visibility guarantees survive every future
  refactor.

---

## 7. Service-role caller inventory — additions after the audit

- **2026-07-11 — `lib/admin/launch-readiness.ts`** (launch repair Scope E,
  operator launch-readiness view). READ-ONLY aggregate head-counts over
  `workers`, `profiles`, `companies`, `company_need_public_intakes`,
  `customer_requests`, `organizations`. The intake table deliberately has no
  anon/authenticated read policy (PR #678), so the service role is the only
  read path. Every entry point re-checks `isSuperadmin()` first; the module
  touches no chat table, writes nothing, and sends nothing outbound. Pinned in
  the `chat-visibility-rls.test.ts` caller inventory.

- **2026-07-13 — `lib/company/claim-public-intake.ts`** (canonical-journey P3
  claim bridge). Reads `company_need_public_intakes` rows ONLY where the
  caller's AUTHENTICATED email (`auth.users.email`) equals the intake's
  `contact_email`, re-checked on the specific claimed row; updates ONLY that
  row's `status` to `converted` AFTER the owner-scoped `save_demand_draft`
  RPC (caller session, RLS) created the draft. The intake table has no
  anon/authenticated policy by design, so service role is the only read
  path; the caller sees only data they themselves typed into the public
  form. No chat table, nothing outbound.

- **2026-07-13 — `lib/opportunities/contact-employer.ts`** (canonical-journey
  P1 worker→employer conversation open). After the caller's OWN facts held
  under their RLS session (own worker row + own active `demand_interest_signals`
  row), ONE service-role read resolves the demand owner and the
  verified-company gate (`customer_requests` / `companies` are owner-scoped
  by design, so a worker cannot read them directly — this is the app-side
  equivalent of a SECURITY DEFINER RPC). The owner's profile id never
  reaches the browser; the conversation opens through the gated 0021
  backend (`getOrCreateDirectConversation`, rate caps + §8.1
  `allowed_demand_interest` grant) under the CALLER's session, never
  service-role. No chat table is touched with the admin client.

- **2026-07-14 — `lib/ai/runtime/audit-store.ts`** (AI Router v1 append-only
  run audit). Best-effort INSERT of one `ai_runs` row per LIVE internal AI
  run plus a head-only COUNT for the daily-run budget guard. `ai_runs` by
  design carries NO anon/authenticated write path (admin-only SELECT,
  append-only — UPDATE/DELETE revoked for every role; gated draft
  `20260714150000_ai_runs_audit_v1.sql`), so the service role is the only
  write path — the same pattern as the billing-webhook writes. The row
  carries routing facts, field NAMES (`data_categories_sent`) and a bounded
  excerpt of the schema-VALIDATED output — never input content, never a
  chat table, nothing outbound. Failures are logged and swallowed; the run
  outcome is unaffected. Pinned in the `chat-visibility-rls.test.ts` caller
  inventory.
