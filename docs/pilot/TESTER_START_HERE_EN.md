# Welcome, testers

This is a **pilot** version of labourmarket.ai. Not a marketing demo, not the finished product. You're here to help us see what's confusing, what breaks, and what to rewrite.

## How to sign in

1. Go to https://app.labourmarket.ai
2. Click **Continue with Google**.
3. If you're not bounced back within ~10 seconds, try again in an incognito window. Report it (see below).

## What to test

In priority order:

1. **Sign-in** — does it work, is anything unclear, does it land you in the right place?
2. **Profile / CV** — `/lt/dashboard/profile` (or `/en/…`). Describe yourself freely. Check whether the suggested skills make sense. Confirm / drop / add.
3. **Work Journal** — `/lt/dashboard/journal`. Log something you did yesterday/today in plain words. Check whether the suggested structure (time, work direction) is right. Pick what's true. Save.
4. **Copy reports** — wherever something feels confusing / wrong / mistranslated, **highlight the text on the page** and click the floating **Report copy** button (bottom-right).
5. **Company / agency / buyer drafts** (only if you see those roles in your account) — try to fill the first draft and watch what doesn't add up.
6. **Sign-out then sign back in** — verify everything still there.

## What you don't need to worry about

- **A save fails.** We see it. Send a one-liner — what you did, what you got back.
- **Confusing wording.** Common. That's exactly what the report-copy form is for.
- **Profile data.** It's **private** for now — until we ship the manager / client confirmation layer (PR #18, in draft), nobody outside you can see your entries.
- **Don't be afraid to make mistakes.** You can edit / delete entries while no external party has confirmed them.

## How to report

| What | Where |
|---|---|
| Confusing / broken copy in place | Highlight the word/sentence → **Report copy** button bottom-right |
| Bug (something doesn't work) | Same button — write "BUG:" at the start, describe what you did briefly |
| Sensitive question (PII, "am I sure this is safe?") | Reach out to the pilot owner directly (you already have their contact if you were invited) |

## What's NOT here yet

- Real matching between worker and job posting.
- "Confirmed by manager" markers (manager confirmation backbone still being prepared).
- Real-time notifications.
- Mobile app.
- Payments / invoices / payroll layer.

That's intentional. The pilot tests the foundation first — a reliable trust loop from free text to confirmed evidence. Everything else is layered on after.

## Privacy

- Text content (CV, journal, comments) is stored **only on your account** and visible only to you + the admin.
- Telemetry (how long a task took, what you clicked) **contains no text from you**. Only counts + route + per-tab session ID (pseudonymous).
- We never collect keystrokes, screenshots, or do hidden tracking.

## Thanks

You're making the product real. Don't soft-pedal — even "this whole page is bad, rewrite it" is what we most need to hear.
