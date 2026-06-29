# Live Tester Feedback Summary v1

> Rolls up [`live-tester-feedback-ledger-v1.md`](./live-tester-feedback-ledger-v1.md).
> Updated only from real tester input — nothing invented.

## Batch
- Date: _(pending first batch)_
- Testers: aliases Tester-01 … Tester-04 (real names only if owner provides them)
- Environment: production (Vercel)
- App URL: https://app.labourmarket.ai

## Overall understanding
- What testers understood: _(pending)_
- What testers did not understand: _(pending)_
- Most useful perceived features: _(pending)_
- Least clear areas: _(pending)_

## P0 blockers
- _(none captured yet)_

## P1 fixes
- _(none captured yet)_

## P2 polish
- _(none captured yet)_

## External blockers
- **OAuth / consent branding (P0, external)** — the Google consent screen shows
  the provider-configured app name, not a repo value. Fix is in Google Cloud OAuth
  consent config (app name, logo, authorized domains, support/developer email) and,
  if needed, a Supabase auth custom domain + redirect URLs. Cannot be fixed from
  repo code. Any tester trust comment about the Google/Supabase screen maps here.

## What is already working
- All 11 canonical surfaces reachable with honest states; PR3–PR12 merged; 6064
  tests green. Baseline per
  [`first-launch-final-smoke-and-blockers-v1.md`](./first-launch-final-smoke-and-blockers-v1.md).
  (Tester-confirmed "working" items will be listed here as sessions arrive.)

## Recommended next PR train
- Pending tester feedback. When a P0/P1 pattern is clear, grouped smoke-fix PRs
  by user-facing flow:
  - PR A — Login/Auth trust & onboarding blockers
  - PR B — Dashboard/MyZone comprehension
  - PR C — Diary/Skills/CV comprehension
  - PR D — Calendar/Marketplace/Player Card flow
  - PR E — Map/Matching clarity
  - PR F — Reports/Documents/export clarity

## Owner decisions needed
- OAuth consent branding (external action — see External blockers).
