# Language Audit v1 — LT / EN

Branch: `feat/language-feedback-and-lt-en-audit-v1`
Base: `origin/main` @ `706a98f` (PR #64 merged)
Date: 2026-05-25

This is the first structured pass over the user-facing copy. Scope: top
two locales (LT + EN). Routes covered: landing, login, onboarding,
dashboard, profile, journal, account, company/agency/buyer dashboards.

The audit was done by reading the relevant blocks in
`apps/web/messages/{lt,en}.json` + the per-route JSON in
`apps/web/messages/{lt,en}/*.json`. **Two artifacts ship in this PR:**
this audit doc (findings) and the **language-feedback widget + admin
inbox** (so live testers can flag everything we missed below).

Severity scale:
- **HIGH** — worker / pilot tester can't understand what to do next.
- **MEDIUM** — sounds off, inconsistent register, confuses the role mental model.
- **LOW** — typo, formatting, polish.

## Findings + this-PR inline fixes

### 1. Dashboard worker "wow" panel (LT) — HIGH

`auth.dashboard.wow.*` (root `lt.json`, lines ~705–757) shipped without any
LT diacritics — `jusu` instead of `jūsų`, `pradzios` instead of `pradžios`,
`taskas` instead of `taškas`, `Veliau galesite prideti` instead of `Vėliau
galėsite pridėti`, ~50 missing characters across the whole block. A worker
landing on the dashboard for the first time reads broken LT and concludes
the product doesn't care about Lithuanian speakers.

**Fixed in this PR.** Diff covers `startingPoint`, `nextSteps.*`, `identity`,
`journal`, `addMore`, `activity`, `pilot` subkeys. All other LT blocks on
the page already had correct diacritics, so this was a single slipped block.

### 2. Landing hero phrasing (LT) — MEDIUM

`hero.title` = "Gyva darbo rinkos valdymo sistema" reads like a corporate
department name. Better: "Gyva darbo rinka. Tikri žmonės. Atitikimas
realiu laiku." or similar — split into 2–3 short lines.

**Not fixed this PR.** Hero is design-sensitive; needs the marketing layer
to weigh in.

### 3. Nav.company ambiguity (LT/EN) — MEDIUM

`nav.company` = `"Apie mus"` (LT) / `"Company"` (EN) sits next to product
nav items but reads as a footer-style "about us". Confuses the navigation
hierarchy. Suggested: `"Apie platformą"` / `"About the platform"` and
keep `"Apie mus"` for footer only.

**Not fixed this PR.** Touches the nav surface; leave for a small UX slice.

### 4. Auth signup role label (LT) — MEDIUM

`auth.signup.role.freelancer` = "Laisvai samdomas" is passive and reads
weird. Parallel structure with the other role labels ("Darbuotojas",
"Įmonė", "Agentūra") would be "Laisvai dirbu" or "Laisvo samdinimo darbas".

**Not fixed this PR.** Role taxonomy is referenced in many places —
needs an audit of all role-label consumers first.

### 5. Onboarding rolePicker emoji (EN) — MEDIUM

`auth.onboarding.rolePicker.infoBox` carries a 💡 emoji in user-facing
copy. Project tone is otherwise sober (construction + pilot). Either
remove the emoji or replace with a visual marker that doesn't read as
"slack-style chat".

**Not fixed this PR.** Cross-locale change; coordinate with design.

### 6. Journal prompt tone (LT) — LOW

`journal.prompt.tiler` uses informal "Aprašyk" (singular `tu` form). The
rest of the journal copy uses formal `jūs` plural (`Aprašykite`,
`Pasiūlykite`, `Patvirtinkite`). The mismatch is visible to LT speakers.

**Not fixed this PR.** Two-line touch; defer to v5 polish slice.

### 7. Role dashboard eyebrows (LT) — LOW

`roleDashboards.{worker,company,agency,buyer}` eyebrow labels use
ALL-CAPS LT abbreviations with inconsistent character widths
(`PIRKĖJO ERDVĖ`, etc.). Pure cosmetic — letter spacing reads off when
diacritics are involved.

**Not fixed this PR.** CSS / tracking issue more than copy issue.

### 8. Em-dash / hyphen style consistency (LT/EN) — LOW

`capabilityProfile.intro` and several `auth.dashboard.*` strings use
straight ASCII hyphen (` - `) where the rest of the project uses em-dash
(` — `). The wow-block diacritics fix above migrated several of these
to em-dashes in passing.

**Partially fixed this PR** as a side-effect of the wow-block edit.
A full style sweep is a separate slice.

## What's intentionally out of scope

- Per-route exhaustive line-by-line audit (8 routes × every key would
  inflate this PR; pilot needs the *widget* shipped so live testers can
  surface what we miss).
- EN polish beyond the items called out above. EN is canonical for
  developer-facing strings; LT is the primary user locale.
- Skill-name / profession-name taxonomies (`messages/{lt,en}/skill-names.json`
  + `professions.json`). Those are dictionary slugs, not narrative copy;
  reviewed separately when the manager-confirmation backbone (PR #18)
  lands.
- The 8 secondary locales (da/de/et/lv/nl/no/pl/sv). They're EN-fallback
  by design (per the journal sprint reports) until the pilot proves the
  product itself.

## Next-pass recommendations

1. Run the live language-feedback widget for a week before the next
   audit. The widget captures: route, locale, selected text, comment,
   user_id. Owner reviews via `/lt/dashboard/admin/language-feedback`.
2. After ~30 reports, decide which findings are "real testers got
   stuck" vs "designer didn't love the wording" — the former drives the
   v2 audit slice.
3. EN parity pass for any LT-only fixes the widget surfaces.
