# DISTRIBUTION SURFACE READINESS — 2026-09-14

Six surfaces, audited against **current** official requirements (verified this
session, not from memory) and against the code. Continues
`AUDIT_CHECKPOINT_2026-09-14_end-to-end.md`.

Classification used throughout:

| Class | Meaning |
|---|---|
| **CODE-READY** | Done, in this repo, verifiable by a test |
| **OWNER-CREDENTIAL-GATED** | Needs a credential, account, key or legal declaration only the owner can hold |
| **EXTERNAL-REVIEW-GATED** | Complete on our side; a third party decides |

---

## THE FINDING THAT MATTERED MOST

**The MCP door was pinned to a superseded protocol revision.**

`lib/mcp/protocol.ts` declared `2025-06-18` and supported
`{2024-11-05, 2025-03-26, 2025-06-18}`. The current revision is **`2026-07-28`**,
published 28 July 2026 — seven weeks before this audit. A client negotiating
the current revision was silently answered in an older one.

Both MCP-based surfaces (ChatGPT and the Claude Connector Directory) depend on
this, and it was invisible: every test passed, because the stale version string
was spelled correctly.

**What the revision changed, and what it cost us:** `2026-07-28` makes MCP
statelessly request-scoped — the `initialize` handshake is removed, the version
travels on every request, `Mcp-Session-Id` is gone, discovery moves to
`server/discover`, and list results carry cache directives.

**This door was already stateless** — no sessions, no SSE, no subscriptions,
one JSON-RPC message per POST. So the revision was a *naming and discovery*
change here, not an architecture change, and everything it deprecates (roots,
sampling, logging, HTTP+SSE) was never implemented. That is why the fix is
additive rather than a rewrite.

---

## 1. WEB / PWA

### Found: the PWA has not been installable

`app/manifest.ts` declared **SVG icons only**. That is valid manifest JSON, it
renders correctly everywhere a developer looks, and Chromium will not offer to
install it — the install criteria require a raster icon of at least 192×192,
and 512×512 for the splash. Nothing fails, nothing logs, no test goes red. The
browser simply never shows the prompt.

This also blocked the Play TWA route, which depends on an installable PWA.

**CODE-READY (this session)**
- `public/icon-{192,512}.png` and `public/icon-maskable-{192,512}.png`,
  rasterized from the owner's own `public/app-icon.svg` — geometry verbatim,
  no new design and no brand decision taken.
- Maskable icons are a **separate rendering**, not the same file relabelled:
  an Android launcher crops to ~80% of width, so the mark is drawn at 80% on a
  full-bleed ink plate. Declaring the "any" PNG as maskable clips the glyph.
- `scripts/generate-icons.mts` + `pnpm -F web icons:generate` — the PNGs are
  binary, so nothing in a diff shows whether they still match the brand
  source; the generator is what makes that relationship checkable.
- `lib/guards/pwa-installability.test.ts` — parses the real PNG IHDR headers
  off disk and calls the real `manifest()`. It asserts pixels, not filenames:
  a string check would have passed with a 1×1 pixel or a missing file.

**Still open**
- Offline / service worker — **deliberately absent**, and the manifest has
  never claimed otherwise. Not required for installability.
- `/legal/privacy` renders an honest "pending legal items" notice.
  **OWNER-CREDENTIAL-GATED** (see §5 — it is also a directory blocker).

---

## 2. ANDROID / GOOGLE PLAY

**CODE-READY (pre-existing)** — `versionCode`, package id, blocked legacy
storage permissions, `app-bundle` build type, no analytics/advertising SDK.

**CODE-READY (this session)** — `android.intentFilters` with `autoVerify: true`
over `https` only, claiming `labourmarket.ai` and `www.labourmarket.ai`; and
`/.well-known/assetlinks.json` as a route handler.

**OWNER-CREDENTIAL-GATED**
- Google Play developer account; upload signing key.
- `ANDROID_CERT_FINGERPRINTS` — comma-separated SHA-256 fingerprints. With
  Play App Signing there are normally **two** (upload + the Google-held
  app-signing certificate); listing one is the usual reason app links verify
  in internal testing and fail in production. Neither is a secret — a
  fingerprint is a public hash, not a key.
- App icon and splash: **owner approval to generate from
  `apps/web/public/app-icon.svg`, or supply ≥1024px art.** `apps/mobile` still
  has no `assets/`, so both stores would receive the Expo placeholder. This
  session deliberately did **not** generate them: the store icon is the exact
  decision §4.1 of the store-readiness pack reserves to the owner. The web
  manifest PNGs are a different thing — a rasterization of an icon already
  shipped on the web.
- Play Data Safety form; store metadata; support contact; screenshots.

**Not provable here** — Android runtime. No `/dev/kvm` in this container and no
SDK. Verify a GitHub Linux runner actually provides KVM before building a CI
job on the assumption.

**EXTERNAL-REVIEW-GATED** — Play review.

---

## 3. iOS / APP STORE

**CODE-READY (pre-existing)** — privacy manifest with four required-reason API
codes; a non-empty, truthful `NSPrivacyCollectedDataTypes` (Expo's template
emits an empty array, which asserts to Apple that the product collects
nothing); `buildNumber`; `NSPrivacyTracking: false` backed by a dependency pin.

**CODE-READY (this session)** — `ios.associatedDomains` claiming both hosts;
`/.well-known/apple-app-site-association` served extensionless as
`application/json`, as Apple requires.

**OWNER-CREDENTIAL-GATED** — Apple Developer Program, team id, distribution
certificate; `APPLE_TEAM_ID`; icon/splash art (as above); App Privacy
declaration; metadata, support URL, screenshots; a review test account.

**EXTERNAL-REVIEW-GATED** — App Review.

### Why both association documents answer 404 until configured

Apple and Google **fetch and cache** these files, *including the failure*. A
placeholder Team ID or a mistyped fingerprint does not fail loudly at publish
time — it poisons the association for as long as the cache holds, and keeps
failing after the correct value arrives. So an unset identifier serves 404
("this site claims no app"), which is both the truthful statement and the one
that costs nothing to correct.

`lib/guards/app-association.test.ts` executes the builders over the inputs that
actually cause this: `YOUR_TEAM_ID`, an 11-character id, a 63-nibble hash, a
lowercase fingerprint, two certificates, a bad one beside a good one. A
malformed value is **dropped, never repaired** — a silently "fixed" fingerprint
is a wrong fingerprint.

**The owner action is one environment variable per platform. No code change.**

---

## 4. ChatGPT APP / PLUGIN (via MCP)

**CODE-READY (pre-existing)** — the door at `/api/mcp`; OAuth 2.1 bearer per
request through the one identity resolver; RFC 9728 protected-resource
metadata; machine-readable refusals distinguishing "retry" from "reconnect";
28 tools, every one carrying a human title and honest annotations; privacy-safe
structured logging; a 64 KB body bound that names its own limit.

**CODE-READY (this session)** — see §6.

**OWNER-CREDENTIAL-GATED**
- **Domain verification** of `labourmarket.ai` in the plugin portal.
- **Supabase OAuth 2.1 authorization server must be enabled** in the dashboard.
  This is the load-bearing one: until it is, the discovery chain resolves and
  the authorization step 404s. The PRM document is accurate and the server it
  points at does not answer.
- Reviewer credentials; exact CSP domains.

**EXTERNAL-REVIEW-GATED** — submission review, plus five positive and three
negative test cases. The test cases are *content about capabilities we already
have* and can be drafted by an agent; they are listed here as owner-facing
because they accompany a submission only the owner can make.

---

## 5. CLAUDE CONNECTOR / DIRECTORY (via MCP)

Requirements verified against Anthropic's current submission guidance.

**CODE-READY**
- Remote MCP server on a public HTTPS endpoint — the directory accepts remote
  servers only. ✓
- **Every tool has a human-readable title and the applicable safety hint.**
  This is one of the two things that decide most submissions, and it is
  already structurally guaranteed: `title` and `annotations` are **required
  fields** on `CapabilityContract`, not optional ones, so a tool cannot be
  registered without them. 28/28. ✓
- OAuth discovery via RFC 9728. ✓

**OWNER-CREDENTIAL-GATED**
- **A Team or Enterprise organization.** Directory submission is not available
  on an individual plan. Worth knowing before anything else is prepared.
- **A complete public privacy policy — the other decider.** A missing or
  incomplete policy is an immediate rejection. `/legal/privacy` is public,
  structured and honest, and it renders a visible "pending legal items"
  notice. That notice is truthful and it is also exactly what a reviewer reads
  as incomplete. **Closing it is a legal-wording decision, not an engineering
  task** — no agent may write binding privacy terms.
- Documentation URL, icon, **test account credentials**.
- Carousel screenshots if submitting as an MCP App: 3–5 PNGs, ≥1000px wide,
  cropped to the app response, prompts supplied separately; no video or GIF.

**EXTERNAL-REVIEW-GATED** — policy scan; entry normally as a *community*
connector, with Anthropic optionally selecting listings for a verified review
that functionally tests every tool.

---

## 6. VENDOR-NEUTRAL MCP — what was implemented

All of it in `lib/mcp/protocol.ts` (pure) and `app/api/mcp/route.ts`
(transport). Nothing is ChatGPT- or Claude-specific; the capability layer does
not know MCP exists.

| Change | Why |
|---|---|
| `2026-07-28` added, newest-first, in `SUPPORTED_PROTOCOL_VERSIONS` | The current revision was not served |
| `server/discover` (SEP-2575) | Sessionless discovery — the 2026 replacement for the `initialize` handshake. Returns `resultType`, `supportedVersions`, `capabilities`, `instructions`, cache directives, and `serverInfo` under `io.modelcontextprotocol/serverInfo` |
| Per-request version from `_meta` **and** the `MCP-Protocol-Version` header | `_meta` wins on disagreement: the header is only its transport encoding |
| An unserved version is **refused**, not downgraded | A server that answers a future revision in an old dialect looks healthy and returns subtly wrong shapes. One clear failure beats a silent downgrade |
| `ttlMs` / `cacheScope` on `tools/list` and `server/discover` | `public` is a claim that the list carries no caller-specific data — true only while the tool list stays derived from the static registry. 5 minutes, because a deploy changes the list |
| `MCP-Protocol-Version` echoed on every response | Including 401s |
| `Mcp-Session-Id` never read, minted or echoed | Removed by the revision. This door was never stateful, so the rule is *never start* — pinned by a guard because a session id is the natural thing to add when someone later wants per-client state |
| CORS + `OPTIONS` preflight | A browser-resident MCP client could not POST here at all; the request never left the browser, so the door looked dead rather than protected |
| Legacy revisions retained | The spec's own 12-month deprecation window runs to ~2027-07. `initialize` still answers |

### The CORS decision, stated explicitly

`Access-Control-Allow-Origin: *` **without** `Access-Control-Allow-Credentials`.
That pairing is the whole security argument. With a wildcard origin and no
credentials flag, a browser refuses to attach cookies, so the cookie-session
branch of `resolveApiIdentity` is **unreachable cross-origin** and no CSRF is
introduced. A cross-origin caller can only present a bearer token — which is
exactly what an MCP client has. Adding `Allow-Credentials: true` here would
turn this door into a CSRF hole against every signed-in browser session.
`WWW-Authenticate` is exposed because it carries the RFC 9728 pointer a client
needs to begin OAuth.

### Deliberately NOT implemented

`.well-known/mcp.json` server cards. SEP-1649 / SEP-2127 / SEP-1960 are still
**draft**. Shipping a draft discovery document as though it were required is
the kind of claim this repository does not make. Revisit when one is ratified.

---

## ONE CANONICAL CAPABILITY LAYER — verified, not assumed

No surface carries its own business logic:

- `lib/capabilities/registry.ts` imports `createJournalEntryCore`,
  `listJournalEntries`, `switchActiveWorkspaceCore`, `readProfileRow` — the
  **same cores** the web server actions call.
- Mobile writes go `/(shell)/log-work` → `JournalComposer` → `/api/mcp` →
  `journal.create_draft` / `journal.confirm` → `createJournalEntryCore`.
- `createJournalEntryCore` has exactly three non-test callers:
  `lib/journal/actions.ts` (web), `lib/capabilities/registry.ts` (MCP +
  mobile), and its own module.

The MCP layer is an **adapter**, not a second product. Every tool call runs on
the caller's own RLS-scoped client; there is no service-role proxy and no
anonymous mode.

---

## OWNER ACTIONS — the complete list

Two are environment variables and unblock deep links on both platforms with no
code change:

```
APPLE_TEAM_ID=<10 chars, Apple Developer portal>
ANDROID_CERT_FINGERPRINTS=<SHA-256, comma-separated; normally TWO with Play App Signing>
```

Neither is a secret. Both are validated, and a malformed value serves 404
rather than a poisoned document.

Then, in rough dependency order:

1. **Enable the Supabase OAuth 2.1 authorization server** (dashboard). Blocks
   both MCP surfaces end-to-end; everything else about them is ready.
2. **Complete the privacy policy wording.** Blocks the Claude directory
   outright and is required by both stores. Legal, not engineering.
3. **Approve icon generation from `apps/web/public/app-icon.svg`, or supply
   ≥1024px art.** Blocks both store listings.
4. Apple Developer Program; Google Play account + upload key.
5. `SUPABASE_DB_URL` read-only Actions secret (GOV-1) — two security gates
   stay inert without it.
6. Team/Enterprise plan, if the Claude directory listing is wanted.
7. Test accounts, screenshots, store and directory metadata, support contact,
   Data Safety / App Privacy declarations.
8. Domain verification in the ChatGPT plugin portal.

---

## VERIFIED THIS SESSION

**Static**
- `pnpm -F web typecheck` → exit 0
- `pnpm -F web lint` → exit 0 (40 pre-existing warnings, 0 errors)
- `pnpm -F web build` → exit 0; all three `.well-known` paths present in
  `routes-manifest.json`
- New guards: `mcp-protocol-2026` (14), `pwa-installability` (7),
  `app-association` (14), `mobile-release-config` (+3, now 12) — all executing
  real code or real bytes, none asserting over source text

**RUNTIME — against a real `next start` server, not a mock.** This is
`PRODUCTION_RPC_PROVEN`-grade evidence for the surfaces below, and it is the
level this repository's audits have usually lacked.

| Checked | Result |
|---|---|
| `/.well-known/apple-app-site-association`, unset | **404** |
| …with `APPLE_TEAM_ID=ABCDE12345` | **200 `application/json`**, `{"applinks":{"details":[{"appIDs":["ABCDE12345.ai.labourmarket.app"],…}]}}` |
| `/.well-known/assetlinks.json`, unset | **404** |
| …with two fingerprints, one lowercase | **200**, both present, both normalized to uppercase colon form |
| `/manifest.webmanifest` | Six icons; PNG 192/512 `any` + 192/512 `maskable` ahead of the SVG |
| `/icon-192.png`, `/icon-512.png` | **200 `image/png`**, 3 241 B / 15 719 B |
| `OPTIONS /api/mcp` | **204** with allow-origin `*`, allow-methods `POST, OPTIONS`, allow-headers incl. `MCP-Protocol-Version` |
| `POST /api/mcp` unauthenticated, `MCP-Protocol-Version: 2026-07-28` | **401**, `mcp-protocol-version: 2026-07-28` echoed, `www-authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource"`, `access-control-expose-headers` carrying `WWW-Authenticate`, body `{"error":"CREDENTIALS_MISSING","client_action":"authenticate"}` |
| `/.well-known/oauth-protected-resource` | **200**, `authorization_servers: ["https://<project>.supabase.co/auth/v1"]` |

The complete RFC 9728 discovery chain therefore resolves end to end: a client
POSTs, is refused, is pointed at the metadata document, and finds the
authorization server. The one thing it cannot yet do is complete the flow —
that is owner action 1 below.

**Not verified:** nothing was driven in a browser, on a phone, or against a
real MCP client (no ChatGPT or Claude connector was pointed at this server).
No store, directory or portal was contacted. Production HTTP remains
unreachable from this container, so every runtime result above is from a local
production build, not from labourmarket.ai.

---

## DO-NOT-REGRESS

- The manifest's PNGs are the **installability requirement**, not a fallback.
  Removing them makes the PWA silently un-installable again.
- Maskable icons must stay a separate rendering. Relabelling the "any" PNG
  clips the mark on Android home screens.
- The MCP door must never add `Access-Control-Allow-Credentials`.
- An unserved protocol version must be refused, never downgraded.
- `cacheScope: "public"` on `tools/list` is true only while the tool list is
  caller-independent. If a tool list ever varies by caller it **must** become
  `private` — a shared cache would otherwise hand one user's tool list to
  another.
- The association documents must 404 rather than serve a placeholder.
- `title` and `annotations` stay **required** on `CapabilityContract`. Making
  either optional silently reintroduces the top Claude-directory rejection
  reason.
