# LABOURMARKET.AI — UNIFIED PRODUCT SURFACE AUDIT

**Statusas:** FAZĖ A — read-only inventorius
**Data:** 2026-07-30
**Šaka:** `feat/cc/premium-unified-product-v1`
**Bazė:** `main` @ `752f8b19`
**Metodas:** source-level read-only auditas (route sąrašas, komponentų importų grafas,
chrome selektoriaus logika). Production UI **nepakeista**.

> **Įrodymų sąžiningumo pastaba.** Šis dokumentas remiasi **source įrodymais**
> (failų keliai, eilučių numeriai, importų skaičiai), NE screenshotais. Screenshot
> įrodymai reikalauja autentikuoto preview su realiais duomenimis — jie priklauso
> FAZEI B+ ir dar NĖRA surinkti. Stulpelis „Vizualinė kokybė" žemiau yra
> **source-lygio vertinimas**, ne savininko vizualinis priėmimas. Žr. §7.

---

## 1. MASTELIS — KODĖL PRODUKTAS ATRODO FRAGMENTUOTAS

| Matas | Reikšmė | Įrodymas |
|---|---|---|
| Iš viso `page.tsx` maršrutų | **107** | `find apps/web/app -name page.tsx` |
| Autentikuoti `/dashboard/*` maršrutai | **~72** | maršrutų sąrašas §3 |
| Vieši (marketing + legal + auth) | **~35** | maršrutų sąrašas §3 |
| `components/app` komponentų | **248** | `ls apps/web/components/app` |
| Skirtingos chrome „tiesos" | **3** | `dashboard-chrome.tsx:43` `Mode = conversation \| panel \| full` |
| Player Card implementacijos | **3** | §4.1 |
| Paviršiai, liečiantys darbo žurnalą | **28** | §4.3 |
| Paviršiai, liečiantys laiką/kalendorių | **7** | §4.4 |
| §6 įvardytų komponentų be importų | **8 iš 9** | §4.5 |

**Pagrindinė išvada.** Produktas jau turi teisingą *šerdį* — `/dashboard` šaknis
JAU yra pokalbis (`dashboard/page.tsx:57` renderina `<ConversationChat>`). Problema
ne ta, kad pokalbio nėra. Problema ta, kad **pokalbis neturi rezultato skydelio**,
todėl kiekvienas rezultatas yra atskiras maršrutas, ir aplink pokalbį išaugo
antras pilnas dashboardas.

---

## 2. TRYS NAVIGACIJOS TIESOS (pagrindinis §3.1 pažeidimas)

`apps/web/components/app/dashboard-chrome.tsx:33-51` yra vienintelė vieta, kur
sprendžiama, kaip atrodo produktas. Ji turi tris režimus:

```
conversation  → /dashboard                                    (bare, chat savo nav)
panel         → /dashboard/communication|planning|profile|journal  (5-item nav)
full          → VISKAS KITA, įskaitant /dashboard/advanced    (platus module navbar)
```

**Pasekmė vartotojui:** einant iš pokalbio į, pvz., `/dashboard/projects`,
pasikeičia **visa produkto tapatybė** — kita antraštė, kita navigacija, kitas
apatinis dokas. Tai ne progressive disclosure, tai trys skirtingi produktai po
vienu domenu.

**Vertinimas:** `dashboard-chrome.tsx` yra teisingas *mechanizmas* blogam
*modeliui*. Jis paliktinas kaip pereinamasis adapteris FAZĖJE B, bet galutinėje
architektūroje režimų turi likti **vienas** (workspace shell), o skirtumas tarp
„pokalbis" ir „rezultatas" turi būti **skydelio būsena**, ne chrome režimas.

---

## 3. PAVIRŠIŲ LENTELĖ

Legenda — **Sprendimas**: `PALIKTI` · `INTEGRUOTI` (tapti rezultatu shell'e) ·
`PERKELTI` · `PASLĖPTI` (po priėmimo) · `PAŠALINTI` (tik po to, kai kanoninis
pakaitalas veikia).

### 3.1 Autentikuota šerdis

| Route | Komponentas | Paskirtis | Duomenys | Dubliavimas | Viz. kokybė | Veikimo kokybė | Sprendimas | Rizika |
|---|---|---|---|---|---|---|---|---|
| `/dashboard` | `ConversationChat` (1057 eil.) | Pokalbis — pagrindinė sąsaja | realūs: `listMyBookings`, session profile | — (kanoninis) | premium | veikia | **PALIKTI + praplėsti** rezultato skydeliu | Regresija chat sraute, jei shell keičia h-[100dvh] |
| `/dashboard/advanced` | 916 eil. kortelių tinklas | „Control room" — modulių gridas | daug realių šaltinių | **Antras dashboardas** — §3.1 pažeidimas | vidutinė (lygiaverčių kortelių tinklas) | veikia | **INTEGRUOTI** → rezultatai + kontekstiniai veiksmai; `PASLĖPTI` tik kai visos funkcijos pasiekiamos per pokalbį | **Aukšta** — tai dabartinis „viską matau" ekranas; pašalinus per anksti dingsta prieiga prie modulių |
| `/dashboard/journal` | 1209 eil. | Darbo žurnalo išklotinė | realūs work_log | Lygiagreti pagrindinė darbo vieta (§5.2) | vidutinė | veikia | **INTEGRUOTI** kaip rezultatą (peržiūra/filtras/eksportas) | Žurnalas yra variklis — negalima riboti prieigos, kol chat srautas nepilnas |
| `/dashboard/journal/voice` | balso įvestis | Balsu į žurnalą | realūs | Su `/journal` ir su chat composer | vidutinė | dalinai (reikalauja transcribe serviso) | **INTEGRUOTI** į composer | Balso servisas gali būti nedeployintas |
| `/dashboard/profile` | 1007 eil. | Profilis + tapatybė | realūs | Su Player Card (§4.1) | vidutinė | veikia | **INTEGRUOTI** — redagavimas kaip rezultatas | Profilio pilnumas maitina matching |
| `/dashboard/planning` | 826 eil. | Kanoninė laiko projekcija | realūs | Su `/bookings`, `/absences`, `/company/planning` (§4.4) | vidutinė | veikia | **INTEGRUOTI** kaip kalendoriaus rezultatą | Kanoninis timeline — žr. `labourmarketai-timeline-architecture-first` |
| `/dashboard/communication[/id]` | conversation thread | Žinutės tarp žmonių | realūs | **Terminologinis** su AI pokalbiu | vidutinė | veikia | **PALIKTI** atskirai, bet aiškiai perženklinti (žmogus↔žmogus ≠ AI) | Painiava: du „pokalbiai" |
| `/dashboard/assist` (358 eil.) | AI pagalbininkas | AI sąsaja | realūs | **Su `/dashboard` chat** — du AI įėjimai | vidutinė | veikia | **PAŠALINTI po priėmimo** — pokalbis yra `/dashboard` | Vidutinė — reikia redirect, ne 404 |

### 3.2 Kontekstiniai / verslo paviršiai

| Route | Paskirtis | Dubliavimas | Sprendimas |
|---|---|---|---|
| `/dashboard/company` | Organizacijos vaizdas | Su `/advanced` ir `/projects` | **INTEGRUOTI** → org kontekstas |
| `/dashboard/company/planning` | Org kalendorius | **Su `/dashboard/planning`** | **INTEGRUOTI** → tas pats kalendoriaus rezultatas, kitas kontekstas |
| `/dashboard/company/scouting` | Kandidatų paieška | Su `/talent`, `/candidates` | **INTEGRUOTI** → matching rezultatas |
| `/dashboard/talent`, `/candidates` | Kandidatai | **Tarpusavyje + `/scouting`** | **Vienas** kanoninis kandidatų rezultatas |
| `/dashboard/projects`, `/projects/[id]`, `/projects/[id]/operations` | Projektai | Su `/company`, `/tasks` | **INTEGRUOTI** → projekto rezultatas |
| `/dashboard/bookings`, `/absences` | Laikas | **Su `/planning`** | **INTEGRUOTI** → kalendorius |
| `/dashboard/market-map`, `/market/recognize`, `/intelligence` | Rinka | **Tarpusavyje** | **Vienas** rinkos rezultatas su katalogais (§6) |
| `/dashboard/opportunities`, `/listings`, `/service-requests`, `/buyer` | Pasiūlymai/paklausa | Persidengia | **INTEGRUOTI** → pasiūlymų rezultatas |
| `/dashboard/inbox`, `/inbox/quick`, `/inbox/report` | Įeinantys | Su `/communication` | **INTEGRUOTI** |
| `/dashboard/reports`, `/reports/evidence`, `/finance` | Ataskaitos/sąskaitos | Su žurnalu | **INTEGRUOTI** → sąskaitos rezultatas (§15 P4) |
| `/dashboard/documents`, `/gallery`, `/assets` | Dokumentai/įrodymai | Persidengia | **INTEGRUOTI** → įrodymų katalogas |
| `/dashboard/admin/*` (20 maršrutų) | Vidinis administravimas | — | **PALIKTI** — ne vartotojo produktas, neįtraukiama į shell |

### 3.3 Vieši paviršiai

| Route | Sprendimas | Pastaba |
|---|---|---|
| `/` (landing) | **PERTVARKYTI** pagal §12 FAZĖ F | Šiuo metu iš jos IŠIMTI 4 geri komponentai (§4.5) |
| `/for-workers`, `/for-companies`, `/for-agencies` | PALIKTI | Auditorijų puslapiai |
| `/labour-market[/country]`, `/professions`, `/skills`, `/questions/*` | PALIKTI | Answer Engine — SEO turtas, neliesti |
| `/legal/*` (7) | **PALIKTI NELIESTI** | Teisinis turinys — §16 draudimas |
| `/auth/*`, `/onboarding`, `/invite/[token]` | PALIKTI | Įėjimo srautas |

---

## 4. DUBLIAVIMO ŽEMĖLAPIS

### 4.1 Player Card — 3 implementacijos

| Failas | Eil. | Vaidmuo |
|---|---|---|
| `components/app/worker-player-card.tsx` | **605** | Pilna autentikuota kortelė — **kandidatas į kanoninę** |
| `components/app/player-card.tsx` | 213 | Lengva/kompaktiška versija |
| `components/marketing/player-card-showcase.tsx` | — | Landing demonstracija |
| `components/app/player-card/*.tsx` | 3×~150 | Grafikai (`skill-evidence`, `evidence-timeline`, `work-history-timeline`) — **geri, atkurti PR #923** |

**Sprendimas:** `worker-player-card.tsx` = kanoninė. `player-card.tsx` = tampa jos
kompaktišku `variant="summary"`, ne atskiru komponentu. Showcase lieka TIK landing
(vieša demonstracija ≠ autentikuotas produktas). Grafikų trejetas — **neliesti**,
jie ką tik atkurti po A-13 regresijos.

### 4.2 §4.4 įgūdžių juostos rizika — PATVIRTINTA
`components/app/player-card/skill-evidence-chart.tsx` — normalizacija į maksimumą
reiškia, kad daugiausiai įrašų turintis įgūdis visada rodo pilną juostą.
**Vartotojas tai gali perskaityti kaip 100 % kompetenciją.** Reikalingas §4.4
sprendimas + aiškus užrašas „darbo įrašų skaičius, ne įgūdžio balas".

### 4.3 Darbo žurnalas — 28 paviršiai
Žurnalo duomenys pasiekiami iš 28 `page.tsx`. Tai savaime nėra blogai (žurnalas
yra variklis), BET `/dashboard/journal` (1209 eil.) veikia kaip **lygiagreti
pagrindinė darbo vieta**, o ne kaip rezultatas — tai §5.2 pažeidimas.

### 4.4 Kalendorius — 7 paviršiai, ≥4 laiko „tiesos"
`/planning`, `/company/planning`, `/bookings`, `/absences` visi projektuoja laiką
skirtingai. §7 reikalauja **vienos** kanoninės laiko projekcijos.

### 4.5 ORPHANED KOMPONENTAI — §6 „geri komponentai, kurie dingo"

Patikrinta dviem būdais (failo vardu ir eksportuoto komponento vardu):

| Komponentas | Failas | Importų | Būsena |
|---|---|---|---|
| `MarketPulse` | `marketing/market-pulse.tsx` | **0** | orphaned |
| `DraftBoard` | `marketing/draft-board.tsx` | **0** | orphaned |
| `ConversationOsPanel` | `marketing/conversation-os-panel.tsx` | **0** | orphaned |
| `HowItWorksBand` | `marketing/how-it-works-band.tsx` | **0** | orphaned |
| `SupplyDemandChart` | `app/supply-demand-chart.tsx` | **0** | orphaned |
| `RegionalHeatmap` | `app/regional-heatmap.tsx` | **0** | orphaned |
| `SkillsDemandList` | `app/skills-demand-list.tsx` | **0** | orphaned |
| `RecentMatchesFeed` | `app/recent-matches-feed.tsx` | **0** | orphaned |
| `LabourMarketWorldMap` | `app/labour-market-world-map.tsx` | 1 (`/market-map`) | **GYVAS** |

**Kritinis kontekstas — jie NEBUVO pamiršti, jie buvo IŠIMTI sąmoningai.**
`app/[locale]/(marketing)/page.tsx:139-141` komentaruose užfiksuota:
`"Removed as self-duplication: ConversationOsPanel"` ir
`"#how-it-works nav anchor (supersedes HowItWorksBand)"`.

**Interpretacija.** Ankstesnis raundas teisingai diagnozavo problemą (landing buvo
per ilgas, komponentai dubliavo vienas kitą) ir pasirinko **trynimą** vietoj
**perpakavimo**. §6 reikalauja būtent perpakavimo: šie komponentai turi grįžti ne
kaip landing sekcijos vienas po kito, o kaip **vieno kompaktiško rinkos rezultato
katalogai** (Apžvalga / Paklausa / Atlygis / Regionai / Atitikmenys).

> **⚠️ Neverifikuota.** Ar šių 8 komponentų duomenų šaltiniai vis dar veikia
> (ar jie naudojo realias užklausas, ar buvo demo-duomenimis maitinami), NĖRA
> patikrinta. Prieš atkuriant KIEKVIENĄ reikia patikrinti prieš §1.2 REAL DATA
> ONLY. Jei komponentas maitinamas placeholder duomenimis — jis atkuriamas TIK su
> realiu šaltiniu arba nekuriamas visai.

---

## 5. KUR VARTOTOJAS BE REIKALO PALIEKA POKALBĮ

| Vartotojo ketinimas | Šiandien | Turėtų būti |
|---|---|---|
| „Parodyk mano kortelę" | navigacija → `/dashboard/profile` | rezultato skydelis |
| „Ką turiu rytoj?" | navigacija → `/dashboard/planning` | kalendoriaus rezultatas |
| „Parodyk darbo įrašus" | navigacija → `/dashboard/journal` | žurnalo rezultatas |
| „Rask man darbą" | navigacija → `/dashboard/opportunities` | matching rezultatas |
| „Kur reikia santechnikų?" | navigacija → `/dashboard/market-map` | rinkos rezultatas |
| „Perjunk į Rexora" | role/org switcher header'yje | konteksto jungiklis prie pokalbio |

**Šaknis:** rezultato skydelio nėra. `dashboard/page.tsx:57` grąžina TIK
`<ConversationChat>` — nėra `<ResultPanel>`, nėra rezultatų registro, nėra
deep-link būsenos rezultatui.

---

## 6. REGRESIJŲ RIZIKOS

| # | Rizika | Sunkumas | Švelninimas |
|---|---|---|---|
| R1 | `/advanced` paslėpimas atima prieigą prie modulių, kurių chat dar neapima | **Aukšta** | Slėpti TIK kai kiekvienam moduliui yra chat komanda + rezultatas |
| R2 | Chat `h-[100dvh]` konfliktuoja su shell'u → mobile composer nustumiamas | Aukšta | Shell perima aukščio valdymą; testuoti 360/390/412 |
| R3 | Player Card konsolidacija atkartoja A-13 (grafikų praradimą) | **Aukšta** | Grafikų trejetas NELIEČIAMAS; tik apvalkalas keičiasi |
| R4 | Orphaned komponentų atkūrimas įneša placeholder duomenis | **Aukšta** | Kiekvienam — duomenų šaltinio patikra prieš atkuriant |
| R5 | 3 chrome režimų suvienodinimas lūžta guard testuose | Vidutinė | `dashboard-chrome.tsx` pinamas testų; keisti su testais kartu |
| R6 | Kalendoriaus suvienodinimas paliečia `bookings` semantiką | Vidutinė | Kalendorius = projekcija; booking veiksmai lieka savo vietoje |
| R7 | Konteksto jungiklio perkėlimas lūžta `AuthProvider` sinchronizacijoje | Vidutinė | `layout.tsx:201` initial state — perduoti, neperrašyti |

---

## 7. KO ŠIS AUDITAS **NEĮRODO** (sąžiningumo skiltis)

Kad nebūtų pakartota `owner-visual-acceptance-is-not-a-test-pass` klaida:

- ❌ **Nėra screenshotų.** Nei prieš, nei po. Nei vieno viewport'o, nei vienos temos.
- ❌ **Nėra autentikuoto runtime patikrinimo.** Auditas atliktas iš source, ne iš
  veikiančio produkto su realiais duomenimis.
- ❌ **Stulpelis „Veikimo kokybė" yra prielaida** iš kodo skaitymo, ne iš realaus
  scenarijaus paleidimo.
- ❌ **Stulpelis „Vizualinė kokybė" nėra savininko vertinimas** — tai source-lygio
  spėjimas ir jį savininkas gali paneigti.
- ❌ **§14 priėmimo scenarijai NEPALEISTI** (nė vienas iš 21).
- ❌ Neaudituota: `/dashboard/admin/*` vidinė kokybė, i18n pilnumas naujiems
  paviršiams, a11y.

**Šis dokumentas yra inventorius ir kryptis — ne priėmimas.**

---

## 8. IŠVADA

Produktas turi **teisingą šerdį ir neteisingą topologiją**. Pokalbis jau yra
šaknis; trūksta rezultato skydelio, todėl aplink pokalbį išaugo 72 maršrutai ir
antras dashboardas.

Todėl FAZĖ B nėra „redizainas" — tai **rezultato skydelio įvedimas**, po kurio
maršrutai virsta rezultatais, o ne ekranais.

**Prioritetinė seka:** rezultato skydelis (B) → Player Card kaip pirmas rezultatas
(C) → žurnalas (D) → kalendorius/rinka (E) → landing (F).
