# W5 — WORK JOURNAL / EVIDENCE / SKILLS PIPELINE: BASELINE (acceptance stage, not a rebuild)

Opened 2026-08-01, immediately after
`W4_PROFESSIONAL_IDENTITY_COMPLETE_WITH_OWNER_GATED_ITEMS` (main `426e87aa`).
W5's job is to ACCEPT the existing journal → evidence → skills →
verification chain, complete PARTIAL rows, and build only launch-critical
MISSING rows. The owner directive stands: **the conversation IS the work
journal** — never a second journal surface.

Classification: `FULL` · `PARTIAL` · `MISSING` · `BLOCKED` · `DUPLICATE` ·
`OBSOLETE` · `PRODUCTION_PROVEN`, with `PENDING_AUDIT` + exact probe where
this baseline could not verify without guessing.

## Carried in verified (evidence in the W3/W4 records)

| Capability | State | Evidence |
|---|---|---|
| Journal → capability-extraction → confirm loop | PARTIAL | exists since W1/W2; W4 audit left which claims surface on the card vs lack evidence links unmapped |
| Skill verification honesty | FULL (as of #963) | strict verified rule unified; admin blanket-verification deleted; both pinning guards flipped |
| #candidate-skills anchor | FULL (as of #963) | deep link lands on the skill list, not the clarify form |
| Skills clarify flow | DEFECTIVE (carried) | W4 audit: a write-only sink — entries go in, nothing consumes them |
| `candidate_skills` store | PARTIAL (carried) | read-only ghost consumed by both matching engines; no write path audit yet |
| Journal `visibility_scope` column | OBSOLETE (carried) | consulted by no policy (W4 audit) — removal needs the W3 deletion method |
| Work-Journal-First stages A–H | BLOCKED (design) | owner-directed architecture; Draft PR #867 never merged — W5 must reconcile it against what shipped since, not assume it |

## PENDING_AUDIT — exact probes (first W5 work items)

| Capability | Probe |
|---|---|
| Journal write path (conversation) | Where does a chat message become a journal row? Map the actual write chain and its tests |
| Structured journal | Do structured entries (task/duration/site) exist, or is it free text only? Read the journal schema + entry forms |
| Capability extraction quality | Run the extraction on a real local journal fixture; verify claims carry evidence pointers and are labelled unverified |
| Confirmation flow (manager/employer) | Who confirms a claim, through which surface, writing which row? Verify the confirm write end-to-end locally |
| Evidence links on the Player Card | Which skill claims render with evidence links; which render bare (the W4 leftover) |
| Journal-derived objective evidence (W6 boundary) | What already exists that W6 reputation would consume — inventory only, no reputation building in W5 |
| Four skills stores | catalogue / declared / candidate / confirmed — map every write and read; name DUPLICATE rows for the W3 deletion method |
| Voice journal | 7 migrations live per programme record — is the transcribe service deployed and the path usable, or dormant? |

## Rules carried forward

- ONE journal (the conversation), ONE skills truth chain — no parallel stores without a deletion plan for the loser.
- No fabricated verification; claims stay visibly unverified until a real confirmation row exists.
- Row-by-row browser assertions before any deletion/port; mobile 375px + keyboard/accessible-name legs on accepted rows.
- Production acceptance stays local-stack until the owner provisions `PROD_QA_*` (standing).

---

## AUDIT COMPLETE — 2026-08-01 (three parallel read-only audits; file:line evidence in the audit transcripts)

### Consolidated classification (replaces the PENDING_AUDIT rows)

| Domain | Class | The one-line truth |
|---|---|---|
| Journal write path | FULL | ONE canonical chain: chat sentence → deterministic `extractWorkLog` → explicit confirm → `createJournalEntry` → `create_journal_entry_full` RPC (applied in prod; legacy fallback is dead-in-prod insurance). The AI journal agent persists nothing |
| Chat-first doctrine | FULL (implemented) | `/dashboard/journal` composer renders ONLY in `?editing=` mode; fresh records start in chat; the journal page is explicitly the history/evidence PROJECTION |
| Structured journal | FULL | Hybrid: `original_text` never dropped + typed `journal_entry_metrics` (slug/value/unit/source) + photos (private bucket, supersede continuity) + `journal_entry_skills` links + sha256 hash chain + append-only supersede/soft-delete lifecycle |
| Journal surfaces | FULL + one DUPLICATE | All writes funnel through `lib/journal/actions.ts`; ~12 read projections. DUPLICATE: `journal-spreadsheet-entry.tsx` — a full bulk-write component rendered NOWHERE (orphan; second-journal risk if ever mounted) |
| `visibility_scope` | carried claim CORRECTED | NOT "consulted by no policy": the applied INSERT policy pins `visibility_scope='closed'` (20260530130000). It never GRANTS anything; the other 4 enum values are dead vocabulary. Write-pinned invariant, not removable residue |
| Voice journal | BLOCKED (infra) + DEFECTIVE (handoff) | Service code FULL (`services/transcribe`, honest `unavailable` when env unset) but undeployed, env unset, `voice_journal_jobs` migration never committed, NO UI links to `/dashboard/journal/voice`. Handoff DEAD both ways: recorder pushes to a composer that only mounts in edit mode, and the composer's mount effect refuses edit mode — the reviewed transcript silently dies in sessionStorage |
| Skills stores | FULL ladder + 2 defects | Canonical ladder is clean: `skills` (taxonomy) → `worker_skills` (holding, honest post-#963) → `journal_entry_skills` (single-chokepoint evidence writer with provenance) → `verified` flag. Free-text capture exists in FOUR lanes (claims / skill_claim metrics / clarifications / candidate_skills) |
| `candidate_skills` | DEFECTIVE (ghost, broken pipe) | ZERO writers ever existed; the designed capture slice shipped to `skill_candidate_clarifications` + `profile_skill_claims` instead; the approval queue was never built. Both matching engines read an eternally-empty set and silently degrade |
| Clarify flow | PARTIAL (answers = confirmed sink) | Label rows DO gate the ambiguity lifecycle + card count; the three answer columns (`related_to`/`tools_materials`/`often_with`) are consumed by NOTHING |
| Extraction pipeline | FULL (deterministic) | Lexicon-based, explicitly NOT AI; optional AI lane produces suggestion chips only (never persists, never raises trust). Every write `verified:false, source:'self_declared'` — guard-pinned |
| Claim evidence pointers | PARTIAL | `journal_entry_skills` is FK-linked end-to-end; `profile_skill_claims` have NO entry pointer — linkage reconstructed by normalized-label join via metric rows |
| Evidence on the Player Card | PARTIAL | Catalogued skills render count+tier bars (real rows, honest zero floor) but NO drill-down to the backing entries; free-text claims and clarifications render bare (promotion flow is the designed remedy) |
| Tier model | FULL | One semantics everywhere (verified only from `verified=true`; W4's cv-engagement-cards defect confirmed fixed); cosmetic drift: four naming vocabularies for the same three rungs |
| Confirmation flow (org side) | FULL | Quadruple-enforced (app authorizer + RLS + DB CHECK + RPC re-validation); review (3 decisions, gated on `journal_review_enabled`) vs per-named-skill verification (the ONLY `verified=true` writer); auto-confirm writes a REAL honestly-labelled confirmation row under an owner-enabled policy |
| Worker requests confirmation | MISSING | No surface, no table, zero repo hits — the gate is entirely org-side; the worker only sees `submitted` status |
| Dormant ungated confirms | DUPLICATE (dead) | `confirmEntry`/`rejectEntry` exports have no UI caller and bypass the `journal_review_enabled` gate via the legacy 0013 RLS — reopening risk on any future import |
| Ledger truth | PARTIAL | `20260720100000` + `20260720150000` are applied in prod but ABSENT from APPLIED_LEDGER; batch review applied but never exercised; `20260714180000` templates stay owner-DEFERRED |
| W6 boundary inventory | FULL (inventory) | Objective evidence ready for W6: confirmations, metrics, skill links + provenance, photo continuity, review results, trust columns (all derived from countable rows), audit_logs, learning signals. NO subjective store exists (guard-pinned absent); dormant `organizations.trust_score` column is schema residue, guard-blocked from every surface |

### W5 slice plan (owner order: complete PARTIAL, launch-critical MISSING only, no rebuilds)

1. **SLICE 1 — dead-surface deletion + ledger truth (code-only, the #963 method):** delete orphan `journal-spreadsheet-entry.tsx` (+ its guard reference); delete dormant ungated `confirmEntry`/`rejectEntry` exports and pin the absence in a guard; remove the two dead `candidate_skills` joins (match-subject + matching-workbench read an eternally-empty set) and record the table OBSOLETE pending an owner drop migration; add the two missing APPLIED_LEDGER rows.
2. **SLICE 2 — voice handoff repair (code-only, chat-first):** the reviewed transcript must land in the ONE intake — seed the chat work-log flow on `/dashboard` instead of the unmounting composer; add the missing UI entry point to `/dashboard/journal/voice`; keep the honest `unavailable` state. Live transcription stays owner-gated (deploy + env), but the handoff must not eat data the day it's enabled.
3. **SLICE 3 — evidence drill-down (complete the PARTIAL):** skill-evidence bars link to the backing journal entries (worker self view only — no visibility change).
4. **OWNER-GATED, reported once:** transcribe service deploy + `VOICE_TRANSCRIBE_*` env; `voice_journal_jobs` persistence migration (never committed); `candidate_skills` DROP migration; journal profession templates 20260714180000; append-only trigger guards (known deferred). **DECISION-GATED (design, not owner-legal):** worker-side "request confirmation" surface (MISSING; needs product ruling on notification path) and the clarify-answers consumer (use in recognizer disambiguation vs stop collecting) — both deferred to after slices 1–3, not silently dropped.

---

## SLICE LOG

### Slice 1 — dead-surface deletion + ledger truth (PR #968, MERGED, main `53aeb8ad`)
Orphan spreadsheet bulk-write surface DELETED (component + model + test; absence guard-pinned); dormant ungated `confirmEntry`/`rejectEntry` DELETED (absence pinned in confirmation-honesty; the reject-reason cap guard repointed at the gated review note cap); both dead `candidate_skills` joins REMOVED (workbench allowlist tightened); APPLIED_LEDGER gained the 26-migration DRIFT NOTICE + retroactive rows for `20260720100000`/`20260720150000` (the other 24 need PR-history reconstruction — recorded, not faked). Proof: 131 affected-guard tests green, tsc clean. Browser proof N/A by construction (every deleted surface was grep-proven mounted nowhere).

### Slice 3 — evidence drill-down (PR after #969)
The skill-evidence bars are now inspectable, not just stated: a bar with ≥1 linked record links to `/dashboard/journal?skill=<slug>` (worker SELF view only — the card reads own rows, the journal is own-RLS; no visibility change). The journal page gains the `?skill=` filter following the `?date=` precedent exactly: resolved against the worker's OWN skill set, feeds ONLY the diary grouping (profile strips/CV-bridge counts stay global), unknown slug ignored (never an invented empty diary), active-filter strip names the skill + REAL count with the one clear control. Bars with zero records stay plain — a dead link would dress the honest zero up as a feature. `skillFilterActive`/`skillFilterClear` ×12 locales. Browser proof `w5-evidence-drilldown.spec.ts` 3/3 on the local stack (DB state pinned via the #958 service-role helper: fixtures seed journal links but no `worker_skills` row — the spec declares the linked skill, removes it after): desktop drill + clear restores, mobile 375px strip + no overflow, unknown slug ignored. Full vitest 12559/12559, tsc clean.

### Slice 2 — voice handoff repair, chat-first (PR #969, MERGED, main `9e014e5b`)
The reviewed transcript now lands in the ONE intake: the conversation chat consumes the read-once `VOICE_TRANSCRIPT_DRAFT_KEY`, shows it as the worker's own visible turn, and runs the SAME deterministic `startWorkLog` flow (preview → explicit confirm → `createJournalEntry`). Recorder targets `/dashboard`; the composer's dead consumer (could never mount post chat-first) deleted; the voice surface finally has a door (`journal-log-via-voice-cta` on the journal page, honest `unavailable` state preserved; `logViaVoiceCta` key ×12 locales). Guard updated to pin the new topology. Browser proof `w5-voice-handoff.spec.ts` 3/3 on the local stack: desktop handoff, mobile 375px + no horizontal overflow, journal door navigates. Full vitest 12559/12559. Live transcription itself stays owner-gated (service deploy + env) — the handoff no longer eats data the day it's enabled.

---

## STAGE CLOSED — 2026-08-02

```text
W5_JOURNAL_EVIDENCE_SKILLS_COMPLETE_WITH_OWNER_GATED_ITEMS
```

All three planned slices MERGED and production-deployed (#968 `53aeb8ad`,
#969 `9e014e5b`, #970 `7621acab`; each Vercel Production deployment success;
authenticated W5 surfaces proven on the local stack — production stays
gated on `PROD_QA_*`, the standing item). The canonical chain is now honest
end-to-end: ONE intake (chat, with voice handed off into it), ONE skills
truth ladder (dead ghost reads and dead write surfaces deleted,
absence guard-pinned), and evidence that is inspectable (bars → filtered
diary), not just stated.

Owner-gated (carried in the W4 §4 list + W5 additions, reported once):
transcribe service deploy + env; `voice_journal_jobs` migration (never
committed); `candidate_skills` DROP migration; profession templates
20260714180000; append-only trigger guards; APPLIED_LEDGER's remaining 24
retroactive rows (PR-history reconstruction).

Decision-gated, routed forward (recorded, not silently dropped):
- Worker-side "request confirmation" surface → **W7 (employee journey)** —
  it is a journey interaction between parties, not pipeline plumbing.
- Clarify-answers consumer (use `related_to`/`tools_materials`/`often_with`
  in recognizer disambiguation vs stop collecting) → decide when the
  recognizer next changes; collecting stops being harmless the moment the
  form grows.

W5 is frozen except real regressions. Next stage: **W6 — Trust**
(`w6-baseline.md`): subjective feedback (owner ruling from W4 row 23 —
no store exists today, nothing may be fabricated), journal-derived
objective evidence (inventory ready in the W5 audit §W6 boundary),
reputation.
