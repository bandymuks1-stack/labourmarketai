# Deletion process design v1 — DESIGN ONLY (2026-08-13)

> **STATUS UPDATE (2026-08-13, V9 PR `feat/cc/v9-deletion-executor-phase1`):
> Phases 1+2 SHIPPED — the NON-destructive phases only.**
> Phase 1 (review verbs): superadmin status transitions
> (`in_review / needs_followup / approved / closed`) + note on the admin
> queue, audit-logged into the row's payload (`privacy_review_log`, the
> workbench `match_log` pattern) through the existing `customer_requests`
> admin UPDATE policy — no migration, no new table.
> Phase 2 (dry-run plan): the read-only `DeletionPlanPreview`
> (`lib/privacy/deletion-plan.ts`, zero-writes guard-pinned) rendered as a
> same-page expand on the admin queue; RLS-self-only classes (consents,
> notifications) are marked NOT COUNTABLE rather than false zeros.
> **Phases 3–4 remain OWNER_GATED + LEGAL_DECISION_REQUIRED exactly as
> designed below — no destructive step exists, is scheduled, or is enabled.**

State: `DESIGN — NOTHING DESTRUCTIVE IS IMPLEMENTED`. This document
designs the account-deletion (GDPR Art. 17) process end to end so the owner
can review it as a whole before ANY executor code exists. Every destructive
step below is OWNER_GATED. The only shipped pieces as of this document are
the intake and the admin visibility queue — both explicitly non-destructive.

Companion documents:
- `docs/legal/data-retention-matrix-v1.md` (#1145, DRAFT) — the per-class
  delete/anonymize paths this design executes.
- `docs/legal/retention-decision-package-v1.md` (Package A) — the owner/legal
  decisions steps 4b–4d depend on.
- `docs/audits/labourmarketai-security-privacy-data-audit-v1.md` — SEC-06,
  the finding this design answers.

## 1. Current truth (SEC-06)

- **Intake is live** (since 2026-07-06): `submit_privacy_request_v1`
  (migration `20260706150000_privacy_request_intake.sql`) stores an
  `account_deletion` / `data_export` request as a `customer_requests` row
  stamped `payload.source = 'privacy_self_service'`. The migration states
  plainly that nothing in it deletes any data.
- **Admin visibility is live** (V8 W4-C item 2): the admin control room's
  "Privacy requests" section (`components/admin/privacy-requests-section.tsx`
  over `lib/admin/privacy-requests.ts`) lists these rows as privacy
  requests; the matching workbench excludes them from labour demand. The
  section carries no processing control — deliberately, because:
- **Zero deletion/anonymisation code exists.** No `deleteUser` /
  `admin.deleteUser` call, no anonymisation routine, no storage-cleanup job
  anywhere in `apps/` (audit SEC-06, re-verified for this document).
  Fulfilment today is a manual, by-hand operation relying on
  `ON DELETE CASCADE` from `profiles`.
- **Export is live** for the self-service JSON/CSV download
  (`lib/privacy/export-data.ts`); the deletion side is intake-only.

## 2. The designed process

```
person submits request (live)
        │  submit_privacy_request_v1 → customer_requests row, status in_review
        ▼
admin sees it AS a privacy request (live — W4-C item 2)
        │  admin control room, "Privacy requests" queue
        ▼
manual review (designed, phase 1)
        │  identity confirmed (request row is auth-bound already — the RPC
        │  writes profile_id = auth.uid(); no email round-trip needed);
        │  exception check against the retention matrix (fraud/abuse hold,
        │  engagement claim horizon, statutory billing periods);
        │  decision recorded on the request row (approve / refuse-with-reason)
        ▼
executor (designed, phases 2–3 — ALL steps OWNER_GATED destructive DML)
        │  per data class, in the matrix's delete/anonymize paths — §3
        ▼
completion note to the person (designed, phase 4)
           status → closed; the person is told what was deleted, what was
           anonymised, and what is kept under which named exception
```

## 3. Executor steps per data class (from the retention matrix)

Order matters: anonymisation/detachment steps run BEFORE the auth delete,
because they need the identity to find the rows; the cascade runs last.

| Step | Data class | Action | Matrix basis |
|---|---|---|---|
| E1 | Work Journal | **ANONYMIZE, not delete**: detach `worker_id` (the #856 "model A" GDPR-detach pattern — detached rows grant nothing), keep aggregate/evidence value; employer-confirmed entries tied to a real engagement stay as detached evidence | matrix "Work Journal" row |
| E2 | Consent + disclosure ledgers | detach identity, KEEP the append-only events 6 years (proof of lawfulness) — never edited | matrix "Consent events" / "Audit logs" rows |
| E3 | Bookings / engagements / contracts | KEEP until the Package A Decision 1 horizon (recommended 6 y after engagement end) — named exception in the completion note | matrix "Bookings/engagements" row |
| E4 | Inquiries (customer_requests) | anonymize requester linkage; the privacy-request row itself is kept 3 y after completion (Art. 12–22 defense) then anonymised | matrix "Inquiries" / "Privacy requests" rows |
| E5 | Storage objects (photos, files, avatars) | delete objects + rows (private buckets; short-lived-link model means no public copies) | matrix "CV / documents" row |
| E6 | Messages | per matrix recommendation (36 mo after close) — until Decision 3-style approval exists, deletion request triggers detachment of the requester's identity from their messages | matrix "Messages" row |
| E7 | Account (auth) | `auth.users` delete → `profiles` cascade (FKs from profiles cascade the remaining personal rows) — the LAST step | matrix "Account (auth)" row |
| E8 | Notification/analytics events | covered by E7 cascades where profile-keyed; rolling deletes are Package A Decision 3, independent of this process | matrix rows |

## 4. Gates — what may NOT proceed without whom

- **OWNER_GATED (hard stop, every occurrence):** every destructive DML step
  above (E1–E7). No executor phase ships enabled; each lands behind an
  explicit owner-run gate exactly like the applied-migration discipline.
- **Package A Decision 1 required first** (engagement claim horizon): E3's
  keep-period and the completion-note wording cannot be written honestly
  without the decided number.
- **Package A Decision 3 required first** (rolling-delete semantics): E6/E8
  time-based deletion; NOT required for the request-triggered path.
- **No decision required** for: the manual-review phase (no DML), the
  completion-note phase (a status write + copy), E1's detach design (the
  pattern already exists and is non-destructive to evidence value — but its
  EXECUTION on real rows is still owner-gated DML).

## 5. Minimal implementation plan — each phase one owner-reviewable PR

1. **Phase 1 — review verbs (no DML on user data):** approve/refuse actions
   on the admin queue writing a decision + reason to the request row
   (status transitions only, via a small SECURITY DEFINER RPC mirroring the
   intake's style). Gives the queue a real lifecycle; deletes nothing.
2. **Phase 2 — detach executor (E1, E2, E4):** one owner-gated migration
   adding an anonymisation RPC per the detach pattern; dry-run output first
   (counts per table, no rows touched) surfaced on the admin queue;
   execution behind an explicit owner switch.
3. **Phase 3 — account delete (E5, E7):** storage cleanup + `auth.users`
   delete via a service-role script the OWNER runs (not a web-reachable
   action), taking the request id, verifying phase-2 completion, and
   recording the completion facts on the request row.
4. **Phase 4 — completion note:** the request's closed state renders to the
   person (privacy page already lists own requests) with the honest
   kept-under-exception summary; public data-protection copy updates from
   "manual process" to the described process.

Sequencing rule: a phase merges only after the previous phase has run on a
real request at least once (the W4 "real benefit" discipline).

## 6. What the original #1149 PR changed

Nothing executable. That PR shipped: the admin visibility queue (item 2, no
processing controls), the factual subprocessors list (item 1), and this
document. **No deletion, anonymisation, or account-removal code is
implemented, scheduled, or enabled by this PR.**
