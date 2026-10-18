# OWNER GATE — multilingual work communication (ONE decision)

Date 2026-09-17 · class **RED (authority: data egress of private messages)**.

> **Status split (updated 2026-09-17).** RED-1 (the `original_language` CHECK
> widening for `uk`+`ka`) is **APPROVED + APPLIED** — see
> `docs/launch/OWNER_GATE_MESSAGE_LANGUAGE_SET_2026-09-17.md` and
> `docs/APPLIED_LEDGER.md` (ledger `20260917112002`). **RED-2 — the data-egress
> grant for `translate_message` — is APPROVED (owner decision 2026-09-17,
> OPTION 1: GEMINI ONLY) and applied in code** as the second row of
> `AI_EGRESS_GRANTS` (`lib/ai/runtime/data-egress.ts`), task-scoped to
> `translate_message`, ceiling `SENSITIVE_FREE_TEXT`. DeepL / Anthropic /
> OpenAI / xAI remain refused for this task; DeepL authorization is explicitly
> **DEFERRED**, not implied. No schema, RLS, authority or data change. Revocable
> by deleting the row and redeploying — no data to unwind. The read-side
> behaviour before a deploy carrying the row, and after any revocation, is
> unchanged: original + language badge. Bounded review facts that stay
> explicit: `ai_runs.output_excerpt` may hold up to 4000 chars of the validated
> translated output JSON (admin-only RLS, append-only, 90-day retention);
> canonical `conversation_messages.body` is never modified; the input body is
> never persisted by this feature. The proposal below is kept as the record of
> what was approved.

## What is already built and live-safe (GREEN, this PR)

The contract "author writes in own language → original preserved → every
authorized recipient reads in their own language → replies the same way" is
**wired end to end** on the canonical thread (`/dashboard/communication/[id]`)
and on worker instructions (`/dashboard/instructions`):

| Edge | Where | State |
|---|---|---|
| author language stamped on send | `lib/communication/actions.ts` → `conversation_messages.original_language` (applied migration `20260610190000`; column live in production) | LIVE |
| authority: only participants read | RLS `conversation_messages_select = is_conversation_participant(conversation_id) OR is_admin()` (production, verified 2026-09-17) | LIVE |
| per-viewer rendering | `lib/communication/translation-read.ts` → `runAiAgent("translation_copy")` → task `translate_message` → `lib/ai/runtime` (routing, sensitivity, **egress gate**, `ai_runs` audit) | LIVE — returns the original until the gate opens |
| honesty | `translated` only when a provider produced text ≠ original; original always one tap away; no translation stored (doctrine §2); bounded per read (40) and per viewer (120/h); in-process cache | LIVE, guard-pinned (`conversations-language.test.ts`, `translation-read.test.ts`) |

Proven locally (LT manager ↔ RU worker thread, fixture users): the manager sees
the worker's Russian as the original with the badge `Originalas (RU)`, the
worker's own Lithuanian carries no badge, and `ai_runs` records
`translate_message · conversation_message · language ru · disabled` — the
runtime was asked and honestly refused. In production the same read is
refused by the **egress gate** (`SENSITIVE_FREE_TEXT`, no grant), audited as
blocked.

## The ONE decision

A message is `SENSITIVE_FREE_TEXT`. `lib/ai/runtime/data-egress.ts` holds one
grant (Gemini, `propose_conversation_intent` only). To let a work message
leave for translation the owner must record a grant row. Two options, pick one
or both:

**Option A — DeepL (recommended for LT/RU/PL/NL/DE/EN; no Georgian):**
```ts
{
  provider: "deepl",
  maxSensitivity: "SENSITIVE_FREE_TEXT",
  tasks: ["translate_message"],
  basis: "Owner approval <date> (MULTILINGUAL WORK COMMUNICATION): translate work messages and instructions between authorized conversation participants only; on read, never stored; revocable by deleting this row",
  grantedOn: "<date>",
}
```
plus Vercel env `AI_DEEPL_ENABLED=true` and `DEEPL_API_KEY=<key>` (owner action —
agents never add secrets). DeepL free keys (`:fx`) are refused for personal data
by `MAX_GRANTABLE_FOR_FREE_TIER`; a paid key is required.

**Option B — Gemini (already live, paid tier; covers Georgian/Ukrainian):**
the same row with `provider: "gemini"`.

Without a grant nothing changes for users: they keep seeing originals with a
language badge, exactly as today.

## Known limits (not blockers of the decision)

- UI locales are 5 (lt · en · nl · de · ru). A Georgian worker reads the UI in
  one of those; the message rendering follows the UI locale. Adding a routed
  UI locale is the separate language-coverage gate (`docs/LANGUAGE_MATRIX.md`).
- Conversations are direct threads with a typed source (scouting · accepted
  service request · demand interest · accepted booking) and instructions are
  project-scoped; there is no project-wide group thread. Every participant of
  a thread is rendered in their own locale, so the contract holds per thread.

---

## RED-2 — bounded data-egress proposal for `translate_message` (final, field-by-field)

Returned separately from RED-1 by owner instruction (2026-09-17). This is the
decision that turns "original + language badge" into "rašau savo kalba →
kiekvienas skaito savo kalba". Repo-verified facts only; no secret values.

- **Capability / purpose.** Task `translate_message` (agent `translation_copy`).
  On READ, render an authorized participant's view of a work message /
  instruction in that viewer's locale. It is a rendering, never stored
  (doctrine §2); the original is always kept and one tap away.

- **Sensitivity classes allowed.** Exactly one: `SENSITIVE_FREE_TEXT` (a
  work-message body). The grant's `maxSensitivity` ceiling is
  `SENSITIVE_FREE_TEXT`. No higher class exists for this task; documents,
  attachments, identifiers, contacts, credentials and secrets are NOT part of
  this task and never transmitted.

- **Data transmitted (and only this).** The message body text, truncated to
  8000 chars (`translation-read.ts` `m.body.slice(0, 8000)`); the target locale
  (viewer locale); the fixed string `context: "work message between colleagues"`;
  and the source language code when known. NOT sent: message id, conversation
  id, author id, names, any other row, any attachment. The `ai_runs` audit row
  carries only the LABEL `inputSource: "conversation_message"` — never the text,
  never the people.

- **Provider routing constraints.** Least-privilege by task: the grant row
  carries `tasks: ["translate_message"]`, so no other task sees it (a CV/journal
  run stays refused). `local` providers need no grant (no egress). Free cloud
  tiers are refused for personal data regardless of any grant
  (`MAX_GRANTABLE_FOR_FREE_TIER`; DeepL `:fx` keys are free → refused). Only the
  named provider(s) in the grant may receive the text.

- **Provider status actually present in repo/runtime.**
  - **DeepL** — adapter `lib/ai/runtime/providers/deepl.ts`; serves
    `translate_message` only; gated by `AI_DEEPL_ENABLED === "true"` AND
    `DEEPL_API_KEY` (paid key; `:fx` refused). Language-agnostic target map;
    covers en/lt/lv/et/nl/de/da/sv/pl/ru/uk — **no Georgian (ka)**.
  - **Gemini** — adapter `providers/gemini.ts`; gated by
    `AI_GEMINI_ENABLED === "true"` AND `GEMINI_API_KEY`. Already the one live
    egress provider (paid tier, task `propose_conversation_intent`). LLM tier →
    covers **any** language incl. `ka` and `uk`.
  - **Anthropic** — adapter `providers/anthropic.ts`; gated by
    `AI_PROVIDER_MODE=live` + `AI_API_KEY`. LLM tier; covers any language.
  - **OpenAI** — adapter `providers/openai.ts`; gated by
    `AI_OPENAI_ENABLED === "true"` + `OPENAI_API_KEY`. LLM tier; covers any
    language.
  All four are wired for `translate_message` in the provider chain; DeepL is
  tried first, then the LLM tier, so a language DeepL lacks (Georgian) falls
  through to an LLM provider.

- **Audit via `ai_runs`.** Every attempt writes an `ai_runs` row: task,
  provider, model, and `blocked_reason` when refused. A gate refusal is audited
  as blocked (not silently dropped). No message text is stored in the audit.

- **Revocation mechanism.** Delete the grant row from
  `lib/ai/runtime/data-egress.ts` (or set the provider's `AI_*_ENABLED=false` /
  remove its key). Either instantly returns the product to original + badge; no
  data migration, no schema change. Revocation is a one-line edit + deploy.

- **Fallback behavior (unchanged, guaranteed).** No grant / disabled / missing
  key / provider error / echo of the original → the viewer sees the ORIGINAL
  text + the source-language badge. Never empty, never fabricated, never a lost
  message. Proven in `lib/communication/translation-read.test.ts` and the
  parameterized `translation-matrix.test.ts`.

- **Production credentials / config actually available or missing.** The
  runtime reads `AI_DEEPL_ENABLED`/`DEEPL_API_KEY`, `AI_GEMINI_ENABLED`/
  `GEMINI_API_KEY`, `AI_OPENAI_ENABLED`/`OPENAI_API_KEY`,
  `AI_PROVIDER_MODE`/`AI_API_KEY`. Whether each is set in the Vercel production
  environment is an owner/ops fact an agent does not read and must never paste.
  What IS a code fact and IS the blocker: `AI_EGRESS_GRANTS` holds exactly one
  row today (Gemini, `propose_conversation_intent`) and **no `translate_message`
  grant**, so translation is refused in production regardless of any key. The
  Gemini runtime is already live/paid (so Option B needs only the grant row);
  DeepL additionally needs its paid key + enable flag (owner/ops action —
  agents never add secrets).

### The decision (pick one or both; agent will not apply)

Add ONE grant row to `lib/ai/runtime/data-egress.ts` as drafted above (Option A
DeepL and/or Option B Gemini), with a dated `basis`. That single edit + deploy
turns translation on; deleting it turns it off. No schema, no RLS, no authority
change is involved in RED-2. **APPROVED 2026-09-17 — Option B (Gemini) only;
Option A (DeepL) DEFERRED. Applied in code; guards pin the table at exactly two
Gemini rows (`lib/guards/ai-data-egress.test.ts` "RED-2" section).**
