# Internal AI and external LLM clients — programme state, feasibility and plan (2026-10-17)

| Field | Value |
|---|---|
| Owner direction | 2026-10-17: LabourMarket.ai works (A) as a standalone web / Android / iOS product with its own AI, and (B) as a secure connected service reachable from the person's everyday assistant (ChatGPT, Claude, any standards-compliant MCP client), on ONE identity, through the SAME business rules |
| Rule of this document | Facts about the repository come from the tree at `main` `100fef1` + PR #2447 + PR #2448 (read 2026-10-17). Facts about external clients come from the primary sources named inline, fetched 2026-10-17; where a primary page could not be fetched that is said, and the claim is marked SECONDARY. Nothing was published, deployed, activated or merged |
| Precedence | `docs/OWNER_TARGET_ARCHITECTURE_V1.md` §1.13 (AI agents), decision 0024 (one memory, one context), `docs/PLATFORM_DOCTRINE.md` §7 (no fake AI). This document extends them; it does not compete |
| Companions | `../launch/RELEASE_SUBMISSION_PACK_2026-10-14.md` §4–§6 (listing text, test cases, owner actions) · `MCP_TOOLSET_FINGERPRINTS.md` · `LLM_INTEGRATION_COVERAGE_V1.md` · `AI_AGENT_PARTICIPANTS_V1.md` · `../mobile/MOBILE_BETA_MERGE_ROLLBACK_AND_DEVICE_EVIDENCE_2026-10-17.md` |

Deliverables A–I of the owner direction map to sections A–I below.

## A. Inventory — what exists (one backend, one registry, one authorization model)

Read from the tree on 2026-10-17 (file paths relative to `apps/web` unless
noted). Every row names its test or production proof; "none" is written out.

| Layer | What exists | Where | Evidence |
|---|---|---|---|
| MCP door | `POST /api/mcp`, stateless streamable HTTP (one JSON-RPC message per POST; 202 for notifications; no SSE, no session id); `GET` answers 405 with the public `{toolsetVersion, toolCount}`; 64 KB body limit with a named refusal | `app/api/mcp/route.ts` | `lib/api/mcp-door-refusals.test.ts`, `lib/guards/mcp-protocol-2026.test.ts` |
| Protocol | hand-rolled subset: `initialize`, `ping`, `tools/list`, `tools/call`, `server/discover`; revisions 2026-07-28, 2025-06-18 (default), 2025-03-26, 2024-11-05; tools only (no resources, no prompts) | `lib/mcp/protocol.ts` | `lib/mcp/protocol.test.ts` |
| Identity | bearer = the person's own Supabase user JWT (`auth.getUser(jwt)`), or the cookie session (JSON-only, CSRF-hardened); **no API-key mode**; every call runs as the verified caller through AsyncLocalStorage | `lib/api/api-identity.ts`, `lib/api/bearer-caller-scope.ts` | `api-identity.test.ts`, `bearer-caller-scope.test.ts` (two concurrent callers), `mcp-door-bearer-scope.test.ts` |
| Refusals | machine-readable classes + RFC 6750 / 9728 `WWW-Authenticate` challenge (`invalid_token` only after a credential was tried) | `lib/api/external-client-auth.ts` | `external-client-auth.test.ts` |
| Brake | 600 calls / 5 min per person (429 + Retry-After), 60 / 5 min invalid tokens per client; in-memory per instance | `route.ts` | `mcp-door-refusals.test.ts` |
| Audit | privacy-safe log line per auth and tool outcome; every confirm/execute writes an `audit_logs` row (`external_capability`, channel `assistant_mcp`, actor kind `agent`) | `lib/capabilities/external-receipt.ts`, `supabase/migrations/20260930090000_external_action_receipts_v1.sql` | `external-receipt.test.ts` |
| Toolset identity | `0.1.0+t<count>.<sha256-8>` as `serverInfo.version`; register of every published value; **top row `0.1.0+t231.6abffb4c` (#2447), production last recorded `t229`** | `lib/mcp/toolset.ts`, `docs/integrations/MCP_TOOLSET_FINGERPRINTS.md` | `toolset-fingerprint.test.ts` |
| Authorization server | **Supabase Auth's own OAuth 2.1 server** (project-level feature the owner enabled): RFC 8414 metadata at `/.well-known/oauth-authorization-server/auth/v1`, DCR, PKCE S256, `none` client auth, refresh (read live 2026-10-14). The app hosts only the RFC 9728 document, the consent screen and the grant-revoke UI. **No app-hosted revocation endpoint, no token tables, no product-level scopes (OIDC scopes only; RLS decides)** | `app/.well-known/oauth-protected-resource/route.ts`, `app/[locale]/oauth/consent/page.tsx`, `lib/auth/oauth-consent-actions.ts`, `lib/auth/connected-apps*.ts`, `components/app/connected-apps-section.tsx` | `connected-apps.test.ts`, `lib/guards/connected-apps-surface.test.ts`; production: `docs/integrations/CHATGPT_MCP_CLIENT_V1.md` §4–§7 (2026-08-30: register 201, consent 200, token 200, read, draft, confirm, DB row, replay refused) |
| ChatGPT domain proof | `/.well-known/openai-apps-challenge` serves `OPENAI_APPS_CHALLENGE_TOKEN` as text, 404 until set | `app/.well-known/openai-apps-challenge/route.ts` | `lib/guards/openai-apps-challenge.test.ts` |
| Registry | one contract (`kind` read / draft / confirm / execute; `title`, `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` and `exposed` are required fields); 15 core descriptors + group spreads (employer operations, counterparty review, team assignment, marketplace, messaging, company / evidence / people ingest, conversation-action bridge 56, workspace reads 22, domain actions 70, public jobs); `runCapability` is the only execution path | `lib/capabilities/registry.ts`, `contract.ts` | `capabilities.test.ts` (+ about 20 per-area suites), `lib/guards/mcp-execute-allowlist.test.ts` (single-step allowlist) |
| Draft to confirm | HMAC token bound to caller, input hash, workspace and state fingerprint, 5-min TTL; single-use spend ledger; after #2448 signed only with the dedicated secret in production | `lib/capabilities/confirmable.ts`, `lib/conversation/confirmation-token.ts`, `supabase/migrations/20261013120000_confirmation_spends_v1.sql` | `confirmation-token.test.ts`, `confirmation-spend-single-use.test.ts`, `confirmation-tier-honesty.test.ts`, `lib/security/confirmation-key-material.test.ts` (#2448) |
| Coverage of direction item 6 | jobs (`jobs.search`, `jobs.get`, `work.find`, `jobs.new.list`); journal (`journal.list`, `journal.work_intelligence.get`, `journal.create_draft` then `journal.confirm`, `journal.review*`); Living CV (`living_cv.skills.get`, `cv.state.get`); `interest.express_draft/confirm`; `workforce.availability`, `absence.*`, `calendar.agenda.get`; `demand.create_draft/confirm`, `demand.list`, `marketplace_listing.*`, `service_request.*`; company / project / team reads (`projects.list`, `roster.list`, `organization_*`, `team_assignment.*`); `conversation.*`, `message.send_draft/confirm` | `docs/integrations/LLM_INTEGRATION_COVERAGE_V1.md` §4 is the canonical map | registry suites |
| Internal AI | provider registry (anthropic, openai, gemini, xai, cloudflare, deepl, libretranslate, local, mock, disabled), model registry + pricing, provider chain, task routing; default-deny data egress with task-scoped grants; per-task cost ceiling, `AI_DAILY_RUN_BUDGET`, `AI_ORG_DAILY_RUN_CAP`; `ai_runs` audit; privacy refusals recorded as `blocked: egress_refused` and never counted (#2433); 14 agents incl. `conversation-intent`; web chat = deterministic intent router first, Gemini proposer for existing intents only; **no LLM tool-calling loop; no AI chat on the phone; no paid-plan gate on AI or MCP use** | `lib/ai/runtime/*`, `lib/ai/registry/agents/*`, `lib/conversation/intent-router.ts`, `lib/conversation/llm-proposal.ts` | about 19 `lib/guards/ai-*.test.ts`, `no-direct-llm-client-call.test.ts`, `prompt-registry-required.test.ts`, `ai-data-egress.test.ts`, `ai-cost-ceiling.test.ts`, `egress-precheck.test.ts` |
| Mobile | Android / iOS are themselves bearer clients of `/api/mcp` through the shared transport | `packages/client-core/src/transport.ts` | `transport.test.ts`; #2447 CI (emulator + simulator journeys) |
| Public discovery | `llms.txt` "Connect an AI assistant" section (#2376) | `lib/seo/llms-txt.ts` | `llms-txt.test.ts` |
| Production proofs | prod walks `mcp-chain` (incl. another person cannot act on this record) and `mcp-agents` (A-7 isolation) green on the synthetic cast; e2e `prod-mcp-chain.spec.ts`, `prod-mcp-agents.spec.ts`; local-stack `integrated-product-chain.spec.ts`. **All are server proofs with a minted bearer; no proof with a real external client at 229/231 tools; Claude never connected** | `.github/workflows/prod-qa-walk.yml`, `tests/e2e/*` | `docs/launch/RELEASE_SUBMISSION_PACK_2026-10-14.md` §7; `LLM_INTEGRATION_COVERAGE_V1.md` §7.1 |
| Dormant | `scripts/mcp-contract-check.ts` (bearer from env) exists but no workflow runs it | `apps/web/scripts/mcp-contract-check.ts` | none |

Gaps the inventory confirmed (each maps to §D.2 or §F): no real-client proof at
the current toolset and none with Claude; no app-side pin of the RFC 9728
`resource` value (found wrong for Claude, fixed in PR-1); no product-level
scopes (so no curated assistant toolset yet, PR-4); no prompt-injection or
tool-description hygiene guard (PR-1 adds the first); the OAuth `client_id`
is not yet recorded on receipts (planned RED, `AI_AGENT_PARTICIPANTS_V1.md`);
the coverage document's status line still says "once the RED PR is approved"
although #2336 is on `main` as `d37e956a5` (corrected in PR-1).


## B. ChatGPT — feasibility and requirements

Primary sources fetched 2026-10-17: `developers.openai.com/plugins/build/auth`,
`developers.openai.com/plugins/deploy/submission`,
`developers.openai.com/plugins/deploy/app-review`. The ChatGPT help-centre
article on developer mode (`help.openai.com/…/12584461`) and the developer-mode
guide answered 403/404 to this session, so plan eligibility below is SECONDARY.

### B.1 Confirmed (primary source)

| Requirement | ChatGPT's rule | LabourMarket.ai today | Gap |
|---|---|---|---|
| Transport | remote HTTPS MCP server; "stable, public HTTPS endpoint"; one MCP server per plugin | `POST /api/mcp`, stateless streamable HTTP | none in code; **the origin is unreachable (HTTP 402) until hosting is restored** |
| Authorization | OAuth 2.1 per the MCP spec; authorization-code + PKCE **S256** (`code_challenge_methods_supported` must list S256); `client_credentials` not supported | Supabase Auth OAuth 2.1 server, DCR + PKCE; proven end-to-end with real ChatGPT (claim `CHATGPT_MCP_CLIENT_V1`, pack §7) | none |
| Discovery | `/.well-known/oauth-protected-resource` or `WWW-Authenticate: Bearer resource_metadata=…` on 401; `resource` = canonical HTTPS identifier; ChatGPT sends it as the RFC 8707 `resource` parameter and expects the AS to copy it into the token (`aud`) | PRM route exists (pack §4) | **verify `aud`/`resource` binding at the server** (§D.2 C-3) |
| Client registration | CIMD preferred when `client_id_metadata_document_supported: true` (auth methods `none` / `private_key_jwt`); else DCR ("keep the registered client valid while the connection is in use"); else predefined client | DCR | CIMD not advertised (§D.2 C-1) — optional, DCR stays supported |
| Redirect URIs | `https://chatgpt.com/connector_platform_oauth_redirect` when RFC 9207 `iss` is implemented; otherwise `https://chatgpt.com/connector/oauth/{callback_id}`; copy the exact URI from the server's management page | DCR registers whatever redirect ChatGPT presents | none, provided the AS has no static redirect allowlist |
| Issuer identification | set `authorization_response_iss_parameter_supported: true` only if `iss` is returned on EVERY authorization response (success and error) and equals the metadata `issuer` | unknown | §D.2 C-2 |
| Token verification | "assume the token is untrusted": verify signature, `iss`, `exp`/`nbf`, `aud`/`resource`, scopes on every call; 401 + challenge on failure | bearer verification through the caller's own Supabase client (RLS) | audience check §D.2 C-3 |
| Public tools | per-tool `securitySchemes` (`noauth` vs `oauth2` + scopes) **and** runtime `_meta["mcp/www_authenticate"]` on refusals — "Without both halves ChatGPT will not show the linking UI for that tool" | no anonymous tool exposed today; `jobs.search` / `jobs.get` (#2447) run through the caller's client | §F PR-3 if anonymous job search from ChatGPT is wanted |
| Review (plugin directory, "With MCP") | organization owner or Apps Management Write; **individual or business identity verification**; production HTTPS URL; domain token at `/.well-known/openai-apps-challenge` (plain text); reviewer account without MFA/e-mail codes/magic links; **5 positive + 3 negative test cases**; demo video URL; icon; website / support / privacy / terms URLs; policy attestations; "Projects with EU data residency cannot submit plugins with MCP servers for review" | challenge route (#2374), test cases drafted (pack §4), privacy URL live | owner items (§I) |
| Review criteria for tools | `readOnlyHint` true only for pure reads; `destructiveHint` true for irreversible outcomes with a justification; `openWorldHint` false for a bounded account; return "only what's strictly necessary", no internal ids / telemetry / secrets; user identifiers only on request | annotations are required fields of every capability contract; anonymous projections | one audit pass over 231 tool descriptions (§F PR-4) |
| Post-publication | daily automated rescans; changed tools go live after automated checks; appeals by e-mail | — | — |

### B.2 SECONDARY (could not be confirmed against a primary page today)

Developer mode (custom connector by URL, without the directory) is reported
as available on Plus / Pro / Business / Enterprise / Edu on the web, with
**write actions limited to Business / Enterprise / Edu workspaces after an
admin enables it**; individual Plus / Pro are reported read-only. Free is not
listed anywhere. The owner verifies this in their own ChatGPT **Settings →
Connectors → Advanced** before planning a test; this session does not claim
it. Item 15 of the direction stands: a ChatGPT subscription grants chat use of
the connector, **not** API credits for LabourMarket.ai's own model calls.

## C. Claude — feasibility and requirements

Primary sources fetched 2026-10-17: `claude.com/docs/connectors/building/authentication`,
`claude.com/docs/connectors/building/submission`, `claude.com/docs/directory/publish`.

### C.1 Confirmed (primary source)

| Requirement | Claude's rule (verbatim where short) | LabourMarket.ai today | Gap |
|---|---|---|---|
| Who can add a custom connector / submit | "Plan: Pro, Max, Team, or Enterprise. Free accounts can't submit"; on Team / Enterprise an Owner (or a custom-role **Directory** permission); "Anyone on a paid Claude plan can submit" | owner has a claude.ai account (this session) | none |
| Transport / reachability | remote HTTPS; Anthropic egress `160.79.104.0/21` must reach the MCP server **and** the authorization server's `/.well-known/` (a WAF on the IdP breaks the flow) | `/api/mcp`; AS = Supabase Auth at `https://<ref>.supabase.co` | hosting (402); Cloudflare WAF rules, once hosting moves, must allow the range to BOTH hosts |
| Start of sign-in | "A `401` is required to start sign-in, and Claude ignores a `WWW-Authenticate` header on a `200`"; `resource_metadata` pointer in the header; fallback probe `/.well-known/oauth-protected-resource/<path>` then `/.well-known/oauth-protected-resource` | PRM route exists | **pin the 401 shape** (§D.2 C-4) |
| PRM content | "`resource` must equal the URL as the user enters it in Claude, including any path component"; "Claude uses only the first entry in your metadata's `authorization_servers` list" | — | pin `resource == https://labourmarket.ai/api/mcp` and a single AS entry (§D.2 C-4) |
| Client registration | `oauth_dcr` and `oauth_cimd` supported by default; CIMD chosen only when AS metadata advertises **both** `client_id_metadata_document_supported: true` **and** `"none"` in `token_endpoint_auth_methods_supported`, else DCR; "DCR causes Claude to register a new client on every fresh connection" | DCR | CIMD (§D.2 C-1) is the recommended path for directory traffic; not a blocker |
| PKCE / scopes | S256 on every request; scopes from the 401 `scope=` parameter, else PRM `scopes_supported`; `offline_access` appended when the AS lists it | — | pin `code_challenge_methods_supported: ["S256"]` (§D.2 C-4) |
| Callback URLs | hosted apps: exactly `https://claude.ai/api/mcp/auth_callback`; Claude Code: loopback `http://localhost/callback` and `http://127.0.0.1/callback` **port-agnostic**; consent screen must display the redirect hostname | DCR registers the redirect Claude presents; consent page `/[locale]/oauth/consent` | verify loopback port-agnostic matching if Claude Code is in scope; hostname display on consent (§D.2 C-5) |
| Token endpoint | accepts `application/x-www-form-urlencoded`; refresh on 401 and proactively 5 min before expiry; `invalid_grant` for a dead refresh token; **rotate refresh tokens for public clients**; 10 s limit on discovery / registration / token, 30 s on refresh | Supabase Auth | latency depends on hosting + Supabase region; measured in the conformance walk (§F PR-2) |
| Directory requirements | every tool has `title` + `readOnlyHint` or `destructiveHint`; OAuth 2.0 for authenticated services; documentation URL, privacy policy URL, support contact, icon; fully populated reviewer account; "Missing or incomplete privacy policies result in immediate rejection"; seven compliance acknowledgments; automated scan → listed as **Community** by default | annotations required by contract; privacy page carries "pending legal review" | legal sign-off (§I) |
| Allowed link URIs | HTTPS origins you own, each subdomain listed; custom scheme `labourmarketai:` allowed for your own native app | `https://labourmarket.ai`, `https://www.labourmarket.ai`, `labourmarketai:` | listing field |

### C.2 Not yet done with Claude

No connection from Claude has ever been made (pack §7 "NOT VERIFIED"). The
first proof is a custom connector added by the owner at
**Settings → Connectors → Add custom connector** with
`https://labourmarket.ai/api/mcp`, once the origin is reachable. That needs no
directory submission and no approval; it is the step the submission portal
later asks you to confirm.

## D. Provider-neutral MCP architecture and security review

### D.1 The architecture (what is, restated once)

One backend, one registry, one authorization model:

```
person ── web (session cookie) ──────────────┐
person ── Android / iOS (Supabase session → bearer) ─┤
person ── ChatGPT / Claude / any MCP client (OAuth 2.1 bearer, consent-scoped) ─┤
                                                                               ▼
                                            POST /api/mcp  (JSON-RPC: initialize, tools/list, tools/call)
                                                                               │
                                            capability registry (ONE contract per tool: input, output, annotations,
                                            idempotency, draft→confirm binding, audit)
                                                                               │
                                            the caller's OWN Supabase client → RLS → canonical tables
```

The invariants that make it provider-neutral and that every PR in §F must keep:
- **M-1 no direct table access** from any client; **M-2 no mobile-only or
  client-only endpoint**; **M-3 one permission model** — the token is the
  person's own session, the server never holds a service-role key for a
  client call (#2448 completes this for confirmation signing);
- **draft → confirm** for every consequential write, token bound to user,
  action, input hash, state fingerprint, 5-minute TTL, single-use spend ledger
  (decision 0024);
- **audit**: every tool call through the same `ai_runs` / capability ledger
  as the web, with the client identified by its OAuth client, never trusted;
- **no client in the code path**: nothing in the registry or the route reads
  "ChatGPT" or "Claude"; client differences live in metadata (annotations,
  `securitySchemes`, PRM) that every standards client reads.

### D.2 Conformance findings against MCP 2026-07-28 and the two clients' stricter rules

The MCP authorization specification (revision 2026-07-28, fetched today) now
says: PRM (RFC 9728) **MUST**; AS metadata RFC 8414 or OIDC Discovery **MUST**
(at least one); **CIMD SHOULD**, **DCR deprecated** (kept for compatibility);
clients **MUST** send RFC 8707 `resource`, servers **MUST** validate audience;
RFC 9207 `iss` **SHOULD**; 403 `insufficient_scope` with `scope=` for step-up;
servers **MUST NOT** accept or pass through tokens not issued for them.

| Id | Finding | Severity | Smallest fix | Where |
|---|---|---|---|---|
| C-1 | CIMD not advertised (`client_id_metadata_document_supported` absent) — DCR works for both clients today, but it is deprecated in the spec and Claude warns of client-table growth under directory traffic | medium, not blocking | depends on Supabase Auth's OAuth server supporting CIMD; if it does not, pre-register one client per hosted assistant (`oauth_anthropic_creds` for Claude; "predefined OAuth client" for ChatGPT) — both consent-gated, no secret in the repo | AS (Supabase) + a doc row; owner e-mails the client id to `mcp-review@anthropic.com` when chosen |
| C-2 | RFC 9207 `iss` — unknown whether the AS returns it and advertises it; ChatGPT picks the stable redirect URI only when it does | low | read the AS metadata once the origin is up; pin the advertised flag against observed behaviour | conformance walk (PR-2) |
| C-3 | Audience binding — the server must refuse a token whose `aud`/`resource` is not `https://labourmarket.ai/api/mcp` | **high if absent** (token issued for another resource would be accepted) | verify in the bearer path; add the check + a guard test | `apps/web/app/api/mcp` bearer verification (PR-1) |
| C-4 | 401 shape and PRM exactness — Claude starts sign-in only on a 401 with `WWW-Authenticate: Bearer resource_metadata=…`; `resource` must equal the entered URL exactly; one AS entry; S256 advertised | **high** (connection simply fails, with no useful error) | **FOUND AND FIXED in PR-1 (this PR):** the document said `resource: <origin>`; it now says `<origin>/api/mcp` on both the root and the RFC 9728 path-suffixed location (`/.well-known/oauth-protected-resource/api/mcp`, new), from one builder; `lib/guards/mcp-client-conformance.test.ts` was red on the old value and is green now. S256 is the authorization server's (Supabase) — read live in PR-2 | PR-1 ✅ |
| C-5 | Consent screen shows the redirect hostname (spec + Claude) and loopback redirects match port-agnostically (Claude Code) | low | copy + matcher check | `/[locale]/oauth/consent` (PR-1 if missing) |
| C-6 | Per-tool `securitySchemes` + `_meta["mcp/www_authenticate"]` — needed only if any tool is to be callable anonymously from ChatGPT (public job search) | medium, product-gated | mark `jobs.search` / `jobs.get` `noauth` only if the owner wants anonymous discovery from assistants (direction item 7) | PR-3 |
| C-7 | Tool surface size — 231 tools; Claude and ChatGPT both review names/descriptions; ChatGPT rescans daily | medium | a curated **assistant toolset** (the seven approved capability groups of direction item 6, ~25–35 tools) selected by OAuth scope, the rest reachable only to the web/mobile bearer; no second registry — a filter on the one registry keyed by the token's scope | PR-4 |
| C-8 | Prompt-injection resistance — tool results are data; descriptions must not instruct the model; consequential writes always confirm | present by construction (draft → confirm; refusal copy) | add the negative tests N1–N3 of the pack as automated guards over the registry (no tool deletes another person, no payment tool, no contact fields in search projections) | PR-1 |

### D.3 Security review verdict

- **Credentials**: no service-role key, database secret or unrestricted bearer
  reaches a client; the mobile build and every MCP client hold only the anon
  key and the person's own session. #2448 removes the service-role reuse in
  production and its follow-up (`fix/cc/confirmation-secret-no-fallback-anywhere`)
  removes it everywhere else, so no code path signs with the service-role key.
  **PASS, conditional on both merging after `CONVERSATION_TOKEN_SECRET`
  exists on the host.**
- **Tenant isolation**: enforced by RLS under the caller's client; the prod
  walks `mcp-chain` and `mcp-agents` exercise it on the synthetic cast. **PASS
  for the proven chains; the audience check C-3 is the open item.**
- **Consent and revocation**: consent screen, Connected-apps revoke, token
  TTL and refresh rotation by Supabase Auth. **PASS; add C-5 copy.**
- **Confirmation**: single-use, bound, expiring. **PASS.**
- **Audit**: per-call ledger + per-person brake (600 / 5 min). **PASS.**

## E. Feature matrix

Legend: ✅ live and proven · 🟡 capability exists, client surface missing ·
⛔ not available by design or owner gate · ◻ not applicable.
"ChatGPT" and "Claude" columns describe what the published 231-tool surface
offers once the client is connected; no client is connected today.

| Capability (direction item 6) | Web | Android / iOS (after #2447) | ChatGPT | Claude | Other MCP clients |
|---|---|---|---|---|---|
| Search jobs and opportunities (public board) | ✅ `/jobs` | ✅ Jobs screen (`jobs.search` / `jobs.get`) | 🟡 tools exist; anonymous call needs C-6 | 🟡 same | 🟡 same |
| Opportunities visible to me (`work.find`, `jobs.new.list`, `opportunities.saved.list`) | ✅ | ✅ Opportunities | ✅ tools | ✅ tools | ✅ |
| View Work Journal and Living CV | ✅ | ✅ Journal, Profile | ✅ (`journal.list`, `journal.work_intelligence.get`, `living_cv.skills.get`, `cv.state.get`) | ✅ | ✅ |
| Prepare and confirm work entries | ✅ | ✅ Log work (draft → confirm) | ✅ (`journal.create_draft` → `journal.confirm`) | ✅ | ✅ |
| Express interest in opportunities | ✅ | ✅ | ✅ (`interest.express_draft/confirm`) | ✅ | ✅ |
| Manage availability (`workforce.availability`, `absence.*`, `calendar.agenda.get`) | ✅ | ✅ Who is free (read); absence write 🟡 | ✅ tools | ✅ | ✅ |
| Create and review marketplace needs (`demand.create_draft/confirm`, `marketplace_listing.*`, `service_request.*`) | ✅ | ✅ Post a need; listings 🟡 | ✅ tools | ✅ | ✅ |
| Authorized company / project / team information | ✅ | 🟡 (bearer-reachable, screens are the gap) | ✅ tools (RLS-scoped) | ✅ | ✅ |
| Messaging (`conversation.*`, `message.send_*`) | ✅ | 🟡 | ✅ tools | ✅ | ✅ |
| Internal AI chat (LabourMarket.ai's own model calls) | ✅ (Gemini: translation + chat intent; deterministic continuity) | ⛔ not on the phone (owner scope) | ◻ the assistant is the model | ◻ | ◻ |
| Payments / money movement | ⛔ no tool exists (by design) | ⛔ | ⛔ | ⛔ | ⛔ |
| Account deletion / erasure | ✅ request path | ✅ request path | ⛔ no tool (RED executor #2442) | ⛔ | ⛔ |

## F. Implementation PRs and dependencies (small, reversible, each with tests)

| PR | Scope | Depends on | Size | Evidence it ships with |
|---|---|---|---|---|
| **PR-1 MCP client conformance** (this PR, `fix/cc/mcp-client-conformance`) | the C-4 fix (resource identity + path-suffixed discovery location) and the first conformance guard: 401 + `WWW-Authenticate` shape, PRM fields (`resource`, one AS, header bearers, no scopes), toolset review rules (title, hints, names ≤ 64, drafts/reads vs confirms), negatives N1–N2, no instruction-to-model text. NOT here (authorization-server facts, read live in PR-2): S256, `registration_endpoint`, CIMD flag, `iss`. Audience (C-3) and consent hostname (C-5) are follow-ups once the live token shape is read | none — runs without network | 6 files | vitest red-before/green-after (3 PRM assertions failed on the old route, all green after); related suites 17 files / 125 tests; typecheck; eslint |
| **PR-2 External-client conformance walk** | `prod-qa-walk.yml` step `mcp-external-client`: a scripted MCP client that does what Claude's and ChatGPT's clients do (PRM → AS metadata → DCR → PKCE S256 → consent as the synthetic worker → token with `resource` → `initialize` / `tools/list` / one read / one draft → confirm → refresh with rotation → revoke → 401) and records endpoint latencies against the 10 s / 30 s limits | a reachable origin; the walk budget (#2428) | 1 script + 1 workflow step | JSON artefact per run; claim token `MCP_EXTERNAL_CLIENT_CONFORMANCE_PROVEN` |
| **PR-3 Anonymous discovery (optional, owner-gated)** | `securitySchemes: noauth` on `jobs.search` / `jobs.get` + `_meta["mcp/www_authenticate"]` on protected refusals; PRM `scopes_supported` minimal | owner says anonymous job search from assistants is wanted (direction item 7 says "where legally appropriate") | ≤ 4 files | guard: only the two anonymous-projection reads carry `noauth` |
| **PR-4 Assistant toolset by scope** | one registry, a scope-keyed filter: scope `assistant` exposes the direction-item-6 groups (~25–35 tools); full surface stays on the web/mobile bearer; `tools/list` reflects the token's scope; fingerprint per scope recorded | PR-1 | ≤ 8 files | registry suite; fingerprint doc row |
| **PR-5 CIMD or pre-registered clients** | if Supabase Auth supports CIMD: advertise it; else document the pre-registered-client path per hosted assistant and add the `iss` parameter if the AS can emit it | finding from PR-2 run | config + doc | PR-2 re-run shows the client picked CIMD / the stable redirect |
| **PR-6 Listing metadata as code** | `/.well-known/openai-apps-challenge` already exists; add a served `llms.txt` connector section revision naming the toolset, the allowed link origins and the auth modes; icon export 512 px | none | ≤ 3 files | guard over the served text |

Not planned, and why: a second MCP server per client (M-2), Apps SDK widgets
(optional UI; a later product decision), any mobile AI chat (owner scope).

## G. Free and paid usage economics

| Cost line | Who pays | How it is bounded today | Note |
|---|---|---|---|
| ChatGPT / Claude model tokens while a person uses the connector | the person's own assistant plan; **not** LabourMarket.ai | — | a connector call costs LabourMarket.ai only compute + database; item 15: no consumer plan gives LabourMarket.ai free API access |
| LabourMarket.ai's own model calls (translation, chat intent, extraction) | LabourMarket.ai (Gemini live) | provider registry with per-task cost ceiling, daily + per-org caps, `ai_runs` audit, refusals never count (#2433) | the only paid AI line; no new provider needed for the connector programme |
| Supabase Auth OAuth traffic (DCR client rows, token rows) | LabourMarket.ai | DCR creates one client per fresh Claude connection → C-1 / PR-5 keeps the table bounded | housekeeping, not a fee |
| Per-person brake | — | 600 calls / 5 min per person; 60 / 5 min invalid tokens per client | protects the database from a runaway agent loop |
| Paid-plan entitlements | — | `live_payments_enabled = false`; Stripe live armed with 0 webhooks (N-1) | **no connector feature may be billed until N-1 is resolved**; nothing in §F adds a paid gate |

## H. First usable external-client beta — plan

Goal: one real person, on their own paid Claude or ChatGPT plan, connects
LabourMarket.ai by URL and, in one conversation, reads their week, drafts and
confirms a journal entry, and expresses interest in an opportunity — on
production data, under their own RLS, with the audit row visible.

| Step | Who | Precondition |
|---|---|---|
| 1 | hosting session | origin reachable, `/api/health` with build, `CONVERSATION_TOKEN_SECRET` set (shared with the mobile plan) |
| 2 | agent | PR-1 merged (GREEN) |
| 3 | agent | PR-2 run green on the synthetic worker — latencies recorded |
| 4 | owner | add the custom connector in Claude (Settings → Connectors → Add custom connector → `https://labourmarket.ai/api/mcp`) and in ChatGPT developer mode; sign in as themselves; run the pack §4 prompts P1–P5 and N1–N3 | 
| 5 | agent | record the two walks (client, plan, surface, result, defects) in §H.1; fix defects as GREEN PRs |
| 6 | owner | decide PR-3 (anonymous discovery) and PR-4 (curated toolset) |
| 7 | owner | directory submissions (Claude portal; OpenAI plugin portal) with the pack's listing text — **public, therefore owner-only** |

### H.1 Walk evidence — to fill

| Walk | Client / plan / surface | Build | Date | P1–P5 | N1–N3 | Latency (discovery / token / refresh) | Defects |
|---|---|---|---|---|---|---|---|
| W-1 | Claude (custom connector) | | | not run | | | |
| W-2 | ChatGPT (developer mode) | | | not run | | | |

## I. Remaining owner decisions

| Id | Decision | Why the owner |
|---|---|---|
| X-1 | Anonymous discovery from assistants: expose `jobs.search` / `jobs.get` without sign-in (PR-3)? | legal / product boundary (direction item 7) |
| X-2 | Curated assistant toolset (PR-4): which of the item-6 groups go first, and is messaging in or out of the first scope | product |
| X-3 | Registration mode for hosted assistants if Supabase Auth lacks CIMD: keep DCR, or pre-register one client per assistant (Anthropic-held credentials; OpenAI predefined client) | the owner e-mails the client id; an agent must not |
| X-4 | ChatGPT directory: submit from a non-EU-data-residency OpenAI project; identity verification; which plan the owner's test workspace is on (write actions need a workspace with developer mode enabled by an admin — SECONDARY) | account, identity |
| X-5 | Claude directory: submit from the Pro/Max/Team/Enterprise account that should own the listing | account |
| X-6 | Legal: remove the "pending legal review" banner from privacy/terms before any directory submission (immediate rejection otherwise) | lawyer |
| X-7 | Review identity: the same synthetic worker as the mobile plan, with a password (no MFA, no magic link — both portals require it) | credential |
| X-8 | Whether LabourMarket.ai's own chat gets LLM tool calling (today deterministic continuity + Gemini intent) and on which paid provider | paid-model decision (pack §7) |
| AGENT-1..4 | agent-as-participant, agent↔agent negotiation (`AI_AGENT_PARTICIPANTS_V1.md`) | architecture |
