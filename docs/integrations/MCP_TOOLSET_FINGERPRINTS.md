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
| `0.1.0+t67.d6a83f05` | 67 | correction-writer PR (#2016, over the file-import + voice releases) | +evidence_record_correct_draft/confirm, evidence_session_correct_date_provenance_draft/confirm (insert-only correction chain; effective-leaf reading; draft->confirm, so no single-step write is added) |
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
