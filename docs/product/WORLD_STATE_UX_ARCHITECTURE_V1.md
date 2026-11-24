# WORLD STATE UX ARCHITECTURE V1 — AI-FIRST · SINGLE WORKSPACE · NO PAGE SWITCHING

| Field | Value |
|---|---|
| Status | **Refines and CORRECTS `PRODUCT_VISION_LOCK` / `PRODUCT_UNIVERSE_LOCK_V2`.** Final UX architecture direction |
| Source | **Owner text, 2026-07-28 — recorded 1:1 in §1** |
| Machine half | `apps/web/lib/product-gate/world-state.ts` |
| Enforced by | `.github/scripts/product-gate.mjs` + `lib/guards/product-gate.test.ts` |
| Requires now | **Nothing rewritten.** No World State engine, no new Map, no UI rewrite — the owner was explicit |

## What this corrects

| Was locked | Now |
|---|---|
| **Chat-first** (`A-01`, PR #900: "`/dashboard` IS the conversation") | **AI-FIRST.** Chat is not the goal — it is one part of one workspace |
| Map as the primary *view* (`PRODUCT_UNIVERSE_LOCK_V2`) | **Map-first is equally wrong.** The map is one part of the same workspace |
| `/dashboard/market-map` listed as a surface that **MUST REMAIN** (consolidation map §3.1) | **There is no separate Map screen.** It becomes part of the workspace — the consolidation map is corrected accordingly |

> **Tikslas nėra Chat-first. Tikslas nėra Map-first. Tikslas yra AI-FIRST.**

---

## 1. OWNER TEXT (recorded 1:1, 2026-07-28)

> **MISSION** — Patikslinti PRODUCT_VISION_LOCK. Tikslas nėra Chat-first.
> Tikslas nėra Map-first. **Tikslas yra AI-FIRST.** Naudotojas neturi galvoti,
> kokį modulį atsidaryti. Visa sistema turi veikti kaip viena vientisa darbo
> erdvė.
>
> **PAGRINDINĖ TAISYKLĖ** — Produkte neegzistuoja atskiras Chat ekranas.
> Produkte neegzistuoja atskiras Map ekranas. Produkte neegzistuoja atskiras
> Search ekranas. Produkte neegzistuoja atskiras Filter ekranas.
> **Visa tai yra viena darbo erdvė.**
>
> **WORKSPACE** — Darbo erdvę sudaro: 1. AI Conversation · 2. World Map ·
> 3. Context Panel. **Tai nėra trys produktai. Tai vienas komponentas.**
>
> **AI YRA OPERATORIUS** — AI niekada neverčia žmogaus eiti į kitą ekraną. AI
> pats: keičia pasaulio būseną, atnaujina žemėlapį, atidaro objektus, uždaro
> objektus, parodo informaciją, grąžina vartotoją į pokalbį. **Naudotojas lieka
> tame pačiame puslapyje.**
>
> **WORLD STATE** — Svarbiausias architektūros objektas tampa World State.
> **AI nekeičia puslapių. AI nekeičia maršrutų. AI nekeičia darbo vietos.
> AI keičia tik World State.**
>
> Pavyzdžiai: "Ieškau darbo Amsterdame" → `location=Amsterdam`,
> `objectType=Jobs`
> "Noriu bent 20 €/h" → `salary>=20`
> "Tik su apgyvendinimu" → `housing=true`
> "Tik lietuviškai" → `language=LT`
> "Tik pilnas etatas" → `employment=FullTime`
> "Rodyk tik statybas" → `industry=Construction`
> "Ne toliau kaip 20 km" → `radius=20km`
>
> **WORLD MAP** — World Map automatiškai reaguoja į World State. Niekas
> papildomai nespaudžiama. **Jokių "Apply Filters". Jokių "Search". Jokių
> "Go".** AI pakeičia World State. World Map persibraižo.
>
> **WORLD MAP NĖRA PAIEŠKA** — Map nėra rezultatas. **Map yra pasaulio būsena.**
> Jame vienu metu gali būti: avatarai · darbai · įmonės · projektai · objektai ·
> partneriai · AI agentai · komandos · mokymai · lygos · įvykiai · transportas ·
> ir visi būsimi objektų tipai.
>
> **OBJECT INTERACTION** — Paspaudus objektą **NEATIDAROMAS NAUJAS PUSLAPIS.
> NEVYKSTA NAVIGACIJA.** Atidaroma Context Panel. Joje rodoma: pavadinimas ·
> aprašymas · atlyginimas · grafikas · kontaktai · reikalavimai · istorija ·
> susiję objektai · AI rekomendacijos · galimi veiksmai.
>
> **AI + OBJECT** — Kai vartotojas pasirenka objektą, AI automatiškai supranta
> kontekstą. Tolimesnis pokalbis vyksta apie pasirinktą objektą. Pavyzdžiui:
> "Ar ši įmonė suteikia būstą?" · "Kiek čia dirba lietuvių?" · "Parodyk panašius
> darbus." · "Susisiek." **Nereikia niekur pereiti.**
>
> **NO PAGE SWITCHING** — Idealus naudotojo scenarijus: Prisijungia. Patenka į
> vieną darbo erdvę. **Ir iki atsijungimo nei karto nekeičia puslapio.**
> Keičiasi tik: World State, Context Panel, AI pokalbis, World Map.
>
> **UNIVERSAL CONTEXT** — Tas pats principas turi veikti visoms sritims: Darbai.
> Darbuotojai. Įmonės. Projektai. Objektai. Partneriai. Mokymai. Lygos. AI
> agentai. **Nė viena iš jų negali tapti nauju moduliu.**
>
> **ARCHITECTURE RULE** — Kiekvienas naujas funkcionalumas privalo atsakyti:
> Ar jis keičia World State? Ar jis atsispindi World Map? Ar jis valdomas AI?
> Ar jis gali būti naudojamas nepaliekant pagrindinės darbo erdvės? Ar jam
> nereikia naujo puslapio? **Jeigu bent vienas atsakymas yra "ne", sprendimas
> laikomas neatitinkančiu PRODUCT_VISION_LOCK.**
>
> **SVARBI PASTABA** — Šis dokumentas NEREIKALAUJA dabar perrašyti UI.
> NEREIKALAUJA dabar kurti World State variklio. NEREIKALAUJA dabar kurti naujo
> Map. Tikslas: užrakinti galutinę UX architektūros kryptį, kad ateities
> sprendimai nevirstų nei Chat-first, nei Map-first produktu, o būtų viena AI
> valdoma darbo erdvė su bendra World State logika.

---

## 2. The workspace

```
┌─────────────────────────────────────────────────────────┐
│                    ONE WORKSPACE                        │
│  ┌───────────────┐ ┌──────────────┐ ┌────────────────┐  │
│  │ AI            │ │ World Map    │ │ Context Panel  │  │
│  │ Conversation  │ │ (world state)│ │ (selection)    │  │
│  └───────────────┘ └──────────────┘ └────────────────┘  │
│         ▲                 ▲                  ▲          │
│         └────────── WORLD STATE ─────────────┘          │
└─────────────────────────────────────────────────────────┘
```

**One component, not three products.** The AI changes World State; the map
redraws; the panel follows the selection. The user never leaves.

| The AI MAY change | The AI may NEVER change |
|---|---|
| World State · Context Panel · the conversation · the World Map | the page · the route · the workspace |

**Forbidden controls:** "Apply Filters", "Apply", "Search", "Go" — a button that
makes the world catch up is the failure mode this rule names.

---

## 3. The five mandatory answers

Every new functionality must answer all five with **YES**. One "no" means the
decision does not conform to the lock.

| # | Question | Field |
|---|---|---|
| 1 | Does it change World State? | `changesWorldState` |
| 2 | Is it reflected on the World Map? | `reflectedOnMap` |
| 3 | Is it controlled by the AI? | `aiControlled` |
| 4 | Usable without leaving the main workspace? | `usableWithoutLeavingWorkspace` |
| 5 | Does it need no new page? | `needsNoNewPage` |

### New RED rules

| Rule | Fires when |
|---|---|
| `not_world_state_driven` | the feature does not change World State |
| `not_reflected_on_map` | it is invisible in the world |
| `not_ai_controlled` | it is operated outside the conversation |
| `requires_leaving_workspace` | using it means leaving the workspace |
| `requires_new_page` | it needs a new page |

A new surface now carries **twenty-two answers** across the four locks. That is
the intended cost of adding a page to a product that is meant to have one.

---

## 4. Where the product stands today (recorded, not fixed)

| Property | Required | Today |
|---|---|---|
| No separate Chat screen | yes | **no** — `/dashboard` is a chat surface |
| No separate Map screen | yes | **no** — `/dashboard/market-map` is a separate surface |
| Context Panel exists | yes | **no** |
| World State object exists | yes | **no** — nothing in the codebase holds it |
| Object click opens a panel | yes | **no** — it routes to `/dashboard/people/[workerId]`, `/dashboard/projects/[id]` |

**Verdict: the product is still page-based.** That is the honest gap this lock
closes going forward. The owner explicitly did not ask for it to be closed now.

### Correction to the consolidation map

`docs/audits/product-surface-consolidation-map-v1.md` listed
`/dashboard/market-map` under **MUST REMAIN**. Under this lock that is wrong:
the map is not a surface to keep, it is a **part of the one workspace**. The
same applies to `/dashboard` as a chat surface. Both are corrected there.

---

## 5. What this means for the execution plan

`docs/product/one-world-execution-plan-v1.md` gains a **Phase 0.5**, between
"make the map a platform" and "make the world alive":

| Step | What |
|---|---|
| 0.5.1 | Define the **World State object** — dimensions as data, not a fixed schema |
| 0.5.2 | The AI writes World State instead of navigating (`AI_MAY_NEVER_CHANGE`) |
| 0.5.3 | The map subscribes to World State — no commit control anywhere |
| 0.5.4 | Context Panel replaces object detail *pages* |
| 0.5.5 | Prove it: one session, several domains, **zero page changes** |

Acceptance for the whole phase is 0.5.5 — a user who logs in, searches, filters,
selects an object, asks about it and acts on it **without a single navigation**.

---

*Locked. Amended only by explicit owner decision recorded here. Nothing was
rewritten, migrated or built by this slice.*

---

## World State is defined here, and only here

The structural slots the owner named live in this lock's machine half
(`WORLD_STATE_SLOTS`), together with the filter dimensions
(`KNOWN_WORLD_STATE_DIMENSIONS`). `UNIFIED_WORLD_MODEL_V1` **imports** them and
does not restate them — one concept, one definition.

This lock is also the canonical owner of two gate questions: **`reflectedOnMap`**
and **`aiControlled`**. Other locks reference these fields instead of adding
their own map/AI question.
