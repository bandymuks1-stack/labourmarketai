# Running LabourMarket.ai's AI on your own hardware

The runtime's first-choice provider is a server you run yourself. It costs
nothing, it needs no API key, and the prompt never leaves your network. This
page is how to turn it on, and what happens when you don't.

## What "no key" actually means

Every other provider proves it is configured by holding a secret. A local
runtime cannot: it authenticates by being on a network you control. Before this
slice the config had no way to say that, so a keyless runtime was not
"unimplemented" — it was unrepresentable, and the workaround was to invent a
placeholder key. A fake secret looks like configuration and proves nothing, so
it is no longer accepted as one.

The local provider's proof of configuration is instead **two** values, both
validated:

| Variable | Required | What it is |
|---|---|---|
| `AI_LOCAL_ENABLED` | yes | `true` — the adapter is inert otherwise |
| `AI_LOCAL_BASE_URL` | yes | Base URL of an OpenAI-compatible server |
| `AI_LOCAL_MODEL` | yes | The model id that server actually hosts |
| `AI_LOCAL_API_KEY` | **no** | Only if you put a proxy in front that wants a bearer token |

Plus `AI_PROVIDER_MODE=live`. Note that `AI_PROVIDER` does **not** have to be
`local`: the chain reaches the local runtime because it is the cheapest capable
candidate, not because it was selected by name.

## Any OpenAI-compatible server

No product is hard-coded and none is privileged. The adapter speaks the
`/v1/chat/completions` shape; anything implementing it works. Ollama's
OpenAI-compatible API, LM Studio, vLLM and llama.cpp's server are the ones most
likely to be on an operator's machine, and the runtime cannot tell them apart —
which is the intent.

```bash
AI_PROVIDER_MODE=live
AI_LOCAL_ENABLED=true
AI_LOCAL_BASE_URL=http://localhost:11434/v1
AI_LOCAL_MODEL=llama3.1:8b
```

The `/v1` suffix is optional — both spellings are accepted, because operators
who copy the URL out of their runtime's UI usually already have it and
operators who type the origin do not.

## What the URL check refuses, and why

The base URL is **trusted configuration**: it comes from your env, and no
product path routes a user-supplied string into it. It is still validated,
because a typo should disable the provider rather than quietly become a
server-side fetch target.

- **Not `http`/`https`** → rejected. `file:`, `ftp:` and `ws:` are not wires
  this adapter speaks.
- **Credentials in the URL** (`https://user:pass@host`) → rejected. Every
  intermediary that logs a URL would log the secret. Use `AI_LOCAL_API_KEY`.
- **Plaintext `http:` to a non-loopback host** → rejected. This is a privacy
  rule, not pedantry: these prompts carry CVs, journal entries and absence
  notes, and a cleartext hop off-box puts them on the wire. `http://localhost`,
  `http://127.x.x.x`, `http://[::1]` and `*.localhost` are fine; a GPU box
  across the office must use `https`.

Each rejection disables the provider with a reason that names which value was
wrong — `missing_base_url`, `invalid_base_url`, `missing_local_model` — rather
than a single undifferentiated "AI is off".

## What happens when it isn't there

Nothing breaks. The chain ends in exactly one of four places:

1. **A provider answered** — normally the local one, since `free_local` outranks
   every cloud class.
2. **The task was deterministic** — capacity and skill gaps are computed by the
   pure workforce models. No LLM is involved and none is missing.
3. **Every candidate was tried and named** — the failure says which provider was
   skipped and why, per provider.
4. **No candidate was ever allowed to see the payload** — see below.

A local runtime that is switched off is case 3, not a crash: the connection is
refused, the failure classifies as `UNAVAILABLE`, and the chain moves to the
next candidate. Readiness here means "configured well enough to attempt", not
"probed and alive" — probing first would add a round trip to every run to
pre-empt a case the failure path already handles.

## Why local is first, and it is not only about money

`docs/ai/free-provider-matrix-2026-08-09.md` records the finding that decides
the ordering: **Google's Gemini free tier documents that content IS used to
improve their products; the paid tier documents that it is not.** Generalised —
when a cloud service is free, the consideration is sometimes the data itself.

For a platform that is the GDPR controller for the CVs and journal entries in
these prompts, that is not a cost saving on that content. It is a disclosure.
So the runtime enforces a second rule alongside cost:

- Tasks are classified `PUBLIC` / `LOW_RISK_PROJECT_DATA` / `PERSONAL` /
  `SENSITIVE_FREE_TEXT` from the fields their policy actually admits
  (`lib/ai/runtime/data-sensitivity.ts`).
- A **free cloud tier** may not receive `PERSONAL` or `SENSITIVE_FREE_TEXT`,
  whatever it costs.
- **Local** may receive anything — the prompt never leaves your network. That is
  what makes free-first safe rather than merely cheap.
- **Paid cloud** may receive it, because reaching it already required the owner
  to enable that provider under commercial terms.

Today no provider is classed `free_tier`, so this veto fires zero times in
production. Its tests therefore inject a synthetic free-tier provider: a rule
with no live subject is otherwise indistinguishable from a rule that does not
work.

**This is the engineering half only.** Whether any given free tier may lawfully
process EU data subjects' personal data under a DPA is an owner decision with a
lawyer in it. The code guarantees the payload does not physically reach an
ineligible provider, so the legal half is never load-bearing on its own.

## Testing without a GPU

CI proves the local path with a deterministic fake OpenAI-compatible server on
loopback (`lib/ai/runtime/chain-dispatch.test.ts`) that can be told to answer,
fail, rate-limit or return prose on demand. Nobody needs Ollama installed to
keep this green — if they did, the path would be untested exactly where it
matters.

## What is still off

- No provider is enabled by default. `AI_PROVIDER_MODE` is `disabled` unless set.
- Every cloud vendor stays classed `paid` until someone verifies its **current**
  terms and training policy and brings the source to the matrix.
- The core marketplace does not depend on any of this. With every provider
  disabled, login, profile, journal, calendar, demand, booking, engagement,
  absence, notifications and feedback are unaffected — AI enhancement degrades,
  the product does not.
