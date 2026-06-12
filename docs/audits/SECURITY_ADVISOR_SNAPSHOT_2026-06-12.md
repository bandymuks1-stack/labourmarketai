# Security / Advisor Snapshot — 2026-06-12 (post chat-visibility hardening)

> **Type:** READ-ONLY audit + handoff. No DB mutation, no migration applied, no
> RLS/policy/grant change, no merge/deploy was performed to produce this.
> **Repo HEAD:** `0ff5c59` (main) — after PR #321 (ru locale), #323
> (conditional prod-apply autonomy + fail-closed classifier), #322 (chat
> visibility hardening).
> **Source of truth:** Supabase advisors (security + performance) for project
> `gorgitwvdzxbnaxhrsrw`, pulled live 2026-06-12, cross-checked with read-only
> `pg_catalog` / `information_schema` queries.

---

## 1. Live snapshot (raw advisor counts)

**Security advisors — 87 findings, all `WARN` (no ERROR/RED from the advisor):**

| Finding | Level | Count | Affected |
|---|---|---|---|
| `authenticated_security_definer_function_executable` | WARN | 65 | SECURITY DEFINER functions signed-in users can execute |
| `anon_security_definer_function_executable` | WARN | 15 | SECURITY DEFINER functions the anon role can execute |
| `function_search_path_mutable` | WARN | 4 | `set_updated_at`, `pilot_drafts_set_updated_at`, `profile_skill_claims_set_updated_at`, `create_journal_entry_full` |
| `rls_policy_always_true` | WARN | 1 | `waitlist` |
| `auth_otp_long_expiry` | WARN | 1 | Auth (dashboard config) |
| `auth_leaked_password_protection` | WARN | 1 | Auth (dashboard config) |

**Performance advisors — 295 findings (all WARN/INFO, no security weight):**

| Finding | Level | Count | Affected |
|---|---|---|---|
| `multiple_permissive_policies` | WARN | 147 | 34 tables (overlapping permissive policies) |
| `auth_rls_initplan` | WARN | 71 | 34 tables — `auth.uid()` re-evaluated per row (incl. the 3 chat tables) |
| `unindexed_foreign_keys` | INFO | 49 | 37 tables |
| `unused_index` | INFO | 28 | 21 tables |

---

## 2. What PR #322 actually changed — verified live, read-only

PR #322's fixes were found by the **hostile chat-visibility audit**, not by the
Supabase advisor. Each claim was re-verified on prod:

| #322 claim | Live verification (read-only) | Status |
|---|---|---|
| anon grants removed on the 3 chat tables | `role_table_grants`: anon/public have **zero** privileges; authenticated has only `INSERT,SELECT` | ✅ confirmed |
| append-only locked at the grant layer | `conversation_participants` table-level UPDATE revoked (only `last_read_at` column grant remains); no DELETE grant | ✅ confirmed |
| append-only at the policy layer | policy commands: conversations = `insert,select`; messages = `insert,select`; participants = `insert,select,update(last_read_at)`; **no delete policy anywhere** | ✅ confirmed |
| F0 RLS recursion fixed | `is_conversation_participant` is `prosecdef=true` (SECURITY DEFINER) + `search_path=public` pinned | ✅ confirmed |
| 7/7 hostile negative tests green | `tests/e2e/chat-visibility-rls.spec.ts` + static guard `lib/guards/chat-visibility-rls.test.ts` in ledger on main | ✅ confirmed |
| migration ledger sync-only on main | `supabase/migrations/20260612170000_*.sql` + `supabase/rollbacks/20260612170000_*.down.sql` present on main | ✅ confirmed |

### Honest distinction — #322 vs. the Supabase advisor named lints

**#322 did NOT reduce any *named Supabase advisor* finding.** The issues it
closed (recursion, anon table-grants, append-only at the grant layer,
revocation) are **not** entries in the advisor catalog — they were
hostile-audit findings. Against the advisor specifically, #322 was **net
slightly additive**: flipping `is_conversation_participant` to SECURITY DEFINER
and adding `revoke_conversation_participant` added **2** entries to the
`authenticated_security_definer_function_executable` list (count 65). Both new
functions are EXECUTE-granted to `authenticated` only — **not** anon/public
(verified) — so they did **not** enlarge the more sensitive 15-entry
`anon_security_definer_function_executable` list. **No regression.**

So: the colloquial "#322 closed some WARNs" is true for the *audit* surface
(default-closed visibility is now real and proven); it is **not** true for the
*advisor* surface, which is an orthogonal, still-open set of pre-existing items.

---

## 3. Findings table — severity, reality post-#322, phase, gate

| Finding | Sev | Affected object | Still real post-#322? | Phase | RED / owner gate? | Safe PR w/o prod apply? |
|---|---|---|---|---|---|---|
| `anon_security_definer_function_executable` (15) | WARN (highest real security weight) | 15 DEFINER fns anon can execute (`is_admin`, `owns_*`, `manages_organization`, `can_access_match`, `ensure_*`, `mirror_*`, `handle_new_user`, `profile_role`, …) | **Yes** — untouched by #322 | **C** | **RED** — `REVOKE EXECUTE` is a privilege change + must not break the signup trigger path | PR yes; prod apply = owner gate |
| `function_search_path_mutable` (4) | WARN (low — all 4 are SECURITY **INVOKER**, verified, so no privilege-escalation vector) | `set_updated_at`, `pilot_drafts_set_updated_at`, `profile_skill_claims_set_updated_at`, `create_journal_entry_full` | **Yes** — untouched by #322 | **A** | No — behavior-preserving `ALTER FUNCTION … SET search_path=public`; no RLS/grant/policy change | **Yes** — GREEN; apply eligible under conditional autonomy or owner |
| `rls_policy_always_true` (1) | WARN | `waitlist` policy | **Yes** — out of #322 scope | **C** | **RED** — RLS policy change; needs intent check (anon waitlist insert vs. read leak) | PR yes; prod apply = owner gate |
| `authenticated_security_definer_function_executable` (65) | WARN (largely by-design) | 65 DEFINER RPC helpers | **Yes**, +2 from #322 (by design) | **C/none** | Mostly accepted-by-design; per-fn review only if a specific fn shouldn't be authenticated-callable | Analysis PR; no schema |
| `auth_otp_long_expiry` (1) | WARN | Auth config | **Yes** | **E** | Owner **dashboard** action (not a migration/PR) | n/a — Supabase dashboard |
| `auth_leaked_password_protection` (1) | WARN | Auth config | **Yes** | **E** | Owner **dashboard** action (not a migration/PR) | n/a — Supabase dashboard |
| `unindexed_foreign_keys` (49) | INFO (perf) | 37 tables incl. chat FKs | **Yes** | **B** | No — additive `CREATE INDEX` | **Yes** — GREEN |
| `auth_rls_initplan` (71) | WARN (perf) | 34 tables incl. chat | **Yes** | **D** | **RED** — rewriting policy predicates (`(select auth.uid())`) = policy change | PR yes; prod apply = owner gate |
| `multiple_permissive_policies` (147) | WARN (perf) | 34 tables | **Yes** | **D** | **RED** — policy consolidation = policy change | PR yes; prod apply = owner gate |
| `unused_index` (28) | INFO (perf) | 21 tables | **Yes** | **E** | Care — `DROP INDEX` is destructive-ish; low priority | PR yes; owner review |

---

## 4. Recommended A–E phase order (after this snapshot)

Phases are ordered by **risk-adjusted value** — safest/highest-confidence
first, RLS-touching/owner-gated last. **One narrow PR per phase**, never the
whole sweep at once (doctrine §10 / merge model).

- **Phase A — pin `search_path` on the 4 mutable functions.** GREEN, additive,
  behavior-preserving, no RLS/grant/policy change. Clears 4 named advisor
  WARNs. *(Recommended first slice — see §5.)*
- **Phase B — add indexes for unindexed foreign keys.** GREEN, additive
  `CREATE INDEX`. Real read/JOIN perf, zero security surface. Largest of the
  GREEN set (49) — can itself be split per subsystem.
- **Phase C — anon SECURITY DEFINER execute lockdown + `waitlist` policy.**
  RED, owner-gated. Per-function analysis: revoke `EXECUTE … FROM anon` on the
  DEFINER functions that are never needed pre-auth, while proving the signup
  trigger path (`handle_new_user`, `ensure_worker_profile`, …) keeps working.
  Highest *real* security value remaining.
- **Phase D — RLS performance rewrites.** RED, owner-gated. `auth_rls_initplan`
  (`auth.uid()` → `(select auth.uid())`) + `multiple_permissive_policies`
  consolidation. Big diff, policy changes — split per table group.
- **Phase E — Auth dashboard config + index cleanup.** Owner dashboard actions
  (OTP expiry, leaked-password protection — no PR) + `unused_index` review
  (low priority, needs care).

---

## 5. First proposed PR slice (single, narrow)

**Phase A: pin `search_path = public` on the 4 `function_search_path_mutable`
functions.**

- Scope: one migration `ALTER FUNCTION … SET search_path = public` for
  `set_updated_at`, `pilot_drafts_set_updated_at`,
  `profile_skill_claims_set_updated_at`, `create_journal_entry_full`, plus its
  paired `supabase/rollbacks/<name>.down.sql` (reset the search_path).
- Tier: **GREEN** — no `CREATE … SECURITY DEFINER`, no GRANT/REVOKE, no
  policy/RLS change; passes the upgraded `migration-safety` classifier.
- Owner RED gate: **not required.** (All 4 are SECURITY INVOKER, verified —
  this is hygiene, not a privilege-escalation fix, so it is low-risk.)
- Prod apply: eligible under the conditional prod-apply autonomy rule
  (GREEN + additive + tested rollback + post-apply MCP verification), or by the
  owner — caller's choice. **Not applied as part of this snapshot.**
- Dual baseline bump (product-readiness SPRINT_BASELINE + ops-bridge count)
  required for the new migration.

Rationale for choosing A first: smallest blast radius, on-theme (security),
GREEN, clears named advisor WARNs, and establishes the rhythm before the
RED-gated C/D work.

---

## 6. Not done in this snapshot (explicit)

- No migration authored or applied; **no production DB change.**
- No DROP/DELETE/TRUNCATE, no RLS/policy/grant change.
- No merge or deploy.
- Phases B–E are described, not implemented.
- The 65 `authenticated_security_definer` entries were not individually
  triaged (most are by-design RPC helpers); a per-function review is a
  Phase-C sub-task only if a specific function should not be authenticated-
  callable.
