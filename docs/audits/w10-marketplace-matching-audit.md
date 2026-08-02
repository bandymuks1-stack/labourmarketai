# W10 — Marketplace & Matching: read-only audit

- **Worktree**: `C:\Users\Mano\Documents\labourmarketai-w10-audit`
- **Branch**: `audit/w10-marketplace-matching`
- **Base**: `origin/main` @ `c05a48026b945c14a42a76a34cb1c90ce9113e87`
- **Mode**: READ-ONLY. No code, migration, test or config file was modified. No build, no test run, no dev server, no Playwright, no Supabase/DB call of any kind.
- **Date**: 2026-08-02

## How to read this document

Every claim carries a `file:line` citation against the worktree above. Where a claim
could only be settled by running the application or querying the database, it is
marked **UNVERIFIABLE-STATICALLY** and stated as a question, not as a fact.

The distinction between "exists in code" and "reachable by a real user" is enforced
throughout: a surface is only called reachable when the route, its auth gate and its
data path were all traced to a real table or RPC.

---

## 1. Architecture map of the marketplace / matching domain

### 1.1 There are TWO demand tables, and they do not talk to each other

| Table | Created | Feeds | Does NOT feed |
|---|---|---|---|
| `customer_requests` | `supabase/migrations/0028_customer_requests.sql` | worker opportunity board, employer scouting, admin matching workbench | the market map |
| `job_demands` | `supabase/migrations/0001_initial_schema.sql:155` | the market map / `?result=market` | matching, scouting, the worker board |

- The market result reads `job_demands` joined to `projects` for geography:
  `apps/web/lib/market-map/market-result.ts:65-69`
  ```ts
  .from("job_demands")
  .select("headcount_needed, projects(country, city, title)")
  .eq("status", "open")
  .limit(500);
  ```
- Everything a worker can actually act on comes from `customer_requests` via
  `list_open_demand_for_workers()` — `apps/web/lib/opportunities/load-worker-opportunities.ts:149`.

**Consequence**: the demand a worker sees on the map (`?result=market`,
`/dashboard/market-map`) is a *different dataset* from the demand they can express
interest in (`?result=opportunities`, `/dashboard/opportunities`). A worker can see
"12 people needed in Rotterdam" on the map and find zero corresponding opportunities,
with no explanation. Classification: **MISLEADING** (§6, P1-1).

### 1.2 The matching engine and its composition

```
lib/market/fit.ts            computeContextFit()   pure set coverage |Y∩C|/|Y|
        ▲
lib/market/match-v1.ts       matchWorkerToNeed()   THE canonical engine (1361 lines)
        │                    compareMatches()      THE canonical comparator
        ├── lib/market/match-criteria-v2.ts        pure comparators + criterion vocabulary
        ├── lib/evidence/evidence-tier.ts          the ONE evidence ladder
        └── lib/taxonomy/profession-skills.ts      professionRelatedness()

lib/market/match-team-v1.ts  matchTeamToNeed()     composes matchWorkerToNeed per member
```

Need assembly — **two different builders, and this is the domain's central defect**:

| Builder | File | Used by | Carries |
|---|---|---|---|
| `buildNeedFromRequestRow` | `lib/market/need-from-request.ts:33-67` | employer scouting, admin workbench | skills, profession, country, city, **languages**, **structuredV2** |
| `needFromRoleText` | `lib/opportunities/opportunity-need.ts:11-33` | the worker board, express-interest | skills, profession, country, city — **and nothing else** |

Subject assembly — **also two builders, with different field coverage**:

| Builder | File | Used by | Sets |
|---|---|---|---|
| `buildSupplyCandidates` | `lib/market/match-subject.ts:53-220` | scouting, admin workbench | skills, profession, country, preferredCountries, availability, **salaryMinEur**, preferredContractType, **experienceYears**, MP-1/MP-2 mirrors — **never `city`, never `lat/lng`** |
| `buildOwnWorkerContext` | `lib/opportunities/worker-subject.ts:47-175` | worker board, express-interest | skills, profession, country, **city** (preferred_locations), preferredCountries, availability, preferredContractType, MP-1/MP-2 mirrors — **never `salaryMinEur`, never `accommodationNeeded`, never `experienceYears`, never `lat/lng`** |

Consumers of the engine (verified by `grep -rn "matchWorkerToNeed\|compareMatches"`,
excluding tests):

| Surface | Entry | Auth | Classification |
|---|---|---|---|
| Worker opportunity board | `lib/opportunities/load-worker-opportunities.ts:187` | worker role | **PARTIAL** |
| Express interest | `lib/opportunities/interest.ts:89` | worker role | **PARTIAL** |
| Job recommendations (`?result=opportunities`) | `lib/opportunities/recommendations-model.ts:151` | worker, personal context | **PARTIAL** |
| Employer scouting | `lib/scouting/scouting.ts:290,305` | self-granted `company` role | **PARTIAL** |
| Admin matching workbench | `app/[locale]/dashboard/admin/matching/page.tsx:335,338,453` | superadmin | **PARTIAL** |
| `explainTopMatches` | `lib/market/recognition/match-explanation.ts:42` | — | **DEAD** (see §5.4) |
| `/match-preview` (public) | `lib/staffing/match-preview-actions.ts:61` | anonymous | **PARTIAL**, frozen legacy fork |

### 1.3 Canonical Workspace Results (`?result=`)

`apps/web/lib/conversation/result-registry.ts`:

| `?result=` | lines | `openedBy` | contexts | `dataReadiness` |
|---|---|---|---|---|
| `market` | :145-164 | `worker.what-next` | personal, organization | `real` (:163) |
| `opportunities` | :165-185 | `worker.express-interest` | **personal only** (:176) | `real` (:184) |

- `canRenderInline` gates on `dataReadiness === "real" && contexts.includes(context)`
  only — `result-registry.ts:303-307`. **It does not consult the action registry's
  `allowedRoles`.** `worker.express-interest` is worker-only
  (`lib/conversation/action-registry.ts:256`), yet any authenticated user in personal
  context who types `?result=opportunities` reaches the panel. It degrades to
  `{kind:"no-worker"}` (`lib/marketplace/worker-opportunities-actions.ts:77`), so this
  is a defence-in-depth gap, not a leak. Classification: **PARTIAL**.

**There is NO `?result=` for employer candidate discovery.** Scouting is reachable
only through the route `/dashboard/company/scouting`. The canonical chat-first
architecture therefore covers the worker side of the marketplace and not the employer
side. Classification: **MISSING**.

---

## 2. Signal inventory — every signal that feeds matching, and its true source

| # | Signal | True source (table.column) | Reaches the engine? | Notes |
|---|---|---|---|---|
| 1 | Required skills | `customer_requests.payload.structured_need.skill_slugs` | scouting/workbench: yes. Worker board: **NO** — derived from `role_or_work_type` text only | `need-skills.ts:99-107` vs `opportunity-need.ts:18-20` |
| 2 | Required skills (fallback) | offline recognizer over demand free text | yes | `need-skills.ts:139-157`, capped at 8 (`:71`) |
| 3 | Required skills (fallback 2) | static `profession_skills` mirror | yes | `need-skills.ts:160-171` |
| 4 | Held skills | `worker_skills` ⋈ `skills.slug` | yes | `match-subject.ts:91,123`; `worker-subject.ts:96-102` |
| 5 | Evidence tier | `worker_skills.verified` then `worker_skills.source` | yes | `evidence-tier.ts:41-48`; weights `match-v1.ts:82-86` |
| 6 | Profession | `worker_professions ⋈ professions.slug` vs detected/structured need profession | yes | `match-subject.ts:95,133-143` |
| 7 | Profession relatedness | static 232-link `profession_skills` mirror, Jaccard ≥ 0.2 | yes | `match-v1.ts:545-546` |
| 8 | Country | `workers.current_location_country` | yes | `match-v1.ts:495-504` |
| 9 | Mobility | `workers.preferred_countries` (∪ `preferred_locations.country_code` worker-side) | yes | `worker-subject.ts:116-125` |
| 10 | City | worker: `preferred_locations.city`; demand: `company_demand_locations.city`/`location_label` | **worker board only** — `buildSupplyCandidates` never sets `subject.city` | `worker-subject.ts:157`; `scouting.ts:209-216` |
| 11 | Coordinates + radius | *nothing* | **NEVER** — see §5.1 | `match-v1.ts:469-486` is unreachable |
| 12 | Availability | `workers.availability_status` (self-set enum) | yes | write path `lib/conversation/worker-executors.ts:98-110` |
| 13 | Available-from | `workers.available_from` (self-set date) | yes | same |
| 14 | Languages (legacy) | `customer_requests.language_requirement` split on `,;/` | **scouting/workbench only** | `need-from-request.ts:45-48` |
| 15 | Languages (CEFR) | `worker_languages(lang, level)` × `structured_v2.requirements.languages` | **scouting/workbench only** | `match-subject.ts:107-114` |
| 16 | Pay expectation | `workers.salary_min_eur` | **scouting/workbench only** — `worker-subject.ts` never sets it | `match-subject.ts:197` |
| 17 | Pay offered | `structured_v2.compensation` | **scouting/workbench only** | `match-v1.ts:671` |
| 18 | Engagement form | `workers.preferred_contract_type` × `structured_v2.engagement_form` | **scouting/workbench only** | `match-v1.ts:753-788` |
| 19 | Driving licences | `workers.driving_licence_categories` × `structured_v2.transport.licence_categories` | **scouting/workbench only** | `match-v1.ts:860-913` |
| 20 | Own vehicle / own tools | `workers.own_vehicle` / `workers.own_tools` | **scouting/workbench only** | `match-v1.ts:920-1025` |
| 21 | Pay basis | `workers.pay_basis_preference` | **scouting/workbench only** | `match-v1.ts:1029` |
| 22 | Night / weekend shifts | `workers.night_shifts_ok` / `weekend_shifts_ok` | **scouting/workbench only** | `match-v1.ts:1065-1145` |
| 23 | Overtime | `workers.overtime_ok` | **scouting/workbench only** | `match-v1.ts:1150-1180` |
| 24 | Min experience | `workers.experience_years` (`0001_initial_schema.sql:52`) | scouting/workbench, and only when the author set a priority tier | `match-v1.ts:1188-1235` |
| 25 | Accommodation | `workers.accommodation_needed` × `structured_v2.accommodation.state` | **scouting/workbench only** | `match-v1.ts:644-657`, `1242-1307` |
| 26 | Profile freshness | `workers.updated_at` (fallback `created_at`) | **RANKED ABOVE FIT** — see §3 | `profile-freshness.ts:29-49` |
| 27 | Approved supply route | `companies.verification_status = 'verified'` | gates *visibility*, not score | `20260702170000_worker_demand_approved_route_model_a.sql:88` |

### 2.1 Signals that are explicitly NOT used (doctrine checks 1 and 2 — PASS)

Verified by exhaustive grep across `apps/web`:

- **`trust_score`** — the column exists (`0001_initial_schema.sql:59,111`;
  `0013_work_journal_m1.sql:43`) but no matching, scouting or opportunity module reads
  it. The only surface referencing a company score is
  `components/app/company-score-ring.tsx`, mounted exclusively on the public marketing
  page `/for-companies` (`app/[locale]/(marketing)/for-companies/page.tsx:48`) against
  a declared placeholder (`content/placeholders.ts:961-975`, `status: "placeholder"`,
  label reads `"(sample)"` / `"(pavyzdys)"`). **PASS**, with a P2 caveat in §6.
- **`computeConfidence`** — defined at `lib/journal/confidence.ts:59` and imported by
  exactly one file, `lib/journal/confirm-actions.ts:5`. It never reaches matching.
  Its self-inflation cap (`SELF_LOGGED_CONFIDENCE_CAP = 15`, `confidence.ts:25`) is
  real. **PASS**.
- **W6 experience records** — `lib/trust/experience-records.ts` is consumed only by
  `lib/trust/experience-*`, `app/[locale]/dashboard/admin/page.tsx:11` and the
  `experiences` result components. `grep -rn "@/lib/trust/" lib/scouting lib/market
  lib/opportunities lib/marketplace lib/admin` returns **zero hits**. Unapplied W6
  data does not leak into matching. **PASS**.
- **Fraud / risk signals** — `deriveJobDemandRiskFlags` (`lib/market/recognition/risk-flags.ts:15`)
  operates on *demand posts* (missing pay/hours/employer fields), never on workers, and
  is not a verdict in `matchWorkerToNeed`. **PASS**.
- **Learning signals** — `grep -rn "@/lib/learning" lib/scouting lib/market
  lib/opportunities lib/marketplace` returns **zero hits**. **PASS**.
- **Star ratings** — none found in any matching path.

---

## 3. The actual ranking formula as implemented

### 3.1 Status classification (`lib/market/match-v1.ts:1309-1323`)

```ts
  let status: MatchStatus;
  if (skillFit.matchedTotal === 0) status = "weak";
  else if (evidenceWeightedCoverage >= 0.8) status = "strong";
  else if (evidenceWeightedCoverage >= 0.5) status = "possible";
  else status = "weak";

  if (hardBlock && matchStrengthOrder(status) > matchStrengthOrder("weak")) status = "weak";
  if (softCap && matchStrengthOrder(status) > matchStrengthOrder("possible")) status = "possible";

  const eligible = !hardBlock && blocking.length === 0;
```

where (`match-v1.ts:82-86`, `:403-414`):

```ts
const EVIDENCE_WEIGHT: Record<EvidenceTier, number> = {
  manager_confirmed: 1.0,
  work_journal: 0.7,
  self_declared: 0.4,
};
...
  const evidenceWeightedCoverage =
    skillFit.needTotal > 0 ? weightedMatched / skillFit.needTotal : 0;
```

Ceilings that follow arithmetically:

| All matched skills at tier | Max `evidenceWeightedCoverage` at 100% coverage | Max status |
|---|---|---|
| `self_declared` | 0.40 | **weak** |
| `work_journal` | 0.70 | **possible** |
| `manager_confirmed` | 1.00 | **strong** |

This is a genuinely well-designed ladder: self-declaration alone can never leave
"weak", and journal volume alone can never reach "strong".

### 3.2 The comparator (`lib/market/match-v1.ts:309-320`)

```ts
export function compareMatches(a: MatchResultV1, b: MatchResultV1): number {
  const s = matchStrengthOrder(b.status) - matchStrengthOrder(a.status);
  if (s !== 0) return s;
  const pa = a.skillFit?.pct ?? 0;
  const pb = b.skillFit?.pct ?? 0;
  if (pb !== pa) return pb - pa;
  const ca = a.skillFit?.matchedConfirmed ?? 0;
  const cb = b.skillFit?.matchedConfirmed ?? 0;
  if (cb !== ca) return cb - ca;
  const AV: Record<MatchAvailability, number> = { available: 3, busy: 2, unknown: 1, unavailable: 0 };
  return AV[b.availability] - AV[a.availability];
}
```

Deterministic and pure. Note that `matchedConfirmed` here counts **manager-confirmed
only** (`fit.ts:56`), not journal — so the third tie-break is a genuine competence
signal.

### 3.3 The employer ordering ACTUALLY used (`lib/scouting/scouting.ts:301-306`)

```ts
    .sort(
      (a, b) =>
        freshnessDemotionRank(a.lastActiveBucket) -
          freshnessDemotionRank(b.lastActiveBucket) ||
        compareMatches(a.match, b.match),
    );
```

with (`lib/scouting/profile-freshness.ts:47-49`):

```ts
export function freshnessDemotionRank(bucket: LastActiveBucket): number {
  return bucket === "dormant" ? 1 : 0;
}
```

`dormant` = `workers.updated_at` older than 90 days (`profile-freshness.ts:24,42`).

**This is the real formula.** Profile-touch recency is the PRIMARY sort key; fit is
only the tie-break. A `strong`, 100%-coverage, fully manager-confirmed candidate whose
profile row has not been written in 91 days ranks **below** an `insufficient_data`
candidate who saved a field yesterday. See §4.2.

### 3.4 The worker-board ordering (`lib/opportunities/load-worker-opportunities.ts:207`)

```ts
        .sort((a, b) => compareMatches(a.match, b.match));
```

Clean — `compareMatches` only. `sortDiscoveryCards` (`lib/opportunities/discovery-filters.ts:103-116`)
then optionally re-sorts by `createdAt` when the user picks "newest"; "relevance" is a
pass-through.

### 3.5 Determinism verdict

The engine is deterministic (pure, no `Math.random`, no `Date.now` in the scoring
path — `now` only enters via `lastActiveBucket`, which is time-dependent by design).
`Array.prototype.sort` is stable in every supported runtime.

**But the input order is not pinned.** `buildSupplyCandidates` orders by
`created_at DESC` with no tiebreaker (`match-subject.ts:61`); Postgres does not
guarantee a stable order for equal `created_at` values. Two workers registered in the
same transaction can swap positions between renders. Classification: **PARTIAL**
(deterministic function, non-deterministic input).

---

## 4. Gameability analysis

### 4.1 The evidence ladder is hard to game — genuine credit

To reach `strong`, a worker needs `worker_skills.verified = true` on ≥80% of the
need's skills (`match-v1.ts:1312` with weight 1.0). `verified` is set by manager
confirmation, not self-service. `sourceToEvidence` (`evidence-tier.ts:30-34`) falls to
the weakest tier for any unknown source — it never inflates. A worker who writes 10 000
journal entries still caps at `possible`. This is the correct design and it holds.

### 4.2 **Profile-touch farming beats competence** (highest-value exploit)

Because `freshnessDemotionRank` sorts before `compareMatches`
(`scouting.ts:301-306`), and the bucket derives from `workers.updated_at`
(`match-subject.ts:187-189`), any write to the worker's own row resets it to `active`.

Concrete: a fraudulent account with zero skills and zero confirmations that touches its
`workers` row once every 89 days permanently outranks every candidate whose profile has
gone quiet — including manager-confirmed 100%-coverage matches. Cost to the attacker:
one form save per quarter. There is no rate limit on the profile write path
(`lib/conversation/worker-executors.ts:98-110` → `saveWorkerCardAction`).

Classification: **MISLEADING** ranking. This is an activity signal ranked above a
competence signal — the shape doctrine check #1 forbids, even though no "score" column
is involved.

### 4.3 **Registration-recency farming beats everything** (structural)

`buildSupplyCandidates` (`match-subject.ts:56-62`):

```ts
    .from("workers")
    .select("id, profile_id, display_name, ... created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(200);
```

There is **no demand-related predicate at all** — not country, not skill, not
profession, not availability. The candidate pool is the 200 most recently *registered*
visible workers. Every filter, every match computation and the entire ranking run in
memory *after* this truncation (`scouting.ts:280-306`).

Exploit: create fresh worker accounts. The newest 200 own the entire employer-visible
supply; the 201st is unreachable by any employer for any demand, regardless of fit.
And `add_role('company')` is self-service (`supabase/migrations/0007_add_role_rpc.sql:24-44,108-109`),
so the attacker can also occupy the employer side.

**UNVERIFIABLE-STATICALLY**: whether `count(*) from workers where can_view_worker(id)`
currently exceeds 200. Below 200 the cap is invisible; above it, this is a silent,
permanent exclusion with no UI disclosure — I found no "showing 200 of N" state
anywhere in `app/[locale]/dashboard/company/scouting/page.tsx`.

### 4.4 Free-text keyword stuffing on the demand side

`recognizeFromText` (`need-skills.ts:139-157`) runs the offline recognizer over
`title + role_or_work_type + need_summary + notes`, capped at 8 slugs
(`need-skills.ts:71`) and excluding the fuzzy tier (`:147-148`). A demand author who
stuffs 8 recognizable skill words gets a fully "structured" need without ever using the
structuring UI — and `needSource` is honestly flagged `recognized_from_text`
(`need-skills.ts:153`), which pushes `nextAction` to `confirm_recognized_need`
(`match-v1.ts:1337-1342`). Mitigated, not exploitable for rank. **PASS**.

### 4.5 Skill-slug spraying by the worker

A worker can self-declare every catalogue slug. Coverage → 100%, but all at
`self_declared` weight 0.4 → capped at `weak` (`match-v1.ts:1314`). However
`compareMatches` tie-break #2 is `skillFit.pct` (`match-v1.ts:312-314`), which is
**tier-blind** (`fit.ts:60`). So among `weak` candidates, the sprayer sorts to the
top. On a board where nothing is manager-confirmed — the realistic early state — every
candidate is `weak` and the sprayer wins the whole list. Classification: **PARTIAL**
containment. P2.

### 4.6 What is NOT gameable

- Approved-route visibility keys on `companies.verification_status = 'verified'`,
  which is admin-only reachable (documented at
  `20260702170000_worker_demand_approved_route_model_a.sql:9-13`). A company cannot
  self-verify.
- `demand_shortlist` writes are owner-scoped (`scouting.ts:390`).
- Contact details are never in the scouting payload —
  `canViewWorkerContact()` returns literal `false`
  (`lib/visibility/worker-profile-visibility.ts:216-218`) and `assertContactSafe`
  throws on a forbidden key (`lib/scouting/scout-safe-view.ts:91`).

---

## 5. Worker surfaces and employer surfaces

### 5.1 Dead geography — the radius branch can never fire

`match-v1.ts:469-486` implements a haversine radius check requiring
`need.lat && need.lng && need.radiusKm && subject.lat && subject.lng`.

- `grep -rn "radiusKm" lib/ app/ components/` (non-test) returns hits only in
  `lib/location/location-model.ts` (a UI preference model),
  `components/app/market-map/location-map.tsx` (Leaflet circle rendering),
  `components/app/market-map-base.tsx` and `match-v1.ts` itself.
- **No builder anywhere assembles `lat`/`lng`/`radiusKm` into a `MatchNeed` or
  `MatchSubject`.** `buildNeedFromRequestRow` (`need-from-request.ts:50-64`),
  `needFromRoleText` (`opportunity-need.ts:21-30`), `buildSupplyCandidates`
  (`match-subject.ts:190-217`) and `buildOwnWorkerContext` (`worker-subject.ts:153-173`)
  all omit them.
- `preferred_locations` has **no coordinate columns** at all
  (`supabase/migrations/20260617120000_market_map_data_model_v1.sql:44-71`).
- `company_demand_locations` *does* carry `latitude`/`longitude` with a
  `geocode_status` ladder (`supabase/migrations/20260615120000_company_demand_locations.sql:56-71`),
  but `scouting.ts:209-216` selects only `city, location_label, active, updated_at`.
- Localized strings for the unreachable reason exist in all 11 locales, e.g.
  `apps/web/messages/en.json:7003` `"location_within_radius": "Within the work radius"`.

**The root cause is schema, not wiring.** `public.workers` has no coordinate columns at
all (`supabase/migrations/0001_initial_schema.sql:45-63` — `current_location_country`,
`preferred_countries`, no `latitude`/`longitude`), and `preferred_locations` has none
by design (`20260617120000_market_map_data_model_v1.sql:45-73`). `subject.lat` is not
merely unassembled; there is no column it could come from.

The repo already knows and documents it: `lib/guards/location-matching.test.ts:75-80`
asserts *"no coordinates → radius tier never fires"*.

Classification: **DEAD**. The reason code `location_within_radius`, the gap code
`location_outside_radius` and `distanceKm()` are unreachable in every production path.

### 5.1a No geocoder exists, so demand coordinates can never become usable

`company_demand_locations` carries `latitude`/`longitude`/`geo_precision`/`geocode_status`
(`supabase/migrations/20260615120000_company_demand_locations.sql:52-57`) with CHECKs
allowing coordinates only when `geocode_status in ('verified','manual')` (`:70-71`).

The only writer pins the row un-geocoded — `lib/demand/demand-location.ts:155-158`
(`latitude: null, longitude: null, geocode_status: "pending"`), and
`20260615210000_company_demand_locations_signal_only_write.sql:54` restricts owner
inserts to `pending`/`manual`. **No geocoder exists anywhere**; a guard bans every
provider host (`lib/guards/location-matching.test.ts:98-110`). `demand-locations.ts:72`
requires `verified`/`manual` for mappability, so owner-created demand locations are
permanently unmappable. Classification: **STUB** (schema built, populator absent).

### 5.2 The `city` tier fires on one side only — and that is deliberate

`buildOwnWorkerContext` sets `city` from `preferred_locations`
(`worker-subject.ts:115,157`). `buildSupplyCandidates` **never sets `subject.city`**
(`match-subject.ts:190-217`). Meanwhile the employer path *does* set `need.city` from
`company_demand_locations` (`scouting.ts:205-221`).

This is **not an oversight**: a guard forbids the employer-facing supply builder from
reading `preferred_locations` at all (`lib/guards/location-matching.test.ts:164-165`),
because those rows are the worker's private location intent (§20). Employer-side
geography is therefore country-granularity **by design**.

The consequence still needs stating plainly, because it is invisible to users:
`city_match` (`match-v1.ts:487-494`) can fire on the worker board and can **never** fire
in scouting or the admin workbench. The same (worker, need) pair yields a different
`MatchResultV1` depending on who is looking, and nothing in either UI says so.
Classification: **PARTIAL** (correct privacy design, undisclosed asymmetry).

### 5.3 The worker board matches on a *reduced* need

`load-worker-opportunities.ts:182-187`:

```ts
          const { need: matchNeed } = needFromRoleText(
            need.roleText,
            need.country,
            need.locationLabel ?? null,
          );
          const match = matchWorkerToNeed(matchNeed, ctx.subject);
```

`needFromRoleText` (`opportunity-need.ts:11-33`) passes **only**
`roleOrWorkType` into `deriveNeedSkills`. It sets no `languages`, no
`payOfferedEurMax`, no `accommodationProvided`, and **no `structuredV2`**.

Yet three lines later the same row's structured demand IS read, for display:

```ts
            structured: readStructuredDemandPublic(row),   // :203
```

**Consequence**: the worker card shows the employer's pay, hours, shift pattern,
licence requirements, engagement form and accommodation terms — and the match status
next to them was computed **ignoring every one of those facts**. All 8 contract-v2.1
mirrored dimensions plus compensation, engagement form and start date are structurally
unreachable on the worker board.

Additionally, because `payload` is never passed, `deriveNeedSkills` can never return
`human_structured` (`need-skills.ts:99-107`) on this path. `needSource` is always
`recognized_from_text`, `profession_expanded` or `null`, so
`missingData` always contains `need_recognized_not_confirmed` (`match-v1.ts:392-394`)
even for a demand the company fully structured.

Classification: **MISLEADING**. This is the clearest violation of critical check #3
(match explanation must accurately describe the real signals used).

### 5.4 Two additional fit engines exist beside the canonical one

1. **`computeOpportunityFit`** (`lib/opportunities/opportunity-fit.ts:97-127`) — a
   *readiness* check (has work type / has skills / has documents / country /
   availability). It runs alongside `matchWorkerToNeed` on the same card
   (`load-worker-opportunities.ts:181,187`). The visible chips come from
   `buildMatchCardView` (`lib/opportunities/match-card-view.ts:51-68`) → rendered by
   `components/app/match-signals.tsx` at
   `app/[locale]/dashboard/opportunities/page.tsx:859-860`.

   Its 5 signals — `workType`, `skills`, `country`, `availability`, `documents`
   (`match-card-view.ts:56-62`) — are **profile-completeness facts, not match facts**.
   `{key:"skills", state: profile.hasSkills ? "fit" : "check"}` is green when the
   worker has *any* skill, even if none of the need's skills are held. And
   `countrySignal` (`match-card-view.ts:43-49`) uses
   `readiness.countries`, which `load-worker-opportunities.ts:127-129` populates from
   `current_location_country` **only**, ignoring `preferred_countries` — so a worker the
   engine credits with `mobility_match` (`match-v1.ts:505-512`) gets an amber "check"
   chip on the same card.

   Classification: **MISLEADING**. A UI labelled "why this fits" that reports profile
   completeness.

2. **`computeStaffingFit`** (`lib/staffing/fit.ts:144-156`) — a frozen 5-dimension
   fork, explicitly marked `⛔ DEPRECATED — FROZEN LEGACY FORK` (`fit.ts:1-18`), with a
   guard allowlist (`lib/guards/staffing-fit-frozen.test.ts`). It powers the **public,
   anonymous** `/match-preview` page (`app/[locale]/(marketing)/match-preview/page.tsx`)
   via `previewMatchAction` (`lib/staffing/match-preview-actions.ts:61`), and produces a
   `MatchScore` object (`lib/staffing/match-preview.ts:23-41`) — a count of
   fit/mismatch/unknown dimensions, explicitly not a percentage. It persists nothing
   (`match-preview-actions.ts:12-15`). Classification: **PARTIAL** — honestly frozen
   and honestly labelled, but it is a second engine reachable by anonymous users, and
   it disagrees with the canonical engine by construction.

3. **`explainTopMatches`** (`lib/market/recognition/match-explanation.ts:42-64`) — a
   third wrapper. `grep -rn "explainTopMatches"` finds only its definition and a
   re-export at `lib/market/recognition/index.ts:22`. **No caller.** Classification:
   **DEAD**. Note it also sorts by `matchStrengthOrder` alone (`:60-62`), not
   `compareMatches`, so if ever wired it would rank differently from every other
   surface.

### 5.5 Worker surfaces — classification table

| Surface | Route / entry | Auth | Data path | Classification |
|---|---|---|---|---|
| Opportunity board | `/dashboard/opportunities` | worker role (`page.tsx:99`) | `list_open_demand_for_workers()` → in-memory match | **PARTIAL** (see 5.3) |
| Opportunities result | `?result=opportunities` | worker, personal ctx | `getWorkerJobRecommendations`, limit 3 (`recommendations.ts:117,148`) | **PARTIAL** |
| Market map / market result | `/dashboard/market-map`, `?result=market` | session | `job_demands ⋈ projects`, `.limit(500)` | **PARTIAL** — different dataset from the board (§1.1) |
| Discovery filters | query params on the board | worker | `discovery-filters.ts:79-92`, real AND-semantics | **FULL** — filters do filter, in memory |
| Express interest | board CTA | worker | `demand_interest_signals` | **PARTIAL** — re-runs the whole board RPC to validate one id (`interest.ts:72-77`) |
| Saved opportunities | board | worker | `worker_saved_opportunities` | **PARTIAL** — owner-gated store |
| Marketplace listings | `/dashboard/listings` | **session only, any role** | `marketplace_listings` | **PARTIAL** — `discoverMarketplaceListings(filters?)` has `category`/`listingKind` params no caller passes (`lib/marketplace/listings.ts:111-133`); the route calls it bare (`app/[locale]/dashboard/listings/page.tsx:46`) and has no filter UI. Filters exist in code, unreachable by a user |
| Service requests | `/dashboard/service-requests` | session only | `service_offerings`, `service_offering_requests` | **PARTIAL** — `listDiscoverableOfferings()` has **no `.limit()` and no filters** (`service-requests.ts:87-114`) |
| Trust cards on the board | `/dashboard/opportunities:440-460` | worker | `buildOpportunityInsightRow` (`lib/intelligence/trust-card-model.ts:639-653`) returns 1 real card + 4 `buildUnavailableTrustCard(...)` stubs | **STUB** (4 of 5) |
| Dashboard search | `/api/dashboard-search` | session (`route.ts:31-36`) | journal, projects, tasks, finance, conversations, bookings, documents | **MISSING** for this domain — searches **no** marketplace source (`lib/search/dashboard-search.ts:233-241`) |
| `/work-opportunities` (public) | anonymous | — | 100% static copy, no DB | **MISLEADING** route name — no opportunities are listed |
| `/match-preview` (public) | anonymous | frozen fork | **PARTIAL** (§5.4) |
| `/for-agencies` pool preview | anonymous | `content/placeholders.ts` | fabricated pool sizes, wrapped in `ExamplePreviewFrame` | **STUB**, labelled |

### 5.6 Employer surfaces — classification table

| Surface | Route / entry | Auth | Data path | Classification |
|---|---|---|---|---|
| Scouting | `/dashboard/company/scouting` | `requireRoleOrRedirect(locale,"company")` (`page.tsx:92`) + `resolveEmployerCompanyContext()` (`:101-117`) | `customer_requests` (own) × `buildSupplyCandidates` (200 cap) | **PARTIAL** (§4.3) |
| Scout filters | chips on the same page | company | `scout-filters.ts:117-139`, in memory post-cap | **PARTIAL** — the `country` filter compares `subject.country` only (`scout-filters.ts:126-129`), so it *excludes* workers the engine credits with `mobility_match` |
| Shortlist | scouting page | company, `owner_id` scoped | `demand_shortlist` | **FULL** |
| Contact disclosure | scouting page | company | `contact_disclosure_requests` + append-only grant RPC | **PARTIAL** — see P1-4 |
| Admin matching workbench | `/dashboard/admin/matching` | `requireSuperadmin` (`page.tsx:73`) | `customer_requests` (all) × `buildSupplyCandidates` | **PARTIAL** — lists **all** workers (`lib/admin/matching-workbench.ts:272-277`, no `.limit()`) but only the 200 from `buildSupplyCandidates` get a `subject` (`:377-386`); the rest render `subject: null` and no engine row |
| Workbench ESCO fit basis | same page | superadmin | `worker_skills ⋈ skills.esco_uri` (`matching-workbench.ts:300`) | **DEAD in practice** — the repo records 0/152 skills carrying an `esco_uri` (`lib/market/fit.ts:17-19`), so `escoSkills` is empty for every worker |
| Employer candidate `?result=` | — | — | — | **MISSING** (§1.3) |
| Team matching | `matchTeamToNeed` | via workbench (`page.tsx:453`) | `lib/company/team-match-input.ts` | **PARTIAL** — `visibilityState` hard-coded `"discoverable"` (`team-match-input.ts:240`) *because* `organizations` is world-readable |
| Admin liquidity metrics | `/dashboard/admin` | superadmin | `lib/admin/launch-readiness.ts:139-190` counts workers/companies/requests; verified-company count lives separately at `lib/admin/launch-signals.ts:56` | **PARTIAL** — the one number that gates the whole worker board (verified companies) is not on the readiness panel |

---

## 6. Findings, most severe first

### P0-1 — The worker board's match ignores the demand's structured requirements while displaying them

**Classification: MISLEADING** (critical check #3)

`load-worker-opportunities.ts:182-187` builds the `MatchNeed` from
`role_or_work_type` alone via `needFromRoleText` (`opportunity-need.ts:11-33`), while
`:203` reads the same row's structured demand for rendering.

**Failure scenario.** A verified NL contractor posts: engagement form `employment`,
gross €2 400, licence `C+CE` mandatory, night shifts, no accommodation. A worker whose
`preferred_contract_type = 'subcontract'`, who holds only licence `B`, and who has
`night_shifts_ok = false` opens the board. The card renders all four facts from
`structured`. The match beside them reads `strong` — because
`matchWorkerToNeed` received a need with `structuredV2: undefined`, so
`engagement_form` (`match-v1.ts:753`), `licence_categories` (`:861`) and
`night_shifts` (`:1093`) never evaluated and `blocking` is empty. The worker expresses
interest, the employer rejects on the first call. The product told the worker something
untrue about its own data.

**Also**: `needSource` can never be `human_structured` on this path
(`need-skills.ts:99-107` requires `payload`), so `need_recognized_not_confirmed`
(`match-v1.ts:392-394`) is emitted for demands the company fully structured.

---

### P0-2 — Employer candidate discovery ranks profile-touch recency above fit

**Classification: MISLEADING** (critical check #1 in substance — an activity signal
outranks a competence signal)

`scouting.ts:301-306` sorts `freshnessDemotionRank` **first** and `compareMatches`
**second**; `freshnessDemotionRank` (`profile-freshness.ts:47-49`) reads
`workers.updated_at` (`match-subject.ts:187-189`).

**Failure scenario.** Worker A: 100% coverage, all `manager_confirmed`, `strong`,
`eligible`, last profile write 91 days ago → bucket `dormant` → rank key 1.
Worker B: zero skills, `insufficient_data`, `eligible: false`, saved a field yesterday
→ bucket `active` → rank key 0. **B is listed above A on every demand.** The employer's
best candidate is pushed below every recently-active account, and the fix is a form
save, not competence.

The docstring at `profile-freshness.ts:12-16` claims the bucket "DEMOTES dormant
profiles in the ranking" — accurate; what is not stated anywhere in the UI is that the
demotion is *unconditional and primary*.

---

### P0-3 — The candidate pool is capped at the 200 newest registrations, with no demand predicate and no UI disclosure

**Classification: PARTIAL** (marketplace liquidity / "scoring must be testable")

`match-subject.ts:56-62` — `.order("created_at", {ascending:false}).limit(200)`, no
`.eq`, no `.in`, no `.filter` related to the demand. Every filter, every match and the
entire ranking then run in memory (`scouting.ts:280-306`).

**Failure scenario.** The platform reaches 500 discoverable workers. An employer posts
a demand for a welder in Rotterdam. The three qualified welders registered 8 months
ago. They are not in the newest 200, so they are not fetched, not matched, not
filtered, not ranked, and not shown. The scouting page shows "0 candidates" with no
indication that a cap was applied — I found no "showing 200 of N" state in
`app/[locale]/dashboard/company/scouting/page.tsx`. The employer concludes the
marketplace has no welders.

The facet chips are derived from the same 200 (`scout-filters.ts:73-96` via
`scouting.ts:280`), so the filter vocabulary silently narrows too.

**UNVERIFIABLE-STATICALLY**: whether the visible worker count currently exceeds 200.

---

### P1-1 — The map shows one demand table; the board shows another

**Classification: MISLEADING**

`?result=market` / `/dashboard/market-map` aggregate `job_demands`
(`market-result.ts:65-69`). `?result=opportunities` / `/dashboard/opportunities`
read `customer_requests` through `list_open_demand_for_workers()`
(`load-worker-opportunities.ts:149`). Nothing reconciles them.

**Failure scenario.** A worker opens the market result, sees demand concentrated in
Rotterdam, switches to opportunities, and finds nothing there. Both surfaces are
labelled `dataReadiness: "real"` (`result-registry.ts:163,184`), so the product
presents two incompatible pictures of "the market" as equally real.

---

### P1-2 — The visible "match signals" on the worker board report profile completeness, not match facts

**Classification: MISLEADING** (critical check #3)

`app/[locale]/dashboard/opportunities/page.tsx:859-860` renders
`buildMatchCardView(result.readiness, need).signals`
(`match-card-view.ts:51-68`) through `components/app/match-signals.tsx`, whose header
states it "Shows WHY a demand/supply pair fits" (`match-signals.tsx:6-7`).

Two of the five chips are structurally wrong as "why this fits":

- `{key:"skills", state: profile.hasSkills ? "fit" : "check"}` (`match-card-view.ts:58`)
  — green whenever the worker holds **any** skill, including zero overlap with the need.
- `countrySignal(need.country, profile.countries)` (`:59`, def `:43-49`) — and
  `readiness.countries` comes from `current_location_country` only
  (`load-worker-opportunities.ts:127-129`), ignoring `preferred_countries`. A worker
  the engine credits with `mobility_match` (`match-v1.ts:505-512`) gets an amber
  "check" chip on the same card.

The real engine output (`match.reasons` / `match.gaps` / `match.blocking`) is available
on the same object (`load-worker-opportunities.ts:196`) and is not what the chips show.

---

### P1-3 — Organization scope does not restrict marketplace or matching results anywhere

**Classification: BLOCKED_BY_W9_SCHEMA**

No candidate, demand, shortlist or marketplace query is organization-scoped. Every one
is keyed on `profile_id` / `owner_id`:

| Path | Scope key | Citation |
|---|---|---|
| demand list | `profile_id = user.id` | `scouting.ts:106` |
| demand read | `profile_id = user.id` | `scouting.ts:180` |
| shortlist read | `owner_id = user.id` | `scouting.ts:263` |
| shortlist write | `owner_id: user.id` | `scouting.ts:390` |
| candidate supply | **no filter at all** | `match-subject.ts:56-62` |
| worker board RPC | `companies.profile_id = customer_requests.profile_id` | `20260702170000_...sql:88` |

The repo states this accurately itself at
`lib/company/employer-company-context.ts:46-56`: `customer_requests`,
`demand_shortlist` and `booking_requests` carry no organization key.

The mitigation is a **surface gate** — `resolveEmployerCompanyContext`
(`employer-company-context.ts:129-236`), correctly fail-closed and called before every
scouting read (`scouting.ts:100,170`; `page.tsx:101`). But the isolation *argument*
is the `companies.profile_id` UNIQUE constraint standing in for a tenancy boundary
(`employer-company-context.ts:50-54`). Relax that constraint — a second company per
profile, or the deferred manager-level org collaboration (`:56-59`) — and every query
above leaks across workspaces with **no second line of defence**, because RLS is
profile-keyed too (`can_view_worker`,
`supabase/migrations/20260711130000_privacy_consent_and_disclosure_v1.sql:268-279`).

`company_memberships` does not exist as a table — the migration deliberately declines
to create it (`supabase/migrations/20260714210000_company_memberships_v1.sql:9-30`) and
is listed as deferred/unapplied (`docs/APPLIED_LEDGER.md:402`). The live workspace
pointer is an httpOnly cookie (`lib/company/active-organization.ts:53`), re-validated
against the membership list (`:308-312`) — that part holds.

**UNVERIFIABLE-STATICALLY**: how many profiles own more than one organization, and
whether `companies_profile_id_key` is present in the live schema.

---

### P1-4 — Contact-disclosure consent is attributed to the wrong organization

**Classification: BLOCKED_BY_W9_SCHEMA** (real defect today, root cause is the missing
org key)

`lib/privacy/contact-disclosure-actions.ts:83-101` resolves the asking organization as
the caller's **oldest owned non-team organization** (`.order("created_at", ascending)
.limit(1)`), bypassing `resolveEmployerCompanyContext()` entirely. That id is then
pinned into the append-only consent grant (`:180`, `:449`) and re-probed at `:270-278`.

**Failure scenario.** An owner of two organizations is acting in workspace B and asks a
worker to disclose contact details. The request, the worker's consent screen and the
resulting GDPR consent-ledger row all name **workspace A**. The worker consents to a
company they never dealt with.

Note this is the one place where the "one company per profile" assumption is not merely
relied upon — it is contradicted, since `.limit(1)` over an ordered set only makes
sense when more than one row is expected.

---

### P1-5 — `organizations` is world-readable to every authenticated user

**Classification: BLOCKED_BY_W9_SCHEMA** — confirmed

`supabase/migrations/0013_work_journal_m1.sql:327`:

```sql
create policy organizations_select on public.organizations for select using (true);
```

Writes are admin-only (`:328`); `grant select ... to authenticated` at `:409`.

**Failure scenario.** Any signed-up user enumerates every organization and every
`team` row — `legal_name`, `country`, `public_slug`, `legacy_company_id`. Combined with
`engagement_contexts` this is a route to team composition. `team-match-input.ts:236-240`
hard-codes a team's `visibilityState` to `"discoverable"` *because* of this policy —
the product has already conceded the point in code.

Documentation contradiction worth recording:
`supabase/migrations/20260714210000_company_memberships_v1.sql:52` asserts
"`organizations` SELECT stays owner-scoped". That statement is **false** against the
applied policy.

---

### P1-6 — The `company` role is self-service, so the employer side of the marketplace is unvetted

**Classification: PARTIAL**

`public.add_role(text, jsonb)` is `security definer`, accepts `'company'` with no
approval check, and is granted to `authenticated` —
`supabase/migrations/0007_add_role_rpc.sql:24-44`, `:108-109` (re-declared identically
at `supabase/migrations/0026_customer_entity.sql:176-206`). `is_employer()` is defined
purely as `active_role in ('company','agency')`
(`supabase/migrations/0003_multi_role.sql:101-107`), and that is the branch of
`can_view_worker` that opens the supply
(`20260711130000_privacy_consent_and_disclosure_v1.sql:257-265`).

**Failure scenario.** Any signed-up user clicks "add company role", becomes an
employer, and can browse the discoverable worker supply. The gate on worker data is the
worker's own discoverability consent — which is granted to *employers as a class*, not
to a named company (`worker_profile_discoverable`, `:224-243`). Consent, once given, is
consent to everyone.

---

### P1-7 — Availability is a self-set enum, presented without qualification

**Classification: PARTIAL** (critical check #4 — no false calendar claim found, but no
grounding either)

`workers.availability_status` is written by the worker through
`worker.save-work-card` → `saveWorkerCardAction`
(`lib/conversation/worker-executors.ts:98-110`). Nothing derives it from bookings,
leave or the calendar. `matchWorkerToNeed` reads it directly
(`match-v1.ts:342-348`, `:564-581`) and `compareMatches` uses it as the final
tie-break (`:318-319`).

Scouting renders it as a bare word — `t("availabilityValue.available")` = `"Available"`
(`app/[locale]/dashboard/company/scouting/page.tsx:610`; `messages/en.json`
`scouting.availabilityValue.available`), with `"Not stated"` for unknown. **No string
in the matching or scouting path claims calendar derivation**, so check #4 is not
violated outright. The one string that mentions a calendar is
`mapLayers.items.availability = "Availability / calendar"`, which is rendered inside
the explicitly-labelled **"Future layers / Preparing"** list
(`app/[locale]/dashboard/market-map/page.tsx:213-214,225`) — honest.

Residual risk: an employer reading "Available" against a candidate whose booking
calendar says otherwise has no way to tell the difference, and the booking data that
would resolve it is never joined.

---

### P2-1 — Skill-slug spraying wins ties because `skillFit.pct` is tier-blind

`compareMatches` tie-break #2 is `skillFit.pct` (`match-v1.ts:312-314`), computed as
`matchedUris.length / need.length` (`fit.ts:60`) with no tier weighting. In an
early-stage marketplace where nothing is manager-confirmed, every candidate is `weak`
(`match-v1.ts:1314`) and the ordering collapses onto raw self-declared coverage.
Suggested fix: tie-break on `evidenceWeightedCoverage` before `pct`.

### P2-2 — `explainTopMatches` is dead code that would rank differently if wired

`lib/market/recognition/match-explanation.ts:42-64`. No caller
(`grep -rn "explainTopMatches"` → definition + one re-export at
`lib/market/recognition/index.ts:22`). It sorts by `matchStrengthOrder` alone
(`:60-62`), not `compareMatches`. **DEAD**, and a future-drift hazard.

### P2-3 — Dead geography: `distanceKm` and the radius reason/gap codes are unreachable

See §5.1. `match-v1.ts:187-201`, `:469-486`; translations shipped in 11 locales
(`messages/en.json:7003` and siblings). Root cause is a missing column, not missing
wiring (`0001_initial_schema.sql:45-63`), and a guard already records the fact
(`lib/guards/location-matching.test.ts:75-80`).

### P2-3a — Matching reads no booking, absence or engagement data

Grep for `booking_requests` / `worker_absences` across `lib/market/`, `lib/scouting/`,
`lib/opportunities/`, `lib/marketplace/`, `lib/talent/`, `lib/candidates/` returns
**zero hits**. Every booking consumer is a personal planning surface
(`app/[locale]/dashboard/bookings/page.tsx:63`, `lib/planning/planning.ts:117`,
`lib/search/dashboard-search.ts:182`); `lib/planning/calendar-result.ts:24-27` states
it reads no table of its own.

**Failure scenario.** A worker holds an accepted booking that fully covers the demand
window. Their self-set enum still says `available`. The engine records
`available_now` as a weighted strength with `source: "workers.availability_status"`
(`match-v1.ts:571-578`) and ranks them top on the availability tie-break (`:318-319`).
The employer contacts a worker who is not free. Classification: **PARTIAL** — see also
P1-7 and the W12 note in §7.

### P2-3b — `available_from` without a status is silently dropped

`match-v1.ts:564-581`: the `availability_unknown` missing-fact fires only when **both**
`availabilityStatus` and `availableFrom` are null. A worker who set only
`available_from` reaches `:571`/`:579`, both of which `norm()` to `""` — so **no
reason, no strength, and no missingFact is recorded at all**. The fact vanishes rather
than being reported as unknown. (`availability` is still classified `"unknown"` at
`:347`, so nothing is fabricated — the fact is simply lost.)

### P2-3c — The public worker-intake form collects an availability date it never saves

`components/app/worker-intake-form.tsx:121-122` renders `name="available_from"`
(labelled at `app/[locale]/(marketing)/worker-intake/page.tsx:44`). Its action reads it
(`lib/staffing/worker-intake-form-actions.ts:51`) and passes it only into
`draftWorkerProfileFromIntake` (`:68-90`) to produce an AI suggestion. **There is no
`workers` write and no `save_worker_card` call in that file.** The user states when
they are available; nothing persists it and matching never sees it.
Classification: **MISLEADING** input.

### P2-4 — The scouting `country` filter contradicts the engine's mobility signal

`scout-filters.ts:126-129` compares `subject.country` only. `match-v1.ts:505-512`
credits `preferredCountries` as `mobility_match`. Filtering by country therefore hides
exactly the relocation-willing candidates the engine considers a fit.

### P2-5 — Unbounded and duplicated reads on the marketplace path

- `expressInterest` re-runs the entire board RPC to validate one id
  (`lib/opportunities/interest.ts:72-77`); a page-load plus one click is two full-board
  reads.
- `listDiscoverableOfferings()` has no `.limit()` and no filters
  (`lib/marketplace/service-requests.ts:87-114`).
- `worker_documents` is fetched in full only to be `.length`-ed
  (`load-worker-opportunities.ts:119-122`, `:133`) instead of
  `count:'exact', head:true`.
- `discoverMarketplaceListings(filters?)` accepts `category`/`listingKind` that no
  caller supplies (`lib/marketplace/listings.ts:111-133`; the only caller,
  `app/[locale]/dashboard/listings/page.tsx:46`, calls it bare).

### P2-6 — Ranking input order is not pinned

`match-subject.ts:61` orders by `created_at DESC` with no tiebreaker. Equal timestamps
have no guaranteed Postgres order, so the stable JS sort inherits an unstable input.
Add `.order("id")` as a secondary key to make ordering reproducible in tests.

### P2-7 — 4 of 5 "market context" trust cards on the worker board are stubs

`buildOpportunityInsightRow` (`lib/intelligence/trust-card-model.ts:639-653`) returns
one real salary card plus `buildUnavailableTrustCard("demand"|"supply"|"skill_gap"|"market_trend")`
(`:232-251`), rendered at `app/[locale]/dashboard/opportunities/page.tsx:440-460`.
Honest by label; 80% empty chrome on the primary worker job surface. **STUB**.

### P2-8 — `/work-opportunities` is a public route with no opportunities

`app/[locale]/(marketing)/work-opportunities/page.tsx` — 100% static copy, zero DB
reads (verified: `grep` for `createClient`/`supabase`/`from(` across
`app/[locale]/(marketing)` returns nothing). **MISLEADING** route name.

### P2-9 — Public company score ring shows a tier that no signal produces

`components/app/company-score-ring.tsx:24-31` renders diamond/gold/silver/bronze from a
numeric value, mounted at `app/[locale]/(marketing)/for-companies/page.tsx:48` against
`content/placeholders.ts:961-975` (`status: "placeholder"`, label `"(sample)"`). The
declared replacement source is `companies.trust_score` — a column that exists
(`0001_initial_schema.sql:59`) and is never computed. Labelled, therefore **STUB**, not
a doctrine violation — but it is a public promise of a company rating the product does
not have and the doctrine forbids.

### P2-10 — `SupplyCandidate` carries PII with no type-level barrier

`match-subject.ts:37-39` keeps `displayName`, `headline`, `profileId` on the object;
`scout-safe-view.ts:76-91` is the only thing that strips them, backed at runtime by
`assertContactSafe` (`lib/visibility/worker-profile-visibility.ts:188-198`). The admin
workbench already consumes the same builder without the safe mapper
(`lib/admin/matching-workbench.ts:381`; names rendered at
`app/[locale]/dashboard/admin/matching/page.tsx:362,597,823`) — correct there, but it
proves the pattern. One careless `.map()` over `filteredSupply` on the employer side
leaks real names past the guard.

### P2-11 — `lastActiveBucket` is disclosed pre-consent

Rendered at `app/[locale]/dashboard/company/scouting/page.tsx:557-563`; not a member of
`PROFILE_SAFE_PREVIEW_FIELDS` (`lib/visibility/worker-profile-visibility.ts:37-48`).
Behavioural timing metadata about a person, shown before contact disclosure.

### P2-12 — Dashboard search does not search the marketplace

`lib/search/dashboard-search.ts:233-241` composes journal, projects, tasks, finance,
conversations, bookings, documents. No `marketplace_listings`, no `service_offerings`,
no `demand_interest_signals`, no opportunity source. A worker cannot find a demand they
saved. Also: each source `try/catch`es to `null` (e.g. `:96`, `:113`), so a broken
source is indistinguishable from "no results". **MISSING**.

### P2-13 — App admin gate and SQL `is_admin()` disagree

`requireSuperadmin` accepts `profiles.active_role='admin'` **or** a `profile_roles` row
(`lib/auth/superadmin.ts:91-105`); SQL `is_admin()` reads only `active_role`
(`0003_multi_role.sql:93-99`). An admin currently acting as `company` renders the
workbench and then reads it under employer RLS — silently truncated data, not an error.
Documented in-repo at `superadmin.ts:19-25`.

---

## 7. W6 / W8 / W9 / W12 dependency list

### W6 — `20260802120000_experience_records_v1.sql` (NOT applied to production)

RPCs defined only there: `submit_experience_record`, `submit_experience_response`,
`get_experience_counts`, `open_experience_dispute`, `review_experience_dispute`,
`resolve_experience_dispute`, `start_experience_moderation`,
`decide_experience_moderation`, `moderate_experience_response`, `experience_audit`.

Callers: `lib/trust/experience-records.ts:119,200` (+ siblings),
`lib/trust/experience-result-actions.ts:66`, `app/[locale]/dashboard/admin/page.tsx:11`.

**Impact on W10: none.** `grep -rn "@/lib/trust/" lib/scouting lib/market
lib/opportunities lib/marketplace lib/admin` → **zero hits**. No matching, scouting or
opportunity surface reads experience data. The `?result=experiences` surface is
**BLOCKED_BY_W6_PROD_MIGRATION**; the marketplace domain is not.

Do not let a W10 slice change this. Wiring experience counts into ranking would be the
"unapplied W6 data treated as production fact" violation the doctrine names.

### W8 — merged into `main`

`git diff --stat origin/main origin/feat/w8-employer-org-context-truth --
apps/web/lib/scouting/scouting.ts apps/web/app/[locale]/dashboard/company/scouting/page.tsx`
returns **empty** — the branch content is already in `main` (squash-merged). The
employer-org-context gate audited in P1-3 is the W8 deliverable and is live at
`lib/company/employer-company-context.ts`.

### W9 — `20260802160000_org_membership_revocation_v1.sql` (NOT applied)

RPC: `end_org_membership_v1`, called at `lib/operations/org-membership.ts:114`.

**Impact on W10: indirect but decisive.** Revocation is the missing half of a scope
system that does not exist for marketplace tables in the first place (P1-3). Even once
applied, it revokes *membership*, and no marketplace query reads membership. Two
distinct blockers stack:

- `BLOCKED_BY_W9_SCHEMA` — no `organization_id` on `customer_requests`,
  `demand_shortlist`, `booking_requests`, `marketplace_listings`.
- `BLOCKED_BY_W9_SCHEMA` — `organizations_select using (true)`
  (`0013_work_journal_m1.sql:327`).

Also unapplied and relevant: `20260714210000_company_memberships_v1.sql`
(`docs/APPLIED_LEDGER.md:402`) and `20260713210000_multi_source_talent_v1.sql`
(`:397`, which is why `lib/talent/provenance.ts` returns `needs-migration`).

### W12 — `20260802150000_booking_atomic_double_booking_v1.sql` (NOT applied)

**Correction to the obvious reading: this migration defines no exclusive RPC.** All
three names it declares already exist in *applied* migrations:

| RPC | Pre-existing (applied) definition | Re-declared by W12 |
|---|---|---|
| `respond_booking_request` | `20260613100100_booking_requests.sql:183` | `20260802150000:373` |
| `respond_booking_request_v2` | `20260711290000_booking_lifecycle_v2.sql:86` | `20260802150000:347` |
| `respond_booking_request_v3` | `20260723120000_company_worker_engagements_v1.sql:214` | `20260802150000:173` |

Callers (`lib/booking/booking-actions.ts:202,213,227,240,249`) resolve against the
applied versions, so **nothing breaks while W12 is unapplied**.

What is missing is the row lock + `status='proposed'` guard, the advisory-lock
serialisation and the partial `EXCLUDE USING gist` constraint
(`20260802150000_...:30-54`). The header records that the race was reproduced with two
real psql sessions (`:6-23`): two employers can hold the same worker on overlapping
dates. The app already maps SQLSTATE `23P01` → `kind:"conflict"`
(`lib/booking/booking-actions.ts:38,80-81`), so applying it needs no UI change.

**This is the one gated migration that fails OPEN.** W6 and W9 ship callers to
functions that do not exist, so they fail closed and loudly (`needs_migration`
branches). W12's absence is invisible to the application — it simply loses under
concurrency and nothing notices. That asymmetry is worth recording.

**Impact on W10:**

- Nothing in W10 is **BLOCKED_BY_W12_AVAILABILITY** today, because no matching,
  scouting or opportunity module reads `booking_requests` at all (P2-3a).
- The moment a W10 slice tries to make availability *real* — join bookings, show
  calendar-backed freedom — it becomes **BLOCKED_BY_W12_AVAILABILITY**, because
  conflict-free booking state is exactly what the unapplied migration provides.

### Fourth gated migration relevant to W10

`20260711330000_worker_demand_structured_v2_exposure.sql` is headed
`DRAFT — needs-human-gate — DO NOT APPLY automatically` (`:1-4`). It adds the
`structured jsonb` column to `list_open_demand_for_workers()` (`:391`). The loader
tolerates its absence (`load-worker-opportunities.ts:203`). Fixing P0-1 depends on this
being applied → **OWNER_GATED**.

Similarly `20260711250000_worker_languages_v1.sql` (MP-1) and
`20260711270000_worker_preference_columns_v2.sql` (MP-2) supply signals 15 and 19–23.
Their application state is **UNVERIFIABLE-STATICALLY**; the read layers feature-detect
(`match-subject.ts:88-115`), so absence degrades to honest `missingFacts`.

### The ledger cannot settle geography apply-state

`20260617120000_market_map_data_model_v1.sql` (`preferred_locations`) and
`20260615120000_company_demand_locations.sql` appear **nowhere** in
`docs/APPLIED_LEDGER.md` — neither in the applied list nor the deferred list. The
ledger self-declares drift: 26 applied migrations were never recorded, 24 still
unreconstructed (`docs/APPLIED_LEDGER.md:17-30`).

App code hedges both ways, consistent with genuine uncertainty:
`lib/data/worker-core.ts:203-221` and `lib/opportunities/worker-subject.ts:67-76` wrap
the `preferred_locations` read in a graceful-null; `lib/demand/demand-location.ts:165`
maps `RELATION_NOT_FOUND` → `needs-migration`.

**Consequence for W10**: whether the worker-side `city` tier ever fires is
**UNVERIFIABLE-STATICALLY**. Do not assume it does. Only
`select name from supabase_migrations.schema_migrations` settles it.

### `workers.experience_years` has no writer

The column is applied original schema (`0001_initial_schema.sql:52`) and is assembled
into the subject (`match-subject.ts:59,204`; `matching-workbench.ts:275,397`). But
`save_worker_card`'s arguments are availability/location/salary only
(`lib/worker/work-card-actions.ts:102-107`), and no other worker-facing writer of that
column was found. Combined with `match-v1.ts:1188-1190` (evaluated only when the demand
author set BOTH `requirements.min_experience_years` and a
`requirement_priorities.min_experience` tier), signal 24 is very likely inert in
practice. **UNVERIFIABLE-STATICALLY**: whether any row has a non-null value.

---

## 8. File-conflict map

Verified by `git diff --stat origin/main <branch>` for every remote branch: the W6
slice 3, W7, W8, W9 slice 1 and W12 slice 1 branches all return an **empty** diff
against `main` for the files in scope — they are squash-merged and stale. The only
remote branches with live content are audit branches at the same base
(`audit/w11-project-operating-system`, `audit/w14-analytics-kpi`, both `c05a4802`) and
`feat/cc/w6-slice4-fraud-safety-gates`, whose only non-stale files are
`apps/web/lib/guards/risk-signal-advisory.test.ts` and a docs evidence file.

Conflict risk for a **future** W10 slice is therefore about domain ownership, not open
branches:

| File | W10 would touch for | Also owned by | Risk |
|---|---|---|---|
| `apps/web/lib/scouting/scouting.ts` | P0-2 (ranking), P0-3 (pool) | W8 employer-org context (`resolveEmployerCompanyContext` calls at :100,:170) | **High** — do not move the context gate |
| `apps/web/app/[locale]/dashboard/company/scouting/page.tsx` | P0-3 disclosure UI, P2-11 | W8 (`EmployerContextNotice`), W9 (workspace switcher) | **High** |
| `apps/web/lib/market/match-subject.ts` | P0-3 (pool), §5.2 (city) | W9 (any org key added here), W6 (if experience were ever wired — do not) | **Medium** |
| `apps/web/lib/opportunities/load-worker-opportunities.ts` | P0-1 (need assembly) | W12 (if availability becomes calendar-backed) | **Medium** |
| `apps/web/lib/opportunities/opportunity-need.ts` | P0-1 | — | Low — best place to land the fix |
| `apps/web/lib/opportunities/match-card-view.ts` | P1-2 | — | Low |
| `apps/web/lib/conversation/result-registry.ts` | any new `?result=` | W6 slice 3 (`experiences`), W11, W14 | **High** — every wagon edits this file; land registry changes in their own tiny commit |
| `apps/web/lib/guards/product-readiness.test.ts` | any new surface | W6, W7, W9, W12 all touched it | **High** — a shared ratchet; expect conflicts |
| `apps/web/lib/guards/market-map-read-layer-v1.test.ts` | §1.1 reconciliation | W6, W7, W9, W12 all touched it | **High** |
| `apps/web/messages/*.json` (11 files) | any new copy | every wagon | **High** — keep W10 keys under a fresh namespace |
| `supabase/migrations/` | any org key (P1-3) | W6/W9/W12 hold the three unapplied files; a new W10 migration would be a **fourth** unapplied migration | **Owner gate** |
| `docs/APPLIED_LEDGER.md` | migration bookkeeping | every wagon | **High**, and historically produces CRLF-only phantom diffs |

---

## 9. Recommended W10 slice plan

Each slice is independently mergeable, has its own guard, and needs no migration unless
stated. Ordered by honesty-per-line-of-diff.

**Slice 1 — Worker board matches on the real need (fixes P0-1).**
Extend `needFromRoleText` (`lib/opportunities/opportunity-need.ts:11-33`) to accept the
row's `structured` projection and pass `structuredV2` into the `MatchNeed`. Change
`load-worker-opportunities.ts:182-187` and `interest.ts:84` to feed it. Guard: a test
asserting that when a row carries `structured.engagement_form`, the resulting
`MatchResultV1.blocking` can be non-empty. No migration. Degrades correctly when
`20260711330000` is unapplied (`structured` is `null` → today's behaviour exactly).
Files: 3 + 1 guard.

**Slice 2 — Fit outranks freshness (fixes P0-2).**
Invert `scouting.ts:301-306` to `compareMatches(a.match, b.match) ||
freshnessDemotionRank(...)`, i.e. demote dormant profiles only *within* a status band.
Guard: a fixture asserting a `strong` dormant candidate outranks an
`insufficient_data` active one. No migration. Files: 1 + 1 guard.

**Slice 3 — Disclose the supply cap (mitigates P0-3, cheap half).**
Return `{ candidates, poolCapped: boolean, poolSize: number }` from
`buildSupplyCandidates` (fetch `limit(201)`, report if 201 came back) and render an
honest "showing the 200 most recently registered — narrow your demand" notice on the
scouting page. Does not fix the cap; stops it lying. Files: 2 + copy in 11 message
files + 1 guard.

**Slice 4 — Push the demand predicate into SQL (fixes P0-3 properly).**
Add `country` and profession/skill `.in(...)` predicates to the `workers` /
`worker_skills` reads in `match-subject.ts` before the limit, driven by the need. Keep
the in-memory engine unchanged. Guard: a test asserting the query carries a predicate
whenever `need.country` is set. Consider an index migration — that would be
**OWNER_GATED**, so ship the predicate first and measure. Files: 1 + 1 guard.

**Slice 5 — Match chips tell the truth (fixes P1-2).**
Derive the `MatchSignal[]` from `MatchResultV1.reasons`/`gaps`/`blocking` instead of
`WorkerOpportunityProfile`, and rename the completeness chips to a separate
"complete your profile" row. Guard: a test asserting no signal key is derived from
`profile.has*`. Files: 2 + 1 guard.

**Slice 6 — Retire the dead geography (fixes P2-3, §5.1).**
Delete `distanceKm`, the radius branch and the two reason/gap codes plus their 11
locale strings. The alternative — wiring real coordinates — is **not** a W10 slice:
`workers` has no coordinate column (`0001_initial_schema.sql:45-63`), no geocoder
exists, and `company_demand_locations` can never reach `geocode_status='verified'`
through any current writer (§5.1a). That is a migration plus a geocoding service, i.e.
its own owner-gated wagon. Ship the honest deletion now.

**Slice 9 — Stop collecting availability the product throws away (fixes P2-3c).**
Either persist `available_from` from the public intake form, or remove the field. One
file (`lib/staffing/worker-intake-form-actions.ts`) plus the form. While in there, fix
the `available_from`-without-status silent drop at `match-v1.ts:564-581` so it emits an
honest `missingFacts` entry. Guard: a fixture with `availableFrom` set and
`availabilityStatus` null must produce a recorded fact, not silence.

**Slice 7 — Symmetry guard (prevents §5.2 / §5.3 recurring).**
A guard test that runs the *same* fixture pair through both subject builders and both
need builders and asserts the resulting `MatchResultV1.status` and `blocking` are
identical. This is the single highest-leverage test in the domain — it would have
caught P0-1 and both asymmetries at write time. No product change. Files: 1 guard.

**Slice 8 — Reconcile the two demand tables (fixes P1-1).**
Decide, in docs first, whether `job_demands` or `customer_requests` is the canonical
market unit, then either label the market result honestly ("project staffing needs —
not the opportunity board") or point both at one source. Do not start with code.

**Deliberately NOT in W10** (owner-gated or blocked):
adding an `organization_id` to marketplace tables (P1-3 — new migration, and a fourth
unapplied file); changing `organizations_select` (P1-5 — W9 slice 2 owns it);
fixing the contact-disclosure org attribution (P1-4 — touches a GDPR consent ledger);
making availability calendar-backed (P1-7 → **BLOCKED_BY_W12_AVAILABILITY**);
wiring experience records into ranking (**forbidden**, see §7).

---

## 10. Confirmation that no code was modified

```
$ git status --short
?? docs/audits/w10-marketplace-matching-audit.md
```

The only change in the working tree is this untracked audit document. No commit, no
push, no PR, no merge, no deploy. No `npm`/`pnpm` command, no build, no vitest, no
Playwright, no Supabase CLI or MCP call was executed at any point. No other worktree
and no canonical repository was touched.
