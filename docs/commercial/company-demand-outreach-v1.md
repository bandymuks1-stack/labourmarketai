# Company-demand outreach v1 (preserved pointer, 2026-08-24)

Preserved on the master-order hygiene pass when closing **#687** (repeatable
company-demand outreach pipeline, draft-only). This is an outcome-level pointer,
NOT the strategy itself and NOT an authorization to send anything. The detailed
outreach strategy (prioritization, dedup, watchlist sizing, message templates)
lives in the private Internal Brain (AGENTS.md); the raw draft is preserved on
branch `feat/cc/company-demand-outreach-pipeline-v1`.

## What is recorded here (principles only)

- **Ownership boundary (master order §15).** Acquisition/outreach is **Agentai
  OS's** responsibility, not labourmarket.ai's. labourmarket.ai owns
  product/user/domain truth and must be *ready to receive* traffic; it does not
  run the outreach campaign.
- **The stricter policy wins.** Main already has
  `apps/web/lib/vacancy-sources/employer-outreach-policy.{ts,test.ts}`, a
  guard-backed doctrine for employers discovered via imported public vacancies
  (recency floor, one initial contact ever, per-company, permanent opt-out,
  fail-closed). Wherever the #687 strategy overlaps it, **that policy is
  stricter and binding.** Nothing in the preserved strategy loosens it.
- **Owner gates before any send.** No outreach is dispatched without explicit
  owner approval of the candidate list, the message template, and the send
  itself. Public-source information only.

## Follow-up

The two stale references pointing at the #687 draft
(`docs/audits/labourmarketai-current-state-baseline-v1.md`,
`docs/launch/launch-blocker-register-v1.md`) should cross-reference this pointer.
