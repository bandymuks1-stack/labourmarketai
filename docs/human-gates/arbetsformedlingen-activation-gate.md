# HUMAN GATE — Arbetsförmedlingen (Sweden) source ACTIVATION

State: `AWAITING_OWNER_DECISION` — nothing is activated.

This is the gate the persistence gate (`public-vacancy-persistence-gate.md`)
said would be separate. Storage exists in production since 2026-08-09 (ledger
`20260809175828`, both tables empty). This gate is about letting real records
ENTER it.

## Legal / governance status, re-derived 2026-08-09

| Fact | Status | Evidence |
|---|---|---|
| Provider | Arbetsförmedlingen via JobTech Development (Swedish PES) | `vacancy-provider-registry.ts` |
| Licence | **CC0** — confirmed | governance row `legalStatus: "confirmed"`, provider answer recorded 2026-08-04 in the registry comments |
| Cost | €0, keyless, no prior notification required | same record |
| Attribution | Requested by provider, REQUIRED by our product policy; carried per-row (`attribution_code`) and pinned by the boundary guard | `vacancy-source-boundary.test.ts` |
| Cadence | Provider's own recommendation encoded in the descriptor: one snapshot, ~1-minute stream polls (checkpointed), daily links refresh | `VACANCY_CHANNEL_CADENCE` comments |
| Governance | `activation: "owner_review"` — approved for integration, NOT running | `source-governance.ts` |
| Runtime | `VACANCY_SOURCE_ARBETSFORMEDLINGEN_ENABLED` unset in production → `provider_disabled`, fail-closed | `vacancy-kill-switch.ts` |

No repo ledger records a prior activation decision for this source — the
2026-08-09 owner command explicitly withheld it ("NEAKTYVUOK mokamų ar
teisiškai nepatvirtintų šaltinių" concerned paid/unconfirmed sources; this one
is free and confirmed, but activation was not granted either). It is therefore
still an open owner decision.

## What activation consists of — exactly two actions

1. **Code**: flip ONE line in `apps/web/lib/intelligence/source-governance.ts`
   — `activation: "owner_review"` → `activation: "on"` for the
   `arbetsformedlingen` row (PR + normal review).
2. **Env**: set `VACANCY_SOURCE_ARBETSFORMEDLINGEN_ENABLED=on` in the
   production environment (Vercel).

Neither alone imports anything: the importer requires BOTH gates open. Both
levers stay reversible in seconds (`VACANCY_IMPORT_KILL_SWITCH=on` stops
everything globally without a deploy).

## What happens after activation

Nothing automatic. There is NO scheduler in this repo — every run is an
operator pressing a button on `/dashboard/admin/vacancy-sources` (superadmin
only). The recommended sequence:

1. **Dry run** the `snapshot` channel from the admin console — counts only,
   writes nothing. Read the accepted/rejected/validAfterActivation numbers.
2. If the dry-run evidence looks right: **Import** the `snapshot` channel once
   (the descriptor marks it run-once). Rows land in `public_vacancies` with
   exact inserted/updated/unchanged accounting.
3. Later runs use the `stream` channel, which resumes from the stored cursor.

Bounds already enforced per session: ≤100 items/page, ≤50 pages, ≤5,000
accepted, ≤16 MB/response, 20 s timeout, 2 retries. Sweden-wide snapshot
volume (~tens of thousands of ads) will therefore need several snapshot
sessions or an owner decision to raise the session cap — the cap is a
deliberate first-run safety, not a product limit.

## What the owner is being asked

> Activate Arbetsförmedlingen (CC0, €0, keyless) as the first real external
> vacancy source — flip the governance row and set the env flag?

Approving this gate authorizes BOTH actions above and the operator snapshot
import that follows. It does NOT authorize any other source, any scheduler, or
any raise of the session caps.
