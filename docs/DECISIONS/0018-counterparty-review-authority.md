# 0018 - Counterparty review authority derives from the work relationship

Date: 2026-10-04 · Status: **OWNER-APPROVED 2026-10-04** (chat confirmation of the PR #2143 direction) · Applies to every reader and writer of work confirmations; complements decision 0015 (A-14), decision 0016 and `docs/OWNER_TARGET_ARCHITECTURE_V1.md`.

## Decision

> Counterparty review / acceptance authority derives from the real transaction / project relationship and the authorized counterparty representative - never implicitly from employer status. Client acceptance is its own provenance-bearing signal; it is never employer confirmation, skill verification, payment confirmation, or independent verification.

## How it binds implementation

- **Authority = the party, not the login.** The counterparty is an organization in an explicit role (client / end client / project owner / customer / contracting party) registered by that organization's own authorized representative from a REAL active assignment of the worker (person assignment or team assignment). The subject can never be their own counterparty; a manager of the subject's own organization is not a counterparty. Source of truth: `journal_entry_review_authority_v1` (migration 20261003150500), one resolver for the guard trigger and every RPC.
- **Explicit submission.** An entry is reviewed by a counterparty only after the subject explicitly submits it to a valid link. Creating an entry never submits it.
- **Separate proof concepts.** A client acceptance is `CLIENT_ACCEPTED` (`apps/web/lib/journal/confirmation-origin.ts`). It is not `EMPLOYER_CONFIRMED`, not a verified skill (`worker_skills.verified`), not a payment confirmation and not `INDEPENDENTLY_VERIFIED`. The discriminator is `confirmation_scope.authority.basis = 'counterparty'` (actions `client_accept`, `client_request_correction`, `client_dispute`); every reader that means "the employer confirmed" or "verified" must exclude it.
- **Provenance.** Every row carries `confirmation_scope.provenance` (origin, recorded_by, confirmed_by_profile_id ...). Historical / reconstructed client confirmations are never written as platform rows; they enter through the evidence import path, the importer is never the confirmer.
- **Append-only.** Acceptance is final; a dispute is withdrawn only by a later acceptance; a correction request is answered by a new version (`correction_of`) and a resubmission.
- **Surfaces.** Project page (register / revoke), journal entry (submit / resubmit / state), `/dashboard/inbox/counterparty` (decide), and the chat / MCP capability over the same server functions.

## Guards

`apps/web/lib/guards/counterparty-review-ui-v1.test.ts`, `apps/web/lib/guards/client-acceptance-not-employer-readers.test.ts`, `apps/web/lib/journal/client-acceptance-is-not-employer-confirmation.test.ts`, and the scratch-PG proofs `scripts/db-proof/journal-counterparty-authority.sh` and `scripts/db-proof/journal-counterparty-link-ui.sh`.
