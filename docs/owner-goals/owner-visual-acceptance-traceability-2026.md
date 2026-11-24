# Owner visual acceptance 2026 — atsekamumo lentelė

> Kanoninė specifikacija: [`owner-visual-acceptance-audit-2026.md`](owner-visual-acceptance-audit-2026.md)
> (savininko auditas, verbatim) **+ privaloma vykdymo politika**
> [`owner-visual-acceptance-addendum-2026.md`](owner-visual-acceptance-addendum-2026.md)
> (tos pačios galios addendum) **+ ankstesnis GOAL**
> [`owner-visible-rebuild.md`](owner-visible-rebuild.md) (savininko pateiktas, verbatim).
>
> **DABARTINIS STATUSAS:**
> `OWNER_VISUAL_ACCEPTANCE_NOT_COMPLETE_OWNER_PRODUCTION_VISUAL_REVIEW_FAILED_PLAYER_CARD_GRAPHS_DATA_PRESENTATION_PREMIUM_DESIGN_AND_VISUAL_QA`
>
> Ankstesnis statusas
> `OWNER_VISUAL_ACCEPTANCE_NOT_COMPLETE_OAUTH_IDENTITY_GATE_AND_WORKSPACE_POINTER_GATE`
> **ATMESTAS** — jį pagrindę teiginiai neatitiko realios production būsenos.
> Neatitikimų analizė:
> [`../audits/owner-visual-acceptance-false-completion-postmortem-2026.md`](../audits/owner-visual-acceptance-false-completion-postmortem-2026.md).

## Statusų taisyklės (įsigalioja 2026-07-30)

| Statusas | Kas jį suteikia |
|---|---|
| `OWNER_ACCEPTED` | **Tik savininkas** po naujausio production deployment peržiūros |
| `OWNER_REJECTED` | Savininko po-deploy verdiktas: neatitinka GOAL |
| `NOT_REVIEWED` | Savininkas šio punkto po-deploy dar nevertino |

**Nė vienas punktas negali būti `DONE` vien todėl, kad yra commit, deploy,
guard'as ar automatinis testas.** „KODAS LIVE" reiškia tik tai, kad kodas
deploy'intas — ne kad punktas priimtas.

Stulpelių reikšmės:

- **Agento st. (buvęs)** — kaip punktas buvo pažymėtas ataskaitoje `44da1dcb`.
- **Savininko po-deploy verdiktas** — savininko 2026-07-30 peržiūra po deploy `44da1dcb`.
- **Neatitikimas** — kuo agento statusas skyrėsi nuo savininko verdikto.
- **Tikroji production būsena** — ką rodo gyvas patikrinimas / kodas.
- **Reikalingas pataisymas** — kas privalo įvykti, kad punktas galėtų būti priimtas.
- **Vizualinio priėmimo įrodymas** — kas turi būti pateikta savininkui.
- **Statusas** — `OWNER_ACCEPTED` / `OWNER_REJECTED` / `NOT_REVIEWED`.

---

## OWNER_REPORTED_REQUIREMENTS — savininko audito punktai

| # | Reikalavimas | Agento st. (buvęs) | Savininko po-deploy verdiktas | Neatitikimas | Tikroji production būsena | Reikalingas pataisymas | Vizualinio priėmimo įrodymas | Statusas |
|---|---|---|---|---|---|---|---|---|
| P0.1 | Workspace realiai persijungia | KODAS LIVE + savininko gate | nevertinta atskirai | — | Sesijos pointer live; patvarus DB pointer neapplied (migracija `20260714210000`) | Savininkas pritaiko migraciją; tada cross-device patikra | Erdvės perjungimas 2 įrenginiuose, screenshot abiejuose | `NOT_REVIEWED` (+ savininko gate) |
| P0.2 | Profilis / Nustatymai paspaudžiami | LIVE | nevertinta atskirai | — | `.wsmap` izoliacija + `AnchoredOverlay`; autentikuoto screenshot'o repo nėra | Autentikuotas click-through 7 viewport | Screenshot: profilio meniu atidarytas desktop + mobile | `NOT_REVIEWED` |
| P0.3 | Overlay sistema (portal root, escape, click-outside, focus, mobile sheet) | LIVE | nevertinta atskirai | — | Vienas portal root (`c13af477`); patikrinta gyvais paspaudimais, bet be committinto screenshot'o | Screenshot įrodymai visoms overlay būsenoms | 4 overlay × 7 viewport screenshot | `NOT_REVIEWED` |
| P0.4 | Google OAuth rodo LabourMarket identitetą | AUDITAS ATLIKTAS — SAVININKO GATE | savininko gate patvirtintas | — | Google lange `…supabase.co` | Supabase custom domain (billing) + DNS + Google Console | Google consent ekrano screenshot su `labourmarket.ai` | `NOT_REVIEWED` (savininko gate) |
| P0.5 | „Ieškau darbo" pirma klausia kriterijų | LIVE | nevertinta atskirai | — | Kriterijų dialogas live | Autentikuotas click-through | Dialogo screenshot + rezultatas | `NOT_REVIEWED` |
| P0.6 | Pilnas profilis (6/6) → jokio „Užbaigti profilį" | LIVE | nevertinta atskirai | — | Live | Autentikuotas click-through | Screenshot 6/6 be CTA | `NOT_REVIEWED` |
| P0.7 | Žurnalo redagavimas nedaugina įrašų | LIVE | nevertinta atskirai | — | Supersede logika live; §7 patikra rodė 3/3 unikalius | create → edit → edit production patikra | Kalendoriaus screenshot po dviejų redagavimų | `NOT_REVIEWED` |
| 3.1 | Landing sutrumpintas iki 7 blokų | LIVE (9619→7376px) | **per ilgas, neišbaigta hierarchija** | Skaičius netikslus; §3.1 niekada netikrintas | **Gyvai 7725 px ≈ 8,6 ekrano @1440**; harness'o patikra buvo `h > 0` (tautologija) | Reali blokų revizija iki 7 prasmingų blokų + patikra, kuri gali FAIL'inti | Full-page screenshot @1440 ir @390 su blokų sąrašu | `OWNER_REJECTED` |
| 3.2 | Hero subalansuotas | LIVE | **ne premium** | Tikrinta tik `overflow <= 0` | Hero renderinasi be overflow; kompozicija nevertinta | Hero kompozicijos perdarymas ir vertinimas | Hero screenshot 7 viewport × 2 temos | `OWNER_REJECTED` |
| 3.3 | Kelių sektorių scenarijai | LIVE (4 sektoriai) | dalinis | Slauga / gamyba / kūryba nebuvo pateikta kaip atviras punktas suvestinėje | 4 interaktyvūs sektoriai live | +3 sektoriai arba aiškus savininko sprendimas | Kiekvieno sektoriaus screenshot | `NOT_REVIEWED` |
| 3.4 | Motion aiškina produktą; premium lygis | LIVE | **ne premium** | „4 žingsnių seka" pateikta kaip premium lygis | Demo ciklas live; premium lygis nevertintas | Motion + kompozicijos premium pass | Kadrų seka desktop + mobile | `OWNER_REJECTED` |
| 3.5 | LT copy auditas; jokių netikslių pažadų | LIVE (0 PLACEHOLDER / raw enum) | **neišbaigta** | Tikrinti tik 2 regex'ai | **Gyvai renderinama `KONCEPCINIS PAVYZDYS — PAVYZDINIAI SKAIČIAI`** — §3.5 vardytas žodis | §3.6 realūs duomenys (tada etiketės nebereikia); pilnas copy skenavimas visiems §3.5/§11 terminams | Grep 11 lokalėse + production teksto dump | `OWNER_REJECTED` |
| 3.6 | Žemėlapio momentas realus, ne balta dėžė | DALINAI | **neišbaigta / ne premium** | „DALINAI" buvo teisingas, bet neįtrauktas į likusių blokatorių sąrašą | 611×256 SVG forma + koncepciniai skaičiai | Realus miestas / poreikis / skaičiai / atstumas / sektorius | Žemėlapio momento screenshot su realiais duomenimis | `OWNER_REJECTED` |
| 3.7 | Landing Player Card = realus `WorkerPlayerCard` | LIVE | **kortelė ne premium** | Tapatumas pasiektas, bet abi pusės vienodai neišbaigtos | Tas pats komponentas abiejose pusėse — DOM count = 1 | §5.2 premium perdarymas (žr. žemiau) | Kortelės screenshot landing + produkto viduje | `OWNER_REJECTED` |
| 4.1 | Composer centre pirmo atidarymo metu | LIVE | nevertinta atskirai | — | Live | Autentikuotas click-through | Pirmo atidarymo screenshot | `NOT_REVIEWED` |
| 4.2 | Pirmas ekranas rodo realią santrauką | LIVE | nevertinta atskirai | — | Opening brief live | Autentikuotas click-through | Brief screenshot su realiais duomenimis | `NOT_REVIEWED` |
| 4.3 | Tik 1–3 kontekstiniai CTA | LIVE | nevertinta atskirai | — | ≤3 chips live | Autentikuotas click-through | Chips screenshot 2 būsenose | `NOT_REVIEWED` |
| 4.4 | Viršuje tik erdvė, pokalbis, pranešimai, profilis | LIVE | nevertinta atskirai | — | Live | Autentikuotas click-through | Top bar screenshot 7 viewport | `NOT_REVIEWED` |
| 5.1 | Player Card pasiekiama iš pirmo ekrano / avataro / komandos | LIVE | **savininkas nerado profesionalios kortelės** | Pasiekiamumas ≠ priimtinumas; be to §5.1 **nebuvo išspręstas** — deep-link vedė į UŽDARĄ akordeoną (A-17) | Pataisyta PR #924: `<details id="mano-cv-identity" open>`; guardas prirakina | Savininko peržiūra: avataras → „Mano kortelė" → kortelė matoma be papildomo paspaudimo | Autentikuotas production click-through 7 viewport × 2 temos | `OWNER_REVIEW_REQUIRED` |
| **5.2** | **Kortelės vizualika reali ir premium** | **LIVE (etapas 3 baigtas)** | **NEBAIGTA — nėra profesionalios Premium Player Card, trūksta grafikų** | **`toContain()` markerių patikros šaltinio tekste pateiktos kaip užbaigimas** | **PR #923 + #924 (live production `51a78d6e`+): trys realios vizualizacijos — darbo įrašų 12 mėn. stulpelinė diagrama (`journal_entries.created_at`), įrašų-už-įgūdį juostos su šaltinių legenda (`journal_entry_skills`), darbo istorijos laiko juosta (`engagement_contexts` datos). Vieta, prieinamumas, dokumentai, reputacija — kaip anksčiau. Tekstinis istorijos sąrašas rodo tik tai, ko juosta negali padėti** | **Savininko vizualinis priėmimas. Atviri duomenų klausimai: A-16 (realios erdvės įrašai be datų → juosta rodo sąžiningą tuščią būseną)** | **Landing: 14 screenshot'ų 7 viewport × 2 temos + production DOM 364/364. Autentikuota production: DOM patikra atlikta (12 mėn., 8 realios įgūdžių juostos, 0 overflow, 0 sub-12px, 0 raw key)** | **`OWNER_REVIEW_REQUIRED`** |
| 6.1 | Darbo registravimas tik per pokalbį | LIVE | nevertinta atskirai | — | Forma tik edit režimui | Autentikuotas click-through | Žurnalo puslapio screenshot | `NOT_REVIEWED` |
| 6.2 | Jokių raw enum | LIVE | nevertinta atskirai | Tikrinta tik landing tekste | Landing'e enum'ų 0; autentikuotos pusės netikrinta | Autentikuotų ekranų grep + patikra | Screenshot žurnalo formos | `NOT_REVIEWED` |
| 6.3 | Įgūdžio signalas paaiškinamas | DALINAI | **duomenų pateikimas neišbaigtas** | „DALINAI" nebuvo likusių blokatorių sąraše | Šaltinis rodomas, frazė nepabraukiama | Frazės paryškinimas + vizualus signalo→įgūdžio ryšys | Screenshot su paryškinta fraze | `OWNER_REJECTED` |
| 7.1–7.3 | Kalendorius: pilna info, šaltiniai, jokių dublikatų | LIVE (§7 etapas 1) | **vizualinis ir informacinis lygis neišbaigtas** | Duomenų buvimas pateiktas kaip premium pateikimas | 8 šaltiniai, 0 dublikatų; jokio screenshot'o, jokios kompozicijos patikros | Day/week/month/year premium projekcija + duomenų vizualizavimas | 4 projekcijų screenshot × mobile/desktop | `OWNER_REJECTED` |
| 8.1–8.2 | Žinutės: premium projekcija | LIVE (§8 etapas 2) | **vizualinis lygis neišbaigtas** | Funkcijų buvimas pateiktas kaip premium | Prioritetas, quick reply, vienas rašymo kelias live; kompozicija nevertinta | Premium žinučių projekcija + hierarchija | Žinučių sąrašo + gijos screenshot | `OWNER_REJECTED` |
| 9.1–9.2 | Dešinysis baras kontekstinis; žemėlapis paaiškintas | LIVE | **vizualinis ir informacinis lygis neišbaigtas** | Paaiškinimo tekstas ≠ premium vizualizacija | „Tavo rinka" žiedas + unmapped paaiškinimas | Premium žemėlapio projekcija + legenda + duomenų vizualizavimas | Žemėlapio screenshot 7 viewport | `OWNER_REJECTED` |
| 10 | CV įkėlimas be „iki 5 MB" naštos | LIVE (§10 etapas 4) | nevertinta atskirai | — | Copy be MB, lubos 25 MB, kaina prieš veiksmą | Autentikuotas click-through | CV įkėlimo srauto screenshot | `NOT_REVIEWED` |
| 11 | Lokalizacija: jokių dev / koncepcinių žymių | LIVE (raw enum 0) | **neišbaigta** | Tikrinti tik `PLACEHOLDER`, `employee`, `owner` | `KONCEPCINIS` gyvai production | Pilnas §3.5/§11 terminų sąrašas visose 11 lokalių + patikra | Grep + production teksto dump 11 lokalių | `OWNER_REJECTED` |
| **12–13** | **Nauja IA ir premium vizualinė kryptis** | **LIVE (§12 etapas 5)** | **NEBAIGTA — ekranai neatrodo premium** | **6 šaltinio-teksto grep'ai (font floor, hex, `min-h-11`, z-index) pateikti kaip design pass** | **Tipografijos grindys ir spalvų literalai sutvarkyti; hierarchija, kompozicija, tankis, būsenos, mobile↔desktop paritetas nevertinti** | **Pilnas owner-visible design pass: hierarchija, informacijos kompozicija, duomenų vizualizavimas, tipografijos nuoseklumas, premium komponentų kokybė, pilnos empty/loading/error/success būsenos, vienoda kokybė desktop ir mobile** | **Kiekvieno owner-visible ekrano screenshot 7 viewport × 2 temos, su būsenų variantais** | **`OWNER_REJECTED`** |
| 15 | 15 priėmimo kriterijų production | 13/15 LIVE | **atmesta** | 13/15 skaičius neatspindėjo vizualinio priėmimo | Nė vienas iš 15 nėra savininko priimtas po `44da1dcb` | Kiekvienas kriterijus — savininko click-through | Savininko peržiūros protokolas | `OWNER_REJECTED` |
| **16** | **Vizualinė QA: 7 viewport × visos būsenos, realūs click/keyboard/focus/escape/back/refresh** | **LIVE (182/182 PASS)** | **NEBAIGTA — QA netikrino vizualinio priėmimo** | **182 = 13 patikrų × 7 viewport × 2 temos, visos tik `/lt` ir `/lt/auth/login`; 1 iš 13 privalomų §16 būsenų; 7 iš 63 antro harness'o patikrų — tautologijos** | **0 autentikuotų maršrutų; 0 autentikuotų screenshot'ų (visi 15 — landing / login)** | **Dviejų dalių QA: mechaninė (overflow, font, HTTP, DOM) + priėmimo (kompozicija, grafikai, hierarchija, tankis, suprantamumas, atitikimas GOAL); visos 13 §16 būsenų, autentikuotos, su scroll pozicijomis** | **Kiekvienos §16 būsenos artefaktas: harness žingsnis ARBA committintas screenshot** | **`OWNER_REJECTED`** |

---

## AGENT_DISCOVERED_ADDITIONAL_DEFECTS

Šie punktai NEPAKEIČIA savininko audito — tik jį papildo.

| # | Defektas | Būsena | Susijęs audito punktas |
|---|---|---|---|
| A-1 | Paieška neranda ką tik įrašytų realių duomenų | Fixas įdiegtas (`journal` šaltinis) — savininko nepatikrinta | 4.2 |
| A-2 | Chat žinutė gali dingti be pėdsako (pre-hydration) | Fixas įdiegtas — savininko nepatikrinta | 4.1 |
| A-3 | „Kiek valandų dirbau šiandien?" atsakoma log-work šablonu | Fixas įdiegtas — savininko nepatikrinta | 4.2 |
| A-4 | >30 s pagrindinės gijos užšalimai po navigacijos | **ATVIRA** | 14 P0.10 |
| A-5 | Viršutinio tabo paspaudimas kartais nesuveikia | **ATVIRA** (gali būti A-4 pasekmė) | P0.10 |
| A-6 | „1 įsipareigojimai" linksnis; panelė neatsinaujina be perkrovimo | **ATVIRA** | 9.1 |
| A-7 | Vietos ekstrakcija nepagauna „Kauno objekte" | **ATVIRA** | 6.3 |
| A-8 | Dviguba įrašo konfirmacija | **ATVIRA** | 4.3 |
| A-9 | Žurnalo įrašo meta „Vieta: labourmarket.ai" | **ATVIRA** | 6.2 |
| A-10 | Overlay z-index nepakanka (`backdrop-blur` stacking kontekstas) | Išspręsta architektūriškai; be committinto screenshot'o | P0.3 |
| A-11 | „Kiek valandų dirbau?" nesuskaičiuoja valandų sumos | **ATVIRA** — nėra valandų ledger'io | 4.2 |
| A-12 | Lietuviški intentai reikalavo diakritikų | Išspręsta (`fold()` + 9 testai) | 4.2 / §16 |
| **A-13** | **Etapas PAŠALINO vienintelę produkto duomenų vizualizaciją iš visų owner-visible paviršių.** `SupplyDemandChart` importuojamas tik iš `market-pulse.tsx`; `MarketPulse` išimtas iš landing PR #919; broliniai skydeliai liko tik `/dashboard/admin/market` (admin, §4.4 paslėptas). Chart bibliotekos `package.json` nėra. Landing'e `canvas` = 0, už ikoną didesnių SVG = 4 (2 dekoratyvūs, 1 žemėlapio forma, 1 readiness žiedas) | **ATVIRA — pirmas prioritetas** | 5.2 / 3.6 / 12 |
| **A-14** | **`KONCEPCINIS PAVYZDYS — PAVYZDINIAI SKAIČIAI` gyvai production**, nors §3.5 vardija `Koncepcinis` kaip šalinamą. Harness'as tikrino tik `PLACEHOLDER` / `employee` / `owner`. Sprendimas — §3.6 realūs duomenys, NE etiketės paslėpimas (addendum §2) | **ATVIRA** | 3.5 / 3.6 / 11 |
| **A-15** | **`§3.1 landing length` patikra yra tautologija** (`h > 0`) — visada PASS, nieko netvirtina, bet atrodo kaip §3.1 patikra | **ATVIRA** | 16 |
| **A-16** | **Realios savininko erdvės `engagement_contexts` eilutės neturi `started_at`** — autentikuota production patikra parodė „Be datos: 4 — laiko juostoje nerodomi". Laiko juosta veikia (landing pavyzdyje ir kode), bet savininko duomenyse nėra ko dėti. Tai DUOMENŲ, ne kodo spraga; kortelė elgiasi sąžiningai | **ATVIRA** — reikia arba datų įvedimo per pokalbį, arba datų užpildymo esamose eilutėse | 5.2 / 7.2 |
| **A-17** | **§5.1 niekada nebuvo išspręstas: kanoninė kortelė autentikuotame produkte buvo UŽDARAME `<details>` akordeone** (aukštis 39,6 px), todėl avataro meniu „Mano kortelė" deep-link nuvesdavo į 40 px antgalvį — pažodžiai savininko audito §5.1 defektas, nors atsekamumas rodė LIVE. Rasta autentikuotoje production patikroje 2026-07-30 | **IŠSPRĘSTA** PR #924 (`open` + guardas, mutation-tested) | 5.1 |

---

## LIKĘ BLOKATORIAI (galutiniam verdiktui)

Ankstesnis „liko du savininko gate'ai" **netiesa**. Realus sąrašas:

### Agento darbas (ne savininko gate)

1. ~~**§5.2 profesionali kanoninė Premium Player Card**~~ — **ĮDIEGTA IR GYVA
   production** (PR #923 + #924). Statusas: `OWNER_REVIEW_REQUIRED` — laukia
   savininko vizualinio priėmimo, ne agento verdikto.
2. **Trūkstami grafikai ir paaiškinamos duomenų vizualizacijos LIKUSIUOSE
   paviršiuose** (kalendorius, žinutės, žemėlapis, dashboard) — A-13 dalis
   kortelėje uždaryta, kitur atvira.
3. **§12 pilnas owner-visible premium design pass** — hierarchija, kompozicija,
   tankis, būsenos, mobile↔desktop paritetas.
4. **§7 / §8 / §9 Calendar / Messages / Map vizualinis ir informacinis lygis.**
5. **§3.6 realus žemėlapio momentas** → po to A-14 išnyksta savaime.
6. **§3.1 / §3.2 / §3.4 landing kompozicija ir premium lygis.**
7. **§16 reali vizualinė QA** — visos 13 būsenų, autentikuotos, 7 viewport ×
   2 temos, su priėmimo dalimi ir artefaktais.
8. **Production click-through** po kiekvieno etapo.
9. Atviri A-4…A-9, A-11, A-15.

### Savininko gate'ai (agentas užbaigti negali)

1. **P0.4 OAuth identitetas** — Supabase custom domain (billing) + DNS CNAME +
   Google Console redirect URI / consent branding. Po to agento darbas — vienas
   env pakeitimas. Detaliai: [`owner-gate-final-2026.md`](owner-gate-final-2026.md).
2. **P0.1 patvarus workspace pointer** — migracijos `20260714210000`
   pritaikymas production.
3. **Galutinis vizualinis priėmimas** — savininko peržiūra naujausio production
   deployment.
