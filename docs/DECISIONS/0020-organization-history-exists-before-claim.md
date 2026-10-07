# 0020 — Organization-provided history exists before account claim

Date: 2026-10-07 · Status: **OWNER DECISION (confirmed in the MASTER PRODUCT COMPLETION continuation)** · Complements decision 0015 (A-14) and `docs/OWNER_TARGET_ARCHITECTURE_V1.md` §1.6.

## Invariant

Organization-provided historical people and their professional history must exist and be usable **before** any account claim. Claim only later links a real user's account to the already-existing historical person/profile and gives that user control of it. Claim is never a prerequisite for the historical Person, the company-side worker card, company worker history, projects, supported skills, Living CV or Work Intelligence to exist where the source data supports them.

## Consequences

- Records without a work object (851 of 2,944 in production on 2026-10-07) are preserved in the person's and organization's history; they are grouped under their context label or "project or place not recorded", never dropped.
- No payment, counterparty-confirmation, owner-confirmation or other new gate is introduced for organization-provided historical work. Provenance stays "organization-provided, not independently verified".
- Manager reads of unlinked roster people already pass RLS (`manages_organization` branches); only the subject branch requires `link_state='linked'`, which is the correct claim-time boundary.
- Historical **photo** linkage to evidence/projects needs a schema change and stays an explicit open gap; it is never replaced by an unlabelled date-proximity guess.

## Where it is realized

`/dashboard/company/people/[personId]` (surface registry A-14 declaration), `lib/organization-evidence/company-person-read.ts`, `evidence-pagination.ts`.
