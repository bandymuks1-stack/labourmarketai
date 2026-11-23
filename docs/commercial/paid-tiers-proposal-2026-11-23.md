# Paid tiers proposal: FREE, START, BUSINESS, PREMIUM, ENTERPRISE

**Status: PROPOSAL for owner approval (2026-11-23). Nothing here is live.**
This document changes no price, no plan in the database, no contract and no payment setting. The live
catalogue stays as approved (PERSON €0, ORGANIZATION FREE €0 with 1 active need, ORGANIZATION €99/month).
Stripe stays as it is. Costs, margins and financial projections are delivered to the owner **privately**,
because the repository is public (AGENTS.md: production volumes and commercial facts stay out of it).

Owner brief (2026-11-23): first paid tier €95/month; two higher tiers at a recommended €495 and €995, each
justified by cost and by customer value; price at least 3× the direct cost to serve; free registration and
basic need posting stay free.

## 1. The plans in one table (prices per month, without VAT)

| | FREE | START | BUSINESS | PREMIUM | ENTERPRISE |
|---|---|---|---|---|---|
| **Price** | €0 | **€95** | **€495** | **€995** | by contract |
| **For** | Trying the platform, one need | Small companies | Growing companies and agencies | Large companies, agencies, intensive use | Large scale, own terms |
| **Registration, profile, Living CV for workers** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Active needs (job / work requests) at a time** | 1 | no fixed limit | no fixed limit | no fixed limit | no fixed limit |
| **Users in the organization** | as today (no limit) | 5 | 25 | 100 | by contract |
| **People managed (workers, crew, roster)** | as today (no limit) | 50 | 500 | 2,000 | by contract |
| **Projects** | as today (no limit) | 10 | 100 | 1,000 | by contract |
| **AI actions a month** | 20 | 300 | 2,000 | 6,000 | by contract |
| **Integrations** (MCP connector, export, later: calendar, webhooks) | — | 1 | 5 | 20 | by contract |
| **Automations** (rules that act on their own) | — | 5 | 50 | 250 | by contract |
| **File storage** | 1 GB (new organizations) | 5 GB | 50 GB | 200 GB | by contract |
| **Search, matching, messaging, offers, bookings, work journal** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Reports and export** | basic | ✓ | ✓ + several sites | ✓ + several clients | ✓ |
| **Agency tools** (supply workers to clients, client view) | — | — | ✓ | ✓ | ✓ |
| **Support** | help pages | e-mail, up to 30 min a month | 3 h a month incl. onboarding | 5 h a month, priority, named contact | SLA by contract |

Everything that is free today stays free: registration, a worker's profile and Living CV, and posting a
basic need. No function that is free today moves to a paid plan, and FREE gets no new limit on users, people
or projects: an organization keeps what it can do today. The only new FREE allowance is AI (20 actions a month),
which FREE does not have at all today.

**What happens at a limit:** the action that would pass it is refused with a plain message and a link to the
next plan. Nothing is charged automatically and nothing already recorded is hidden or deleted.

## 2. Plan cards (customer copy, ready to use)

### FREE: €0
*Start without paying.*
- Register your organization and post one need
- Find and contact people, messaging, projects, work journal
- 20 AI actions a month

### START: €95 a month
*For a small company that hires and works with people regularly.*
- As many needs as you need at the same time
- 5 users, 10 projects, up to 50 people
- 300 AI actions a month
- E-mail support

### BUSINESS: €495 a month
*For a growing company or agency with several sites or clients.*
- 25 users, 100 projects, up to 500 people
- Agency tools: supply workers to your clients
- 2,000 AI actions a month, 5 integrations, 50 automations
- 3 hours of support a month, onboarding included

### PREMIUM: €995 a month
*For large companies and agencies that use the platform every day.*
- 100 users, 1,000 projects, up to 2,000 people
- 6,000 AI actions a month, 20 integrations, 250 automations
- 200 GB of files
- Priority support, 5 hours a month, a named contact

### ENTERPRISE: price on request
*For large scale and your own terms.*
- Limits, support and data terms set in a contract

### Lithuanian copy (LT)

| Planas | Kaina | Kam | Svarbiausia |
|---|---|---|---|
| FREE | 0 € | Išbandyti platformą | 1 aktyvus poreikis, paieška, žinutės, projektai, darbo žurnalas, 20 AI veiksmų per mėnesį |
| START | 95 € / mėn. | Mažoms įmonėms | Neribotas aktyvių poreikių skaičius, 5 naudotojai, 10 projektų, iki 50 žmonių, 300 AI veiksmų |
| BUSINESS | 495 € / mėn. | Augančioms įmonėms ir agentūroms | 25 naudotojai, 100 projektų, iki 500 žmonių, agentūros įrankiai, 2 000 AI veiksmų, 3 val. pagalbos |
| PREMIUM | 995 € / mėn. | Didelėms įmonėms ir agentūroms | 100 naudotojų, 1 000 projektų, iki 2 000 žmonių, 6 000 AI veiksmų, prioritetinė pagalba |
| ENTERPRISE | Individuali | Didelio masto naudojimui | Sąlygos pagal sutartį |

Kainos be PVM.

## 3. How the prices and limits were set (method; figures delivered privately)

- **Direct cost to serve** = payment fees + AI + infrastructure share (database, files, traffic, compute) +
  e-mail + support time. Computed per plan for a **typical** month and an **intensive** month, where the
  intensive month uses every limit to the full: all AI actions at the largest allowed size, all included
  support hours, the full storage.
- **The 3× rule:** every paid plan's price is at least 3× its direct cost **in the intensive month**, and
  about 7× in a typical month. The limits in §1 were chosen so that this holds; raising a limit later means
  re-checking it.
- **AI is the cost that can run away**, so it is a monthly quota with a size ceiling per action. Everyday
  actions run on the cheaper model class, and an action that needs a stronger model counts as more than one.
- **Support is an included allowance**, not open-ended, because it is the largest cost at intensive use.
- **Free users** (workers, free organizations) are counted in the business model as a cost carried by the
  paying plans; the private model gives the cost per free worker and per free organization.

## 4. What must be built before each plan is sold

| Needed | FREE | START | BUSINESS | PREMIUM |
|---|---|---|---|---|
| Active-need ceiling (exists: `gateOpenNeeds`) | exists | exists | exists | exists |
| Monthly AI quota and a size limit per action | to build | to build | to build | to build |
| Users per organization | — | to build | to build | to build |
| People managed, projects | — | to build | to build | to build |
| Integrations and automations counters | — | to build | to build | to build |
| File storage allowance | to build (new organizations only) | to build | to build | to build |
| Agency tools as a plan feature | — | — | to build | to build |
| Stripe prices for €95 / €495 / €995 (TEST first) | — | owner | owner | owner |

Each item is its own PR, with a test. Paid AI providers are off by owner order of 2026-10-27; selling an AI
quota needs that order lifted, which is a separate owner decision.

## 5. Decisions for the owner

1. Approve the five plans and the prices: €95, €495, €995, ENTERPRISE by contract.
2. **€95 vs the approved €99:** the approved plan is €99, and one organization holds a pilot pass. Moving to
   €95 is a price change. It applies to new buyers only; nobody's current terms change automatically.
3. Approve the limits in §1, or change them. The private model shows the effect of each change.
4. Approve the build order in §4: AI quota and size limit first.
5. Lift the order keeping paid AI off, at the time the quota exists. Separate decision.
6. Stripe prices: create them in TEST first; LIVE only after the legal, tax and technical approvals that are
   already required.

Not part of this proposal: an AI pack, yearly prices, and agency-only plans. They can follow once there is
usage data.
