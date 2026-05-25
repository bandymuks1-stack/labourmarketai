# Sales / outreach docs — index

Honest, owner-editable templates for inviting first testers + companies to the pilot. None of these auto-send; the owner edits + sends each one personally.

## Files

| File | Audience | Language | Purpose |
|---|---|---|---|
| [`pilot_offer_v1_LT.md`](./pilot_offer_v1_LT.md) | Tester + tester-company | Lithuanian | The one-page pilot offer. What works today, what does NOT, honest limits, how to start. |
| [`pilot_offer_v1_EN.md`](./pilot_offer_v1_EN.md) | Tester + tester-company | English | EN parallel of the above. |
| [`company_intro_message_LT.md`](./company_intro_message_LT.md) | Tester-company first contact | Lithuanian | Short opening message (chat / email) inviting the company into the pilot. |
| [`tester_invite_message_LT.md`](./tester_invite_message_LT.md) | Tester-worker first contact | Lithuanian | Short opening message inviting a worker to test. |

## Honesty rules these docs follow

1. **No fake "verified" badge.** If a doc says "verified" anywhere, it must mean a real human (admin or manager) confirmed it. The manager-confirmation layer is not shipped yet → no doc claims "verified" for anything.
2. **No fake AI / matching claim.** Matching is NOT live. The docs say so explicitly.
3. **No fake guarantee of a worker / job appearing today.** Both pilot-offer docs say this in plain language.
4. **Pricing is honest.** Pilot is free. Paid tier is gated on real organisational rekvizitai + stable foundation — also stated explicitly.
5. **Privacy is described in real terms.** "No hidden tracking. No screen recording. No keystroke capture. Telemetry without your text." This matches the actual telemetry allowlist + caps in `apps/web/lib/telemetry/actions.ts`.

## What is NOT here

- No mass-outreach script. The platform doctrine forbids unsolicited mass messages.
- No scraped contact lists. Owner uses their own warm network for the first cohort.
- No automated follow-up sequences. Each follow-up is owner-authored.
- No commission / referral cash hooks. Pilot stays clean of money flows.

## How to use

1. Owner picks the right file for the recipient.
2. Owner edits the bracketed `[Name, contact — owner fills…]` placeholder.
3. Owner trims / expands per recipient. The committed text is a starting point, not a finished email.
4. Owner sends from their own account. Nothing on the platform auto-sends outreach.

## Refs

- `docs/policies/risk_signal_catalog_v1.md` — doctrine on what we never do.
- `docs/owner/support_chat_smoke_v1.md` — internal channel testers + companies use after onboarding.
- `apps/web/lib/telemetry/actions.ts` — telemetry allowlist (privacy claim above is grounded here).
