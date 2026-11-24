# Decision — next ops implementation after migration 0030

**Date:** 2026-05-29 · **Cycle:** 12-step super cycle, Step 11.

## Decision

**No further ops *code* PR is shipped this cycle.** The next real
implementation step is **blocked** on two owner/migration-gated
preconditions, so building more now would mean either a no-op disabled
skeleton (surface with no function — the plan explicitly forbids
half-built features) or fake controls (forbidden). The honest move is to
stop at the clarity + helper + guard work already merged and record the
exact next action.

## Why no safe code PR remains right now

What this cycle already shipped safely (no DB write, no fake controls):

- product truth map + migration runbook + role-assignment contract +
  review-chain audit (docs);
- pre-migration plain-language setup note (Step 4);
- review-readiness pure helper (Step 7);
- one next action per worker relationship (Step 8);
- review-status visual rail (Step 9);
- truth guards v1 + v2 (Step 10).

The only remaining ops features are **writes**: assigning `operations_role`
and enabling `journal_review_enabled` per relationship. Both require:

1. **Migration 0030 applied to prod** (owner-gated — see
   `docs/runbooks/apply-migration-0030-ops-bridge.md`). Until applied, the
   columns do not exist on prod and the app correctly shows "not assigned /
   review not enabled" via the 42703 fallback.
2. **A real, owner/admin-scoped SECURITY DEFINER RPC** with ownership
   re-validation + an audit trail (see
   `docs/contracts/operations-role-assignment-v1.md`). No such RPC exists,
   and writing one is a DB-permission change beyond this cycle's safe scope.

A "disabled UI skeleton" was considered and rejected: it would render a
control that does nothing, risks reading as a fake feature, and adds surface
that must be reworked once the real RPC exists. The setup note + next-action
text already communicate the not-enabled state honestly.

## Exact next action (after the owner applies migration 0030)

1. Owner applies `0030` (additive; runbook included) and verifies columns.
2. New PR: `feat/ops-role-assign-rpc-v1` — a SECURITY DEFINER RPC
   `assign_company_worker_role` / `assign_agency_worker_role` (owner/admin
   only, ownership re-validated, audit-logged) + a server action; conservative
   role set only.
3. New PR: owner-only role-select + review toggle UI on the worker rows,
   wired to that action; foreman/PM review still gated by the capability map +
   the employment↔journal engagement link (separate decision).
4. Later: an RPC that provisions a journal `engagement_context` from an
   enabled employment relationship — the real employment↔journal join.

Nothing above may ship until step 1 (owner applies the migration) is done.
