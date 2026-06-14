# AI Recommendation Disclaimer

> The public + internal boundary for the AI layer. Grounded in the Internal LLM
> Agents v1 doctrine (`docs/ai/INTERNAL_LLM_AGENTS_V1.md`,
> `docs/PLATFORM_DOCTRINE.md` §7/§7.1).

## 1. What the AI layer is

A **helper layer** that turns chaotic information into structure: it drafts
profiles and vacancies, suggests candidate skills, explains fit, surfaces missing
items, and cites evidence. Every output is a **suggestion** a human reviews.

## 2. What the AI layer is NOT

AI is **never** a legal, document, employment, verification, payment, or
final-decision authority. It does **not**: verify skills, documents, identity or
legality; produce a legal guarantee; publish a profile or vacancy without human
review; invent pay, experience, clients or matches; confirm a booking; take
payment; or promise work or earnings.

## 3. Current runtime state

The AI provider is **off by default** and runs honestly as "not enabled yet" until
an owner-provided key is set in server env. No live AI calls are made without it.

## 4. Public wording

Where AI is shown, it is labelled "AI suggestion — review before saving — not
verified". Public copy never claims the AI verifies, decides, or guarantees
anything. See [`public-trust-positioning.md`](./public-trust-positioning.md).
