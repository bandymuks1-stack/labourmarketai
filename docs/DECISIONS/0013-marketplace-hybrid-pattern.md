# ADR 0013 — Marketplace hybrid pattern (Booking + Tinder + Profile sections)

**Status:** Accepted · **Milestones:** shells M1 · search M2 · discovery M3 · **Vision:** PROJECT_VISION.md §8, §11, §12

## Context
The platform serves four very different intents on the same data layer:
hiring (companies search a verified pool), placement (agencies broker
candidates), being found (workers expose verified profiles), and
ordering services (customers pick a provider). A single UI pattern would
serve any one of these well and the other three badly.

## Decision
The dashboard is a **hybrid**, three-pattern marketplace:

1. **Profile sections** — every authenticated user has three canonical
   sections on their Overview tab: "What I offer", "What I seek",
   "My proofs". These are the canonical surface of who the user is on
   the platform; the other patterns are entry points into these.
2. **Booking-style search** (M2) — primary pattern for B2B intent
   (`company`, `agency`): filterable, ranked lists with explainable
   matches.
3. **Tinder-style discovery** (M3) — primary pattern for B2C intent
   (`customer`) and exploratory worker self-discovery: a swipe/skip
   feed of provider cards.

| Role     | Default tab | Primary pattern              |
| -------- | ----------- | ---------------------------- |
| worker   | Overview    | Profile sections + alerts    |
| company  | Search      | Booking-style ranked lists   |
| agency   | Search      | Booking-style + manage pool  |
| customer | Discover    | Tinder-style provider swipe  |

## Consequences
- M1 (slice 6) ships the **shells only** — Overview's 3 sections per
  role, plus empty Discover and Search tabs marked with honest
  placeholders pointing at M2/M3.
- M2 builds Booking search on top of the same data model.
- M3 builds Discovery on top of the same data model, scoped to the
  Customer role first.
- No data is duplicated across patterns; they are three views of the
  same `workers`/`companies`/`agencies` rows joined with
  `profile_roles.role_data` and (M2+) `skill_verifications`/
  `work_journals`.
