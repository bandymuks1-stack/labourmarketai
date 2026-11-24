# The landing counts jobs the job board refuses to show — OWNER DECISION REQUIRED

**Date:** 2026-08-18
**Production:** Supabase `gorgitwvdzxbnaxhrsrw` (labourmarket.ai)
**Repo baseline:** `origin/main` @ `adb3c18b`
**Status:** **RESOLVED 2026-08-19 — owner approved; applied with corrected
floors.** See §7. The floors this document proposed (40 000+ / 7 500+) were
themselves unsound and were NOT shipped; §7 records why and what shipped
instead.

---

## 1. The finding

The landing market-proof band claims, under the eyebrow **"On the platform right
now"**:

> **41 000+** active job opportunities · **7 600+** employers · **21** regions

Those floors were derived on 2026-08-17 under the predicate
`is_active AND lifecycle = 'published'`.

The public job board — shipped one day later by #1184 / #1190 — selects on a
**different** predicate, the one in `count_public_vacancies_v1`,
`search_public_vacancy_previews_v1`, `get_public_vacancy_preview_v1` and
`list_public_vacancy_sitemap_v1`:

```sql
is_active AND (expires_at IS NULL OR expires_at > now())
```

Re-measured 2026-08-18, both bases, same moment:

| Basis | Active vacancies |
|---|---:|
| `is_active AND lifecycle='published'` — what the claim was derived from | **46,044** |
| `is_active AND (expires_at IS NULL OR expires_at > now())` — what `/jobs` shows | **40,234** |
| Rows in the first but not the second | **5,810 (14.4%)** |

**The claim is not false about the database.** On its own stated basis it is
comfortably true — 46,044 is well above 41,000. That is precisely why it passed
review and why the existing guards did not catch it: `landing-market-proof.test.ts`
checks that the *copy* matches the *module floors*, and it does.

**It is false about what a visitor can get.** Those 5,810 rows are expired ads
still flagged `is_active` with `lifecycle='published'`. The job board correctly
refuses to show them.

## 2. Why this became a defect on 2026-08-18 and was not one before

Before the job board was public, nobody outside the team could check the number.

Now `/jobs` renders `result.totalCount.toLocaleString()` — the real count, in the
visitor's face. So the sequence is:

1. Visitor lands, reads **"41 000+ active job opportunities"** under **"on the
   platform right now"**.
2. Visitor clicks through to `/jobs`.
3. Visitor sees **40,234**.

A claim a visitor can disprove in one click is not worth making, whatever the
database says. This is the honesty rule the repo already applies everywhere else,
applied to a number rather than to a feature.

## 3. The employers floor is thinner than it looks

| | |
|---|---:|
| Claimed floor | 7,600+ |
| Identified employers, browsable basis, 2026-08-18 | **7,632** |

Still true — with **32** of headroom, on a figure that moves daily. That is not a
floor, it is a countdown. (Counted by identity per
`lib/employers/employer-identity.ts`; counting `distinct employer_name` instead
gives 7,778, which overstates — see `docs/audits/employer-identity-v1.md` §5.)

**The regions claim and the top-profession ranking are both still correct.**
Re-derived on the browsable basis: 21 regions, and the ranking order is
unchanged — caregiver 4,159 · teacher 1,486 · sales_assistant 1,085 ·
warehouse_worker 946 · driver 891 · cleaner 876. No change needed there.

## 4. Why no code changed — the gate

`market-proof-band.tsx` is in `FROZEN_LANDING_FILES`, and `landing.marketProof`
sits inside the frozen `lt`/`en`/`ru` `landing` namespaces.
`landing-freeze.test.ts` says, in terms:

> "If this test fails, the change touched the landing. Revert it. Do NOT
> regenerate the baseline unless the change is part of the explicit,
> owner-approved landing plan."

The precedent is consistent: the Russian landing hero moved under **OWNER
DECISION U-15** (#1188), and the band itself was frozen under an owner-directed
landing plan. The standing session approval for *"remaining normal product and
localization copy"* is a wording approval; it is not the landing-freeze plan, and
these are different gates.

**The fix was written, validated, and then reverted rather than merged behind a
regenerated baseline.** That is the boundary, and this document is the report.

## 5. The exact change awaiting approval

One decision unblocks all of it. The change is small and fully specified:

1. **`apps/web/lib/analytics/market-coverage-claims.ts`**
   - Add `BROWSABLE_VACANCY_PREDICATE` — the job board's predicate as a value,
     not a comment.
   - Add `SWEDEN_MEASUREMENT_2026_08_18` — a dated read-back carrying its own
     basis: `activeVacancies: 40234`, `identifiedEmployers: 7632`, `regions: 21`.
   - Add `SWEDEN_COVERAGE_2026_08_18` — floors **40,000+ / 7,500+ / 21**.
     (7,500 rather than 7,600 so the floor has real headroom.)
   - Add `floorsAreSupportedBy(claim, measurement)` — a floor may never exceed
     what was measured, and may only derive from a browsable-basis read-back.
2. **`apps/web/messages/*.json`** (all 11) — `41 000+` → `40 000+`,
   `7 600+` → `7 500+`, `asOfNote` date → 2026-08-18, each in that locale's own
   separator and date format.
3. **`apps/web/lib/guards/market-coverage-claims.test.ts`** — six new
   assertions locking the correction: the measurement basis must equal the job
   board's predicate; floors must not exceed the measurement; a 41,000 floor
   must be rejected; a measurement on the old published-only basis must be
   rejected; the employers floor must keep ≥100 headroom; the read-back must
   carry a date.
4. **`apps/web/lib/guards/landing-freeze-baseline.json`** — regenerated via
   `scripts/generate-landing-freeze-baseline.ts`. **This is the gated step.**

Validated before reverting: the claim guards passed (50 tests), typecheck clean,
and the only failures across the 16,084-test suite were the two
`landing-freeze.test.ts` drift assertions — i.e. exactly and only the gate.

## 6. What the owner is being asked

> Approve regenerating the landing freeze baseline for a numbers-only
> correction: re-derive the market-proof floors on the public job board's own
> predicate, so the landing stops advertising 5,810 expired ads.

No layout, no wording beyond the three numbers and the date, no new claim, no
new surface. If the answer is instead *"fix the data, not the claim"* — i.e.
expire those 5,810 rows at import so both definitions agree — that is a
different and larger change to the ingestion lifecycle, and it should be its own
slice.


---

## 7. Resolution — 2026-08-19

### 7.1 The owner decision

> Approved: the narrow numbers-only landing correction. The public landing must
> not advertise a larger "active job opportunities" number than the user can
> actually browse on /jobs. Use the same honest BROWSABLE vacancy definition for
> the public claim and the public job board. Do not change ingestion lifecycle
> to make the marketing number larger. Do not manipulate counts. Do not weaken
> the freeze guard.

### 7.2 Re-verification found a SECOND defect this document missed

Before applying, the finding was re-measured against production
(`execute_sql`, read-only, 2026-08-19 06:14 UTC). The spot reading confirmed §1
and got worse: **39,743** browsable against **46,208** published-basis — the gap
had grown from 5,810 to **6,465** rows in a day.

That alone kills this document's proposal: it asked for a **40 000+** floor,
and one day later the browsable pool was already **below 40,000**.

So the pool was reconstructed day by day (`first_seen_at <= T AND expires_at > T`,
validated against the live count for today — 39,795 reconstructed vs 39,743
actual):

| As of | Browsable vacancies | Identified employers | Regions |
|---|---:|---:|---:|
| 2026-08-15 | 40,460 | 7,482 | 21 |
| 2026-08-16 | 40,089 | 7,416 | 21 |
| 2026-08-17 | **37,105** | **7,252** | 21 |
| 2026-08-18 | 38,181 | 7,433 | 21 |
| 2026-08-19 | 39,795 | 7,628 | 21 |

Days before 2026-08-15 predate the bulk import and carry no signal.

Two conclusions this document did not reach:

1. **The employers claim was already false, and this document did not catch
   it.** §3 called 7,600+ "still true — with 32 of headroom". Measured over a
   window instead of one moment, **"7 600+" was false on four of the last five
   days.** It was not a thin floor; it was a wrong one.
2. **A floor from a single reading is not a floor, it is a spot price.** The
   browsable pool oscillates ~8% inside a week as ads arrive and expire. Any
   floor — including this document's 40 000+ / 7 500+, both of which would have
   been false on 2026-08-17 — has to survive the **trough**, not the day it was
   measured.

### 7.3 What shipped

Floors rounded DOWN to clean steps under the five-day window lows:

| Claim | Was | Shipped | Window low | Headroom vs low | Latest reading |
|---|---:|---:|---:|---:|---:|
| Active job opportunities | 41 000+ | **35 000+** | 37,105 | 5.7% | 39,743 |
| Employers | 7 600+ | **7 000+** | 7,252 | 3.5% | 7,621 |
| Regions | 21 | 21 (unchanged) | 21 | exact | 21 |

A visitor now reads a number the job board can only *exceed*, on every day of
the measured window. The as-of date moved 2026-08-17 → 2026-08-19 in all 11
locales, each in its own separator and date format.

Files:

1. `apps/web/lib/analytics/market-coverage-claims.ts` — `BROWSABLE_VACANCY_PREDICATE`
   and `PUBLISHED_VACANCY_PREDICATE` as values rather than comments;
   `MarketMeasurement` (a dated multi-day window carrying its own basis, lows and
   latest readings); `SWEDEN_MEASUREMENT_2026_08_19`; `SWEDEN_COVERAGE_2026_08_19`;
   `SWEDEN_COVERAGE_CURRENT` / `SWEDEN_MEASUREMENT_CURRENT` as the single import
   point; `floorsAreSupportedBy` / `floorSupportFailures`. The 2026-08-17 claim is
   kept, marked superseded, and used as the guard's negative fixture.
2. `apps/web/messages/*.json` (11) — numbers and as-of date only.
3. `apps/web/lib/guards/market-coverage-claims.test.ts` — the floor-support suite
   (50 → 60 tests): measurement must be on the job board's predicate; the shipped
   floors are supported; **both** superseded floors are rejected; a published-basis
   measurement is rejected; a single-day window is rejected; a floor sitting exactly
   at the observed low is rejected (the "countdown" failure mode); the read-back must
   carry an ISO date; regions must match exactly; no floor may exceed the latest
   reading.
4. `apps/web/lib/guards/landing-market-proof.test.ts` — reads the current claim, and
   derives each locale's required as-of date from the measurement itself, so a stale
   date fails rather than passing a loose `/2026/` regex.
5. `apps/web/components/marketing/market-proof-band.tsx` — header provenance only
   (no rendered output changed).
6. `apps/web/lib/guards/landing-freeze.ts` — the regeneration recorded in
   BASELINE REGENERATIONS ON RECORD, per precedent.
7. `apps/web/lib/guards/landing-freeze-baseline.json` — regenerated under the owner
   approval. **Exactly four hashes moved**: `market-proof-band.tsx` and the three
   frozen `*.landing` namespaces (lt/en/ru). Zero other frozen artefacts — the proof
   that this stayed a numbers correction.

The freeze guard was **not** weakened: it failed first on exactly and only these four
hashes, and the baseline was regenerated rather than the assertion relaxed.

### 7.4 Validation

`pnpm -F web typecheck` clean · `pnpm -F web lint` 0 errors (29 pre-existing warnings)
· `pnpm -F web build` succeeded · full suite **972 files / 16,119 tests, all passing**.

Evidence class: **DB_PROVEN** (production read-back) + **TEST_PROVEN** (guards).
Not browser-proven — see the environment note on browser access.

### 7.5 What this does NOT fix — the follow-up

The floors are still **hardcoded strings in frozen copy**, so they go stale by
construction; this correction is the second time they have had to be re-derived by
hand. The structural fix is for the band to render `count_public_vacancies_v1` at
request time — the same source `/jobs` reads, making divergence impossible rather
than merely currently-absent. That was deliberately **not** done here: it is a
structural change to a frozen file with an explicit LCP constraint in its header
("zero data fetches at request time"), and the owner's approval was scoped to the
numbers. It should be its own slice.

The 6,465 expired-but-`is_active` rows are also still there. Expiring them at import
so both definitions agree is the ingestion-lifecycle change §6 already flagged as a
separate, larger slice. It remains open, and it is the reason the two counts can
drift again.
