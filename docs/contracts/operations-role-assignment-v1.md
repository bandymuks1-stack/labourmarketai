# Operations Role Assignment — Contract v1 (design, no write UI yet)

**Status:** design contract only. **No write UI and no server write action
exist or are created by this doc.** Builds on migration `0030` (additive,
owner-gated, currently unapplied) and the
`employment-journal-context` helper.

## Allowed operations roles

Exactly the conservative set the migration `0030` CHECK allows and the
`role-capabilities` map knows:

`worker` · `foreman` · `project_manager` · `company_admin` · `agency_admin`

`foreman` / `project_manager` are **storable labels** but remain
`not_enabled` capabilities — see "label ≠ permission" below.

## Who may assign (future)

- Assignment is a **company/agency owner OR admin** action, scoped to a
  relationship they own (`owns_company` / `owns_agency` / `is_admin`), i.e.
  the same gate as the existing `company_workers` / `agency_workers` write
  policy. No worker can self-assign an operations role.
- Writes must go through a **SECURITY DEFINER RPC** (mirroring
  `invite_company_worker`) that re-validates ownership — never a direct
  client `update`.

## Preconditions before a write UI may ship

1. Migration `0030` applied to production (see the apply runbook).
2. A real, owner-scoped server action + RPC with ownership re-validation.
3. An audit trail (see below).
4. Guards proving the UI cannot set review enabled from a label alone.
5. LT + EN copy with no fake-capability wording.

## Audit / log requirement

Every assignment / review-enable change must be auditable: either an
append-only `audit_logs` row (the table exists, migration 0001) or an
`updated_at` + actor column on the relationship, decided when the RPC is
designed. No silent mutation.

## Label ≠ permission (why foreman/PM review cannot come from a label)

Storing `operations_role = 'foreman'` records an org's intent, nothing more.
Review capability is granted ONLY when **both**:

- the mapped role is an **enabled reviewer role** (today: `company_admin` /
  `agency_admin`), AND
- `journal_review_enabled = true` for that relationship.

`computeEmploymentJournalContext` enforces exactly this, so a `foreman` /
`project_manager` label can never yield `can_review`. Enabling foreman/PM
review is a **separate future decision** requiring real permission wiring +
journal-org linkage, not a text label.

## What must be true before `journal_review_enabled = true`

- The relationship's worker has a journal **engagement_context** in an
  organization the reviewer manages (the bridge between `company_workers`
  and the journal org model is still missing — see the truth map), OR
- a deliberate owner decision + RPC that records the reviewer↔worker review
  scope. Until that exists, `journal_review_enabled` stays `false`.

## Future minimal UI shape (not built here)

- A per-relationship row gains an **owner-only** control: a role select
  (the 5 allowed values) + a review toggle.
- Both are **disabled / "not enabled"** until the preconditions above hold;
  the skeleton must visibly say so, never present an active-looking control
  that does nothing.
- One next action per row, no destructive controls.

## Acceptance

Clear path to safe future assignment; no fake assignment button shipped;
foreman/PM review explicitly gated behind real permission, not a label.
