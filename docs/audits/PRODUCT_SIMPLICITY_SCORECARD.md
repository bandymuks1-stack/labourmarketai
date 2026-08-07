# PRODUCT SIMPLICITY SCORECARD

Pinned at `origin/main` `779357aa`. Scale **0** = unclear · **1** = technically
understandable · **2** = mostly clear · **3** = immediately intuitive.

**[m]** = scored against a real browser measurement in this window.
**[s]** = scored from a static read of the route file — lower confidence, and
labelled so it is never mistaken for a measured result.

Dimensions: **IC** immediate clarity · **NV** navigation · **AC** action clarity ·
**VH** visual hierarchy · **AI** AI discoverability · **MB** mobile ·
**ER** error recovery.

| surface | IC | NV | AC | VH | AI | MB | ER | avg | mark |
|---|---|---|---|---|---|---|---|---|---|
| Landing `[s]` | 2 | 2 | 2 | 2 | 1 | 2 | 2 | 1.9 | NEEDS_POLISH |
| Login / signup `[m]` | 3 | 2 | 3 | 3 | 1 | 2 | 2 | 2.3 | **PILOT_BLOCKER** — not for clarity but for the GET credential leak (P0-1) |
| Onboarding `[s]` | 2 | 1 | 2 | 2 | 1 | 2 | 2 | 1.7 | NEEDS_POLISH |
| **Personal dashboard `[m]`** | 2 | **0** | 2 | 1 | 3 | 1 | 2 | **1.6** | **PILOT_BLOCKER** |
| **Organization dashboard `[m]`** | 1 | **0** | 2 | 2 | 3 | 1 | 2 | **1.6** | **PILOT_BLOCKER** |
| **Profile `[m]`** | 1 | 2 | 1 | **0** | 1 | **0** | 2 | **1.0** | **PILOT_BLOCKER** |
| Demand / company workspace `[m]` | 1 | 1 | 1 | **0** | 1 | **0** | 2 | **0.9** | **PILOT_BLOCKER** |
| Candidate selection `[s]` | 2 | 1 | 2 | 2 | 2 | 1 | 2 | 1.7 | NEEDS_POLISH |
| Booking `[s]` | 2 | 1 | 2 | 2 | 2 | 1 | 2 | 1.7 | NEEDS_POLISH |
| Project `[m]` | 2 | 1 | 1 | 1 | 1 | 1 | 2 | 1.3 | NEEDS_POLISH |
| Calendar `[m]` | 2 | 1 | 1 | 2 | 1 | 2 | 2 | 1.6 | NEEDS_POLISH |
| Experiences `[s]` | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2.0 | NEEDS_POLISH |
| Notifications `[s]` | 2 | 2 | 2 | 2 | 1 | 2 | 2 | 1.9 | NEEDS_POLISH |
| Billing `[s]` | 2 | 1 | 2 | 2 | 1 | 2 | 2 | 1.7 | NEEDS_POLISH |
| **Admin `[m]`** | 2 | 2 | **1** | 1 | 1 | 1 | 2 | **1.4** | **PILOT_BLOCKER** |
| Map (workspace) `[m]` | 1 | **0** | 1 | 1 | 2 | 1 | 2 | 1.1 | **PILOT_BLOCKER** |
| Map (`/dashboard/market-map`) `[m]` | 2 | 1 | 2 | 1 | 1 | 2 | 2 | 1.6 | NEEDS_POLISH |

**PASS: 0 of 17.**

## Why each PILOT_BLOCKER scores as it does

**Personal dashboard — NV 0.** The page contains **zero `<a>` elements**. Four
core destinations are computed by `getCoreNavItems()` and passed into the header,
which renders none of them. VH 1: the readiness card owns 38 % of the fold while
the conversation starts at 63 %. MB 1: the composer moves 195 px downward ~3 s
after interactivity.

**Organization dashboard — IC 1, NV 0.** Same zero-link finding. The `<h1>` is
"Labas, Dev. Kuo šiandien galiu padėti?" on an organisation workspace; the org
name appears only in a 162 px header chip, and no creating action names the
organisation it will affect.

**Profile — VH 0, MB 0.** 6104 px at 1440 and **8823 px (10.9 folds) at 375**,
19 card blocks, 14 `<h2>`, six competing readiness summaries totalling ≈1350 px
before the first editable field. 34 unlabelled inputs, 73 sub-44 px targets.

**Company workspace — VH 0, MB 0.** 7028 px at 1440, **10419 px (12.8 folds) at
375**, 16 `<h2>` covering the entire employer domain on one scroll: identity,
agencies, readiness, operations, teams, employees, locations, gallery, members,
public profile, worker search, submitted needs, support requests, candidate
search.

**Admin — AC 1.** On company verification the zero-count line renders
"Nėra užklausų, laukiančių patvirtinimo" **above six organisations with live
approve/reject controls**. Three buttons carry no stated consequence and the
note field has no label (36 unlabelled inputs on that page). On the operations
home six KPI tiles are documented dead ends.

**Workspace map — NV 0, IC 1.** 319×272 px, invisible entirely for the worker
identity, no expand control, no link to it from the home. Detail and slice plan
in `MAP_STRATEGIC_PRODUCT_MODEL.md`.

## The one question

> Can an ordinary human understand and operate labourmarket.ai without knowing
> how its code or internal architecture works?

**Not yet, and the largest single reason is navigation.** The functionality is
overwhelmingly present and honest — the surfaces refuse to fake data, count
unmapped rows out loud, and label unverified claims. What is missing is that a
person standing on the product's own home page cannot see that a calendar, a
message inbox, a map or a network exists. A feature that works and cannot be
found is not complete.
