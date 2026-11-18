# Historical date correction v1 (function 2.28): evidence only, NOT applied

**Status: HELD. Owner decision 2026-10-14, option C: hold all 165 dates and correct none.**
Nothing in this folder is a migration, and nothing here may be executed against any database.
The original records stay exactly as imported. Effective totals: 2 944 records, 29 645.5 h, 43 people.

| File | What it is | sha256 of the original bytes (below the header marker) |
|---|---|---|
| `historical_date_correction_v1.sql` | the held correction (was `supabase/migrations/20261118100000_historical_date_correction_v1.sql`) | `f59707090b0d176c1f63ffe3f44cfb610136858dd4aa22d675fca46728a0ca28` |
| `historical_date_correction_v1.down.sql` | its rollback (was `supabase/rollbacks/20261118100000_historical_date_correction_v1.down.sql`) | `ddaeb18ea7afbea0b45d2500a269a4232c65793381f848f3fafb270445c60fa1` |

Each file starts with a NOT-APPLIED header. Everything below its marker line is the reviewed SQL, byte for byte.
`apps/web/lib/guards/historical-date-correction.test.ts` pins both hashes, the TypeScript/SQL hash parity
from the production dry run, and the fact that no migration or rollback for this correction exists.

## Any future correction

It needs a new, separately approved proposal:

1. a fresh migration under `supabase/migrations/` (new §16 timestamp) with its own rollback;
2. the owner's approval of that exact file;
3. a new read-only production dry run;
4. RED-class review (draft PR, `needs-human-gate`).

These files must not be copied back into `supabase/migrations/` as they are.

## The rule that was evaluated

The weekly timesheet files were copied from a template whose day labels were never updated, so the import
piled different weeks onto a few dates: 240 records on 35 person-days carry more than 16 h. The earlier
figure "242" could not be reproduced. Every reading of the rule gives 240 records and 35 person-days.

A record was treated as unambiguous (165 records) only when all of these held:

- the file week equals the sheet's own week cell;
- the weekday is stated;
- the week lies in the month folder;
- after the move, the person's ISO-week hours equal that person's weekly total in `Darbuotojai_savaite`;
- no day goes above 16 h.

Under that rule, the reconstructed date is the ISO date of (year, file week, weekday).
The other records were left alone: 12 probable, 26 already correct and 37 unresolved.

The correction was designed as the canonical INSERT-only correction, the same one `correctRecord` /
`buildCorrection` writes. It added a correcting record, a `corrected` event and an `audit_logs` row, and it
never edited an original. It aborted on any mismatch: a failed source re-derivation, a changed original,
changed effective totals, or a corrected record on a day above 16 h.

## Production dry run (2026-10-14, raised and rolled back, nothing persisted)

```
DRYRUN_OK effective 2944 / 29645.50 / 43
sample 016709b4… fp ab9d1f13…d584 hash 96f3d523…6c8b   (== TypeScript writer)
```

Expected effect, had it been applied (read-only simulation):

| Measure | Value |
|---|---|
| Hours | 29 645.50, unchanged |
| Person-days above 16 h | 35 → 18 |
| Projects with a changed documented period | 7 of 85 |
| People gaining distinct workdays | 4 (+164 in total) |

## Why it was held: the shift check

The 165 shifts are all whole weeks, and every one keeps its weekday. All 165 original dates sit in
2023-02…2023-04. The proposed dates spread over 2023-02…2023-10.

| Shift | Records |
|---|---|
| ≈0 to 1 month | 58 |
| 2 to 7 months (max 210 days) | 107 |

The 58 fit the stated practice of copying the previous month's Excel. The 107 fit only if the same
February–April label set was carried forward unchanged through several monthly copies. That is a different
claim, and under the owner's rule it must not be applied automatically.

The owner was offered three options: A (the 58 only), B (all 165 after confirmation) and C (hold all).
The owner chose **C**.
