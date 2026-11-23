# A2 design audit — public, student and education screens (2026-11-22)

Lane A2. Real Chromium (Playwright) against a local isolated stack: `main`
at `f65c57214`, with the local Supabase database and synthetic `QA-SYNTHETIC`
accounts. Every screen was shot at **375, 390, 768 and 1440 px**, in **LT, EN,
DE, NL, PL, RU and SV**, in **light and dark**. Owner acceptance is **not yet
confirmed by people**.

Scope, per the coordinator brief: all public screens, the student and
education-institution workspaces, and navigation consistency. Worker screens
(A) and employer and agency screens (M) are not covered. Neither are sign-up,
onboarding, job search or the CV (A).

## Evidence

- `docs/audits/evidence/a2-design-audit-2026-11-22/`
  - 192 contact sheets: `<group>-<screen>-<width>-<theme>.jpg`. Each holds
    the first screen in all 7 locales side by side, at 390 and 1440 px, light
    and dark.
  - `metrics-public.tsv`, `metrics-institution.tsv`, `metrics-student.tsv`:
    one row per shot (2,688 shots). Columns: HTTP status, page height,
    sideways scroll, number of under-44 px targets, goals on the first screen,
    AI entry visible, banned word, raw i18n keys, broken images.
- Full-page shots at all four widths (2,688 JPEGs, 330 MB) were kept in the
  session scratchpad. They are too large for the repository; the contact
  sheets and the metrics cover the same runs.
- Before/after pairs for the fixes are in
  `docs/audits/evidence/a2-public-tap-targets-2026-11-22/`.

## Screens checked

| Group | Screens | Shots |
|---|---|---|
| Public | home, about, project-cost calculator, company-need, for agencies, for companies, for workers, labour market + one country, 7 legal pages, match preview, pricing, professions, questions hub + category + one answer, skills, vision, work abroad, work opportunities, worker intake, sign-in, forgot password, unknown business profile, invalid invite, unknown address (33) | 1,848 |
| Education institution | home, learning and programmes, people, settings, history, learning and review, network, inbox, calendar (9) | 504 |
| Student | home, learning and review, network, inbox, calendar, profile (6) | 336 |

## Clean on every shot

- No sideways scroll at any width, locale or theme.
- No banned word ("demo"), no raw i18n keys, no broken images. The cookie
  page shows cookie names such as `lm.attr.first`, which are content.
- Header, type (Inter + Bricolage Grotesque) and spacing are the same in all
  7 locales. Long German, Polish and Russian headings wrap without clipping.

## Fixed (GREEN, layout only)

| PR | What |
|---|---|
| #3610 (merged) | Education workspace and Learning page. Shared `SectionHead` with icon heads; redundant subtitles removed; privacy and honesty notes moved behind `Explain`. |
| #3669 (merged) | 44 px targets: public language button; calculator step tabs; links on the about, for-companies, legal and questions pages; work abroad; 404 home button; invite self-start; cookie consent controls; network search; the shared verify-email button. |

## Remaining

### Navigation consistency (owner/design decision needed)

1. **Six goals on the first screen.**
   - Desktop (1440) shows all six.
   - Phones (375/390) show **4** plus "More options".
   - Tablets (768) show **3½** in a rail with arrows.
   - This is the approved home standard as built, so I did not change it.
     Confirm whether "six on the first screen" also binds phones and tablets.
2. **Goal navigation and three levels on signed-in pages: absent.**
   - No signed-in page measured carries the goal rail or the intent bar. That
     is still the owed inner-page goal bar.
   - An earlier attempt rendered pages twice and was reverted. It needs its
     own design pass.
3. **AI entry.**
   - Public: visible in the 1440 header ("Ask the assistant"). At 375, 390
     and 768 it is only inside the menu.
   - Signed in: the assistant is the home (`My space`, and the back arrow on
     phones). Inner pages carry no control marked as the assistant.
   - A new header icon does not fit: the phone header uses 282 of 288 px at
     320. The proposal is to mark `My space` with the assistant mark.
4. **Card rails, next card peeking on phones.** The home goal rail peeks at
   768. On phones it is a 2-column grid, so there is nothing to peek. The
   history quality-sessions rail peeks at 375/390.

### Public screens

5. The about page is long: 10,700 px at 390. Legal privacy is 9,400 px and
   data access is 12,000 px. They need content editing, not layout changes.
6. Pricing repeats "online payment is not open yet" three times on the first
   screen. That is payment copy, so it is the owner's call.
7. The work-opportunities and professions pages have no action on the phone's
   first screen.
8. Sign-in: the inline "Sign up" link is 15 px tall. It is exempt as inline
   text, and sign-up is A's area. Forgot password: "Back to sign in" is 16 px.
9. Swedish home card: "eller" hyphenates as "el-ler" in a narrow card.

### Shared or other lanes (reported, not changed)

10. M: `/company-need` and `/worker-intake` inputs are 37–40 px tall. The
    organisation settings capability checkboxes are 13 × 13. History selects
    are 37–40 px. People-page buttons are 36–40 px.
11. Calendar (`/dashboard/planning`, shared): the previous/next period buttons
    are 35–40 px wide.
12. A: profile `Open Work Journal` is 28 px tall, and a back control is 16 px.

### Not deployed or local only (marked separately)

- `/vision`: gated by `lib/config/vision-publication.ts`, so 404 is
  intended. The same holds on production.
- Unknown address: **500 locally**, a rewrite-proxy artefact of the local
  container. **Production answers 404.**
- "Market data is not available at the moment" on home: the local database
  has no vacancy import.
- A question slug is per locale, so the English slug answers 404 in the other
  six locales. This is expected.

## Method

`scratchpad/audit/run.cjs`: one context per shot, consent refused, theme set
by `localStorage.theme` plus `colorScheme`. In-page checks:
- interactive elements under 44 px, with inline links in running text and the
  skip link exempt;
- `scrollWidth > innerWidth`;
- i18n key patterns and the banned word;
- broken images;
- overflow-x rails, and whether a child is cut at the right edge;
- goal links inside the viewport;
- AI-entry visibility.

Contact sheets were reviewed by eye. Contrast was not measured automatically.
