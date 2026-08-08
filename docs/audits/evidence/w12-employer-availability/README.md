# W12 employer availability — authorization & privacy proof

Evidence for `feat/cc/w12-employer-availability-v1`. Local stack only,
disposable `@local.test` accounts.

## Fixture

| actor | relationship | expectation |
|---|---|---|
| worker W | has approved leave 2026-08-10 .. 2026-08-14, `absence_type = 'sickness'`, `note = 'PRIVATE-REASON do not disclose to employer'` | — |
| employer A | owns a company with `company_workers(A, W, status='active')` | sees the band, never the reason |
| employer U | owns a different company, no relationship to W | sees nothing |

## 1. RLS authorization — proven at the database

Each query run as the real role with the real JWT claim, so
`public.caller_manages_worker()` and `auth.uid()` evaluate exactly as in the app.

| probe | result |
|---|---|
| authorized employer A → approved absences | `2026-08-10..2026-08-14 approved` ✅ |
| **unrelated employer U → approved absences** | **`(no rows)`** ✅ |
| worker W → own absences | `2026-08-10..2026-08-14 approved` ✅ |
| unrelated employer U → `note` / `absence_type` | `(no rows)` ✅ |
| **authorized employer A → `note` / `absence_type`** | **`PRIVATE-REASON… / sickness`** ⚠️ |

**The last row is the important one.** `worker_absences` RLS is *row*-level; it
does not restrict *columns*. An authorized employer could read the reason and
the type if the application asked for them. It does not: the select list in
`lib/planning/employer-availability.ts` is
`id, worker_id, start_date, end_date, status`, and a guard test asserts that
`note` and `absence_type` are never requested.

So the minimum-necessary rule is enforced **at the query layer, not the
database layer**. Closing that gap in depth would need a column-level `REVOKE`
or a restricted view — i.e. a migration, which is owner-gated. Recorded here
rather than crossed.

## 2. Browser acceptance — the real page

`/lt/dashboard/company/planning`, acceptance server against the local stack.

| check | result |
|---|---|
| authorized employer sees the section | ✅ |
| rendered row | `W12 Emp Worker NEDIRBA 2026-08-10 – 2026-08-14` |
| free-text reason on the page | ❌ absent |
| absence type in visible text | ❌ absent |
| **unrelated employer: section present** | **false** — negative control ✅ |
| unrelated employer: rows | 0 ✅ |
| page errors | 0 |
| console errors (non-CSP) | 0 |
| widths 390 / 768 / 1440 | no horizontal overflow |

The rendered row is exactly **who** and **when** — the owner's
minimum-necessary rule, observed in the product rather than asserted.

### A note on `sickness` appearing in the HTML

The raw enum values `sickness` and `annual_leave` each appear **once** in the
page source, inside next-intl's serialised message catalogue
(`"absences":{"types":{"annual_leave":"…","sickness":"…"}}`). That is a static
vocabulary list shipped identically to every user and contains no worker's
data. The page's *visible text* contains neither, and the localised label for
this worker's leave ("Nedarbingumas") never renders. Checked rather than
assumed — the first version of this proof failed on a naive substring match,
and the substring turned out not to be a leak.

## 3. One defect found by the browser, not by the tests

The section first shipped **unreachable**. `/dashboard/company/planning` has
three return blocks, and an employer with no demand entered yet hits an
early-return empty state — so the availability section, added only to the
populated block, never rendered for exactly the employer most likely to be
about to schedule somebody. Unit tests were green throughout; the browser run
returned `sectionPresent: false`. It is now built before the early return and
rendered in both branches.
