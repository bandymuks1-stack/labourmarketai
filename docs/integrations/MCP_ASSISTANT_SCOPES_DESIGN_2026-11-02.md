# MCP assistant scopes — design (register 10.4, owner decision X-2)

Status: **DRAFT, RED (auth path).** Implemented behind the C-3 audience
binding (#2918). Not merged and not live until the owner decides X-2.

## Problem

Today a third-party assistant that connects over OAuth (ChatGPT, Claude, any
dynamically registered client) sees and can call **all 233 tools**. That
includes organisation operations, agency flows, evidence import, roster and
marketplace publishing. RLS still bounds every call to what the person may
do. But "everything the person may do in the product" is too wide a default
grant for an external assistant, and too wide for a public listing review
(the 5 positive / 3 negative test cases, and policy attestations).

## Constraint

Supabase Auth's OAuth 2.1 server issues only OIDC scopes (`openid email
profile phone`, plus `offline_access` in the metadata). Its docs say "Custom
scopes are not currently supported"
(<https://supabase.com/docs/guides/auth/oauth-server/oauth-flows>, read
2026-11-01). Production walk 41354839810 confirms the issued token carries
no product scope (`scope: null`). So product scopes **cannot** ride in the
token. They are enforced at the resource server, `/api/mcp`.

## Design

1. **Who is an assistant.** The auth-core boundary (`lib/api/api-identity.ts`)
   exposes `oauthClientId`: the verified Supabase `client_id` claim, after
   C-3's audience check. A first-party session (web, the phone) has none.
2. **Scopes over published tool names.** `lib/mcp/assistant-scopes.ts`
   defines six product scopes over the tool names an assistant actually sees:

   | Scope | Tools | What the person is granting |
   |---|---|---|
   | `account` | profile_get, context_list, context_switch, notification_list | who I am, which workspace I act in |
   | `journal:read` | journal_list, journal_work_intelligence_get, living_cv_skills_get, cv_state_get, cv_verified_get | my recorded work and what it shows |
   | `journal:write` | journal_create_draft, journal_confirm, journal_correct_draft, journal_correct_confirm | record or correct my own work, draft → confirm |
   | `work:discover` | jobs_search, jobs_get, jobs_new_list, work_find, opportunities_saved_list, interest_express_draft/confirm, work_card_save_draft/confirm | find work, say I am interested |
   | `schedule` | calendar_agenda_get, worker_engagements_list, worker_projects_list, absence_mine_list, absence_request_draft/confirm, leave_balances_get, tasks_open_list | my calendar, engagements, absences, tasks |
   | `messages` | conversation_list, conversation_get, message_send_draft/confirm, invitations_list | my conversations; sending is draft → confirm |

   **35 tools.** None is destructive. Every write is draft → confirm except
   `context_switch`, the one named pointer write.
3. **Enforcement at the door.** For an OAuth-client token, `tools/list`
   returns only the curated set. `tools/call` for any other name answers
   `outside_assistant_scope` and runs nothing. A first-party session's list
   is unchanged. The public `GET /api/mcp` also reports `assistantToolCount`.
4. **Guards.** `lib/mcp/assistant-scopes.test.ts` checks that every name is
   published, the count is 25–35, there are no duplicates, nothing is
   destructive, every write is draft/confirm-paired, and no org, agency,
   evidence or marketplace tool is in the set. `lib/api/mcp-door-assistant-scope.test.ts`
   checks the door itself.

## Owner decision X-2 (what this PR does NOT decide)

| Option | What it means | Cost |
|---|---|---|
| **X-2a (this PR's default)** | every OAuth client gets all six scopes, nothing else | none beyond this PR |
| X-2b | the person picks scopes on the consent screen; stored per grant | a per-(user, client) grant table + RLS = migration (RED); consent page change (owner-waived surface) |
| X-2c | an `organisation` scope (company_*, roster, demand) offered to assistants, opt-in | needs its own review of every org write and its draft/confirm coverage |
| X-2d | a client allowlist (only reviewed ChatGPT / Claude client ids get any scope) | conflicts with DCR (ids are minted per connection), so it fits CIMD or predefined clients only (C-1) |

## Consequences

- **The ChatGPT developer-mode connector proven on 2026-08-30 would lose the
  org/agency tools.** That is intended, and it is the reason this PR is owner-gated.
- **The 10.3 walk (#2454) asserts `tools/list` = public `toolCount`.** For an
  OAuth token, after this lands, that becomes `assistantToolCount`. Update the
  walk in the same merge window.
- No `scopes_supported` is advertised in the RFC 9728 document. The AS cannot
  issue these scopes, and advertising them would make ChatGPT request
  something the token can never carry.

## Review questions

(A) Broke something? Yes, on purpose: OAuth clients see fewer tools.
First-party sessions are unchanged. (B) Made something impossible? No.
Every tool still exists, and X-2b/X-2c can widen per person or per scope
without a new architecture.
