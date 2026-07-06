# Landing visual replacement — presentation model v1

Status: **PROPOSAL FOR OWNER REVIEW ONLY** (2026-07-06, baseline
`origin/main` @ e88cd00). **No landing or public marketing file is edited
by this PR — this is a docs-only visual model.** Implementation is HELD
until the owner approves; per repo rules agents must not edit
landing/public marketing pages autonomously, even to remove fake numbers.

Companion to `docs/marketing/landing-replacement-model-v1.md` (#657, the
honest-claims COPY model). That doc answers "what words replace the fake
claims". This doc answers the owner's follow-up instruction: **the
replacement must present the project BETTER visually and must NOT weaken
sales impact** — do not just strip the fake counters; design what
replaces them so the page sells harder with honest material.

Sources verified for this model:

- `docs/marketing/landing-replacement-model-v1.md` (fake-claim inventory
  R4, replacement principle, live-counter rules)
- `docs/launch/launch-readiness-status-board-v1.md` +
  `docs/launch/launch-blocker-burndown-v1.md` (what is REAL today)
- The actual landing code, read-only:
  `apps/web/app/[locale]/(marketing)/page.tsx`,
  `components/app/market-counters.tsx`, `live-map.tsx`, `live-ticker.tsx`,
  `components/marketing/player-card-showcase.tsx`, `draft-board.tsx`,
  `market-pulse.tsx`, `labour-market-evidence.tsx`,
  `content/placeholders.ts`, and the `/for-companies`, `/for-agencies`,
  `/pricing` pages.

---

## 0. What is REAL today (the honest raw material we get to sell with)

Everything below is live on `main` and guard-tested. This is not a
roadmap — it is inventory for the page:

| Real module | What a visitor can be shown honestly |
|---|---|
| Work journal (hash-chained, append-only) | The core differentiator: daily work becomes tamper-evident evidence |
| Skills with evidence tiers | self-declared → journal-supported → manager-confirmed (human confirmation only, never "AI-verified") |
| Verified CV + Evidence Report (print) + journal CSV export | Real, working exports from RLS-scoped data |
| Marketplace + Opportunities | Two entry points into one supply/demand system, converging on conversation → booking → journal |
| Booking lifecycle | No dead ends anywhere: propose, withdraw, accept → message, declined → find another worker |
| Permission-gated in-app messaging + notification spine | Real unread counts, zero fake activity (count-gated: zero ⇒ empty bell) |
| Map | Europe directions map (concept/coverage visual — kept, minus fake numbers) |
| Privacy self-service | Data export LIVE and immediate; deletion-request intake LIVE (#653 merged + applied) |
| Account security section | Real sign-in method data. **MFA is NOT live — must not be shown as live anywhere** |
| Languages | LT / EN / RU full parity |
| Sourced market evidence | `LabourMarketEvidence` module — real public statistics with full provenance (source · figure date · last checked · link). Already honest, already shipped |

The sales thesis of the new page: **this product does not need staged
numbers, because the real product loop is itself the spectacle.** A
hash-chained work journal that becomes a verified CV is more impressive
than a fake counter — if the page SHOWS it instead of claiming it.

## 1. Hero concept (visual, not just copy)

**Concept name: "The living work passport."**

Today's hero right side is a Europe map with ~90 staged tooltips; below
the copy sit four animated fake counters. Replacement:

- **Right side becomes a live product diorama** — a composed, gently
  animated stack of THREE real product surfaces (real screenshots or
  live-rendered components with the owner's own real account data or an
  explicitly framed worked example):
  1. a work-journal entry card (top, slightly rotated, "today" layer),
  2. a skill chip strip showing the three evidence tiers mid-transition
     (journal-supported → manager-confirmed),
  3. the verified CV print preview peeking from behind (the payoff
     layer).
  A thin animated line (same `stage-line` motif as the existing journey
  rail) threads through all three: **entry → evidence → CV**. One loop,
  ~9s, respects `prefers-reduced-motion`. This replaces fake motion
  (counter cycling) with TRUE motion — the product's actual pipeline.
- **The Europe map does not die** — it moves one section down and gets
  smaller (see §7), keeping the international ambition visible without
  carrying the hero alone.
- **Left side keeps** the current strong structure: eyebrow chip,
  two-line display headline with gradient accent (see §8 options),
  subcopy, the four honest signal chips (already real concept labels),
  dual CTA (worker primary / company secondary — unchanged routes
  `/auth/signup` and `/company-need`).
- **Under the CTAs, where MarketCounters lived: the capability strip**
  (§5, replacement for C1–C4) — four compact capability cards with real
  micro-visuals, NOT four numbers.

Feeling target: mission-control energy is kept (dark ink, mono
labels, live-dot accents — all existing design tokens), but the "live
data" feeling now comes from a real pipeline animating, which no
competitor can honestly copy.

## 2. Product visual metaphor

**LabourMarket.ai is the operating system of the labour/service market.**

Visual translation of "OS", used consistently across the page:

- **Modules, not features.** Every showcased capability renders as an
  OS-style module card: mono `[11px]` uppercase label, status dot,
  module name, one real screenshot/live render, one capability sentence.
  The existing `Card` + `card-border` + `live-dot` vocabulary already
  supports this — no new design system needed.
- **One process rail.** The existing journey band (1→2→3→4 stage rail)
  is the OS "process view": journal → evidence → CV → work. It is
  reused, not replaced, and the same rail motif appears in the hero
  diorama — visual continuity landing → cockpit (already an explicit
  design intent in the code comments).
- **Honest status semantics.** Green live-dot = module is live in the
  product today. Framed "Pavyzdys / Worked example" = illustrative
  design. Nothing else exists. This is the visual grammar that lets us
  keep beautiful sample cards WITHOUT lying: the frame is part of the
  design language, at readable size (≥12px), never a 10px caption.

## 3. Main user flows shown on the page

Two entry doors, visually distinct, both above the fold and repeated at
the bottom:

**Worker flow (cyan accent, primary):**
sign up → log work in the journal → skills gain evidence → verified CV +
evidence report → get found via marketplace / apply via opportunities →
booking → messaging. Shown as the hero diorama + journey rail + the
worker path card (existing) upgraded with a real journal screenshot.

**Company flow (blue accent, secondary):**
post a need (`/company-need`) → see evidence-backed profiles (verified
CV, not self-claims) → book → manage via bookings/messages/notifications.
Shown as the employer path card upgraded with a real opportunities/
booking screenshot + the `/for-companies` page keeping its (now framed)
worked-example demand card.

Rationale: worker supply is the engine and the emotional story; company
demand is the revenue door. The current two-path section already encodes
this correctly — it gains real visuals, it does not change routing.

## 4. Live app modules to showcase (the "module wall")

One flagship section (§7, position 5) presents the real product as an
OS module grid. Each cell: module label + real screenshot + one-line
capability claim (from the approved copy model). Eight modules:

1. **Professional / player card** — the real in-app profile card UI
   (this also honours the existing FUT-card visual investment: the real
   component IS the showcase; see §5 row 4).
2. **Work journal** — the evidence source; show a real entry with its
   hash-chain marker. Flagship cell, 2× size.
3. **Skills & evidence tiers** — the three-tier chips exactly as in
   product.
4. **Verified CV + exports** — CV print view + the real
   "Journal CSV" download button; "Excel/Word: preparing" line stays
   honest.
5. **Marketplace + Opportunities** — two entry points, one system
   (bridge hub shipped in #649); split-cell visual.
6. **Map visibility** — the in-app map surface; coverage framing, no
   invented counts.
7. **Bookings · Messages · Notifications** — the coordination spine;
   show the real bell/badge states (count-gated honesty is itself a
   selling point: "if it shows a number, the number is real").
8. **Privacy, security & data export** — the trust module: live JSON
   export, live deletion-request intake, account security section.
   **MFA does not appear** (not live). Copy limited to what ships.

## 5. What replaces the fake elements — one-for-one

| # | Fake element today (verified in code) | Visual replacement (sells harder, honestly) |
|---|---|---|
| C1–C4 | `MarketCounters`: 4 animated counters cycling placeholder values 318K→323K workers / 1,180→1,262 demands / 84→129 matches / 71–73 avg, with fake ▲/▼ deltas and a 10px preview note (`content/placeholders.ts` cycles) | **Capability strip**: 4 compact capability cards, each with a real micro-visual (journal entry chip, evidence-tier chip, CV stamp, verified-company badge) + the approved capability copy ("Work journal → evidence → CV. One system." etc.). Real counts may return LATER only under the >0-from-named-aggregate rule in the copy model — never animated cycles |
| M1 | `LiveMap`: Europe map with staged per-country worker/project/match/company markers + intensity glow + ~90 hover tooltips ("NL · 47w · 12p") | **Directions map, demoted and cleaned**: keep the map visual + country names + tier styling; tooltips show country name + direction tier ONLY (no counts); add the honest line "Built for the European labour market — starting from Lithuania." Moves from hero to position 4 (§7) |
| T1 | `LiveTicker`: 12-item scrolling "live event" marquee fed by `placeholders.ts` (reads as live platform activity) | **Capability ticker**: same beloved marquee motion, but items are the real module/sector capabilities and shipped facts ("Verified CV print — live", "Journal CSV export — live", "LT · EN · RU", sector names). Motion kept, lie removed. Alternative if owner prefers: drop the strip entirely |
| PC1 | `PlayerCardShowcase`: 3 fictional FUT-style profiles (already carries an honesty note) | **Real professional-card module**: render the actual in-app card component with an owner-approved real profile or a ≥12px-framed worked example; folded into the module wall as cell 1. The fictional trio retires |
| DB1 | `DraftBoard`: animated "live matching" pipeline columns (staged matching activity) | **Booking-lifecycle showcase**: the real flow — opportunity → conversation → booking states (proposed / accepted / declined each with its real next action, "no dead ends") — as a stepped visual using real product states. A true system diagram beats fake activity |
| MP1 | `MarketPulse`: 2×2 Bloomberg-style panels (RegionalHeatmap, SkillsDemandList, SupplyDemandChart, RecentMatchesFeed) — staged series | **Promote `LabourMarketEvidence`** (already real, sourced, provenanced) into the pulse slot with the terminal styling: mono provenance rows, claim-type badges, source links. Real Eurostat-class statistics in Bloomberg clothes — more credible than fake sparklines, same visual drama. Fake panels retire |
| D1–D2 | `/for-companies`: "Warehouse operations – Rotterdam · 8 roles · 47 ranked matches · HOT" + sample company "88 gold" | Keep the card design inside a visible ≥12px frame: "Pavyzdys, kaip atrodo paskelbtas poreikis / A worked example of a posted demand"; staged "47 ranked matches · HOT" removed or explicitly inside the example frame; score chip gets "(pavyzdys)" — per the approved copy model, now with the frame treated as a designed visual element (labelled corner tab, dashed border), not an apology |
| A1 | `/for-agencies`: "Agency pool · 86 workers · 31 active" + trade breakdown | Same designed worked-example frame: "Pavyzdys: agentūros komandos vaizdas / Worked example: the agency pool view" |
| P1 | `/pricing` FAQ: "Dar nepradėjome veiklos…" ("we haven't started operating") | The pilot-phase paragraph from the copy model, presented as a **pilot-program card** (visual upgrade: bordered card with a "Pilot" chip, direct-contact CTA) instead of a buried FAQ line — turns the weakest sentence into an exclusivity signal |
| J1–J5 | Internal jargon leaks: "(M5)", "PR2 pending", "ChiefOperator", vision smoke banner, DB-layer wording | Purged per the copy model. No visual replacement needed — deletion IS the improvement |

Net honesty effect: zero fabricated numbers anywhere on the public site;
every number is either a real sourced statistic (evidence module), a
real DB aggregate rendered only while >0 (future, owner-gated rule), or
lives inside a clearly designed worked-example frame.

## 6. Screenshots / visual cards needed (real screens only)

All screenshots must show REAL product states (real account or honest
empty state) — the same non-negotiable rule as the store pack. This list
deliberately overlaps `docs/mobile/mobile-store-assets-owner-pack-v1.md`
§4 so ONE capture session feeds both the landing and the Play listing:

| # | Screen | Route | Used by |
|---|---|---|---|
| 1 | Work journal (entry + composer) | `/{locale}/dashboard/journal` | Hero diorama layer 1, module wall cell 2, store shot 2 |
| 2 | Skills section with evidence tiers | `/{locale}/dashboard/profile` | Hero diorama layer 2, module wall cell 3, store shot 3 |
| 3 | Verified CV print view | `/{locale}/cv` or `/{locale}/dashboard/cv` | Hero diorama layer 3, module wall cell 4, store shot 4 |
| 4 | Opportunities list | `/{locale}/dashboard/opportunities` | Module wall cell 5, company path card, store shot 5 |
| 5 | Dashboard home (bottom nav, real modules) | `/{locale}/dashboard` | Module wall backdrop, store shot 1 |
| 6 | Bookings or inbox (real states) | `/{locale}/dashboard/bookings` / `/{locale}/dashboard/inbox` | Booking-lifecycle showcase, module wall cell 7, store shot 6 |
| 7 | Privacy page (export + deletion-request form, both live) | `/{locale}/dashboard/privacy` | Module wall cell 8 (landing-only) |
| 8 | In-app professional/player card | profile card surface | Module wall cell 1 (landing-only) |

Production notes: capture at 390 px (mobile) and 1440 px (desktop) per
locale actually displayed (landing can ship LT+EN first); dark-theme
product chrome on the ink background needs a 1px `border-ink-500` +
subtle glow so screens read as objects, not floating rectangles. No
device frames required; no text overlays in v1. If any screen shows
personal data, use the owner's account or a consented demo account —
never invented names presented as real users.

## 7. Section-by-section layout (top → bottom, with visual weight)

Visual weight: ▓ = flagship (full-bleed, large type, motion), ▒ =
standard section, ░ = quiet strip. Existing sections keep their code
skeleton wherever possible — this is a re-dressing, not a rebuild.

| Pos | Section | Weight | Content |
|---|---|---|---|
| 1 | **Hero — living work passport** | ▓▓▓ | Headline (§8) + signal chips + dual CTA left; product diorama (journal → evidence → CV loop) right; capability strip (C1–C4 replacement) under CTAs |
| 2 | **Capability ticker** | ░ | Full-width marquee of real capabilities/sectors (T1 replacement) — keeps the kinetic hero exit |
| 3 | **Journey band** (existing, kept) | ▒▒ | The 1→4 stage rail = OS process view; unchanged structure, same CTA |
| 4 | **Europe directions map** (demoted from hero) | ▒ | Cleaned map (M1 replacement) + "starting from Lithuania" line + audience chips folded beneath (merges the current audience band) |
| 5 | **Module wall — the OS in 8 real screens** | ▓▓▓ | New flagship (§4): 8 module cards, journal cell 2×; every visual a real screenshot. This is the page's centre of gravity and the direct answer to "present the project better visually" |
| 6 | **Booking-lifecycle showcase** | ▒▒ | DB1 replacement: real flow, real states, "no dead ends" as an explicit trust claim |
| 7 | **Market pulse — real evidence** | ▒▒ | LabourMarketEvidence promoted into terminal styling (MP1 replacement); sourced statistics with provenance rows |
| 8 | **Why-now pillars** (existing, kept) | ▒ | Unchanged 4-card grid; sits naturally after the evidence |
| 9 | **Two paths — worker / company** (existing, upgraded) | ▒▒ | Path cards gain one real screenshot each; same routes |
| 10 | **Trust strip — privacy & security** | ░ | Compact honest row: live data export, live deletion-request intake, count-gated notifications, LT/EN/RU. No MFA claim |
| 11 | **Final CTA band** | ▒▒ | Headline reprise + dual CTA; pilot-program card (P1 replacement) linked for companies |

Deleted outright: fake counters, staged map tooltips, fictional player
trio, DraftBoard staged matching, MarketPulse fake panels, fake ticker
events. Every deletion has a stronger honest replacement above — nothing
is stripped without being replaced.

## 8. Headline options (LT / EN) — honest but strong

Structure matches the existing two-line hero (line 2 carries the
gradient accent). All claims below are true today.

| # | LT | EN |
|---|---|---|
| H1 | `Tavo darbas tampa įrodymu.` / `Įrodymai tampa karjera.` | `Your work becomes proof.` / `Proof becomes your career.` |
| H2 | `Darbo rinkos` / `operacinė sistema.` | `The operating system` / `for real work.` |
| H3 | `Dirbk. Fiksuok. Įrodyk.` / `CV, kuriuo galima patikėti.` | `Work it. Log it. Prove it.` / `A CV that can be trusted.` |
| H4 | `Kiekviena darbo diena` / `stato tavo patikrintą CV.` | `Every day you work` / `builds your verified CV.` |
| H5 | `Ne pažadai.` / `Įrodymai.` | `Not promises.` / `Evidence.` |
| Sub (pairs with any) | `Darbo žurnalas, įgūdžių įrodymai ir patikrintas CV vienoje sistemoje — darbuotojams ir įmonėms visoje Europoje.` | `A work journal, evidence-backed skills and a verified CV in one system — for workers and companies across Europe.` |

Company-page headline options (for `/for-companies`, same honesty bar):
LT `Samdykite pagal įrodymus, ne pažadus.` / EN `Hire on evidence, not
promises.`; LT `Matykite, ką žmogus tikrai dirbo.` / EN `See what a
person has actually done.`

## 9. No fake data — explicit rule

**No fabricated numbers, activity, profiles, testimonials, logos or
statistics anywhere on the public site. Ever.** Specifically:

1. A number renders only if it is (a) a real sourced public statistic
   with visible provenance, or (b) a real DB aggregate via a public-safe
   RPC, rendered only while >0 (rules in
   `landing-replacement-model-v1.md`), or (c) inside a designed
   worked-example frame labelled at ≥12px in the page language.
2. No animation that fabricates change (counter cycles, staged match
   feeds). Motion is allowed only when it depicts the real product
   process or is pure decoration (constellation background).
3. Screenshots show real product states; honest empty states are
   acceptable and framed as such.
4. MFA, offline mode, store listings and anything else not yet live must
   not appear as live.
5. Guards stay green: `placeholders:check`,
   `check-pilot-honesty-copy`, `check-pricing-honesty-copy`,
   `public-no-fake-claims`, plus the future `check-public-numbers` guard
   from the copy model.

## 10. DO NOT edit the landing yet

**No implementation is authorized by this document.** The landing,
`/for-companies`, `/for-agencies`, `/pricing`, legal pages and all
public marketing surfaces stay untouched until the owner approves this
visual model AND the copy model (#657). After approval: one
implementation PR per surface (hero+capability strip, ticker, map+
audience, module wall, lifecycle+pulse, companies, agencies, pricing,
jargon purge), each keeping the guards green and LT/EN/RU parity intact,
each individually reviewable.

## 11. Owner approval questions

1. approve this visual direction?
2. use capability cards instead of fake counters?
3. use real app screenshots?
4. keep or remove animated numeric counters?

Suggested answer format: `1 taip/ne · 2 taip/ne · 3 taip/ne · 4 palikti/šalinti`
(any edits welcome inline). Question 4 note: "keep" is only possible
under the >0-real-aggregate rule — the current placeholder cycles cannot
stay in any approved outcome.
