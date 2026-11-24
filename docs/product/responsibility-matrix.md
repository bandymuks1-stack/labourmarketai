# Responsibility Matrix

> Who is responsible for what. **The platform structures information and signals;
> it does not, by itself, guarantee facts, legality, quality, payment, or safety.**
> Parties: **P** = Labourmarket.ai platform · **O** = operating company (separate,
> contract-only) · **E** = employer/client · **W** = worker · **A** = agency/supply
> partner/subcontractor · **AI** = AI helper layer. Future services are marked
> *(future)*. Companion: [`platform-vs-operating-company-responsibility.md`](./platform-vs-operating-company-responsibility.md).

| Area | Primary responsibility | Platform's role |
|---|---|---|
| Profile information | W | structures + displays; does not verify truth |
| CV / work profile | W (AI drafts) | structures; AI drafts, never asserts as fact |
| Document-readiness signals | W / A (declared) | computes a *signal* from declared data; never confirms a document is genuine |
| AI drafts | AI (suggestion) | runs the helper layer; output is a suggestion, never a record |
| Company needs | E / A | structures + normalizes; never invents pay |
| Partner reputation | A (earned) | records history honestly; never fabricates |
| Worker-provided information | W | displays; truth is the worker's responsibility |
| Contractual obligations | E ↔ W / A (↔ O if contracted) | not a party by default |
| Document authenticity | W / A / E (issuer) | **never guaranteed by the platform** |
| Work safety | E (site) | not a party; surfaces readiness signals only |
| Accommodation | E / A | structures the need/offer; not a provider by default |
| Travel / transport | E / A / W | structures the fit; not a provider by default |
| Payments | E ↔ W / A | **no live payments**; not a payment authority |
| Work quality | E / W / A | **not guaranteed** by the platform |
| Disputes | parties | not an arbiter by default |
| Mediation *(future)* | O / future service | documented as future scope, not active |
| Work / project review *(future)* | O / future service | documented as future scope, not active |

**Reading rule:** the platform's column never says "guarantees" or "verifies" for
authenticity, legality, quality, payment, or safety. It structures, signals, and
records — humans, issuers, and contracts own the truth.
