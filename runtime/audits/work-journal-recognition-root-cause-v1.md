# Work Journal recognition — root-cause audit v1

**Date:** 2026-06-29 · **Branch:** `fix/work-journal-recognition-root-cause-v1`
· **Rule:** no DB/RLS/RPC/migrations; no auth; no route changes; no merge; no deploy.

Owner case (folded):

```text
vedžiojau šunį
Keičiau skaitliuką ir dažiau tvorą valandą laiko.
```

Reported symptom: the journal showed construction-heavy chips (crane operator,
cargo signalling, drawings reading, construction leadership, door/window
installation, roofing) on plainly non-construction text.

Investigation method: a throwaway probe test
(`lib/structuring/_scratch_recognition_probe.test.ts`, removed before commit)
drove the REAL UI signal source — `classifyEntryRecognition` (the composer's
tier source) plus `extractJournalSuggestions`, `recognizeUniversal`,
`buildEntrySkillReview`, `recognizeNewSkillSuggestions` — on the owner text and
the 10 required cross-sector examples, dumping their exact output.

## 1. Where journal text is entered
`components/app/journal-entry-composer.tsx` (`JournalEntryComposer`), textarea on
`app/[locale]/dashboard/journal/page.tsx`.

## 2. Where it is saved / edited
`lib/journal/*` create/supersede actions (out of scope — recognition is the bug).

## 3. Where text is parsed/extracted
`lib/structuring/extract-journal-suggestions.ts` (`extractJournalSuggestions`) →
`lib/structuring/skill-recognition.ts` (`recognizeSkills`, slugs),
`lib/profile/skill-claim-extractor.ts` (`extractProfileSkillClaims`, capabilities),
per-fragment `detectActivity` over the activity table in
`lib/structuring/keywords.ts`. The composer's tier is decided by
`lib/structuring/recognition-tiers.ts` (`classifyEntryRecognition`).
The review card uses `lib/work-entry/entry-skill-review.ts` →
`lib/structuring/universal-recognition.ts` (`recognizeUniversal`).

## 4. Where tokens become skill candidates
`recognizeSkills` matches folded text against `SKILL_HINTS_LT` (keywords.ts) +
`SKILL_SYNONYMS` (synonyms.ts) by substring `folded.includes(term)`.
`detectActivity` matches the per-fragment activity table in keywords.ts.

## 5. Where canonical/taxonomy skills are selected
`recognizeSkills` emits `{slug}` from `SKILL_HINTS_LT`/`SKILL_SYNONYMS` keys
(must exist in `messages/*/skill-names.json`).

## 6. Where fallback/default skills are added
No global construction default exists — `recognizeUniversal` and the cross-sector
catalog are object-gated. The pollution is NOT a blanket fallback; it is two
needle lists that accept the BARE noun "window"/"door" with no installation verb.

## 7. Where the UI renders chips
`WorkEntrySkillReview`, `DetectedSuggestionList`, `SimilarSkillsSection` in the
composer; per saved entry, `JournalEntrySkillLinks` (with `entry-skill-source.ts`
already collapsing stale links into a "needs review" bucket).

## 8. Selected / pending / confirmed separation
Honest and already in place: recognition output is always `status:"suggested"`,
`confirmed:false`; confirmation only via the existing claim/verify path;
`entry-skill-source.ts` separates clean evidence vs `stale_needs_review`.

## 9. `Baigta` / status-label leak
PROVEN clean: probe input `"Baigta"` and `"Baigiau darbą"` → `manual_only`,
zero skills, zero capabilities. No status word resolves to a skill chip.

## 10. CV / player-card write/read
Unchanged. Recognition never writes a confirmed skill; the player card reads the
existing verified-skills path. Out of scope and untouched.

## 11. Tests that allowed the bad behavior
No test asserted the owner's window-CLEANING case. `cross-sector-*` suites cover
many sectors but not `"tvarkiau kambarius ir valiau langus"`, so the bare-noun
window→construction mapping went unguarded.

## 12. EXACT root cause (proven)

The text→skill recognizers are NOT globally construction-biased. The probe shows
the owner's two-line case already resolves correctly (animal care, meter
maintenance, fence painting; zero construction). The real defect is narrower and
PROVEN by required-example #10:

`"tvarkiau kambarius ir valiau langus"` (tidied rooms, **cleaned** windows) →
`autoSignalSlugs:["carpentry"]` + activity `"Durų ir langų montavimas"`
(door/window **installation**) — i.e. exactly the owner's forbidden
"door/window installation" construction default.

Two needle lists accept the **bare window/door noun with no installation verb**:

- **`lib/structuring/synonyms.ts`** — `carpentry` synonyms include bare
  `"langai" / "langus" / "langu" / "duris" / "duru" / "durys" / "window" /
  "door" / "окна" / "двери"`. Any window/door noun → `carpentry` slug.
- **`lib/structuring/keywords.ts`** — activity row `"Durų ir langų montavimas"`
  needles include bare `"langus" / "langų" / "langams" / "langais" / "languose"`
  (and door equivalents, plus bare RU `"двери"/"дверей"/"оконн"`). Any window/
  door mention → "door/window installation".

So window CLEANING ("valiau langus") and any sentence containing a window/door
noun falsely resolve to construction. This is a **parser/taxonomy needle
problem** (category 12: taxonomy/default fallback), not a UI, seed, or
stale-state problem.

Secondary gap (false negative): required example #9 `"prižiūrėjau senolį"`
(elderly care) recognized nothing — the care activity row has childcare stems
but no elderly (`senel`/`senol`/`senjor`) stems.

## Fix (minimal, at source, no DB)

1. `synonyms.ts` `carpentry`: drop bare window/door nouns; keep only
   installation-verb-anchored forms (`"langų montav"`, `"durų montav"`,
   `"window install"`, `"door install"`) + `"carpentry"/"joinery"`.
2. `keywords.ts` `"Durų ir langų montavimas"`: drop bare-noun needles; keep only
   verb-anchored install phrases (`"stačiau/dėjau/montav duris/langus"`, plain
   spellings, `"durų/langų montav"`, RU `"монтаж дверей/окон"`, `"ставил окна"`).
3. `keywords.ts` `"Valymo darbai"`: ADD window-cleaning needles
   (`"valiau lang"`, `"langų valym"`, `"cleaned the window"`…) so window cleaning
   resolves to CLEANING, a correct positive.
4. `keywords.ts`: ADD an elderly-care activity row (`senjor/senel/senol` stems)
   so #9 resolves to a care direction.

Net effect: window/door INSTALLATION still recognizes when an install verb is
present; window CLEANING and bare window/door nouns no longer pull construction.
Guarded by new positive (10 cross-sector) + negative tests.
