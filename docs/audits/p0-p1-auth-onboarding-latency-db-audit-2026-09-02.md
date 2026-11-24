# P0/P1 — auth closure, new-user onboarding, latency, database footprint (2026-09-02)

**Baseline at start:** `main = b9749280 = production` → during the audit `#1412`
(`c3accc7c`), `#1413` (`cf642271`) merged and deployed. Tree clean apart from
two untracked local E2E scripts (excluded from git).
**Method:** read-only production evidence first (auth logs, edge logs,
`pg_*` catalogs); then bounded test identities for anything that needed a
credential; nothing destructive; no production migration.
**Labels:** PRODUCTION_PROVEN · E2E_PROVEN · IMPLEMENTED_UNPROVEN · PARTIAL ·
MISSING · OWNER_GATE · EXTERNAL_GATE.

---

## A. OAuth incident — closed with production evidence

### A.1 The owner's fresh connection (after Disconnect → Add)

Auth log, 2026-09-02 (UTC), all from the ChatGPT client `3624f6dc…`:

| Time | Request | Result | Meaning |
|---|---|---|---|
| 11:48:51 | `GET /oauth/authorize` (PKCE S256, registered redirect, `resource=https://labourmarket.ai`) | 302 → `labourmarket.ai/oauth/consent?authorization_id=…` | authorization request |
| 11:48:59–11:49:01 | `GET /authorize` → `GET /callback` → `POST /token` (Google) | 302/302/200 | the owner was not signed in on the web; login with `?next=` carrying the pending authorization |
| 11:49:04 | `GET /oauth/authorizations/jdjj…` | 200 | consent page resolved the request |
| — | *(no `POST …/consent`)* | — | **preserved consent auto-approved**: GoTrue answered with the final redirect, no click |
| 11:49:06 | `POST /oauth/token` (authorization_code) | **200** | fresh grant |
| 11:49:28 | `GET /auth/v1/user` ×2 → `GET /rest/v1/profiles?select=id,full_name,…&id=eq.dc3284ea…` | 200 | `profile_get` under the owner's own JWT |

DB after: **one** `auth.sessions` row with `oauth_client_id = ChatGPT`, created
11:49:06.30, **1 refresh token, 0 revoked**; the consent row unchanged
(2026-08-30). The pending authorization row was consumed (deleted on
exchange). **Nothing stale was reused: the session, refresh token and code are
all new.** PRODUCTION_PROVEN.

### A.2 What the earlier failures were (kept for the record)

`#1412` — web logout used supabase-js's default `scope: global`, deleting the
external client's session. `#1413` — ChatGPT's "reload" is a refresh, not a
re-authorization, and Supabase's `/oauth/token` answers the `refresh_token`
grant with a **non-RFC legacy body** (`error_code: refresh_token_not_found`,
no `error` member), so the client never learned to re-authorize. That upstream
shape is **still present** (`AS_TOKEN_ERROR_SHAPE` WARNs live) — **not fixed
locally, not claimable**; only the client-side classification is.

### A.3 Lifecycle proven on production with bounded identities

Two test identities were created through the public signup API (autoconfirm
is on), `e2e-external-client-202609021205@` and
`e2e-journal-client-202609021207@labourmarket.ai`, using the pre-existing
public PKCE client `lm-oauth-proof-temp-20260830`. No admin key, no password
stored, no credential printed.

| Check | Result | Class |
|---|---|---|
| PKCE S256 + `state` echo + registered redirect | authorize 302 → approve → code → exchange **200** (`expires_in 3600`, refresh issued) | E2E_PROVEN |
| `offline_access` | in consent scopes and honoured (refresh works) | PRODUCTION_PROVEN |
| Token rotation | refresh → new refresh token (`rotated=true`) | E2E_PROVEN |
| Old refresh reused **within seconds** | 200 — Supabase's reuse-interval grace; outside it → `refresh_token_not_found` (owner's 09:01 case) | PRODUCTION_PROVEN |
| **Web logout `scope=local`** (#1412) | 204; OAuth refresh afterwards **200 — grant survived** | E2E_PROVEN |
| `revokeGrant` | refresh → 400 `refresh_token_not_found`; **the still-valid access token is refused at our door immediately** (GoTrue `/user` 403 → our 401), because we verify against the auth server, not a local signature | E2E_PROVEN |
| Fresh authorize after revoke | 302 → consent | E2E_PROVEN |
| Cross-user isolation (#12) | new user's `profile_get` returns **its own** id; `journal_list` = 0 while the owner holds 19+ | E2E_PROVEN |
| Leakage | no bearer/refresh/code in any log line or output; auth-log rows carry paths and statuses only | PASS |

GoTrue quirk recorded: `approveAuthorization` answers **404** unless
`getAuthorizationDetails` was called first in that session (the consent page
always does; a client script must too).

## B. `profile_get` latency

Client-side round trips from Lithuania (Node fetch, warm TLS), 2026-09-02:

| Path | cold | warm samples | note |
|---|---|---|---|
| `/api/mcp` refusal (no DB) | 1281 ms | 93 · 100 · 109 · 116 · 220 | Vercel cold start ≈ 1.1 s |
| `/api/mcp` `initialize` (bearer) | — | 280 | one `getUser` round trip |
| **`profile_get` (bearer, new user)** | **1223 ms** | **433 · 347 · 277 · 249** | median warm ≈ **350 ms** |
| Supabase `/auth/v1/user` (direct) | 324 | 108–211 | |
| Supabase REST `profiles` (direct) | 396 | 159–217 | |
| `journal_create_draft` / `journal_confirm` | 1235 / 985 | — | first call each, includes cold path |

Server-side, from the edge log of the owner's own call: `/auth/v1/user`
11:49:28.645 → REST `profiles` 11:49:28.904 = **≈260 ms** between bearer
verification and the DB read. So a warm `profile_get` is ≈ 2 auth-server /
DB round trips + Vercel ≈ **250–430 ms**; a cold one adds ≈ 1 s of function
start. The owner's "taking longer than usual" was a **cold start plus ChatGPT's
own tool-call overhead and threshold**, not a slow query.

`Server-Timing` (`auth`, `capability`, `presentation`, `total`) is added on
every `/api/mcp` response by `#1414` so the split becomes measurable per
request without Vercel log access. Section B.1 below is filled from
production once it deploys.

### B.1 Server-side breakdown (production, `#1414` deployed as `27088576`)

Bounded identity, 8× `profile_get` + 3× `journal_list`, header `Server-Timing`:

| call | client ms | auth | capability | presentation | total |
|---|---|---|---|---|---|
| profile_get **cold** | 2583 | 156 | **1302** | 85 | **1560** |
| profile_get warm ×7 | 191–621 | 34–151 | 62–308 | 2–4 | 100–348 |
| journal_list warm ×3 | 178–392 | 26–39 | 69–138 | 2 | 99–180 |

**profile_get warm: total p50 = 213 ms, p95 = 316 ms; auth p50 40 ms;
capability p50 146 ms; presentation 2 ms; client-observed p50 364 ms** (≈ 150 ms
is network from Lithuania to Vercel). The cold call is dominated by the first
capability execution (Supabase client + first DB connection inside a fresh
function instance), not by bearer verification.

Where the time goes, in order: cold start (≈ 1.2 s, only first call) → the
capability's own DB round trips (≈ 150 ms warm) → bearer verification
(≈ 40 ms warm) → network → presentation (negligible). ChatGPT-side time
(model turn, tool-call scheduling, its "taking longer" threshold) is outside
these numbers and outside our control; the server's contribution to the
owner's slow first call was the cold start.

**Proposed SLO for simple reads (`profile_get`, `journal_list`):** server
`total` p50 ≤ 400 ms, p95 ≤ 800 ms warm; cold ≤ 1.5 s. Measured warm already
meets it; cold start is the only thing above it. Optimisation candidates only
if `Server-Timing` shows `auth` dominating: cache `getUser` verdicts for the
JWT's remaining lifetime **is not acceptable** (revocation must stay
immediate — proven valuable in A.3); the honest lever is keeping the function
warm or accepting cold ≈ 1 s.

## C. New user from an external assistant

**Production auth settings (read live, not inferred):** signup enabled
(`disable_signup=false`), **email autoconfirm ON** (`mailer_autoconfirm=true`),
Google enabled, phone/anonymous/other social off, GoTrue v2.196.0.

Proven path (E2E on a brand-new identity, A.3): signup → authorize → consent
details → approve → PKCE exchange → first tool call → **canonical provisioning
by the DB trigger**: `profiles` 1 (not onboarded, `active_role` null),
`workers` 1, personal `engagement_contexts` 1, `company_memberships` 0. No
role, no company, no professional profile is invented — exactly the minimal
claimable identity the architecture requires. The assistant is one adapter;
nothing ChatGPT-specific exists on the server.

UI resume path (`consent → login?next=… → signup → /onboarding?next=… →
completion redirects to next`) is wired in code (`signup-form.tsx`,
`onboarding/page.tsx`, `lib/auth/actions.ts:180-185`, `auth/callback`) and the
first hop is measured (`/oauth/consent` anonymous → 307 to the localized
consent → login with `next`). The full browser walk was **not** executed by
the agent (it requires typing a password into a real form, which the agent
does not do): **IMPLEMENTED_UNPROVEN** for the UI hops; the grant/tool chain
behind it is E2E_PROVEN.

Identity matrix:

| # | State | Status |
|---|---|---|
| 1 | existing LM user + first external connection | PRODUCTION_PROVEN (owner, 08-30) |
| 2 | existing user + valid grant | PRODUCTION_PROVEN (owner, 11:49) |
| 3 | existing user + dead grant | PRODUCTION_PROVEN (owner, 06:05/09:01) + E2E revoke |
| 4 | after normal web logout | E2E_PROVEN (grant survives, #1412) |
| 5 | brand-new person | E2E_PROVEN (API signup → grant → tool); UI hops IMPLEMENTED_UNPROVEN |
| 6 | signup interrupted | PARTIAL — pending authorization expires in 10 min server-side (measured `expires_at`); no UI test |
| 7 | consent denied | IMPLEMENTED_UNPROVEN (`denyAuthorization` → `access_denied`; not exercised) |
| 8 | authorization resumed after signup | E2E_PROVEN at AS level (new user approved a pre-existing pending authorization) |
| 9 | duplicate email / identity collision | **P1 finding, see K** |
| 10 | social login | Google PRODUCTION_PROVEN (owner's 11:48:59 hop) |
| 11 | logout / reconnect | E2E_PROVEN |
| 12 | two users, one integration | E2E_PROVEN (isolation) |

## D. First-use: fields required vs progressive

Required at account creation: **email + password** (or Google). Everything
else is progressive: role, name, country, locale, skills — `profile_get` for a
fresh account returns `onboarded:false`, and a read/draft already works.
Roles (worker / employer / student / institution) stay a later choice.

## E. Work Journal external E2E (bounded identity, TEST-labelled)

```
DRAFT   200  preview names the resolved context "Darbuotojas", date 2026-09-02,
             Lithuanian human summary first, token minted, NOTHING written
CONFIRM 200  entryId 58db0704-6374-42ed-a0a9-fdb8ca0dcd1a
READ    entries 0 → 1; DB: worker of the test identity, original_language lt,
             chain root (first entry), not superseded
DUP     confirmation_rejected, count delta 0
```

E2E_PROVEN. Native parity: the same `createJournalEntryCore` serves the web
composer (proven G-01/G-04). The gate's read-back field bug found here is fixed
in its own PR.

## F–G. Database footprint — forensic, read-only

`pg_database_size` = **826,920,083 B = 789 MB** (dashboard 842 MB at its
sample time; WAL is a separate 144 MB). PostgreSQL 17.6.

| # | Relation | total | heap | indexes | TOAST | rows | % of DB |
|---|---|---|---|---|---|---|---|
| 1 | `public.esco_labels` | **427 MB** | 139 | **289** | 0 | 1,034,730 | **54.1 %** |
| 2 | `public.public_vacancies` | **335 MB** | 74 | 99 | **162** | 71,356 | **42.4 %** |
| 3 | `public.esco_occupation_skills` | 21 MB | 11 | 10 | 0 | 126,102 | 2.6 % |
| 4 | `public.esco_skills` | 8 MB | 4.5 | 3.5 | 0 | 13,939 | 1.0 % |
| 5 | `public.esco_occupations` | 1.8 MB | | | | 3,039 | 0.2 % |
| 6 | `supabase_migrations.schema_migrations` | 0.8 MB | | | | 251 | |
| 7 | `public.pilot_events` | 0.7 MB | | | | 1,766 | |
| 8 | `auth.users` | 0.3 MB | | | | 36 | |
| 9 | `public.market_intelligence_observations` | 0.2 MB | | | | 76 | |
| 10 | `public.journal_entries` | 0.18 MB | | | | 37 | |

**Logical data vs indexes vs bloat:** heaps+TOAST ≈ 390 MB, indexes ≈ 400 MB,
dead tuples ≤ 1 % everywhere (`esco_labels` 998 dead of 1.03 M; vacancies
2,397 of 71 k) — **no bloat**. `auth`, `storage`, `journal_*`, consents:
< 5 MB combined.

Largest unexpected consumer: **`public_vacancies_fulltext_idx` — 83 MB GIN,
`idx_scan = 0`** since creation; nothing in the app runs text search (grep:
no `textSearch`/`to_tsquery` call sites). `public_vacancies_skill_slugs_idx`
(1.5 MB) also 0 scans. `esco_labels` unique index is 151 MB because it
includes the label text; its only reader (`esco-autocomplete.ts`) filters by
`locale` + prefix `ilike`, served by the 86 MB typeahead index (1,377 scans).

## H. Retention classes

| Data | Class | Verdict |
|---|---|---|
| journal, confirmations, photos, consents, auth, memberships, timesheets | **A** | never for cost |
| profiles, workers, organizations, requests, allocations | **B** | product |
| `esco_*` (ESCO release, reproducible) | **C** | archivable/dedupable |
| `public_vacancies` (Arbetsförmedlingen stream, reproducible) | **C** | lifecycle |
| `pilot_events`, `usage_cost_events`, `ai_runs` | **F** | retention policy |
| nothing found in **D/E** — no staging/failed-import tables, no duplicates (71,356 distinct `content_hash`) | | |

## I. Job-market data — what is actually stored

One provider (`arbetsformedlingen`), 71,356 rows, 70,767 active, **all
distinct**, avg description 3.3 KB (225 MB raw text, TOAST-compressed to 162
MB). **25,635 active rows are past their own `expires_at`** (87 MB of text);
reads filter on `is_active` only, so expired ads are served as live —
a product-data finding independent of storage. Growth by `first_seen_at`:
08-10 backfill 41.5 k; then **≈ 12 k rows/week** (≈ 40 MB text + ≈ 15 MB
index per week). Translations: 0 rows (column unused so far).

## J. Capacity / forecast (measured base)

- User-canonical growth is negligible: 36 users ≈ 5 MB → ≈ 0.15 MB/user; at
  1 k / 10 k / 100 k users ≈ 0.15 / 1.5 / 15 GB **only if** journals, photos
  metadata and evidence scale linearly — canonical data is not the constraint.
- Market data dominates: **+≈ 55 MB/week** at the current stream cadence.
  Unchanged: 1 GB in ≈ 4 weeks, 8 GB in ≈ 2.5 years. With expired-ad
  lifecycle (deactivate + strip `description_raw` after expiry+30 d) the hot
  set plateaus around the active window (~45 k ads ≈ 150 MB).

| Option | Reclaim now | Growth after | Risk |
|---|---|---|---|
| 1 keep + upgrade | 0 | +55 MB/wk | none technical |
| 2 safe cleanup: drop 2 unused vacancy indexes | ≈ 85 MB | −15 MB/wk | reversible DDL |
| 3 retention: expired ads → inactive + text stripped | ≈ 90 MB now | plateaus | product semantics (expired ads are not live) |
| 4 ESCO labels → 12 usable locales | ≈ 235 MB | 0 | reproducible from ESCO release |
| 5 combination 2+3+4 | **≈ 410 MB → ≈ 380 MB total** | plateau | all reversible |

Every option is **OWNER_GATE** (DDL / retention). None was executed.

## K. Security / privacy

- **P1 — `mailer_autoconfirm = true` in production.** A signup with any email
  is confirmed without proving ownership. Combined with Google enabled, an
  attacker who registers `victim@…` first holds a "confirmed" password account
  under the victim's email; identity-collision behaviour on the victim's later
  Google sign-in depends on GoTrue's linking rules and was **not** tested
  against a real address (by design). The code comment says confirmation is
  off as a DI prerequisite. **OWNER_GATE:** Supabase dashboard → Authentication
  → Email → enable "Confirm email" (then the signup form's existing
  no-session branch takes over). Not changed by the agent.
- No tokens, codes or cookies in any log; `external_client.*` events carry
  classes only; the E2E scripts print ids and statuses only.
- RLS/tenant isolation: proven by the two-user isolation check and the
  immediate revocation at the door.

## L. Supabase plan (from measured evidence)

Free-plan overage is real (789–842 MB vs 500 MB). Restrictions **do not** yet
break production (reads/writes worked throughout this audit) but Supabase
warns of enforcement. Technically, options 2+3+4 bring the database to
≈ 380 MB **under** the Free quota with growth plateaued — so an upgrade is
**not** technically necessary *if* the owner approves the retention
semantics; without them the stream crosses 1 GB within a month and Pro
(8 GB) is the honest next threshold. Quota and efficiency remain separate
decisions; this audit supplies the numbers, not the choice.

## Owner gates (exact)

1. **DDL, reversible:** `drop index concurrently public.public_vacancies_fulltext_idx;`
   and `…_skill_slugs_idx;` (rollback = the `create index` statements in
   `20260809160000_public_vacancy_persistence_v1.sql`). ≈ 85 MB.
2. **Retention policy decision:** deactivate ads past `expires_at` (+30 d) and
   null `description_raw` for them; keep `title_raw`, ids, dates, hashes.
   Dry-run count 25,635 rows / 87 MB today.
3. **ESCO locale scope:** delete `esco_labels` rows for locales outside the
   12 the product can use (dry-run 575,407 rows), or partition. Re-importable.
4. **Auth:** enable email confirmation (K).
5. **Plan:** decide upgrade vs. 1–3.

*Nothing in F–L was executed. Evidence queries are in this session's record.*
