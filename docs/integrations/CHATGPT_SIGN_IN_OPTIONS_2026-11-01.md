# ChatGPT sign-in options — what officially exists (read 2026-11-01)

Status: reference note, not a decision. Owner directive 2026-11-01: "check
official ChatGPT sign-in options; never open the public integration before
security is confirmed". Only OpenAI's own published pages are used; nothing
unpublished is assumed. The pages carry no publication date, so every fact
below is dated by the day it was read (2026-11-01). Re-read before acting.

## Two different things that are easy to confuse

| | A. ChatGPT app / connector over MCP + OAuth | B. "Sign in with ChatGPT" |
|---|---|---|
| Direction | ChatGPT calls **our** MCP server on the person's behalf | a person signs in **to our product** with their ChatGPT account |
| Authorization server | **ours** — Supabase Auth's OAuth 2.1 server | **OpenAI's** |
| Identity provider | LabourMarket.ai (the person's LabourMarket.ai account) | OpenAI (the person's ChatGPT account) |
| Who registers whom | ChatGPT registers as a client **at our** AS (CIMD, DCR or predefined client) | OpenAI issues **us** a client ID |
| What the other side gets | an access token for `https://labourmarket.ai/api/mcp`, RLS-bound to that person | verified account info (identity); optionally the person's ChatGPT plan allowance for AI requests |
| Availability (as published) | any developer, via developer mode; public listing via review | "currently available to selected commercial partners through a limited trial"; plan usage for open-source partners and selected private clients |
| Status here | built and live in developer mode (proven 2026-08-30); listing NOT submitted | not used, not applied for |

A is what LabourMarket.ai is building. B is a separate OpenAI identity
product; it would add an OpenAI-hosted login next to ours and is **not**
needed for A. Adopting B would be a new owner decision (it adds a second
identity provider, which decision 0024 / the one-identity rule would have to
address first).

## A. ChatGPT apps over MCP — the facts that bind us

Source: OpenAI, "Authentication", Apps SDK —
<https://developers.openai.com/apps-sdk/build/auth> (read 2026-11-01).

- Our MCP server is the **resource server**; our identity provider is the
  **authorization server**; ChatGPT is the **OAuth client**. OpenAI recommends
  an established IdP over hand-built auth (we use Supabase Auth).
- OAuth 2.1 authorization code + **PKCE `S256`**; the AS metadata must list
  `S256` in `code_challenge_methods_supported` ("unsupported when their
  authorization server metadata omits this field").
- Client registration, in OpenAI's order of preference: **CIMD**
  (`client_id_metadata_document_supported: true`), then **DCR**
  (`registration_endpoint`; ChatGPT registers once per connection), then a
  **predefined client**.
- ChatGPT sends **`resource`** = our MCP URL on the authorization and token
  requests; the AS "should copy it into the access token, commonly as
  `aud`", and the server should **reject tokens without the expected
  audience or scopes**.
- Treat every token as untrusted: verify signature, issuer, `exp`/`nbf`,
  audience, scopes; on failure 401 + `WWW-Authenticate` → PRM.
- `scopes_supported` lets ChatGPT explain permissions; tools can declare
  per-tool `securitySchemes`.
- Redirect URIs: the stable `https://chatgpt.com/connector_platform_oauth_redirect`
  is used only when the AS meets the RFC 9207 issuer rules; otherwise
  `https://chatgpt.com/connector/oauth/{callback_id}`.
- `authorization_response_iss_parameter_supported: true` only if **every**
  authorization response (success and error) carries an `iss` equal to the
  metadata `issuer`.

### Our side

How LabourMarket.ai's authorization server and MCP door measure against
these requirements is a security assessment. It is kept in the private
record (AGENTS.md: no security detail in this public repository), not here.
The OAuth chain itself is proven in production (register 10.3).

## B. "Sign in with ChatGPT" — what is published

Sources (read 2026-11-01):
- OpenAI Cookbook, "Sign in with ChatGPT" —
  <https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt>
- "Sign in with ChatGPT quickstart" — <https://developers.openai.com/siwc/quickstart>

What the pages say:
- Two capabilities: **identity** (the app receives verified account
  information) and optional **ChatGPT plan usage** (eligible AI requests are
  served from the person's plan allowance; the person grants it and manages it
  in ChatGPT settings). Neither grants access to ChatGPT conversations.
- Identity-only clients request `openid profile email`.
- Availability: "currently available to selected commercial partners through
  a limited trial"; plan usage for open-source partners and selected private
  clients (plan usage for Plus and Pro users).
- SDKs: `@siwc/local`, `@siwc/react`; DevKit `openai/sign-in-with-chatgpt-devkit`.
- The quickstart also lists a "sign-in for your ChatGPT plugin" option.
  It describes a flow where our app returns a connector authorization code to
  ChatGPT. Read as published, that is still a commercial-partner trial, and
  it does not replace our own AS for the MCP connector. Do not build on it
  without the owner applying and OpenAI confirming terms.

## What this means for LabourMarket.ai now

1. The integration path is **A** (our AS, our consent, our RLS). No OpenAI
   product is needed to let a person connect ChatGPT.
2. Before any public listing (register 10.5, owner-gated, NOT submitted):
   the open security items closed (owner-gated), 10.4 scopes decided (X-2),
   and the minimisation and consent changes merged.
3. **B** is optional, partner-gated, and adds a second identity provider;
   it needs its own owner decision and an application to OpenAI. Nothing in
   this repo assumes it.
