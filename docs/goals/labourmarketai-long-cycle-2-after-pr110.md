# Labourmarket.ai — Long Autonomous Work Cycle 2 after PR #110

## Owner paste command

Paste this block to the agent after downloading this MD file.

```text
/goal
Project/repo: labourmarket.ai
Working directory: C:\Users\Mano\Documents\labourmarketai

GOAL: Execute the downloaded MD plan file exactly.

The owner downloaded this file locally:
labourmarketai-long-cycle-2-after-pr110.md

First locate the file on disk.

Likely paths:
- C:\Users\Mano\Downloads\labourmarketai-long-cycle-2-after-pr110.md
- C:\Users\Mano\Documents\labourmarketai-long-cycle-2-after-pr110.md
- C:\Users\Mano\Desktop\labourmarketai-long-cycle-2-after-pr110.md

Required first steps:
1. Find the MD file.
2. Copy it into the repo:
   C:\Users\Mano\Documents\labourmarketai\docs\goals\labourmarketai-long-cycle-2-after-pr110.md
3. Read the copied file fully.
4. Treat it as the source of truth.
5. Work for one long autonomous cycle.
6. Do not ask the owner questions unless a real blocker appears.
7. Open PRs when useful.
8. Merge only when current autonomy policy allows it and all required checks are green.
9. Keep final reports short.

Do not invent a different project. Do not touch LABMA, Agentai, Vismantas, or other repos.
```

---

# Main goal

Continue labourmarket.ai after the successful PR #104 to PR #110 buyer request cycle.

Current known state:

- Main HEAD after the last cycle: `1a2f7b8`.
- PR #104: real buyer request attachments with private/signed-read storage.
- PR #105: Buyer Request Understanding Center v1.
- PR #107: buyer card clarity.
- PR #108: admin manual-review list.
- PR #109: attachment extraction-readiness foundation by MIME only.
- PR #110: visual readiness rail.
- Full tests after the cycle: 768 green.
- Still deferred and not faked: OCR, PDF parsing, AI extraction, structured helper, automatic verification, matching, candidates, offers.

This second long cycle must improve real product usefulness and visible quality while keeping honesty and safety.

## Desired outcome after several hours

By the end of this cycle, labourmarket.ai should feel more like a working buyer/admin operations product, not a collection of technical components.

Preferred result: several small PRs, each green and mergeable, improving:

1. Buyer request completion guidance
2. Admin review decision support
3. Request timeline/activity clarity
4. First lightweight visual operating view
5. Guard/test hardening against fake AI and UX drift

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
- new DB migration unless explicitly justified and small/additive
- fake users, fake companies, fake requests, fake candidates, fake offers
- AI provider integration
- OCR provider integration
- PDF parser integration
- paid API integration

Do not implement:
- real OCR
- real PDF parsing
- real AI extraction
- real matching
- automatic offers
- automatic verification

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

Use small PRs. Do not create one monster PR.

Recommended sequence:

1. PR E — Buyer request completion guidance
2. PR F — Admin review decision support
3. PR G — Request timeline/activity clarity
4. PR H — Lightweight visual operating view
5. PR I — Guard/test hardening if useful

If time is limited, finish the earliest PR fully and stop cleanly. Do not leave a half-built larger feature.

---

# PR E — Buyer request completion guidance

## Goal

The buyer should know exactly what information is missing from a request and what to add next.

## Current product issue

After PR #110, the buyer can see files, readiness and next action. But the system should become more useful by explaining what makes a request reviewable.

## Tasks

1. Inspect current buyer request fields and attachments.
2. Create a pure deterministic helper that evaluates request completeness from existing data only.
3. Do not create a DB migration unless absolutely necessary.
4. Show a small request checklist on the buyer card.

## Suggested checklist items

Use only fields that already exist.

Possible items:
- request description exists and is useful length
- at least one file attached
- project/location/country info exists if such field exists
- date/deadline info exists if such field exists
- contact/channel info exists if such field exists

If a field does not exist, do not invent data and do not fake it.

## UI behavior

Show:

- completed items
- missing items
- one recommended next action

Examples:

LT:
- Aprašymas pridėtas
- Failas pridėtas
- Trūksta aiškesnio poreikio aprašymo
- Pridėkite bent vieną failą arba nuotrauką

EN:
- Description added
- File added
- A clearer request description is missing
- Add at least one file or photo

## Acceptance criteria

- Buyer sees a useful completeness checklist.
- Checklist is deterministic and transparent.
- It does not imply AI.
- It does not require a migration.
- It works in LT and EN.
- It is tested.

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

# PR F — Admin review decision support

## Goal

Admin should not just see that a request needs review; admin should see why and what to do first.

## Tasks

1. Inspect current admin dashboard manual-review section from PR #108.
2. Improve it into a clearer review queue.
3. Use deterministic logic only.
4. Add or extend a pure helper if useful.

## Suggested admin review fields

For each request row/card, show:

- buyer/request title or fallback
- readiness/priority
- attachment count
- description signal
- file-readiness summary
- recommended manual action

Examples of manual actions:

- Review files manually
- Ask buyer for clearer description
- Ask buyer to attach a file
- Ready for manual assessment

LT parity required.

## Important

This is not a sales/offers/candidates feature.

Do not add:
- offer button
- matching button
- candidate list
- AI summary
- extracted file content
- send email button

## Acceptance criteria

- Admin can sort/scan buyer requests more clearly.
- Each item has one deterministic recommended manual action.
- No fake intelligence.
- Tests/guards cover the helper or copy.

## Validation

Run:

```bash
pnpm -F web typecheck
pnpm -F web lint
pnpm -F web build
pnpm vitest run
```

---

# PR G — Request timeline/activity clarity

## Goal

Make each buyer request feel like a living workflow by showing a simple timeline from existing facts.

## Safe version

Do not add a new DB activity table unless absolutely necessary.

Build a deterministic derived timeline from existing timestamps and states:

Possible timeline events:
- request created
- file attached
- manual review needed
- automatic reading not enabled
- admin review pending

Only use existing created_at/uploaded_at/status fields.

## Buyer UI

Show a compact activity/timeline block:

LT examples:
- Užklausa sukurta
- Failas pridėtas
- Laukiama rankinės peržiūros

EN:
- Request created
- File added
- Waiting for manual review

## Admin UI

Admin can see the same compact timeline or the newest relevant status.

## Acceptance criteria

- Timeline is derived only from real data.
- No fake activity.
- No DB migration unless clearly justified.
- Mobile readable.
- Tested as pure helper if possible.

---

# PR H — Lightweight visual operating view

## Goal

Add a small visual layer that makes the buyer/admin workflow easier to understand without a heavy redesign.

## Scope

This should be a light UI polish PR only after E/F/G are green or deemed unnecessary.

Allowed:

- status rail refinements
- request workflow stepper
- compact visual chips
- clear grouped sections
- better mobile spacing
- small inline icons if project already uses icons
- no new heavy dependency

Suggested visual model:

```text
Request
  ↓
Files
  ↓
Manual readiness
  ↓
Admin review
  ↓
Future structured helper
```

Future structured helper must be visibly marked as future/not enabled.

## Not allowed

- 3D visuals
- animation library
- fake live map
- fake matching pipeline
- fake AI dashboard
- AI has reviewed this states

## Acceptance criteria

- Buyer and admin screens are easier to understand visually.
- No functionality is faked.
- One route/screenshot check is enough in final report.

---

# PR I — Guard/test hardening

## Goal

Prevent future drift back into fake AI claims or confusing UX.

## Possible guards

Add or extend guards for:

- forbidden words in buyer/admin copy
- attachment readiness must remain not_enabled
- no file-byte reading in readiness helpers
- no imported AI/OCR/PDF packages in buyer request helpers
- buyer card must expose one next action, not multiple competing CTAs
- admin review priority must remain deterministic

Do only what is practical and not overbuilt.

## Acceptance criteria

- Guards catch fake AI/OCR/verification drift.
- Guards do not become brittle for unrelated work.
- Full validation green.

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
- PR scope remains small and clear

Stop and ask owner only if:

- DB migration becomes necessary
- Supabase policy change becomes necessary
- paid provider/API is needed
- external outreach/send is requested
- there is a security risk
- product decision cannot be made safely
- implementation would require fake data or fake product claims

---

# Branch naming

Use descriptive branches:

- feat/buyer-request-completion-guidance-v1
- feat/admin-review-decision-support-v1
- feat/request-derived-timeline-v1
- style/request-workflow-visual-view-v1
- test/buyer-request-truth-guards-v1

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

No huge evidence reports. No screenshot packs.

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

---

# End-of-cycle final report

At the end of the long cycle, report:

1. PRs opened
2. PRs merged
3. main HEAD
4. branches deleted/not deleted
5. tests run
6. routes to check
7. what is now better for buyer
8. what is now better for admin
9. still deferred
10. safety confirmation
