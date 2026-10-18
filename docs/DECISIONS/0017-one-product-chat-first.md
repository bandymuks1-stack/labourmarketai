# 0017 — One product, one authenticated home, the conversation as the control plane

Date: 2026-09-22 · Status: **OWNER DECISION, recorded 1:1** · Supersedes frozen design contract §2.1 and §2.3 (`docs/design/final/00-FROZEN-DESIGN-CONTRACT.md`) and the root split in `docs/design/final/01-WORKER-MOBILE-IA-2026-09-13.md` §2 · Complements decisions 0015 (A-14) and 0016 (delivery over legacy constraints).

## Owner text (verbatim, the binding parts)

> ONE LabourMarket.ai · ONE authenticated application shell · ONE canonical home · ONE active context at a time · CHAT/CONVERSATION as the primary control plane · VISUAL UI as contextual workspace/results · ALL existing real capabilities reachable through that model · consistent behaviour across Worker / Employer / Agency / Institution / other supported contexts · consistent LT / EN / RU / PL behaviour and any other actually served locale.
>
> Chat/conversation is the PRIMARY PRODUCT CONTROL PLANE. It is NOT: a third bottom-navigation tab; a "Paklausk" module; a support widget; a separate page generation; a role-specific feature; something users must discover.
>
> Current production pattern: Šiandien | Pasaulis | Paklausk must NOT imply three equivalent product roots. Determine the useful role of Šiandien and Pasaulis beneath the canonical conversational shell. Do not simply rename "Paklausk" to "Chat". Remove the conceptual separation.
>
> There must be ONE home contract. Entering the authenticated application should bring the user to the conversational workspace with the most relevant current persisted context. […] these are contextual surfaces around the conversation, not alternate homes. PERSONAL / WORKER / EMPLOYER / AGENCY / INSTITUTION are contexts/capabilities inside ONE product. Switching context must not feel like entering another application.
>
> LOGO CONTRACT: Clicking the LabourMarket.ai logo from ANY authenticated route must immediately return to the canonical authenticated home for the current identity/context. Never: marketing landing; alternate dashboard; stale role-specific home; nested profile; another dashboard generation.
>
> EXECUTION CONSTRAINT — SIMPLIFY, DO NOT REBUILD. […] reuse > compose > simplify > delete proven duplicate > add code. `/dashboard = canonical conversation root` is correct. `ŠIANDIEN = contextual worker opening state, not another home` is correct. Removing the separate `ask` door is correct only if the composer/conversation remains immediately available from the canonical root. Keep `Pasaulis`, work, opportunities, profile etc. as contextual visual surfaces invoked from the same shell, not new roots.

## What this decides (1:1 mapping to code)

| Owner rule | Realisation | Where |
|---|---|---|
| ONE canonical home | `/dashboard` renders the conversation for EVERY identity and context. | `app/[locale]/dashboard/page.tsx` |
| ŠIANDIEN = opening state, not a home | The worker-in-personal-space composition (header · one next action · today's work · open items · one growth line · one opportunity line · stations) renders INSIDE the conversation's opening slot, above the greeting, with the composer directly under it. First real turn replaces it. | `components/app/today/today-screen.tsx` via `ConversationChat.openingContext` |
| PASAULIS = contextual surface | `/dashboard/opportunities` stays the opportunities workspace: first station in ŠIANDIEN, the `find-work` intent, a search command, a deep link. Not a root. | `lib/today/today-route.ts` `TODAY_STATIONS` |
| PAKLAUSK = retired as a concept | No `?ask=1` door, no third tab. The composer is on the home screen. | `lib/today/today-route.ts`, `components/app/dashboard-chrome.tsx` |
| One shell | Chrome modes: `conversation` (home) · `panel` (every contextual workspace: the ONE top bar) · `full` (admin console only). The worker's 3-tab bar and the `today` mode are deleted, not renamed. | `components/app/dashboard-chrome.tsx`, `components/app/bottom-nav.tsx` (reverted to the catalogue-only primitive) |
| Logo contract | The mark in the ONE top bar is a `Link` to `/dashboard` (test id `shell-logo-home`); the admin chrome's mark carries the same id and target. | `components/app/conversation/chat/conversation-header.tsx`, `app/[locale]/dashboard/layout.tsx`; guard `lib/guards/logo-home-contract.test.ts` |
| Language selector | No tier / "peržiūra" badge on a language. Tier tracking stays in `lib/i18n/config.ts` + `docs/LANGUAGE_MATRIX.md` (operations), never in the product. | `components/marketing/locale-switcher.tsx` |

## Amendments to the frozen design contract

- **§2.1** ("Conversation = called on demand, not a permanently dominant column") → the conversation IS the home and the control plane. Its visual weight is still not "a dominant column": on the home it opens as a centred composition (context · greeting · composer); on every workspace it is one top bar plus the workspace.
- **§2.3** ("ŠIANDIEN · PASAULIS · PAKLAUSK — a hypothesis, not irreversible architecture") → the hypothesis is closed by this decision. ŠIANDIEN and PASAULIS survive as an opening context and a contextual workspace; PAKLAUSK does not survive as a concept.

## What is deliberately NOT changed by this decision

- The conversation's deterministic intent router, the confirmation-token dispatch layer, the action registry and the result registry (`lib/conversation/*`) — reused, not rebuilt.
- The ONE top bar's contents (owner audit §4.4 + §13).
- Deep links (`?result=`, `?say=`, `?intent=`, …) — they always addressed the conversation and keep working unchanged.
- The admin console's full chrome.
- Design tokens / primitives (PR #1826).
