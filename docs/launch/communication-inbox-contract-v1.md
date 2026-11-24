# Communication inbox contract v1 (core-network area A)

## The inbox model

Every list item is a REAL conversation row with:

- real id (`conversations.id`), type (`kind`: direct / support / team —
  instructions surface separately via AttentionInstructions);
- sender + context (permission-gated counterpart identity, RPC-resolved
  source relation);
- real preview — the newest message's first line + who wrote it (one
  bounded query, newest 300 messages across the listed threads);
  attachment-only messages honestly read "Priedas";
- `updated_at` timestamp;
- REAL unread state — a counterpart message newer than the caller's
  `conversation_participants.last_read_at`;
- exact destination (the whole card is one link to the thread);
- permission state (restricted counterpart renders as the locked chip).

## Badge == visible unread

The nav badge, the bell and the list all read the SAME helper
(`getUnreadConversationIds` / `getUnreadConversationCount`) — pinned by
`status-next-action.test.ts` and `communication-inbox-contract.test.ts`.
There is no badge the user cannot map to a visible card. Known bound: the
unread scan reads the newest 500 counterpart messages (pilot scale,
documented in `lib/communication/unread.ts`).

## Ordering & the "Naujas" mark

Unread first, then latest activity (stable partition of the
`updated_at desc` query) — on mobile the first unread card is above the
fold. The "Naujas" pill sits on the title row of unread cards only.

## Read state & refresh

- Opening a thread stamps `last_read_at` (MarkReadOnMount → UPDATE +
  revalidatePath). This is an honest "opened" signal — the product shows
  NO fabricated delivered/read receipts anywhere.
- Returning reflects the new state without a manual reload:
  `RefreshOnFocus` re-runs the route's server components on tab
  focus/visibility and on a gentle 60 s interval (15 s throttle). No
  simulated realtime, no websockets — a real server re-read.

## Titles — no "(be temos)"

Fallback chain: `subject` → permitted counterpart name → live source
title → support-team label / neutral "Pokalbis". The `unnamedThread` key
was deleted from all five locales; the admin support fallback was
neutralised. Guard scans forbid "(be temos)"-style values from returning.

## Removed technical copy

- `communication.v1Notice` (refresh-mechanism explainer) — deleted; the
  surface refreshes itself instead of explaining itself.
- `featureNotes.communicationInbox` ("tikras pokalbių aplankas") and
  `featureNotes.feedbackLoop` — deleted from the inbox.
- "Originalas išsaugotas." dropped from the attention subtitle (no
  translation context there); the per-instruction original toggle keeps
  its label (real translation context).
- KEPT: the participants-only privacy footnote (permission information),
  the composer language hint (changes what the user expects), the honest
  cannot-open state.

## Secondary support

`SupportConversationLauncher` renders BELOW the conversation list — one
tap away, never the primary CTA. "Peržiūrėti nurodymą" appears only on the
real instructions block.

## PR #743 attachments — untouched

Private bucket, participant-only RLS, signed URLs, text/attachment-only/
mixed messages, upload retry, draft preservation — all still pinned by
`conversation-attachments.test.ts` (unchanged).

## Guards

`apps/web/lib/guards/communication-inbox-contract.test.ts` +
updated `feedback-loop` / `worker-notifications-framing` /
`launch-explanations-cta` pins.
