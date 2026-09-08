# ChatGPT as a first-class client — MCP adapter v1

> Status 2026-08-30: **connected to real ChatGPT in production.** OAuth 2.1
> (DCR → consent → token), capability discovery, and a caller-scoped
> `profile.get` read are all proven against the live client with server-log
> evidence (§4, §6). The first real-client WRITE (`journal.create_draft` →
> `journal.confirm`) is the remaining unproven step.

## 1. The verified platform contract

Verified 2026-08-29 against current OpenAI documentation: a ChatGPT app /
developer-mode connector is an **MCP server over streamable HTTP** with
**OAuth 2.1** user authorization — ChatGPT is the OAuth public client (PKCE,
dynamic client registration or client-id metadata documents), the MCP server
is the resource server that verifies a bearer access token on every request,
and discovery runs through **RFC 9728** protected-resource metadata. The 2023
plugin manifest model is dead and nothing here uses it.

Supabase Auth ships an **OAuth 2.1 authorization server** (public beta,
supports MCP clients + DCR). That closes the identity loop without a second
credential system:

```
ChatGPT ──OAuth 2.1 (owner-enabled Supabase OAuth server)──► Supabase Auth
   │                                                            issues the
   │  Authorization: Bearer <the user's own Supabase JWT>       user's JWT
   ▼
POST /api/mcp  ──resolveApiIdentity (ONE boundary, PR #1331)──► caller's
   │                                                            RLS client
   ▼
lib/mcp/protocol.ts (pure MCP subset)
   ▼
lib/capabilities/registry.ts (canonical capability, validated input)
   ▼
domain reads/writes AS THE CALLER — RLS decides, same as web/mobile
```

ONE USER · ONE IDENTITY · MULTIPLE CLIENTS. A ChatGPT caller can never do
more than the same person's web session — the same invariant, same boundary,
same e2e controls as the mobile bearer seam.

## 2. The three layers (each replaceable without the others)

| Layer | File | Nature |
|---|---|---|
| Capability contract | `apps/web/lib/capabilities/contract.ts` | pure vocabulary: id, kind (`read`/`draft`/`confirm`/`execute`), zod input, caller-scoped handler |
| Capability registry | `apps/web/lib/capabilities/registry.ts` | the ONE execution path; additions happen in review |
| MCP adapter | `apps/web/lib/mcp/protocol.ts` + `app/api/mcp/route.ts` | thin, vendor-neutral protocol translation; hand-rolled stateless subset (initialize / ping / tools/list / tools/call / notifications), swappable for the SDK without touching product code |
| OAuth discovery | `app/.well-known/oauth-protected-resource/route.ts` | RFC 9728 document pointing at Supabase Auth; public config only |

ChatGPT-the-client is fully independent of OpenAI-the-model-provider: the
platform's AI runtime (`lib/ai/runtime/`) stays provider-neutral and this
adapter never touches it. Any MCP client (Claude connector, an in-house agent
runtime) speaks the same door — this is also the AI-actor transport seam.

## 3. Capabilities v1

| id | kind | exposed | state |
|---|---|---|---|
| `profile.get` | read | yes | LIVE-proven locally: own profile facts + three-valued worker existence |
| `living_cv.skills.get` | read | yes | LIVE-proven locally: own `worker_skills` rows + catalogue slugs — the same rows the web Living CV reads |
| `journal.create_draft` | draft | **yes** | validates the SAME input contract as the chat work-log form, returns exact preview + one-time HMAC confirmation token fingerprinted on the caller's journal-chain head, writes NOTHING — exposed since the journal-write extraction landed (owner-approved 2026-08-29) so the draft it prepares now leads to a real confirm |
| `journal.confirm` | confirm | **yes** | verifies the one-time token against the exact draft (tamper/user-mismatch/replay rejected), then performs the REAL canonical write: the transport-neutral `createJournalEntryCore` runs the SAME append-only, hash-chained, pipeline-awaited save the web composer performs — as the caller, under the caller's RLS, no fork. The former honest gate is CLOSED |

Exposure is a reviewed product decision (`exposed:` in the registry), the
honest-gate pattern at capability granularity. `profile.get` deliberately
returns recorded facts, not a second completeness score — the Player Card
readiness model remains the ONE completeness source and is cookie-coupled
today (the same `shared-blocked` reality as dashboard-search).

## 4. Proof levels (§20 vocabulary)

- UNIT PROVEN: `lib/mcp/protocol.test.ts`, `lib/capabilities/capabilities.test.ts`,
  `lib/capabilities/presentation.test.ts` (annotations honesty, humanText
  composition, token chain, summarizer rules)
- LOCAL AUTH/RLS PROVEN: 10/10 live controls — RFC 9728 doc, 401+`WWW-Authenticate`
  pointer, malformed-bearer refusal, initialize/notification semantics,
  tools/list shows the exposed capabilities, both reads return the caller's own
  rows under two different real users. All four capabilities (`profile.get`,
  `living_cv.skills.get`, `journal.create_draft`, `journal.confirm`) are now
  `exposed: true`; `journal.confirm` performs a real one-time-token-gated
  canonical journal write (`createJournalEntryCore`), not an honest refusal
- REAL CHATGPT OAUTH CONNECTION PROVEN: **YES** (prod, 2026-08-30) — real
  ChatGPT performed DCR (`POST /auth/v1/oauth/clients/register` 201), the owner
  approved consent (`POST /auth/v1/oauth/authorizations/…/consent` 200), ChatGPT
  exchanged the code (`POST /auth/v1/oauth/token` 200, `resource=https://labourmarket.ai`,
  scope `openid email offline_access profile phone`), and every subsequent
  bearer verification returned 200 (`GET /auth/v1/user`, 79/80 OK in-window).
- REAL CHATGPT CAPABILITY DISCOVERY PROVEN: **YES** — ChatGPT completed the
  `initialize` / `tools/list` handshake against prod (two bursts, 11:11 and
  11:13 UTC) and surfaced the tool schemas (owner saw `journal_confirm` with its
  real schema, classified as a write).
- REAL CHATGPT READ (`profile.get`) PROVEN: **YES** (prod, 2026-08-30
  11:44:16 UTC) — after the owner attached the LabourMarket.ai connector to the
  conversation composer and sent an explicit request, the capability's unique
  PostgREST fingerprint
  (`profiles?select=id,full_name,email,locale,country,onboarded,active_role`)
  executed with status 200 under the caller's own JWT subject
  (`dc3284ea-…`, the owner's profile id) — caller-scoped RLS, no service role.
  ChatGPT rendered the owner's real production profile. See §6 resolution.
- PRODUCTION WRITE PROVEN: **YES** (prod, 2026-08-30 13:16 UTC) — the full
  natural-language draft→preview→confirm E2E ran through the real ChatGPT
  client with server-log + DB evidence. See §7.

## 5. Path to live (updated 2026-08-29 after the owner go-decision)

1. ~~Approve + merge #1331~~ — **DONE** (main `1781acef`; prod verified
   fail-closed: 401 on no-cred/malformed/invalid bearer).
2. App-side OAuth pieces (buildable, separate slice): the **consent page**
   (`/oauth/consent` — Supabase's OAuth server delegates the user-approval UI
   to the product; `supabase.auth.oauth.getAuthorizationDetails` /
   `approveAuthorization` / `denyAuthorization`, supported by the installed
   supabase-js 2.106), and this PR's RFC 9728 document naming
   `https://<project-ref>.supabase.co/auth/v1` as the authorization server
   (the exact identifier Supabase's discovery serves).
3. **Owner-dashboard action (the one unavoidable step):** Supabase dashboard →
   **Authentication → OAuth Server** → enable OAuth 2.1, set **Authorization
   Path** to `/oauth/consent`, and enable **dynamic client registration**
   (ChatGPT registers itself via DCR; monitor registered clients).
4. Connect ChatGPT (developer mode → add MCP server →
   `https://labourmarket.ai/api/mcp`) and run the §4 controls against the
   real client.
5. ~~Journal write extraction slice (owner-approved 2026-08-29) unlocks
   `journal.confirm`, the first ChatGPT write.~~ — **DONE**: the canonical
   write is extracted into the transport-neutral `createJournalEntryCore`
   (`apps/web/lib/journal/journal-write-core.ts`), and both
   `journal.create_draft` and `journal.confirm` are `exposed: true`.
   `journal.confirm` now performs the real one-time-token-gated write as the
   caller. The remaining gates are the owner OAuth-server steps (3) and a real
   ChatGPT connection (4) before this executes for the actual client.

## 6. Real-client test — 2026-08-30 (server-log evidence)

The owner connected the real ChatGPT client to `https://labourmarket.ai/api/mcp`
and sent, with the connector active, `"Parodyk mano LabourMarket.ai profilį."`
ChatGPT replied that it had no access to the profile data. Investigated against
the prod Supabase edge/auth logs (project `gorgitwvdzxbnaxhrsrw`); reasoning from
server evidence, not the prose reply:

**What the logs prove happened**
- OAuth is real and complete: DCR 201 → consent 200 → token 200
  (`resource=https://labourmarket.ai`), then two MCP discovery bursts
  (`initialize`/`tools/list`) at 11:11 and 11:13 UTC.
- Every bearer verification (`GET /auth/v1/user`) returned 200 (79/80 in-window;
  the one non-200 is a lone 403 the day before the test, not from the ChatGPT
  session). **Auth/token/scope/resource
  are not the problem.**
- The `profile.get` capability issues a PostgREST read with a column set unique
  to it (`…locale,country,onboarded,active_role` — note `onboarded`, not the
  web app's `onboarded_at`). That fingerprint appears **zero** times across the
  full retained window. **The capability handler never executed.**
- No discovery burst is followed by any `/rest/v1/` read — every MCP request that
  reached the server was `initialize`/`tools/list`; **no `tools/call` ever
  reached a capability.**

**Server-side ruled out** (each checked, not assumed): tool names are sanitized
correctly (`profile.get`→`profile_get`, dots stripped, valid `[a-zA-Z0-9_-]`);
all four capabilities are `exposed:true` and mapped into `tools/list`; the
emitted input JSON Schema is valid for no-arg tools
(`{type:object,properties:{},additionalProperties:false}`); the single-JSON-response
transport is accepted (it served discovery through the same channel).

**Conclusion — FAILURE_CLASS = A (model did not request the tool).** Not B/C/D/E:
the tool is offered with a valid schema, auth succeeds, transport works, and the
handler never ran because no invocation arrived. No server-side code defect is
proven — a change here would be a guess. The boundary is on the ChatGPT
client/model side (developer-mode connectors are per-conversation, and a
natural-language request let the model decline instead of invoking).

**Metadata note — CLOSED (2026-08-30, chat-first audit slice):** `tools/list`
now emits honest MCP `annotations` per capability, declared as REQUIRED
reviewed fields on the capability contract (`CapabilityAnnotations`): reads and
the write-nothing draft are `readOnlyHint:true`; `journal.confirm` is
`readOnlyHint:false` but `destructiveHint:false` (append-only) and
`idempotentHint:true` (one-time token); everything is `openWorldHint:false`.
The same slice added the presentation adapter
(`lib/capabilities/presentation.ts`): a successful tool call now leads with a
LOCALIZED human summary (5 active locales, parity-guarded `capabilities`
namespace) followed by the full structured payload — presentation added,
structure never removed.

**RESOLVED (2026-08-30, same day):** the owner ran the isolation test. After
explicitly attaching the LabourMarket.ai connector to the conversation composer
("+" → LabourMarket.ai) and sending an explicit request, `profile.get` fired:
the unique `profiles?select=id,full_name,email,locale,country,onboarded,active_role`
read appears in the prod edge logs at **11:44:16.546 UTC, status 200**, JWT
subject = the owner's own profile id (immediately followed by the worker
existence probe at 11:44:17.541). **FAILURE_CLASS A is confirmed as
attach-scope:** developer-mode connector tools are per-conversation in the
ChatGPT UI — until the connector is attached to the composer, the model has no
tools to call and declines in prose. Not a server defect; nothing server-side
was changed to make it work.

**UX notes carried forward from the resolved test:**
1. The diagnostic asked for raw JSON deliberately. Raw JSON is NOT the desired
   end-user presentation — capabilities should ship human-presentable results
   (see the presentation-contract work in the chat-first audit).
2. The MCP `annotations` gap above is still open and now unblocked: honest
   annotations + richer tool descriptions are the correct additive step to help
   the model auto-invoke on natural language once the connector is attached.
   (Closed the same day — see §4 and §7.)

## 7. Real-client WRITE E2E — 2026-08-30 (PASS, evidence)

Prod = merge of #1358 (annotations + presentation + switch-context) and #1359
(draft-side engagement-context resolution), deployment `success` 12:59:15 UTC.
Fresh ChatGPT conversation, connector attached to the composer, owner account.
Natural request (verbatim): *"Įrašyk į mano darbo dienoraštį bandomąjį įrašą:
šiandien 1 valanda, TEST CHATGPT E2E. Prieš išsaugant parodyk, ką įrašysi."*

**Observed flow (fresh schema):**
1. The model invoked `journal_create_draft` DIRECTLY on the natural sentence
   (no auxiliary profile read this round, no fabricated arguments). The
   read-only-annotated draft ran without a ChatGPT consent dialog.
2. Rule C fired (the owner holds 3 org-linked contexts): the capability
   returned `engagement_choice_required` with HUMAN labels and NO token;
   ChatGPT asked in Lithuanian, listing the four named contexts.
3. The owner-side answer was the context NAME only ("Labour market ai Sp.
   z o.o"). The re-draft resolved it and the preview NAMED it: date, context,
   note, "dar niekas neišsaugota", confirm instruction. No JSON, no UUIDs.
4. Natural confirmation ("Taip, išsaugok.") → ChatGPT showed its write-consent
   dialog (the `readOnlyHint:false` tool), then `journal_confirm` ran.

**Server/DB evidence:**
- `POST /rest/v1/rpc/create_journal_entry_full` 200 at 13:16:40.711 UTC under
  the caller's own JWT subject (`dc3284ea-…`) — no service role.
- `journal_entries` 18 → **19** (exactly once); new row
  `5e7557f9-4e40-431b-928d-1a3e4be860aa`: correct worker, correct
  `engagement_context_id` (`39b1f66c-…` = the context chosen BY NAME),
  `original_text "1 valanda, TEST CHATGPT E2E"`, `original_language lt`,
  `hash_prev` = the pre-write chain head (chain intact), 2 metric rows.
- Draft persisted NOTHING: after three draft executions across two
  conversations the count and head hash were unchanged.
- **Replay control through the real client:** asking to save again with the
  same token returned `confirmation_rejected (stale_state)`; count stayed 19.
- **Structured UI sync:** `/lt/dashboard/journal` shows the entry under
  2026-08-30 — one canonical domain state, two clients.
- Tamper / cross-user / input-mismatch rejections remain covered by the unit
  and local live controls (not re-run against the owner's prod account, by
  design).

**Findings from the STALE-schema first conversation (recorded, not hidden):**
- A conversation pins the tools/list it discovered at attach time. Against the
  pre-#1359 schema the model FABRICATED a nil-UUID `engagementContextId`; the
  requested-id passthrough accepted it at DRAFT time (label null — the model
  then invented a context label in prose). Safe (the write core would have
  refused; nothing was written; the model itself declined to confirm), but a
  recorded defect: **the draft should validate a requested id against the
  caller's own contexts and refuse with the labeled options instead of
  minting an unconfirmable token.** Follow-up slice.
- The rule-C option labels can collide (two org-less/unnamed contexts both
  render as the localized relationship word). The web flow qualifies duplicate
  labels; the capability path should too. Follow-up slice.
