# Parked PR audit — 2026-09-01

Owner instruction (§5 of the 2026-09-01 handoff): audit every open parked PR
against **current main**, classify it, and record explicit evidence for any
closure. *"Do not infer supersession merely because similar code exists."*

Baseline: main `c862c7ed`, production ledger through
`20260901100000_revoke_public_schema_create_v1`. Every claim below was measured
against the production database or current main on 2026-09-01 — not read from a
previous session's report.

## Classes

| | meaning |
|---|---|
| **A** | current + safe + valuable → finish/merge under GREEN governance |
| **B** | current but owner-gated → leave open, carry to the owner package |
| **C** | superseded by an equivalent/better implementation → close with evidence |
| **D** | obsolete |
| **E** | research/parked, awaiting an owner product decision |
| **F** | blocked on an external dependency |

## Verdicts

| PR | Class | Evidence |
|---|---|---|
| **#879** security residual hygiene | **C** | Split verdict, both halves resolved. The **CREATE-on-`public`** half was still live (`nspacl = {postgres=UC/postgres,=UC/postgres}`; anon/authenticated/service_role all inherited CREATE with no direct grant) and is now closed by #1404, applied to production. The **I-02 null-safe owner guards** half is **already applied**: all four organization-owner guard functions carry `(v_owner is not null and v_owner = uid)` in production, and a scan of **all 400** SECURITY DEFINER functions found **zero** still using the naked comparison. Merging #879 itself would have been actively harmful — 890 commits of divergence, and its second migration recreates four SECURITY DEFINER bodies as of 2026-07-27, reverting five weeks of later work. **Closing loses no capability.** |
| **#1266** ai_runs subject de-linking | **B** | **Still a real, open gap.** Production has retention machinery (`ai_runs_retention_days`, `run_ai_runs_retention_sweep`, `redact_expired_ai_run_content`) — but that function only nulls `output_excerpt`. `ai_runs.profile_id` is never cleared, so `ai_runs` remains a permanent index of **who** ran what, which is precisely the defect this PR names. Not superseded. |
| **#883** assistant transcript persistence | **B** | **Not superseded, and its consumer is already merged.** `lib/assistant/transcript.ts` and `conversation-chat.tsx` call the transcript seam and degrade honestly (`available: false`) while the schema is absent — the file states the chat "stays exactly what it is today — session-only". Production `conversations` carries only `source_type='scouting'` (3 rows / 16 messages, human scouting threads), so it is **not** an equivalent store. This PR is the gate on assistant chat history. Its "stacked on #879" note is now stale — #879 is closed, so #883 needs re-basing on current main. |
| **#1045** admin-grant service_role repair | **B** | **Partially still live.** `service_role` now holds `SELECT(id)`, `SELECT(active_role)` on `public.profiles` — but **not** `SELECT(email)`, **not** `UPDATE(active_role)`, and **nothing at all** on `public.profile_roles`. The founder admin-grant path (`pnpm admin:promote`) therefore still cannot complete. A subset was applied since the PR was written; the remainder is unaddressed. |
| **#1046** worker board org attribution | **B** | **Structurally live, currently dormant.** `list_open_demand_for_workers` still joins `c.profile_id = cr.profile_id` and makes no use of `organization_id`, and production has 1 profile owning >1 verified company — the exact fan-out precondition. Measured today the fan-out does **not** manifest (9 rows / 9 distinct demands) because that profile has no `submitted` demand. It will misattribute and duplicate the moment it posts one. |
| **#740** voice_journal_jobs | **B** | Table absent from production. The **user-facing** capability shipped through a different, synchronous architecture (`VOICE_TRANSCRIBE_URL`/`_TOKEN`, `lib/voice/transcribe-action.ts`, guarded by `voice-work-journal.test.ts`), so nothing is blocked today. This PR's async job model (retention ceiling, idempotency key, pinned disclosure version, one-entry-per-job) is a **design that was never built**, not a duplicate of what exists. Low priority; do not close as superseded — the synchronous path does not provide its retention or idempotency guarantees. |
| **#893** commercial readiness audit | **C** | Every product file it touched now exists in main and the paid-chain work has since been carried further by #1398 (refund/dispute record-only ingestion, LMC compensation caller, billing surfaces). Only `lib/billing/commercial-chain.integration.test.ts` never landed — **that test is the one thing worth salvaging before closing**, and it is the reason this row is C-with-a-caveat rather than a clean close. |
| **#895** canonical commercial system | **B** | `lib/commercial/catalogue.ts` is still absent; main still uses the three-registry model (`plans.ts`, `prices.ts`, `lmc-flags.ts`, all present). The owner's §19 ruling — one canonical commercial domain model **plus** scoped presentation views, rather than either a flat catalogue or three unrelated registries — is now settled, but the owner also directed that the stale implementation must **not** be revived on that basis. Re-derive against current architecture; do not merge as-is. RED: billing. |
| **#896** commercial sustainability gate | **B** | Entirely absent from main — `lib/commercial/sustainability.ts`, `scripts/check-commercial-gate.ts` and the guard never landed, so the "priced feature without an economic model = CI RED" gate **is not running today**. Current, unbuilt. RED: billing. |
| **#897** Business Health Engine | **B** | Entirely absent from main. Current, unbuilt. RED: billing. |
| **#1166** Living Opportunity World R5 | **E** | 15,223 additions of design R&D. Explicitly parked for an owner visual decision; no product path depends on it. |
| **#1211** art direction spec | **E** | Self-described "PARKED for owner decision". |
| **#1225** landing FOCUS | **E** | Explicit owner **visual** gate — a look-and-feel judgement that is the owner's to make, not a technical one. |

## Summary

- **C (close with evidence): #879, #893** — 2
- **B (current, owner-gated): #1266, #883, #1045, #1046, #740, #895, #896, #897** — 8
- **E (owner product/visual decision): #1166, #1211, #1225** — 3
- **A (merge now): none.** No parked PR was both current and safely mergeable without an owner gate. Every remaining item is either RED-class (billing / privilege / SECDEF) or an explicit owner design decision.

## Two corrections this audit produced

1. An earlier note in this session recorded #1266, #883 and #740 as
   "current-shaped" on the strength of a missing table alone. That reasoning was
   too weak. Re-measured: #1266 is current for a *specific proven* reason (the
   redaction function never touches `profile_id`), #883 is current because its
   **consumer is already merged and degrading**, and #740 is current only as an
   unbuilt design whose user-facing capability already ships another way. Same
   verdicts, different and much stronger grounds.
2. #879 nearly shipped a redundant, actively harmful migration. The I-02 half
   looked open under a loose regex (`if not \(.*v_owner = `) that matched
   *across* the null-safe form. A precise scan showed all four functions were
   already fixed. **A regex that spans the fix looks exactly like the bug.**
