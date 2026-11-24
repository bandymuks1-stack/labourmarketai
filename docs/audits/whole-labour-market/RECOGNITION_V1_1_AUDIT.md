# Recognition v1.1 + Whole Labour Market Correction — Audit

> Scope: decouple the product from construction-only framing and let the Work
> Journal help workers DISCOVER new, not-yet-declared skills. No DB migration,
> no production apply, no external AI, no fake verification.

## 1. Recognition narrowing (the v1 limit)

`components/app/journal-entry-composer.tsx` (v1) narrowed recognized skills to
ONLY those already in `workerSkillBySlug` — a recognized-but-undeclared skill
was silently dropped. That capped the journal's value to confirming what the
worker already listed.

**Fix (v1.1):** the composer now splits recognition into two groups:

- **A — already-declared** (`skillSuggestions`): unchanged path; a confirmed
  suggestion can later become work-journal-supported when the worker links it.
- **B — possible new skill** (`newSkillSuggestions`): recognized but NOT
  declared. Rendered separately ("Galimas naujas įgūdis") with an
  **"Pridėti prie profilio"** CTA.

Group B is fed by two sources, both excluding already-declared slugs:
1. construction skills the existing engine recognized but the worker hasn't
   declared (name from `skillNames` taxonomy);
2. cross-sector skills from the new sector-neutral catalogue
   (`lib/structuring/new-skill-suggestions.ts`).

Only **high/medium** confidence hits are offered for one-tap add; **low**
(fuzzy) hits fall to the manual-pick path so a weak guess never becomes a
profile claim.

## 2. Evidence safety (what "add" actually does)

"Pridėti prie profilio" calls `saveProfileSkillClaimsAction([label])`
(`lib/profile/profile-skill-claims.ts`, table `profile_skill_claims`,
migration 0015 — already in prod). A claim is always:

- `status = self_declared`
- `visibility = closed`
- `source = profile_text`

It is **never** verified, **never** manager-confirmed, and **never** linked to
the journal entry (no work-journal evidence is created). The manager/client
confirmation flow stays entirely separate. No new table, no migration, no
RLS/grant/policy change. Enforced by
`lib/guards/new-skill-suggestion-safety.test.ts`.

## 3. Sector-neutrality

- `lib/structuring/sectors.ts` already defines 11 sectors with
  `DEFAULT_SECTOR = "other"` (construction is NOT the default).
- The new catalogue spans transport/logistics, hospitality, retail, care,
  cleaning, agriculture, office/admin, IT, customer service. Construction is
  intentionally **not** duplicated there (it flows from the base engine), so
  the system now demonstrably recognizes work across the whole labour market.
- Adding a sector/skill is a one-row data change — no component edits, no
  construction special-case.

## 4. Common-misspelling map

`lib/structuring/misspellings.ts` — a tiny, hand-curated wrong→right token map
for SHORT job words the ≥6-char fuzzy tier misses (e.g. `kasinike` →
`kasininkas`). Whole-token replacement only; every value resolves to an
existing catalogue needle (can never invent a skill). Correction-derived hits
are demoted to medium confidence. False-positive guards in
`misspellings.test.ts`.

## 5. Public copy — construction-only framing

| Surface | Before | After | Guard risk |
|---|---|---|---|
| `footer.tagline` (all 11 locales) | "The living labour market **for construction** — …" | "The living labour market **across every sector** — …" | none (not pinned) |
| Hero headline/subcopy | already sector-neutral | unchanged | — |
| Homepage market sparklines | sample series behind visible `Placeholder` marker | unchanged (already honest) | — |

The footer tagline was the only **public** surface that framed the product as
construction-only. Fixed in all locales (en/lt/ru real; the 8 `[EN]`-debt
locales keep their marker, English text updated — no i18n-debt regression).

### Recommended follow-ups (not in this PR)

- `pages.workers` copy uses "trade"/"your trade" — reword to "profession/role"
  (mild, unpinned). Deferred to keep this PR focused.
- Worker-page example placeholders ("Statybos brigadininkas") could diversify
  across sectors (unpinned). Deferred.
- `pages.companies.benefits[1].title` is exact-pinned by
  `public-mechanism.test.ts` — **do not change** without updating that guard.

## 6. Labour-market statistics source registry

`docs/audits/labour-market-statistics/SOURCE_REGISTRY.md` — allowlist of
Eurostat / EURES / Cedefop / Eurofound / OECD / national statistics offices,
with the binding rule: no public number without source + date + region + last
checked. No invented claims.

## 7. What was explicitly NOT done

No production DB apply · no `db push` · no Supabase MCP migration · no fake
data · no fake verified · no manager_confirmed without real confirmation · no
work-journal evidence without an explicit worker link · no external AI/API · no
billing · no RLS/grant/policy/SECURITY DEFINER change · no full homepage
redesign · not merged without owner approval.
