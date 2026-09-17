# OWNER GATE — multilingual work communication (ONE decision)

Date 2026-09-17 · class **RED (authority: data egress of private messages)** · nothing applied.

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
