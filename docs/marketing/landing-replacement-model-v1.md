# Landing replacement model v1 — honest claims that still sell

Status: PROPOSAL ONLY (quality-train PR K, 2026-07-06). **No landing or
public marketing file is edited by this PR.** Implementation happens only
after the owner approves the model (audit PR2 stays on hold until then).

## The problem being replaced (audit R4, verified today)

| # | Fake claim today | Where |
|---|---|---|
| C1–C4 | Animated counters 318K→323K workers / 1,180→1,262 demands / 84→129 matches / 71% completion (10px "illustrative" caption) | landing hero, `content/placeholders.ts` cycles |
| M1 | ~90 map hover tooltips with staged per-country counts ("NL · 47w · 12p") | landing Europe map |
| D1–D2 | "Warehouse operations – Rotterdam · 8 roles · 47 ranked matches · HOT" + sample company "88 gold" | `/for-companies` |
| A1 | "Agency pool · 86 workers · 31 active" + trade breakdown | `/for-agencies` |
| P1 | "Dar nepradėjome veiklos…" ("We haven't started operating") | `/pricing` FAQ — the single most launch-undermining sentence |
| J1–J5 | Internal leaks: "(M5)", "PR2 pending", "ChiefOperator", "owner production smoke is PASSED", DB-layer jargon | legal/billing/vision/start copy |

## The replacement principle

Sales power comes from three honest sources, not from staged numbers:

1. **Capability claims** — what the shipped product REALLY does today
   (every item below is live and guard-tested): hash-chained work
   journal; skills with evidence tiers (self-declared → journal-supported
   → manager-confirmed, human confirmation only); print-ready verified
   CV + evidence report + journal CSV; opportunities from verified
   companies; scouting → booking lifecycle; permission-gated in-app
   messaging; LT/EN/RU.
2. **Worked examples, visibly labelled** — keep the beautiful demand
   card and agency pool as DESIGN, inside a frame that says "Pavyzdys /
   Worked example" at readable size (≥12px, not a 10px caption).
3. **Real counts only when real** — a number renders ONLY from a named
   DB aggregate AND only while it is > 0. Zero → the claim collapses to
   a capability sentence, never to a fake number.

## Proposed copy blocks (drafts for owner approval)

### Hero counters → capability strip (C1–C4)

- LT: `Darbo žurnalas → įrodymai → CV. Viskas viename.` /
  `Patikrintos įmonės skelbia poreikius` / `Įgūdžiai su realiais
  įrodymais, ne pažadais` / `Veikia lietuvių, anglų ir rusų kalbomis`
- EN: `Work journal → evidence → CV. One system.` /
  `Verified companies post real demand` / `Skills backed by real
  evidence, not promises` / `Works in Lithuanian, English and Russian`

### Map (M1)

Keep the map visual and country names; remove numeric tooltips. Optional
honest line under it — LT: `Kuriama Europos darbo rinkai — pradedame nuo
Lietuvos.` EN: `Built for the European labour market — starting from
Lithuania.`

### /for-companies demand card (D1–D2)

Keep the card; add a visible frame label — LT: `Pavyzdys, kaip atrodo
paskelbtas poreikis` EN: `A worked example of a posted demand`. Remove
"47 ranked matches · HOT" (a staged matching result) OR relabel the
number as part of the example frame; the company score chip gets
`(pavyzdys)` inline.

### /for-agencies pool (A1)

Same frame — LT: `Pavyzdys: agentūros komandos vaizdas` EN: `Worked
example: the agency pool view`.

### /pricing (P1)

- LT: `Šiuo metu vyksta pilotinė programa — prisijungusios įmonės dirba
  su mumis tiesiogiai, be savitarnos atsiskaitymo. Kainodara bus
  paskelbta, kai ją galėsime garantuoti.`
- EN: `We are in a pilot phase — companies onboard directly with us, no
  self-serve billing yet. Pricing will be published when we can stand
  behind it.`

### Jargon purge (J1–J5)

"(M5)" → removed; "PR2 pending" → LT `Šioje aplinkoje neįjungta` / EN
`Not enabled in this environment`; "ChiefOperator" → generic admin
wording; vision smoke banner → auth-gated or removed; DB-layer jargon →
plain "not ready yet" wording.

## Rules for live counters (when the owner wants numbers back)

1. A public number must map to ONE named SQL aggregate (already sketched
   in `content/placeholders.ts` replacementSource fields).
2. It renders only while the value is > 0; zero/error → capability
   sentence fallback (no "0 workers" and no stale cache).
3. No animation cycles that fabricate motion; a real number may simply
   be a real number.
4. A public-safe RPC (SECURITY DEFINER, aggregate-only, no row data) is
   its own reviewed migration — never a client-side table read.
5. Guard: a new `check-public-numbers` test pinning that every numeric
   token on public pages traces to the RPC or sits inside a labelled
   worked-example frame.

## Owner decision points (smallest form)

1. Approve the model: capability claims + labelled worked examples now;
   real counts later behind the >0 rule — yes/no?
2. Approve/edit the pricing pilot paragraph (P1) — it replaces the
   "haven't started operating" sentence.
3. Keep the demand/pool cards as labelled examples, or drop them until
   real data exists?
4. Approve the jargon purge list (J1–J5) — pure cleanup, no positioning
   change.

After approval: one implementation PR per surface (hero+map, companies,
agencies, pricing, jargon), each keeping `placeholders:check`,
`check-pilot-honesty-copy` and `check-pricing-honesty-copy` green and
LT/EN/RU parity intact.
