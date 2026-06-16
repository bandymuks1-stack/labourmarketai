# Labourmarket.ai — Launch Docs (before Stripe)

Practical guide for launching to the first real users (people + companies)
**before** payments are connected. Live billing is **disabled/inert** this stage;
first users are onboarded manually / via owner-review.

## Read in this order
1. [user-flows.md](./user-flows.md) — how each person/company moves through the product.
2. [worker-guide.md](./worker-guide.md) — a person: sign in → profile → journal → opportunities.
3. [company-guide.md](./company-guide.md) — a company: space → needs → team/projects.
4. [marketplace-map-guide.md](./marketplace-map-guide.md) — the work atlas + signal-only map.
5. [communication-guide.md](./communication-guide.md) — inbox + project chat.
6. [admin-operator-guide.md](./admin-operator-guide.md) — owner/admin review, fail-closed.
7. [payment-logic-before-stripe.md](./payment-logic-before-stripe.md) — plans/entitlements, all inert.
8. [stripe-next-sprint-handoff.md](./stripe-next-sprint-handoff.md) — what the Stripe sprint must do.
9. [known-limits.md](./known-limits.md) — what is manual / not automated yet.
10. [first-users-checklist.md](./first-users-checklist.md) — owner checklist before inviting people.

## Core model (do not regress)
- Two base identities: **Asmuo** (person) and **Įmonė** (company). Admin is admin-only.
- **Agency** is a company activity type, **buyer** is an action — never top-level identities.
- A person can: work, buy, sell (if model allows), rent, seek help, look for work.
- A company can: hire, buy, sell, rent, raise a need, manage team/brigade/projects.
- Map is **signal-only**: a marker appears only with verified coordinates. No fake markers.
- Recognition, readiness and evidence are **signals**, never guarantees.

## Payments status (honest)
- Payments are **not active**. No checkout, no live billing, no paid unlocks.
- UI says: "Mokėjimai ruošiami" / "Stripe bus prijungtas kitame etape" /
  "Kol kas pirmi vartotojai jungiami rankiniu / owner-review būdu" /
  "Mokama prieiga dar neaktyvi".

Active locales: **LT / EN / RU**.
