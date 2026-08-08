# W12 — timezone consistency slice

**Base:** `main` at `a2904c11fe18ebc7c750e11ab249f7f9670f5b8e`
**Branch:** `feat/cc/w12-timezone-consistency-v1`
**Scope:** presentation only. **Zero migration.** No owner gate.
**Predecessor:** the audit in `W12_TEMPORAL_INTELLIGENCE_CURRENT_TRUTH.md` §3.5 (#1075)

---

## 1. What the audit said, and where re-deriving it from code disagreed

The audit prepared this slice with a list of **15 client surfaces** rendering in
browser-local time. Re-deriving the list before editing found the headline
defect real but the inventory materially incomplete, and one of its
supporting claims wrong. All four corrections below are load-bearing — each one
is a surface that would still have been broken after doing exactly what the
audit specified.

### 1.1 "15 client surfaces" — 7 are client, 8 are server

Of the 15 files named, only **7** are client components. The other 8 are React
Server Components, where the ambient zone is the **server process**, not the
viewer's browser.

That distinction changes the defect, not the fix:

| | ambient zone is | today | risk |
|---|---|---|---|
| 7 client files | the VIEWER's browser | **actively wrong** for any non-UTC viewer | the reported defect |
| 8 server files | the SERVER process | UTC on Vercel, so accidentally right | latent — one non-UTC runtime away |

The server half was never "browser-local" and could not produce the
audit's own worked example. It still had to be pinned: nothing in the repo
asserts the deploy runtime is UTC, so its correctness was an unowned
coincidence.

### 1.2 Seven files the audit did not list

`communication/page` · `communication/[conversationId]/page` ·
`admin/telemetry/page` · `admin/support/page` · `admin/language-feedback/page` ·
`worker-instruction-card` · `lib/conversation/profile-summary`

### 1.3 The "only call with no locale" claim is wrong — there were two

The audit's §3.5.2 calls `handover-passport-panel.tsx:154` *"the only such call
in the codebase"*. `components/app/worker-instruction-card.tsx:64` was a second
one: `new Date(instruction.createdAt).toLocaleString()` — no locale **and** no
timezone, in a client component, on a surface a worker reads. It is strictly
the worse of the two, because it renders a date **and** a time.

The audit also predicted the handover fix would need a prop thread-through
because the component "has no `locale` in scope". It is a client component, so
`useLocale()` from `next-intl` was in scope the whole time — the same one-line
pattern `cv-engagement-cards.tsx` already used. Both fixes are one hook call.

### 1.4 A whole second class was uncounted: 16 unpinned `Intl.DateTimeFormat`

The audit scanned for `toLocale*`. It did not scan for the other way to format
a date, which is more common in this repo and equally ambient:

- **all five formatters on `/dashboard/planning`** — the canonical W12 surface.
  The page computes a correct UTC instant (`utc(dayIso)`) and then formats it
  with an unpinned formatter, so on a negative-offset runtime every day label,
  month header and weekday strip renders **one day early**;
- `company/planning` (2), `assist`, `finance`, `opportunities`, `tasks`;
- the three `components/intelligence/*` cards;
- **two in `lib/player-card/labels.ts`** — a file §3.5 lists among the five
  server formatters that "pin it explicitly". Three of its formatters do; the
  inline calls at `:90` (`availabilityFrom`) and `:140` (`latestEvidenceValue`)
  do not. `:140` sits three lines below a UTC-pinned `dateFmt` doing the same
  job.

### 1.5 Day KEYS and day LABELS were derived in different zones

A surface that groups by day computes the date twice — once for the group key,
once for the header label. Two surfaces disagreed with themselves:

- **`dashboard/journal/page.tsx`** built `isoDayOf` from `getFullYear()` /
  `getMonth()` / `getDate()` (ambient) but rendered the day chip with
  `new Date(g.isoKey)` — which parses `YYYY-MM-DD` as **UTC** midnight — and
  then formatted it ambiently. So the key was one zone, the chip another. That
  key is also the `?date=` navigation value, which the planning projection
  resolves in **UTC** — this is the exact mechanism behind the audit's
  "agenda says the 7th, journal says the 8th".
  A comment above it justified the ambient derivation on the grounds that it
  matched the ambient label. Both moved to UTC together.
- **`dashboard/inbox/quick/page.tsx`** filtered "confirm all of today" with
  `toDateString()` (ambient), so the batch could include or exclude an entry
  whose printed date said otherwise.

### 1.6 Corrected totals

| | audit | actual |
|---|---|---|
| files with an ambient date call | 15 | **22** |
| — of which client components | 15 | 7 |
| — of which server components | 0 | 15 |
| individual `toLocale*` call sites | not counted | **32** |
| unpinned `Intl.DateTimeFormat` sites | 0 | **16** |
| locale-less calls | 1 | **2** |
| ambient day-grouping keys | 0 | **2** |
| **files changed** | — | **31** + 1 new module |

Three `.toLocaleString()` calls on **numbers** (`admin/page`,
`admin-launch-board`, `market-counters`) are digit grouping, not a timezone
decision. They were left alone and the guard deliberately still allows them.

---

## 2. The before model

```
storage ─── UTC ──→ canonical projection (planning-model.ts, UTC string math)
                          │
                          ├─→ 5 server formatters   pin timeZone:"UTC"   ✔ agreed
                          ├─→ 16 Intl.DateTimeFormat  no timeZone        ✘ ambient
                          └─→ 32 toLocale* calls      no timeZone        ✘ ambient
```

The projection was right and always had been. Every disagreement was one
missing option, in two spellings.

---

## 3. The formatter

`apps/web/lib/time/display.ts` — pure, dependency-free, importable from both
server and client components.

| export | replaces |
|---|---|
| `formatUtcDate(value, locale, opts?)` | `new Date(x).toLocaleDateString(locale)` |
| `formatUtcDateTime(value, locale, opts?)` | `new Date(x).toLocaleString(locale)` |
| `formatUtcDateRange(start, end, locale, opts?)` | ad-hoc `a – b` concatenation |
| `createUtcFormatter(locale, opts?)` | `new Intl.DateTimeFormat(locale, opts)` |
| `utcDayKey(value)` / `utcTodayKey(now?)` | ambient `YYYY-MM-DD` derivation |
| `toUtcDate(value)` | `new Date(x)` where a date-only string is possible |

Design decisions that matter:

1. **The zone cannot be overridden.** `{ ...options, timeZone: DISPLAY_TIME_ZONE }`
   spreads the caller's options *first*, so passing `timeZone: "America/New_York"`
   is silently ignored rather than honoured. There is no call shape that formats
   in another zone. (Asserted by a guard test.)
2. **Date-only strings are normalised explicitly.** ECMA-262 parses
   `"2026-08-07"` as UTC midnight but `"2026-08-07T00:00:00"` as *local* — a
   silent up-to-one-day disagreement between two shapes that look alike. The
   module appends `T00:00:00Z` to the date-only shape rather than relying on
   that asymmetry.
3. **Defaults reproduce the old output exactly.** `DATE_DEFAULTS` and
   `DATE_TIME_DEFAULTS` spell out what `toLocaleDateString()` /
   `toLocaleString()` produce with no options (the latter including seconds),
   so the migration changes the timezone and nothing else.
4. **Null-safe, returning `string | null`.** Absent or unparseable input renders
   as nothing, never `"Invalid Date"`, never a throw. Call sites that
   interpolate into a translated string use `?? ""`; the ones that already had
   an empty state kept it.
5. **Deterministic across server and client**, because the zone is fixed and
   the locale is explicit — which is what keeps hydration quiet.
6. Formatter instances are cached by `(locale, resolved options)`.

**The model is unchanged.** UTC → UTC. No user timezone, no organisation
timezone, no travel-time zone. Introducing any of those is an owner decision
and is not proposed here.

---

## 4. Migrated surfaces (31 files)

**Client (7)** — the actively-wrong half:
`capability-profile-section` · `cv-engagement-cards` · `handover-passport-panel`
(+`useLocale`) · `invitation-list` · `journal-inbox-entry` ·
`quick-confirm-batch` · `quick-confirm-card` · `worker-instruction-card`
(+`useLocale`)

**Server pages (16)**: `cv/page` · `invite/[token]/page` · `dashboard/assist` ·
`dashboard/communication` (+`[conversationId]`) · `dashboard/company/planning` ·
`dashboard/finance` · `dashboard/inbox/quick` · `dashboard/inbox/report` ·
`dashboard/journal` · `dashboard/opportunities` · `dashboard/planning` ·
`dashboard/tasks` · `admin/language-feedback` · `admin/pilots/[id]` ·
`admin/support` · `admin/telemetry`

**Server components / libs (8)**: `manager-evidence-card` ·
`profile-hub-overview` · `worker-readiness-summary` ·
`intelligence/explainability-drawer` · `intelligence/intelligence-card` ·
`intelligence/intelligence-timeline` · `lib/conversation/profile-summary` ·
`lib/player-card/labels`

Classification of what each site renders: **DATE_ONLY** 26 · **DATE_TIME** 6 ·
**RANGE** 1 (`cv/page` engagement start–end, still assembled from two
independently-nullable ends, so an open range stays open) · **RELATIVE** 2
(`profile-hub-overview` today/yesterday, `inbox/quick` "today") — the relative
ones now compute their comparison key with `utcDayKey`/`utcTodayKey`.

---

## 5. The guard

`apps/web/lib/guards/w12-utc-time-presentation.test.ts` — 47 assertions.

Bans, over `app/` + `components/` + `lib/` with comments blanked (so a comment
that *names* a banned call, as the module's own doc does, is not a false hit):

- `toLocaleDateString(` / `toLocaleTimeString(` anywhere outside the module;
- `new Date(…).toLocaleString(`, and any `.toLocaleString(` **with an
  argument** — number grouping is always the bare no-arg call, so this
  separates the two without a type checker;
- `.toDateString(`;
- any `new Intl.DateTimeFormat(` whose options lack `timeZone: "UTC"` (a
  10-line window, so multi-line option objects are read correctly).

Pins, positively:

- the module's zone is `UTC` and `timeZone` is forced **after** the spread;
- the three grouping surfaces derive keys with `utcDayKey` / `utcTodayKey`;
- **32 named surfaces** still import `@/lib/time/display`, so deleting the
  import fails with the surface's own name rather than only in the generic scan;
- every `formatUtcDate*` call passes a locale — the handover-passport defect
  cannot come back in a new spelling.

The exemption for a hand-written `timeZone: "UTC"` exists so the four
pre-existing server formatters that already did the right thing
(`calendar-result`, `agenda-summary`, `structured-public`, `ai-workspace/workflows`)
did not need churning. New code should use the module.

**The guard was proven to fail.** Reintroducing the original call in
`quick-confirm-card.tsx` turned it red with the exact `file:line`; restoring the
fix turned it green.

---

## 6. Browser proof — forced non-UTC timezone

`scripts/w12-timezone-browser-proof.mjs`. Real Chromium, real
`timezoneId` override, the **actual** `lib/time/display.ts` source bundled and
executed in-page. No dev server, no database, no credentials — runnable on any
checkout.

Row under test: **`2026-08-07T23:30:00Z`** — the audit's own example.

| browser zone | offset | viewport | ambient (old) call | canonical | day key |
|---|---|---|---|---|---|
| UTC | 0 | 1440×900 / 375×812 | day **7** | `8/7/2026` | `2026-08-07` |
| Europe/Vilnius | +3 | 1440×900 / 375×812 | day **8** ✘ | `8/7/2026` | `2026-08-07` |
| America/New_York | −4 | 1440×900 / 375×812 | day **7** | `8/7/2026` | `2026-08-07` |

Asserted, all green:

- **the control fires** — the ambient call renders **2 distinct days** across
  zones (7 and 8). Without this, "our output did not change" would be satisfied
  by an override that never took effect;
- each context reports the zone it was given (`resolvedOptions().timeZone`);
- canonical output is **byte-identical** across 3 zones × 2 viewports × 5 active
  locales, for date, date-time, date-only input and day key;
- the rendered day is the **7th** everywhere;
- zero console errors, zero page errors.

Locale still varies as it should — `lt 2026-08-07` · `en 8/7/2026` ·
`ru 07.08.2026` · `nl 7-8-2026` · `de 7.8.2026` — so the zone is pinned without
flattening localization.

Evidence: `docs/audits/evidence/w12-timezone/` — 6 screenshots +
`w12-timezone-proof.json`.

### 6.1 What this proof does NOT cover — stated plainly

It does **not** show the 8 client components rendering real rows under a forced
timezone in a browser. This worktree has no `.env.local`; the surfaces are
authenticated and data-backed, and provisioning credentials is an owner gate
(§4 of `CLAUDE.md`). No screenshot of an authenticated W12 surface was produced,
and none is claimed.

What stands in for it: the formatter is a **single chokepoint**, proven
zone-independent in real Chromium; the guard proves all 32 surfaces route
through it and no raw call survives anywhere; typecheck and 14,257 unit tests
pass. That is a complete chain from "every surface" to "UTC output" without a
per-surface photograph — but it is an argument, not a photograph, and it is
recorded as such. A per-surface run remains available to any session with local
credentials.

---

## 7. Tests

`apps/web/lib/time/display.test.ts` — 72 assertions.

Every claim is re-asserted under **UTC**, **Europe/Vilnius** and
**America/New_York** via `process.env.TZ`, across all five active locales
(`lt` `en` `ru` `nl` `de`):

boundaries 00:00Z / 00:30Z / 23:30Z / 23:59:59Z · EU DST transition 2026-03-29 ·
US DST transition 2026-03-08 · date-only vs date-time input · `null` /
`undefined` / `""` / whitespace / `"not-a-date"` / `NaN` / an invalid `Date` ·
range with one open end · `utcDayKey` round-tripping through `formatUtcDate` ·
a caller's `timeZone` being overridden.

The suite carries its own **control**: `ambient formatting DOES shift the day
across zones` asserts the rig actually changes the ambient zone. If Node ever
stops honouring a runtime `TZ` change, that control fails loudly instead of
every other test passing vacuously.

Locale-sensitive assertions compare the day **number**, because `{day:"numeric"}`
legitimately renders `"07"` in `lt` and `"7."` in `de` — the first draft of this
suite failed on exactly that, and the padding was the test's bug, not the code's.

---

## 8. Remaining timezone debt (not addressed here, deliberately)

| Item | Why it was left |
|---|---|
| `conversation-chat.tsx:111 todayIso()` | Client-local "what day is it for me now", feeding the work-log extractor. A worker logging at 01:00 local means *their* today. Moving it to UTC would change extraction semantics, which is a **product** question, not a presentation one. Flagged, not touched. |
| `site-footer.tsx:144` copyright year | Ambient `getFullYear()`. Cosmetic, wrong only for a few hours each New Year. |
| 4 hand-pinned server formatters | Correct today via explicit `timeZone: "UTC"`; allowed by the guard. Migrating them to the module is cosmetic. |
| No user timezone preference | Not in the schema. **Owner decision.** |
| No organisation timezone | Not in the schema. **Owner decision.** |
| Travel-time zone intelligence | Future; needs a source with no model yet. |
| Booking `coalesce(expected_end_date, start_date)` | Unrelated to presentation; capability half owner-gated (W7 P2-1). |

---

## 9. Validation

| Check | Result |
|---|---|
| `pnpm -C apps/web typecheck` | **pass** |
| `pnpm -C apps/web lint` | **0 errors** (24 pre-existing warnings, none in touched files) |
| `vitest run` (full) | **871 files / 14,257 tests pass** |
| new formatter suite | 72/72 |
| new guard | 47/47 |
| guard negative control | fails on reintroduced violation, green when restored |
| browser proof, 3 zones × 2 viewports | pass, control fires |
| migrations introduced | **0** |
| hydration / console errors | none observed |

---

## 10. Verdict

`W12_TIMEZONE_PRESENTATION_CONSISTENT__UTC_PINNED_AND_GUARDED`

The presentation layer now agrees with the storage and projection model that
was already correct. The second time truth §3.5.1 identified in **presentation**
is closed — at a larger scope than the audit scoped it, because the inventory
was incomplete in four separate ways.

**Not claimed:** that W12 is done. Its remaining blockers are unchanged —
seven unmodelled calendar sources, open-ended booking semantics (owner-gated),
booking→engagement org resolution (#1047, owner-gated), and a production race
that stays unexercised while prod holds zero bookings. This slice touched none
of them.
