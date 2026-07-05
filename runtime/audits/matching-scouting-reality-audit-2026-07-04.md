# Matching / Scouting Reality Audit — 2026-07-04 (PR4)

**Owner question:** can the product connect company demand → suitable workers
today, and if not, what exactly is broken?

**Headline answer:** the matching stack is architecturally real and
doctrine-clean (deterministic, §19 need-context fit, evidence-weighted, no
global rating, contact-safe) — but it was **data-inert end-to-end** because
its identity key was ESCO URIs, and production has **0/152 skills and 0/49
professions with `esco_uri`**, and **0/14 demands structured**. PR4 re-keys
matching on canonical skill slugs (present for 100% of both sides) and feeds
freeform demand text through the existing offline 12-language recognizer.

Production counts (read-only MCP query, 2026-07-04): skills 152 (esco_uri
0), professions 49 (esco_uri 0), profession_skills 232, esco_skills 13 939,
esco_occupations 3 039, workers 20, worker_skills 22, customer_requests 14
(structured_need 0).

## 1. Where matching/scouting lives

| Module | Role | Verdict (pre-PR4) |
|---|---|---|
| `lib/market/fit.ts` | canonical §19 fit engine (`computeContextFit`: need∩subject / need, full basis, null for unstructured) | GREEN logic / **RED data** (ESCO-keyed) |
| `lib/market/match-v1.ts` | `matchWorkerToNeed`: fit + evidence tiers (manager 1.0 > journal 0.7 > self 0.4) + discrete country/profession/availability/language/pay/accommodation checks → status strong/possible/weak/insufficient + reasons/gaps/missingData | GREEN logic / **RED data** |
| `lib/market/match-subject.ts` | supply read layer: workers + worker_skills → MatchSubject; **skipped every skill with NULL `skills.esco_uri`** (`if (!uri) continue`) | **RED** — all 22 real worker_skills rows dropped |
| `lib/scouting/scouting.ts` + `scout-safe-view.ts` | company scouting orchestration: own demand → match-v1 over supply → ranked, anonymized, shortlist (`demand_shortlist`) | GREEN wiring / RED data |
| `lib/admin/matching-workbench.ts`, `match-suggestions.ts`, `structure-need-actions.ts` | superadmin human matching workbench; `structureRequestNeed` = the only writer of `payload.structured_need` (ESCO picks) | GREEN (human-run) |
| `lib/opportunities/*` | worker-side readiness + default-closed opportunity board (RPC `list_open_demand_for_workers` not applied → `needsDataAccess`) | YELLOW (gated) |
| `lib/staffing/fit.ts` + `/match-preview` etc. | marketing preview engine, non-persisted, honest "preview" labels | YELLOW (preview by design) |
| old `/discover` browse | doctrine-killed, guarded against return (`matching-ui-neutralized.test.ts`) | intentionally removed |

## 2. Which routes/screens call matching

- `/dashboard/company/scouting` → `runScouting` (real; degraded to "needs structuring" for 14/14 demands).
- `/dashboard/admin/matching` → workbench (real, superadmin, human decisions only).
- `/dashboard/opportunities` → worker readiness (real) + closed board (gated on un-applied RPC).
- `/match-preview`, `/worker-intake`, `/company-need` → non-persisted preview (§18-honest).
- `/dashboard/service-requests` → NOT matching (marketplace loop; guarded separation).

## 3. Tables feeding matching

`customer_requests` (free-text `title/need_summary/role_or_work_type/country/
location/language_requirement/team_size/start_period` + jsonb `payload` with
the ONLY canonical form `payload.structured_need`), `workers`
(`availability_status`, `available_from`, `current_location_country`,
`preferred_countries`, `salary_min_eur`), `worker_skills` (`source ∈
self_declared|work_journal|manager_confirmed`, `verified`), `worker_professions`,
`skills`/`professions` (+ NULL `esco_uri`), `profession_skills` (232 links),
`candidate_skills.mapped_esco_uri` (never written), `esco_*` catalogue
(imported: 13 939 skills / 3 039 occupations — but NOT linked to the curated
registries), `demand_shortlist`.

## 4–8. Signal reality (pre-PR4)

| Signal | Status | Detail |
|---|---|---|
| Demand canonical skills | **RED** | free text only; structured_need written by admin ESCO picks; 0/14 structured |
| Worker evidence (journal/profile/CV) | GREEN at source, **RED at match** | worker_skills.source/verified real; all rows dropped at the ESCO join |
| Location | YELLOW | country-string equality only; `company_demand_locations` has lat/lng but is a map-signal layer never read by matching; workers have NO coordinates/city |
| Availability | GREEN (coarse) | availability_status/available_from used (reason/soft-cap/unknown) |
| Trust/evidence | GREEN | verified/manager-confirmed is the §19 confirmed split; no fake trust, no global score (guarded) |
| ESCO | **RED as keying, YELLOW as catalogue** | columns exist; catalogue imported; link columns 0/152 + 0/49; `mapped_esco_uri` has no writer; matching was keyed on exactly these NULLs |
| Matching UI | scouting+workbench real; opportunity board gated; previews honest | mixed |

## 9. Root causes of inertness (all three needed fixing)

1. **Identity mismatch**: engine keyed on ESCO URIs that exist for 0 rows —
   canonical slugs exist for 100% of skills/professions/worker_skills.
2. **Demand side**: `structured_need` requires an admin ESCO act; no
   recognition path from the free text companies actually write.
3. **Supply side**: `buildSupplyCandidates` silently discarded every
   NULL-esco skill.

## 10. PR4 repair (this PR)

- **Canonical identity = skill slug.** `fit.ts`/`match-v1.ts` operate on
  canonical skill ids (slugs; a legacy ESCO URI is accepted as an opaque id
  and mapped to a slug when the registry knows it). NULL `esco_uri` can never
  again make matching inert (guarded).
- **Demand derivation** (`lib/market/need-skills.ts`): one canonical input
  contract — human-structured slugs > human-structured ESCO (mapped to slugs)
  > **recognized-from-text via the SAME offline 12-language recognizer**
  (non-fuzzy tiers only) > profession-expanded via the static
  `profession_skills` mirror. Source is always carried and shown; a
  recognized need is labeled and produces a "confirm recognized need" action
  — never silently presented as human-structured (§19-honest).
- **Supply repair**: worker skills keyed on `skills.slug` with real evidence
  tiers; nothing dropped.
- **Profession fit**: direct match + related-via-shared-skills
  (`professionRelatedness`, Jaccard over the 232-link static map, drift-
  guarded against migrations).
- **Location**: coordinates path (haversine, radius) exists in the engine
  for when both sides have coordinates; city equality when both known;
  country as today; unknown stays non-negative. **No coordinates are
  invented** — workers currently have none, so radius is engine-ready but
  data-gated (documented).
- **Availability**: unchanged semantics + deterministic tie-break (available
  > unknown > unavailable) at equal skill fit; unknown explained, never
  penalized below explicit availability only when skill fit is stronger.
- **Explainability**: every result carries reasons (matched skills incl.
  per-tier evidence), gaps (missing required skills), location reason,
  missing-data notes, and a `nextAction` code.
- **ESCO stance (Task 4)**: matching no longer depends on ESCO. NO static
  slug→ESCO-URI map is shipped — inventing URIs offline would be fake ESCO
  coverage (banned). The curation path stays the existing owner-gated admin
  workbench/typeahead (esco catalogue IS imported); when `skills.esco_uri`
  gets curated, the mapping automatically enriches (URI→slug bridge).

## 11. Status classification (post-PR4, honest)

| Path | Status |
|---|---|
| Engine: slug-keyed fit + evidence + explanations | **GREEN** (real demand→worker fixtures, 10 scenarios) |
| Company scouting flow (demand → ranked candidates → shortlist) | **GREEN scoped** — works from recognized text with honest labeling; human structuring still upgrades it |
| Worker opportunity board | YELLOW — still gated on the approved-route RPC (separate migration, owner-gated) |
| Location radius | YELLOW — engine-ready; no worker coordinates exist (do not invent) |
| ESCO enrichment | YELLOW — catalogue imported; link curation owner-gated; matching independent of it |
| Marketing previews | unchanged (honest §18 previews) |

**Do not call the whole matching product GREEN** until the opportunity-board
RPC is applied and real companies run scouting on real structured/confirmed
needs. The engine + scouting path is GREEN scoped by fixtures.
