# Labourmarket.ai — Supergrand Vision OS v1

> A labour-market operating system in which one person can grow across
> many roles, activities, offers and needs — without ever being locked
> into one category.

This document is the canonical product narrative. It explains what
labourmarket.ai is, what it isn't, what is live today, what is
preparing, and what stays explicitly future. Companion to:

- `docs/architecture/labourmarketai-operating-system-map-v1.md` —
  the layer-by-layer technical map.
- `docs/product/labourmarketai-pilot-to-grand-vision-roadmap-v1.md` —
  the phased roadmap (Now → Future).
- `/[locale]/vision` — the public surface where the same narrative is
  shown to prospective pilot participants and workers.

## 1. What labourmarket.ai is

- It is **not** a job board.
- It is **not** a worker-only CV page.
- It is **not** a company-only ATS / dashboard.
- It is a labour-market operating system: a place where the same human
  identity can grow over time across worker, freelancer, team lead,
  service provider, company owner, agency partner, or customer roles
  — while keeping one identity and one evidence trail.

The product principle (from PLATFORM_DOCTRINE §1 and every sprint
since PR #34):

> A person is not one fixed category. The first role is only an entry
> point. Nothing is final. Everything must remain easy to change
> through config, copy dictionaries, tokens, and shared components.

## 2. Universal identity

One sign-in, one identity, many possible roles. The role catalogue at
`apps/web/lib/config/roles.ts` is the canonical source of truth:

- **worker** — active today.
- **company / agency / customer** — preparing (visible, no broken
  CTAs).
- **freelancer / team_lead / service_provider** — hidden (catalogue
  rows ready for one-row promotion).

Every role row carries `canBeAddedLater: true`. There is no copy
anywhere in the product that says "you are only X" — the guard test
enforces it.

## 3. Text-first / CV-first start

A worker should be able to start with plain truth: write what they do,
or paste a CV. The system then proposes structure as **suggestions**
(rule-based, not AI). The user confirms or discards each one before
anything is persisted as a fact. (`docs/product/confirmed-suggestions-foundation.md`).

This is the antidote to "fill 47 fields about your career" friction.
Profile + journal both follow the same text → suggestion → user-confirm
→ saved-fact pipeline.

## 4. Work Journal as the reality backbone

The journal isn't a status update — it's where the worker's evidence
trail lives. Each entry will eventually be confirmable by a manager
or client. Today the entries live with `visibility_scope: "closed"`
and there is no external attestation yet — the journal page is honest
about this (`pilotBackboneNote` from PR #39).

When PR #18 / issue #32 lands (audit logs, narrowed RLS, confirm /
reject / revoke RPCs, the `proof_of_work` scaffold), the journal
becomes the legal substrate of the proof CV. Until then, the surface
exists and works honestly; the legal layer is openly preparing.

## 5. Proof CV (reputation from real work)

The CV is born from the chain:

```
skill claim → journal entry → evidence → confirmation → trust profile
```

Never from a self-written job-board description. There is no
"verified" badge on user-declared facts; the chip the system shows is
**Confirmed by you · Added to your profile · Needs external
confirmation later**. The `externally_confirmed` status row exists in
`lib/config/suggestion-statuses.ts` but stays `availability: "preparing"`
until PR #18 ships.

## 6. Role catalogue (evolution layer)

Adding a future role is a two-line change (PR #38 doctrine):

1. Add a row to `lib/config/roles.ts`.
2. Add LT + EN copy.

Optionally map to a feature row in `lib/config/feature-availability.ts`
so the role degrades to preparing whenever its underlying feature is
not yet active. Renderers (RoleSwitcher, account list, dashboard role
expansion, public vision page) all pick it up automatically. No
component edits.

## 7. Next Action Engine

The dashboard's first-use panel + the "Next move" panel today are the
seed of the next-action engine. They compute the **single next best
action** for the current worker and surface it as a single button.

The pattern extends to the founder-facing surfaces — eventually each
role's dashboard answers the same question: "what is the one thing to
do next?". When a real flow doesn't exist yet, the surface says
**preparing**, never **active**.

## 8. Live Monitor / Control Room

The vision page surfaces a control-room snapshot today: catalogue
counts, the PR #18 block, the PR #30 production smoke pending state,
non-worker preparing rows, and the honesty invariant that fake
AI / matching / verified claims are never used.

When more activity types ship (`service_offer`, `worker_need`,
`project_need`, `team_offer`), the live monitor extends naturally — a
single status surface where the founder + the worker see what's
running and what's coming. No fake real-time numbers; only what's true
from the catalogue + the user's own data.

## 9. Future: scouting / draft / marketplace

Discovery surfaces — finding the right worker, team, project, or
client — sit as `availability: "hidden"` features today
(`matching`, `marketplace`). They are explicitly out of scope until
they can ship honestly. The honesty guard enforces this from the
catalogue layer: flipping `matching` to `"active"` without an
underlying engine fails CI.

## 10. Future: AI / agent orchestrator

There may eventually be an AI / agent layer underneath the
suggestion + next-action engines. Until that ships, **no UI claims
AI is the source**. The current parser
(`apps/web/lib/structuring/`) is honestly labelled rule-based.

If a real AI extraction step is later added, it ships as a second
parser alongside the rule-based one, gated by an explicit "AI
suggestion" label and never as auto-approval.

## 11. Capability menu — what the OS can do

| Capability | State today | Where it lives |
| --- | --- | --- |
| Profile (text-first) | ✅ active | `/dashboard/profile` |
| Skills (rule-based suggestions) | ✅ active | `/dashboard/profile` |
| Work journal | ✅ active (private only) | `/dashboard/journal` |
| Account roles (worker active) | ✅ active | `/dashboard/account` |
| Vision / OS map | ✅ active | `/[locale]/vision` |
| Role expansion (preparing) | 🟡 preparing | role catalogue |
| External confirmation | 🟡 preparing | blocked on PR #18 |
| Company / agency / customer workspaces | 🟡 preparing | feature catalogue |
| Service / team / worker / project needs + offers | 🟡 preparing | activity catalogue |
| Document records | 🟡 preparing | activity catalogue |
| Matching engine | ⛔ hidden | feature catalogue |
| Marketplace | ⛔ hidden | feature catalogue |
| AI extraction | ⛔ hidden | rule-based only today |
| AI verification | ⛔ hidden | not promised, not shipped |

The `/[locale]/vision` page renders this map from the same catalogues,
so any update to the source automatically refreshes the public
narrative.

## 12. What must be true before the paid pilot

- PR #30 production mobile smoke: PENDING → PASSED (owner action).
- PR #18 migration review: BLOCKED → reviewed + applied to staging +
  signed off (issue #32).
- The vision page (this sprint) is live + readable by external
  pilot participants.
- Owner-led pilot cohort of 3–5 hand-picked workers + 1–2 small
  companies, with a written feedback loop.

## 13. What must be true before full public launch

- External confirmation flow ships (after PR #18) so the journal's
  proof claim is real.
- At least one non-worker workspace flips from preparing → active.
- Live monitor + next-action engine cover more than the worker single
  next-best-step.
- Public-facing honest pricing surface (out of scope for the current
  PR family — billing is explicitly untouched).

## 14. What this product never does

- Claim "AI verified" / "guaranteed match" / "automatic approval" /
  "instant hiring" / "100% trust score" anywhere in user-facing copy.
- Pretend a preparing surface is active.
- Lock a user into the first role they pick.
- Touch billing, payment, deploy, env, secrets, or Supabase project
  settings outside an explicit migration sprint.
- Apply database migrations automatically.

Each of those is enforced by the guard test suite (`apps/web/lib/guards/`)
across the 8+ PRs that built up to this point.

## 15. Owner-review reminder

The vision page + this document set go in front of pilot participants.
Before sharing the URL publicly:

- Confirm the LT + EN copy reads correctly to a non-engineer.
- Confirm the route renders without auth + does not leak any
  user-data path.
- Confirm the control-room status block matches what the catalogues
  say (the rendered page does this automatically — manual eyeball
  check is the second layer of safety).
- Do not publish links externally before PR #30 production smoke is
  PASSED.

## 16. IP / sensitive implementation note

This document and the architecture map describe direction only. They
are explicitly not a legal filing, not a public marketing claim, and
not a binding commitment to ship every layer. Owner review is
required before any externally published version repeats detailed
mechanism descriptions; some implementation details may warrant
owner-led legal review before they appear in public marketing copy.
