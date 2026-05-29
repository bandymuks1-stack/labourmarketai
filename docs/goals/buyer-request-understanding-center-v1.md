# Buyer Request Understanding Center v1 — GOAL

## Repo
`labourmarket.ai`

## Working directory
`C:\Users\Mano\Documents\labourmarketai`

## Branch
`feat/buyer-request-understanding-center-v1`

## Background
PR #104 is already merged into `main` as `da3c9ea`.

It added real Level 1 buyer request attachments:
- private Supabase bucket `customer-request-attachments`
- `customer_request_attachments` table
- upload / persistence / remove / signed-read flow
- admin truth count pill and matrix row
- metadata-only file status

Current truth:
- files can be uploaded and persisted
- file metadata is real
- private storage and signed-read model are real
- OCR is not implemented
- text extraction is not implemented
- AI understanding is not implemented
- structured helper is not implemented

## Main goal
Turn buyer request attachments into a useful **Buyer Request Understanding Center v1**.

The buyer dashboard must show a clear request workflow:

`buyer request → attached files → manual-review readiness → next action`

This must stay honest:
- no fake AI
- no fake OCR
- no fake automatic verification
- no fake matching
- no fake candidates
- no fake offers

## Target routes
- `/lt/dashboard/buyer`
- `/en/dashboard/buyer`
- `/lt/dashboard/admin/project-truth`
- `/en/dashboard/admin/project-truth`

## Required product result

Each buyer request card should become a simple request understanding panel.

It must show:

### 1. Request basics
- request title / need / description if available
- request status
- created date
- buyer-visible next step

### 2. Attached files
For each attachment show:
- file name
- file type / MIME
- file size
- upload status
- analysis status
- signed read/download action if already supported
- remove action if already supported

### 3. Honest understanding message
If `analysis_status = not_started`, show:

LT:
> Failas pridėtas. Automatinis nuskaitymas dar neįjungtas — administratorius peržiūrės rankiniu būdu.

EN:
> File added. Automatic reading is not enabled yet — an administrator will review it manually.

### 4. Deterministic manual-review readiness
Create a pure helper that computes a visible readiness status only from real request + attachment metadata.

Statuses:
- `no_files` — no attachments yet
- `files_added` — attachments exist, manual review needed
- `enough_for_manual_review` — request has useful description and at least one attachment
- `needs_more_info` — missing useful request text or files

This is not AI. This is transparent product logic.

### 5. One buyer next action
Show only one clear next action:
- add first file
- add more project details
- wait for manual review
- administrator will review manually

No useless buttons. No self-links.

## Visual / UX requirement
This is not a full cinematic redesign yet, but it must not look like a dead SaaS table.

Use:
- mobile-first layout
- clean request card
- clear status chips
- grouped file cards or compact file rows
- one primary next action
- LT-first readability
- EN parity

## Admin truth update
Keep the current attachment truth row.

Add/update truth copy to say:
- Level 1 attachments are real
- Request Understanding Center is deterministic/manual-review only
- no OCR yet
- no AI extraction yet
- no automatic verification
- future levels may include text extraction and structured helper

## Forbidden
Do not add:
- fake AI summary
- fake OCR
- fake extraction
- fake verification
- fake matching
- fake candidates
- fake offers
- public file URLs
- payment / checkout
- marketplace flow
- new locales
- external sends
- unrelated dashboard redesign

Forbidden phrases:
- AI suprato
- automatiškai patikrinta
- garantuotai tinkamiausias
- patvirtinta
- verified
- automatically verified
- AI understood

## Implementation constraints
- Work from latest `origin/main`
- Keep scope small and reviewable
- Prefer pure helpers for status computation
- Add tests for readiness/status logic
- Add copy/guard test if project structure supports it
- Do not create DB migration unless absolutely necessary
- Do not touch Supabase policies unless absolutely necessary
- Do not touch auth core, payment, marketplace, matching, email sending, external integrations, or unrelated dashboards
- Do not touch LABMA, Agentai, Vismantas, or any other repo

## Validation
Run:

```bash
pnpm -F web typecheck
pnpm -F web lint
pnpm -F web build
pnpm -F web check:constitution
pnpm vitest run
```

## Acceptance criteria
- Buyer request card has visible manual-review understanding status
- Attachments still use PR #104 private/signed-read model
- UI honestly says automatic reading is not enabled
- Manual-review readiness status works from existing request + attachment metadata
- Admin truth page reflects the workflow honestly
- LT and EN copy exists
- No forbidden fake phrases exist
- Mobile layout is readable
- PR opened against `main`

## Final report format
Keep final report short:

1. PR URL
2. Branch
3. Commit SHA
4. Files changed
5. Exact URLs to test
6. What works now
7. What is still not implemented
8. Safety proof
9. One screenshot or one live route check only

No huge evidence pack.
