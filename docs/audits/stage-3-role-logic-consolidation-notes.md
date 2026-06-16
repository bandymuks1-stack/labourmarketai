# Stage 3 — Role / Company-Type Logic Consolidation Notes (2026-06-16)

**Documentation only. No role/company-type model was refactored in this PR.**
This records a known risk surfaced by the Stage 3 audit so a future, dedicated PR
can address it deliberately — it is intentionally NOT a refactor.

## Where the inline role/company-type problem is visible

Role and company-type decisions are made by ad-hoc inline checks spread across
~40 source files (the Stage 3 audit counted 41; a current scan finds ~37 non-test
files with `role === "…"` / `activeRole` / `companyType` branching or role-gating
helpers). Representative sites:

- `lib/dashboard/next-action.ts` — branches the primary next-action on role.
- `app/[locale]/dashboard/page.tsx` and `app/[locale]/dashboard/account/page.tsx`
  — inline role checks decide which cards/sections render.
- `components/app/account-menu.tsx`, `components/app/dashboard-chain-actions.tsx`
  — menu/links gated by inline role equality.
- `lib/auth/require-role.ts` (`requireRoleOrRedirect`) — the one shared gate, used
  by some routes but bypassed by others that re-derive role inline.

The same conceptual question ("what may this role do here?") is answered in many
places, each with its own literal comparison against `"worker" | "company" |
"agency" | "customer"` (plus the separate `companyType`/`company_type` activity
dimension).

## Why ~41 inline role/company-type checks are risky

- **Drift / inconsistency.** Each site can disagree about what a role may do. A
  permission tightened in one file is easily missed in the other ~40, so the UI
  and the server can diverge (a button shown that the action then refuses).
- **No single source of truth.** Adding or renaming a role (or reframing
  `company_type` as an activity, per the unified-identity direction) means editing
  dozens of files; one missed site is a silent bug or a confusing dead/forbidden
  action.
- **Identity-model regressions.** The product's direction is a UNIFIED identity
  (worker/company/agency/customer are roles/actions on one account, not separate
  apps, and agency/buyer are not standalone base identities). Inline checks make
  it easy to accidentally re-introduce "separate systems" framing.
- **Admin/workspace coupling.** Admin is a separate signal from workspace role
  (`deriveIsAdmin`), but inline checks can conflate them and strip/grant UI by the
  wrong dimension.
- **Untestable as a whole.** Because the policy is scattered, there is no one unit
  to test; guards must assert behaviour file-by-file.

## What shared policy layer is needed (future PR)

A single, typed role/capability policy module, e.g. `lib/auth/role-policy.ts`:

- One source of truth mapping `(role, companyType?) → capabilities` (can-post-need,
  can-scout, can-receive-request, sees-which-nav, …) as data, not scattered `if`s.
- Small helpers: `can(role, capability)`, `visibleNavFor(role)`, that both the UI
  and the server actions consult — so the button and the action can never disagree.
- `company_type` modelled explicitly as an ACTIVITY dimension layered on the
  company role, not a parallel identity.
- A guard asserting that role decisions go through the policy module (no new inline
  `role === "…"` gates in product code).

This is a deliberate, test-backed refactor touching ~40 files and must be its own
PR with its own review — not folded into an operation-bug or honesty-cleanup PR.

## What was intentionally NOT done in this PR

- No change to the role/company-type model, no consolidation of the inline checks,
  no new policy module — to avoid a large, risky refactor riding on a small
  honesty/cleanup change.
- No change to `requireRoleOrRedirect` or `deriveIsAdmin` behaviour.
- No migration, no RLS change. This note is the only artifact; the refactor is a
  future PR.

## Companion: Stage 3 "verified" wording review (no change needed)

The five `verified/verification` locations the audit flagged were reviewed against
the wording rules (no `verified` for self-declared; use claim/evidence/signal when
unconfirmed; keep a real verification enum and document why):

1. `components/app/project-operations-board.tsx:32` — "never auto-approved or
   **auto-verified**": honest, describes what the board does NOT do. **Unchanged.**
2. `components/app/worker-evidence-card.tsx:11` — "Manager-confirmed →
   `worker_skills.verified = true` (the keystone `confirm_entry_and_verify_skills`
   RPC; a real human confirmation source)": `verified` is a REAL DB enum backed by
   a real manager confirmation — rule 3 says keep a genuine verification model.
   **Unchanged (documented).**
3. `lib/structuring/keywords.ts:120` — "no **auto-verified** skill": honest
   negation (no fake taxonomy). **Unchanged.**
4. `lib/structuring/sectors.ts:13` — "no fake taxonomy, no **auto-verified**
   skill": honest negation. **Unchanged.**
5. `lib/taxonomy/work-categories.ts:11` — "no **auto-verified** skills (§7)":
   honest negation. **Unchanged.**

None of the five make a misleading verification CLAIM — each either negates fake
verification or names a real, human-backed enum. Changing them would make honest
copy worse, so they are left as-is per the wording rules.
