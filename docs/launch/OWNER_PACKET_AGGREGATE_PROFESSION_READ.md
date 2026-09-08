# Owner packet — the single-aggregate path for the landing profession reads

**Status: PREPARED, NOTHING APPLIED.** No grant issued, no migration written,
no anon surface widened. Requested under owner decision item 4.

**Headline recommendation: DO NOT grant `anon` EXECUTE.** The packet was
prepared as instructed, and preparing it surfaced a cheaper and safer answer
that needs no database change at all. Evidence below; the aggregate evidence
(A–M) is given in full anyway, because you asked for it and because it is what
proves the recommendation.

---

## 0. THE FINDING THAT CHANGES THE ANSWER

The ten profession reads are **not consumed by the page that generates the
traffic**.

`/` (the default landing) renders `FocusLanding` → `MarketProofBand`. Every
consumer of the snapshot was enumerated:

| Field | Consumed by `/` (FOCUS) | Consumed by `/live-market-review` (LIVE) |
|---|---|---|
| `activeVacancies` | **yes** | yes |
| `distinctEmployers` | **yes** | yes |
| `lastRefreshedAt` | **yes** | yes |
| `professions[]` | **NO** | yes (counts + one sample job) |

The only files that read `market.professions` are
`app/[locale]/live-market-review/live-market-command.tsx` and
`app/[locale]/live-market-review/live-market-page.tsx`.

The profession chips FOCUS *does* render come from
`TOP_PROFESSION_FAMILY_SLUGS` in `components/marketing/market-proof-band.tsx`
— a **static list of six slugs** (caregiver, teacher, sales_assistant,
warehouse_worker, driver, cleaner), unrelated to the ten queried slugs and not
derived from live data. The band's own comment says "ranking only, no absolute
counts".

**So on the highest-traffic route, all ten profession reads were pure waste,
and still are after #1661** — #1661 made them sequential and bounded, not
absent.

**Implication for item 4:** the aggregate would replace ten reads with one on
`/live-market-review`, an internal owner-review surface. It would do nothing
for `/`, because `/` needs *zero* profession reads. Granting `anon` a new
SECURITY DEFINER capability to speed up a page `anon` traffic does not
meaningfully hit is the wrong trade.

---

## A. Exact function definition and security status

```sql
CREATE OR REPLACE FUNCTION public.count_public_vacancies_by_profession_v1(p_limit integer DEFAULT 20)
 RETURNS TABLE(profession_slug text, active_vacancies bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET work_mem TO '64MB'
AS $function$
  select v.profession_slug, count(*)::bigint
    from public.public_vacancies v
   where v.is_active
     and v.profession_slug is not null
     and (v.expires_at is null or v.expires_at > now())
   group by v.profession_slug
   order by count(*) desc, v.profession_slug
   limit least(greatest(coalesce(p_limit, 20), 1), 100);
$function$
```

`SECURITY DEFINER`, `STABLE`, `search_path` pinned to `public`,
`work_mem = 64MB`. No dynamic SQL. No `auth.uid()`, no `auth.jwt()`, no
`current_setting` — output depends only on `p_limit`.

## B. Current EXECUTE grants (live)

`proacl = {postgres=X/postgres, authenticated=X/postgres}`

| role | EXECUTE |
|---|---|
| `postgres` | yes |
| `authenticated` | yes |
| `anon` | **no** |
| `service_role` | **no** |

## C. Returned fields

`TABLE(profession_slug text, active_vacancies bigint)` — a taxonomy slug and a
count. Nothing else is returned, and nothing else can be: the projection is
`select v.profession_slug, count(*)`.

## D. What can be inferred

No organisation, person, contact, vacancy id, title, employer, location,
salary or date is returned or derivable. Group sizes today are 469–4842 for
the ten landing slugs, so no group is small enough to be identifying.

**Disclosure comparison — the decisive point.** `anon` **already** executes
`search_public_vacancy_previews_v1` over the **same table with the same row
filter** (`is_active`, not expired), and that function returns vacancy ids,
occupation labels, employment form, working time, positions, compensation
range, source language and publication date, plus `total_count`. An anonymous
caller can therefore already reconstruct these counts by paging it. The
aggregate discloses **strictly less** than a capability `anon` holds today.

## E. RLS / security boundary

`public_vacancies` is not `anon`-selectable; both functions reach it through
`SECURITY DEFINER`. The aggregate applies the **same** row filter as the
already-anon-granted preview search, so the boundary is unchanged. No policy
would be created, dropped or loosened.

## F. Scope of the grant, were it made

`grant execute on function public.count_public_vacancies_by_profession_v1(integer) to anon;`
and nothing else. Per `lib/security/anon-secdef-allowlist.ts` its own rule —
*"a function may be anon-reachable ONLY if it appears here, by exact identity
signature, with a written contract"* and *"adding an entry is an OWNER
DECISION, not a refactor"* — it would also need an `ANON_SECDEF_ALLOWLIST`
entry. It is already listed in `CANONICAL_APP_RPCS`; that registry pins that
`authenticated` EXECUTE must exist and does not conflict.

## G. Authenticated behaviour

Unchanged. The `authenticated` grant already exists and would not be touched.
Existing callers `lib/education/programs.ts` and `lib/learning/learning-compass.ts`
(both `p_limit: 100`) are unaffected.

## H. Landing DB-call count, before vs after

| Path | today (after #1661) | with the aggregate | with the finding in §0 |
|---|---|---|---|
| `/` FOCUS | 1 supply + 10 profession = **11** | 1 + 1 = 2 | **1** |
| `/live-market-review` | **11** | 1 + 1 = **2**, *but* the sample job it renders is not in the aggregate | 11, or 2 if the sample job moves on demand |

The aggregate cannot fully serve LIVE: `live-market-command.tsx` renders
`activeProfession.jobs[0].title` and links `/jobs/{id}`. Those rows come only
from the preview search. Replacing the ten reads there is therefore a
**rendered-content decision**, not a performance one.

## I. Cold and warm performance

| | cold | warm |
|---|---|---|
| aggregate, all 39 professions, one call | **221 ms** | **8.2–8.6 ms** |
| ten profession preview reads (today) | **11 305 ms** | **947 ms** |

Measured on production. The ten-read cold figure includes `farm_worker` at
6 555 ms returning zero rows and `electrician` at 2 528 ms.

## J. Unavailable / error semantics — and one latent defect

Held: a failed RPC stays `unavailable`, never zero, exactly as the current
readers behave.

**Latent defect that must be handled by the caller, not the function.** The
function returns only professions that HAVE at least one active vacancy, so a
requested slug can be missing for two different reasons:

1. it genuinely has zero active vacancies (`farm_worker`, today), or
2. it fell outside the `limit least(greatest(coalesce(p_limit,20),1),100)`
   window.

Today there are **39** distinct professions with active vacancies, so at
`p_limit = 100` case 2 cannot occur and absence means a true zero. If the pool
ever exceeded 100 professions, absence would silently become a fake zero —
precisely the failure class the public vacancy contract exists to prevent. Any
caller must therefore treat `rows.length === cap` as "the window was full" and
report missing slugs as UNKNOWN rather than 0.

This is a **caller obligation, not a defect in the function**, and it is a
reason not to adopt the aggregate casually.

## K. Rollback

`revoke execute on function public.count_public_vacancies_by_profession_v1(integer) from anon;`
plus removal of the allowlist entry. Exact, and verifiable by re-reading
`proacl`. Nothing else would change, so nothing else needs reverting.

## L. Fresh-DB reproducibility

The grant must be written so a clean `supabase db reset` reaches the same ACL:
an explicit `revoke ... from public` before the `grant ... to anon`, matching
the pattern just applied in #1658. Verified by the existing
`secdef-local-reset-reproducibility` guard.

## M. Guards that would prevent silent restoration of the fan-out

Already merged in #1661:
`apps/web/lib/guards/landing-fanout-is-sequential.test.ts` — drives the real
reader with an injected client and asserts `maxInFlight === 1`. Verified
failing against the previous code (`expected 10 to be 1`) and carrying a
negative control proving the probe can observe overlap at all.

If §0 is adopted, one further guard is owed: an assertion that the FOCUS path
resolves **no** profession reads, so the waste cannot silently return.

---

## What I recommend, and what I am NOT doing

**Recommended:** stop resolving the ten profession reads on the FOCUS path,
which needs no migration, no grant and no new anon capability. `/` goes from
11 database calls per snapshot to 1.

**Not recommended for now:** granting `anon` EXECUTE. It buys 10 → 1 on an
internal owner-review surface that cannot reach 1 anyway while it renders a
sample job, in exchange for a permanent new anonymous SECURITY DEFINER
capability and an allowlist entry.

**Blocked on you:** the FOCUS change edits `lib/market/live-market-landing.ts`,
a frozen landing file, so it would move that baseline hash again. Your #1661
approval was explicitly scoped to that one fix, so I am not making it.
