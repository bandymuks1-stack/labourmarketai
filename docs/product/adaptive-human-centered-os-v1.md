# Adaptive Human-Centered OS v1

> The product should never force a person to become only one category.
> It should help the same person express different roles, activities,
> offers, needs, and ideas over time.

This document captures the doctrine the labourmarket.ai / app.labourmarket.ai
product is being built against, the parts that are live today, the parts
that are honestly preparing, and the architecture path so future roles,
activities, ideas and opportunities can be added without rewriting the
product.

## 1. Non-locking identity

A person is **not one fixed category**. A person can be a worker, founder,
company owner, freelancer, customer, agency, partner, learner, seller,
buyer, creator — or all of these over time — while remaining the same
person.

The product reflects this:

- **No first-choice lock.** Onboarding multi-select is the canonical entry,
  but even a single-role start is reversible. The strengthened LT/EN
  `account.rolesIntro` ("Pradinis pasirinkimas nėra apribojimas…" /
  "Your first choice is not a limit…") sits both on the account page AND
  inside the role-switcher dropdown.
- **One catalogue.** `apps/web/lib/config/roles.ts` is the single source
  for what roles exist, which are active, which are preparing, which are
  forward-looking and hidden. Both `RoleSwitcher` and the account page
  iterate over `LABOUR_MARKET_ROLES` via `ROLE_BY_ID` — no scattered role
  lists.
- **Future roles fit in.** Adding `freelancer` / `team_lead` /
  `service_provider` to the live UI is a one-file change: flip the row's
  `availability` from `"hidden"` to `"preparing"` and translate the label.

## 2. Role expansion principle

Roles are catalogue rows, not branches. The catalogue exposes:

- `availability: "active" | "preparing" | "hidden"`
- `entryPoint` — can a user start as this role at signup?
- `canBeAddedLater` — can a user add this role from inside the app?
- `primaryRoute` — where do they land when they switch to it?
- `disabledReasonKey` — i18n key for "why is this preparing?"

UI surfaces never decide on their own which roles are "real". They ask the
catalogue. Future PRs add rows, never rewrite renderers.

## 3. Activity expansion principle

The same applies to what a labour-market participant **records, claims,
offers, or needs**. `apps/web/lib/config/activity-types.ts` is the
canonical list — today only `work_done` and `skill_claim` are `active`
(Work Journal entries + profile-skills confirms). The rest
(`service_offer`, `worker_need`, `project_need`, `team_offer`,
`company_activity`, `learning_goal`, `business_idea`, `document_record`)
are honestly `preparing` config rows.

When a future sprint adds UI for one of these (e.g. `service_offer`), it:

1. Flips the row to `availability: "active"` in `activity-types.ts`.
2. Adds an i18n label under `activity.<id>`.
3. Renders a composer reusing the same text-first / suggestion /
   user-confirm pipeline the Work Journal already uses.

No new DB schema is required in this sprint. When new tables are needed
they go through the migration-review path documented in
`docs/product/confirmed-suggestions-foundation.md` and issue #32.

## 4. Text-first input principle

Users should be able to start by writing — what I can do, what I did
today, what I want to offer, what I need, what I want to build, who I
work with, what I want to become.

The system then proposes structure as **suggestions**, never as facts.
The pipeline is captured in PR #31's foundation doc
(`docs/product/confirmed-suggestions-foundation.md`) and is honored by
every adaptive surface this sprint adds.

Concretely on labourmarket.ai today:

- `/dashboard/profile` opens on a free-text composer with universal
  placeholder examples.
- `/dashboard/journal` opens on a free-text composer; the new collapsible
  "Examples from different domains" block lists customer support,
  client proposal, furniture assembly, and team-leadership phrasings so
  the form does not feel construction-only.

## 5. Suggestion confirmation principle

Every parser output is a **suggestion** until the user confirms it.
Confirmed records carry the explicit chain *Confirmed by you · Added to
your profile · Needs external confirmation later* and never wear a
"verified" badge.

The suggestion-status catalogue at
`apps/web/lib/config/suggestion-statuses.ts` is the single source of
status ids + i18n keys. The status `externally_confirmed` exists in the
catalogue but is **marked preparing** — UI surfaces must not render it
for arbitrary records until real external confirmation ships (PR #18 /
issue #32). The guard test enforces this.

## 6. Token / config / changeability principle

Everything visible to the user must stay easy to change later. This
sprint extends the discipline with five new config files:

| File | What it owns |
| --- | --- |
| `lib/config/roles.ts` | Role catalogue + availability + primary route. |
| `lib/config/intents.ts` | Intent catalogue (find_work / hire / partner / …). Foundation only — no UI consumes it yet. |
| `lib/config/activity-types.ts` | Activity-type catalogue (work_done / service_offer / business_idea / …). |
| `lib/config/feature-availability.ts` | Declared availability for product features. Matching, scoring, AI extraction and AI verification are explicitly `hidden` here so the honesty guard has a canonical home. |
| `lib/config/suggestion-statuses.ts` | Suggestion-status catalogue + i18n keys. |
| `lib/config/navigation.ts` | Primary nav source for `BottomNav` / `DashboardTabs`. |

Pages do not invent role lists, status lists, or "is this feature live?"
decisions on their own.

## 7. What is active today

- Worker role: full text-first profile + skills flow, manual chip picker
  as secondary path, applied-state trail with explicit confirm chain.
- Worker role: Work Journal text-first composer with universal examples,
  rule-based parser, suggestion review, saved-state feedback.
- Account roles list + RoleSwitcher: catalogue-driven, non-locking
  intro inside both surfaces.
- Pilot path for non-worker roles (`PilotRequestButton` → `/api/leads`)
  — honest and real; no fake matching.

## 8. What is preparing (visible but openly tagged RUOŠIAMA)

- Company / agency / customer dashboards beyond the pilot cockpit.
- External confirmation of suggestions (manager / client signs off on a
  user-confirmed fact). Blocked behind PR #18 / issue #32.
- Activity types beyond `work_done` and `skill_claim`. Documented as
  config rows; no UI yet.
- Intent picker. Documented but not surfaced.

## 9. What must NOT be faked

The honesty guard at `apps/web/lib/guards/product-readiness.test.ts`
encodes the project's hard line. The product MUST NOT show:

- `AI verified`, `AI patvirtinta`, `auto verified`, `automatic approval`,
  `automatinis patvirtinimas`, `guaranteed match`, `garantuotas
  atitikimas`, `AI matching`, `AI score`, `AI-powered extraction` —
  anywhere in any locale JSON.
- A `verified` badge on user-declared skills.
- The `externally_confirmed` status on records that never received real
  external confirmation.
- Matching, scoring, ranking, or trust-score claims.

`lib/config/feature-availability.ts` keeps `matching.engine`,
`score.universal`, `ai.extraction`, and `ai.verification` as
`availability: "hidden"`. Any PR that flips one to "active" without
shipping the underlying behaviour fails the guard.

## 10. Future architecture path

In dependency order:

1. **Owner production smoke for PR #30** (still PENDING). Owner-only;
   no agent can move this forward.
2. **PR #18 migration review** (per issue #32). Brings the journal
   security hardening (audit logs, ledger, narrowed RLS, RPCs,
   `proof_of_work` scaffold, feature flags). Once the flag machinery
   lands, the `externally_confirmed` suggestion status can flip from
   `preparing` to `active` in `lib/config/suggestion-statuses.ts` and
   the manager confirm UI starts honest.
3. **Confirmed-suggestions persistence** (per
   `docs/product/confirmed-suggestions-foundation.md`). Adds
   `suggestion_proposals` + `suggestion_confirmations` so the "why is
   this on my CV?" trail starts collecting from the next user forward.
4. **Activity-type UI** beyond Work Journal. Reuses the text-first /
   suggestion / user-confirm pipeline for `service_offer`,
   `worker_need`, `project_need`, `business_idea`. Each is a feature
   flip in `lib/config/activity-types.ts` + a copy block + a composer
   variant — no engine rewrites.
5. **Intent picker** (`lib/config/intents.ts`). Surfaces during
   onboarding so the system can recommend the right starting composer.

Each of these is a small, reversible PR that adds rows to a catalogue or
flips an `availability` value. None of them require a full redesign.
