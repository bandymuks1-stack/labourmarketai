# Product Logic + Mobile UX Correction Sprint v1 — Audit & Plan

Branch: `feat/product-logic-mobile-ux-v1` · No DB migration · No production apply · No merge without owner approval.

## What the owner saw (mobile review)
1. Too much text — hard to follow even for the owner.
2. Native mobile select/dropdown feels clumsy, breaks the premium feel.
3. The company-type picker mixes three different conceptual levels
   (agency / subcontractor / client / construction / manufacturing / services).
4. An organisation must not be locked into one permanent type — the same company
   can be contractor on one project, subcontractor on another, client on a third.
5. "Agency" must not be a separate fundamental world — it is an operating mode /
   a role in a given situation.
6. Skill suggestions are too broad and sometimes illogical for the entry text.
7. Missing clear human guidance: what to do now, why it helps, what gets stronger.

## Audit findings (current state)

| Area | Where | State |
|---|---|---|
| Company type | `companies.company_type` TEXT + CHECK (7 values) in migration `20260612090000`; TS union in `lib/company/company-profile-shared.ts`; native `<select>` in `components/app/company-setup-form.tsx`; chip in `app/[locale]/dashboard/company/page.tsx` | One rigid single-select type that **mixes activity areas, an operating model, and project roles** |
| Need form | `app/[locale]/dashboard/company/page.tsx` + `components/app/demand-draft-form.tsx`; saves to `customer_requests.payload` (jsonb) via `save_demand_draft` | **No project/demand-role field.** Accommodation is a native `<select>` |
| Native selects | 15 total; 2–5 option candidates: company_type, accommodation, buyer customer-type/contact-pref, work-card availability, requester role | **No reusable radio-card / segmented / chip component exists** |
| Work Journal copy | `messages/{locale}/journal.json` | Several keys 30–50% longer than needed (`whoCanConfirm`, `reviewClarity.lead`, `skillProvenanceNote`, `clarifyHint`, `benefitNotAuto`, `listEmptyNext`, `freeTextLead`) |
| Skill suggestions | `lib/structuring/extract-journal-suggestions.ts` (`pickSlug`); rendered in `journal-entry-composer.tsx` | Filtered to the worker's own skills but **no ranking / no cap** → short stems (`klijav`, `stali`) surface many of a worker's skills for one short entry |

### Can it be fixed without a DB migration? **Yes.**
- Project/demand role → stored in the existing `customer_requests.payload` jsonb. No migration.
- Company activity → keep the existing `company_type` column; correct it at **copy + UI** level.
- Everything else is UI / copy / pure logic.

## Modelling principle applied
1. **Organisation profile** — one profile, no cage.
2. **Activity area** — what the org *mostly does* (the existing `company_type`, reframed
   as "primary activity", explicitly described as changeable and non-limiting).
3. **Project / demand role** — the org's role *in a specific need* (NEW per-need field:
   client / general contractor / contractor / subcontractor / labour supplier /
   service provider / other). Role depends on the situation, not on a permanent identity.

## Guard constraints honoured (so CI stays green)
- `company-role-simplicity.test.ts` pins `COMPANY_TYPES.map` + the company-type testid +
  all 7 type strings + the country `<select>` + the type chip → kept intact; the canonical
  `company_type` column is **not** removed. Correction is copy + render style.
- `journal-evidence-framing.test.ts` pins `įrodym`/`darbo kortel`/`žmogus`/`vadovas|klient`
  and forbids `automat` → preserved while shortening.
- `suggestion-provenance-honesty.test.ts` forbids AI/match/verified claims in suggestion
  copy → preserved.
- i18n: only `lt/en/ru` are active + parity-enforced; new keys land in those three only.

## Implementation steps
1. `components/ui/OptionCards.tsx` — reusable radio-card group (native radios → works in
   FormData server-action forms and as a controlled input). Replaces clumsy mobile selects.
2. Company setup: company_type + requester_role → OptionCards; reframe copy to
   "primary activity (changeable, not a cage)" + a line stating the per-need role is chosen
   when creating each need.
3. Company need form: add a **project/demand role** field (radio cards, payload jsonb) +
   convert accommodation from native select → radio cards (provided / not provided / unsure).
4. Work Journal / evidence copy: shorten the verbose keys 30–50%, keep meaning + honesty.
5. Skill suggestions: deterministic relevance ranking + cap (pure, tested) + honest
   empty state when nothing clearly matches.
6. Human guidance: tighten the company-need intro (private draft, not an advert, no billing).
7. Tests/guards: new/updated tests for project-role copy, accommodation control, skill
   ranking; existing honesty + matching + route-smoke stay green.
8. `docs/audits/product-logic-mobile-ux/OWNER_REVIEW.html` — before/after, what changed, where to tap on the phone.
9. Validation: typecheck, lint, test, build, primary-route-smoke, migration-safety, i18n.

## Not allowed (re-stated)
No production DB apply, no `db push`, no Supabase MCP apply, no fake data/score/verification,
no billing, no external AI, no RLS/grant/policy change, no big redesign, no merge without owner approval.
