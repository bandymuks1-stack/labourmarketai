# Identity Resolution Contract v1

Status: PREPARED (pure contract + audit schema) + OWNER-GATED (migration)
Date: 2026-07-13
Programme: Labour Market OS — P7

## Principle

When talent arrives from many sources (see
multi-source-talent-provenance-contract-v1), the same real person can appear
twice. Resolving that is a **provider-neutral contract**: the rules below do
not depend on any vendor, matching service, or model — they are pure
TypeScript (`apps/web/lib/identity/identity-resolution.ts`) plus an
append-only Postgres audit ledger, and they would constrain any future
provider the same way.

## Detection rules

Duplicate DETECTION matches **only on strong deterministic identifiers**:

| Signal | Match kind |
|---|---|
| exact e-mail (case-insensitive, trimmed) | `email_exact` |
| exact normalized phone (separators stripped, `00` → `+`, ≥8 digits) | `phone_exact` |
| both | `strong_deterministic_id` |

Anything softer — same name, similar work history — may produce at most a
**weak hint** (`WeakHint`, `reason: "similar_name"`): a separate TypeScript
type that is structurally excluded from every merge path. `canAutoMerge`
does not accept it; no builder accepts it; it exists purely as context for a
human reviewer. Detection is deterministic and input-order independent
(unit-tested).

## Auto-merge rules — v1: a human confirms EVERYTHING

`AUTO_MERGE_ENABLED = false` is a **policy constant** in
`lib/identity/identity-resolution.ts`, pinned by the consent guard
(`lib/guards/external-profiles-consent.test.ts`). `canAutoMerge` therefore
returns `false` for every input in v1.

If a future owner decision flips the constant (new contract version
required), `canAutoMerge` STILL requires, at minimum:

1. `matchKind === "strong_deterministic_id"` (both email AND phone exact) —
   never a single identifier, never similarity;
2. a recorded legal basis.

Name similarity can never satisfy this — the weak-hint type cannot reach the
function.

## Audit — every decision is an append-only event

`identity_resolution_events` (DRAFT migration
`supabase/migrations/20260713210000_multi_source_talent_v1.sql`):

- kinds: `duplicate_detected`, `merge_confirmed`, `merge_rejected`,
  `unmerge`;
- `merge_confirmed` REQUIRES a human `decided_by` — enforced three times:
  the pure builder (`buildMergeConfirmedEvent` refuses without a decider AND
  a legal basis), the RPC (records the calling admin), and a table CHECK
  (`kind <> 'merge_confirmed' or decided_by is not null`);
- append-only: admin-only SELECT, no write policies, single admin-checked
  INSERT RPC (`record_identity_resolution_event_v1`), **no update/delete RPC
  exists**, and a trigger blocks UPDATE/DELETE for every role.

## Merge is an event, never a rewrite — sources are preserved

A confirmed merge:

1. writes one `merge_confirmed` audit event;
2. sets `talent_source_records.canonical_person_link` on the affected
   provenance rows to point at the canonical person.

**Nothing is deleted, overwritten, or reconstructed.** Original source rows,
profiles, and provenance survive untouched. That is exactly why **unmerge is
always possible**: it is one more audit event (`unmerge`,
`matched_on = human_decision`) plus clearing `canonical_person_link` — a
pointer change, not a data restoration. There is no delete path anywhere in
the migration.

## Privacy

- Duplicate-candidate SUMMARIES never carry contact data: the
  `DuplicateCandidate` type has **no email/phone field** — only profile ids,
  the match kind, and a masked hint (e.g. "same email (domain example.com)",
  "same phone number"). Guard-tested.
- A reviewing admin sees the match REASON, not the other profile's contact
  values, unless they open the admin-scoped profile view themselves (which
  is RLS-gated elsewhere and out of this contract's scope).
- The audit ledger stores ids + closed enums + bounded text — no contact
  data, no free-form personal dumps (`legal_basis` ≤300, `notes` ≤1000).

## v1 vs v2 honesty

| Capability | v1 (this PR) | v2 |
|---|---|---|
| Pure detection + policy + builders | SHIPPED, fully unit-tested | — |
| Audit table + RPC | DRAFT migration (owner gate) | owner applies |
| Server read/record wrappers | SHIPPED (`lib/identity/identity-resolution-service.ts`), degrade honestly | — |
| Admin duplicate-review UI | **does not exist — no fake UI anywhere** | separate slice feeding admin-readable candidates into the pure contract |
| Any auto-merge | **impossible** (`AUTO_MERGE_ENABLED = false`) | own contract version + owner decision |
| Cross-profile data movement on merge | **none** | pointer updates only (`canonical_person_link`), per this contract |
