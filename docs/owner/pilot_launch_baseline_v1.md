# Pilot Launch — Baseline v1

Date: 2026-05-25
Branch: `feat/pilot-launch-os-v2`
Base: `origin/main` @ `89d218a` (post-PR #67)

## Current main

| | |
|---|---|
| Latest commit | `89d218a feat(agent-os): internal agent OS and tester intelligence v1 (#67)` |
| Previous commits | `eb167d3 fix(auth): production Google OAuth stability + safe-logging trace ids + preview-host honest framing (#66)`, `c7973dc feat(pilot): private draft flows for company / agency / buyer + admin read-only metrics (#54)`, `83a9ad5 feat(language-qa): tester feedback v1 + LT/EN audit baseline (#65)` |

## Open PRs

| PR | State | Notes |
|---|---|---|
| #18 | DRAFT — **do not touch** | Manager / client confirmation backbone. Standing block. |
| (no other open PRs at sprint start) | — | Merge queue is empty. |

## Migrations on production (verified via `list_migrations`)

```
0001  initial_schema
0002  reference_data
0003  multi_role
0004  authenticated_grants
0005  waitlist
0006  complete_onboarding_rpc
0007  add_role_rpc
0008  professions
0009  auth_role_architecture_v1
0010  skills_and_worker_skills
0011  seed_skills
0012  drop_taxonomy_name_columns
0013  work_journal_m1
20260524060556  profile_text_column                 (repo: 0014)
20260524075523  profile_skill_claims                (repo: 0015)
20260524154059  pilot_drafts                        (repo: 0016)
20260525052545  seed_platform_productivity_units    (repo: 0017)
20260525061459  journal_correction_lifecycle        (repo: 0018)
20260525074126  language_feedback                   (repo: 0019)
20260525092209  pilot_events                        (repo: 0020)
```

20 migrations applied. Naming drift between numeric repo style and timestamp prod ledger is known — semantics are identical; the recent batch (0017-0020) all match.

## What's live + working

- **Auth.** Google PKCE: zero `redirect_uri_mismatch` / `exchange_failed` in the last sweep. Trace ids correlate browser console → Vercel logs → Supabase auth `referer`.
- **Work Journal.** Multi-fragment LT extraction (5+ fragments per sentence proven), compound numerals, edit-via-supersede, soft-delete-while-unconfirmed, unknown-phrase clarify prompt. Human-readable durations everywhere.
- **Pilot drafts.** Company / agency / buyer private draft forms; admin draft count panel.
- **Language QA.** Floating "Pranešti apie tekstą" widget on every dashboard surface; admin inbox.
- **Agent OS + telemetry.** 10 role docs; `public.pilot_events` live; admin telemetry page rendering task summary + top errors + recent 200.

## What's NOT live (this sprint's scope)

- Internal communication / chat between testers and admin/owner.
- Operational documents for testers + owner.
- Product policies separating personal vs worker vs organisation responsibility.
- Sports-team operating-model vocabulary in product surfaces.
- Premium "spaceship / mission-control" visual direction.
- In-app pilot readiness card.
- Org profile creation gap audit.
- Live counts on `/admin/agent-os`.

## Hard constraints carried into this sprint

- No billing / payments / pricing / provider work.
- No env / secrets / Vercel / Supabase dashboard mutations without owner-approved `--apply`.
- No `service_role` in app runtime.
- No autonomous merge / deploy / migration bot.
- No external analytics SDK.
- No keystroke logging, screen recording, or hidden tracking.
- No public exposure of internal admin / agent / tester reports.
- No fake AI / matching / verified / confirmed claims.
- **PR #18 untouched.**
