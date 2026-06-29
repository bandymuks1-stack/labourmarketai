# Design / Product Control Formula — v1

> Canonical, binding product logic for labourmarket.ai UI/Product work. Locks ONE
> project logic so profile, Player Card, CV, work signals, location, market map and
> AI-shortlisted actions stay one system — not unrelated modules. If a UI change
> does not strengthen the chain in §8, it should not be done.
>
> This file is **doctrine for design/product decisions**; it changes no code, DB,
> RLS, RPC, auth, or routes. Implementation follows the gated PR sequence in the
> source audit (`runtime/audits/design-control-formula-source-audit-v1.md`).

## 1. Owner product formula

```
REAL IDENTITY
+ PROVEN WORK SIGNALS
+ LOCATION / AVAILABILITY
+ DEMAND / SUPPLY
+ AI SHORTLIST OF MAXIMUM 3 BEST ACTIONS
= WORKING LABOUR MARKET CONTROL SYSTEM
```

labourmarket.ai is **not** a job board, **not** a list of 1000 companies/workers,
**not** a pretty demo dashboard. It helps a person or company understand: who they
are in the system, what the system already knows, what is missing, which 1–3
actions are best now, and what happens after they act.

## 2. Non-negotiable rules

1. **One clean project** — only `C:\Users\Mano\Documents\labourmarketai`. No legacy
   project as source logic.
2. **One system, not random modules** — person identity → Player Card → CV + skills
   + records + journal + location + proof → company workspace → market map → max 3
   best choices. Do not split these into unrelated UI systems.
3. **Maximum 3 best choices** — never a noisy default list. Each recommendation card
   answers: *what is this · why shown to me · what matches · what's missing/risky ·
   what can I do now*.
4. **Every visible action works** — no dead icons, decorative no-op buttons, fake-
   tappable cards, or completion items that don't open the exact missing field. If
   it can't work yet: remove it, disable it with honest copy, or replace it with a
   working action.
5. **No fake/demo/placeholder UX** — no fake users/jobs/companies/proof/counters/
   statuses, no "demo" labels, no "later" disclaimers in production UX.
6. **No duplicate logic** — inspect source first; never a 2nd profile-completion, CV,
   Player Card, or map-signal model; fix the existing user path instead of adding a
   route.

## 3. Every-screen formula

Every screen must answer:

```
1. WHO AM I HERE?
2. WHAT DOES THE SYSTEM KNOW ABOUT ME?
3. WHAT IS MISSING?
4. WHAT ARE THE BEST 1–3 ACTIONS NOW?
5. WHAT HAPPENS WHEN I CLICK/TAP?
```

Pattern: `Identity context → Known signals → Missing signals → Best 1–3 actions →
Clear result after action`. If a screen does not answer these, it is not ready.

## 4. Player Card formula (fast identity)

```
PLAYER CARD = avatar/initials + name + role/specialization + skills + work signals
            + location/preferred locations + availability + proof/records
            + missing data + fit/readiness status
```

ONE identity model, three sizes — **Mini** (map marker / compact list), **Standard**
(dashboard / profile), **Full** (CV / recruiter view). Reused across profile,
dashboard compact identity, CV header, work-record identity, map marker, company/
recruiter view, and service/request cards. Landing, profile, CV, map and dashboard
must not look like different products.

## 5. CV formula (full professional document)

```
CV = sendable professional document + Player Card identity header + work experience
   + skills + languages + mobility/location + work records + proof where available
```

Player Card = fast identity. CV = full document a person can actually show an
employer/client.

## 6. Market map formula

```
MARKET MAP = current access-location signal + preferred locations + company/project
           location + demand/supply signal + visibility rights + AI top 1–3 options
```

Not a noisy marker dump. Every marker/card has: clear **type** (person/company/
project/demand/preferred location), clear **status**, clear **reason shown**, clear
**action after tap**. Default prioritizes top 1–3, not unlimited results.

## 7. Matching explanation formula

Never only a percentage. Explain in human terms:

```
Good fit because: skills match · location/region matches · recent work signal ·
                  availability clear · proof/records support the profile.
Missing/risk:     CV not uploaded · availability missing · location not confirmed ·
                  proof not attached.
Action:           view card · complete missing field · send request · save/contact.
```

Product-thinking weighting only (no algorithm change without an approved PR): skills
35 · location 20 · availability 15 · proof/trust 15 · language/work-type 10 ·
activity 5.

## 8. Visual direction

`Premium sports/scouting energy + Player Card identity + AI control-room clarity +
compact mobile-first cards + clear action hierarchy.` Public area may be cinematic
(premium, confident, no fake claims). Authenticated area must be mobile-first,
compact, card-based, consistent, action-driven — not decorative chaos.

## 9. Agent workflow & stop conditions

Source-grounded audit **before** code. No broad redesign, no new dashboard, no
parallel profile/CV/Player Card surface — fix one real user path at a time. Each
UI/Product PR states: problem · user path · existing files used · files changed ·
files NOT touched · before/after behavior · mobile proof · LT/EN/RU copy proof ·
smoke proof.

**Stop and report (do not implement) if a task needs:** DB migration · RLS/RPC
change · auth change · new route architecture · new matching algorithm · paid
visibility/business rule · external provider/API key · legacy migration · large
redesign outside the selected path.

## 10. Final rule

```
If a change does not strengthen this chain, do not do it:
person/company → real identity → Player Card / CV / signals → location & availability
→ market need → maximum 3 best options → clear action
```
