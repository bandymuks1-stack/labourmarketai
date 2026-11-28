# Paid tiers proposal: FREE, START, BUSINESS, PREMIUM, ENTERPRISE

**Status: APPROVED by the owner on 2026-11-24 as the TARGET commercial structure** (FREE, START €95,
BUSINESS €495, PREMIUM €995, ENTERPRISE by contract). **No payment is activated for a function that does not
work yet.** A plan, or a feature in a plan, is charged for only after it passes the sale gate in §4. Owner
conditions of 2026-11-24: a larger cost reserve on PREMIUM, and every paid tier tied to functions that really
work and to costs that are capped.

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
| **AI actions a month** | 20 | 300 | 2,000 | 4,000 | by contract |
| **Integrations** (MCP connector, export, later: calendar, webhooks) | — | 1 | 5 | 20 | by contract |
| **Automations** (rules that act on their own) | — | planned: 5 | planned: 50 | planned: 250 | by contract |
| **File storage** | 1 GB (new organizations) | 5 GB | 50 GB | 150 GB | by contract |
| **Search, matching, messaging, offers, bookings, work journal** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Reports and export** | basic | ✓ | ✓ + several sites | ✓ + several clients | ✓ |
| **Agency tools** (supply workers to clients, client view) | — | — | ✓ | ✓ | ✓ |
| **Support** | help pages | e-mail, up to 30 min a month | 2.5 h a month incl. onboarding | 3 h a month, priority, named contact | SLA by contract |

Everything that is free today stays free: registration, a worker's profile and Living CV, and posting a
basic need. No function that is free today moves to a paid plan, and FREE gets no new limit on users, people
or projects: an organization keeps what it can do today. The only new FREE allowance is AI (20 actions a month),
which FREE does not have at all today.

**What happens at a limit:** the action that would pass it is refused with a plain message and a link to the
next plan. Nothing is charged automatically and nothing already recorded is hidden or deleted.

## 2. Plan cards (customer copy for the target structure)

These are the cards for the approved target. On the live page a card shows only what has passed the sale
gate (§4); anything else is marked "coming" or left out. Until the AI quota exists, for example, START is
sold without AI and its card says AI is coming.

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
- 2,000 AI actions a month, 5 integrations
- 2.5 hours of support a month, onboarding included

### PREMIUM: €995 a month
*For large companies and agencies that use the platform every day.*
- 100 users, 1,000 projects, up to 2,000 people
- 4,000 AI actions a month, 20 integrations
- 150 GB of files
- Priority support, 3 hours a month, a named contact

### ENTERPRISE: price on request
*For large scale and your own terms.*
- Limits, support and data terms set in a contract

### Lithuanian copy (LT)

| Planas | Kaina | Kam | Svarbiausia |
|---|---|---|---|
| FREE | 0 € | Išbandyti platformą | 1 aktyvus poreikis, paieška, žinutės, projektai, darbo žurnalas, 20 AI veiksmų per mėnesį |
| START | 95 € / mėn. | Mažoms įmonėms | Neribotas aktyvių poreikių skaičius, 5 naudotojai, 10 projektų, iki 50 žmonių, 300 AI veiksmų |
| BUSINESS | 495 € / mėn. | Augančioms įmonėms ir agentūroms | 25 naudotojai, 100 projektų, iki 500 žmonių, agentūros įrankiai, 2 000 AI veiksmų, 2,5 val. pagalbos |
| PREMIUM | 995 € / mėn. | Didelėms įmonėms ir agentūroms | 100 naudotojų, 1 000 projektų, iki 2 000 žmonių, 4 000 AI veiksmų, 150 GB failų, prioritetinė pagalba 3 val. |
| ENTERPRISE | Individuali | Didelio masto naudojimui | Sąlygos pagal sutartį |

Kainos be PVM. Kortelėse rodoma tik tai, kas jau veikia ir praėjo pardavimo vartus (§4); kita rodoma kaip
„netrukus“ arba nerodoma.

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
- **Cost reserve (owner 2026-11-24):** a contingency reserve is added on top of the direct cost before the 3×
  check: **25 % on PREMIUM**, 10 % on START and BUSINESS. With the reserve, every paid plan still clears 3×
  in the intensive month; PREMIUM clears it with the widest margin. To make room for the reserve, PREMIUM's
  AI allowance is 4,000 (not 6,000), its storage 150 GB (not 200) and its support 3 h (not 5), and
  BUSINESS's support is 2.5 h (not 3).
- **Free users** (workers, free organizations) are counted in the business model as a cost carried by the
  paying plans; the private model gives the cost per free worker and per free organization.

## 4. Sale gate: each feature tied to working software and a capped cost

**Rule (owner 2026-11-24): no payment for a function that does not work yet.** A feature may appear on a paid
card, and a plan may be put on sale, only when all three hold:

1. **It works:** it exists in the product and has been walked end to end in production.
2. **Its limit is enforced on the server**, so a plan cannot use more than it pays for, and a lower plan
   cannot get a higher plan's capacity for free.
3. **Its cost is capped:** every per-use cost it causes (AI, storage, traffic, e-mail, support time) has a
   ceiling that keeps the plan above 3× its cost including the reserve.

### 4.1 Feature by feature, as of 2026-11-24

| Feature | Works today (where) | Limit enforced per plan | Cost capped | May be sold |
|---|---|---|---|---|
| Registration, profile, Living CV | yes | — (free) | yes (no per-use cost) | free, always |
| Active needs: 1 on FREE, more on paid | yes (`lib/billing/open-needs-gate.ts`) | **yes** (`gateOpenNeeds`) | yes | **yes** |
| Search, matching, contact, messaging | yes | — (all plans) | yes | included in every plan |
| Offers, bookings, projects, work journal | yes | no project cap | yes (database only; too small to measure) | included; the project cap must exist before BUSINESS |
| Reports and CSV export (finance, journal, timesheets, project report, institution report) | yes (`app/[locale]/dashboard/**/export`, `…/report`) | — | yes | included in every paid plan |
| Several sites (work objects) | yes | no | yes | BUSINESS+, after the per-plan caps exist |
| Agency tools (partners, client view, supplying workers) | yes (`dashboard/company/partners`) | **no**: open to every organization | yes | BUSINESS+, **after it is restricted to BUSINESS+** |
| Users in the organization (member invites) | yes (`lib/company/membership-actions.ts`) | **no cap** | yes (negligible) | the cap must exist before BUSINESS / PREMIUM |
| People managed | yes | **no cap** | storage and e-mail grow with it | the cap must exist before BUSINESS / PREMIUM |
| Integrations: MCP connector, exports | yes (`app/api/mcp`) | **no** (every plan) | yes | the cap must exist before it is listed as a plan difference |
| Integrations: calendar feed, webhooks | **no** | — | — | **not sold** until built |
| Automations (rules that act on their own) | **no** (only built-in approval workflows) | — | — | **not sold** until built; shown as "planned" |
| AI actions | built, **switched off** (owner order 2026-10-27) | **no monthly quota**, no input-size limit | **no** | **not sold** until the quota, the size limit and the owner's switch-on exist |
| File storage | yes | **no allowance** | not capped (small today) | the allowance must exist before PREMIUM |
| Included support hours, priority, named contact | process, not software | policy | yes (hours are the cap) | yes, once the support process is written down |

### 4.2 What each plan can be sold as, and when

| Plan | Can go on sale when | Sold first as (honest version) | Added when built |
|---|---|---|---|
| **START €95** | the owner's existing activation steps are done: Stripe price in TEST then LIVE, legal and tax checks (§5) | more than one active need, all included features, reports and export, e-mail support. **AI shown as "coming", not charged** | the AI quota; the caps on users, people and projects (which also protect the plans above) |
| **BUSINESS €495** | START's caps exist (otherwise START already gives BUSINESS capacity) **and** agency tools are restricted to BUSINESS+ | everything in START plus agency tools, several sites, 25 users, 500 people, 100 projects, 2.5 h support | AI 2,000; integrations cap; automations |
| **PREMIUM €995** | everything for BUSINESS **and** the storage allowance **and** the written priority-support process | everything in BUSINESS plus 100 users, 2,000 people, 1,000 projects, 150 GB, priority support 3 h with a named contact | AI 4,000; integrations 20; automations |
| **ENTERPRISE** | a signed contract | by contract | — |

**Build order** (each item its own PR, with a test and a production walk): (1) the caps on users, people and
projects; (2) agency tools restricted to BUSINESS+; (3) the storage allowance; (4) the monthly AI quota with
an input-size limit and model weighting, then the owner's decision to switch paid AI on; (5) the
integrations counter; (6) automations, as a new function.

## 5. Decisions

**Decided by the owner on 2026-11-24:**

- The target structure and prices: FREE €0, START €95, BUSINESS €495, PREMIUM €995, ENTERPRISE by contract.
- No payment for a function that does not work yet (the sale gate in §4).
- A larger cost reserve on PREMIUM, and every tier tied to working functions and capped costs. Applied in §1,
  §3 and §4.

**Still open for the owner:**

1. **€95 vs the approved €99:** the approved plan is €99, and one organization holds a pilot pass. Moving
   to €95 is a price change. It applies to new buyers only; nobody's current terms change automatically.
2. The build order in §4.2, starting with the caps on users, people and projects.
3. Switching paid AI on (the order of 2026-10-27 keeps it off), once the AI quota and size limit exist.
4. Stripe prices: TEST first; LIVE only after the legal, tax and technical approvals that are already
   required, and only for a plan that has passed the sale gate.

Not part of this structure: an AI pack, yearly prices, and agency-only plans. They can follow once there is
usage data.
