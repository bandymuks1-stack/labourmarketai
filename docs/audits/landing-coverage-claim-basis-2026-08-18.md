# The landing counts jobs the job board refuses to show — OWNER DECISION REQUIRED

**Date:** 2026-08-18
**Production:** Supabase `gorgitwvdzxbnaxhrsrw` (labourmarket.ai)
**Repo baseline:** `origin/main` @ `adb3c18b`
**Status:** **BLOCKED — landing freeze is an owner gate.** No code changed.

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
