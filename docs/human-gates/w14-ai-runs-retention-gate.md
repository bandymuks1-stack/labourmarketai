# HUMAN GATE — W14 item 6, ai_runs retention (REDACT-NOT-DELETE)

Migration: `supabase/migrations/20260808130000_ai_runs_retention_redaction_v1.sql`
Rollback:  `supabase/rollbacks/20260808130000_ai_runs_retention_redaction_v1.down.sql`
PR: #1091

State: `AI_RUNS_RETENTION_APPROVED_APPLY_IN_PROGRESS`

## OWNER DECISION — GIVEN 2026-08-08

> 90-day REDACT-NOT-DELETE direction is APPROVED.
>
> After the retention threshold: `output_excerpt` may be irreversibly redacted
> through the narrowly constrained retention mechanism. Do not delete the audit
> row. Preserve structured audit identity, token/cost evidence and other fields
> not explicitly approved for redaction.
>
> Long-term aggregated AI cost history is allowed provided it contains no
> unnecessary free-form AI content or unnecessary personal data.

This closes the retention condition that rode with the 2026-08-03 approval of
`20260714150000_ai_runs_audit_v1` (see `docs/APPLIED_LEDGER.md`: *"a 90-day
retention policy … is a REQUIRED BLOCK before that activation"*).

The same command was explicit that product approval is **not** technical
approval. The verification below was re-run **after** rebasing onto post-#1089
main, not carried over.

## Checksums the approval binds to

- migration sha256 `2303015a7e09db37606e5ec3076d746cc0306bd9b4e48d9266a5e73a82ed657f`
- rollback sha256 `b866569ebcd18054e2b0774481f087a90732696ffaec17da110bb652ff1501ff`
- comment-stripped **executable** sha256
  `f4d4ec8c22eb123cc5d227496a754161a0b3ebd802d52d355fa60f7e2d0b6f33`
  (recompute: `grep -v "^\s*--" supabase/migrations/20260808130000_ai_runs_retention_redaction_v1.sql | sha256sum`)

The SQL is **byte-identical** to the pre-rebase draft — the rebase touched only
the three ratchet guards.

## Migration ratchet collision — RESOLVED BY RECOUNT

#1089 and #1091 both claimed **190 → 191** and could not both land unchanged.
No dependency existed between them, so #1089 landed first on the lower
migration timestamp (`…120000` < `…130000`), keeping filename order and apply
order identical.

The second value was then **re-derived, not incremented blindly**:
`git ls-tree -r origin/main supabase/migrations/` on post-#1089 main returns
**191** `.sql` files, and this branch adds exactly one → **192**. All three
ratchet pins (`market-map-read-layer-v1`, `product-readiness`,
`booking-engagement-end-v1` allowlist) carry that recount in their comments.

## What the migration does

- `public.ai_runs_retention_days()` — an immutable `select 90`, so the approved
  horizon is readable in the database and not only in a document.
- `public.redact_expired_ai_run_content(integer default null)` — SECURITY
  DEFINER, pinned `search_path`. Sets `output_excerpt = null` on rows
  `created_at < now() - make_interval(days => v_days)` **and only there**;
  returns the row count. Raises `22023` if a caller passes a horizon **shorter**
  than 90; lengthening is allowed.
- EXECUTE revoked from `public`, `anon`, `authenticated`; granted to
  `service_role` alone.
- **No** `UPDATE` or `DELETE` grant on `ai_runs` is added for any role.

## Why a definer function rather than a grant

Granting `UPDATE (output_excerpt)` to `service_role` would hand every ordinary
application path a mutation capability over historical audit rows for the sake
of one scheduled job. The capability instead lives in one function that can
express the whole rule — one column, one predicate, one threshold.

## EXACT BOUNDARY SEMANTICS (measured, not assumed)

The predicate is `created_at < now() - make_interval(days => 90)`, evaluated
against the **running transaction's** clock. So:

- age **< 90 days** → preserved (the 89-day fixture proves the edge);
- age **≥ 90 days** at execution time → eligible, `output_excerpt` nulled.

A row seeded at exactly 90 days is therefore redacted, because by the time the
sweep evaluates the predicate its age exceeds 90 days by the elapsed
milliseconds. That matches the owner contract *">= 90-day eligible row →
redacted"*. Recorded here explicitly because a reader could otherwise assume
the strict `<` preserves the 90-day row.

## Proof on record — 39 passed, 0 failed

`scripts/db-proof/w14-ai-runs-retention.sh` (+ `.prelude.sql`, `.seed.sql`) runs
the migration **and** the rollback verbatim against a throwaway `postgres:15`
container — never the shared local stack, never production. The prelude is the
real `20260714150000` append-only posture, including
`revoke update, delete … from service_role`. Every probe runs under a real role.

**§5 security contract**

- ordinary `service_role`: `UPDATE` on `ai_runs` **REFUSED**, before and after;
- ordinary `service_role`: `DELETE` on `ai_runs` **REFUSED**, before and after;
- the non-owner grant matrix is **unchanged**:
  `authenticated:SELECT | service_role:INSERT | service_role:SELECT`;
- `anon` holds **nothing** on `ai_runs`;
- `authenticated` invoking the retention capability → **REFUSED**;
- `anon` invoking it → **REFUSED**;
- `service_role` holds EXECUTE; `authenticated` and `anon` do not;
- the function is SECURITY DEFINER with `search_path=public` pinned.

(The table **owner** `postgres` retains UPDATE/DELETE implicitly. That is not a
grant this migration made, it cannot be revoked away, and it is precisely what
lets a definer function work at all. The assertion is therefore scoped to
non-owner roles — an earlier version of the harness got this wrong and was
corrected rather than explained away.)

**§6 retention boundary**

- 10-day row → preserved; 89-day row → preserved;
- 90-day and 91-day rows → `output_excerpt` NULL;
- on every redacted row the audit fingerprint
  (`task_type/provider/model_alias/input_tokens/output_tokens/actual_cost_usd/estimated_cost_usd/route_reason`)
  is **byte-identical** to its pre-sweep value — token and cost evidence
  survives, which is owner decision D2;
- **no row deleted** (5 before, 5 after);
- re-run redacts **0** more (idempotent), row count unchanged;
- horizon 30 → **REFUSED**; 89 → **REFUSED**; 90 → accepted; 365 → allowed and
  redacts nothing new; after every refusal the 89-day content survives;
- the function body assigns exactly one column and contains no `delete`;
- `ai_runs_retention_days()` reads **90**.

**Scheduler-shaped paths**

- a second sweep over an already-swept table returns `0`, not an error;
- an empty table returns `0` rows redacted — success, not failure.

**Rollback / re-apply**: rollback removes the capability and leaves `ai_runs`
append-only; re-apply restores it with no non-owner UPDATE/DELETE grant.

## Production context (read-only preflight)

`public.ai_runs` holds **0 rows** — `AI_PROVIDER_MODE` is `disabled` and both
write paths are gated on `cfg.state === "live"`. Applying this therefore grants
a capability and performs no mutation. There is nothing to redact today.

## THE APPLY QUESTION

> Approve applying `20260808130000_ai_runs_retention_redaction_v1`
> (executable sha256 `f4d4ec8c22eb123cc5d227496a754161a0b3ebd802d52d355fa60f7e2d0b6f33`)
> to production `gorgitwvdzxbnaxhrsrw` via Supabase MCP `apply_migration`?

**ANSWERED YES** by the owner decision above.

## What this gate does NOT approve

- No scheduler. A caller is wired only **after** the function exists in the
  deployed database, and is a separate reviewable change.
- No broadening of redaction beyond `output_excerpt`. `profile_id` is
  structured, not free-form, and removing it is a decision nobody has taken.
- No AI provider activation.
