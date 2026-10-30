# MCP toolset fingerprints — the release register

The MCP door (`/api/mcp`) reports its published toolset in `serverInfo.version`
as `0.1.0+t<tool count>.<schema hash>` (`lib/mcp/toolset.ts`). The value changes
exactly when a deploy adds, removes or re-describes a tool.

**How to tell SERVER CURRENT from CHATGPT STALE.** Ask ChatGPT for the
LabourMarket.ai connector's server version and compare it with the top row
here (for what is deployed, check `/api/health` `build` against the commit).
If they differ, ChatGPT is holding an old snapshot. Go to ChatGPT →
Settings → Connectors → LabourMarket.ai → **Refresh**. The server is
stateless HTTP and cannot push `tools/list_changed`, so the refresh is the
client's step.

**Rule (owner 2026-09-30 §10).** Every change to the published tool list adds a
row at the TOP. `lib/mcp/toolset-fingerprint.test.ts` fails until the top row
equals the version the tree publishes.

| Fingerprint | Tools | Release | What changed |
|---|---|---|---|
| `0.1.0+t231.bfe8d04f` | 231 | Living CV skill-time parity (P0-B, #2894) | `living_cv_skills_get` describes per-skill `practice` (own hours, confirmed part, `involvedUnattributedHours` — time the skill took part in that the records cannot attribute to it, never summed — entries, days, first/last worked day, evidence tier, link provenance) and `practiceStatus` (unknown, never zero); `journal_work_intelligence_get` output adds per-skill `tier` and `linkProvenance`. No tool added or removed. |
| `0.1.0+t231.5cae2918` | 231 | public jobs for a bearer client (mobile Jobs screen; from PR #2447, recomputed on current main) | +jobs_search, jobs_get — the public vacancy board through the door, the SAME `searchPublicVacancyPreviews` / single-preview read the website's /jobs page runs, over the caller's own client, anonymous projection only (no title, employer, place, source or application link; each job carries `webPath` to the member page). Read-only, idempotent, `page` bounded 1..100. |
| `0.1.0+t229.4b5c2408` | 229 | lifecycle contract merged with the readiness re-description | Both rows below in one tree: the `*_status_set` tools go through the ONE lifecycle contract and `company_seed-readiness-checklist` carries the decision 0021 description. No tool added or removed. |
| `0.1.0+t229.fbf0eded` | 229 | one market lifecycle contract | `service_offering_status_set_draft` accepts `closed` in `status` (the GREEN migration 20261024090000 adds a closed state to service offerings). Every `*_status_set` tool now goes through the ONE lifecycle contract server-side (`lib/market-lifecycle`): a transition the contract does not name is refused as `invalid` instead of being written raw. No tool added or removed. |
| `0.1.0+t229.474563bc` | 229 | documents never gate or lower readiness (decision 0021 extension, #2748) | `company_seed-readiness-checklist` re-described: it adds SUGGESTED rows to agree before the agreement (no universal mandatory list; A1 / posting only when the work is known to cross a border), never a readiness score. No tool added or removed. |
| `0.1.0+t229.105ffae5` | 229 | historical projects: pages + documented period | `projects_list` takes `page` (1-based, 100 per page) and answers `total` / `nextPage` (an organization with 181 projects saw only 100); each project carries `documentedPeriod` derived on read from its own records (first/last recorded day, recorded days, day hours, period-summary hours apart, people in the record) — not a contract start/end, not the current team. No tool added or removed. |
| `0.1.0+t229.43178c61` | 229 | object-root schemas (strict function-calling clients) | `evidence_record_correct_confirm` serialized as a bare root `allOf` (zod intersection); every tool root now declares `type: "object"` (only added where every root branch already is an object, so nothing a validator accepts changes). Pinned by `toolset-fingerprint.test.ts`. No tool added or removed. |
| `0.1.0+t229.d05cd4a7` | 229 | replay hardening merged from #2340 (#2336) | Six bridged confirms the dispatcher now binds to a state their own write changes (`company.create-programme`, `company.create-cohort`, `company.request-readiness`, `company.propose-booking`, `agency.propose-candidate`, `company.confirm-work`) claim `idempotentHint` and say the token is single-use. No tool added or removed. |
| `0.1.0+t229.11f76105` | 229 | universal LLM integration after the independent security review (#2336) | `absence.request` became `absence.request_draft/_confirm` (it notifies the manager); bridged confirms without a state fingerprint no longer claim `idempotentHint` and say "call once"; server instructions corrected. Supersedes the t228 row below (never deployed). |
| `0.1.0+t228.e9e08aaf` | 228 | universal LLM integration (branch `claude/labourmarket-llm-integration-e23e4d`, RED: auth-core bearer caller scope) | +56 web-chat action bridge tools (`worker_*`, `company_*`, `agency_*`, `engagement_*`: a reversible action is one tool, an important/strong one a `_prepare`/`_confirm` pair, through the ONE conversation dispatcher), +22 workspace reads (calendar agenda + conflicts, capacity, tasks, stages, readiness, agency/client bridges, person reads), +69 domain actions (organization legal data/activities/public page, service offerings, listings, service requests, proposals/contracts, bookings, notifications, leave, hours review, reports). See `LLM_INTEGRATION_COVERAGE_V1.md`. |
| `0.1.0+t81.1f8f7db4` | 81 | RED tiers A2-G release | the t77 toolset plus the correction writer (#2016): +evidence_record_correct_draft/confirm, evidence_session_correct_date_provenance_draft/confirm (insert-only correction chain; draft->confirm, so no single-step write is added). The other release branches add no MCP tool. |
| `0.1.0+t77.330fc344` | 77 | integration refresh (merge of main into integration/local-qa-2026-10-04) | the t76 integrated toolset (#2143 + #2146 + #2149) plus +evidence_import_stage_file (#2012, the file-import tool published on main as t63). The voice-provenance input field (t63.f2d9c2d1) adds no tool. |
| `0.1.0+t76.be37fbb5` | 76 | integration (#2143 + #2146 + #2149) | combined toolset of three lanes, each of which published its own row against the 62-tool base: +6 counterparty_review_* (#2143), +2 assignment_keep_draft/confirm (#2146), +6 team_assignment_create/replace/end draft/confirm (#2149). The three lane rows below are kept as their history; this row is the version the integrated tree publishes. |
| `0.1.0+t68.7bcb01a2` | 68 | #2143 | +counterparty_review_queue_get, counterparty_review_entry_get, counterparty_review_decide_draft/confirm (accept / request correction / dispute; note required), counterparty_review_submit_draft/confirm (decision 0018; client acceptance is never an employer confirmation) |
| `0.1.0+t64.79ba129f` | 64 | #2146 | +assignment_keep_draft, assignment_keep_confirm (the MCP door of the knowing override over the ONE keep core; assignment_create_draft/confirm gain `calendar` + a pending `override` decision) |
| `0.1.0+t68.25e675e3` | 68 | team assignment tools (#2149) | +team_assignment_create_draft/confirm, team_assignment_replace_draft/confirm, team_assignment_end_draft/confirm (a team as ONE relationship over the same core the web UI uses; the draft carries the per-member clash verdict) |
| `0.1.0+t63.f2d9c2d1` | 63 | voice journal recovery (ported from #2163 onto main) | journal_create_* input gains optional `voice` {language, disclosureVersion} provenance (input-origin label only; no authority, same schema and confirmation; no tool added) |
| `0.1.0+t63.8ccad476` | 63 | file-import PR (#2012, merged over the t62 attest/withdraw release) | +evidence_import_stage_file (ChatGPT file argument → the existing audited reader → `stageImportSource`; first tool with `_meta["openai/fileParams"]`) |
| `0.1.0+t62.142b9ca5` | 62 | evidence attest/withdraw PR | evidence_record_attest -> evidence_record_attest_draft/confirm; evidence_import_withdraw -> evidence_import_withdraw_draft/confirm (draft->confirm; the two direct-write tools are removed); server `instructions` now name the single-step exceptions |
| `0.1.0+t61.f62b81d8` | 61 | file-import PR, branch-local before merging main (superseded by t63) | +evidence_import_stage_file (ChatGPT file argument → the existing audited reader → `stageImportSource`; first tool with `_meta["openai/fileParams"]`) |
| `0.1.0+t60.bd088b58` | 60 | #2103 | journal_create_* gain optional project_id / not_project_work + project_required refusal with choices (no tool added) |
| `0.1.0+t60.eaa3316a` | 60 | messaging PR | +conversation_list, conversation_get, message_send_draft, message_send_confirm |
| `0.1.0+t56.a895a20a` | 56 | #2004 | +company_ingest_preview, company_ingest_confirm (marketplace_company_ingest capability) |
| `0.1.0+t54.e9824af5` | 54 | demand lifecycle PR | +demand_close_draft/confirm, demand_reopen_draft/confirm |
| `0.1.0+t50.d7ed3fa8` | 50 | #2003 | +marketplace_funnel_get (admin: where REAL workers stop) |
| `0.1.0+t49.dec3fc9a` | 49 | #1999 + #2002 (+ #2001 receipts; no tool change), prod build `49332e67` | +candidate_search, shortlist_get/add/remove, worker_activation_queue_get, project_status_set_draft/confirm |
| — (`0.1.0`, no fingerprint yet) | 40 | #1998, prod build `04c2fe00` | +demand_list, roster_list, projects_list, project_create_*, assignment_create_*, assignment_end_*, journal_review_queue_get |
| — (`0.1.0`) | 30 | before 2026-09-30 | profile, living CV skills, journal, interest, work card, demand create, context, workforce availability, evidence import (13), people ingest (2) |
