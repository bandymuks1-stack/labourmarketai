# External worker referral — receiving contract v1

> **Status (2026-09-17, live):**
> - Database: `20260917120000` (ledger `20260917080303`) and the forward
>   correction `20260917130000` (ledger `20260917091045`) are **APPLIED** to
>   production; every RPC production-proven with zero residue — see
>   `docs/APPLIED_LEDGER.md`.
> - Code: PR #1752 **MERGED** (squash `4ff163da`, 2026-09-17 09:42 UTC) and
>   **deployed**; `POST /api/referrals/external/v1` is live and answers
>   `401 unknown_source | unauthorized` to anything but the registered source
>   with its secret.
> - Secret: `EXTERNAL_REFERRAL_TOKEN_NONSTOP` is set in the LabourMarket.ai
>   Vercel **Production** environment (rotated once on 2026-09-17 before any
>   hand-off; 48 random bytes, base64url). The value exists only there. The
>   Nonstop side receives it through an owner-controlled channel — never
>   through a file, a chat or a PR.
>
> **Nonstop may flip `LABOURMARKET_INTEGRATION.live = true` only after** (1)
> the same secret is configured on the Nonstop side, and (2) one `201`, one
> `200 duplicate` and one `422` have been observed against the live door
> from the Nonstop processor.

## What it is

LabourMarket.ai has ONE invitation/referral primitive: the canonical token
`invitations` row. An approved external source (the first is Nonstop Group's
careers intake) refers a worker by creating exactly one such invitation, on
the strength of that worker's explicit, versioned consent. The worker then
claims it the way every invited person does — opens the link, registers or
signs in, accepts — and owns the resulting account, profile and evidence.

There is no partner-specific worker table. The referral **is** the
invitation. What the source declared (trades, sectors, skills, experience
text, mobility) is stored on the invitation as `declared_context` — declared
input the person reviews line by line (accept / reject / correct) — and is
never copied into skills, professions or evidence by the platform.

```
SOURCE ──POST envelope──▶ /api/referrals/external/v1
                            │ auth: X-Referral-Source + Bearer <that source's secret>
                            │ schema: strict, consent.given === true required
                            │ db: receive_external_referral_v1 (service_role only)
                            │     re-checks consent version, idempotent on (source, leadId)
                            ▼
                     invitations row  ──link──▶ person ──register/sign in──▶ accept
                                                             │
                                                             ▼
                                           invitation_acceptances (provenance)
                                           + declared_context review by the person
```

## Endpoint

`POST https://labourmarket.ai/api/referrals/external/v1`

Headers:

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `X-Referral-Source` | the source slug from the registry (`nonstop`) |
| `Authorization` | `Bearer <secret>` — the secret in `EXTERNAL_REFERRAL_TOKEN_NONSTOP` on the LabourMarket.ai deployment; one secret per source, ≥ 32 chars, constant-time compared |

Body: the partner's `WorkerReferral` envelope, unchanged. Schema
(`apps/web/lib/invitations/external-referral-contract.ts`, strict — unknown
keys are refused):

```jsonc
{
  "v": 1,
  "kind": "NONSTOP_WORKER_REFERRAL",
  "leadId": "…",                      // source reference; idempotency key with the slug; ≤120 chars
  "receivedAt": "2026-09-16T10:15:00.000Z",   // optional
  "locale": "lt",                     // optional; invite link + e-mail language (falls back to en)
  "worker": {
    "subjectType": "INDIVIDUAL_WORKER | SPECIALIST | TEAM | BRIGADE",
    "professions": [{ "id": "tiler", "raw": "plytelių klojėjas" }],   // ≤20; id and/or raw
    "sectors": ["construction"],      // ≤30
    "skills": ["…"],                  // ≤50
    "yearsClaimed": 7,                // optional, 0..60
    "languages": ["lt", "ru"],        // ≤20
    "residenceCountry": "LT",         // optional ISO-2
    "availability": "AVAILABLE_NOW",  // optional, ≤40 chars
    "destinations": ["NO", "SE"],     // ≤40 ISO-2
    "mobilityScope": "LISTED | EU_WIDE",   // EU_WIDE stays a scope; never expanded
    "freeText": "…",                  // optional, ≤4000
    "contact": { "name": "…", "phone": "…", "email": "…" }   // phone accepted, NOT stored
  },
  "consent": { "given": true, "text": "<the notice the person saw>", "version": "worker-broader-search-v1" },
  "requests": ["WORKER_PROFILE", "OPPORTUNITY_SEARCH", "OPPORTUNITY_DELIVERY"]
}
```

**No consent, no referral.** `consent.given` must be literally `true`,
`text` non-empty, and `version` must equal the version the registry names
for the source (`worker-broader-search-v1`). The schema refuses anything
else; the database function refuses it again. Nothing is inferred from an
e-mail, a profession, a CV or a `reach` flag.

## Responses

| Status | Body | Meaning |
|---|---|---|
| `201` | `{ ok: true, outcome: "created", invitationId, inviteUrl, delivery: "sent" \| "delivery_failed" \| "not_sent", leadId }` | Stored. `inviteUrl` is the one-time capability — returned **only** here. `delivery` is the truthful e-mail result (`not_sent` when no provider is configured or no e-mail was given): **the source delivers the link itself unless `delivery` is `sent`.** |
| `200` | `{ ok: true, outcome: "duplicate", invitationId, status, leadId }` | Replay of a known `(source, leadId)`. Nothing written, **no link** (the first link is not recoverable; a replay must not mint a second capability). |
| `400` | `{ ok: false, reason: "invalid_json" \| "invalid_envelope", issues?: ["path: code"] }` | Schema refusal. Issues name paths and codes only, never values. |
| `401` | `{ ok: false, reason: "unknown_source" \| "not_configured" \| "unauthorized" }` | Auth refusal, before the body is read. |
| `413` | `{ ok: false, reason: "payload_too_large" }` | > 64 KB. |
| `422` | `{ ok: false, reason: "consent_required" \| "invalid_*" }` | The database refused (consent re-check or a bound). Nothing stored. |
| `429` | `{ ok: false, reason: "rate_limited", retryAfterSeconds }` | 60 / minute per source+address. |
| `503` | `{ ok: false, reason: "not_enabled" }` | The migration is not applied on this database. Nothing stored — never a stored claim for something not stored. |

## What the worker sees

1. Opens `inviteUrl` (`/{locale}/invite/{token}`), logged out: a minimal
   preview — "Invitation to join LabourMarket.ai", "Referred through Nonstop
   Group", validity — and two doors, **Register and continue** / **I already
   have an account**, both carrying the safe `?next=` return so the
   invitation survives e-mail confirmation and Google sign-in. The self-start
   path is the same door. No addressee, no declared data, no ids are shown to
   a stranger holding the link.
2. Signed in: accept or decline. Accepting an external referral creates NO
   relationship (it is a `join_platform` invitation) and writes one
   `invitation_acceptances` row — the provenance.
3. After accepting, the same page shows **what the source declared about
   them**, line by line (trades, fields, skills, languages, countries, own
   words) with **Correct / Fix / Not me**. Each answer is recorded on their
   own acceptance row. Nothing becomes a profile fact until they add it on
   the profile themselves; matching is not weakened for a referred worker.
4. An existing LabourMarket.ai user opening the link signs in and claims the
   referral on their existing identity — no duplicate account, no merge by
   e-mail similarity, and the partner never learns whether the address had an
   account.

## Locales

LT, EN, RU (plus NL, DE) for the landing, the review and the e-mail. The
envelope's `locale` sets the link's language; the person can switch.

## Owner gates before Nonstop can transmit

1. **Apply** `supabase/migrations/20260917120000_universal_invitation_referral_network_v1.sql`
   (RED: SECURITY DEFINER + GRANT/REVOKE + DROP NOT NULL + CHECK widening;
   rollback in `supabase/rollbacks/…down.sql`) via Supabase MCP `apply_migration`.
2. **Set** `EXTERNAL_REFERRAL_TOKEN_NONSTOP` (≥ 32 random chars) in Vercel
   for the LabourMarket.ai deployment, and the same value on the Nonstop side.
3. **Confirm** against a real fixture: one `201 created`, one `200 duplicate`
   replay, one `422 consent_required`.
4. On the Nonstop side: the outbound processor in `lib/lead-intake.ts`, the
   privacy page naming the consent and recipient, then
   `LABOURMARKET_INTEGRATION.live = true` — all in the partner repository,
   none from here.

## What this deliberately does not do

- No commissions, rewards, scores or leaderboards.
- No partner read access: the door writes one invitation and returns its id;
  it cannot list, read or update any worker.
- No verification: the schema has no field for it and the database never
  writes `worker_skills` / `worker_professions` on acceptance.
- No second notification system, no second invitation system, no Nonstop
  special case outside `lib/invitations/external-sources.ts`.
