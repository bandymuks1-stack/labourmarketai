# AUDIT LOOP — remaining 47 anon-reachable `SECURITY DEFINER` functions

**Date opened:** 2026-07-22
**Status:** OPEN. Read-only audit. **No migration, no REVOKE, no code change in this loop.**
**Follows:** PR #845, which fixed 7 of 54. **The problem is NOT solved.**

> **Do not state or imply that the `SECURITY DEFINER` exposure is resolved.** PR #845 fixed
> the seven exploitable functions. **47 remain reachable by `anon`**, of which only 4 are
> intentionally public.

---

## 1. Scope

| Class | Count | Priority in this loop |
|---|---|---|
| **B — no authorization logic at all** | 3 | **FIRST — treat as P0 candidates** |
| C — blocked by an `if not exists(...)` body check | 19 | second |
| D — predicate helpers (boolean, used in RLS) | 12 | third |
| E — trigger functions (`returns trigger`) | 9 | third |
| F — intentionally public | 4 | classify and justify, do not change |
| **Total** | **47** | |

Baseline inventory: `docs/security/secdef-public-execute-inventory-v1.md`.

---

## 2. Class B first — and do not accept `NOT NULL` as a security control

The three functions with no authorization logic:

- `create_contract_v1(p_title text, p_value_cents bigint, p_proposal_id uuid, p_project_id uuid, p_customer_request_id uuid, p_number text, p_parties text, p_signed_document_ref text, p_start_date date, p_end_date date)`
- `create_proposal_v1(p_title text, p_amount_cents bigint, p_customer_request_id uuid, p_project_id uuid, p_number text, p_validity_until date, p_scope text, p_exclusions text)`
- `create_marketplace_listing_v1(p_listing_kind text, p_category text, p_title text, p_description text, p_location_country text, p_location_label text, p_price_text text, p_organization_id uuid, p_project_id uuid)`

Today an anonymous caller is stopped only because the insert sets `owner_id = auth.uid()`,
which is NULL, and the column is `NOT NULL` → SQLSTATE `23502`. **That is a constraint
error, not a refusal.** The required questions, each answered with evidence:

1. **Can `anon` supply a value that satisfies `NOT NULL`?** Read every function body in
   full. Does any code path let a *caller-supplied* parameter reach `owner_id`, directly or
   via `coalesce`, a trigger, a `DEFAULT`, or a nested call? If yes → **P0, stop and
   escalate immediately** with the same scope-change evidence protocol used for PR #845.
2. Does any **trigger** on `contracts` / `proposals` / `marketplace_listings` populate
   `owner_id` (e.g. a `BEFORE INSERT` default) that would rescue a NULL and let the insert
   succeed?
3. Is `owner_id` genuinely `NOT NULL` on all three **in production** — verified by catalog
   read, not by reading the migration file?
4. Would any planned change (a column default, making it nullable, a new insert shape)
   silently convert these into anonymous write paths? Record this as a standing hazard.
5. Do these functions leak anything **before** failing — e.g. a distinguishable error for
   an existing vs non-existent `p_project_id`, which is an existence oracle for an
   unauthenticated caller?

Answer 1–5 before any remediation is designed.

---

## 3. Classes C, D, E — verify the assumption, do not inherit it

Class C is currently believed to fail closed because `if not exists (...)` returns `false`,
never NULL. That was confirmed by probing **five** of the nineteen. **Probe the remaining
fourteen** using the same rolled-back `DO $$ … RAISE EXCEPTION $$` pattern, and for each
record the SQLSTATE and, where it writes, the row state before and after.

For classes D and E, confirm rather than assume: does any predicate helper leak existence
or identity information to an anonymous caller through its return value or error, and can
any trigger function be invoked usefully through PostgREST?

---

## 4. Class F — justify, do not merely list

For each of the 4 intentionally-public functions, record in writing: why it must be
anon-callable, what data it exposes, what it writes, and what abuse controls exist. Note
that `submit_company_need_public_v1` accepts unbounded anonymous PII and **no captcha or
honeypot exists anywhere in the repo** (LOOP 6 §23) — that belongs in this justification,
not hidden in a separate finding.

This list becomes the allowlist in §5. An entry with no written justification does not go
in it.

---

## 5. Deliverable — an allowlist guard, explicitly NOT a count

**Owner directive, 2026-07-22:** the standing guard must encode a **reviewed allowlist of
anon-callable RPCs**, keyed on the full identity signature. **It must not pin the number
4.** A count-based guard would stay green if a fifth dangerous function appeared in the
same change that removed a legitimate one — the total would still be 4 and the guard would
lie.

Requirements:

- **Set** comparison, not cardinality.
- Keyed on `proname || '(' || pg_get_function_identity_arguments(oid) || ')'`, so an
  overload cannot slip in under an allowlisted name.
- Fails in **both** directions: an unexpected addition, and the disappearance of an
  allowlisted entry.
- Every entry carries a one-line justification, so extending it is a deliberate act.
- Runs in CI against the migration corpus, and is re-checkable against production.

Reference implementation sketch: `secdef-public-execute-inventory-v1.md` §7 item 3.

---

## 6. Hard constraints

- **No mass `REVOKE` without per-function purpose analysis.** A blanket
  `REVOKE … ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC` would break anonymous demand
  intake and every public business page. This is stated as a rule, not a preference.
- This loop is **read-only**. Remediation lands in a later, separately-reviewed PR, split
  by class so each can be reasoned about and rolled back independently.
- If a genuinely exploitable path is found: **stop, do not fix it inline**, produce the
  evidence (rolled-back probe showing state change, not just an absent error), and propose
  an explicit scope change to the owner — the same protocol that produced PR #845.

---

## 7. Exit criteria

1. All 47 functions classified with **evidence per function**, not by inheritance from the
   class summary.
2. The five Class B questions in §2 answered with catalog and body evidence.
3. The remaining 14 Class C functions probed individually.
4. A justified allowlist produced.
5. The allowlist guard specified and ready to implement.
6. A remediation plan split by class, with the owner gates named.
