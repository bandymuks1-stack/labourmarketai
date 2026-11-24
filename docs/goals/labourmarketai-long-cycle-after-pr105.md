# Labourmarket.ai — Long Autonomous Work Cycle after PR #105

## Owner paste command

Paste this block to the agent after downloading this MD file.

```text
/goal
Project/repo: labourmarket.ai
Working directory: C:\Users\Mano\Documents\labourmarketai

GOAL: Execute the downloaded MD plan file exactly.

The owner downloaded this file locally:
labourmarketai-long-cycle-after-pr105.md

First locate the file on disk.

Likely paths:
- C:\Users\Mano\Downloads\labourmarketai-long-cycle-after-pr105.md
- C:\Users\Mano\Documents\labourmarketai-long-cycle-after-pr105.md
- C:\Users\Mano\Desktop\labourmarketai-long-cycle-after-pr105.md

Required first steps:
1. Find the MD file.
2. Copy it into the repo:
   C:\Users\Mano\Documents\labourmarketai\docs\goals\labourmarketai-long-cycle-after-pr105.md
3. Read the copied file fully.
4. Treat it as the source of truth.
5. Work for one long autonomous cycle.
6. Do not ask the owner questions unless a real blocker appears.
7. Open PRs when useful.
8. Merge only when allowed by current autonomy policy and all required checks are green.
9. Keep final reports short.

Do not invent a different project. Do not touch LABMA, Agentai, Vismantas, or other repos.
```

---

# Main goal

Continue labourmarket.ai after PR #105.

Current known state:

- PR #104 shipped real buyer request attachments.
- PR #105 shipped Buyer Request Understanding Center v1.
- Main contains deterministic manual-review readiness, not AI.
- Buyer request cards now show request basics, attached files, readiness chip, and one next action.
- OCR, AI text extraction, structured helper, automatic verification, matching, candidates and offers remain deferred and must not be faked.

This long cycle must improve real product usefulness without turning it into a fake AI demo.

## Desired outcome after several hours

By the end of this cycle, labourmarket.ai should be visibly closer to a useful buyer-request workflow.

The preferred result is one or more small PRs that improve:

1. Buyer request workflow clarity
2. Manual admin review usefulness
3. Safe deterministic Level 2 foundation
4. Visual quality without fake functionality
5. Tests/guards so the same truth does not drift

---

# Hard boundaries

Do not touch:

- LABMA repo
- Agentai repo
- Vismantas / wavi repo
- production secrets
- payment / checkout
- marketplace activation
- candidate matching
- external email sending
- WhatsApp / Telegram outbound
- public file URLs
- Supabase storage policies unless absolutely necessary
- new DB migration unless the task clearly requires it and it is small/additive
- fake users, fake companies, fake requests, fake candidates, fake offers
- AI provider integration
- OCR provider integration
- paid API integration

Forbidden product claims:

- AI understood the file
- automatically verified
- verified
- patvirtinta
- AI suprato
- automatiškai patikrinta
- garantuotai tinkamiausias
- best match
- guaranteed candidate
- automatic offer

---

# Work strategy

Use small PRs.

Do not create one monster PR if the work naturally splits.

Recommended sequence:

1. PR A — Production/deploy and UI review cleanup after PR #105
2. PR B — Manual admin review workspace improvements
3. PR C — Safe deterministic text-readiness foundation, only if possible without fake AI
4. PR D — visual polish / mobile clarity only if PR A–C are already green

If time is limited, finish PR A fully and open it. Do not leave a half-built bigger feature.

---

# PR A — Buyer Request UX polish and live verification

## Goal

Make the current PR #105 workflow easier to understand for a real buyer and admin.

## Tasks

1. Pull latest origin/main.
2. Confirm main includes PR #105 commit e04fa76 or newer.
3. Inspect current buyer request implementation.
4. Improve wording and layout only where it clearly helps.
5. Keep the same functionality unless a small bug is found.
6. Make sure LT is readable and not machine-like.
7. Keep EN parity.

## Product checks

Buyer route:

- /lt/dashboard/buyer
- /en/dashboard/buyer

Admin truth route:

- /lt/dashboard/admin/project-truth
- /en/dashboard/admin/project-truth

Buyer request card should be understandable in this order:

```text
What is this request?
What files are attached?
Can the system read them automatically?
What will happen next?
What should I do now?
```

## Visual requirement

Do not do a cinematic redesign yet.

Improve clarity:

- better spacing
- clearer chips
- better section order
- better mobile hierarchy
- fewer repeated messages
- no giant dense text blocks
- no raw technical wording for buyer

## Acceptance criteria

- The buyer can understand the request state in less than 10 seconds.
- The admin truth row remains honest.
- No fake AI/OCR/verification wording.
- No new migration.
- No scope expansion.

## Validation

Run:

```bash
pnpm -F web typecheck
pnpm -F web lint
pnpm -F web build
pnpm -F web check:constitution
pnpm vitest run apps/web/lib/buyer/request-readiness.test.ts apps/web/lib/guards/buyer-request-understanding.test.ts
```

---

# PR B — Admin manual review workspace improvement

## Goal

Admins must be able to understand which buyer requests need review and why.

Current buyer side is improved, but admin must also have a clear manual-review view or truth surface.

## First inspect

Find existing admin/buyer/admin-truth/request files.

Look for:

- customer request listing
- admin project truth
- admin dashboard
- buyer request server actions
- request attachment helpers

Do not invent routes if an existing admin surface exists.

## Possible safe improvements

Pick the smallest useful improvement:

### Option B1 — Improve existing admin project-truth row

If no admin request list exists yet, improve project-truth copy and matrix to show:

- buyer request attachments real
- request readiness deterministic
- manual-review-only
- future: text extraction
- future: structured helper
- no AI/OCR today

### Option B2 — Add compact admin review section if there is already a suitable admin dashboard

Only if an admin dashboard already exists and has customer request data.

Show:

- request title/description
- attachment count
- readiness status
- created date
- next manual-review action
- no AI summary

### Option B3 — Add pure helper for admin review priority

A deterministic helper is safe.

Example statuses:

- review_ready
- missing_files
- missing_description
- manual_review_needed

This helper must use only real fields.

## Do not add

- AI summary
- OCR result
- extracted text
- candidate matching
- offer generator
- send button
- public file opening outside existing signed-read mechanism

## Acceptance criteria

- Admin has clearer manual-review truth than before.
- The change is deterministic.
- It does not create fake intelligence.
- It is tested.

## Validation

Run relevant tests plus:

```bash
pnpm -F web typecheck
pnpm -F web lint
pnpm -F web build
pnpm vitest run
```

If full vitest is too slow but reasonable, run it. If it fails, identify whether failures are related or pre-existing.

---

# PR C — Safe Level 2 text-readiness foundation

## Goal

Prepare for future extraction without pretending extraction works.

This PR should only be attempted after PR A and/or B are clean.

## Safe version

Do not implement PDF/OCR/AI extraction.

Instead, create a deterministic extraction-readiness model.

The model answers:

```text
Can this file type potentially be read later?
What kind of future reader would be needed?
What is the current extraction state?
What should the buyer/admin expect now?
```

## Allowed logic

Based on MIME type and existing metadata only:

- text/plain -> future_readable_text_file
- application/pdf -> future_pdf_reader_needed
- image/jpeg, image/png, image/webp -> future_ocr_needed
- unsupported/unknown -> manual_review_only

## UI copy

LT examples:

- TXT: Tekstinis failas ateityje galės būti nuskaitomas automatiškai. Šiuo metu peržiūra atliekama rankiniu būdu.
- PDF: PDF nuskaitymas dar neįjungtas. Administratorius peržiūrės failą rankiniu būdu.
- Image: Vaizdo/OCR nuskaitymas dar neįjungtas. Administratorius peržiūrės failą rankiniu būdu.
- Unknown: Šis failo tipas vertinamas rankiniu būdu.

EN parity required.

## Tests

Add pure tests for file-readiness mapping.

Guard against words implying extraction is already active.

## Forbidden

Do not read file bytes.
Do not add OCR.
Do not parse PDF.
Do not call AI.
Do not store extracted_text.
Do not update analysis_status to completed.
Do not create fake summaries.

## Acceptance criteria

- Product now explains the difference between TXT/PDF/image readiness.
- Still clearly says automatic reading is not enabled.
- No fake extraction.
- Pure helper tested.
- UI remains simple.

---

# PR D — Visual clarity pass

Only do this if A/B/C are complete or not needed.

## Goal

Make the buyer request panel feel like a product, not a dead SaaS form.

## Allowed visual improvements

- stronger request card hierarchy
- better file chips
- subtle status rail
- icon placeholders if the project already has icon pattern
- cleaner mobile layout
- less text repetition
- clearer next action
- no heavy new dependencies

## Not allowed

- 3D visuals
- animation libraries
- giant redesign
- fake live dashboard
- fake map
- fake matching
- fake AI

## Acceptance criteria

- Buyer route looks clearer on mobile and desktop.
- Admin truth still honest.
- No scope drift.
- One screenshot or route check is enough in final report.

---

# Autonomy rules for this cycle

Proceed autonomously when:

- changes are code/UI/test only
- no DB migration
- no secrets
- no payment
- no outbound communication
- no production destructive action
- no other repo touched
- tests are green

Stop and ask owner only if:

- DB migration becomes necessary
- Supabase policy change becomes necessary
- paid provider/API is needed
- external outreach/send is requested
- there is a security risk
- product decision cannot be made safely

---

# Branch naming

Use descriptive branches:

- fix/buyer-request-ux-clarity-v1
- feat/admin-manual-review-clarity-v1
- feat/attachment-readiness-foundation-v1
- style/buyer-request-visual-clarity-v1

One branch per PR.

---

# Final report format

Keep each report short.

Use this format:

```text
Final report

1. PR URL:
2. Branch:
3. Commit SHA:
4. Files changed:
5. What changed:
6. What works now:
7. What is still not implemented:
8. Validation:
9. Safety:
10. Test URLs:
```

Do not write huge evidence reports.

Do not attach large screenshot packs.

One screenshot or live route check is enough for visual work.

---

# Definition of done

A PR is done only when:

- it is based on latest main
- it has a clear small scope
- it has tests/guards where useful
- it has LT/EN copy if visible text changed
- it has no fake AI/OCR/verification claims
- it passes validation
- it opens a PR against main
- final report is short

If the PR is safe, green, and current autonomy policy allows merge, merge it and run a short post-merge smoke.

If not, leave it open and explain exactly why.
