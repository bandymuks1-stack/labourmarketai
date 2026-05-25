# Journal Evidence-Loop v4 — Report

Branch: `fix/journal-v4-readable-durations-edit-clarify`
Base: `origin/main` @ `a49fecc` (PR #63 merged; 0017 + 0018 already applied on prod)
Date: 2026-05-25

## What v4 ships (polish only)

v3 shipped extraction + correction lifecycle DB primitives. v4 closes the
remaining trust gaps the worker actually hits in the UI:

1. **Human-readable durations** everywhere. The composer canonicalises
   compound LT times to total minutes so the math is precise (e.g.
   "valandą dvidešimt minučių" = 80). Surfacing `80 minutes` to the
   worker is hostile. New `formatDuration(value, unitSlug, locale)`
   returns `"1 val. 20 min."` / `"3 val. 15 min."` (LT) or
   `"1 h 20 min"` / `"3 h 15 min"` (EN). Applied in fragment cards and
   in the entries-list `quantity` display.

2. **Fragment-to-time pairing fix.** Pre-v4 the parser split
   "Dvi valandas ir penkiolika minučių glaiščiau sienas" into TWO
   fragments (`2h` + `15min + glaistymas`) — wrong; the worker meant
   one 2h15min wall-plastering block. v4 adds
   `mergeContinuationFragments`: when fragment N is purely a duration
   descriptor (every word is number / valand* / minu[čt]* / dien* /
   "su" / "puse") AND fragment N+1 carries the activity, they're
   merged into one card with the combined time (`addTimes` normalises
   to minutes for sub-hour parts).

3. **Real "Redaguoti įrašą" before external confirmation.**
   - New `supersedeJournalEntry(oldEntryId, formData)` server action
     calling the `journal_entry_supersede` RPC from 0018.
   - Entries list shows an **Edit** link alongside Delete, visible only
     when the entry has zero confirmations.
   - Edit link routes to `/lt/dashboard/journal?editing=<id>#journal-composer`.
   - Page reads the query param, looks up the entry (rejects confirmed
     entries silently), and passes `{ id, originalText }` to the composer.
   - Composer opens with the textarea prefilled, shows an edit-mode
     banner ("Redaguojate jau išsaugotą įrašą… „Atnaujinti įrašą"
     senas variantas bus pakeistas") with a cancel link, and the save
     CTA reads "Atnaujinti įrašą". Save routes through the supersede
     action (RPC chooses transparent-replace vs correction-request
     internally based on `journal_entry_confirmations` count).

4. **Stronger unknown-phrase clarify prompt.**
   - The Confirm tap on an unknown fragment WITHOUT a typed label
     refuses to flip the status to `confirmed` — it stays `pending`,
     and an inline LT prompt ("Įveskite trumpą etiketę, kad
     galėtumėte šį fragmentą patvirtinti…") appears under the input.
   - Above the Save CTA, a banner counts unresolved unknowns
     ("{count} fragmentas (-ai) dar be paaiškinimo. Galite išsaugoti
     įrašą ir taip, bet etiketę pridėjus žmogus, žiūrėdamas šį įrašą
     vėliau, supras kontekstą"). Save stays enabled (worker can ship
     without clarifying) but they can't miss the prompt.

## Files

| Path | Change |
|------|--------|
| `apps/web/lib/journal/format-duration.ts` | **NEW.** `formatDuration(value, unitSlug, locale, opts)`. LT / EN locale-aware. Splits compound times (`195 min` → `"3 val. 15 min."`), keeps whole hours clean (`5 val.` not `5 val. 0 min.`), respects `splitFractions: false` opt-out, handles days, gracefully degrades for unknown units. |
| `apps/web/lib/journal/format-duration.test.ts` | **NEW.** 15 tests across LT + EN + edge cases. |
| `apps/web/lib/journal/actions.ts` | New `supersedeJournalEntry(oldEntryId, formData)` server action calling `journal_entry_supersede` RPC. Shares FormData contract with `createJournalEntry`. Pre-validates `unit_slug`. Extracted `buildMetricsForSave(...)` helper so both code paths produce identical metric rows. |
| `apps/web/components/app/journal-entry-composer.tsx` | Accepts `editingEntry` prop. Submit routes through `supersedeJournalEntry` when set. Fragment cards now render `formatDuration(value, unit, locale)` instead of raw `value + unit`. `setFragmentStatus` refuses to flip an unknown fragment to confirmed without a `userLabel`. New inline clarify prompt + unresolved-unknowns banner. New `JournalEditingEntry` type export. |
| `apps/web/components/app/journal-entry-row.tsx` | New **Edit** link alongside Delete (visible only when `canDelete=true`). Routes to `/<locale>/dashboard/journal?editing=<id>#journal-composer`. |
| `apps/web/app/[locale]/dashboard/journal/page.tsx` | Reads `searchParams.editing`, resolves the entry from the filtered list, passes it to `<JournalEntryComposer editingEntry={...}/>` (only when the entry exists AND has zero confirmations). New `#journal-composer` anchor target. Entries-list `area` cell uses `formatDuration` for time-class units, falls back to the legacy locale-aware unit label for area/count/mass units. |
| `apps/web/lib/structuring/extract-journal-suggestions.ts` | New `isTimeOnlyFragment(raw)` heuristic + `addTimes(a, b)` + `mergeContinuationFragments(fragments)` post-pass. The owner's v3 multi-fragment sentence still produces 5 fragments (each has its own activity, nothing to merge). |
| `apps/web/lib/structuring/extract-journal-suggestions.test.ts` | 5 new tests: merge of `Dvi valandas ir penkiolika minučių glaiščiau sienas` → 1 card (135 min + glaistymas); merge with `Valandą su puse + 15min žirgų priežiūra` → 105 min; no merge when leading clause already has an activity; standalone time-only fragment stays as unknown. The pre-existing v2 test for `"Dvi valandas ir penkiolika minučių rengiau projektą"` was updated to expect 1 merged fragment (the previous "2 fragments" expectation is now semantically wrong). |
| `apps/web/lib/guards/journal-evidence-loop.test.ts` | New guards: `supersedeJournalEntry` exists + calls `journal_entry_supersede` RPC; composer accepts `editingEntry` and routes submit through supersede; setter refuses to confirm unknown without label; unresolved-unknowns banner is present. |
| `apps/web/messages/{lt,en}/journal.json` | New copy: `entry.edit`, `editEntryTitle`, `editEntryBanner`, `editEntryCancel`, `updateEntry`, `fragment.unknownClarifyPrompt`, `fragment.unresolvedUnknownsBanner`. |

## Owner-visible before vs after

| | Before | After |
|---|---|---|
| Fragment card duration | `80 minutes` / `195 minutes` | `1 val. 20 min.` / `3 val. 15 min.` (LT) |
| Entries-list `quantity` display | `195 minutes` | `3 val. 15 min.` (LT) / `3 h 15 min` (EN) for time units; legacy label kept for m²/pieces/kg |
| `Dvi valandas ir penkiolika minučių glaiščiau sienas` | 2 fragments (1 unknown, 1 wall plastering) | **1 fragment, 135 min + Sienų glaistymas / lyginimas** |
| Editing an unconfirmed entry | not exposed in UI | **Edit link in entries list → composer opens prefilled with banner + "Atnaujinti įrašą" CTA → supersede RPC replaces transparently** |
| Editing a confirmed entry | not exposed | not exposed (URL trick to `?editing=<confirmed-id>` is rejected silently — RPC would refuse anyway) |
| Confirming an unknown fragment without a label | silently flipped to confirmed | **stays pending; inline LT prompt appears under the input** |
| Saving with unresolved unknowns | nothing visible | **prominent banner above Save with the count** |

All asserted by 14 new tests (`format-duration.test.ts` + parser merge cases + composer wiring guards).

## Required checks

| Gate | Result |
|------|--------|
| `pnpm -F web lint` | green |
| `pnpm -F web typecheck` | green |
| `pnpm -F web test` (vitest) | **418 / 418** passed (22 files) |
| `pnpm -F web build` | green |

## Safety proof

- [x] **No new migration.** Re-uses 0017's `create_journal_entry_full` + 0018's `journal_entry_supersede` / `journal_entry_soft_delete` RPCs already applied to prod.
- [x] No billing / payments / Stripe / Montonio / pricing edits.
- [x] No env / secrets / Vercel / Supabase dashboard changes.
- [x] No `service_role` runtime client.
- [x] No fake AI / matching / verification claims. Unknown-phrase rows still carry `source='worker_input'`; merged fragments inherit the same labelling semantics.
- [x] **PR #54 remains unmerged.**
- [x] **PR #18 remains untouched.**
- [x] Branch is fresh off `origin/main` at `a49fecc`.

## Owner manual smoke checklist

1. Open `/lt/dashboard/journal`.
2. Paste a known-working v3 sentence (anything from the v3 report). Each fragment card now reads `1 val. 20 min.` / `3 val. 15 min.` style; no more raw minute counts.
3. Save it. The entries-list row reads `3 val. 15 min.` (LT) for time-class units.
4. On a saved unconfirmed entry, click **Redaguoti įrašą**. The composer opens with the textarea prefilled + a blue banner "Redaguojate jau išsaugotą įrašą…". The Save button reads "Atnaujinti įrašą".
5. Edit the text → **Pasiūlykite struktūrą** → confirm → **Atnaujinti įrašą**. The new entry replaces the old in the list (the old row is soft-superseded; visible only via direct DB query). Hard reload survives.
6. Paste a sentence with an unknown duration ("Dvi valandas svorį kilnojau pajūryje."). Try to **confirm** the resulting unknown card without typing — nothing happens, the LT prompt "Įveskite trumpą etiketę…" appears. Type a label, confirm, save. The banner above Save also counts unresolved unknowns until the label is typed.
7. Paste `Dvi valandas ir penkiolika minučių glaiščiau sienas.` and verify **one** fragment card appears reading `2 val. 15 min. · Sienų glaistymas / lyginimas` (not two).

## Out of scope (intentionally)

- Edit / version-history viewer (the supersede chain already exists in DB via `superseded_by`; surfacing the chain in the UI is a follow-up).
- Skill-claim edit UI surface polish (`profile_skill_claims` already editable via standard RLS).
- Manager / client confirmation backbone (PR #18) remains draft.
- PR #54 pilot draft flows still wait on owner role smoke.
