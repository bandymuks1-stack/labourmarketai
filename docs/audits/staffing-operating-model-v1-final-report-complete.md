# Staffing Operating Model v1 — Final Report (complete)

> Supersedes the interim report. The Staffing Content & Operating Model v1 sprint
> as delivered: the operating-model backbone, **both usable intake/need forms**,
> the **ZZP/brigade** path, the **operator candidate pool**, the **non-persisted
> match preview**, honest pricing, and a **visual-evidence pass** with real
> screenshots. Governing line (unchanged): *Labourmarket.ai automates labour-agency
> operations but never uses AI as a legal, verification, or payment authority.*
> Source of truth: [`../product/staffing-operating-model-v1.md`](../product/staffing-operating-model-v1.md).

## 1. PRs + merge SHAs

| PR | Title | # | SHA |
|----|-------|---|-----|
| 1 | operating-model source-of-truth doc | #383 | `7fae800` |
| 2 (model) | worker intake model + AI draft action | #384 | `49d784e` |
| 2-UI / 10 | **usable worker intake FORM** + AI draft display | #390 | `c5e6d5d` |
| 3 | foreign-worker funnel `/work-abroad` | #388 | `9c5fc2d` |
| 4+6 (model) | company need model v2 + deterministic fit engine | #385 | `609ff7f` |
| 4-UI / 10 | **usable company need/vacancy FORM** + AI draft | #391 | `51739bc` |
| 5 | ZZP / subcontractor / brigade path | #392 | `df0466f` |
| 7 | read-only operator candidate pool (admin) | #393 | `e700b43` |
| 8 | non-persisted match preview | #394 | `51b2cdd` |
| 9 | contract/payment readiness (payments off) | #386 | `cfc87e9` |
| 11 | honest service/pricing model | #387 | `4ced20f` |
| 12 | visual evidence + this report | (this) | — |

## 2. Route list (what a user can reach)

| Route | Who | What | Auth |
|---|---|---|---|
| `/[locale]/work-abroad` | worker | foreign-worker funnel (chain, what-you-need, CTAs) | public (SSG lt/en/ru) |
| `/[locale]/worker-intake` | worker | intake form → AI profile draft (suggestion); incl. ZZP/brigade fieldset | public (SSG) |
| `/[locale]/company-need` | company | vacancy/need form → AI vacancy draft (suggestion) | public (SSG) |
| `/[locale]/match-preview` | operator | non-persisted fit preview + AI explanation | public (SSG) |
| `/[locale]/dashboard/admin/candidate-pool` | operator | read-only candidate pool with filters | **admin-gated** |
| `/[locale]/labour-market[/country]` | worker | sourced country signals (pre-existing) | public |

## 3. Worker intake — DONE, usable

`/worker-intake` (#390): trade (taxonomy select), target countries, availability,
accommodation, transport, languages, engagement type, documents, comment — plus an
optional **ZZP/brigade** fieldset (#392: business name, VAT, team size, team
professions, tools, insurance, invoice-ready). Submit → the `worker_profile` agent
draft, shown as **"AI suggestion — review before saving — not verified"**; honest
**"AI draft not generated yet"** when the provider is disabled (the prod state).
Nothing is persisted or verified.

## 4. Profession paths

`PROFESSION_DIRECTIONS` (17 trades) aligned to `messages/[locale]/professions.json`;
the forms offer a 12-trade subset known to the taxonomy (general_laborer, carpenter,
concrete_worker, drywaller, electrician, mason, painter, plumber, rebar_worker,
roofer, tiler, welder). Slug-registry rule (Lego §10) — no hardcoded UI enums.

## 5. Foreign-worker funnels

`/work-abroad` live in **lt/en/ru** (the active locales). Honest funnel; no
job/wage promise, no legal guarantee, no fake jobs. Per-country sourced signals
remain at `/labour-market/[country]`.

## 6. Company need / vacancy form — DONE, usable

`/company-need` (#391): company/contact, country, profession, worker count, team
shape, start/duration, accommodation offer, transport, language requirements,
engagement model, required skills/certs/docs, description. Submit → the
`company_need` agent normalized vacancy draft (no invented pay). Reviewed before
publishing; nothing auto-published.

## 7. ZZP / brigade path — DONE

Worker segments (employee / zzp_self_employed / subcontractor / brigade /
agency_supplied) modelled + the optional ZZP/brigade fieldset on intake (#392).

## 8. Accommodation / transport / language fit — DONE

Deterministic `computeStaffingFit` over profession / accommodation / transport /
language / start_date; mismatches are **never hidden** (each is a blocker), missing
data is `unknown` not `fit`.

## 9. Candidate pool — DONE (read-only, admin)

`/dashboard/admin/candidate-pool` (#393): reuses the existing worker supply
(matching-workbench loader, admin-RLS), filters by trade / country / available-by /
evidence / search, honest badges (confirmed-evidence / self-declared–not-verified /
missing-info). **Read-only — no write, no migration, no verification, no publish.**

## 10. Match → booking — preview only (no persistence)

`/match-preview` (#394): the deterministic fit + an honest dimension SCORE
(count of fit/mismatch/unknown — never a fabricated % or AI score) + the
`matching_explanation` agent. Banner: **"Preview only — not booked and not saved as
a booking request."** Persisted booking remains **owner-gated** (it needs the
booking-schema migration, which was deliberately NOT approved this sprint).

## 11. Contract / payment readiness — DONE (payments off)

`computeContractPaymentReadiness` (#386): `paymentsLive` is the literal `false`;
payment is always blocked; honest billing-state reuse.

## 12. AI suggestion UI — DONE on worker/company/match; admin notes pending

AI surfaces on `/worker-intake`, `/company-need`, `/match-preview`, all labelled
"AI suggestion / review / not verified", honest disabled state. The admin candidate
pool shows honest statuses (not AI suggestions). Persisted accepted/rejected/edited
feedback awaits PR #379 (`ai_runs`/`ai_suggestions`) — owner-gated.

## 13. Pricing / service model — DONE

`SERVICE_TIERS` (#387): worker free; company pilot/quote; agency quote. Every paid
tier is "Pilot access / request a quote" — no fabricated price (`hasNoFakePrice()`).

## 14. Tests / guards / build

Green on every PR: typecheck + lint + i18n parity/debt + public-no-fake-claims +
~3860 tests + build. Staffing logic is pure + unit-tested; AI drafts proven via the
mock provider (no key/network); runtime-off fabricates no draft.

## 15. Production route smoke

`/work-abroad`, `/worker-intake`, `/company-need`, `/match-preview` build statically
(lt/en/ru) and serve `200` under `next start`. The AI runtime resolves to `disabled`
in prod (no env) and reports it honestly.

## 16. Visual evidence (screenshots)

Captured against a local `next start` prod build (read-only navigation; no data
created): **`docs/evidence/staffing-operating-model-v1/screenshots/`** — desktop +
mobile for `work-abroad` (en + lt), `worker-intake`, `company-need`, `match-preview`,
plus a **filled `match-preview-result`** (desktop + mobile) showing the deterministic
fit (`Fit: 4 of 5 · 1 mismatch`, accommodation mismatch surfaced as a blocker) and
the honest **"AI explanation not enabled"** state. 12 PNGs. Capture script:
`apps/web/scripts/capture-staffing-screenshots.mjs`. The admin candidate-pool route
is auth-gated, so it is not screenshot here (redirects to login without a session).

## 17. What was NOT touched

No migration · no DB write (candidate pool is read-only, match preview is
non-persisted) · no booking table · no consent model · no live Stripe / live keys ·
no env/secrets/Vercel/DNS · no PR #379/#368 · no AI-provider activation · no
auto-contact/outbound · no fake jobs/testimonials · no work/wage promise · no legal
guarantee · no AI verification · no auto-publish · no LABMA/legacy terms · no
competitor copy/design.

## 18. Honest remaining gaps (to real selling / live)

1. **Persisted booking flow** — needs the booking-schema migration (owner-gated;
   not approved this sprint). Today: non-persisted preview only.
2. **AI suggestion persistence** (accepted/rejected/edited) — needs PR #379
   `ai_runs`/`ai_suggestions` migration (owner-gated, Supabase MCP apply).
3. **Real AI provider** — set `AI_PROVIDER_MODE=live` + `AI_API_KEY` in Vercel env
   (drafts are honestly "disabled" until then).
4. **Live payments** — forbidden by design; a separate, deliberate sprint.
5. **Confirmed pricing** — real amounts behind the billing test-mode foundation.
6. **Admin candidate-pool screenshot** — needs an authenticated session capture.
