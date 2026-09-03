# PILOT RUNBOOK — LANE A: REAL RECRUITER / AGENCY (production)

> Goal: `REAL_RECRUITER_USED_PRODUCT = TRUE` — a real recruiter, with real
> candidates and one real client, performs the whole chain on production and
> the agent records TIME_TO_FIRST_VALUE, drop-offs, errors and missing
> capabilities. Nothing here is synthetic; the agent never types credentials
> and never acts as the recruiter.

## Who is needed

| Role | Real person | Account |
|---|---|---|
| Recruiter | one real recruiter (owner's contact) | new signup, intent **"I'm a recruiter / agency"** |
| Client | one real company contact who has a workforce need | new signup, intent **"I need workers"** (or an existing company account) |
| Candidates | 1–3 real workers the recruiter already knows | each accepts the recruiter's roster invitation (real e-mail) |

Prerequisite: **G-1** (real-inbox delivery) must be green before candidate
invitations go out — the invitation link travels by e-mail.

## The chain, with the evidence the agent records after each step

| # | Step (what the person does) | Where | Real result (row / state) | Agent records |
|---|---|---|---|---|
| A1 | Recruiter signs up (e-mail or Google), picks the agency intent, finishes the setup form (type pre-selected: staffing agency) | `/lt/signup` → onboarding → `/dashboard/start/company?type=staffing_agency` | `companies.company_type = staffing_agency`; `organizations` row; `signup_completed`, `role_selected{intent:agency}`, `onboarding_completed` | timestamp of `signup_completed` = **T0** |
| A2 | Recruiter opens the company workspace: sees **Live market demand** and the agency bridge (clients) | `/dashboard/company` | page renders the demand section (real public pool) | any error; time to first screen |
| A3 | Recruiter invites 1–3 candidates to the roster | `/dashboard/network` → invite (employee / collaborator) | `invitations` rows; each candidate accepts → `company_workers` (active) | invitation → acceptance latency; drop-offs |
| A4 | Recruiter invites the client company (connection) | company page → agency bridge → invite client | `agency_client_connections` (pending) | — |
| A5 | Client signs up / logs in, accepts the connection, writes the need in plain words | client company page → accept; chat: "Need 4 formwork carpenters in Rotterdam from Monday" | `customer_requests` row (submitted); `agency_client_request_shares` when shared with the agency | client T0 → demand saved = client TTFV (action) |
| A6 | Recruiter sees the shared demand and offers a roster candidate | agency company page → shared requests → offer | `agency_candidate_offers` (`offered`) — **this is the recruiter's first real action** | **T0 → offer = TIME_TO_FIRST_VALUE (action)** |
| A7 | Client decides: contact / propose booking (live today); **Accept / Decline** buttons (after #1448 is applied) | client scouting page → offered candidates | `booking_requests` (proposed) and, after #1448, `agency_candidate_offers.status = accepted/declined` + `booking_id` | **recruiter's first real result** = the client's decision visible on the agency progress view |
| A8 | Candidate accepts the booking | worker dashboard → booking | `company_worker_engagements` (active) = placement state | placement latency |
| A9 | Everyone logs out and back in the next day | — | same rows, same states | state persistence ✓/✗ |

## What the agent measures (from `pilot_events` + tables, read-only)

- `signup_completed` → first `first_real_action` / offer row = **TTFV (action)**; → client decision = **TTFV (result)**; the admin telemetry section ("Time to first real value — per actor", actor = agency) shows the medians.
- Drop-off: the last event before silence, per person.
- Errors: `request_error` lines in the Vercel log for the pilot window; any `needs-migration` / "not available yet" line the recruiter saw.
- Missing capabilities: what the recruiter asked for and could not do (write them verbatim into `docs/launch/pilot-feedback/<date>.md`).

## Known limits to state honestly before the pilot

- Candidates must accept an invitation themselves (no bulk import of people without consent).
- Explicit accept/decline on a candidate offer lands with RED batch A (#1448); until then the client acts through contact / booking, which already creates the placement chain.
- The public demand shown is imported market data (one source market today); the client's own demand is what the recruiter works.

## Exit

`REAL_RECRUITER_USED_PRODUCT = TRUE` when A1–A7 are done by real people with real rows in production and the agent has recorded T0, TTFV (action), TTFV (result), drop-offs and the friction list.
