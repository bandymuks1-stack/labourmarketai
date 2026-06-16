# Company guide (Įmonė)

You are a **company** (a legal person). You can hire, buy, sell, rent, raise a
need, and manage teams/brigades/projects. "Agency" is an activity type you can
have — not a separate identity.

## 1. Company space
- Switch to **Įmonės erdvė** in the role switcher (or create the company profile).
- Your actions appear as cards: raise a need, hire, buy, sell/offer services,
  manage projects.

## 2. Raise a need
- `/{locale}/dashboard/company` → describe → criteria → review → submit.
- Structured fields (profession, country, accommodation, team size) use dark
  pickers; the demand is saved as a real request (no fake matching).

## 3. Projects as real work objects
- `/{locale}/dashboard/projects` → each project shows a **location signal**
  (city/country; honest "location is text, map point not confirmed yet" — no fake
  marker) and a **communication entry** ("Pokalbis dėl projekto" → real inbox).
- Team members appear when assigned; empty states are honest.

## 4. Team / brigade / projects
- Manage assigned people and project operations. Brigade capacity as a market
  layer is modelled in the atlas and arrives in later PRs.

## What is not active yet
- Payments / paid plans (being prepared — see payment-logic-before-stripe.md).
- A live public marketplace of offers (the atlas model exists; the offer object
  and moderation arrive in later PRs).
