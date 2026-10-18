# D5 — the AGENCY-origin chain, end to end, on PRODUCTION (2026-09-06)

> Window-6 lane D5 PROOF. Window-5 checkpoint §1 row D5 asked for ONE walk that runs
> agency offer → client accept → canonical booking → worker accept →
> `company_worker_engagements` → project assignment (the same engagement rows feed the
> `list_booking_engagement_workers_v1` picker) → journal → history, from the AGENCY origin,
> then rolls every row back. No product code, no migration. Bounded E2E identities only.

**Verdict: PROD_PROVEN (chain) — with two measured edges (§3).** Build `93b8069e` (S1–S3)
and `5ba753a7` (S4–S8); production rolled twice during the window (other lanes merging),
each roll stopped a run at the `EXPECT_BUILD` guard before any write (`…-dd5d92c3.log`,
`…-93b8069e-run2-S4-S8.log`). 11/11 checks PASS in run 2. Residue after rollback: **zero**
(§4).

## 1. Identities and the pre-existing state the walk had to respect

| Role | Identity | Why |
|---|---|---|
| AGENCY | `e2e-timing-202609021217@labourmarket.ai` — "E2E Agentūra UAB (testinis subjektas)" (`0a26c7bf`, `staffing_agency`) | the only E2E agency in production (2026-09-04 walks) |
| CLIENT | `e2e-walker-202609021438@labourmarket.ai` — "E2E Walker UAB" (`b16e3a86`, org `a996113c`) | agency client; connection `ede90e9e` active, share `94bbd63c` active on need `b0a48f65` "Suvirintojas" |
| PERSON | `e2e-spine-person-202609051508@labourmarket.ai` — "E2E Spine Žmogus" (worker `c83fd3d3`, profile `70851a66`) | **not** on the walker's roster, no bookings/engagements/offers/journal; on ORG2's roster only (untouched) |

Worker2 was deliberately **not** used: it already holds the ACTIVE engagement `c61f1187`
with E2E Walker UAB (D4 residue), `company_worker_engagements_active_pair_idx` is UNIQUE on
(company, worker) WHERE active, and `respond_booking_request_v3` answers
`engagement: already_active` **without a new row** for that pair. `booking_requests` is
also UNIQUE on (owner, request, worker), so a second offer for worker2 on the same need
could not even book. A different worker on the agency's roster is the only honest path —
so the walk starts one step earlier than the checkpoint row: the roster invitation.

## 2. Step table (run 1 = S1–S3 on `93b8069e`, run 2 = S4–S8 on `5ba753a7`)

| # | Actor · sentence / tap | Verbatim result | Readback row (execute_sql) | OK |
|---|---|---|---|---|
| S1 | AGENCY · "pakviesk kandidatą e2e-spine-person-…" → inline form `company.invite-worker` (e-mail rode the sentence) → Tęsti → Išsaugoti | "Kvietimas įrašytas…" (roster invitation; no e-mail sent) | `company_worker_invitations` `7bdbfbdc` pending, company = agency, inviter = agency profile, 07:36:46 | ✔ |
| S2 | PERSON · "mano kvietimai" → `conversation-invitation-accept` → confirm | "Jums adresuoti kvietimai: 1." → **"Priimta — dabar esate susieti."** | `company_workers` (agency × `c83fd3d3`) active 07:37:04; invitation `accepted`; `audit_logs` `843a609b` accept_company_worker_invitation | ✔ |
| S3 | AGENCY · "parodyk klientų poreikius" → "pasiūlyk kandidatą" → roster select "E2E Spine Žmogus" → Tęsti → Išsaugoti → "kaip sekasi mano pasiūlymams" | "Klientų pasidalinti poreikiai: • Suvirintojas" → "Pasiūlymas įrašytas — klientas jį matys prie savo poreikio…" → "• Suvirintojas — E2E Spine Žmogus · Pasiūlyta" | `agency_candidate_offers` `cdf6d019` offered, request `b0a48f65`, share `94bbd63c`, created_by agency, 07:37:54 | ✔ |
| S4 | CLIENT · "kokius kandidatus pasiūlė agentūra?" → chip **Priimti: Suvirintojas** | "Agentūrų pasiūlyti kandidatai jūsų poreikiams: • Suvirintojas — E2E Agentūra UAB (testinis subjektas)" → **"Priimta. Kandidatui išsiųstas rezervacijos pasiūlymas — kai jis atsakys, pamatysite čia."** | offer `accepted` 07:45:30 with `booking_id ef5a07fb`; `booking_requests` `ef5a07fb` proposed, owner = client profile, org `a996113c`, note "Agency candidate offer accepted"; event `proposed` | ✔ |
| S5 | PERSON · "ką man siūlo?" → Priimti → "Taip, patvirtinti" | booking card → **"Priėmei"** | booking `accepted` 07:46:23; event `accepted` (actor = person); **`company_worker_engagements` `a153afb9` active, company `b16e3a86`, worker `c83fd3d3`, source_booking `ef5a07fb`, created in the same second** (v3 `engagement: created`) | ✔ |
| S6a | CLIENT · "mano projektai" → "E2E Kauno objektas (testinis)" → `project-assign-worker` | "Kas turėtų jame dirbti?" → chips **E2E Worker Two** only | — (the chat picker is roster-only, §3 edge 1) | measured |
| S6b | CLIENT · `/lt/dashboard/projects` assign form → project "E2E Kauno objektas" → worker "E2E Spine Žmogus" from optgroup **`assign-engagement-group` "Priimto pasiūlymo kandidatai"** (roster group holds only Worker Two) → Priskirti | form status "Priskirti darbuotoją projektui" (assigned) | `project_worker_assignments` `202a6eb6` active 07:46:46 — the RPC's `caller_has_booking_engagement_for_project` gate passed on the engagement alone (person not on the roster) | ✔ |
| S7 | PERSON · "šiandien dirbau nuo 8 iki 17 Kauno objekte, klojau plyteles. E2E-D5-mtpib1fl" → worklog form → Išsaugoti → confirm | **"Įrašas išsaugotas darbo žurnale. Pridėtas įgūdis: Plytelių klojimas. CV papildytas šio įrašo įgūdžiais…"** | `journal_entries` `b647e951` (freeform, closed), 4 `journal_entry_metrics`, 1 `journal_entry_skills` (recognized), 1 `worker_skills` (source work_journal); **`engagement_context_id = 00d72210` = the person's PERSONAL context, `project_id null`** (§3 edge 2) | ✔ |
| S7b | PERSON · "mano žurnalas" | "Paskutiniai 1 tavo žurnalo įrašai: — 09-06: šiandien dirbau … E2E-D5-mtpib1fl" | same row | ✔ |
| S8 | CLIENT · "kas pas mane dirba" | "Štai įrašyti darbo santykiai…" + panel listing **E2E Spine Žmogus** (and Worker Two) | `company_worker_engagements` 2 active rows for `b16e3a86` | ✔ |

Screenshots: `shots/10…11` (S1), `20…22` (S2), `30…33` (S3), `40…41` (S4), `50…52` (S5),
`60…62` (S6), `70…73` (S7), `80` (S8). Logs: `walk-d5-agency-chain-93b8069e-run1-S1-S3.log`,
`walk-d5-agency-chain-5ba753a7-run2-S4-S8.log`.

Run 1 also measured, at S4, the client's chat answering the offers question with the
workspace chooser ("Tai galite padaryti savo įmonės vardu — pasirinkite erdvę: E2E Walker
UAB"). `identity = auth0.activeRole` (`profiles.active_role`); the readback a minute later
showed the walker's `active_role = company` again — the E2E walker is a SHARED identity and
another window-6 lane was switching its workspace at that moment. Not a product regression;
the script now takes that chip as one tap when it appears (run 2 never saw it).

## 3. The edges

1. **Chat assign picker is roster-only (NEEDS-ORCHESTRATOR, CONV domain).**
   `lib/projects/project-workspace.ts` `loadAssignableWorkersForProject` reads
   `listActiveCompanyWorkers` (roster) and offers "Kas turėtų jame dirbti?" chips from it;
   the agency-placed person never appears there (S6a: only Worker Two). The page picker
   (`app/[locale]/dashboard/projects/page.tsx` → `listBookingEngagementWorkers` →
   `list_booking_engagement_workers_v1`) and the RPC `assign_worker_to_project`
   (`caller_manages_worker_by_roster OR caller_has_booking_engagement_for_project`) both
   accept the engagement. So the checkpoint's "the SAME engagement rows feed the
   project-assign picker" is true of the PAGE picker, not of the CHAT picker. Fix at the
   canonical layer: merge `listBookingEngagementWorkers()` into the chat's
   `loadAssignableWorkersForProject` population (it already exists; the RPC gate already
   allows it) — no new object.
2. **The journal cannot bind to the employer for a booking-only engagement (definition /
   NEEDS-ORCHESTRATOR).** A journal entry pins to an `engagement_contexts` row. The only
   provisioner, `provision_company_worker_engagement_context`, requires the worker on the
   company's `company_workers` roster with `operations_role in (company_admin, agency_admin)`;
   a booking engagement creates no context. The person's flow therefore showed no context
   select (one context = personal) and saved the entry into her org-less context
   (`00d72210`, `project_id null` — `create_journal_entry_full` links a project only when
   the context's organisation matches). The entry is real and in the person's history, but
   E2E Walker UAB can never review/confirm it (B9–B11 were proven on worker2, who holds the
   roster context `90da8c16`). Either the booking acceptance should provision the employee
   context for the engaging company (one existing RPC, relaxed roster gate — RED-adjacent,
   owner decision), or D5's "journal under that engagement" is redefined as "journal in the
   person's own history" for agency placements. Decide, do not paper over.

Everything else on the chain worked exactly as the earlier per-leg walks recorded, with the
one addition D5 asked for: the person appears in the client's `who works for me` and in the
page picker's engagement group purely from the booking.

## 4. Rollback and residue (execute_sql, one guarded `do $$` block, 07:5x UTC)

Deleted in reverse dependency order, each delete asserted to hit exactly its expected count
(a mismatch raises and rolls the whole block back): `journal_entry_skills` 1 →
`journal_entry_metrics` 4 → `journal_entries` 1 (`hash_prev null`, the person's only entry —
chain intact) → `worker_skills` 1 (`4ffb0d4e`, work_journal) → `project_worker_assignments` 1
→ `company_worker_engagements` 1 (FK RESTRICT before the booking) → `booking_request_events`
2 → `agency_candidate_offers` 1 → `booking_requests` 1 → `company_workers` 1 →
`company_worker_invitations` 1 → `audit_logs` 1 (`843a609b`, E2E actor, E2E link). **15 rows.**

| Table | BEFORE (07:32/07:35) | peak | AFTER (07:52) |
|---|---|---|---|
| company_worker_invitations | 8 | 9 | **8** |
| company_workers | 7 | 8 | **7** |
| agency_candidate_offers | 2 | 3 | **2** |
| booking_requests / booking_request_events | 1 / 2 | 2 / 4 | **1 / 2** |
| company_worker_engagements | 1 | 2 | **1** |
| project_worker_assignments | 5 | 6 | **5** |
| journal_entries / metrics / entry_skills | 40 / 129 / 48 | 41 / 133 / 49 | **40 / 129 / 48** |
| worker_skills | 50 | 51 | **50** |
| audit_logs | 64 | 65 | **64** |
| notification_events | 2 | 2 | 2 (the emitter is dead, 42501 — known) |
| engagement_contexts (person) | 1 | 1 | 1 (no context was provisioned, §3 edge 2) |

Full every-table diff vs the BEFORE snapshot (`counts-before-2026-09-06T07-32-12Z.json`)
after rollback: only `profiles`/`workers`/`profile_roles`/`worker_professions`/
`engagement_contexts` +1 each = another lane's `e2e-join-20260906074733` identity (07:47:33,
not this walk), and telemetry counters `pilot_events` +118 (this walk's own funnel events on
the three profiles: chat_intent_recognized → chat_action_attempted/persisted →
invitation_accepted → booking_accepted → engagement_created → project_assigned →
journal_entry_saved; count-only by the lane brief), `ai_runs`/`usage_cost_events` +2 (both
another lane's sentence "reikia korepetitoriaus" at 07:36:01 — none from this walk).
Pre-existing rows left untouched and re-verified: engagement `c61f1187` active, share
`94bbd63c` active, worker2 still on the agency roster, the person's ORG2 assignment (1).

**Residue that could not be deleted: none.** No RED (no RLS/GRANT/auth/billing touched;
`execute_sql` deleted every row). Service-role readback inside the script was denied on
every chain table (42501, the known no-grant class), so all readback is MCP `execute_sql`.

## 5. Re-run

```
EXPECT_BUILD=<sha> [START=S4] node docs/launch/pilot-feedback/walks-2026-09-06/walk-d5-agency-chain/walk-d5-agency-chain-prod.cjs
```
Prerequisites: the agency↔client connection and the shared need above; the person NOT on the
agency roster and holding no engagement with the client (else S2 / S5 are honest no-ops).
Afterwards delete the rows exactly as §4 (ids from execute_sql), never the pre-existing ones.
