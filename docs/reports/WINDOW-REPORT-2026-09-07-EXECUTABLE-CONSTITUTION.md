# Window report — the product constitution becomes executable

**Date:** 2026-09-07 · **Branch:** `feat/cc/executable-product-constitution`
**Base:** `main` @ `813f1b6e` · **Class:** GREEN (no migration, no schema, no
production write)

---

## The question this window had to answer

> *If a completely new coding agent entered this repository with no access to
> the owner's chat history, what prevents it from accidentally narrowing
> LabourMarket.ai or disconnecting existing product and data?*

Before this window the honest answer was: **nothing but documentation, and
documentation does not fail CI.** The 2026-09-07 reconciliation had just
measured what that costs — capabilities built, tested, merged and unreachable by
any human; sixteen migrations documented as unapplied that were applied; a code
comment claiming zero AI runs while production held 47. None of it crashed. None
of it failed a single one of 803 guard files, because every one of those guards
asserts something a person had already thought to assert.

The answer now is four registers, three guards and one command, and it is
specific enough to write down:

| a new agent tries to… | what stops it |
|---|---|
| delete a capability | its id is in both halves of the register; dropping either fails `quality.yml` |
| leave a capability unwired | reachability from a route or component is computed from the import graph, not asserted by hand |
| claim a capability works | evidence never outruns status; `HUMAN_UI_PROVEN` cannot be reached by a green suite |
| empty a graph node | a node with no live capability needs a dated `unrealized`/`narrowedOn` record |
| mark a broken chain green | a journey link may not be greener than the capability under it |
| collapse a semantic distinction | the vocabulary carrying it must stay in its anchor module |
| remove the bootstrap itself | `agent-bootstrap.test.ts` fails |

Everything those checks **cannot** prove is written down in Product
Constitution §17, not implied.

---

## 1. PRODUCT CONSTITUTION STATUS — **BUILT AND USABLE**

`docs/PRODUCT_CONSTITUTION.md` gained §14 (the canonical graph, identity ≠ role,
freedom + reality constraints), §15 (the eight separations), §16 (the six
journey contracts) and §17 (honest limits). Nothing was invented: §14–§16 are
the owner's window-10 text, and §17 exists because claiming machine enforcement
we do not have would itself be the SEP-7 failure.

No competing document was created. The existing constitution, `AGENTS.md`,
`docs/ARCHITECTURE.md` and `docs/CAPABILITY_INVENTORY.md` were extended in
place; `lib/product-gate/` gained four files beside the seven already there.

## 2. MACHINE-ENFORCEMENT STATUS — **BUILT AND USABLE** · `TEST_PROVEN`

| file | what it holds |
|---|---|
| `lib/product-gate/capability-register.ts` | 105 capabilities, status + evidence + anchors + core module + surfaces |
| `lib/product-gate/product-graph.ts` | 24 nodes, the flywheel, the value chain, 11 forbidden reductions |
| `lib/product-gate/journey-register.ts` | 6 permanent chains, 40 links, each honest about its state |
| `lib/product-gate/semantic-separations.ts` | 8 distinctions, each with the incident that made it a rule |
| `lib/guards/capability-register.test.ts` | 17 checks |
| `lib/guards/product-graph-journeys.test.ts` | 17 checks |
| `lib/guards/agent-bootstrap.test.ts` | 6 checks |
| `.github/scripts/product-truth.mjs` | the bootstrap briefing + `--check` in `quality.yml` |

**The reachability check is the load-bearing one.** It builds the real import
graph (`@/` and relative specifiers, `.ts`/`.tsx`/`index` resolution), walks it
from every route and component, and compares what it finds with what the
register claims. It is not a list of links somebody remembered.

**Negative controls, both run:**

1. Flipping `EVID-3` to `BUILT_NOT_CONNECTED` while it is wired →
   *"is recorded as disconnected, and `work-verification-state.ts` IS reachable"*.
2. Repointing its single real consumer (`lib/journal/verifier-read.ts`) at
   another module — reproducing the exact 2026-09-06 defect →
   *"claims status PARTIAL, and `work-verification-state.ts` is reachable from
   no route or component."*

The guard catches the defect that motivated it. Both edits were reverted.

**The register corrected me twice while I wrote it.** I recorded `DEM-6` (team
matching) and `MKT-1` (service offerings) as `BUILT_NOT_CONNECTED` from the
reconciliation's prose; the reachability check proved both are reachable in the
import graph. `MKT-1`'s truth is narrower and more interesting than either
label: reachable in code, unreachable in the product, because no navigation
leads to it and a human gets there only by typing the URL.

**That last sentence was itself false, and #1604 corrected it** — seven surfaces
link to `/dashboard/service-requests`. It is left standing here, with this note,
because it is the clearest thing in this report: a claim written confidently,
from prose, about reachability nothing could check. The navigation guard added
in #1604 is what catches that class now. See the continuation below.

## 3. AGENT BOOTSTRAP STATUS — **BUILT AND USABLE** · `TEST_PROVEN`

`node .github/scripts/product-truth.mjs` — no network, no database, no
credentials. Named as the FIRST COMMAND in `CLAUDE.md` and `AGENTS.md`, as step
0 of `docs/ARCHITECTURE.md` §7, and guarded against removal.

It prints what the product is, the eleven reductions it must never become, the
eight separations, the capability counts, the six journeys with every broken
link, and the ten open owner decisions.

## 4. CAPABILITY GRAPH STATUS — **BUILT AND USABLE**

24 nodes, all mapped to a real world element, all realized by capabilities that
exist. Two nodes are honestly declared:

- **TEAMS/BRIGADES** — thin, not empty. Teams are `organizations` rows with
  `organization_type='team'`; production holds zero. No team→project FK exists
  anywhere. Team matching is reachable only from an admin route.
- **FUTURE DEMAND** — `unrealized` since 2026-09-07. Nothing forecasts.
  `GEO-4` (market intelligence) was deliberately *removed* from this node while
  writing it: an observation is not a forecast (SEP-1), and counting it would
  have made an empty node look half-alive.

`platform` and `communication` capabilities are deliberately not nodes: the
platform is machinery, and chat is a surface **over** the graph, not part of it.

## 5. PERMANENT JOURNEY STATUS — **BUILT AND USABLE** (the contracts) · the chains themselves are mostly not

**22 links live · 18 broken or unbuilt.** That ratio is the point of the
section. Per journey:

| journey | live | broken | unbuilt |
|---|---:|---:|---:|
| `J-WORKER-EVIDENCE` | 6 | 0 | 1 |
| `J-COMPANY-EXECUTION` | 7 | 2 | 1 |
| `J-AGENCY-SUPPLY` | 3 | 2 | 1 |
| `J-INSTITUTION-OUTCOME` | 2 | 2 | 3 |
| `J-IMPORT-HISTORY` | 1 | 0 | 3 |
| `J-TIME-FREEDOM` | 3 | 0 | 4 |

`J-WORKER-EVIDENCE` is the product's strongest chain and it is complete up to
recognition. `J-IMPORT-HISTORY` and `J-TIME-FREEDOM` are mostly contract.

## 6. DATA-PRESERVATION STATUS — **PARTIAL**, unchanged by this window

Nothing here touches data. The rules that protect it are recorded (SEP-7, SEP-8,
ARCHITECTURE §9 no destructive cleanup, the migration discipline), and the
enforcement gap is unchanged and now written into `GOV-1`: **the parity gate
checks applied → repo; nothing checks repo → applied.** Nine migration files
have never been applied and four sit behind live UI. One owner secret
(`SUPABASE_DB_URL`) arms two inert gates.

## 7. HUMAN-FREEDOM / TIME-CONSTRAINT STATUS — **PARTIAL**, honestly

The owner's chain is DETECT → EXPLAIN → WARN → ALTERNATIVES → DECIDE →
OVERRIDE → AUDIT → ACTUAL → LEARN.

The product has **DETECT → WARN**. `J-TIME-FREEDOM` records the other five as
`NOT_BUILT` with reasons. `WRK-5` carries no overlap constraint of any kind, and
SEP-2 now states in the repository that adding one is a product decision for the
human gate, not schema hygiene — with the contractor and hairdresser cases
written down so the next person understands why.

## 8. HISTORICAL IMPORT STATUS — **BLOCKED**, unchanged

`EVID-1`. The engine, schema, both transports and the commit gate are written
and sit in the open RED PR #1600, unapplied, on branch
`claude/company-historical-work-import-agatsq`. **Nothing is on `main` and
nothing is in production.** `J-IMPORT-HISTORY` records four `NOT_BUILT` links
because of it. Only `PER-4` (a person importing their own CV, fact by fact) is
live.

## 9. EVIDENCE → COMPETENCY STATUS — **BUILT AND USABLE** up to recognition, **MISSING** after it

`SKL-2` (deterministic recognition, no AI required) is `HUMAN_UI_PROVEN`.
`SKL-9` (RPL / equivalence) does not exist at any layer, and SEP-6 states the
load-bearing rule from both sides: demonstrated capability never silently
satisfies a formal requirement, and it never becomes invisible either.

## 10. SUPPLY → DEMAND → MATCH STATUS — **PARTIAL**, with two known breaks

`DEM-1` and `DEM-3` are human-proven. `DEM-2` (the direction rule) is fixed on
two boards and still leaks on others. `DEM-9` (an employer discovering declared
agency capacity) is `BLOCKED`: proven in a production transaction under three
real users' auth and rolled back, migration unapplied. Until it is applied, an
employer cannot discover organizational supply at all.

## 11. COMPANY / AGENCY / WORKER / INSTITUTION STATUS

| actor | status | strongest evidence |
|---|---|---|
| worker | **BUILT AND USABLE** — the evidence chain is the product's best | `HUMAN_UI_PROVEN` |
| company | **PARTIAL** — execution works; capacity and external supply are broken | `HUMAN_UI_PROVEN` for execution |
| agency | **PARTIAL** — supply can be declared, and largely not discovered | `HUMAN_UI_PROVEN` for declaration |
| institution | **ARCHITECTURE ONLY** in practice — 1 programme, 1 cohort, **0 members** | `PRODUCTION_PERSISTENCE_PROVEN` for the objects, nothing for the journey |

The institution vertical is not release-ready and this report does not say
otherwise.

## 12. PLANNING / CAPACITY / LEARNING STATUS — **PARTIAL / MISSING**

`CAL-1` projects eight sources; ten further dated stores never reach it.
`CAL-2` is disconnected — everything exists and the page never calls
`getPlanning()`. `CAL-4` read one signal (approved absences: **0 rows**) while
ignoring the bookings and assignments that exist; the three-state fix is in the
unapplied PR. `CAL-7`, `CAL-8`, `CAL-9` and `CAL-10` are `MISSING`. **No
learning loop exists**, and `CAL-10` is now a permanent register row so that
absence stays visible rather than being rediscovered.

## 13. HUMAN UI WALK DEFECTS — **none received during this window**

The owner is walking the UI in parallel. Nothing arrived while this work ran, so
nothing is claimed as fixed and nothing is claimed as clear. When defects
arrive, the register and journey ids give them a place to be classified rather
than a list to be appended to.

## 14. REMAINING HUMAN GATES — 10, none resolvable by an agent

| id | decision |
|---|---|
| `EVID-1` | approve `20260907114500_organization_evidence_import_v1`, or return it |
| `DEM-9` | approve `20260907153000_employer_supply_discovery_v1`, or return it |
| `EVID-2` | block self-confirmation in `review_journal_entry`, or keep the weaker classification |
| `PER-11` | apply a split `external_profiles_v1`, or retire the profile section |
| `ORG-2` | migrate the seven `company_type='staffing_agency'` gates to `organization_roles`, or keep the industry lock |
| `SKL-6` | PR #1355 canonical ESCO linkage |
| `MKT-7` | two independent owner acts arm real charging |
| `GOV-1` | `SUPABASE_DB_URL` — one read-only secret arms two inert CI gates |
| `GOV-3` | authenticated E2E fixture strategy, or accept the suite as local-only |
| `GOV-8` | email OTP expiry ≤ 3600 s · leaked-password protection |

The last two are Supabase Auth settings the repository cannot set. **No approval
was assumed, faked or implied anywhere in this window.**

## 15. REMAINING P0 LAUNCH GAPS

1. `CAL-4` — "who is free?" is wrong for every worker (fix written, unapplied).
2. `DEM-9` — employers cannot discover organizational supply (fix written,
   unapplied).
3. `DEM-2` — surfaces still read an agency's offer as its need.
4. `EVID-2` — self-confirmation counted as confirmation on the write side.
5. `EDU-2` — the institution journey has never had a single cohort member.

Items 1, 2 and 4 are owner-gated. Item 3 is executable now. Item 5 needs one
real bounded journey, not more architecture.

## 16. FULL GRAPH RECONCILIATION — 105 capabilities

| status | count | meaning |
|---|---:|---|
| `BUILT_AND_USABLE` | 29 | a human can reach it and it does its job |
| `PARTIAL` | 50 | works for some actors, inputs, languages or directions |
| `BUILT_NOT_CONNECTED` | 11 | it exists and no product path leads to it |
| `BLOCKED` | 5 | built, and an owner decision or credential stops it |
| `ARCHITECTURE_ONLY` | 2 | recorded, deliberately not built |
| `MISSING` | 8 | not implemented at any layer, kept so it cannot be forgotten |

**Human-UI-proven: 18 of 105.** Everything else rests on weaker evidence than a
person using it.

---

## Checks

| check | result |
|---|---|
| `pnpm -F web typecheck` | ✅ exit 0 |
| `pnpm -F web lint` | ✅ **0 errors**, 39 pre-existing warnings |
| `pnpm -F web build` | ✅ |
| full unit suite | **1,215 files · 20,415 tests · 20,408 passed · 2 skipped** |
| the three new guards | ✅ 40 checks |
| `product-truth.mjs --check` | ✅ 105 capabilities · 24 nodes · 6 journeys |
| `migration-safety` | n/a — this window ships no migration |

Two unit tests time out under full-suite load (`lib/cv/extract.test.ts`,
`lib/cv/extract-hardening.test.ts` — DOCX/zip extraction at the 5 s default) and
**both pass in isolation**. That is the recorded local worker-cap flake class,
not a regression from this window; nothing here touches CV extraction.

**An existing ratchet caught my own new file, and it was right.**
`planning-single-projection.test.ts` failed on the first full run because two
capability notes contained the literal identifier `getPlanning()` inside string
literals — the guard blanks comments, not strings, so it read the register as a
new undeclared reader of the projection. The notes now say "the one planning
projection" instead. Exactly the behaviour this window is arguing for: a
convention that fails a build beats a convention everybody honours.

---

# Continuation — what the register did once it existed

The sections above describe PR #1601, the governance layer. This window did not
stop there. Three further slices followed, and **every one of them was found by
the layer itself.**

| PR | what it did |
|---|---|
| [#1601](https://github.com/bandymuks1-stack/labourmarketai/pull/1601) | the executable constitution — 4 registers, 3 guards, 1 command |
| [#1602](https://github.com/bandymuks1-stack/labourmarketai/pull/1602) | four more surfaces stop reading an agency's offer as its need |
| [#1603](https://github.com/bandymuks1-stack/labourmarketai/pull/1603) | a person's reply to what was written about them finally has a reader |
| [#1604](https://github.com/bandymuks1-stack/labourmarketai/pull/1604) | the register carried two false reachability claims, and now it can catch them |

## #1602 — DEM-2, the market-direction leak (P0 item 3, closed as far as code can)

Four own-rows surfaces read `customer_requests` without ever selecting `kind`,
so all four rendered an agency's **offer** as its **need**: the market map
(which mapped an agency's own supply to an `actionable: true` need on the shared
map), the org demand rollup, the scouting list, and the chat starter's
open-needs count.

The second failure mode was worse: two modules carried their own **string copy**
of the demand allow-list. Adding a kind to the rule would have updated the rule,
updated every caller deriving from it, and silently not those two. A guard now
bans the literal outside the module that owns it.

Not fixed, and not fixable here: `list_open_demand_for_workers` returns no
`kind`, so the worker board has nothing to classify. `DEM-2` stays **PARTIAL**
with the owner-gated migration named.

## #1603 — EVID-6, a right of reply nobody could see

`experience_responses` shipped with a table, a select policy, a SECURITY
DEFINER RPC, a form component and a mounted form — and **no reader**. A person
could answer an account written about them and the reply was visible to nobody,
including its own author.

Found while building it, and mitigated: the v1 select policy compares an
unqualified `moderation_status` inside a subquery over `experience_records`, so
Postgres resolves it to the RECORD's status — the policy hands the experience's
author a reply that is still submitted, in moderation, or **rejected**. The
surface now withholds it; correcting the policy is a schema change and is
recorded as an owner decision.

`EVID-6` drops to `TEST_PROVEN`, because no human has walked it.

## #1604 — the register caught itself, three times

Imported is not reachable, and reachable is not visible. The layer checked the
first and nothing checked the second, so two of its own rows were wrong:
`MKT-1` claimed `/dashboard/service-requests` had no navigation (seven surfaces
link to it) and `CAL-2` claimed the employer page never reads the planning
projection (it does). A **navigation reachability** check now exists, and found
a third on its first run: `ORG-7` named a route with no inbound link at all.

`BUILT_NOT_CONNECTED` now has to say HOW — `no_importer`, `no_navigation`,
`orphan_route`, `no_writer`, `inert_bridge` — because "nothing leads to it" is
several claims checked in different ways, and one that does not say which cannot
be falsified. That is the SEP-8 collapse happening inside the file that defines
SEP-8.

The bootstrap's parser was also caught twice returning **fewer rows without
failing** — once on a CRLF checkout, once when a field appeared between two
anchors. It now reads row by row and asserts it read every row.

## Capability truth at the end of the window

| status | start | end |
|---|---:|---:|
| `BUILT_AND_USABLE` | 29 | 29 |
| `PARTIAL` | 50 | 51 |
| `BUILT_NOT_CONNECTED` | 11 | 10 |
| `BLOCKED` | 5 | 5 |
| `ARCHITECTURE_ONLY` | 2 | 2 |
| `MISSING` | 8 | 8 |

The movement is small and it is *real*: `CAL-2` moved because it was
misclassified, and `MKT-1` and `ORG-7` are now described correctly. **No
capability's evidence level was raised by this window.** `EVID-6` was lowered.

## The question, answered again at the end

> *If a completely new coding agent entered this repository with no access to
> the owner's chat history, what prevents it from accidentally narrowing
> LabourMarket.ai or disconnecting existing product and data?*

Four registers it must keep in sync with a document, three guards it cannot
satisfy by hoping, one command it is told to run first, and a CI step that fails
when the two halves of the product's own definition disagree.

The strongest evidence that this is not decoration: **in the four hours after it
shipped, it found three false claims in itself and one real defect class in the
product, and every one of them had been sitting in a green repository.**

## What this window did NOT do

- It applied no migration and made no production write.
- It resolved no owner decision.
- It raised no capability's evidence level. The 18 `HUMAN_UI_PROVEN` rows are
  the ones already walked in earlier windows; this window walked nothing and
  claims nothing.
- It did not fix `DEM-2`, `CAL-2`, `EDU-2` or any other open gap. It made them
  countable, named and hard to forget — which is a different thing, and saying
  so plainly is the point.
