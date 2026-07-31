# LABOURMARKET.AI — CANONICAL COMPONENT MAP

**Statusas:** FAZĖ A — kanoninis sprendimas, dar neįgyvendintas
**Data:** 2026-07-30
**Taisyklė:** viena funkcija = vienas kanoninis komponentas = vienas duomenų šaltinis

> **Migracijos saugumo taisyklė (§2.7 NO REGRESSION).**
> Komponentas **išjungiamas iš maršruto** tik tada, kai kanoninis pakaitalas yra
> integruotas IR patikrintas. Failas **netrinamas tame pačiame žingsnyje** —
> trynimas yra atskiras, vėlesnis, savininko priimtas veiksmas.
> `NAUJAS` = tokio komponento dar nėra; jį reikia sukurti FAZĖJE B.

---

## 1. KANONINIŲ KOMPONENTŲ LENTELĖ

| # | Funkcija | Kanoninis komponentas | Duomenų šaltinis | Kur naudojamas | Draudžiami dublikatai |
|---|---|---|---|---|---|
| 1 | **Workspace shell** | `WorkspaceShell` **(NAUJAS)** | — (layout) | `dashboard/layout.tsx` | `dashboard-chrome.tsx` 3 režimai; bet koks antras shell |
| 2 | **Chat** | `ConversationChat` | `conversation.*`, session profile, `listMyBookings` | shell kairė kolona | `/dashboard/assist`; bet koks antras AI įėjimas |
| 3 | **Result drawer** | `ResultPanel` + `ResultRegistry` **(NAUJAS)** | rezultatų registras | shell dešinė kolona / mobile drawer | maršrutinė navigacija į modulį kaip rezultato pakaitalą |
| 4 | **Player Card** | `WorkerPlayerCard` (605 eil.) | realūs profilio + įrodymų rows | rezultatas; landing (showcase) | `player-card.tsx` → tampa `variant="summary"` |
| 5 | **Player Card grafikai** | `player-card/skill-evidence-chart`, `evidence-timeline-chart`, `work-history-timeline` | realūs rows | Player Card katalogai | **NELIESTI** — ką tik atkurti po A-13 |
| 6 | **Work journal result** | `JournalResult` **(NAUJAS)** — apvalkalas esamai `/journal` logikai | `work_log` | rezultatas | `/dashboard/journal` kaip savarankiška darbo vieta |
| 7 | **Journal capture** | `worker-worklog-flow.tsx` (chat inline) | `work_log` write | chat | `/journal/voice` kaip atskiras įėjimas → į composer |
| 8 | **Calendar** | `CalendarResult` **(NAUJAS)** — virš `/planning` logikos | bookings + absences + projektų etapai | rezultatas, visuose kontekstuose | `/company/planning`, `/bookings`, `/absences` kaip atskiros laiko tiesos |
| 9 | **Market intelligence** | `MarketResult` **(NAUJAS)** su 5 katalogais | realūs rinkos rows | rezultatas | `/market-map`, `/intelligence`, `/market/recognize` kaip atskiri ekranai |
| 10 | **Market katalogų vidus** | `SupplyDemandChart`, `RegionalHeatmap`, `SkillsDemandList`, `RecentMatchesFeed`, `LabourMarketWorldMap` | **tikrinti prieš atkuriant** | `MarketResult` katalogai | jų dėliojimas į ilgą puslapį |
| 11 | **Projects** | `ProjectResult` **(NAUJAS)** | projektų rows | rezultatas | `/projects/[id]/operations` kaip atskiras dashboardas |
| 12 | **Organizations** | org = **kontekstas**, ne ekranas | `getActiveOrganizationContext` | konteksto jungiklis | `/dashboard/company` kaip org dashboardas |
| 13 | **Messages** | `conversation/chat/*` thread (žmogus↔žmogus) | `communication` rows | `/communication` + rezultatas | painiava su AI pokalbiu — **būtinas aiškus perženklinimas** |
| 14 | **Documents / Evidence** | `EvidenceResult` **(NAUJAS)** | dokumentai + galerija + assets | rezultatas; Player Card „Įrodymai" | `/documents`, `/gallery`, `/assets` kaip trys ekranai |
| 15 | **Reputation** | `ReputationResult` **(NAUJAS)** | realūs atsiliepimai | Player Card katalogas | **žvaigždutės, bendras balas — DRAUDŽIAMA** |
| 16 | **Profile** | `WorkerPlayerCard` + inline edit | profilio rows | rezultatas | `/dashboard/profile` (1007 eil.) kaip atskiras ekranas |
| 17 | **Map** | `LabourMarketWorldMap` (**gyvas**) | realūs | `MarketResult` → „Regionai" | `market-map-*` 8 komponentų šeima be vieno šeimininko |
| 18 | **Invoice result** | `InvoiceResult` **(NAUJAS)** | `work_log` agregacija | rezultatas | `/finance`, `/reports` kaip apskaitos dashboardas |
| 19 | **Context switcher** | `ContextSwitcher` **(NAUJAS)** — prie pokalbio | `AuthProvider` workspaces | shell, prie composer'io | `role-switcher.tsx` header'yje; `current-space-header.tsx` |
| 20 | **Notifications** | `notification-panel.tsx` | `SpineStream` | shell | antras badge šaltinis |

---

## 2. DUBLIKATŲ SPRENDIMAI — DETALIAI

### 2.1 Player Card (3 → 1)

| Failas | Sprendimas |
|---|---|
| `components/app/worker-player-card.tsx` (605) | **KANONINIS** |
| `components/app/player-card.tsx` (213) | tampa `WorkerPlayerCard variant="summary"`; failas lieka kaip re-export, kol visi importai perkelti |
| `components/marketing/player-card-showcase.tsx` | **PALIKTI** — vieša demonstracija, ne autentikuotas produktas |
| `components/app/player-card/*.tsx` (3 grafikai) | **NELIESTI** |

**Rizika R3:** ši konsolidacija yra tiksliai ta operacija, kuri A-13 metu sunaikino
vienintelį grafiką. Todėl keičiamas **tik apvalkalas**, grafikų importai
nejudinami, ir konsolidacija atliekama atskiru commit'u, kad būtų atstatoma.

### 2.2 Laiko tiesos (4 → 1)

`/planning` (826 eil.) turi daugiausiai kanoninės timeline logikos → jos vidus
tampa `CalendarResult` šaltiniu. `/bookings` ir `/absences` **veiksmai** lieka
(accept/decline/propose yra operacijos, ne projekcijos); jų **laiko rodymas**
pereina į `CalendarResult`.

### 2.3 Du AI įėjimai (2 → 1)

`/dashboard/assist` (358 eil.) → `redirect` į `/dashboard`. **Ne 404** — senos
nuorodos ir bookmark'ai turi veikti.

### 2.4 Trys chrome režimai (3 → 1)

`dashboard-chrome.tsx` lieka FAZĖJE B kaip **pereinamasis adapteris** (jis pinamas
guard testų — žr. riziką R5), bet `conversation` ir `panel` režimai suauga į vieną
`WorkspaceShell`, o `full` lieka tik `/dashboard/admin/*`.

### 2.5 Orphaned komponentai (8) — atkūrimo vartai

Kiekvienam iš `MarketPulse`, `DraftBoard`, `ConversationOsPanel`,
`HowItWorksBand`, `SupplyDemandChart`, `RegionalHeatmap`, `SkillsDemandList`,
`RecentMatchesFeed` — **privalomas duomenų šaltinio patikrinimas prieš atkuriant**:

1. Ar komponentas skaito realų šaltinį? → atkurti kaip katalogą.
2. Ar jis maitinamas demo/placeholder duomenimis? → **neatkurti**; vizualinė
   kryptis perimama, bet komponentas perrašomas ant realaus šaltinio.
3. Ar realaus šaltinio nėra? → **neatkurti visai** (§2.5 REAL DATA ONLY).

> Šis patikrinimas **dar neatliktas**. Jis yra pirmas FAZĖS E darbas.

---

## 3. KOMPONENTAI, KURIŲ **NELIEČIAME**

| Sritis | Priežastis |
|---|---|
| `player-card/*` 3 grafikai | ką tik atkurti po regresijos (PR #923/#924) |
| `/dashboard/admin/*` (20 maršrutų) | vidinis įrankis, ne vartotojo produktas |
| `/legal/*` (7) | teisinis turinys — §16 |
| `/questions/*`, `/professions`, `/skills`, `/labour-market/*` | Answer Engine SEO turtas |
| `auth`, `onboarding`, `invite` | įėjimo srautas, atskira rizikos klasė |
| `middleware.ts`, i18n konfigūracija | infrastruktūra |

---

## 4. NAUJŲ KOMPONENTŲ SĄRAŠAS (FAZĖ B+)

`WorkspaceShell` · `ResultPanel` · `ResultRegistry` · `ContextSwitcher` ·
`JournalResult` · `CalendarResult` · `MarketResult` · `ProjectResult` ·
`EvidenceResult` · `ReputationResult` · `InvoiceResult`

**11 naujų komponentų.** Visi — apvalkalai virš **jau egzistuojančios** duomenų
logikos. Nė vienas nereikalauja naujos bibliotekos, naujos DB migracijos ar naujo
duomenų šaltinio (§16).
