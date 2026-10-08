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
| `0.1.0+t97.0763a9b6` | 97 | project invoicing door (#2203, draft) | +project_invoice_overview_get, project_invoice_invoice_get, project_invoice_billable_explain, project_invoice_correction_prepare (reads; the correction is PREPARED, nothing is created), and draft->confirm pairs project_invoice_rate_term_add_*, period_create_*, draft_create_* (invoice DRAFT from explicitly selected billable work), recipient_save_*, draft_line_add_*, draft_tax_set_* (treatment only). Runs as the caller over the same RPCs the web actions call; NEVER issues, confirms tax or credits (pinned by lib/guards/project-invoice-ai-door-v1.test.ts) |
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
