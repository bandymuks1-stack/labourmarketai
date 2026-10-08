# 0021 — Documents are readiness requirements, not a mandatory document vault

Status: ACCEPTED (owner, 2026-10-08). Durable product decision.

## Decision

LabourMarket.ai must NOT require workers, teams, agencies or companies to upload
and permanently store full copies of documents merely to participate, match,
apply, be shortlisted, be planned or be offered.

The default model is **document / readiness requirements + verification state**,
not mandatory file storage.

For each relevant country, role, project, engagement or contract the system may
identify what must be available or checked before the applicable
contractual / work stage. Examples (never hard-coded as universal): identity /
right-to-work check; work / residence authorization; A1 / posting documentation;
professional licence / certificate; driving licence; safety / site
certificates; qualification evidence; other legally or contractually required
checks. Requirements depend on the actual jurisdiction, engagement model,
role / project and applicable rule.

## States

Lightweight readiness semantics: `not_required`, `required`,
`declared_available`, `needs_check`, `checked`, `missing`, `expiring`,
`expired` — or an equivalent mapped onto an existing model. Prefer the existing
data model; no migration merely to rename concepts.

`checked` MUST NOT imply that LabourMarket.ai stores a copy. A verification state
must name its basis and must not falsely imply independent verification.

## Data minimization

Retain only the minimum metadata the purpose needs: requirement type, subject,
context, status, checked_by, checked_at, expiry, issuer / country where
genuinely needed, provenance, audit trail. Do not duplicate full identity / legal
documents when a readiness record is sufficient. File upload is OPTIONAL unless a
specific legal, contractual or product reason requires the file.

## Gates

No upload gate merely because a document is required later. In particular
registration, matching, candidate discovery, team formation, planning and
candidate / brigade offers must not require uploaded copies, and a missing
pre-contract document must never be turned into a false skills mismatch.
Surfaces distinguish **professional fit** from **readiness** ("strong match +
2 pre-contract checks outstanding"). The hard gate occurs only at the stage the
requirement genuinely must be satisfied (contract, assignment, mobilisation or
work start, depending on the requirement). UX shows readiness where it becomes
useful (Person / team / project / contract), not as an onboarding burden, and
says what must be checked and by what stage.

## What stays

The #2189 storage path (evidence-media bucket, secure writer / importer,
metadata / linkage, signed reads, Person / Project surfaces) stays for files
that genuinely belong in the product: historical work photos, work / evidence
media, project / person documents, user-chosen supporting evidence, files a
workflow genuinely requires. It is not a universal worker-document repository.

## Review question for future changes

Does this change make a file upload a precondition for participating, matching,
applying, shortlisting, planning or being offered? If yes, it violates this
decision unless a specific legal / contractual reason is recorded.
