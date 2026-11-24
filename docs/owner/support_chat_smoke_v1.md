# Support Chat — Smoke v1

Quick end-to-end smoke for the support-chat surface that shipped in PR #71.

## Live tables (production)

- `public.conversations` — RLS participant-scoped + admin SELECT.
- `public.conversation_participants` — composite PK `(conversation_id, profile_id)`, RLS allows the participant to update their own `last_read_at`.
- `public.conversation_messages` — append-only (no UPDATE/DELETE policy). NEVER `public.messages` (legacy chain stays untouched).

## Live UI

| Route | Who sees what |
|---|---|
| `/lt/dashboard/communication` | Tester sees: launcher button (`Susisiekti su pagalba`) + their thread list. Admin sees same + all support threads via admin RLS. |
| `/lt/dashboard/communication/[conversationId]` | Composer + messages + `MarkReadOnMount` + `AdminJoinConversation` button (visible only when viewer is admin AND not a participant). |
| `/lt/dashboard/admin/support` | Admin-only inbox listing `kind='support'` threads sorted by `updated_at`. `requireSuperadmin` + RLS admin SELECT. |

## Telemetry events recorded

From the support flow:
- `conversation_launcher_opened` — tester clicks the launcher pill.
- `conversation_started` — tester submits the launcher form (`result_kind=support`).
- `conversation_started_error` — launcher submit failed (with the error code).
- `communication_message_send_clicked` — composer Send pressed.
- `communication_message_sent` — server returned ok.
- `communication_message_send_error` — server returned an error code.

All metadata is the allowlisted keys only (see `lib/telemetry/actions.ts` allowlist). No body text, no participant identifiers beyond `session_id`, no full URLs.

## Smoke checklist

A real owner does these in order:

1. **Tester starts a thread.**
   - Sign in as a normal worker tester.
   - Open `/lt/dashboard/communication`. Empty list + the `Susisiekti su pagalba` pill is visible.
   - Click pill → modal opens.
   - Type subject (e.g. "Test from owner") + body (e.g. "Smoke ping"). Submit.
   - Page navigates to `/lt/dashboard/communication/<id>`. Message visible.
   - Refresh — message still visible, no spinner stuck.

2. **Admin sees the thread + joins.**
   - Sign out, sign in as admin (`active_role='admin'` OR `profile_roles` row tagged `admin`).
   - Open `/lt/dashboard/admin/support` — the new thread is at the top.
   - Click into it → "Adminas: prisijungti prie pokalbio" card visible.
   - Click `Prisijungti prie pokalbio` → page refreshes, card disappears.

3. **Admin replies.**
   - Type a message in the composer. Send.
   - Message appears for both viewers.

4. **Tester reads admin reply.**
   - Sign back in as the tester.
   - Open the thread — admin reply visible.

5. **Telemetry sanity.**
   - Open `/lt/dashboard/admin/pilot-telemetry` → recent events include `conversation_launcher_opened`, `conversation_started`, `communication_message_sent`. No raw body text in any metadata cell.

## What's deliberately NOT in this smoke

- File upload (not in v1).
- Realtime / push notification (not in v1; honest LT/EN notice says so).
- Group chat composition mutations beyond admin-join (v1 keeps composition simple).
- Delete / edit message (append-only by design).
- Cross-org / external email / SMS / Telegram bridges.
- Legacy `messages` / `threads` / `matches` chain — untouched on purpose.

## If anything fails

- Banner LT/EN message is precise (per `CommunicationResult.code` → user-facing string mapping in `lib/communication/actions.ts`).
- RLS denial → "Negalima rašyti šiame pokalbyje — neturite prieigos."
- Owner can correlate via the telemetry `result_kind` metadata + the conversation id in the URL.

## Refs

- `apps/web/lib/communication/actions.ts` — server actions + tagged-result mapping.
- `apps/web/components/app/support-conversation-launcher.tsx` — tester-side launcher.
- `apps/web/components/app/admin-join-conversation.tsx` — admin-only join button.
- `apps/web/app/[locale]/dashboard/admin/support/page.tsx` — admin inbox.
- `supabase/migrations/0021_communication.sql` — schema + RLS + grants.
- `docs/policies/journal-evidence-and-correction-policy-v1.md` — adjacent doctrine on append-only data.
