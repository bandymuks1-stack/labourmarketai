# Journal Proof Engine v1 (Sprint v2 §3)

Status: implemented repo-side 2026-07-14. Owner gates listed in §5.

The Daily Work Journal is the PROOF ENGINE, not a diary. The workflow it
serves: daily work → journal entry → suggestions (deterministic + optional AI)
→ explicit user approval → CV evidence → better matching → new opportunities.

## 1. Entry modes — one composer, one write path

Every mode writes through the SAME spine: `createJournalEntry` /
`supersedeJournalEntry` → `create_journal_entry_full` RPC. No mode adds a
second journal system.

| Mode | Surface | Notes |
|---|---|---|
| Quick note | composer preset `quick` | existing |
| Structured form | composer preset `structured` | existing (analyse → review → confirm) |
| Photo entry | composer preset `photo` | existing (1 photo, uploads after save) |
| Voice entry | `/dashboard/journal/voice` → reviewed transcript seeds the composer | existing |
| **Spreadsheet mode** | `components/app/journal-spreadsheet-entry.tsx`, collapsed section under the composer | **new** — multi-row grid; each row = one `createJournalEntry` call |
| Profession templates | composer template picker (registry-driven) | **new seam** — see §2 |

Spreadsheet mode contract (`lib/journal/spreadsheet-entry-model.ts`, pure +
tested):

- Columns: date (default today), work/topic text, quantity + unit (§15
  productivity-unit registry subset — the same slugs the composer offers),
  duration hours, engagement context (the worker's organisations/projects —
  the write path's required axis), note.
- Max **15 rows** per batch; empty rows skipped silently; per-row validation
  (`text_required`, `date_invalid`, `quantity_invalid`, `hours_invalid`,
  `engagement_required`).
- Rows save SEQUENTIALLY (the entry hash chains on `hash_prev` — parallel
  saves would race the chain). Failed rows stay editable with the exact
  server reason; saved rows lock with ✓; the summary reports real counts
  (`Saved: X. Failed: Y.`) — never "all done" while a row failed.
- Quantity AND hours on one row: quantity rides the `quantity` metric, hours
  persist as one `fragment_time` metric row — nothing dropped.
- Mobile: the grid degrades to stacked row cards (labels per field).

## 2. Profession templates — §10 slug registry

Registry: `journal_profession_templates` (DRAFT migration
`20260714180000_journal_profession_templates_v1.sql`, owner-gated; paired
rollback + APPLIED_LEDGER deferred entry).

- Row: `slug` pk, optional `profession_slug` (FK → professions.slug; null =
  profession-agnostic), `field_schema` jsonb (per-locale scaffold lines +
  `default_unit_slug`), `active` boolean **default false**.
- Seeds: `construction_daily`, `transport_daily`, `cleaning_daily` — all
  inactive. Owner activates deliberately (admin-only writes via RLS).
- Composer behaviour: active templates matching the worker's professions (or
  profession-agnostic) render as picker chips; picking one PREFILLS the
  textarea scaffold (appended when text already exists — never overwritten)
  and preselects the default quantity unit. The save path is untouched.
- Honest absence: no active template / registry not applied (42P01) / a slug
  without an i18n label → nothing renders. No RUOŠIAMA banner needed — an
  unoffered template is simply absent (§18). Labels live in
  `messages/{locale}/journal.json` `templates.*` (§10 — no raw slugs in UI,
  no hardcoded UI enums; guard pins the composer contains no template slug).

## 3. AI suggestions — through the shared router, §7.1 compliant

- Server action: `lib/journal/journal-ai-suggestions-actions.ts`
  (`aiJournalEntrySuggestions`), copying the `cv-ai-structuring-actions`
  pattern. Runs the registered `work_journal` agent (bumped to **v1.1**:
  additive optional envelope fields `suggested_achievements`,
  `suggested_experience_periods`, `suggested_project_names`) through
  `runAiAgent` — task type `normalize_work_scope` (low_cost tier, 0.05 USD
  ceiling, `journal_entry_text` in allowedFields). Every LIVE run is routed,
  cost-ceilinged and audit-logged append-only into `ai_runs` by the router
  (§7.1 — extraction runs logged; only field NAMES, never content).
- Data minimisation: ONLY the entry draft text is sent (`{ rawText }`).
- User-initiated: nothing runs until the worker taps "Pasiūlyti iš įrašo
  (AI)" in the composer's review stage. Deterministic recognizers stay the
  always-on layer.
- Output mapping is pure + tested (`journal-ai-suggestions-model.ts`):
  re-bounded lengths/counts, dedupe, honest `null` when nothing actionable.
- Every suggestion is confirm/discard (`components/app/journal-ai-suggestions.tsx`):
  - skill → SAME self-declared claim flow as deterministic chips
    (`saveProfileSkillClaimsAction`) — never verified;
  - achievement → `confirmCvAchievementAction` (worker_achievements; honest
    `needs_migration` until 20260714160000 is applied);
  - experience → `confirmCvWorkHistoryAction`
    (`save_self_declared_work_history_v1`; honest `needs_migration` until
    20260714161000 is applied);
  - project link → AI returns NAMES only; they are matched client-side
    against the worker's OWN engagement contexts
    (`matchProjectNameToEngagement`); confirming selects that context for
    THIS entry — no hidden write; unmatched names render nothing.
- Honest off: runtime disabled / model found nothing → one quiet line
  ("AI pasiūlymai šioje aplinkoje neįjungti…"), no fake badge, no error wall.
- §15: no confidence value is user-editable anywhere in the flow.

## 4. Proof-engine loop visibility

Journal page cvBridge area now carries ONE dense strip
(`data-testid="journal-proof-loop"`): "Įrašai → įgūdžiai → CV → pasiūlymai:
N įrašai šį mėn. · N įgūdžiai su įrašais · N peržiūrėti" + `/cv` link. All
counts computed from data the page already loads (entries list,
`journal_entry_skills` links, `worker_skills.verified`) — zero new queries,
honest zeros. Wording note: the silent-trust doctrine (guards
`silent-trust-wording` + `worker-facing-copy-exhaustive`) forbids
"įrodymai/evidence/patvirtinta/confirmed"-family terms on worker-facing
surfaces, so the strip uses the repo's neutral records vocabulary
("su įrašais" / "with records", "peržiūrėti" / "reviewed") while the counts
themselves stay the real evidence-loop figures.

## 5. Owner gates (nothing below is live until the owner acts)

1. Apply migration `20260714180000_journal_profession_templates_v1.sql`
   (Supabase MCP apply_migration; then verify per the migration header) —
   until then: no template picker anywhere.
2. Activate chosen templates (`update journal_profession_templates set
   active = true where slug = '…'`) — seeds ship inactive.
3. AI suggestions require the existing AI runtime gate
   (`AI_PROVIDER_MODE=live` + key) — until then the button returns the
   honest off state.
4. Achievement / experience confirms additionally require the already-listed
   deferred migrations `20260714160000` and `20260714161000` (honest
   `needs_migration` copy until applied).

## 6. Tests / guards

- `lib/journal/spreadsheet-entry-model.test.ts` — row→entry mapping + validation.
- `lib/journal/journal-ai-suggestions-model.test.ts` — envelope mapping,
  bounds, honest empty, project matching.
- `lib/journal/journal-templates-model.test.ts` — field_schema parse guard
  (malformed → template not offered).
- `lib/guards/journal-proof-engine.test.ts` — one-write-path pins, registry
  hygiene (inactive seeds, admin writes, -- DOWN, rollback, ledger), §7.1
  pins (router use, honest off, confirm/discard, action reuse), loop strip,
  5-locale copy.
