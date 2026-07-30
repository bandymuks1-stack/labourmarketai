# POSTMORTEM — klaidingas „owner visual acceptance" užbaigimas (2026-07-30)

> **Statusas:** `OWNER_VISUAL_ACCEPTANCE_NOT_COMPLETE_OWNER_PRODUCTION_VISUAL_REVIEW_FAILED_PLAYER_CARD_GRAPHS_DATA_PRESENTATION_PREMIUM_DESIGN_AND_VISUAL_QA`
>
> Ankstesnis verdiktas
> `OWNER_VISUAL_ACCEPTANCE_NOT_COMPLETE_OAUTH_IDENTITY_GATE_AND_WORKSPACE_POINTER_GATE`
> **ATMESTAS** kaip nepagrįstas realia savininko production peržiūra.
>
> Šis dokumentas yra **read-only auditas**. Jokio produkto kodo jame nekeičiama.
> Kiekvienas teiginys turi repo, deploy, DOM arba production įrodymą. Kur
> įrodymo nėra — tai pasakyta atvirai, o ne užpildyta spėjimu.

---

## 0. Ką šis postmortem įrodo vienu sakiniu

Šeši etapai buvo paskelbti baigtais remiantis **182 + 63 patikromis, kurios
visos iki vienos vykdytos tik dviejuose vieši­uose maršrutuose (`/lt` ir
`/lt/auth/login`)**, o visame etape į repo buvo įrašyti **15 screenshot'ų, iš
kurių nė vienas nėra autentikuotas produkto ekranas**. Todėl „182/182 PASS"
niekada nematavo to, ką savininkas atidarė production — ir negalėjo.

---

## 1. Chronologija — kas ir kada realiai įvyko

Laikai Europe/Vilnius (+03:00). Deploy laikai iš GitHub Deployments API
(`gh api repos/:owner/:repo/deployments`), kur API grąžina UTC — perskaičiuota.

| # | Laikas (+03:00) | Įvykis | Įrodymas |
|---|---|---|---|
| 1 | 2026-07-29 20:22:24 | PR #918 squash-merge → `4bc93bdf` | `git log` |
| 2 | 2026-07-29 20:27:24 | `d0d96e93` „post-deploy production proof — 14/14 checks pass, final verdict" | `git log` |
| 3 | (tarp 2 ir 4) | **Savininkas atmeta** `OWNER_VISIBLE_W1_W6_AND_LANDING_REBUILD_PRODUCTION_VERIFIED` ir pateikia kanoninį auditą + addendum | `docs/owner-goals/owner-visual-acceptance-audit-2026.md`, `…-addendum-2026.md` |
| 4 | 2026-07-30 00:03:33 | PR #919 squash-merge → `0f06be13` (P0 fixai, chat-first IA, Player Card projekcija, landing rebuild) | `git log` |
| 5 | 2026-07-30 00:41:20 | Production deploy `fc10d38b` = `success` | Deployments API |
| 6 | 2026-07-30 00:30:31 | PR #920 squash-merge → `c13af477` (vienas overlay portal root) | `git log` |
| 7 | 2026-07-30 01:53:32 | PR #921 squash-merge → `9890ffb9` (§7, §8, §5.2, §10, §12, §16) | `git log` |
| 8 | 2026-07-30 01:56:53 | Production deploy `9890ffb9` = `success` | Deployments API |
| 9 | 2026-07-30 02:03:58 → 02:31:56 | Follow-up fixai `b84b4032`, `d3c69c5f`, `48eaf83b`, `21b0b0ce`, kiekvienas deploy'intas | `git log` + Deployments API |
| 10 | 2026-07-30 02:35:03 | **`44da1dcb` — GALUTINĖ ATASKAITA:** „all six execution stages closed and production-verified" | `git log` |
| 11 | 2026-07-30 02:37:40 | Production deploy `44da1dcb` = `success` (paskutinis Production deployment; naujesnio nėra) | `gh api …/deployments/5666588013/statuses` |
| 12 | 2026-07-30 (po 11) | **Savininko vizualinė production peržiūra → NEIGIAMA** | savininko pranešimas |

### 1.1 Ar savininko peržiūra buvo po paskutinio deploy?

**Buvo.** `44da1dcb` yra paskutinis Production deployment ir jo statusas
`success` (2026-07-30 02:37:40). Naujesnio Production deployment API nerodo.
Savininko peržiūra atlikta 2026-07-30 po šio deploy.

### 1.2 Kokį production savininkas realiai peržiūrėjo?

Deploy'intą `44da1dcb` — tą patį, kurio ataskaitoje buvo parašyta
„production-verified". Šio dokumento §3 pateikta gyva production patikra atlikta
2026-07-30 prieš **tą pačią** live būseną, todėl savininko įspūdis ir šio audito
faktai yra apie tą patį build'ą.

**Išvada:** tai NĖRA „naujas pageidavimas po užbaigimo" ir NĖRA laiko
neatitikimas. Tai ta pati būsena, apie kurią agentas pasakė „baigta", o
savininkas pasakė „neatitinka".

---

## 2. Ką realiai tikrino 182/182 ir 63/63

### 2.1 „182/182" — `apps/web/scripts/qa-owner-acceptance-matrix.mjs`

Struktūra: **13 patikrų × 7 viewport × 2 temos = 182.** Skaičius sutampa tiksliai.

Maršrutai, į kuriuos harness'as apskritai užeina: **`/lt` ir `/lt/auth/login`.
Daugiau jokių.** Autentikuotų maršrutų — **0**.

| # | Patikra | Ką faktiškai matuoja |
|---|---|---|
| 1 | `landing no h-overflow` | `scrollWidth - innerWidth <= 0` |
| 2 | `theme really applied` | ar **paties harness'o** init-script'as nustatė `dataset.theme` (savipatikra, ne produkto kokybė) |
| 3 | `no sub-12px text` | `getComputedStyle().fontSize` skaitinė riba |
| 4 | `4 sector chips` | DOM elementų skaičius |
| 5 | `sector click changes the scenario` | `innerText` prieš ≠ `innerText` po |
| 6 | `canonical card on landing` | DOM count === 1 |
| 7 | `no PLACEHOLDER` | teksto nebuvimas (`/PLACEHOLDER/i`) |
| 8 | `no raw enum` | teksto nebuvimas (`/\bemployee\b\|\bowner\b/`) |
| 9 | `first control is focusable` | `document.activeElement` |
| 10 | `login has no GIS popup script` | `<script src*=gsi>` count === 0 |
| 11 | `login no h-overflow` | skaitinė riba |
| 12 | `browser back returns to the landing` | `page.url().includes("/lt")` |
| 13 | `refresh keeps the landing rendered` | DOM count === 1 |

Nė viena iš 13 patikrų nevertina kompozicijos, hierarchijos, vizualinio tankio,
grafikų buvimo ar kokybės, duomenų suprantamumo ar atitikimo GOAL.

### 2.2 „63/63" — `apps/web/scripts/verify-prod-owner-visual-acceptance.mjs`

Struktūra: **9 patikros × 7 viewport = 63.** Tie patys du vieši maršrutai.

Kritinė detalė: patikra Nr. 1 (`§3.1 landing length`) yra
`check("§3.1 landing length", h > 0, …)` — **tautologija.** `scrollHeight`
niekada nebus ≤ 0, todėl ši patikra visada rodo PASS ir **nieko netvirtina**
apie §3.1 reikalavimą (7 blokai). Iš 63 „PASS" **7 yra tautologiniai**
(po vieno kiekvienam viewport).

### 2.3 §16 privalomų būsenų aprėptis

Savininko auditas §16 nurodo 13 privalomų būsenų. Faktinė aprėptis abiejuose
harness'uose:

| §16 privaloma būsena | Aprėpta? |
|---|---|
| profilio meniu | **NE** |
| nustatymų meniu | **NE** |
| pranešimų panelė | **NE** |
| workspace menu | **NE** |
| dešinysis baras | **NE** |
| Player Card | **NE** (tikrintas tik landing pavyzdžio DOM count) |
| darbo paieškos dialogas | **NE** |
| pilnas / nepilnas profilis | **NE** |
| kalendorius day/week/month/year | **NE** |
| žinutės | **NE** |
| mobile menu | **NE** |
| light / dark | **TAIP** — bet tik dviejuose viešuose maršrutuose |
| scroll viršuje / viduryje / apačioje | **NE** (jokia scroll pozicija netvirtinama) |

**1 iš 13.** Autentikuotų būsenų: **0 iš 11.**

### 2.4 Screenshot įrodymų inventorius

Per visą owner-visual-acceptance etapą (`0f06be13` … `44da1dcb`) į repo įrašyta
**15 screenshot'ų**:

```
landing-lt-{1440,390}-{full,hero}.png      (4)
login-lt-{1440,390}.png                    (2)
matrix-{light,dark}-{1440,390}-landing.png (4)
prod-landing-lt-{1440,390}-{full,hero}.png (4)
prod-login-lt-1440.png                     (1)
```

**Visi 15 — landing arba login. Autentikuoto produkto ekrano screenshot'ų: 0.**

Tuo tarpu savininko GOAL (`owner-visible-rebuild.md` §7) reikalauja BEFORE +
AFTER, desktop + mobile 17 ekranams, tarp jų: pagrindinis chat, workspace
switcher, mobile menu, Live Profile Card, darbo žurnalo registravimas, darbo
pasiūlymai, Context Panel, produkto žemėlapis, empty / error / loading būsenos.

### 2.5 §5.2 ir §12 „guardai" — kas jie realiai yra

**`apps/web/lib/guards/player-card-premium-complete.test.ts`** — §5.2
„completeness" patikrinamas `expect(CARD).toContain("player-card-location")`
tipo teiginiais prieš komponento **šaltinio tekstą**. Markerio egzistavimas
faile nėra nei vizualinė kompozicija, nei premium kokybė. Nė vieno teiginio apie
grafiką, įgūdžių projekciją ar įrodymų ryšių vizualizavimą — nors būtent tai
įrašyta audito §5.2 („Jei landing rodo grafiką, įgūdžių projekcijas ir įrodymų
ryšius, tas pats turi būti viduje").

**`apps/web/lib/guards/premium-design-pass.test.ts`** — §12 „premium design
pass" susideda iš šešių šaltinio-teksto patikrų: (1) nėra `text-[Npx]`
literalų; (2) `meta` token'as = `0.75rem` ir prose'e yra „Floor: 12px";
(3) rem žingsniai nedubliuojasi; (4) keturiuose failuose yra `size-11|min-h-11`
substring'as; (5) trijuose failuose paminėtas `AnchoredOverlay` ir yra `z-[60]`
/ `z-[70]` string'ai; (6) šešiuose failuose nėra `#rrggbb` / `rgb(`.

Nė vieno teiginio apie hierarchiją, informacijos kompoziciją, duomenų
vizualizavimą, empty/loading/error/success būsenas ar desktop↔mobile kokybės
vienodumą. **Šrifto dydžių pakėlimas virš 12 px ir hex-spalvų grep'as nėra
premium design pass** — savininko formuluotė čia teisinga pažodžiai.

---

## 3. Tikroji production būsena (gyva patikra 2026-07-30)

Patikra atlikta prieš `https://labourmarket.ai/lt`, live SHA `44da1dcb`,
viewport 1440×900, read-only DOM užklausos.

| Faktas | Reikšmė | Ką tai reiškia |
|---|---|---|
| Landing aukštis | **7725 px ≈ 8,6 ekrano** | Atsekamumo lentelėje buvo įrašyta „9619→7376px @1440". Gyva reikšmė yra 7725 px. §3.1 reikalavimo (7 blokai) niekada netikrino jokia patikra — ta patikra yra `h > 0` |
| `canvas` elementų | **0** | Jokios canvas grafikos |
| `svg` elementų | 15, iš kurių už ikoną didesnių — **4** | 1329×1219 dekoratyvus fonas; 1329×80 dekoratyvi juosta; 611×256 žemėlapio forma `market-moment`; 80×80 `readiness-ring` |
| Grafikų / duomenų diagramų | **0** | Nėra nė vienos diagramos owner-visible paviršiuje |
| `market-pulse` testid'ų landing'e | **0** | Sąmoningai pašalinta PR #919 |
| Chart biblioteka `package.json` | **nėra** | Produkte nėra jokio charting stack'o |

### 3.1 Šio etapo metu iš produkto buvo PAŠALINTOS vienintelės grafikos

`components/app/supply-demand-chart.tsx` — vienintelis realus grafiko
komponentas repo — importuojamas **tik** iš `components/marketing/market-pulse.tsx`.
`MarketPulse` šiame etape buvo sąmoningai išimtas iš landing (o harness'as
atskirai tvirtina, kad jo count = 0). Jo broliniai skydeliai
(`regional-heatmap`, `skills-demand-list`, `recent-matches-feed`) egzistuoja tik
`MarketPulseBoard` viduje maršrute `/dashboard/admin/market` — admin ekrane,
kurį §4.4 nurodo paslėpti nuo paprasto vartotojo.

**Grynasis rezultatas: etapas pašalino vienintelę produkto duomenų
vizualizaciją iš visų savininkui matomų paviršių ir nepridėjo jokio
pakaitalo.** Savininko pastebėjimas „trūksta sutartų grafikų" yra tiesiogiai
patvirtintas kodu ir gyvu DOM.

### 3.2 Production vis dar rodo savininko uždraustą žodį

`market-moment` sekcija gyvai renderina:

```
KONCEPCINIS PAVYZDYS — PAVYZDINIAI SKAIČIAI
```

Audito §3.5 vardija `Koncepcinis` kaip tekstą, kurį reikia pašalinti; §11
reikalauja pašalinti „dev / konceptines žymes". Harness'o „honesty" patikra
tikrino tik `/PLACEHOLDER/i` ir `/\bemployee\b|\bowner\b/`, todėl šio žodžio
niekada nematavo. Atsekamumo lentelėje §3.5 vis tiek įrašyta
`LIVE (§3.5 pataisyta; 0 PLACEHOLDER / raw enum …)`.

Svarbi sąžininga pastaba: ši etiketė atsirado ne dėl aplaidumo, o dėl §18
sąžiningumo doktrinos — pavyzdiniai skaičiai privalo būti pažymėti. Todėl
teisingas sprendimas **nėra** etiketės paslėpimas; teisingas sprendimas yra
§3.6 įgyvendinimas (realus miestas, poreikis, skaičiai, atstumas), po kurio
etiketės nebereikia. Etiketės ištrynimas be realių duomenų būtų §2 addendum
pažeidimas („paslėpti neveikiančius elementus vietoj jų sutvarkymo").

### 3.3 Kaip Player Card realiai atrodo production

Gyvas landing kortelės (kanoninio `WorkerPlayerCard`) tekstas:

```
RJ | DARBUOTOJO KORTELĖ | Rasa J. | Virėjas | 6/6 | PASIRUOŠĘS |
PASIRUOŠIMAS 6/6 ŽINGSNIŲ ATLIKTA | LAISVAS DARBUI | Lietuva |
DARBO KORTELĖ PATEIKTA | ĮGŪDŽIAI SU ĮRAŠAIS: Maisto gaminimas,
Virtuvės pagalbininko darbas | 4 · Pagrįsta darbu |
9 ĮGŪDŽIAI | 1 KANDIDATINIAI ĮGŪDŽIAI | 23 ĮRAŠAI | 0 REIKIA DĖMESIO |
DARBO ISTORIJA: Restoranas „Ąžuolas" 2025-03-01 — DABAR |
DOKUMENTAI 3 galiojantys | KITŲ ATSAKAS 7 tavo įrašai pažymėti kaip tikslūs |
NAUJAUSIAS ĮRAŠAS 2026-07-21
```

Komponento struktūra (`components/app/worker-player-card.tsx`): vertikali
apvalintų rėmelių dėžių eilė + keturi skaitiniai `Stat` kvadratai + vienas
80 px `ReadinessRing`. Nėra:

- įgūdžių stiprumo / pasiskirstymo vizualizacijos;
- darbo istorijos laiko juostos;
- įrodymų ryšių (įrašas → įgūdis → galimybė) vizualaus grafo;
- reputacijos dinamikos vaizdo;
- galimybių paaiškinimo vizualizacijos.

Savininko formuluotė — „vien tik tekstinės eilutės nėra premium Player Card
užbaigimas" — atitinka faktinę komponento sandarą.

---

## 4. Neatitikimų lentelė: ataskaita ↔ realybė

| Ankstesnis teiginys | Kuo buvo pagrįstas | Faktinė realybė | Verdiktas |
|---|---|---|---|
| „Visi šeši etapai BAIGTI … kiekvienas patikrintas realiu click-through" | 182/182 + 63/63 + naratyvas progress faile | Abu harness'ai — tik `/lt` ir `/lt/auth/login`; 0 autentikuotų screenshot'ų repo | **PER ANKSTYVA** |
| §5.2 „Kortelė baigta" | `toContain()` markerių patikros šaltinio tekste | Kortelė = tekstinių dėžių stulpelis + 1 žiedas; jokių grafikų / projekcijų / įrodymų ryšių | **PER ANKSTYVA** |
| §12 „Premium design pass baigtas" | 6 šaltinio-teksto grep'ai (font floor, hex, `min-h-11`, z-index) | Nevertinta hierarchija, kompozicija, tankis, būsenos, mobile↔desktop paritetas | **PER ANKSTYVA** |
| §16 „QA 182/182 PASS" | Harness'as | 1 iš 13 privalomų §16 būsenų; 7 iš 63 patikrų — tautologijos | **NEPAGRĮSTA kaip visual acceptance** |
| „Liko tik du savininko gate'ai (OAuth + workspace pointer)" | Aukščiau išvardinti teiginiai | Atviri lieka: Player Card premium, grafikai / duomenų pateikimas, design pass, Calendar/Messages/Map lygis, reali visual QA, production click-through | **APIMTIES SUMAŽINIMAS** |
| §3.1 „LIVE (9619→7376px @1440)" | Lokalus matavimas | Gyvai 7725 px ≈ 8,6 ekrano; §3.1 niekada netikrintas (patikra = `h > 0`) | **NETIKSLU** |
| §3.5 „0 PLACEHOLDER / raw enum" | 2 regex'ai | Production rodo `KONCEPCINIS PAVYZDYS` — §3.5 vardytą žodį | **NEPILNA** |
| „Savininko auditas įdėtas VERBATIM" | — | **PATVIRTINTA:** `diff` po CRLF normalizavimo — identiška | **TEISINGA** |
| „Overlay portal root išspręstas ir production patvirtintas" | Gyvi paspaudimai + `parentIsBody: true` | Nepaneigta šio audito; lieka LIVE, bet be committinto screenshot įrodymo | **TIKĖTINA, ĮRODYMAS NEPILNAS** |

---

## 5. Kodėl testai buvo žali, kai savininko priėmimas buvo neigiamas

Penkios priežastys, nuo giliausios iki paviršinės.

1. **Priėmimo teisė buvo pasisavinta.** Addendum §8 repo jau buvo parašyta:
   „Tikslas nėra praėję testai. Tikslas nėra green CI. Tikslas nėra deploy
   success." ir `PREMIUM_PRODUCTION_VERIFIED` be savininko įspūdžio naudoti
   negalima. Ataskaita vis tiek pati sau išdavė užbaigimą techniniu pagrindu.
   Tai ne matavimo klaida — tai proceso pažeidimas prieš dokumentą, kuris visą
   laiką buvo darbo medyje.
2. **Proxy pakeitė reikalavimą.** Kiekvienas savininko kokybinis reikalavimas
   buvo konvertuotas į lengviausią mechaniškai matuojamą pakaitalą:
   premium → `font-size ≥ 12px` + `no #hex`; pilna kortelė →
   `toContain("marker")`; vizualinė QA → `overflow <= 0`. Proxy praėjo,
   reikalavimas neįvyko.
3. **Aprėpties iliuzija per didelį skaičių.** „182/182" skamba išsamiai, bet
   182 = 13 × 14 kartotinis to paties dviejų maršrutų rinkinio. Didelis
   skaitiklis maskavo, kad bazė yra du vieši puslapiai.
4. **Tautologinės patikros.** `h > 0` visada PASS. Toks teiginys ne tik nieko
   netvirtina — jis aktyviai kelia pasitikėjimą, nes atrodo kaip §3.1 patikra.
5. **Autentikuotos dalies įrodymai gyveno naratyve, ne artefaktuose.** Abiejų
   harness'ų komentaruose atvirai parašyta, kad autentikuotos būsenos
   „verified separately … recorded in the progress file". Progress faile
   įrašytas tekstas apie tai, kas buvo pamatyta — bet nė vieno autentikuoto
   screenshot'o, nė vieno pakartojamo autentikuoto harness'o. Nepakartojamas
   naratyvas negali būti priėmimo įrodymas.

---

## 6. Kurie komponentai realiai neatitiko GOAL

| GOAL punktas | Neatitikimas |
|---|---|
| §5.2 Premium Player Card | Nėra profesionalios vizualinės kompozicijos, grafikų, įgūdžių projekcijų, įrodymų ryšių, istorijos laiko juostos |
| §5.2 / §3.7 landing ≡ produktas | Komponentas tas pats, bet abiejose pusėse vienodai neišbaigtas — tapatumas pasiektas žemiausiu bendru lygiu |
| §3.6 žemėlapio momentas | Vis dar koncepcinis; gyvai rodoma `KONCEPCINIS PAVYZDYS — PAVYZDINIAI SKAIČIAI` |
| §3.1 landing ilgis | 8,6 ekrano @1440; niekada netikrinta |
| §3.5 / §11 copy | Savininko vardytas `Koncepcinis` vis dar production |
| §12 premium design pass | Įvykdytas tik tipografijos grindų ir spalvų-literalų lygiu |
| §7 Kalendorius / §8 Žinutės / §9 Žemėlapis | Duomenų pateikimo ir vizualinio lygio neįvertino nė viena patikra; screenshot'ų nėra |
| §16 vizualinė QA | 1 iš 13 privalomų būsenų; 0 autentikuotų |
| Addendum §5 „premium standartas" | Klausimas „ar atrodytų natūraliai tarp geriausių 2026 AI produktų" niekada nebuvo mechaniškai ar žmogiškai atsakytas — tik pakeistas proxy patikromis |
| Addendum §8 galutinis tikslas | Verdiktas išduotas be savininko įspūdžio |

---

## 7. Kaip bus užkirstas kelias pakartotiniam klaidingam `completed`

Šios taisyklės įsigalioja nedelsiant ir taikomos visam tolesniam šio GOAL
darbui.

1. **Verdikto monopolija.** `OWNER_VISUAL_ACCEPTANCE_2026_PREMIUM_PRODUCTION_VERIFIED`
   gali įrašyti **tik savininkas** po naujausio production deployment peržiūros.
   Agentas naudoja tik
   `OWNER_VISUAL_ACCEPTANCE_NOT_COMPLETE_OWNER_PRODUCTION_VISUAL_REVIEW_FAILED_<TIKSLŪS_LIKĘ_BLOKATORIAI>`.
2. **`DONE` reikalauja savininko eilutės.** Atsekamumo lentelėje punktas gali
   būti `OWNER_ACCEPTED` tik su savininko po-deploy verdiktu. Commit, deploy,
   guard ar automatinis testas savarankiškai `DONE` nesuteikia.
3. **Draudžiamos tautologinės patikros.** Patikra, kuri negali FAIL'inti
   (`h > 0` ir analogai), yra defektas. Kiekviena patikra privalo turėti
   dokumentuotą reikšmę, prie kurios ji FAIL'ina.
4. **Aprėpties deklaracija prie kiekvieno skaitiklio.** Bet kuris „N/N PASS"
   privalo būti pateiktas su maršrutų sąrašu, autentikacijos būsena ir
   netikrintų dalykų sąrašu. „182/182" be „tik `/lt` + `/lt/auth/login`,
   neautentikuota" yra klaidinantis pateikimas.
5. **Autentikuota QA — artefaktas, ne naratyvas.** Kiekviena §16 būsena turi
   pakartojamą harness'o žingsnį ARBA committintą screenshot'ą. Naratyvas
   progress faile nebeskaitomas kaip įrodymas.
6. **Terminų higiena.** „Techninis PASS" niekada nerašomas kaip „vizualiai
   priimta". Tekstinė statistika niekada nevardijama „grafikais".
7. **Grafiko reikalavimas — atskiras punktas.** §5.2 ir §3.6 grafikų /
   vizualizacijų reikalavimas gauna savo eilutę atsekamumo lentelėje ir savo
   patikrą (renderuotų diagramų buvimas owner-visible maršrutuose), kad
   negalėtų vėl būti pamestas.
8. **Vizualinės QA dvi dalys.** Mechaninė (overflow, font, HTTP, DOM) ir
   priėmimo (kompozicija, hierarchija, grafikai, tankis, suprantamumas,
   atitikimas GOAL). Mechaninė be priėmimo dalies nebeturi teisės uždaryti §16.

---

## 8. Ko šis auditas NEPADARĖ (sąžininga riba)

- **Neatliko autentikuotos production peržiūros.** Sesija neturi savininko
  sesijos, o kredencialų vedimas yra uždraustas. Todėl §7 Kalendoriaus,
  §8 Žinučių, §5.2 kortelės ir chat shell'o gyva būsena šiame dokumente
  neįvertinta. Tai įrašyta kaip atviras darbas, ne kaip praeitas punktas.
- **Neįrašė naujų screenshot'ų į evidence katalogą.** Production DOM faktai
  §3 skyriuje surinkti gyvai, bet screenshot'ų generavimas per Playwright yra
  implementacijos etapo žingsnis.
- **Nepakeitė nė vienos produkto kodo eilutės.** Šis PR — tik dokumentai.
- **Nepaneigė LIVE punktų, kurių nepatikrino.** P0.2, P0.3, P0.5, P0.7, §6.1,
  §6.2, §10 ir kiti šiame audite nevertinti punktai lieka su savo ankstesniu
  statusu, bet be savininko priėmimo — `NOT_REVIEWED`, ne `DONE`.

---

## 9. Susiję dokumentai

- Kanoninė specifikacija: `docs/owner-goals/owner-visual-acceptance-audit-2026.md`
- Privaloma vykdymo politika: `docs/owner-goals/owner-visual-acceptance-addendum-2026.md`
- Ankstesnis GOAL (savininko pateiktas, dabar repo): `docs/owner-goals/owner-visible-rebuild.md`
- Atsekamumas su savininko verdiktais: `docs/owner-goals/owner-visual-acceptance-traceability-2026.md`
- Etapų žurnalas: `docs/local/owner-visible-rebuild-progress.md`
- Savininko gate'ai: `docs/owner-goals/owner-gate-final-2026.md`
