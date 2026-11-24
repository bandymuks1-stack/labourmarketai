# Journal Entry ↔ Skill Links v1 — Audit

**Date:** 2026-06-02
**Branch:** `feat/cc/journal-entry-skill-links-v1`
**Builds on:** #225 hub · #226 evidence-support · #227 read-only process brain (all merged; main `507f0ff`).
**Principle:** a DURABLE, real evidence chain — the worker links work-journal entries to their declared skills as **evidence-support**, never verification/confirmation/certification.

---

## 1. Audit of the existing model (before editing)
| Element | Finding |
|---|---|
| Journal entry create/edit | RPC `create_journal_entry_full` (0017) / `journal_entry_supersede` (0018); composer sends notes + metrics + fragments — **no skills**. |
| `journal_entry_work_items` (20260601090000) | per-entry **work-types**, NOT skills; no FK to `skills`. |
| `worker_skills.source` | `self_declared` / `work_journal` / `manager_confirmed` + `verified`. |
| Manager confirm | `confirm_entry_and_verify_skills` records `journal_entry_confirmations.confirmation_scope.skills_confirmed` (jsonb) and sets `source='manager_confirmed'`. |
| **Durable journal↔skill link** | **None existed** — only the jsonb above (noisy, not queryable). This is the gap v1 fills. |
| #226 evidence-support | `deriveSkillEvidence` used the LOOSE `source`/`verified` provenance only. |

## 2. What v1 adds (the smallest real durable relation)
**Migration `20260602120000_journal_entry_skills.sql`** — a new join table:
`(id, journal_entry_id FK, worker_id FK, skill_id FK, created_at, unique(journal_entry_id, skill_id))`, owner-scoped RLS mirroring `journal_entry_work_items` (`owns_worker()` + admin + org-manager read; owner/admin write; the INSERT check also ties the link's worker to the entry's worker), grant to **authenticated only**, with a rollback comment. **Additive, GREEN** under `migration-safety`. **Not applied to prod by the agent** — DI applies via Supabase.

### Why a migration was necessary
A trustworthy, queryable "which entries support skill X / which skills does entry Y support" cannot be derived from existing data (no relation exists; the confirmation jsonb is manager-only and noisy). A durable join table is the minimal real primitive.

## 3. Real behavior delivered
- **Journal (canonical input):** each of the worker's entries shows a skill-link control (`JournalEntrySkillLinks`) — toggle chips of the worker's **own declared skills**; toggling persists the durable link via the **owner-scoped server action** `setJournalEntrySkillLinks` (re-checks entry + skill ownership; RLS re-enforces). A status/alert surface announces the save. Honest copy: *"Pažymėkite savo įgūdžius, kuriuos paremia šis darbo įrašas. Tai įrodymas, ne patvirtinimas." / "Mark your skills that this work entry supports. This is evidence, not verification."*
- **Profile hub (canonical output):** `deriveSkillEvidence` now takes a `journalSupported` signal sourced from the **durable** `journal_entry_skills` relation (graceful no-op if the migration isn't applied yet), so "supported by work entries" reflects real links — not only the loose provenance. The process assistant's `supportedSkillCount` uses the same durable input.
- **No new route.** Journal stays the input, profile the output. No new CV/profile/skill/journal/AI page.

## 4. Honesty boundary (evidence-support, NOT verification)
The link is the worker's own assertion that an entry supports a declared skill. It never sets `verified`/`manager_confirmed` (guard-asserted: the action has no `.update(`, no `manager_confirmed`, no `verified = true`). The only real verification wording (`✓ Verified`) stays on the separate manager-confirm badge. Copy is guarded against `verified/confirmed/patvirtinta/patikrinta` (except the honest "evidence, not verification" negation).

## 5. Guard / test coverage
- `journal-entry-skills.test.ts` — pure derivation (group by entry, distinct count per skill, supported set; no double-count, no fake support).
- `skill-evidence.test.ts` (extended) — durable `journalSupported` makes a self-declared skill supported.
- `journal-entry-skill-links.test.ts` — migration exists (additive, owner-scoped, grant-authenticated-only, rollback); action never verifies/confirms + is owner-scoped; LT/EN copy parity + no fake-verification wording (helper exempt as honest negation); journal renders the UI, profile uses the durable read, helpers expose the derivation; **no new route**; negative controls.
- `product-readiness` + `ops-bridge-migration` migration-count fences bumped 42 → 43 with documented rationale.

## 6. Deferred
- Surfacing a per-skill durable **count** ("supported by N entries") in the UI (data is now available via `countEntriesBySkill`; v1 only uses the boolean "supported").
- Auto-suggesting skills from entry text (Stage 2 of the process brain — reviewed, human-confirmed).
- Reviewer/manager visibility of links (RLS already allows org-manager read; no UI yet).

## 7. Manual worker smoke (post-apply)
After DI applies the migration:
1. `/lt/dashboard/journal` — under each of your entries, a "Pažymėkite savo įgūdžius…" chip row appears; toggle a skill → "Saugoma…" → "Išsaugota". Reload → selection persists.
2. `/lt/dashboard/profile` — the hub "Supported by work entries" count rises to include the durably-linked skill; the process assistant reflects it. No "verified/confirmed" wording anywhere on these links.

**This is evidence-support only — not automatic verification, confirmation, or certification.**
