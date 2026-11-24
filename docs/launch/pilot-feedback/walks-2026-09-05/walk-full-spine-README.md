# walk-full-spine-prod.cjs — FULL SPINE with two fresh bounded identities (MASTER map §6, Day 5)

## Prerequisites
- `C:/Users/Mano/Documents/labourmarketai/node_modules` with `@playwright/test` (chromium installed) and `@supabase/supabase-js`.
- `C:/Users/Mano/Documents/labourmarketai/apps/web/.env.local` with `NEXT_PUBLIC_SUPABASE_URL` (host `gorgitwvdzxbnaxhrsrw`), `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — read, never printed.
- The served build: `EXPECT_BUILD=<7+ hex of the deployed SHA>`; the walk refuses to run when `https://labourmarket.ai/api/health` `.build` differs.
- The walk CREATES two auth users (`e2e-spine-org-<yyyymmddHHMM>@labourmarket.ai`, `e2e-spine-person-<…>@labourmarket.ai`, random password never printed) and never deletes them (pilot_events FK blocks user deletes). Run it once per build — each run mints two new identities.

## Command (PowerShell, from anywhere)
```
$env:EXPECT_BUILD="<sha7>"; node "C:\Users\Mano\Documents\labourmarketai-wt\master-orch\docs\launch\pilot-feedback\walks-2026-09-05\walk-full-spine-prod.cjs" | Tee-Object walk-full-spine.log
```
Screenshots land in `walks-2026-09-05/walk-full-spine/` (`L1-*` org 1280 px dark, `L2-*`/`L3-person-*`/`L4-person-*` person 390 px light, `99-failed-<leg>.png` on a failed leg). Runtime ≈ 8–12 min.

## Expected log steps (one JSON line each; a failed leg logs `leg_failed` + `leg_failed_dump_<leg>` and the walk continues)
`health` → `L0_identities` (the two ids — copy into the residue register) →
`L1_org_public_entry` (intent `need-workers`, doors carry `?next=/dashboard?say=…`) → `L1_org_door` (`carriedNext` / `nextReattached` — observed, see the script comment) → `L1_org_onboarding` (`hire`, `leftOnboarding`) → `L1_org_chat_observed` + `L1_org_chat` (`firstTurnIsSentence`, `demandFormOpen`) → `L1_org_company_setup` (`result`) → `A4_org_start_hub` (`companyStarted`, `nextStepNamed`) → [`L1_org_need_resent`] → `L1_org_need` (`saved`) → `L1_org_need_readback` →
`L2_person_public_entry` (intent `find-work`) → `L2_person_door` → `L2_person_onboarding` (`profession.gap` names the missing scaffolder slug) → `L2_person_chat_observed` + `L2_person_first_answer` (`opportunitiesView`, `rows`, `orgNeedVisible` or `honestNone`) → `A4_person_start` →
`L3_org_candidates_observed` + `L3_org_candidates` (`noDemands` / `cards` / `contactBtns` / `cannotContact`) → [`L3_org_contact`] → `L3_org_invite_sentence` → `L3_org_invite_form` → [`L3_org_invite_network`] → `L3_org_invited` (`inviteVia`) → `L3_person_brief` (`inviteLine`) → `L3_person_invitations_list` → `L3_person_accepted` (`outcome`) → [`L3_person_messages` → `L3_person_replied`] → `L3_org_sees_response` (`personOnRoster`, `replyVisible`) →
`L4_org_project_sentence` → `L4_org_project_form` → `L4_org_project_panel` → `L4_org_pick` → `L4_org_assigned` (`assigned`) → `L4_org_gap` (`personLine`, `askChip`) → `L4_org_instruction` (`sent`) → `L4_person_brief` (`instructionsLine`) → `L4_person_projects_chat` → `L4_person_instructions_page` + `L4_person_instructions` (`cards`, `asks`) →
`residue` → `done` (`readback` = all inspect SQL joined by `;`).

## Residue register format (the `residue` line; readbacks + deletes run via Supabase MCP afterwards — the service role has no grant on several tables)
```
{ "step":"residue",
  "identities": { "org": {email, profile_id}, "person": {email, profile_id}, "keep": true },
  "created":    { company, need, project|null, assignment|null, invitation|null, invitationAccepted|null, contactConversation, personReplyConversation|null, instruction },
  "inspect":    [ 15 SQL statements keyed on the two profile ids / the project title / the person e-mail ],
  "deleteOrder": "conversation_messages → conversations → project_worker_assignments → projects → booking_requests → company_worker_invitations / invitations → engagement_contexts / company_workers → customer_requests → companies; KEEP auth.users + profiles (+ pilot_events)" }
```
Paste `identities` + the ids of every row the inspect queries return into the E2E residue register before deleting anything; delete in `deleteOrder`; never delete the two auth users or their profiles.
