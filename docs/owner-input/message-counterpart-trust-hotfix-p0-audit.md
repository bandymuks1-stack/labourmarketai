# Message counterpart trust hotfix — P0 audit

**Branch:** `fix/message-counterpart-trust-hotfix-p0`
**Scope:** UI / copy only. Fixes the production mistake from PR #504 where a direct conversation's counterpart rendered as a bland, normal-looking "Recipient not specified" / "Pašnekovas nepatikslintas". **No DB / schema / migration / RLS / Supabase / env / DNS / billing / payment / auth-core change.** One focused PR, opened as **draft**, held for owner — not merged, not deployed.

Status legend: **GREEN** = fixed + guarded + verified · **YELLOW** = safe subset shipped, remainder documented · **RED** = needs owner-gated deeper work (schema/RLS/identity/permission), intentionally NOT done here.

---

## 1. Where the bad copy came from

PR #504 (`message-context-contact-permissions-p0`) introduced an honest-context model for conversation cards. For `kind` = `direct` / `team` it set the counterpart to `counterparty.unknown` →

- EN: "Recipient not specified"
- LT: "Pašnekovas nepatikslintas"
- RU: "Собеседник не указан"

rendered as plain muted-italic text. The owner corrected: this reads as a **normal but empty participant state**, which is not acceptable. When the co-participant identity is not readable, the UI must show a **restricted / details-not-shown-yet** state that looks system-limited — never a bland "unspecified recipient", and never an invented name.

## 2. Which files render it

- `apps/web/lib/communication/conversation-display.ts` — the pure model (`describeConversationCard`) that picks the counterpart i18n key + flags.
- `apps/web/app/[locale]/dashboard/communication/page.tsx` — thread list cards.
- `apps/web/app/[locale]/dashboard/communication/[conversationId]/page.tsx` — thread detail header.
- `apps/web/messages/{lt,en,ru}.json` — the visible strings (`communication.counterparty.*`).

Note: only **lt / en / ru** are served (`routing.locales = activeLocales = ["lt","en","ru"]`). The other 8 locale JSON files exist for file-presence only, do not carry the `communication.counterparty` block, and are not routable — so they render no counterpart copy and were intentionally not touched.

## 3. Whether any real counterpart identity can be read today

**Partially — but not wired, by design.** The schema (`0021_communication.sql`) has `conversation_participants` with an RLS `select` policy that lets **any participant read the participant rows of their own conversations** (`is_conversation_participant(conversation_id)`), and `profiles` carry display data. So a future feature *could* read the co-participant's `profile_id` → name for conversations the viewer is already in (that would be case **A — known counterpart**).

This hotfix deliberately does **not** wire that read. Surfacing real counterpart identity is the larger, owner-gated "message counterpart identity" bridge (it also interacts with the contact-permission model — see §4/§5). Doing it hastily is exactly how a wrong/fake identity would leak. So identity-surfacing stays **RED / owner-gated**, and the current state is rendered honestly as restricted.

## 4. What is blocked by RLS / schema (RED)

The owner's correct product logic has three pieces this hotfix cannot fully satisfy without owner-gated schema/RLS work:

1. **Contact-permission precondition** ("no permission ⇒ no normal conversation"): there is no contact-permission gate on conversation creation today. Enforcing it is schema/RLS + product work — **RED**.
2. **Case A (known counterpart):** requires the participant→profile identity read described in §3 — **RED** (owner-gated identity bridge).
3. **Separating B (allowed, details not readable yet) from C (incomplete / blocked / system-limited):** there is no readable signal today that distinguishes "allowed but unreadable" from "blocked/incomplete", because (1) the permission model does not exist. So **B and C cannot be separated without schema/RLS** — **RED**.

Per the owner's instruction, because B/C cannot be separated without schema/RLS, this hotfix uses a single honest **restricted / details-not-shown-yet** copy for the direct/team counterpart, styled as system-limited — never "not specified".

## 5. The fix that shipped (GREEN)

- **Model:** `describeConversationCard` now marks direct/team counterpart with `counterpartyRestricted: true` and key `counterparty.restricted` (was `counterparty.unknown`). Support stays `counterpartyKnown: true` / not restricted. The model still carries only i18n keys — never a raw id or name.
- **Copy (renamed `counterparty.unknown` → `counterparty.restricted`):**
  | Locale | Before | After |
  |---|---|---|
  | EN | Recipient not specified | **Recipient details are not shown yet** |
  | LT | Pašnekovas nepatikslintas | **Pašnekovo duomenys dar nerodomi** |
  | RU | Собеседник не указан | **Данные собеседника пока не показаны** |
- **Styling:** the restricted counterpart now renders as a **locked, system-limited chip** (lock icon + bordered muted pill, `data-restricted="true"`) in both the list and detail views — visibly NOT a normal participant name and NOT a bland unspecified field. Known counterpart (support) renders as plain secondary text.

## 6. What this hotfix does NOT do (no fakery)

No fake names, participants, permissions, contact buttons, message threads, or read/delivered states are added. No co-participant identity read, no contact CTA, no permission gate is wired. The only changes are the restricted copy + restricted visual treatment + the model flag.

## Guards / tests

- `lib/guards/message-counterpart-restricted.test.ts` (new) — model marks direct/team restricted; banned "not specified" copy absent from every served locale; `counterparty.restricted` present + no stale `counterparty.unknown`; both pages render the restricted branch with `data-restricted="true"` + a lock icon off the model flag; no identity-name/contact-button wired.
- `lib/guards/message-context-contact-honesty.test.ts` (updated) — direct counterpart asserted RESTRICTED, not "unknown".
- `lib/guards/communication-card-clarity.test.ts` (updated) — model + i18n parity updated to the `restricted` key.

## Risky-path scan

No change touches DB / schema / migrations / RLS / Supabase / env / DNS / billing / payment / auth-core. UI + i18n + guards only.

## Verification

`pnpm -F web typecheck` · `lint` · `build` · full `vitest` — see final report. PR opened as **draft**, held for owner; **not merged, not deployed.**
