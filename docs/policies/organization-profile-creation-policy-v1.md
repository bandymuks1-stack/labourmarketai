# Organisation profile creation policy — v1

Companion to `account-and-role-model-v1.md`. Defines when an organisation profile (company / agency / buyer) can move from "I clicked the role switcher to test" → "I represent a real legal entity using this product for real".

## Two tiers

### Tier 1 — Pilot exploration (current)

You can switch into any organisation workspace and use it for **private exploration**:

- create drafts (`pilot_drafts`);
- write notes;
- explore the dashboard;
- file feedback;
- read the work-journal docs from the company point of view.

No fields required beyond an active session.

Hard limits:
- No public posting (the product has no public-posting surface in v1).
- No emails / SMS / chats sent outside the product (none of those exist in v1 either).
- No "represented organisation" name appears anywhere shareable.

### Tier 2 — Serious operation (future)

Before the organisation profile can:

- post a real opportunity to real workers;
- enter formal correspondence;
- appear on any worker's view as a "real client";
- trigger any obligation (payment, invoice, contract — none of which exist in v1);

…the organisation must provide **full rekvizitai**:

| Field | Required | Notes |
|---|---|---|
| Country | yes | Drives jurisdiction (LT registration code vs LV/EE/PL equivalents). |
| Organisation legal name | yes | Exact, as in the registry. |
| Registration code | yes if the country requires one | LT: `Įmonės kodas`; LV: `Reģistrācijas numurs`; etc. |
| Correspondence address | yes | The address the organisation receives mail at — not a co-working name. |
| Representative role | yes | Your role in the organisation (director / authorised representative / employee / contractor). |
| VAT id | only if the organisation uses VAT | Optional otherwise. |

The current product **does not yet expose Tier 2** — these fields aren't collected anywhere in the UI. The policy is written now so the data model + UI for Tier 2 can be built deliberately, not as an afterthought.

## Multi-org / multi-country

One personal account can hold multiple organisation profiles. Each is its own row in (future) `organizations` table; each has its own country + rekvizitai. The role switcher will eventually list them; v1 binds one workspace per role to a single org by default.

A future migration will widen `engagement_contexts` so a single worker can be represented by multiple organisations + a single organisation can represent multiple workers — both already supported in the schema; the UI just doesn't expose the lists yet.

## No fake companies

If a user creates an organisation profile they don't represent (e.g. types "Apple Inc" as a joke), the product treats this as a misuse signal once Tier 2 ships. v1 has no Tier 2, so the worst a tester can do is type "Test Company" — which stays private and harmless.

The risk-monitoring policy (`risk-monitoring-and-fraud-response-v1.md`) describes the manual-review-first response when Tier 2 lands.

## What's NOT in this policy (intentionally)

- Pricing or paid-tier requirements. No paid surface exists. Adding paid tiers is a separate policy.
- Legal entity formation help. The product doesn't help you register a company; it expects an already-registered entity.
- Cross-border tax / VAT handling. Out of scope until any monetary surface ships.
- Public verification badges. The doctrine forbids fake "verified" claims; a real verification flow requires either a 3rd-party registry integration or a human review process — both deliberate later decisions.

## See also

- `docs/policies/account-and-role-model-v1.md`
- `docs/policies/risk-monitoring-and-fraud-response-v1.md`
- `docs/audit/organization-profile-creation-gap-audit-v1.md` — what the current code actually supports vs this policy.
