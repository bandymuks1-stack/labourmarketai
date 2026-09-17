# Nonstop commercial handoff v1 — `LABOURMARKET_WORKER_VACANCY_INTEREST`

**Direction:** LabourMarket.ai → Nonstop Group. The mirror of
[`EXTERNAL_WORKER_REFERRAL_V1.md`](EXTERNAL_WORKER_REFERRAL_V1.md) (Nonstop → LabourMarket).

**Status (2026-09-17):** contract + LabourMarket side WRITTEN, RED migration
`20260917160000_vacancy_interest_commercial_handoff_v1` **PREPARED, NOT APPLIED**
(owner gate; dry-run proven in a rolled-back production transaction, zero residue).
Dispatcher inert until the owner sets `NONSTOP_HANDOFF_ENDPOINT` + `NONSTOP_HANDOFF_TOKEN`.
**No Nonstop receiver exists yet** — see `NEXT_NONSTOP_COMMAND` at the end.

---

## 1. The chain this closes

```
worker (canonical identity, matchable)
  → real public vacancy on the ONE board (public_vacancies, Arbetsförmedlingen today)
  → the ONE engine's verdict (matchWorkerToNeed via buildNeedFromVacancy)
  → the worker EXPLICITLY says "I want this job"        demand_interest_signals (public_vacancy_id)
  → the commercial rule holds (handoff-rule.ts)         create_commercial_handoff_v1 (SECDEF)
  → commercial_handoffs row, status = queued            LabourMarket's canonical OUTGOING event
  → dispatcher (cron, env-gated) POSTs the envelope     Nonstop receiving door (this document)
  → Nonstop: commercial opportunity → employer contact (via Agentai OS discovery, owner-gated)
             → candidate proposition (ONLY with propositionConsent.given) → response → placement
```

LabourMarket.ai owns everything up to and including the envelope. Nonstop owns everything after
it. **LabourMarket.ai never contacts an employer from this event.**

## 2. The commercial signal rule (explicit, never a score)

A handoff exists **only** when every criterion holds — stated once in
`apps/web/lib/commercial/handoff-rule.ts` and re-checked in the database by
`create_commercial_handoff_v1`:

| # | criterion | where enforced |
|---|---|---|
| 1 | worker has a canonical identity the engine can read (`hasWorkType && hasSkills`) | rule (app) |
| 2 | a real, live `public_vacancies` row (v1 scope: public-source ads only) | rule + RPC |
| 3 | an explicit `demand_interest_signals` row, status `interested`, owned by the caller | RPC |
| 4 | employer identifiable: published name AND (org id OR homepage) → `employer_key` | rule + RPC |
| 5 | recency floor of `employer-outreach-policy.ts` **recorded** as `outreach_state` (not a veto) | rule + RPC |

Not a handoff: a bookmark (`worker_saved_opportunities`), a view, a system match, a withdrawn
interest, an interest in a platform demand (its owner already receives it in-product — whether
Nonstop should also approach a platform customer is an **OPEN OWNER DECISION**).

## 3. Consent model — interest ≠ proposition

| act | consent object | version |
|---|---|---|
| joining LabourMarket via Nonstop referral | `invitations.consent_record` | `worker-broader-search-v1` |
| expressing interest in one vacancy | the stored signal itself (the worker's own action) | — |
| **Nonstop presenting the person to that employer** | `commercial_handoffs.proposition_consent` | `employer-proposition-v1` |

The proposition question is asked on the interest form, **unchecked by default**, in the
worker's words: *"Nonstop Group may present me to this employer for this job (only your declared
professions, skills, languages and availability — never your work journal or CV)."*
`{given:false}` ⇒ Nonstop may pursue the vacancy but **may not name the person**.

## 4. The envelope

`POST <NONSTOP_HANDOFF_ENDPOINT>` · headers `Authorization: Bearer <NONSTOP_HANDOFF_TOKEN>`,
`X-Handoff-Source: labourmarket.ai`, `content-type: application/json`.

```json
{
  "kind": "LABOURMARKET_WORKER_VACANCY_INTEREST",
  "v": 1,
  "handoffId": "<uuid>",
  "createdAt": "2026-09-17T12:00:00Z",
  "worker": {
    "profileRef": "<labourmarket profile uuid>",
    "workerRef": "<labourmarket worker uuid>",
    "locale": "ru",
    "professionSlug": "warehouse-worker",
    "skillSlugs": ["forklift-operation", "inventory-control"],
    "languages": ["ru", "en"],
    "availabilityStatus": "available",
    "currentCountry": "LT",
    "basis": "declared | evidenced | mixed"
  },
  "vacancy": {
    "vacancyRef": "<public_vacancies uuid>",
    "providerKey": "arbetsformedlingen",
    "externalId": "29384",
    "title": "Lagerarbetare",
    "country": "SE",
    "city": "Göteborg",
    "publishedAt": "2026-08-01T00:00:00Z",
    "expiresAt": null,
    "applicationUrl": "https://…",
    "professionSlug": "warehouse-worker"
  },
  "employer": {
    "employerKey": "arbetsformedlingen:org:5560001234",
    "name": "Nordisk Lager AB",
    "externalOrgId": "5560001234",
    "homepage": null
  },
  "interest": {
    "signalRef": "<demand_interest_signals uuid>",
    "expressedAt": "2026-09-17T11:59:00Z",
    "matchStatus": "possible",
    "propositionConsent": { "given": true, "version": "employer-proposition-v1", "at": "…" }
  },
  "outreach": { "stateAtCreation": "eligible_for_human_review", "policy": "employer-outreach-policy-v1" },
  "provenance": { "system": "labourmarket.ai", "handoffKind": "worker_vacancy_interest", "consentModel": "interest≠proposition" }
}
```

**Never in the envelope** (guard-pinned, `HANDOFF_FORBIDDEN_FIELDS`): the worker's note, any
journal entry, CV, document, profile text, bio, e-mail, phone, salary, trust score, the raw
match snapshot. `matchStatus` is a status word, never a number. `basis` is provenance, never
"verified" unless a manager confirmation exists.

### Responses Nonstop's door must give

| status | meaning | LabourMarket then |
|---|---|---|
| `201` | stored, new | marks `delivered` |
| `200` | duplicate (`handoffId` already stored) | marks `delivered` |
| `400` | invalid envelope | leaves queued, counts `rejected` |
| `401` | unknown / wrong bearer | leaves queued, counts `rejected` |
| `413` | too large | leaves queued, counts `rejected` |
| `422` | consent / contract violation | leaves queued, counts `rejected` |
| `429`, `5xx`, network | retry next sweep | leaves queued, counts `retryLater` |

Idempotency key = `handoffId`. A `closed` handoff (the worker withdrew) is never sent; a
delivered one is never re-sent. Nonstop MUST re-check `outreach.stateAtCreation` against its
own contact history and the 30-day floor before any contact — the envelope records the floor,
it does not grant contact.

## 5. LabourMarket-side pieces

| piece | file |
|---|---|
| second source on the ONE interest table + `commercial_handoffs` + SECDEF create/read + withdrawal trigger | `supabase/migrations/20260917160000_vacancy_interest_commercial_handoff_v1.sql` (+ rollback) |
| the rule | `apps/web/lib/commercial/handoff-rule.ts` |
| the envelope | `apps/web/lib/commercial/handoff-contract.ts` |
| the dispatcher (env-gated) | `apps/web/lib/commercial/handoff-dispatch.ts`, `app/api/cron/commercial-handoffs/route.ts` |
| interest write path | `apps/web/lib/opportunities/vacancy-interest.ts` (+ `-actions.ts`) |
| the control | `apps/web/components/app/vacancy-interest-button.tsx` on every external board row |
| guard | `apps/web/lib/guards/worker-vacancy-interest-handoff.test.ts` |

Owner env (LabourMarket Vercel, Production): `NONSTOP_HANDOFF_ENDPOINT`, `NONSTOP_HANDOFF_TOKEN`
(≥ 32 chars; issued by Nonstop; never printed). Then add the cron entry to `apps/web/vercel.json`
(e.g. `"/api/cron/commercial-handoffs"`, `"*/30 * * * *"`).

## 6. Boundaries that survive this

- **No outreach from LabourMarket.ai.** The only recipient of anything is Nonstop's door.
- **Agentai OS owns contact discovery** (company intelligence, official domain, decision-maker,
  source verification, outreach infrastructure). LabourMarket passes `employerKey`, the
  publisher's org id / homepage host, nothing more. No contact database here.
- **Nonstop's own outreach gate** (`employer-outreach-policy` is stricter and binding, see
  `docs/commercial/company-demand-outreach-v1.md`): 30-day floor, one initial contact per company
  ever, permanent opt-out, human approval before any send.
- **Traceability:** worker → declared context → engine verdict (`matchStatus`) → vacancy → signal
  → handoff → Nonstop action, each a canonical id. Nothing collapses into "AI matched".

---

## NEXT_NONSTOP_COMMAND

> Repository `bandymuks1-stack/nonstopgroup-website` (local `C:\Users\Mano\Nonstop group web`).
> Build the RECEIVING side of `LABOURMARKET_WORKER_VACANCY_INTEREST v1`
> (labourmarketai `docs/integrations/NONSTOP_COMMERCIAL_HANDOFF_V1.md`) inside the existing
> lead-delivery architecture (`lib/lead-intake.ts`, sinks smtp/webhook/file are the record):
> `POST /api/partners/labourmarket/handoffs/v1`, bearer from server env `LABOURMARKET_HANDOFF_TOKEN`
> (a NEW secret, generated by Nonstop, handed to LabourMarket through the owner channel — do NOT reuse
> the referral token), header `X-Handoff-Source: labourmarket.ai` required; validate the envelope
> strictly (kind, v=1, allow-listed keys only, reject any extra key with 400); idempotency on
> `handoffId` (201 new / 200 duplicate); persist first as a `COMMERCIAL_OPPORTUNITY` lead kind
> (new lead type in the existing sink; NEVER a worker application), status `NEW`; enforce:
> `outreach.stateAtCreation === 'ineligible_too_new'` ⇒ store with `contactAllowedAfter` =
> publishedAt + 30 days and NO human task yet; `eligible_for_human_review` ⇒ create the operator
> task "review employer approach"; `interest.propositionConsent.given !== true` ⇒ the record is
> flagged `CANDIDATE_MAY_NOT_BE_NAMED` and the operator UI hides the worker refs; never store the
> worker's refs outside that record. No automatic employer contact, no email to anyone, no bulk;
> employer contact discovery is Agentai OS's job (pass `employer.employerKey`, `externalOrgId`,
> `homepage` on). Tests (`scripts/test-*.mjs`), `npm run check`, PR. Stop with
> `SECRET_HANDOFF_REQUIRED` when the new token must be placed on LabourMarket Production
> (`NONSTOP_HANDOFF_TOKEN` + `NONSTOP_HANDOFF_ENDPOINT`); do not touch the labourmarketai repo.

## NEXT_AGENTAI_COMMAND

> Repository AGENTAI (`C:\Users\Mano\Documents\agantai`). Given a Nonstop `COMMERCIAL_OPPORTUNITY`
> record carrying `employer.employerKey` (`<provider>:org:<id>` | `<provider>:host:<host>`),
> `employer.name`, `externalOrgId`, `homepage`, `vacancy.applicationUrl` and `outreach.stateAtCreation`:
> resolve the company's official domain and public decision-maker contact through the EXISTING
> company-intelligence / contact-discovery capabilities (source-verified, provenance kept), and
> return a `CONTACT_CANDIDATE` to Nonstop's operator task — never send anything. Respect Nonstop's
> outreach policy (30-day floor from `vacancy.publishedAt`, one initial contact per `employerKey`
> ever, permanent opt-out). Do not import LabourMarket worker data; the worker is never named to
> Agentai OS. No new contact database in LabourMarket or Nonstop.
