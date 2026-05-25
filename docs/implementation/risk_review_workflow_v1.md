# Risk Review Workflow — Implementation Plan v1

How the platform turns a signal (catalogued in `docs/policies/risk_signal_catalog_v1.md`) into a tracked, reversible, admin-authored decision. No code ships in this PR; this doc is the contract the next PR(s) implement against.

## End-to-end shape

```
signal lands → entity flagged `needs_review` (admin-only)
            → admin opens review queue (/admin/risk)
            → admin reads context, contacts subject if needed (via support thread)
            → admin sets final status:
                  normal                        — close, no action
                  verification_required         — subject informed, must provide proof
                  temporarily_restricted        — specific surface paused while review continues
                  manually_confirmed_violation  — confirmed; policy action follows
            → every transition appended to risk_review_log
            → subject sees state in their dashboard when status ≠ {normal, needs_review}
```

## Schema (future migration `00XX_risk_review.sql`)

Additive only. No DROP, no DELETE policy, no UPDATE policy on the log table.

```sql
-- Per-entity status column added to each subject table.
alter table public.profiles
  add column if not exists risk_status text not null default 'normal'
    check (risk_status in (
      'normal','needs_review','verification_required',
      'temporarily_restricted','manually_confirmed_violation'
    ));

-- Same column will land on organization_profiles when it ships
-- (see docs/implementation/org_workspace_foundation_plan_v1.md P2).
-- conversation_messages do NOT carry a status — threads stay open;
-- it is the participant profile that carries the status if any.

-- Append-only ledger.
create table if not exists public.risk_review_log (
  id              uuid primary key default gen_random_uuid(),
  subject_kind    text not null check (subject_kind in ('profile','organization')),
  subject_id      uuid not null,
  prior_status    text not null,
  new_status      text not null,
  reason          text not null,                    -- admin-authored, short, factual
  reviewer_id     uuid not null references public.profiles(id),
  signal_source   text not null,                    -- one of catalog source IDs
  created_at      timestamptz not null default now()
);
create index ... on (subject_kind, subject_id, created_at desc);
```

RLS:
- `profiles.risk_status`: SELECT — self OR admin. UPDATE — admin only, via security-definer RPC `admin_set_risk_status(subject_id, new_status, reason, signal_source)`.
- `risk_review_log`: SELECT — admin OR (self when `subject_kind='profile' AND subject_id=auth.uid()`). INSERT — admin only (RPC writes it). No UPDATE / DELETE policies (append-only).

Grants only to `authenticated`. No service_role in app runtime.

## Admin surface — `/dashboard/admin/risk`

- Inbox sorted by `(risk_status='needs_review' desc, created_at desc)`.
- Row reveals: subject summary (kind + redacted id), signal source, recent context (last 5 journal entries / messages — link, not inline).
- Right-side action panel: dropdown of the 5 statuses + `reason` textarea (required, min 10 chars) + signal source dropdown (catalog enum).
- Submit → RPC `admin_set_risk_status` → row updates + log row appended → row drops from `needs_review` slice if status changed.

All in scope of `requireSuperadmin(locale)`.

## Subject surface

When the viewer's own profile has `risk_status` in `{verification_required, temporarily_restricted, manually_confirmed_violation}`, the dashboard shows a calm card at the top:

```
┌─ Sistemos pranešimas ─────────────────────────────┐
│ Tavo profilis šiuo metu yra peržiūros etape.       │
│ Statusas: <Reikia patvirtinimo / Laikinas         │
│ apribojimas / Patvirtintas pažeidimas>            │
│ Priežastis: <reason>                              │
│ Kitas žingsnis: parašykite pagalbai —             │
│ [/dashboard/communication]                        │
└────────────────────────────────────────────────────┘
```

Doctrine:
- No "the algorithm decided" framing — the message names a human-authored reason.
- `temporarily_restricted` lists which surface is restricted (e.g. "Naujų užklausų kūrimas laikinai sustabdytas"); other surfaces stay normal.
- A self-service "request review" link → opens a new support thread tagged `risk-review`.

## Implementation order (separate PRs, each small)

1. **Doc PR (this one).** Catalog + workflow contract only. ← shipping now.
2. **Schema PR.** Migration above + RPC stub returning `not_implemented`. No UI.
3. **Admin inbox PR.** `/dashboard/admin/risk` reading `needs_review` rows, no mutate.
4. **Mutation PR.** `admin_set_risk_status` RPC actually flips status + writes log. Subject-side banner reads the status column.
5. **Subject self-service PR.** `Request review` link → support thread bootstrap.
6. **Auditor PR.** Read-only `/dashboard/admin/risk/history` showing the log per subject.

## What is explicitly NOT in v1

- Automatic flagging from telemetry. Telemetry already shows admin the events; the decision to open a review stays manual.
- Public-facing "trust score" anywhere.
- Cross-entity propagation (flagging an organisation does NOT flag its members).
- ML-based reputation. No model.
- External shared blacklist sync.
- Self-service unrestrict (subject can request; only admin clears).

## Refs

- `docs/policies/risk_signal_catalog_v1.md` — what signals count + what the system never does.
- `docs/policies/journal-evidence-and-correction-policy-v1.md` — append-only doctrine.
- `apps/web/lib/auth/require-superadmin.ts` — admin gate.
- `apps/web/lib/communication/actions.ts` — support thread bootstrap reused for "request review".
