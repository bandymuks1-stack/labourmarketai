# PROPOSAL — PLATFORM_DOCTRINE §13 (Monetization) DRAFT

> **Status:** PROPOSAL ONLY. The doctrine file is binding and is NOT modified
> here — per its own footer, amendments require DI's explicit approval and a
> changelog row. This draft exists because `PHASE3_first_customer_plan.md`
> (slice 3.4) cites "PLATFORM_DOCTRINE §13" for pricing principles, but the
> doctrine currently has no §13 (sections jump 10 → 15). Conflict C4 of
> `docs/product/labourmarketai-full-product-overview-and-implementation-plan.md`.
>
> **Owner action:** approve / edit / reject. On approval, copy the section
> below into `docs/PLATFORM_DOCTRINE.md` as §13 and add a §9 changelog row.

---

## Proposed §13 — Monetization & sustainability

> **§13 Monetization & sustainability (binding).**
>
> **§13.1 Primary model.** The platform's primary revenue model is a
> **marketplace fee** on real, completed engagements. Revenue follows real
> value delivered — never attention harvesting.
>
> **§13.2 Permitted secondary models.** Paid listings, priority placement
> (honestly labelled as such — never disguised as merit), document /
> verification services, and subscription plans (the existing `plans` /
> `subscriptions` tables) MAY be introduced — each requires explicit owner
> approval before activation.
>
> **§13.3 Forbidden.** Banner advertising is forbidden until the platform
> exceeds 100,000 active users, and even then requires an owner decision.
> Selling user data is forbidden permanently. Pay-to-win trust (buying a
> better trust signal, rating, or "verified" mark) is forbidden permanently —
> trust signals are earned through the proof spine only (§3, §15).
>
> **§13.4 Honesty in pricing surfaces.** Public pricing copy claims only what
> is purchasable today. Until owner-approved pricing exists, the only
> permitted public framing is "early access pricing available on request" /
> "custom quote" — no fixed public prices, no fake plan activation states
> (complements the no-fake-paid-state guard). The word "demo" stays banned
> (§18); free access for a founding customer is a real arrangement decided by
> the owner, not a product tier.
>
> **§13.5 Mission boundary.** Sustainability, not extraction: pricing must
> never gate the worker's own data, the worker's own evidence trail, or the
> ability of the smaller party to defend themselves (§1). Charging the demand
> side (companies, agencies) before the supply side (workers) is the default
> posture.
>
> **§13.6 Activation gate.** Any payment, checkout, billing, or subscription
> ACTIVATION is owner-gated (hard blocker class) — never enabled by an agent
> autonomously, regardless of tier.

---

*Drafted 2026-06-10 (S1 / feat/cc/phase3-matching-workbench) from: VISION §13
sales framing, PHASE3 slice 3.4 constraints (marketplace fee primary; paid
listings/verification possible; banner ads forbidden until 100K users;
mission-sustainability not loss), doctrine §1/§3/§15/§18, and the autonomy
envelope's pricing defaults (manual_quote / contact_sales).*
