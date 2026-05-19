# Product direction

labourmarket.ai is not a job board. It is a connected, visual market where
people, companies, roles and matching are one fabric.

## The one principle that shapes everything

Every user has exactly **one** profile. That profile is projected into **one**
reusable player card. The card is a derived view-model — never a second store,
never edited on its own. The same card appears in:

- the profile surface
- discover (the draft floor)
- matching
- worker search
- company needs
- future team and map views

If a feature needs to show a person or a company, it renders the canonical
card. It never invents a new one.

## Canonical owners (one home per concern)

| Concern | Single owner |
| --- | --- |
| Identity / profile | `/app/profile` |
| Company identity | `/app/company` |
| Open roles | `/app/hiring-needs` |
| Fit / ranking | `/app/matches` (`src/lib/matching.ts`) |
| Conversations | `/app/communication` |
| Operations | `/admin` |

The `/app` overview is a snapshot only — it never owns data.

## Where this is going

This foundation establishes the skeleton and the visual language. Subsequent
slices wire profile editing, authentication, real persistence and live
matching onto this exact structure — without adding parallel flows, a second
profile area, a separate avatar surface, or a separate conversation surface.

## Non-goals (by design)

- No payments.
- No fake AI capability claims — matching is transparent and deterministic.
- No demo data treated as real data.
- No gatekeeping queues; onboarding and matching are automated and self-serve.
- No generic SaaS card-wall — the visual system is premium and cinematic.
