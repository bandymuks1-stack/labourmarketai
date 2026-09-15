# ChatGPT as a first-class client — MCP adapter v1

> Status 2026-08-30: **connected to real ChatGPT in production.** OAuth 2.1
> (DCR → consent → token), capability discovery, and a caller-scoped
> `profile.get` read are all proven against the live client with server-log
> evidence (§4, §6). The first real-client WRITE (`journal.create_draft` →
> `journal.confirm`) is the remaining unproven step.
>
> **Update 2026-09-10 — read §8, §9 and §10 first, they supersede the counts
> and the latency assumptions above.** A real Work session was traced end to
> end in production: the owner's observed 38–40 s round trip is **~2.1 s of
> LabourMarket and ~36 s of ChatGPT orchestration** (§8, with the logged
> timeline). The exposed surface was already 24 capabilities, not the three
> the session surfaced; it is now 26 with organization people ingestion (§9).
> The canonical brand is declared to the client, and the circular "L" the
> owner saw is ChatGPT's own fallback avatar, not a LabourMarket asset (§10).

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

---

## 8. Latency — the 38–40 s observation, decomposed (2026-09-10)

The owner ran `profile_get` from a real ChatGPT Work session and observed a
**38–40 second** round trip. That number is real. It is also **~95% not ours**,
and the fix list below is scoped to the part LabourMarket controls.

### The measured production trace

Reconstructed from Vercel runtime logs (`/api/mcp`, deployment
`dpl_9euwghWk5v7U3So6n6bLZE6GYXKS`) joined to Supabase `edge_logs` on project
`gorgitwvdzxbnaxhrsrw`. Every line below is a logged event, not an estimate:

| time (UTC) | surface | event |
|---|---|---|
| 10:29:57.106 | Supabase | `POST /auth/v1/oauth/token` 200 — ChatGPT refreshes the access token |
| 10:29:58.326 | Vercel | `POST /api/mcp` 200 — request #1, `auth ok`, **no tool call** |
| 10:29:59.675 | Supabase | `GET /auth/v1/user` 200 — request #1's bearer verification |
| 10:29:59.813 | Vercel | `POST /api/mcp` 200 — request #2, `auth ok` + `profile_get ok` |
| 10:29:59.903 | Supabase | `GET /auth/v1/user` 200 — request #2's bearer verification |
| 10:29:59.952 | Supabase | `GET /rest/v1/profiles` 200 — `profile.get` read 1 |
| 10:30:00.369 | Supabase | `GET /rest/v1/workers` 200 — `profile.get` read 2 |

**The whole interaction was TWO MCP requests.** There was no repeated
capability discovery, no re-`initialize` storm, no N+1 fan-out.

### The split

| segment | measured | owner target |
|---|---|---|
| `LABOURMARKET_EXECUTION_TIME` (first byte in to last DB read out) | **~2.1 s** | <= 3 s, already met |
| of which cold start, before auth was even attempted | ~1.35 s | the real target |
| of which the two sequential `profile.get` reads | 417 ms | fixed below |
| `CHATGPT_ORCHESTRATION/UI_TIME` (remainder of 38–40 s) | **~36–38 s** | not ours |

**Zero AI calls.** No `lib/ai/` runtime is on this path; the deterministic
reads and the whole people-ingest flow call no LabourMarket model provider.
ChatGPT already supplies the conversational layer.

### What was fixed here

1. **`profile.get` ran its two independent reads sequentially** — `profiles`
   then `workers`, both keyed on the caller's own id. The 417 ms gap above is
   pure waiting. Now `Promise.all`; authorization is untouched (both still run
   on the caller's RLS-scoped client).
2. **`tools/list` rebuilt every tool's JSON Schema on every request** —
   `z.toJSONSchema()` across the full exposed set, on a hot path a client hits
   on each new conversation. Memoized lazily (a derived view containing no
   user data, no identity and no authorization decision), along with the
   tool-name to capability lookup.
3. **An oversized body answered a bare `{ ok: false }`** — now a named
   `request_too_large` carrying the limit and what to do instead, so "your file
   exceeded this door" cannot reach a user as "the import did not work".

### What was NOT changed, deliberately

- **Cold start (~1.35 s, the largest single item)** is the route's module
  graph: `app/api/mcp/route.ts` pulls the whole capability registry, which
  pulls the journal, worker, demand, opportunity, company and evidence-import
  cores at import time. Making these lazy is a real improvement and a real
  refactor of the registry's shape — it is the **next smallest gap**, not
  something to bolt on inside a slice that also changes the write surface.
- **The per-request `GET /auth/v1/user` round trip** (~90–230 ms each) is the
  platform verifying the token properly. Caching verified tokens would cut it
  and would be an **auth-core change** — RED class, owner-gated. Not taken.
- **The 64 KB request-body cap** stays. It bounds roughly 48 KB of base64 file,
  a few thousand names in a CSV; larger lists belong in the web panel, and the
  refusal now says so.

### Honest conclusion

A deterministic profile read is **not** a 38-second operation on our side and
was not one before this slice; it was ~2.1 s, of which ~1.35 s was cold start.
The user-visible 38–40 s is dominated by ChatGPT's own orchestration — model
turn, tool selection, rendering — which this repository cannot change. The two
fixes above remove ~0.4 s of measured waiting plus the repeated schema work;
they do not and cannot turn 38 s into 3 s.

---

## 9. Organization people ingestion through ChatGPT (2026-09-10)

`organization_people` is the canonical organization-to-person roster: people an
organization vouches for who **need not have accounts**, with a consent
lifecycle (`unlinked` -> `link_proposed` -> `linked`). The evidence import READS
that roster; the ingestion flow is what puts people on it.

### One architecture, two transports

```
                 web panel (cookie)  -> ingest-actions.ts ----+
FILE / ROWS -----                                             +--> ingest-service.ts
                 ChatGPT (bearer)    -> people-ingest-  ------+           |
                                        capabilities.ts                   |
                                                                          v
                                   planPeopleIngest (pure) + organization_people
```

`lib/organization-people/ingest-service.ts` is new and is the **only**
preview/commit implementation. The server actions previously owned that logic
and derived the caller from `cookies()`, which no bearer client can do; rather
than write a second copy for the second transport, the body moved down and now
takes an already-authenticated `DomainCaller`. The file reader
(`ingest-file.ts`) is shared the same way, so a file refused in the browser is
refused identically through an assistant.

### The two tools

| tool | kind | behaviour |
|---|---|---|
| `people_ingest_preview` | draft, `readOnlyHint:true` | parses a workforce list (xlsx/xlsm/csv/tsv/txt, base64) or explicit rows, matches against the roster, names every duplicate and ambiguity. **Writes nothing.** Mints a one-time token ONLY when nothing is unresolved |
| `people_ingest_commit` | confirm, append-write | verifies that token against the exact previewed set, re-plans against the roster as it is NOW, writes, reads back by id |

Ambiguity resolution is re-previewing with `resolutions` — the domain's own
shape — rather than a third tool with no domain counterpart.

### The invariants, and where they are enforced

- **A file arriving is not a commit.** The preview is the only tool that takes
  a file and it cannot write; the commit takes no file at all.
- **A commit requires a token bound to what was shown.** Minting is guarded by
  `!needsReconciliation && !needsRelationship`, so a permit cannot exist for a
  batch with an open question. Replay, widening, relationship change,
  cross-user and tamper are each exercised in
  `people-commit-confirmation.test.ts` — run, not grepped.
- **The token carries no personal data**: names are hashed into the
  fingerprint, so a token in a chat transcript discloses nothing.
- **ChatGPT asserts no authority.** An `organizationId` is a SELECTOR among the
  caller's own memberships (`resolveEvidenceOrganization`), never a grant; the
  write uses the RESOLVED id. Guarded.
- **The relationship is supplied, never inferred** — no batch is quietly filed
  as `employee`.
- **No governance, no accounts, no CV.** Nothing writes `company_memberships`,
  `profiles` or `auth.users`; every row starts `link_state:'unlinked'`.
- **Failure classes stay distinct**: `not_authorized`, `needs_migration`,
  `unavailable`, `too_many_rows`, `unresolved`,
  `organization_choice_required`, `not_supported`, `no_name_column`,
  `nothing_parsed`. A failed read is never an empty roster.
- **PDF/DOCX CVs are refused by name.** Keeping a person's name while
  discarding their professional history would read as "imported" to the
  organization and as erasure to the person.

### Exposed capability surface

**Before:** 24 exposed capabilities (profile, Living CV, journal, interest,
work card, demand, context, workforce availability, and the 11 evidence-import
steps). The owner's session surfaced only profile/CV/journal, but the rest were
already listed — that was a discovery/selection outcome inside ChatGPT, not a
missing exposure.

**After:** 26 — the two above. Exposure remains a reviewed decision, pinned in
`lib/capabilities/capabilities.test.ts`.

---

## 10. Brand — the canonical mark on the ChatGPT app

**Canonical source:** `docs/brand/source/LM_Color Single.svg`, the owner's
original CorelDRAW vector, md5 `eafd130e9820d6e9df12cc075229d0b5`, archived in
the repo by PR #1683. Everything the product serves is a geometry-verbatim
derivation of it:

| asset | use | relationship to the source |
|---|---|---|
| `public/brand/lm-mark.svg` | full mark | coordinates verbatim; orange becomes the metallic-gold gradient; the source's opaque black plate dropped |
| `public/app-icon.svg`, `app/icon.svg` | favicon / PWA tile | same geometry; flat `#D4AF37`, because a five-stop ramp resolves to mud at 16 px |
| `components/ui/lm-logo.tsx` | in-app | same geometry |

`lib/guards/visual-system-black-gold.test.ts` pins four original coordinates
and the `.ai` dot in every one of them, and keeps the untouched source archived
as proof of derivation. **No logo was generated, redrawn or re-traced in this
slice, and none needed to be.**

The mark is an **LM monogram**, not a letter in a circle. The circular "L" the
owner saw in ChatGPT is therefore **not our asset** — it is the host's own
fallback avatar, shown because the MCP server declared a bare machine name
(`labourmarket-ai`) and no identity at all.

**Changed here:** `initialize` now returns `title: "LabourMarket.ai"`,
`websiteUrl`, and `icons` pointing at the two canonical assets by absolute
URL. These are the MCP spec's own identity fields and are additive — a client
that predates them ignores them. A guard asserts the MCP route declares those
exact canonical paths, that the paths resolve to files carrying the original
geometry, and that **no second logo asset** is introduced for the integration
(negative-controlled: planting a `chatgpt-logo.svg` fails the guard).

**OWNER GATE — the remaining half.** Whether a host renders a server-declared
icon is the host's decision, and ChatGPT's connector list has historically
drawn its own avatar from the connector name. If the LM mark does not appear
after this deploys, the icon must be set **inside ChatGPT's connector
settings** by the owner, from `public/app-icon.svg`. That is a ChatGPT-side UI
action; no repository change can perform it.
