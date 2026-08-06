# HUMAN GATE — Stripe TEST multi-subject v2 (supersedes PR #844)

State: `STRIPE_TEST_MULTI_SUBJECT_V2_CODE_COMPLETE_PENDING_HUMAN_GATE`

Migration `20260806220000_stripe_multi_subject_v2.sql` ships **RED and
UNAPPLIED** — no `@human-gate-approved` marker exists and none may be added
without a recorded owner apply decision.

## Why v2 supersedes #844

#844's schema was reviewed twice and is carried here UNCHANGED (columns,
partial uniques, origin snapshot trigger). Its ORGANIZATION AUTHORITY was
obsolete: it bound checkouts via `engagement_contexts` owner/manager rows
and an exactly-one-owned-org default. v2 rebuilds the authority on the
multi-org spine that landed after #844 branched:

| | #844 | v2 (this package) |
|---|---|---|
| Org authority | `engagement_contexts` owner/manager | `company_memberships` via the **`manage-billing` capability** (owner/admin ONLY) |
| Subject selection | supplied-or-defaulted org | the **validated durable active workspace** proposes; capability decides (`resolveBillingSubject`, #1030) |
| Entitlement subject | profile-only read | per-subject reads (org rows only / personal origin-null rows, #1030) |
| Default when ambiguous | exactly-one-owned-org guess | **fail closed** (`organization_required`) |

Reused still-valid pieces (per the owner directive §6): TEST customer
mapping (per-payer, idempotent), checkout session (strict schema, canonical
metadata on session AND subscription, deterministic idempotency key),
Customer Portal (body ignored — caller's own stored customer only), webhook
signature verification + replay/idempotency + invoice.paid/payment_failed,
live-key structural block, LMC separation guard (adapted to v2 truths).

## Invariants (each §7 line)

- One payer holds Personal + A + B with the SAME plan key — partial uniques.
- A cancellation cannot mutate B; re-subscribe collision is scoped to the
  billing subject — the store's conflict lookup and supersede-update are
  subject-scoped (42703-fallback while unapplied).
- Workspace proposes; `manage-billing` decides; the client can supply ONLY
  a plan key (`.strict()` schema — a price or org id is rejected).
- Webhook metadata binds and verifies the subject (`owner_id` +
  `organization_id` on session and `subscription_data`); a signature-verified
  org binding is NEVER discarded — pre-apply it returns `needs-migration`
  and the event stays unprocessed.
- The redirect never grants entitlement (webhook-only writers, guard-pinned).
- LMC fully separate (six flags pinned false; no billing module touches
  `lmc_*`).

## Findings a future owner approval would cover

`create-trigger` (origin capture — INVOKER rights, empty search_path),
`grant-or-revoke` (trigger-fn privilege closure), `alter-drop-policy`: none —
RLS untouched; constraint drop + index remodel are the reviewed uniqueness
change; no DML at apply time (table verified empty in prod: 0 rows).

## Not authorized by this package

Production apply, Stripe Live, real prices/charges, LMC activation,
applying #844's old migration (file intentionally NOT in the tree —
guard-pinned).

## Remaining owner inputs

The TEST env package (`docs/billing/STRIPE_TEST_ENV_OWNER_PACKAGE.md`):
9 env names, TEST products/prices, webhook endpoint.
