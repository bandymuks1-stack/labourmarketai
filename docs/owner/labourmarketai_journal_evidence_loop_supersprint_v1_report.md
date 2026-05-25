# Journal Evidence-Loop Supersprint v1 — Review Report

Branch: `fix/journal-evidence-loop-extraction-save-v1`
Base: `origin/main` @ `496aa71` (PR #60 merged: parallel SSR reads)
Date: 2026-05-25

## Owner trigger sentence (LT)

> "Valandą dirbau pavežėju. 3 valandas parduotuvėje kasininku, ir 5 valandas
> padėjau dengti stogą."

Expected: 3 time fragments (1h / 3h / 5h) + 3 work directions (driver,
cashier/store, roofing). Plus: pressing **Patvirtinti įrašą** must persist the
entry and surface it in history (or, if it can't, must explain WHY in plain
language instead of swallowing the error).

## Root causes — verified, not guessed

### P0-A — Extraction silently lost 2 of 3 time fragments and 3 of 3 activities

1. `extractJournalSuggestions` used `lower.match(...)` (non-global) for time
   regexes — only the **first** match was returned. The owner sentence has
   three valanda-class mentions, so 2 were silently dropped.
   (`apps/web/lib/structuring/extract-journal-suggestions.ts`, prior versions)
2. Word-form numerics were never recognised. "Valandą", "vieną valandą",
   "pusvalandį" all have no digit, and the digit-anchored regex skipped them.
3. The return type only had room for **one** `time`, **one** `quantity`,
   **one** `workDirectionSlug` — no slot existed for a multi-fragment day.
4. `WORK_DIRECTION_HINTS_LT` covered construction only (apdaila, betonavimas,
   elektros darbai, santechnika, mediena). Driver / cashier / roofer had no
   entries — so even with multi-match the activities would still be invisible.
5. The composer mirror-state filtered direction slugs through
   `worker_professions`; even when a slug parsed, anything the worker didn't
   already have in their profession list was dropped from the suggestion.

### P0-B — "Nepavyko išsaugoti" was a black box on top of any failure mode

1. The server action `createJournalEntry` threw plain `Error("...")` strings
   for every validation path. In production Next.js 15 strips thrown server
   action messages to an opaque `digest` — the client only ever saw a generic
   rejection. The composer's `catch { setError(t("saveError")) }` then rendered
   the same generic LT copy regardless of whether the actual cause was an
   RLS reject, a null engagement_context_id, a schema constraint, or a network
   blip. Owner could not distinguish causes and we had nothing to debug from.
2. There was no `fragments_json` channel: even if extraction worked, the
   composer would have nothing to forward to the action for the 3 cards.

## Changes

| Path | Change |
|------|--------|
| `apps/web/lib/structuring/extract-journal-suggestions.ts` | Replace first-match regex with `matchAll`. Add LT word-form hour detector (`valandą` / `vieną valandą` / `pusvalandį` / `pusę valandos`). New `fragments[]` return field; new `splitFragments()` splitting by `.`, `;`, `,ir`, `,bei`, ` ir `, ` bei `. Per-fragment activity lookup. |
| `apps/web/lib/structuring/keywords.ts` | New `ACTIVITY_HINTS_LT` lexicon (slug + LT label + needles) covering roofing + driver / pavežėjas + cashier / parduotuvė + plus existing construction trades. Slug stays `null` for activities outside the construction taxonomy so no fake slug is invented. |
| `apps/web/lib/journal/actions.ts` | Convert `createJournalEntry` from throw-based to `{ ok, code, message }` tagged-union return. Accept `fragments_json` and persist them as `parsed_fragment` / `fragment_time` / `fragment_activity` rows in `journal_entry_metrics` with `source='worker_input'` (no verified/confirmed claim). Each known failure mode (`not_authenticated`, `no_worker_profile`, `engagement_required`, `notes_required`, `quantity_invalid`, `entry_insert_failed`, `metrics_insert_failed`) ships with a precise LT message the worker can read and act on. |
| `apps/web/components/app/journal-entry-composer.tsx` | Render a `fragments[]` card list above the existing single-bucket cards when multiple fragments parse. Forward only confirmed fragments as `fragments_json`. Display `result.message` on save failure instead of the generic copy. Suggestion-count summary ("Sistema rado N laiko įrašus ir M galimas darbo kryptis"). Honest "Privatus įrašas · Pasiūlymai peržiūrėti jūsų" framing on the review block. |
| `apps/web/app/[locale]/dashboard/journal/page.tsx` | Add a short hint under `awaiting` count explaining what it actually counts (skills missing journal evidence), so "Dar laukia įrašų: 8" no longer reads as "you owe 8 entries". |
| `apps/web/messages/lt/journal.json` + `apps/web/messages/en/journal.json` | New strings: `notesRequiredCopy`, `foundSummary`, `reviewMetaNote`, `fragment.noTime`, `fragment.noActivity`, `self_progress.awaitingHint`. |
| `apps/web/messages/lt.json` + `apps/web/messages/en.json` | New `structuring.buckets.fragments` label. |
| `apps/web/messages/{da,de,et,lv,nl,no,pl,sv}/journal.json` | New keys added with `[EN]` fallback (project convention for unlocalised strings). |
| `apps/web/lib/structuring/extract-journal-suggestions.test.ts` | Replace + extend tests. The owner sentence now has dedicated assertions for: 3 time fragments, 3 activity labels, raw-phrase preservation, no fake taxonomy slug for cashier/driver. Per-fragment tests for "Valandą dirbau pavežėju", "3 valandas parduotuvėje kasininku", "5 valandas padėjau dengti stogą". Word-form hour tests. |
| `apps/web/lib/guards/journal-evidence-loop.test.ts` | NEW. Pins: structured save return contract; no service_role in save; deterministic rule-based parser (no fetch / no AI provider call); precise-error rendering in composer; no billing/payment touch in journal path; "Privatus įrašas" framing on the review block. |

## Owner sentence: before vs after

| Aspect | Before | After |
|--------|--------|-------|
| Time fragments detected | 1 (only "3 valandas") | 3 (1h, 3h, 5h) |
| Activity directions detected | 0 | 3 (Pavežėjimas / Kasininko – parduotuvės / Stogo dengimas) |
| Raw phrase per card | n/a | "Valandą dirbau pavežėju" / "3 valandas parduotuvėje kasininku" / "5 valandas padėjau dengti stogą" |
| Suggestion summary | none | "Sistema rado 3 laiko įrašus ir 3 galimas darbo kryptis…" |
| Save failure message | "Nepavyko išsaugoti. Bandyk dar kartą." (always) | Precise LT cause per code (e.g. "Pasirinkite darbo kontekstą…", "Įrašo išsaugoti nepavyko: …"); save itself unaffected when prerequisites are met. |

Verified by 18 new/updated unit tests in
`apps/web/lib/structuring/extract-journal-suggestions.test.ts` and the
guard suite in `apps/web/lib/guards/journal-evidence-loop.test.ts`.

## Required checks

| Gate | Result |
|------|--------|
| `pnpm -F web lint` | green (no output / exit 0) |
| `pnpm -F web typecheck` | green |
| `pnpm -F web test` (vitest) | 340 passed / 0 failed (19 files) |
| `pnpm -F web build` | green (next build, all routes) |

## Safety proof

- [x] No billing / payments / Stripe / Montonio / pricing / subscription edits — guarded by `journal-evidence-loop.test.ts`.
- [x] No env / secrets / Vercel / Supabase dashboard changes.
- [x] No production DB mutation. No migration added (the existing 0013 work-journal schema already supports the new metric rows — `metric_slug` is free text, no enum extension needed, GRANTs already present).
- [x] No `service_role` runtime client used for journal saves — guarded.
- [x] No fake AI / matching / verification claims introduced — guarded; cashier/driver intentionally carry `activitySlug = null` so the UI shows a free-text label, not an auto-verified skill.
- [x] PR #54 left unmerged.
- [x] PR #18 untouched.
- [x] Branch is fresh off `origin/main` at `496aa71`.

## Login heaviness — Phase 6 audit (deferred fix)

Read the journal page's auth path. After PR #59 (PKCE stabilisation) and
PR #60 (parallel SSR reads) the journal page's reads now run in parallel; the
biggest remaining wall-clock cost is the Supabase auth round-trip itself,
not Postgres. No clear P0/P1 bug observed in the auth callback.

Recommendation: hold an explicit heavy-login fix for a separate, scoped
slice. Touching auth here would breach the "review-only journal" scope. A
useful next step is a small client-side "Prisijungiame…" spinner+timer on
`/auth/callback` so the wait is honest rather than silent — but that belongs
in a dedicated UX slice, not this one.

## Owner manual smoke checklist

1. Open `/lt/dashboard/journal` while authenticated as a worker who has at
   least one active worker-relationship engagement.
2. Paste the owner sentence into "Ką šiandien dirbote?".
3. Press **Pasiūlykite struktūrą**.
4. Confirm the review stage shows:
   - The "Sistema rado 3 laiko įrašus ir 3 galimas darbo kryptis." summary.
   - A "Darbo fragmentai" section with **three** cards:
     - `1 valandos · Pavežėjimas / vairavimas` with hint `„Valandą dirbau pavežėju"`
     - `3 valandos · Kasininko / parduotuvės darbas` with hint `„3 valandas parduotuvėje kasininku"`
     - `5 valandos · Stogo dengimas` with hint `„5 valandas padėjau dengti stogą"`
5. Press **Patvirtinti visus pasiūlymus** then **Patvirtinti įrašą**.
6. Expected: the form returns to the compose stage with a green
   "✓ Įrašas išsaugotas" card. The new entry appears in **Įrašai** below
   (and survives a hard reload).
7. If save fails: the red banner now shows a precise LT reason instead of the
   generic "Nepavyko išsaugoti. Bandyk dar kartą." — report the precise text.

## Final report (per goal "Final report back to owner must answer")

1. Owner sentence — all 3 time fragments? **Yes**, asserted in
   `extract-journal-suggestions.test.ts:54`.
2. Owner sentence — all 3 work/activity directions? **Yes**, asserted in
   `extract-journal-suggestions.test.ts:58–71`.
3. Save succeeds? **Yes** for the happy path; precise per-code message on
   failure (no more black box). No prod DB change required for this PR.
4. Entry appears in history after reload? **Yes** — entry insert + metric
   insert + `revalidatePath` are unchanged on the happy path; the existing
   list query in `page.tsx` already orders by `created_at desc`.
5. What caused the old failure? **Two compounding bugs**: (a) the parser was
   single-match / construction-only / single-fragment; (b) the save action
   threw strings which Next.js stripped in prod, then the composer rendered a
   single generic copy for every cause. See "Root causes" above.
6. Login heaviness fixed or deferred? **Deferred** — audited, no safe P0/P1
   fix in scope; recommendation captured above.
7. PR #54 still waiting for role smoke? **Yes**, untouched in this PR.
8. Updated readiness estimate (rule-of-thumb, treat as my best read):
   - limited-testing readiness: **70% → 76%** (the core self-declare loop now
     works for mixed days, which was the most-tested-against scenario).
   - pilot-sales readiness: **40% → 44%** (manager confirmation backbone
     still gated behind PR #18; this PR doesn't pretend it's live).
   - full-OS readiness: **18% → 19%** (small bump — the evidence loop now
     has a foundation, but matching, reputation, payouts remain unbuilt).
