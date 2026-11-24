# LABOURMARKET.AI — DEPENDENCY MAP

**Statusas:** FAZĖ A+ — priklausomybių žemėlapis (savininko užsakytas)
**Data:** 2026-07-30
**Šaka:** `feat/cc/premium-unified-product-v1`

---

## 0. SVARBI BLUEPRINT KOREKCIJA

Auditas FAZĖJE A siūlė **naują** `ResultRegistry`. Gilesnis skaitymas parodė, kad
tai būtų buvusi **paralelinė sistema** — t. y. tiksliai tas pažeidimas, kurį
taisome (§2.3 ONE FUNCTION — ONE CANONICAL SURFACE).

**Kas jau egzistuoja:** `lib/conversation/action-registry.ts` (523 eil.) —
deterministinis 30 veiksmų katalogas su:

- `advancedRoute` — realus maršrutas, kuris ŠIANDIEN atlieka veiksmą
- `handler: { kind: "deep_link" | "server_action" | "rest" }`
- `confirmation` (4 pakopos), `precondition` (8 tipų), `migrationSensitive`
- LLM gali tik **pasiūlyti** `id` — niekada įvykdyti ir niekada išgalvoti veiksmą

Modulio komentaras pats įvardija dabartinę būseną kaip laikiną:

> *„Foundation ships every entry as `deep_link`; journey PRs promote the ones
> that should execute inline."*

**Todėl `ResultRegistry` NEKURIAMAS.** Vietoj jo registras praplečiamas
**rezultato** sąvoka: kiekvienas veiksmas gali turėti kanoninį rezultatą, kuris
renderinamas skydelyje vietoj navigacijos į `advancedRoute`.

`advancedRoute` **lieka** — kaip fallback ir kaip „atidaryti pilną ekraną"
afordancija. Tai vienu metu ir saugumo tinklas rizikai R1, ir NO REGRESSION
garantija.

---

## 1. SLUOKSNIŲ PRIKLAUSOMYBĖS

```
┌─ L4  PREZENTACIJA ────────────────────────────────────────────┐
│  WorkspaceShell · ResultPanel · ContextSwitcher               │
│  ResultSummaryCard · WorkerPlayerCard · *Result komponentai   │
└───────────────────────┬───────────────────────────────────────┘
                        │ priklauso nuo
┌───────────────────────▼───────────────────────────────────────┐
│─ L3  KONTRAKTAS ──────────────────────────────────────────────│
│  lib/conversation/action-registry.ts   ← JAU YRA, praplečiamas│
│  + resultKind (naujas laukas)                                 │
│  + result-registry.ts (id → komponentas) ← plonas žemėlapis   │
└───────────────────────┬───────────────────────────────────────┘
                        │ priklauso nuo
┌───────────────────────▼───────────────────────────────────────┐
│─ L2  DOMENO LOGIKA ───────────────────────────────────────────│
│  lib/player-card · lib/journal · lib/planning · lib/market    │
│  lib/projects · lib/documents · lib/finance · lib/booking     │
│  ← VISI JAU EGZISTUOJA. Nekeičiami.                           │
└───────────────────────┬───────────────────────────────────────┘
                        │ priklauso nuo
┌───────────────────────▼───────────────────────────────────────┐
│─ L1  DUOMENYS ────────────────────────────────────────────────│
│  Supabase RLS + kanoninės RPC                                 │
│  ← NEKEIČIAMA. Jokių migracijų (§16).                         │
└───────────────────────────────────────────────────────────────┘
```

**Kryptis vienpusė.** L4 niekada nekreipia užklausų tiesiai į L1; L2 niekada
neimportuoja L4. `action-registry.ts` yra grynas (be `server-only`, be supabase),
todėl saugus abiem pusėm — šią savybę privaloma išsaugoti.

---

## 2. REZULTATŲ PRIKLAUSOMYBIŲ LENTELĖ

| Rezultatas | Duomenų šaltinis (L2) | Egzistuoja? | Fazė | Blokuoja | Blokuojamas |
|---|---|---|---|---|---|
| `player-card` | `lib/player-card/*` (8 failai) | ✅ | C | P1 | B2 |
| `journal` | `lib/journal/*` (50+ failų) | ✅ | D | P4 | B2 |
| `calendar` | `lib/planning`, `lib/booking`, `lib/leave` | ✅ | E2 | P5 | B2 |
| `market` | `lib/market`, `lib/market-map`, `lib/labour-market` | ✅ | E3 | P2, P6 | **E1** |
| `project` | `lib/projects/*` | ✅ | E4 | P5 | B2 |
| `evidence` | `lib/documents`, `lib/assets`, `lib/journal/personal-gallery` | ✅ | E4 | P1 | B2 |
| `reputation` | ⚠️ **nepatvirtinta** | ? | E4 | P3 | tyrimas |
| `invoice` | `lib/finance`, `lib/journal` agregacija | ✅ | E4 | P4 | D1 |

**Pagrindinė išvada:** 7 iš 8 rezultatų turi jau egzistuojančią domeno logiką.
FAZĖS B–E daugiausia yra **prezentacijos sluoksnio** darbas, o ne naujas backend.
Tai reikšmingai mažina riziką ir paaiškina, kodėl migracijų nereikia.

---

## 3. KRITINIS KELIAS

```
B1 registro praplėtimas (resultKind)
  └─▶ B2 WorkspaceShell  ◀── PLAČIAUSIAS BLOKUOTOJAS (blokuoja 7 rezultatus)
        ├─▶ B3 deep-link ?result=
        ├─▶ B4 ContextSwitcher
        ├─▶ C1→C2→C3 Player Card v2 ──▶ P1
        ├─▶ D1→D2 Journal ──▶ P4 (invoice)
        └─▶ E2 Calendar ──▶ P5
              E1 orphan patikra ──▶ E3 Market ──▶ P2, P6
              E4 Project/Evidence/Invoice
                    └─▶ F1 Landing
                          └─▶ §14 scenarijai + screenshotai
```

**B2 yra vienintelis platusis blokuotojas.** Kol nėra shell'o, joks rezultatas
negali būti parodytas. Todėl B2 daromas pirmas ir su griežčiausiais vartais
(mobile composer 360/390/412 — rizika R2).

**E1 yra vienintelis tyrimo blokuotojas.** Rinkos rezultato apimtis nežinoma, kol
nepatikrinti 8 orphaned komponentų duomenų šaltiniai.

---

## 4. BLOKUOJANČIOS BRIAUNOS (kodėl būtent tokia tvarka)

| Briauna | Priežastis |
|---|---|
| B1 → B2 | Shell'ui reikia žinoti, kurie veiksmai turi rezultatą |
| B2 → visi rezultatai | Nėra skydelio = nėra kur renderinti |
| B2 → B3 | Deep-link atkuria skydelio būseną — skydelis turi egzistuoti |
| B2 → C1 | Player Card yra **pirmas** rezultatas; jis validuoja shell kontraktą |
| C1 → C2 | Konsolidacija prieš pertvarkymą (kitaip pertvarkome 3 kartus) |
| C2 → C3 | G5 skalės taisymas po to, kai katalogai turi galutinę formą |
| D1 → D2 | Rezultato apvalkalas prieš chat srautus |
| D1 → E4 (invoice) | Sąskaita agreguoja žurnalo įrašus |
| **E1 → E3** | **Duomenų šaltinio patikra PRIEŠ atkuriant** (REAL DATA ONLY) |
| E* → F1 | Landing demonstruoja produktą — produktas turi egzistuoti |
| F1 → §14 | Scenarijai tikrina visumą |

---

## 5. RIZIKŲ PRIKLAUSOMYBĖS

| Rizika | Kyla iš | Paliečia | Vartai |
|---|---|---|---|
| **R2** chat `h-[100dvh]` × shell | B2 | visi mobile srautai | composer pasiekiamas 360/390/412 |
| **R3** Player Card konsolidacija = A-13 | C1 | 3 grafikai | grafikų importai nepakitę (`git diff` tuščias tiems failams) |
| **R4** orphaned → placeholder duomenys | E3 | REAL DATA ONLY | **E1 privaloma prieš E3** |
| **R5** chrome vienodinimas × guard testai | B2 | CI | testai keičiami kartu |
| **R1** `/advanced` paslėpimas | G | prieiga prie modulių | **paskutinis, savininko gate** |
| **R7** ContextSwitcher × AuthProvider | B4 | konteksto sinchronizacija | naudoti initial state |

---

## 6. KO ŠIS ŽEMĖLAPIS NEKEIČIA

- ❌ Jokių DB migracijų — visi 7 rezultatai naudoja esamą L2/L1
- ❌ Jokių naujų bibliotekų — shell ir skydelis įgyvendinami esamu stack
- ❌ Jokių env pakeitimų
- ❌ `action-registry.ts` grynumas (be server-only importų) — **išsaugomas**
- ❌ `advancedRoute` **neišimamas** — lieka fallback + „pilnas ekranas"

---

## 7. NEIŠSPRĘSTOS PRIKLAUSOMYBĖS

| # | Klausimas | Blokuoja | Kada paaiškės |
|---|---|---|---|
| U1 | Ar reputacijos duomenų modelis turi realius rows? | P3, `reputation` rezultatas | E4 tyrimas |
| U2 | Kiek iš 8 orphaned komponentų turi realius šaltinius? | P6, `market` apimtis | **E1** |
| U3 | Ar balso transkripcijos servisas deployintas? | `/journal/voice` integracija | D2 |
| U4 | Ar guard testai pinami `dashboard-chrome.tsx` struktūros? | B2 apimtis | B2 pradžia |

Šie keturi **nėra** priežastis stabdyti darbą — kiekvienas turi saugų numatytąjį
elgesį (rezultatas nerodomas / komponentas neatkuriamas / funkcija lieka
`advancedRoute`), ir kiekvienas išsprendžiamas savo fazėje.
