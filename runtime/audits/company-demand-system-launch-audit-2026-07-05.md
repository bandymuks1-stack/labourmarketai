# Company / Demand System — Launch Audit (2026-07-05, PR10)

**Owner question:** can a company create and manage demand launch-grade —
recognized skills, matched workers, interest, acknowledgement, closing?

**Headline:** creation, identity, matching, interest and acknowledgement are
REAL. Two company acts were DEAD (confirm recognized skills was admin-only;
close/reopen had no path at all), the demand list lacked a per-demand bridge
into scouting, and one honesty label had gone stale-false. PR10 closes all
four with ZERO DB changes (the existing own-row RLS already permits both
writes).

## Findings

| # | Item | Finding | Status |
|---|---|---|---|
| 1 | Company creation | `CompanySetupForm` → `save_company_setup_v2` RPC; legal_name required; automatic-first ladder (`active_unverified` usable immediately); **RPC can never set `verified`** (admin/registry only) | GREEN |
| 2 | Identity/legal minimum | legal_name + type + validated country; verification status honestly shown in 3 places | GREEN |
| 3 | Demand creation | canonical §17 intake: 3-step wizard → `submit_demand_request` (status hard-pinned `submitted`) + owner-scoped structured-columns update | GREEN |
| 4 | Demand edit (text) after submit | no UI — self-serve text editing still unavailable | **YELLOW — documented deferral** (copy now says so honestly) |
| 5 | Demand status by company | was admin-only; NO close/reopen path | **FIXED — PR10** close/reopen (whitelisted `submitted↔closed`, own-row RLS) |
| 6 | Text recognition | demand text → offline 12-language derivation (PR4) with honest recognized banner | GREEN |
| 7 | Recognized-skills confirmation | was DEAD company-side (admin `structureRequestNeed` only) | **FIXED — PR10** `confirmRecognizedNeed`: the §19 human act writes `payload.structured_need.skill_slugs` (`confirmed_by:'company'`), payload-merge preserves every other key |
| 8 | Demand city/location label | structured city → worker RPC `location_label` (PR8, applied) | GREEN |
| 9 | Matched workers | scouting runs PR4 engine with reasons/gaps | GREEN |
| 10 | Interest signals | real `demand_interest_signals` badge (applied) | GREEN |
| 11 | Acknowledgement | reviewed/contacted via gated RPC (PR7, applied) | GREEN |
| 12 | Closed demand behavior | worker RPC serves `status='submitted'` from VERIFIED companies only → closed/draft/in_review/approved all hidden; closing is instant and reversible, never a delete (§3) | GREEN (filter) + **FIXED** (company button) |
| 13 | Dead buttons / fake actions | clean; one honestly-labeled dual entry (private draft vs real submit) documented; the "closing not available yet" label became FALSE with PR10 → **copy corrected** | GREEN |
| 14 | Demand list ↔ scouting bridge | list lives on `/dashboard` with statuses but had NO per-demand scouting link | **FIXED — PR10** per-row deep link (`?request=<id>`) |
| 15 | Language requirement on the wizard | not collected (column exists; buyer path sets it) — matching stays honestly `language_unknown` | YELLOW — deferred, documented |

## Security note (pre-existing, documented for PR15)
`customer_requests` UPDATE RLS checks ownership only — a technically savvy
owner could set any status directly (bypassing the RPC's status guard). No
privileged effect exists: worker visibility requires `submitted` + VERIFIED
company, and admin-pipeline statuses grant nothing. PR10's lifecycle actions
additionally guard transitions with status preconditions. A row-level
transition trigger would be a RED migration — deferred to the PR15 hardening
list as an owner option.

## PR10 changes (no migration, no production apply)
1. `lib/demand/demand-lifecycle-model.ts` (+ `.ts` flows + server actions):
   confirm / close / reopen with a closed transition whitelist.
2. Scouting page: `DemandLifecycleControls` (confirm button inside the
   recognized-banner context; close/reopen with the honest "hidden from
   workers" note).
3. Demand read-back: per-row "matched workers & interest" deep link into
   scouting; stale manage-help copy corrected in all locales.
4. Guards: `lib/guards/company-demand-launch.test.ts`.

## Status after PR10
Company / Demand System: **GREEN scoped** — deferrals documented: submitted-
text editing (YELLOW), wizard language field (YELLOW), row-level status
trigger (owner option, PR15 list).
