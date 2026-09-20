# Ramūnas / Nonstop — the REAL production walk (2026-09-20)

One question: **what is the FIRST core transition where Ramūnas must leave
LabourMarket.ai and use WhatsApp / Excel / phone to complete the real Nonstop
workflow?** That transition becomes the next P0. Nothing is pre-built for it.

Rules: production only (`https://labourmarket.ai`), Ramūnas's own account, real
Nonstop data. No QA fixture, no fake client, no fake worker, no manufactured
demand. Where a step needs another real person (client owner, worker), that
person acts from their own account; if they are not on the platform yet, the
invitation IS the step — do not stand in for them.

## What production already holds for Nonstop (read 2026-09-20 05:30 UTC)

| fact | value |
|---|---|
| company | UAB NONSTOP GROUP, `verification = verified`, **`company_type = construction`** |
| organization (canonical) | UAB NONSTOP GROUP, 1 active governance member (the owner) |
| roster (`company_workers` active) | 2 |
| needs (`customer_requests`) | 2 `company_request` submitted, 1 draft; 1 `agency_offer` submitted, 1 draft |
| agency ↔ client connections | **none for Nonstop** (the 2 rows in production are E2E fixtures) |
| off-platform client records (`agency_clients`) | 0 |
| candidate offers / shares | 0 |

So the walk starts before the loop: Nonstop is not yet declared a staffing
agency on the platform, and no real client is connected.

## The walk — record each row with the 7 fields

For every step: (1) what Ramūnas wanted, (2) what he clicked/said, (3) the
canonical object, (4) expected, (5) actual, (6) completed inside
LabourMarket.ai? yes/no, (7) if no: the exact external workaround.

| # | step | where (production) | canonical object | expected |
|---|---|---|---|---|
| 0 | Declare the agency | `/dashboard/start/company` → company type → **Staffing agency** → save | `companies.company_type = staffing_agency` (self-service `save_company_setup_v3`) | the **Partners** door appears in the company strip; nothing else changes |
| 1 | Invite the REAL client | `/dashboard/company/partners` → invite client by e-mail (the client owner's real address) | `agency_client_connections` (pending) | invitation sent by the platform; if the client has no account, they sign up from it |
| 2 | Client accepts | client owner, own account → `/dashboard/company/partners` → Accept (44 px) | connection `active` | Nonstop sees the client as connected |
| 3 | Real client demand | client owner → `/dashboard/company/needs` → post the real need (or chat: "need 3 welders in Kaunas from October") | `customer_requests` (client org) | need visible to the client; matching runs |
| 4 | Share the request with Nonstop | client → partners → share request | `agency_client_request_shares` | Nonstop sees the shared request on its partners page |
| 5 | Real candidate | Nonstop → the shared request → propose one of the 2 roster workers (or invite a real worker first: `/dashboard/company/people` → invite → the worker accepts personally) | `agency_candidate_offers` (`offered`) | client sees the proposal |
| 6 | Client decides | client → accept the proposal | offer `accepted` → `booking_requests` proposed to the worker | the worker receives the booking |
| 7 | Worker personally consents | the worker, own account → Today / offers → **Accept** | `booking_requests.accepted` → `company_worker_engagements` | commitment exists; nobody else could have said yes |
| 8 | Assignment / deployment | client → `/dashboard/projects/<id>/operations` → assign the booked worker; set REAL dates + place (R-3 form) | `project_worker_assignments`, `projects` facts | the worker is on the client's project; **Nonstop's view of the offer still says `accepted`** — write down whether Nonstop can see that the deployment happened |
| 9 | Planning / calendar | client → `/dashboard/company/planning` → "Who is committed where" (new 2026-09-19) and the ratio; Nonstop → its own planning page | commitments read | the placed worker shows on the client's roster list with dates |
| 10 | Communication | either side → contact from the request / the interest card → thread | `conversations` | a real message exchanged inside the platform |
| 11 | Work / journal / evidence | the worker writes one real day; the client (engagement-context manager) confirms it | `journal_entries`, `journal_entry_confirmations` | confirmed badge on the worker's journal |
| 12 | Colleague operations (R-15, live) | a second Nonstop member (if one exists) closes or reopens a Nonstop need from `/dashboard/company/scouting` | `close_demand_v1` / `reopen_demand_v1` | works for owner/admin/manager members; every other field stays the creator's |
| 13 | Replacement / repeat — ONLY if it really happens | worker drops → what does Nonstop do? client re-shares? | `agency_candidate_offers`, "Repeat this need" | record the real path taken |

Steps 12–13 are optional: do them only if the real workflow reaches them.

## What to hand back

The first row whose field (6) is **no**. Its field (7) is the P0. Window 5
predicted step 8 (deployment invisible to the agency) and step 13
(replacement linkage) — **hypotheses only**; the walk decides.

If every row is **yes**, say so: then the next work is the second real client,
not a feature.
