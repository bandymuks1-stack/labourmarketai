# ChatGPT as a first-class client — MCP adapter v1

> Status 2026-08-29: implemented and **locally proven** (production build +
> real local GoTrue/RLS, 10/10 controls). NOT yet connected to real ChatGPT —
> that requires the owner gates in §5. Stacked on the auth-core boundary
> (PR #1331 reconciliation); nothing here merges before it.

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
| `journal.create_draft` | draft | **no** | implemented + unit-proven: validates the SAME input contract as the chat work-log form, returns exact preview + one-time HMAC confirmation token, writes NOTHING |
| `journal.confirm` | confirm | **no** | implemented + unit-proven: verifies the token (tamper/user-mismatch rejected), then refuses honestly — the canonical journal write still resolves its own cookie session (`lib/journal/actions.ts`), so executing it for a bearer caller would misattribute; extraction into a client-threading service function is the recorded next step |

Exposure is a reviewed product decision (`exposed:` in the registry), the
honest-gate pattern at capability granularity. `profile.get` deliberately
returns recorded facts, not a second completeness score — the Player Card
readiness model remains the ONE completeness source and is cookie-coupled
today (the same `shared-blocked` reality as dashboard-search).

## 4. Proof levels (§20 vocabulary)

- UNIT PROVEN: 21 tests (`lib/mcp/protocol.test.ts`, `lib/capabilities/capabilities.test.ts`)
- LOCAL AUTH/RLS PROVEN: 10/10 live controls — RFC 9728 doc, 401+`WWW-Authenticate`
  pointer, malformed-bearer refusal, initialize/notification semantics,
  tools/list shows ONLY exposed reads, both reads return the caller's own
  rows under two different real users
- CHATGPT CLIENT CONTRACT PROVEN: **NO** — needs a real ChatGPT connection (§5)
- PRODUCTION PROVEN: **NO** — stacked on RED-gated #1331

## 5. Owner gates to go live

1. Approve + merge #1331 (auth-core RED), then this PR.
2. Enable the **OAuth 2.1 server** in the Supabase dashboard (project-level
   feature; until then the discovery document is accurate but the referenced
   authorization server does not answer).
3. Connect ChatGPT (developer mode → add MCP server → `https://<domain>/api/mcp`)
   and run the §4 controls against the real client.
4. Decide the journal write extraction slice (unlocks `journal.confirm`,
   the first ChatGPT write).
