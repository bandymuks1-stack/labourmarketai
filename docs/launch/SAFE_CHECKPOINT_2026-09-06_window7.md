# SAFE_CHECKPOINT — 2026-09-06 window 7 (CONVERSATION P0 + SUPPLY DIRECTION)

> Durable hand-off for the NEXT MASTER. Recover from this file +
> `SAFE_CHECKPOINT_2026-09-06_window6.md` + git / PR / CI / production.
> Do NOT restart architecture, design, billing, Stripe or repository audits.
> Do NOT redo PROD_PROVEN work. No secrets here.
>
> Window 7 opened as a broad execution brief (real users, agency supply,
> education, documents, legal). Mid-window the owner raised a **P0 hotfix**
> from a real production observation and ranked it **before** agency bulk
> import and LEGAL_PACK_LT. This window is therefore that P0, plus the
> supply-direction correction it shares a root cause with — both closed,
> deployed and proven on production.

## 0. Coordinates (verified at write time)

| Item | Value |
|---|---|
| `main` at start | `87534974` (window 6 close); production served `87534974` |
| Merged this window | #1586 conversation goal state · #1587 supply direction · #1589 raw message keys + walk |
| Opened, owner-gated | **#1588** worker board excludes supply (RED, draft, `needs-human-gate`) |
| Applied to production | **nothing** — no migration was applied this window |
| Production proof | `walk-conversation-goal-prod.cjs` — **15 / 15 PASS** on `da076681`, re-run **15 / 15 PASS** on `c7e7510f` (copy fix); read-only, journal count 1 → 1 |
| Real users | REAL_RECRUITER_USED_PRODUCT = FALSE (unchanged). REAL_LEARNER_COHORT = 0 (unchanged) |

## 1. The owner's P0 — what was actually wrong

Observed on production:

```
person : "Ieškau darbo pagal savo CV"
system : offers the CV upload
person : "tu jau turi mano duomenis"
system : offers the CV upload again
```

The defect was **not two Lithuanian phrases**. `handleSend` classified every
sentence from scratch. Measured on the real router before the fix:

| sentence | routed | consequence |
|---|---|---|
| `Ieškau darbo pagal savo CV` | `find-work` (4) | goal correct — the CV is a **source**, not the destination |
| `tu jau turi mano duomenis` | `unknown` (0) | generic fallback + the same three starter chips, CV among them |
| `rodyk tik nuo 3000 eurų` | `unknown` (0) | constraint lost |
| `Gali būti ir Nyderlanduose.` | `find-work` (1) | flips an employer's live hiring goal into a personal job search |

Four structural causes, all now closed:

1. **No goal memory** — nothing carried the destination between turns.
2. **No constraint accumulation** — `runFindWork(text)` read World State from
   the current sentence only.
3. **No turn classification** — a continuation was indistinguishable from a
   new command.
4. **No anti-loop** — nothing recorded that an offer had just been refused, and
   `personStarters` read **no** person-side facts at all (three fixed chips for
   everybody, CV among them).

## 2. What shipped

### #1586 — the conversation remembers the goal

One new PURE module, `lib/conversation/conversation-goal.ts`.

- **Active goal**: goal-bearing intents only; ages out after 8 turns; displaced
  only by an **asserted** new goal (`NEW_GOAL_MIN_SCORE = 2` — a router score
  of 1 is one matched word).
- **Turn kind**: `new-goal` / `follow-up` / `correction` / `use-known-state` /
  `confirmation` / `rejection` / `unrelated`, as general conversational moves
  in LT/EN/RU/NL/DE. Nothing names a CV, an uploader or any action.
- **Constraints accumulate** on the canonical `DiscoveryFilterState`, wired at
  the seam `runFindWork` had reserved as "W6 EXTENSION POINT (persistent
  filters)". The product decision it waited on — *when do filters clear?* — is
  made: they hold for one goal, a later mention of a dimension replaces it, an
  asserted new goal starts clean.
- **Anti-loop** in `assistant()`, the ONE place chips reach the thread, keyed on
  the **action id** — it covers every offer the product makes, not CVs.
- **Known-state-first**: `personStarters` now reads skills / work history /
  journal entries (bounded head counts under the caller's own RLS; `null` stays
  *unknown*, never a fabricated zero).
- **Honest readback** from canonical state: `true` promises the profile, `false`
  admits there is nothing in it yet, `null` claims neither.
- Telemetry gains `resolution: "goal"`.

Order in `handleSend` is now **router → goal → LLM proposer**. Execution is
unchanged: a continuation re-enters the SAME handler the goal's intent already
had. No new intent, no second chat, no schema change, no migration, and the AI
egress grant is untouched (deliberately — widening the proposer's admitted
fields stays owner-gated; the goal layer is deterministic).

29 multi-turn journey tests walk owner §9 A/B/C/F/G against the real router.

### #1587 — the market has two sides

Same root cause, the other direction. Measured before the fix — **none** of the
owner's supply examples reached a supply signal:

| sentence | routed as |
|---|---|
| `Turime 20 suvirintojų ir ieškome jiems darbo Nyderlanduose.` | `find-work` — an agency with 20 welders read as **one person job hunting** |
| `Ieškome darbo savo darbuotojams` | `need-workers` — **inverted** |
| `We have workers and we are looking for employers` | `need-workers` — inverted |
| `Galime pasiūlyti 15 statybininkų` | `log-work` |
| 4 of 12 | `unknown` |

**No new model.** The canonical object already existed and is already written by
the agency's own dashboard form: `customer_requests` with `kind='agency_offer'`,
which `companyCreateDemandSchema` has always accepted as `intent: "partner"`.
Only the **door** was missing. `supplyOfferFormSpec()` is the same action id,
fields, schema, confirmation token, dispatcher and executor — only the labels
and the stamped intent differ.

The discriminator is sentence **shape**: HAS people (a count or a people-word)
AND offered to the market. Either half alone stays put — 10 negative controls.

### #1589 — two raw translation keys, found only in production

`typecheck`, `lint`, `build` and 14k guards were all green while production
rendered `conversation.chat.knownState.usingProfile` and
`Pagal workspace.ai.dimension.salary filtruoti dar negaliu.` to a real person.
next-intl resolves a missing key **to itself**; nothing throws.

- (1) the known-state copy was written under `workspace.ai` while the handler
  reads `conversation.chat` — both namespaces exist, both valid. **Moved.**
- (2) the four `UNSUPPORTED_DIMENSIONS` labels **never existed**, so the honesty
  line "I can't filter by {dimension} yet" had *always* leaked — invisible until
  #1586 made the sentence reachable. This is the older and worse defect: an
  honesty line that renders a raw key looks broken exactly where the product is
  being careful.

Guard `conversation-message-keys.test.ts` (111 assertions) asserts both paths in
every locale, drives the dimension list off the source constant, refuses a
leftover copy in the wrong namespace, and rejects a value that is itself a
dotted key path.

## 3. Production proof — `walk-conversation-goal-prod.cjs`

The first conversation walk in this repo that types a whole journey into **ONE
session without reloading**. Every existing walk reloads between sentences
precisely so answers cannot contaminate each other — a method that **cannot see
a multi-turn defect at all**, because the defect *is* the second turn.

Read-only: no form submitted, no writing chip tapped, worker journal count
asserted unchanged (1 → 1). **15 / 15 PASS on `da076681`, and again on
`c7e7510f` after the copy fix.**

The first run is what FOUND the raw keys of #1589 — every check passed while
two raw keys were on screen, because no check asserted the copy. The re-run on
`c7e7510f` is the one that proves the sentences:

* A2 → **"Gerai — įkelti nieko nereikia. Ieškau pagal tai, kas jau yra tavo
  profilyje."**
* A4 → **"Pagal atlygį filtruoti dar negaliu."** (the honesty line, in the
  accusative the template needs)

| turn | sentence | result |
|---|---|---|
| A1 | `Ieškau darbo pagal savo CV` | searched the board; **no uploader** |
| A2 | `tu jau turi mano duomenis` | **no uploader, no CV chip, no fallback** |
| A3 | `gerai, tada ieškok visoje Europoje` | same goal |
| A4 | `rodyk tik nuo 3000 eurų` | same goal + the honest pay line |
| D1 | `Turime 20 suvirintojų, kuriems ieškome darbo.` | the **offer** form — role `Suvirintojas`, count `20`; not a job search, not a hiring need |
| D2 | `Nuo spalio.` | direction unchanged |
| D3 | `Nyderlanduose arba Belgijoje.` | location `Nyderlandai` added to the **same** offer |

Log + screenshots: `docs/launch/pilot-feedback/walks-2026-09-06/walk-conversation-goal*`.

## 4. Open, owner-gated

### #1588 — the worker board still serves agency SUPPLY as open jobs (RED)

Measured on production 2026-09-06:

| kind | submitted + verified company | role is null |
|---|---|---|
| `company_request` | 7 | 6 |
| `agency_offer` | **2** | 2 |

`list_open_demand_for_workers()` has **no `kind` filter**, so 2 of the 9 rows
every worker sees (22%) are agency partnership OFFERS rendered as open jobs —
titled "Agency partnership — offer", with no role, country or headcount. A
worker can express interest in them.

It cannot be fixed above the database: the function's closed column whitelist
does not return `kind`.

The change is ONE predicate, strictly narrowing, with the live body otherwise
byte-identical. Rollback restores the current body verbatim.

> **Owner sentence: "Apply worker board excludes supply 2026-09-06"**
> Then the agent re-probes the board read (expect 7 rows, no `agency_offer`).

## 5. Recorded, NOT changed — pricing (owner §14)

`countActiveOpenNeeds` (`lib/billing/open-needs-gate.ts`) counts
`customer_requests` of **every kind**. An agency's supply offers therefore
consume the same *"active needs"* quota the €99 plan sells for employer demand:
an agency bringing 200 workers and zero employer-side needs would still hit the
ceiling of 10.

Not biting yet — `ctx.enforced` is false while billing is disabled — but it
becomes real the moment billing is enforced. Per §14 pricing was **not** changed
in this window. **This is a pricing decision for the owner**, and it is the
concrete form of the structural gap §14 asked to be recorded: "active needs"
prices the demand side and does not price capacity at all.

## 6. Autonomous work remaining (safe, not started)

- The supply lane's **read** side: an agency's `agency_offer` rows have no
  surface that shows them back as capacity, and no employer-facing discovery.
  #1587 opened the door; the loop (supply → matched demand → contact) is not
  closed.
- `list_open_demand_for_agencies` / `mark_agency_can_offer`: the S5 draft RPC
  `list_open_demand_for_agencies` **does not exist in production** (verified) —
  the agency's "see open demand" path degrades to the honest needs-gate.
- Owner §9 agency **bulk worker intake** (XLSX/CSV/CV → draft → normalize →
  reconcile → preview → commit → rollback): NOT started. Current capability is
  XLSX timesheets + CV PDF/DOCX suggestions; no batch id, no file hash, no
  rollback (window 6 §3 item 16 still stands).
- **LEGAL_PACK_LT**: NOT started.
- Owner §12 document/evidence lifecycle inventory: NOT started.
- `landing.cta.partner = "Noriu tapti partneriu"` — owner §6 names this as a
  problematic construct (partnership is a relationship, not a permanent
  identity). Untouched this window.
- The LLM proposer is still **stateless per turn** (sentence + locale +
  identity). Handing it the active goal would widen the
  `propose_conversation_intent` egress policy's admitted fields — owner-gated,
  deliberately not done.
- `personStarters` reads three facts; pins and frequency-of-use remain the
  recorded extension point.

## 7. Owner batch — carried forward from window 6, plus this window

Unchanged and still open from `SAFE_CHECKPOINT_2026-09-06_window6.md` §7:
#1572 jobs count v2 · #1573 `/jobs` waiver · #1566 notification grant · #1577
professions seed · Stripe `checkout.session.expired` + stale endpoint · G-14
verify `E2E Walker UAB` · `INVITE_EMAIL_*` · billing reconcile · the §8
decisions · G-12 / G-1 / G-15 / Vercel plan.

**New this window:**

1. **Apply #1588** (RED) — sentence: *"Apply worker board excludes supply
   2026-09-06"*.
2. **Pricing decision** — should agency supply offers count against the
   employer "active needs" quota? (§5 above.) Today they do.

## 8. Traps learned this window

- **A missing next-intl key renders as the raw key and NOTHING fails.** Green
  typecheck/lint/build/guards while production showed two raw keys to a user.
  Verify the namespace the calling `useTranslations(...)` actually uses, and add
  the key to every shipped locale.
- **A walk that reloads between sentences cannot see a multi-turn defect.** The
  existing walk method was designed to prevent contamination and therefore
  designed out the whole defect class.
- **Pattern sources must be diacritic-FOLDED**, like the router's own `p()`.
  `fold` decomposes `й` → `и`, so a literal `используй` matched nothing.
- **JavaScript `\b` is ASCII-only** — no word boundary before Cyrillic, so every
  `\b`-anchored RU pattern silently never fires.
- **The subject of the verb is load-bearing** in supply patterns: `galim`
  without a closing boundary also matches "galim**ybes**"; a bare `can` matches
  "**can you** offer me…".
- Source-anchored guards (`llm-proposal`, `w6-followup-doors`,
  `first-sentences`, `phone-sheet-yields-to-chips`) break on any rename in
  `conversation-chat.tsx` — update them to the new shape, keeping the invariant.
- `opportunity-type-internship.test.ts` fails **locally on `main`** (CRLF
  artifact) — verified by checkout, not mine.
