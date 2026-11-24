# Lane H — performance / failure / production hygiene (window 6, 2026-09-06)

Production `https://labourmarket.ai`, build `ca96605b`, Supabase project `gorgitwvdzxbnaxhrsrw`.
Read-only measurement (pg_stat_statements since its reset 2026-05-19 13:16 UTC, EXPLAIN on
SELECTs only, Postgres + Vercel logs, Playwright with the bounded E2E identities, anonymous
`fetch` probes). No production write was made by this lane. Walk script:
`perf-walk-prod.cjs` (log `perf-walk.log`, screenshots beside it).

## 1. Database — the statements that cost the most

Roles: `anon` statement_timeout **3 s**, `authenticated` **8 s**. `public_vacancies` 77,249 rows
(76,630 `is_active`, **47,426 active and unexpired**), one provider (arbetsformedlingen),
354 MB. `esco_labels` 1,034,730 rows, 408 MB.

### 1a. Top by mean (calls ≥ 5, app roles)

| # | role | calls | mean ms | max ms | total ms | statement (shape) | surface |
|---|---|---|---|---|---|---|---|
| 1 | authenticated | 897 | 2,850 | 7,927 | 2,556,447 | `public_vacancies … ORDER BY published_at DESC LIMIT/OFFSET` (plain DESC) | worker board BEFORE window 5 — the NULLS LAST shape now runs 28 calls at **3.8 ms** |
| 2 | authenticated | 16 | 2,702 | 7,016 | 43,235 | `search_public_vacancy_previews_v1` | `PublicDemandSection` on /dashboard/company |
| 3 | service_role | 203 | 1,790 | 5,997 | 363,480 | `SELECT * … WHERE provider_key = $1 LIMIT/OFFSET` + count | operator script `scripts/vacancy-operator-run.ts countStored` (select `*` with count=exact) |
| 4 | authenticated | 157 | 1,568 | 6,134 | 246,166 | `esco_labels … label ILIKE $3 ORDER BY label LIMIT 10` | ESCO typeahead `lib/taxonomy/esco-autocomplete.ts` |
| 5 | postgres | 408 | 1,529 | 7,027 | 624,033 | `refresh_public_vacancy_supply_counts_v1()` | pg_cron every 10 min |
| 6 | service_role | 432 | 1,103 | 7,960 | 476,501 | `INSERT INTO public_vacancies (…)` bulk | importer |
| 7 | anon | 20 | 903 | 2,892 | 18,051 | `list_public_vacancy_sitemap_v1` | /jobs-sitemap |
| 8 | service_role | 275 | 694 | 6,909 | 190,915 | `UPDATE public_vacancies SET last_seen_at … external_id = ANY($3)` | importer touch |
| 9 | **anon** | **23,280** | **677** | **2,999** | **15,752,493** | `search_public_vacancy_previews_v1` | **/[locale]/jobs (force-dynamic), every anonymous visit and crawler hit** |
| 10 | authenticated | 11 | 643 | 1,653 | 7,078 | `count_public_vacancies_by_profession_v1` | learning compass / education programs |
| 11 | authenticator | 551 | 588 | 1,704 | 323,720 | `SELECT name FROM pg_timezone_names` | PostgREST schema reload (551 reloads = DDL/NOTIFY) — not ours |
| 12 | anon | 2,446 | 539 | 2,997 | 1,318,145 | `count_public_vacancies_v1()` | historical (pre-singleton); now **52 ms** |
| 13 | authenticated | 869 | 271 | 6,747 | 235,322 | `SELECT last_seen_at … ORDER BY last_seen_at DESC LIMIT 1` | `readSupplyLastRefreshedAt` — every worker board render, **2 calls per render** (attributed by call delta) |
| 14 | authenticated | 116 | 123 | 919 | 14,228 | `demand_interest_signals WHERE status = $1` | admin launch-signals count |
| 15 | service_role | 792 | 27 | 186 | 21,575 | `provider_key, external_id, content_hash, lifecycle WHERE …` | importer dedup state |

Top by **total** time: #9 (15.75 M ms = 4.4 h of DB time), #1, #12, #6, #3, #4, #13.

### 1b. Postgres logs, last 24 h (`query_logs`, source postgres_logs)

| message | n (24 h) | attribution |
|---|---|---|
| `canceling statement due to statement timeout` (57014) | **1,571** — 20 to 135 per hour, every hour | every sampled line: `SQL function "search_public_vacancy_previews_v1" statement 1`, user `authenticator` (anon 3 s) |
| `permission denied for table agencies` | 507 | `lib/worker/invitations.ts` embed `agencies(legal_name)` (524 by query shape); `agencies` grants NOTHING to `authenticated` |
| `permission denied for table notification_preferences` | 273 | `readPrefRowsFailOpen(admin)` — service_role has no grant |
| `permission denied for table notification_events` | 272 | the weekly-digest emit, one per dashboard render (#1566, owner) |
| `permission denied for schema supabase_migrations` | 98 | Studio/MCP `list_migrations` as a non-owner — not product |
| plans 8, profiles 7, journal_entries 6, journal_entry_skills 5, worker_skills 5, workers 4, customer_requests 4, project_worker_readiness_items 4, education_programs 3, … | ≤ 8 each | walks/harness of other lanes (times match their windows) — not re-investigated |

### 1c. Vercel runtime logs (last 12 h, 1,000 lines)

979 × 200, 20 × 404 (`/wp-admin/install.php` scanners), **0 × 5xx** (nobody visited /jobs in the
window; the anonymous probes below reproduce the 500). Error-level lines: **40**, all
`[notifications] emit failed unexpectedly (weekly_digest): 42501` on `POST /lt/dashboard`.

### 1d. EXPLAIN (ANALYZE, BUFFERS) — verbatim, run while other lanes walked (timings noisy upward)

`select * from search_public_vacancy_previews_v1(null,null,20,0)` — **14,274 ms**, temp read=982
written=582 (spilled). The body without the function wrapper:

```
Limit  (cost=12625.61..12625.66 rows=20 width=67) (actual time=4375.476..4375.482 rows=20 loops=1)
  ->  Sort  Sort Key: published_at DESC NULLS LAST, id   (top-N heapsort)
        ->  WindowAgg  (actual time=4335.816..4365.019 rows=47426 loops=1)   <- count(*) over ()
              ->  Seq Scan on public_vacancies v  (actual rows=47426; Rows Removed by Filter: 29823)
Execution Time: 4376.346 ms
```

Same listing WITHOUT the window count:

```
Limit  (actual time=0.035..0.083 rows=20 loops=1)
  ->  Index Scan using public_vacancies_active_published_idx  Buffers: shared hit=15
Execution Time: 0.141 ms
```

`count(*)` over the live set alone: 43.2 ms (Index Only Scan `public_vacancies_active_supply_cover_idx`,
Heap Fetches 9,595 — visibility map stale; last autovacuum 2026-09-04). Count for one profession
(`welder`, 348 rows): 15.3 ms (`public_vacancies_active_profession_cover_idx`).

`count_public_vacancies_v1()` today: **52 ms** (singleton present).

`readSupplyLastRefreshedAt` shape (`order by last_seen_at desc limit 1`):

```
Limit  (actual time=278.993..278.994 rows=1 loops=1)  Buffers: shared hit=8282
  ->  Sort  Sort Key: last_seen_at DESC  (top-N heapsort)
        ->  Index Only Scan using public_vacancies_active_supply_cover_idx (rows=47426; Heap Fetches: 9595)
Execution Time: 279.057 ms
```

ESCO typeahead as the code issues it (`label ILIKE 'mūrin%'`, locale lt, occupation):

```
Limit  (actual time=16295.052..16295.750 rows=5)  Buffers: shared hit=3 read=7745
  ->  Sort  ->  Index Only Scan using esco_labels_concept_type_concept_id_locale_label_label_type_key
              Filter: (label ~~* '%mūrin%')  Rows Removed by Filter: 17560
Execution Time: 16301.388 ms      (cold read; stats mean 1,568 ms)
```

The same lookup the way the existing `esco_labels_typeahead_idx (locale, lower(label) text_pattern_ops)`
was built for (`lower(label) LIKE lower($1) || '%'`): **15.2 ms**, Buffers 10. The index is INERT today
because PostgREST `.ilike("label", …)` cannot express `lower(label)`.

Candidate replacement body for `search_public_vacancy_previews_v1` (§4), as a plain SELECT:
unfiltered **9.7 ms** (singleton count + index walk; the seq-scan branches show `never executed`);
`profession = welder` **257 ms** (index scan on the profession cover index, 348 rows + count).

### 1e. Indexes with idx_scan = 0 on tables > 5k rows (report only, nothing dropped)

| table | index | size | note |
|---|---|---|---|
| public_vacancies | `public_vacancies_fulltext_idx` (GIN tsvector title+description, WHERE is_active) | 85 MB | never used; the member search uses `ILIKE` on `title_raw/description_raw` (`vacancy-read.ts` `.or(…ilike…)`), which no index serves |
| public_vacancies | `public_vacancies_skill_slugs_idx` (GIN skill_slugs, WHERE is_active) | 1.5 MB | never used |

Seq scans: `public_vacancies` 25,027 seq scans / 1.27 G tuples read (the window-5 board + the anon
search); `esco_labels` 24; `esco_occupation_skills` 6; `esco_skills` 20.

## 2. Playwright — launch-critical surfaces (authenticated, production)

Walked during the same minutes other lanes walked and while the anon search timed out
20–135×/h (§1b). Re-measured standalone afterwards (§2b). All numbers ms.

| Surface | Who | Viewport | TTFB | DCL (wall) | HTML bytes | failed ≥400 | console errors* | controls < 40 px | clipped |
|---|---|---|---|---|---|---|---|---|---|
| /lt/dashboard COLD | worker | 390 | 188 | 7,832 | 539,459 | 0 | 0 | 0 | 1 (`Išskleisti`) |
| /lt/dashboard WARM | worker | 390 | 56 | 6,134 | 539,459 | 0 | 0 | 0 | 1 |
| /lt/dashboard/profile | worker | 390 | 53 | 2,522 | 629,429 | 0 | 0 | 3 (checkbox 20×20, input 272×22) | 3 (`Dar reikia` ×2, label) |
| /lt/dashboard/journal | worker | 390 | 52 | 911 | 606,026 | 0 | 0 | 3 (skill chips 24 px high) | 0 |
| /lt/dashboard/opportunities | worker | 390 | 52 | 961 | 659,006 | 0 | 0 | 7 (`Išreikšti susidomėjimą` 153×28, `+ Daugiau informacijos` 160×36) | 0 |
| /lt/dashboard/learning | worker | 390 | 50 | 742 | 507,474 | 0 | 0 | 0 | 0 |
| /lt/dashboard/services | worker | 390 | 55 | 901 | 507,823 | 0 | 0 | 1 (`Pridėti paslaugą` 138×30) | 0 |
| /lt/dashboard/projects | worker | 390 | 52 | 636 | 507,838 | 0 | 0 | 0 | 0 |
| /lt/dashboard/documents | worker | 390 | 55 | 1,908 | 616,793 | 0 | 0 | 6 (`Pateikti patikrai` 105×24, `ĮKELTI FAILĄ` 130×32, input 258×28) | 1 (`Pasirinkite failą`) |
| /lt/dashboard COLD | company | 1280 | 186 | 913 | 538,404 | 0 | 0 | 2 (Leaflet) | 2 (Leaflet attribution) |
| /lt/dashboard WARM | company | 1280 | 67 | 748 | 539,646 | 0 | 0 | 2 | 2 |
| /lt/dashboard/company | company | 1280 | 61 | **12,108** | **797,320** | 0 | 0 | **65** (13×13 checkboxes, `Priskirti` 69×28, `Sukurti grupę` 103×28) | 2 |
| /lt/dashboard/candidates | company | 1280 | 58 | 4,870 | 514,879 | 0 | 0 | 6 (inputs 34 px high) | 0 |
| /lt/dashboard/projects | company | 1280 | 51 | 719 | 539,213 | 0 | 0 | 7 (`Užbaigti` 70×26) | 0 |
| /lt/dashboard/service-requests | company | 1280 | 69 | 583 | 517,433 | 0 | 0 | 2 (`Pateikti užklausą` 129×26) | 0 |
| /lt/dashboard/learning | company | 1280 | 52 | 902 | 507,786 | 0 | 0 | 0 | 0 |
| /lt/dashboard/company | company | 390 | 159 | 7,939 | 803,527 | 0 | 0 | 64 | 7 |
| /lt/dashboard/candidates | company | 390 | 50 | 978 | 514,879 | 0 | 0 | 6 | 0 |
| /lt/dashboard COLD | learner | 390 | 162 | 1,445 | 539,884 | 0 | 0 | 0 | 3 |
| /lt/dashboard/learning | learner | 390 | 100 | 799 | 507,468 | 0 | 0 | 0 | 0 |

\* every page logs one console error: `The Content Security Policy directive 'upgrade-insecure-requests'
is ignored when delivered in a report-only policy.` (CSP report-only header carries a directive that
is meaningless in report-only mode — config hygiene, see §5). No other console error, no failed request,
**no horizontal overflow on any walked page**, **no raw UUID in any page text**.

Conversation (worker, 390): `ieškau darbo` → first answer **4,360 ms** (board opens; "Skydelyje yra 5
viešų darbo skelbimų… Ieškojau visame tavo sąraše — nieko nesusiaurinai."); `ką man daryti toliau?` →
answered ("Išsaugota 4 iš 6 esminių dalių. Štai ko dar trūksta", screenshot 03) but the harness did not
capture the time (the board sheet from the first sentence stayed open over the thread — harness, not
product). Learner `ką man mokytis?` → **2,549 ms** (compass with honest zeros). Company
`reikia 2 mūrininkų Vilniuje nuo spalio` → 1,080 ms, answered from the PERSONAL space ("Tai gali
paskelbti kaip savo įmonė — atidarysiu poreikio formą" + chip `Reikia darbuotojų`) — the walker's
default context was personal this session, so the form was a chip away, not auto-opened (design, #1564).

### 2b. Re-measured standalone (no concurrent walks)

| Surface | method | run 1 (cold lambda) | run 2 | run 3 |
|---|---|---|---|---|
| /lt/dashboard (worker) | node fetch, full body | TTFB 1,542 / total **2,621** | 520 / **895** | — |
| /lt/dashboard (worker, 390) | Playwright DCL / composer-ready | **3,161 / 3,238** (document stream ends at 3,125) | 834 / 981 | 835 / 995 |
| /lt/dashboard/company (company) | node fetch | 773 / **2,178** (780,803 bytes) | 406 / 1,484 | — |
| /lt/dashboard/candidates | node fetch | 622 / 1,063 | 339 / 661 | — |

So the 6–12 s in §2 were the SAME pages under DB contention (the anon search seq-scanning 47k rows
20–135×/h + other lanes' walks). Standalone: worker dashboard 0.8–0.9 s warm, ~3 s cold; the
document stream IS the cost (TTFB 60–320 ms). The RSC/HTML weight is the next lever: 517–800 KB per
dashboard document.

## 3. Anonymous probes (no cookie, no bearer) — no tenant data answers anonymously

| probe | status | body |
|---|---|---|
| GET /api/dashboard-search?q=darbas | 401 | `{"ok":false,"code":"unauthorized"}` |
| GET /api/workers/<id>/skills | 401 | `Unauthorized` |
| POST /api/workers/<id>/skills | 400 | schema error (validated before auth — no data) |
| GET /api/professions/<id>/skills | 401 | `Unauthorized` |
| GET /api/documents/file/<id> | 401 | `{"ok":false}` |
| GET /api/billing/reconcile | 403 | `not_admin` |
| POST /api/billing/portal | 401 | `not_authenticated`, `testMode:false` |
| POST /api/cv/extract | 401 | `unauthorized` |
| GET /api/mcp | 405 | POST-only |
| GET /api/cron/weekly-digest | 401 | **`not_configured`** — the cron secret env is absent: the Monday 07:00 Vercel cron (vercel.json) can never run |
| **GET /lt/jobs** | **500** ×4 of 6 (3.5–4.6 s), 200 ×2 (2.2–3.0 s) | `__next_error__` page; digest `3778318245` — the anon 3 s statement timeout in `search_public_vacancy_previews_v1`, re-thrown by `searchPublicVacancyPreviews` |
| GET /lt | 200 | 289 ms, 187 KB |

Dead API routes: **none**. All 13 `app/api/**` routes have a caller (`billing/reconcile` is the
owner-run superadmin GET documented in the checkpoint; `billing/webhook` is Stripe's; `cron/weekly-digest`
is vercel.json's cron).

## 4. Fixes — measured table

| surface / query | before | cause | fix | expected after |
|---|---|---|---|---|
| `readSupplyLastRefreshedAt` (worker board, 2 calls per render) | mean 270.8 ms, max 6,747 ms, 869 calls; EXPLAIN 279 ms | no index in `last_seen_at` order → index-only scan of 47k rows + top-N sort per call; plain DESC = NULLS FIRST | **GREEN migration** `20260906070000_public_vacancies_active_last_seen_idx_v1` (+ `.down.sql`) and `vacancy-read.ts` orders `nullsFirst: false` | < 1 ms per call (the `published_at` twin: 0.141 ms); ~550 ms off every worker board render. Not re-measured: the index is applied by the orchestrator |
| `/[locale]/jobs` anonymous | HTTP 500 on 4 of 6 probes; 1,571 timeouts / 24 h | `search_public_vacancy_previews_v1` computes `count(*) over ()` → seq scan + WindowAgg over 47k rows (4.4 s; 14 s cold/loaded) against anon 3 s; `searchPublicVacancyPreviews` re-threw 57014 into the page | `public-vacancy-preview.ts`: 57014 → named `unavailable`; `jobs/page.tsx` renders an honest "did not answer in time" line (5 locales) instead of the error page or a fabricated "0 vacancies found". **Durable fix = function body (§4a, RED (g) — orchestrator)** | page: no 500, honest state. Function: 677 ms mean / 4.4 s cold → **9.7 ms** unfiltered, 257 ms per profession (measured as SELECT) |
| `PublicDemandSection` on /dashboard/company | 2,702 ms mean (authenticated search RPC), page 12 s under contention | same function | same function fix; the section already degrades (`.catch → unavailable`) | 2.7 s → ~10 ms per render |
| weekly-digest emit on every worker dashboard render | 40 error lines / 12 h; 273 + 272 permission-denied statements / 24 h; 3 reads + 1 failing write per visit | `notification_events` / `notification_preferences` refuse service_role (42501, owner GRANT #1566) and the emitter retried every render | `events.ts`: 42501 → named `write_blocked`, process-scoped 15-min block, one log line per window; `event-emitters.ts`: `maybeEmitWeeklyDigestInBackground` and `deliver` skip the reads while blocked; cron sweep reports `unavailable` | 0 wasted reads/writes per render while blocked; the grant, once applied, is picked up within 15 min or on a fresh instance |
| `listMyPendingWorkerInvitations` (every dashboard render) | 524 `permission denied for table agencies` / 24 h; agency invitations silently read as "none" | embed `agencies(legal_name)` on a table with NO grant to `authenticated` (and an owner-only policy an invitee could never pass); `{ data: ag }` ignored the error | `lib/worker/invitations.ts`: read the invitation rows without the embed; errors are logged with the table name, not rendered as "none" | 0 permission-denied lines from this read; agency invitations (0 rows today) become visible when they exist |

### 4a. Function SQL for the orchestrator (RED under migration-safety (g): SECURITY DEFINER replace; same signature, no grant change — the anon allowlist entry stays valid)

```sql
-- 202609060800xx_search_public_vacancy_previews_v2_count.sql  (paired .down.sql = the current body, § pg_get_functiondef above)
create or replace function public.search_public_vacancy_previews_v1(
  p_query text default null,
  p_profession_slug text default null,
  p_limit integer default 20,
  p_offset integer default 0)
returns table(id uuid, title_raw text, profession_slug text, occupation_raw text, employment_form text,
              working_time text, positions integer, compensation_currency text, compensation_min numeric,
              compensation_max numeric, source_language text, attribution_code text,
              published_at timestamp with time zone, total_count bigint)
language sql stable security definer
set search_path to 'public'
as $function$
  with q as (
    select nullif(replace(replace(btrim(coalesce(p_query, '')), '%', '\%'), '_', '\_'), '') as needle
  ),
  total as (
    select case
      -- Unfiltered board: the cron-maintained singleton (refresh_public_vacancy_supply_counts_v1,
      -- every 10 min, SAME predicate). Constant cost instead of a 47k-row window count per visit.
      when p_profession_slug is null and (select needle from q) is null
        then coalesce(
          (select c.active_vacancies from public.public_vacancy_supply_counts c where c.singleton),
          (select count(*) from public.public_vacancies v
            where v.is_active and (v.expires_at is null or v.expires_at > now())))
      else
        (select count(*) from public.public_vacancies v
          where v.is_active and (v.expires_at is null or v.expires_at > now())
            and (p_profession_slug is null or v.profession_slug = p_profession_slug)
            and ((select needle from q) is null
                 or v.occupation_raw ilike '%' || (select needle from q) || '%'))
    end::bigint as n
  )
  select
    v.id,
    null::text as title_raw,
    v.profession_slug,
    v.occupation_raw,
    v.employment_form,
    v.working_time,
    v.positions,
    case when v.compensation_min is not null or v.compensation_max is not null
         then v.compensation_currency end,
    v.compensation_min,
    v.compensation_max,
    v.source_language,
    null::text as attribution_code,
    v.published_at,
    (select n from total) as total_count
  from public.public_vacancies v
  where v.is_active
    and (v.expires_at is null or v.expires_at > now())
    and (p_profession_slug is null or v.profession_slug = p_profession_slug)
    and ((select needle from q) is null
         or v.occupation_raw ilike '%' || (select needle from q) || '%')
  order by v.published_at desc nulls last, v.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$function$;
comment on function public.search_public_vacancy_previews_v1(text, text, integer, integer) is
  'Anonymous board projection. total_count comes from the supply-counts singleton when unfiltered (<=10 min stale; hasMore on the last page may be off by the refresh delta) and from an index-only count otherwise; the listing walks public_vacancies_active_published_idx. Replaced count(*) over () which seq-scanned every live row per call (1,571 anon timeouts/24 h, Lane H 2026-09-06).';
```

Measured as a SELECT with the same body: unfiltered 9.7 ms, `welder` 257 ms (§1d). Behavioural
difference to state in the PR: unfiltered `total_count` is the singleton (≤ 10 min old).

### 4b. ESCO typeahead — the SQL the orchestrator/owner needs (RED (g) + GRANT; not written by this lane)

`search_esco_labels_v1(p_locale text, p_concept_type text, p_prefix text, p_limit int)` — `where locale = p_locale
and concept_type = p_concept_type and lower(label) like lower(p_prefix) || '%' order by label limit …`,
SECURITY INVOKER is enough (esco_labels is readable by authenticated), so only `grant execute … to
authenticated; revoke … from public` is RED. Then `esco-autocomplete.ts` calls the RPC instead of
`.ilike`. Measured: 1,568 ms mean (16.3 s cold) → 15 ms. `pg_trgm` is NOT installed (no GIN
alternative without an extension).

## 5. Hygiene sweep

- **"demo" / "LABMA" / test banners**: none in `messages/*.json` (12 locales), `public/`, `app/`.
  `labma` appears only as a negative pattern in `lib/seo/seo-indexing-audit.ts` (correct). `demo` only in
  code comments and `market-map-model.ts` (`MarketDataOrigin = "live" | "demo" | "acceptance"` — a
  type value, never copy; the map renders "preview").
- **Contradictory billing copy while Stripe is LIVE (no money collected)** — report only (billing = RED):
  `lt.json`/`en.json` keys `billingTestCheckout.title/body/start` (8378–8380: "Testinis apmokėjimas (vidiniam
  testavimui)", "Stripe test mode įjungtas…"), `…eyebrow` 8428 "MOKĖJIMAI — TEST MODE", `…help` 8460,
  `…stripe_test` 8438/8598/8603, 9625 `success` ("Testinis apmokėjimas užbaigtas"), 9648 `hint` ("Test mode
  only"), 8039 `notEntitled` ("pradėk testinį apmokėjimą arba paprašyk piloto prieigos"), en 7922
  `visibilityNote` ("Paid wider access is not active yet (payments are being prepared)"). Rendered by
  `components/marketing/test-checkout-button.tsx` via `account-billing-section.tsx` (`canOrder` branch) and
  `components/marketing/billing-test-checkout.tsx`. The anonymous portal probe answers `testMode:false`,
  so a signed-in orderer today sees "TEST checkout — no real money" copy in front of a LIVE checkout.
- **Pre-launch residue**: `WaitlistModal` (`components/marketing/{cta-band,page-hero,pricing-table}.tsx`)
  + `/api/waitlist` — a waitlist on a product launching next week (marketing lane).
  `vision/page.tsx` `internalPreviewBanner` ("Puslapis dar nepaviešintas… owner production smoke") is guarded by
  `product-readiness.test.ts` — intentional, left.
- **Config**: `.claude/launch.json` is committed and modified in the main checkout (orchestrator's tree;
  not touched). `apps/web/vercel.json`: `regions dub1`, one cron — clean. CSP report-only header
  carries `upgrade-insecure-requests` (one console error per page load; harmless, cosmetic).
- **`/api/cron/weekly-digest` → `not_configured`**: cron secret env absent (owner env item).
- **Raw identifiers on walked pages**: none (UUID scan of every page text = 0). The company home still
  shows an invitee e-mail as a deadline label (G-H1, window 5).
- **Second `agencies(legal_name)` embed**: `app/[locale]/dashboard/journal/page.tsx:303` on `agency_workers`
  — same dead grant, fails once a worker has an agency link (journal lane).
- **Mobile 390**: no overflow; primary controls under 40 px listed in §2 (journal skill chips 24 px;
  opportunities `Išreikšti susidomėjimą` 28 px; documents `Pateikti patikrai` 24 px, `ĮKELTI FAILĄ` 32 px;
  services `Pridėti paslaugą` 30 px; company home 64 controls incl. 13×13 checkboxes) — UI lanes.

## 6. Residue in production

None created. No fixture rows written, no e-mail, no Stripe, no outreach.
