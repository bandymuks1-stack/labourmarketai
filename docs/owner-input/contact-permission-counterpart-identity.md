# Contact permission + counterpart identity — audit (Sprint Train v2, Wagon 4)

Goal: **communication must be honest.**
- if contact is allowed → show who the user is talking to;
- if contact is not allowed → show a restricted state;
- no fake counterpart, no fake thread, no fake contact permission, no fake
  read/delivered state.

Layer-0 scope: audit + app-side UI/copy clarity using existing data only,
stricter safe fallbacks, empty/restricted states, tests/guards, deliverable
doc. **No** DB/schema/RLS/RPC/Supabase/env/DNS/billing/payment/auth-core, no
contact-permission schema, no counterpart-identity bridge, no consent /
request-to-contact flow implementation, no notifications, no fake messages.

---

## 1. Audit — every communication / message / contact surface

| # | Surface | File | Finding | Class |
|---|---------|------|---------|-------|
| A | Thread list | `app/[locale]/dashboard/communication/page.tsx` | Honest who/what/context via `describeConversationCard`; restricted counterparty = locked chip; honest empty state; "opened-only, no fake delivered/read" notice; unread = real `last_read_at` comparison. | **OBSERVE** |
| B | Thread detail | `…/communication/[conversationId]/page.tsx` | Same honest card model in the header; `MarkReadOnMount` stamps a real "opened" time (not a fake "delivered"); messages show real author/time only; restricted counterparty chip. | **OBSERVE** |
| C | Card display model | `lib/communication/conversation-display.ts` | Pure, deterministic. `support` → known; `direct`/`team` → **restricted** (details-not-shown), never a fake name; origin derived only from real `created_by` vs viewer; carries i18n keys only, never raw ids. | **OBSERVE** |
| D | Composer | `components/app/communication-composer.tsx` | Real send only; no fabricated receipt. (Guarded.) | **OBSERVE** |
| E | Permission evaluator | `lib/communication/communication-eligibility.ts` | `evaluateCommunicationRequest` is **default-closed**: owns-demand + shortlisted + contactable, else denies. | **OBSERVE** |
| F | Request-to-communicate (scouting) | `lib/communication/request-worker-conversation.ts` + `components/app/request-communication-button.tsx` | Fully gated server-side; worker identity resolved server-side only, never sent to the client; honest "opened — waiting for reply", NOT a fake acceptance. | **OBSERVE** |
| G | No-stranger-contact surfaces | CV / player card / map / journal / evidence | No contact CTA wired (guarded by `message-context-contact-honesty`). | **OBSERVE** |
| H | **Direct "message" entry points** | `components/app/message-button.tsx` → `lib/communication/open-conversation-action.ts` | Only mounted in **established-relationship** contexts (worker → their employer's company owner via `getEmployerOwnerProfileId`; company → its own linked workers; admin tool). **But on failure it redirected to `?error=messaging`, which no page reads → a silent bounce with no restricted/failed state.** | **GREEN — fixed** |
| I | Manager review inbox | `app/[locale]/dashboard/inbox/page.tsx` | This is the journal **evidence-review** inbox, not messaging; honest empty state, real reviewable set only. Out of contact scope. | **OBSERVE** |
| J | Counterpart **identity** for direct/team threads | data model | The co-participant's name is deliberately NOT read/joined (RLS-scoped + needs the owner-gated identity bridge). Shown as the honest restricted chip. Wiring a real name = RED (forbidden this wagon). | **RED — owner** |
| K | Real **contact-permission** model for 1:1 direct opens | data model | `MessageButton`/`openDirectConversationAction` rely on RLS + an established relationship; there is no first-class "may A contact B?" permission table. A real permission schema = RED. | **RED — owner** |
| L | Consent / request-to-contact flow, notifications | — | Not implemented; out of Layer-0 by directive. | **RED — owner** |

---

## 2. GREEN — app-side fix made in this PR

### H. A failed "message" open now shows an honest restricted state

**Before:** `openDirectConversationAction` redirected every failure (no target
profile, or the conversation could not be opened — no permission, target gone,
RLS-blocked) to `${fallback}?error=messaging`. The default fallback is
`/dashboard`, and **no page reads `?error=messaging`** — so the user was bounced
silently with zero feedback. A failed contact attempt looked like nothing
happened (or, worse, like it had worked). That violates "if contact is not
allowed, show a restricted state" and risks reading as a fake success.

**After:**
- `open-conversation-action.ts` routes both failure branches to the messages
  list with `?notice=cannot_open`. The success path is unchanged and still only
  reached from a real `result.data.id` (no fake thread on failure).
- `communication/page.tsx` reads `searchParams.notice` and, when
  `cannot_open`, renders a **locked, system-limited** restricted banner (lock
  icon + `data-restricted` styling, consistent with the restricted counterparty
  treatment) — *not* a normal alert and *not* a success toast.
- Copy (`communication.cannotOpen.title` / `.body`, lt/en/ru) states honestly
  that the user may lack permission *or* the person may be unavailable, and
  explicitly that **nothing was sent** — so a failed open is never mistaken for
  a delivered message.

This uses existing data only (the action's existing ok/!ok result), adds no
permission schema, no identity read, no notification, no fake message.

### Guard

`lib/guards/contact-open-failure-honest.test.ts` (new) locks: the action fails
to `?notice=cannot_open` (and never resurrects `?error=messaging`); only opens a
real conversation on success; the list renders the locked restricted state off
that flag; and the copy exists in all served locales and says nothing was sent.

---

## 3. RED — owner-gated, NOT started

These are the structural pieces a fuller "contact permission + counterpart
identity" model needs. All require schema / RLS / RPC and are explicitly
forbidden this wagon — left untouched, documented here only.

1. **Counterpart identity bridge** — a safe, RLS-scoped way to show *who* the
   other participant is on a direct/team thread (today honestly shown as
   "details not shown yet"). Needs a participant-identity read path + policy.
2. **First-class contact-permission model** — an explicit "may A contact B?"
   record (beyond RLS + established-relationship inference) so direct opens are
   permission-driven rather than relationship-inferred.
3. **Consent / request-to-contact flow + notifications** — a requester asks,
   the recipient consents, and is notified. None of this exists; not in Layer-0.

---

## 4. OBSERVE — already honest (no change needed)

- Restricted counterparty chip (never a fake name); honest origin
  (creator-vs-viewer only); honest "opened" timestamp instead of fake
  delivered/read; default-closed scouting permission gate; worker identity kept
  server-side in the scouting request; no contact CTA on CV/map/player-card.
  These are covered by `message-counterpart-restricted` and
  `message-context-contact-honesty` and stay green.

---

## 5. Forbidden actions — confirmed NOT taken

No DB/schema/RLS/RPC/Supabase/env/DNS/billing/payment/auth-core change · no
contact-permission schema · no counterpart-identity bridge · no consent/
request-to-contact flow · no notifications · no fake messages · no merge/deploy
without owner approval · **Wagon 5 not started.**
