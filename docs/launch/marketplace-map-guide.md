# Marketplace & map guide

## The work atlas
The atlas (`lib/work-market/`) is the spine of the market map + marketplace: **28
high-level blocks** (construction, finishing, engineering, electrical, plumbing,
ventilation, roofs, wood, metal, roads, logistics, manufacturing, agriculture,
food, cleaning, hospitality, care, security, tools/rental, transport, local help,
accommodation, brigade capacity, small local services, urgent/action radar, rate
map, opportunity gaps, moderation). Each block has LT/EN labels, subcategories,
related skills, supported actions, identity mapping, and map/document/rate flags.

## The map is signal-only
- A point on the map appears **only** with verified coordinates. There are **no
  fake markers** and no guessed lat/lng — owner-entered location is a *signal*.
- Zoom behaves like a scouting board:
  - **far** → aggregate country/region cards (counts only, never a personal address);
  - **middle** → city/location signal cards;
  - **close** → object "player" cards (worker / demand / team / accommodation /
    offer / project), with detail revealed only when verified and allowed.

## Visibility scaling (honest)
- Under ~1000 active users: everyone sees a full network preview.
- Above that: free users are limited (own country first).
- Paid/verified/business widening is **inert until real billing exists** — no fake
  paid unlock.

## Eligibility on the map
- Workers without documents for a country are **not** shown as "ready abroad";
  they see legal-route options instead. No fake eligibility, no legal guarantee.

## Not active yet
- Marketplace **offer object** + creation/publish + moderation (later PRs).
- Real markers / geocoding (owner-gated path only).
- Rate map populated from real data only ("not enough data yet" otherwise).
