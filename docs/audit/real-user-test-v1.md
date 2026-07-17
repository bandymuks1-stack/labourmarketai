# Real User Test v1 — „Vaikštau po sistemą kaip žmogus"

**Data:** 2026-07-17
**Šaka:** `train/real-user-test-v1` (nuo `origin/main` 4e51d8f5)
**Tipas:** AUDITAS — jokio produkto kodo keitimo. Tik šis dokumentas.

## Metodologija (sąžiningai)

Naudoti DU būdai — prie kiekvieno scenarijaus nurodyta, kuris:

1. **Gyvas dev serveris** (`next dev -p 3308`, lokaliai, worktree kodas, `.env.local`
   nukopijuotas iš pagrindinio medžio). Naršyta per naršyklės įrankius —
   **teksto / accessibility-tree pagrindu**: ekrano nuotraukos (screenshots)
   nuolat baigdavosi renderer timeout (greičiausiai dėl sunkių landing
   animacijų), todėl vizualinis sluoksnis (spalvos, lygiavimas, overflow)
   šiame audite vertintas ribotai. Padengta: landing `/lt`,
   `/lt/work-opportunities`, `/lt/worker-intake`, `/lt/company-need`,
   `/lt/auth/signup`, `/lt/auth/login`, `/lt/dashboard` (redirect elgsena),
   `/lt/invite/<neegzistuojantis-token>` (gyvas patikrinimas).
2. **Kodo peržiūra** (code walkthrough) — visiems autentifikuotiems srautams
   (onboarding, profilis, žurnalas, įmonės kūrimas, kvietimai, galimybės,
   žvalgyba). Priežastis: auditorius negali kurti paskyrų / jungtis
   slaptažodžiu, o `.env.local` rodo į **produkcinį** Supabase — jokių įrašų į
   produkcinę DB nedaryta. Nė viena forma nebuvo pateikta (submit), jokie
   laiškai / kvietimai nesiųsti. Cituojamos tikros LT UI eilutės iš
   `apps/web/messages/*` ir komponentų.

Persona: lietuvis statybininkas (ne programuotojas) ir smulkus statybos
darbdavys. Kiekvienas sustojimas — STOP įrašas vienodu formatu.

STOP įrašo formatas:

- **Kur:** maršrutas + elementas
- **Kodėl sustojau**
- **Kas neaišku**
- **Kas erzina**
- **Kas perteklinė**
- **Dev-kalba** (kas suprantama programuotojui, bet ne žmogui)

---

## ⚠️ PATIKRINIMAS PO AUDITO (2026-07-17) — produkcijos verifikacija

Po audito atliktas nepriklausomas patikrinimas prieš **realią produkcijos DB**
(gorgitwvdzxbnaxhrsrw, deploy = main `4e51d8f5`) ir pilną kodo trace.
Dalis šio audito išvadų — ypač visos trys KRITINĖS — **negalioja produkcijai**,
nes auditas rėmėsi kodo peržiūra be autentifikacijos ir pasenusiais
migracijų antraščių komentarais („NOT applied") bei honest-degradation
(sąžiningo degradavimo) būsenų tekstais, kurie produkcijoje nerodomi.

| # (top-10) | Audito teiginys | Verdiktas | Įrodymai |
|---|---|---|---|
| 1 | Darbuotojas negali „aplikuoti" — galimybės tuščios, tik vidinis signalas | **AUDIT_FALSE_POSITIVE** | Prod: `list_open_demand_for_workers` RPC yra; grąžina 9 `submitted` paklausas iš verifikuotų įmonių; `demand_interest_signals` — 4 realūs `interested` įrašai; „Parašyti darbdaviui" atidaro realią konversaciją (prod: 2 pokalbiai / 16 žinučių). „Galimybių sąrašas ruošiamas" rodomas tik kai RPC nepritaikyta — produkcijoje pritaikyta. |
| 2 | Darbdavys negali susisiekti — kontaktų prašymai „paruošti, bet dar neįjungti" | **AUDIT_FALSE_POSITIVE** | Ta frazė (`scouting.contactRequest.unavailable`) renderinama TIK kai `contact_disclosure_requests` lentelės nėra. Prod: lentelė + visos 5 RPC (`propose/respond/withdraw/list` + `grant_employer_data_disclosure`) YRA → realus mygtukas renderinamas. (0 panaudojimų — kelias atviras, bet dar nenaudotas.) |
| 3 | Naujo darbuotojo žurnalas užrakintas be aktyvaus darbo konteksto | **AUDIT_FALSE_POSITIVE** | Prod: trigger `on_worker_personal_engagement` YRA; 25/25 workers turi aktyvų kontekstą (24 asmeniniai be org). Migracijos antraštės pastaba „NOT applied to production" — pasenusi. |
| 4 | Kvietimo nuoroda neprisijungusiam = plikas login be konteksto | **PATVIRTINTA (by design)** | `invite/[token]/page.tsx:56-64` — redirect į login su `?next=`; preview RPC sąmoningai authenticated-only (kad neatskleistų, ar el. paštas turi paskyrą). Trūkumas realus, bet sprendimas — savininko privatumo/dizaino sprendimas, ne wiring klaida. |
| 5 | „Siųsti kvietimą" — siuntėjas mano, kad laiškas išsiųstas | **AUDIT_FALSE_POSITIVE (antra pusė)** | UI jau atskiria tris būsenas: „Nuoroda paruošta" (link mode + `linkModeNote`), „Išsiųsta" (tik po realaus provider 2xx), „Nepavyko išsiųsti". „Išsiųsta" link-mode niekada nerodoma. Pirma pusė (be `INVITE_EMAIL_*` env laiškas nesiunčiamas) — teisinga ir sąžiningai parodyta UI. |
| 2 (booking) | Booking reikalauja mokamo plano, kai mokėjimai „ruošiami" | **AUDIT_FALSE_POSITIVE** | `entitlementAllows` → `if (!enforced) return true`; enforced tik `stripe_test` režime. Default `PAYMENTS_ENABLED=false`; prod: `billing_customers=0`, `payment_webhook_events=0` → gate permisyvus, aklavietės nėra. |

**Kas lieka galiojančio iš top-10:** #4 (kvietimo kontekstas prieš login — owner
sprendimas), #6 (vieša `/lt/work-opportunities` be realių skelbimų + iliustraciniai
skaičiai — galioja), #7–#10 (žurnalo dual CTA, terminų chaosas, dev-kalba,
tu/Jūs — copy lygio pastabos, galioja).

**Pamoka auditams:** kodo peržiūra be produkcijos DB patikrinimo negali skirti
„funkcijos nėra" nuo „funkcija yra, o aš žiūriu į jos honest-degradation tekstą".
Visi trys KRITINIAI buvo antrasis atvejis.

---

## Scenarijus 1 — „Ieškau darbo"

*Metodas: gyvas dev serveris (viešos dalys) + kodo peržiūra (`/dashboard/opportunities`).*

Kelias: Google → landing `/lt` → „Darbuotojams" / „Darbo galimybės" →
registracija → dashboard → „Žiūrėti galimybes".

### STOP 1.1 — Puslapis „Darbo galimybės" neturi nė vieno darbo

- **Kur:** `/lt/work-opportunities` (gyvai patikrinta), visas puslapis.
- **Kodėl sustojau:** atėjau ieškoti darbo — puslapis vadinasi „Darbo
  galimybės — rask darbą", bet jame **nėra nė vieno darbo skelbimo**. Tik
  marketingo tekstas ir „Susikurti profilį / CV →".
- **Kas neaišku:** ar čia iš viso yra darbų? Kur jie? Ką gausiu susikūręs
  profilį?
- **Kas erzina:** pavadinimas žada „rask darbą", turinys — tik pažadas.
- **Kas perteklinė:** sekcija „Klausimai, kurių ieško darbuotojai" su
  keistomis trečio asmens citatomis („Darbuotojas neturi CV", „Kaip
  darbuotojui parodyti, ką moka") — tai SEO frazės, ne žmogaus kalba.
- **Dev-kalba:** —

### STOP 1.2 — Landing skaičiai dideli, bet parašyta, kad netikri

- **Kur:** `/lt` (gyvai), statistikos juosta („DARBUOTOJŲ PROFILIAI 320K…").
- **Kodėl sustojau:** po didelių skaičių — smulkus užrašas „ILIUSTRACINIAI
  SKAIČIAI — NE REALŪS RODIKLIAI".
- **Kas neaišku:** kam rodyti 320K, jei jie išgalvoti? Kiek žmonių čia yra
  iš tikrųjų?
- **Kas erzina:** pasitikėjimas krenta iškart — pirmas ekranas, ir jau
  „netikri skaičiai". Sąžininga, bet žmogui tai reiškia „platforma tuščia".
- **Kas perteklinė:** visa netikrų metrikų juosta.
- **Dev-kalba:** „NAUJI VEIKSMAI", „PROFILIO UŽPILDYMAS 72" — be konteksto
  neaišku, ką matuoja.

### STOP 1.3 — SKL/REL/SPD/SAF/ADP/TRS kortelių kodai

- **Kur:** `/lt` (gyvai), sekcija „Profilis, kuris stiprėja…" su pavyzdinėmis
  kortelėmis ir legenda „KĄ REIŠKIA KODAI: SKL — ĮGŪDIS · REL — PATIKIMUMAS…".
- **Kodėl sustojau:** kortelės atrodo kaip FIFA žaidimo kortos su
  triraidžiais kodais ir skaičiais 0–100.
- **Kas neaišku:** ką man, mūrininkui, reiškia „ADP 87"? Iš kur tie skaičiai?
- **Kas erzina:** reikia legendos, kad perskaityčiau savo pačio profilį.
- **Kas perteklinė:** patys kodai — legenda įrodo, kad jie nesuprantami.
- **Dev-kalba:** triraidžiai enum'ai UI (SKL, REL, SPD, SAF, ADP, TRS),
  „AUKSAS / SIDABRAS / BRONZA" lygos.

### STOP 1.4 — Prisijungus: galimybių lenta pagal nutylėjimą tuščia / „ruošiama"

- **Kur:** `/dashboard/opportunities` (kodo peržiūra:
  `apps/web/app/[locale]/dashboard/opportunities/page.tsx`,
  `lib/opportunities/load-worker-opportunities.ts`).
- **Kodėl sustojau:** numatytoji būsena — „**Galimybių sąrašas ruošiamas**…
  kai bus įjungta jų peržiūra darbuotojams" (kol owner-gated RPC neįjungtas),
  arba „**Patvirtintų galimybių dar nėra.**"
- **Kas neaišku:** kada „bus įjungta"? Ką man daryti dabar, be „užpildykite
  profilį"?
- **Kas erzina:** visas kelias (registracija, onboarding, profilis) atvedė į
  tuščią lentą.
- **Kas perteklinė:** —
- **Dev-kalba:** „Matomumas priklauso nuo tinklo dydžio ir jūsų pasiruošimo"
  — produkto logika, ne žmogaus atsakymas.

### STOP 1.5 — Net kai darbai matomi, nėra kur „kandidatuoti"

- **Kur:** `/dashboard/opportunities`, kortelės veiksmo zona
  (`WorkerInterestButton`).
- **Kodėl sustojau:** vienintelis veiksmas — „Išreikšti susidomėjimą", su
  pastaba „**Tai sukuria tik vidinį signalą. Jokia žinutė už platformos ribų
  nesiunčiama.**" Jei interest lentelė neįjungta — mygtuko iš viso nėra.
- **Kas neaišku:** ar darbdavys apskritai sužinos apie mane? Kas vyksta
  toliau? („Toliau: peržiūrėkite šią galimybę" — ratas užsidaro.)
- **Kas erzina:** negaliu atlikti to vieno veiksmo, dėl kurio atėjau —
  kandidatuoti.
- **Kas perteklinė:** —
- **Dev-kalba:** „vidinis signalas".

**Scenarijaus 1 STOP: 5.**

---

## Scenarijus 2 — „Kuriu profilį"

*Metodas: gyvas dev serveris (`/lt/worker-intake`, `/lt/auth/signup`) + kodo
peržiūra (onboarding, `/dashboard/profile`).*

### STOP 2.1 — Vieša darbuotojo anketa: „ZZP" ir laukai kableliais

- **Kur:** `/lt/worker-intake` (gyvai): laukai „Šalys, kuriose norite dirbti…
  atskirtos kableliais", „Kalbos… atskirtos kableliais", sekcija „Jei esate
  **ZZP** arba brigada", pasirinkimas „ZZP / savarankiškai dirbantis".
- **Kodėl sustojau:** „ZZP" — olandiškas terminas (zelfstandige zonder
  personeel); lietuvis statybininkas jo nežino. Šalis ir kalbas reikia rašyti
  ranka kableliais — vietoje pasirenkamų sąrašų.
- **Kas neaišku:** ar rašyti „Olandija" ar „Nyderlandai"? Lietuviškai ar
  angliškai? Kas atsitiks, jei suklysiu?
- **Kas erzina:** laisvo teksto laukai ten, kur turėtų būti paprastas
  pasirinkimas.
- **Kas perteklinė:** PVM / draudimo / sąskaitų klausimai eiliniam
  darbuotojui matomi iškart (nors pažymėta „neprivaloma").
- **Dev-kalba:** „ZZP", „subrangovas / per agentūrą" be paaiškinimų.

### STOP 2.2 — Du konkuruojantys CTA anketos apačioje

- **Kur:** `/lt/worker-intake` (gyvai): mygtukas „**Sukurti profilio
  juodraštį**" ir iškart po juo „**Susikurti darbuotojo profilį →**".
- **Kodėl sustojau:** du beveik vienodai skambantys veiksmai („sukurti
  profilio…" / „susikurti … profilį") — kurį spausti?
- **Kas neaišku:** kuo juodraštis skiriasi nuo profilio; ar užpildyta anketa
  išliks, jei eisiu registruotis.
- **Kas erzina:** rizika prarasti ką tik supildytą formą.
- **Kas perteklinė:** —
- **Dev-kalba:** „juodraštis" kaip sistemos būsena.

### STOP 2.3 — Registracija: „Darbo el. paštas" ir maišomas tu/Jūs

- **Kur:** `/lt/auth/signup` (gyvai).
- **Kodėl sustojau:** laukas „**Darbo el. paštas**" — statybininkas turi tik
  asmeninį Gmail; ar man iš viso galima registruotis? Slaptažodžiui reikia
  „Bent 8 simboliai, 1 didžioji raidė, 1 skaičius, 1 specialusis (!@#$%)".
- **Kas neaišku:** kodėl „darbo" paštas; kreipinys šokinėja — „Sukurkite
  paskyrą" (Jūs) ir čia pat „Prisiregistruok", „Pakartok slaptažodį" (tu).
- **Kas erzina:** griežti slaptažodžio reikalavimai telefonu.
- **Kas perteklinė:** sakinys „Jūsų atsiliepimai formuoja produktą —
  parašykite, kas veikia ir ko trūksta" registracijos formoje — ne vieta.
- **Dev-kalba:** —

### STOP 2.4 — Onboarding: „Asmuo ar įmonė?" — abstrakčios tapatybės

- **Kur:** `/onboarding`, rolės pasirinkimas
  (`components/app/onboarding-wizard.tsx`; kodo peržiūra).
- **Kodėl sustojau:** klausimas „Pradedate kaip asmuo ar įmonė?" su
  paaiškinimu „Asmuo ir įmonė yra **tapatybės**; samdymas, pirkimas… yra
  **veiksmai**, kuriuos pridėsite vėliau."
- **Kas neaišku:** ieškantis darbo žmogus savęs nevadina „Asmuo" — jis ieško
  „Darbuotojas / Ieškau darbo". Kitur sistemoje ta pati rolė vadinama
  „Darbuotojas" — žodynas nesutampa.
- **Kas erzina:** kortelės atrodo kaip „pasirink vieną", nors galima abi —
  tai pasakyta tik smulkiame tekste.
- **Kas perteklinė:** filosofinis „tapatybės vs veiksmai" paaiškinimas.
- **Dev-kalba:** rolių modelio abstrakcija UI.

### STOP 2.5 — „Pasiūlykite struktūrą" ir patvirtinimo maratonas

- **Kur:** `/dashboard/profile#profile-edit`
  (`profile-text-first-flow.tsx`; kodo peržiūra) — pagrindinis mygtukas
  „**Pasiūlykite struktūrą**"; po CV įkėlimo — kiekvieno pasiūlymo
  „Pridėti / Atmesti" + „Įtraukti pasirinktus pasiūlymus".
- **Kodėl sustojau:** parašiau „montavau baldus" — mygtukas siūlo…
  „struktūrą"? Įkėliau CV ir tikėjausi „importuota — viskas", o gavau
  patvirtinėjimo sąrašą. Jei žodynas nieko nerado — „Kol kas neradome aiškių
  pasiūlymų…" skamba kaip „importas nepavyko".
- **Kas neaišku:** kas ta „struktūra"; ar CV failas išsaugotas (parašyta
  „Pats failas nesaugomas" — gerai, bet pastebi ne visi).
- **Kas erzina:** daug smulkių sprendimų vietoje vieno „gerai".
- **Kas perteklinė:** —
- **Dev-kalba:** „struktūra", „pasiūlymai" = parserio žodynas.

### STOP 2.6 — Įrodymų lygių žodynas: „Savideklaruota" ir trys tarpusavyje panašūs lygiai

- **Kur:** `/dashboard/profile` ir CV eksportas (`messages/lt.json`
  „Savideklaruota — jūsų nurodyta…", `cvExport.tiers`: „Su įrašais" /
  „Paremta darbo įrašais" / „Nurodyta pačių"; kodo peržiūra).
- **Kodėl sustojau:** „Savideklaruota" — biurokratinė/teisinė kalba; trys
  lygiai skamba beveik vienodai.
- **Kas neaišku:** kuo „Su įrašais" skiriasi nuo „Paremta darbo įrašais"?
  Ką daryti, kad įgūdis „pakiltų" lygiu?
- **Kas erzina:** mano įgūdžiai pažymėti tarsi „nepatikimi", vos juos įvedus.
- **Kas perteklinė:** „Šaltinis: profilio tekstas" ant įgūdžio kortelės — DB
  kilmės laukas, žmogui nereikalingas.
- **Dev-kalba:** „Savideklaruota", „Šaltinis: profilio tekstas".

### STOP 2.7 — Po onboarding'o nėra vieno „baigta" taško

- **Kur:** `/dashboard/profile` (puslapis ~990 eilučių sekcijų; 5 žingsnių
  „Parenkime jūsų profilį" gidas išsibarsto po `#profile-edit`,
  `/dashboard#work-card`, `#cv-availability`, `/dashboard/journal`; kodo
  peržiūra).
- **Kodėl sustojau:** onboarding'as — tik 3 paspaudimai (gerai!), bet po jo
  atsiduri ilgame puslapyje su daugybe sekcijų (tapatybė, užpildymas,
  prieinamumas, kalbos, išsilavinimas, pasiekimai, išoriniai profiliai…) be
  aiškaus „toliau → toliau → baigta".
- **Kas neaišku:** kada profilis „pakankamai geras", kad kas nors mane rastų?
- **Kas erzina:** pojūtis, kad pildymas niekada nesibaigia.
- **Kas perteklinė:** tiek sekcijų pirmą dieną.
- **Dev-kalba:** —

**Scenarijaus 2 STOP: 7.**

---

## Scenarijus 3 — „Pildau dieną" (darbo žurnalas)

*Metodas: kodo peržiūra (`dashboard/journal/page.tsx`,
`journal-entry-composer.tsx`, `voice-journal-recorder.tsx`,
`messages/lt/journal.json`).*

### STOP 3.1 — Naujam darbuotojui žurnalas iš viso neatsidaro (aklavietė)

- **Kur:** `/dashboard/journal` (`page.tsx:220-224`), pranešimas „**Kol kas
  nėra aktyvaus darbo konteksto. Kai organizacija pakvies jus į komandą ir
  pridės, jūsų darbo įrašai atsidarys čia.**"
- **Kodėl sustojau:** atėjau užrašyti savo dienos — sistema sako, kad
  negaliu, kol manęs „nepridės organizacija". Pats to išspręsti negaliu.
- **Kas neaišku:** kas yra „darbo kontekstas"? Kokia „organizacija", jei
  dirbu sau arba tarp objektų?
- **Kas erzina:** visur reklamuojamas žurnalas („tavo darbo patirtis tyliai
  kaupiama Darbo žurnale") — o atėjus jis užrakintas.
- **Kas perteklinė:** —
- **Dev-kalba:** „aktyvus darbo kontekstas" (engagement modelio terminas).

### STOP 3.2 — Du lygiaverčiai mygtukai: „Išsaugoti įrašą" vs „Sutvarkyti tekstą"

- **Kur:** kompozitorius (`journal-entry-composer.tsx:1092-1120`).
- **Kodėl sustojau:** parašiau tekstą — du vienodai svarbūs mygtukai.
  „Sutvarkyti tekstą" skamba lyg privaloma prieš išsaugant.
- **Kas neaišku:** ar mano įrašas jau išsaugotas, jei paspaudžiau
  „Sutvarkyti"? (Redagavimo režime dar ir „Tekstą pakeitėte. Paspauskite
  „Sutvarkyti tekstą", kad sistema iš naujo įvertintų…" — gyvenimo ciklas,
  kurį turi suprasti pats.)
- **Kas erzina:** paprasčiausias kelias (rašyti → išsaugoti, 2 paspaudimai)
  egzistuoja, bet ekranas jo neparodo kaip pagrindinio.
- **Kas perteklinė:** —
- **Dev-kalba:** „Sutvarkyti tekstą" = parse/extract pipeline žmogaus
  žodžiais.

### STOP 3.3 — Pasiūlymų siena: iki ~10+ kortelių vienam įrašui

- **Kur:** peržiūros žingsnis (`journal-entry-composer.tsx:1256-1782`):
  grupės „Laikas / Kiekis / Galimos darbo kryptys / Objektas / Radome šiuos
  galimus įgūdžius / Galimas naujas įgūdis / Panašūs įgūdžiai / **Darbo
  fragmentai**", kiekvienai — „Pridėti / Pataisyti / Atmesti".
- **Kodėl sustojau:** norėjau užfiksuoti dieną per minutę — gavau 5–15
  sprendimų.
- **Kas neaišku:** ar privalau visas korteles peržiūrėti? Kortelė
  „**Nesuprasta / patikslinkite**" reikalauja etiketės, o jos paaiškinimas —
  sugadintas tekstas: „Be paaiškinimo jis liks be paaiškinimo ir
  **pasąraše**" (klaida kopijoje, žmogui neperskaitoma).
- **Kas erzina:** darbo diena virsta duomenų žymėjimo darbu.
- **Kas perteklinė:** „Darbo fragmentai" kaip atskiras kaupas.
- **Dev-kalba:** „fragmentas", „Sistema suprato", „Peržiūros sluoksnis".

### STOP 3.4 — Balso įrašas už sutikimo vartų

- **Kur:** `/dashboard/journal/voice` (`voice-journal-recorder.tsx:266-287`).
- **Kodėl sustojau:** prieš įkalbant dieną — keturi teisiniai punktai
  („Jūsų garso įrašas siunčiamas į LabourMarket.ai valdomą apdorojimo
  serverį…", 30 d. saugojimas) ir privalomas varnelės laukas „Suprantu ir
  sutinku su balso apdorojimu".
- **Kas neaišku:** kodėl kalbėti į savo dienoraštį reikia „apdorojimo
  sutikimo".
- **Kas erzina:** ~7 žingsniai (sutikimas → įrašyti → užbaigti → laukti →
  taisyti → naudoti → dar išsaugoti) tam, kas turėjo būti greičiausias kelias.
- **Kas perteklinė:** galutinis „Išsaugoti įrašą" po „Naudoti dienoraščio
  įraše" — dvigubas patvirtinimas.
- **Dev-kalba:** „apdorojimo serveris".

### STOP 3.5 — Būsenų žodynas nesuderintas tarp paviršių

- **Kur:** žurnalas + profilis + CV tiltas: `self_declared`=„Dar
  neperžiūrėta", `awaiting_confirmation`=„Laukia peržiūros",
  `confirmed`=„Su įrašais", o įrašo laiko juostoje `approved/confirmed`=
  „Peržiūrėta"; šakninis `lt.json` `cvBridge` sako „patvirtinta", o
  `lt/journal.json` `cvBridge` — „peržiūrėta" (dvi skirtingos to paties rakto
  kopijos!).
- **Kodėl sustojau:** trys–keturi skirtingi žodžiai toms pačioms 2–3
  būsenoms.
- **Kas neaišku:** kokia mano įrašo tikroji būsena ir kas atrakina kitą.
- **Kas erzina:** negaliu pasitikėti, kas „užsiskaito" į CV.
- **Kas perteklinė:** juosta „Įrašai → įgūdžiai → CV → pasiūlymai: 0 · 0 · 0"
  naujam vartotojui — produkto piltuvėlio diagrama, ne žmogaus informacija.
- **Dev-kalba:** būsenų enum'ai, piltuvėlio strėlytės.

### STOP 3.6 — Keturi būdai padaryti tą patį

- **Kur:** kompozitorius: tekstas / „Įrašyti balsu" / „Lentelės režimas —
  keli įrašai iš karto" / „Įrašo tipas: Greitas įrašas · Struktūruota
  ataskaita · Foto ataskaita" + „Šablonai pagal profesiją".
- **Kodėl sustojau:** per daug lygiaverčių pasirinkimų vienam veiksmui —
  pasirinkimo paralyžius.
- **Kas neaišku:** kuo „Struktūruota ataskaita" skiriasi nuo „Foto ataskaita"
  ir kada man kurio reikia.
- **Kas erzina:** —
- **Kas perteklinė:** bent du iš keturių režimų pirmo naudojimo metu.
- **Dev-kalba:** „režimai" = vidinis `ComposerMode` preset'ų sąrašas UI.

**Scenarijaus 3 STOP: 6.**
*(Pastaba: laimingasis kelias — 2 paspaudimai — egzistuoja ir yra geras;
problema ta, kad ekranas jo nepabrėžia.)*

---

## Scenarijus 4 — „Ieškau darbuotojo"

*Metodas: gyvas dev serveris (`/lt/company-need`) + kodo peržiūra
(`/dashboard/company/scouting`, `/dashboard/candidates`, `/dashboard/talent`).*

### STOP 4.1 — Poreikio formoje kalbos nurodomos ISO kodais

- **Kur:** `/lt/company-need` (gyvai), laukas „Kalbų reikalavimai — Atskirti
  kableliais (**pvz. en, nl**)".
- **Kodėl sustojau:** darbdavys turi žinoti, kad anglų = „en", olandų = „nl".
- **Kas neaišku:** ar rašyti „lietuvių", „lt", „LT"?
- **Kas erzina:** vėl laisvas tekstas kableliais vietoje pasirinkimo.
- **Kas perteklinė:** —
- **Dev-kalba:** ISO 639 kodai UI pavyzdyje.

### STOP 4.2 — Dvigubas CTA poreikio formos gale

- **Kur:** `/lt/company-need` (gyvai): „**Sukurti skelbimo juodraštį**" ir po
  juo „**Susikurti paskyrą ir pateikti poreikį →**".
- **Kodėl sustojau:** kaip ir worker-intake — du panašūs veiksmai, neaišku,
  kuris „tikras" ir ar forma išliks.
- **Kas neaišku:** kas nutinka su juodraščiu be paskyros.
- **Kas erzina:** rizika prarasti supildytą formą.
- **Kas perteklinė:** „Bendradarbiavimo modelis: Įdarbinimas / Subranga /
  **Tiekimas per agentūrą**" — „tiekimas" apie žmones skamba keistai.
- **Dev-kalba:** „juodraštis", „struktūruosime".

### STOP 4.3 — Žvalgyba reikalauja poreikio ir admin. sutvarkymo

- **Kur:** `/dashboard/company/scouting` (kodo peržiūra): be struktūruoto
  poreikio — „**Kol kas neturite poreikių. Sukurkite poreikį skydelyje…**";
  poreikis dar turi būti sustruktūruotas administratoriaus.
- **Kodėl sustojau:** norėjau tiesiog pasižiūrėti, kokių darbuotojų yra —
  negalima be poreikio aprašymo ir laukimo.
- **Kas neaišku:** kiek truks „struktūrizavimas" ir kas jį daro.
- **Kas erzina:** dviguba prielaida prieš pirmą naudą.
- **Kas perteklinė:** —
- **Dev-kalba:** „struktūruotas poreikis", „Žvalgyba" (pats pavadinimas
  karinis, bet bent lietuviškas).

### STOP 4.4 — Radau kandidatą — susisiekti negaliu (aklavietė)

- **Kur:** `/dashboard/company/scouting`, kortelės veiksmai:
  `RequestContactDetailsButton` → „**Kontaktų prašymai paruošti, bet dar
  neįjungti.**"; rezervacija → „**Tavo planas neapima rezervacijų — pradėk
  testinį apmokėjimą arba paprašyk piloto prieigos**", nors čia pat
  parašyta „Mokama platesnė prieiga dar neaktyvi (mokėjimai ruošiami)."
- **Kodėl sustojau:** pagrindinis veiksmas, dėl kurio atėjau (gauti
  kontaktą / pasiūlyti darbą), baigiasi „paruošta, bet neįjungta" ir
  „pradėk apmokėjimą", kurio neįmanoma pradėti.
- **Kas neaišku:** prieštaravimas: „pradėk testinį apmokėjimą" vs „mokėjimai
  ruošiami". Kandidatai anonimizuoti („Kandidatas" + kodas) — suprantama dėl
  privatumo, bet be veikiančio kontakto kelio tai galutinė siena.
- **Kas erzina:** sistema parodė tinkamą žmogų ir neleidžia nieko padaryti.
- **Kas perteklinė:** —
- **Dev-kalba:** kreipinys šokinėja („**Tavo** planas" vs visur „Jūs").

### STOP 4.5 — „Kandidatai" — ne paieška, o užrašinė

- **Kur:** `/dashboard/candidates` (kodo peržiūra): H1 „Kandidatų ir teikėjų
  **juodraščiai**", empty state „Juodraščių dar nėra…", bet navigacinis
  mygtukas į šį srautą žadėjo „**Ieškoti darbuotojų**".
- **Kodėl sustojau:** tikėjausi darbuotojų sąrašo — radau privačių užrašų
  bloknotą su disclaimeriu „Juodraštis nėra naudotojo paskyra… Niekas
  nesuporuojama dirbtiniu intelektu…".
- **Kas neaišku:** kam man vesti kandidatus ranka, jei sistema turėtų juos
  rasti?
- **Kas erzina:** pavadinimas ir turinys nesutampa.
- **Kas perteklinė:** ilgas honesty-disclaimer'is pirmame ekrane.
- **Dev-kalba:** „juodraštis", „teikėjai".

*(Pastaba ne-STOP: `/dashboard/talent` — tik superadmin; jame angliškas
dev-tekstas „Naršyti · Preview", „Worker cards (slice 1 · PR #88)", „Sample ·
Jonas P." — realus darbdavys jo nemato, bet jei vartai kada nors atsilaisvintų,
tai būtų pats blogiausias ekranas sistemoje.)*

**Scenarijaus 4 STOP: 5.**

---

## Scenarijus 5 — „Kuriu įmonę"

*Metodas: kodo peržiūra (`dashboard/start/page.tsx`,
`dashboard/start/company/page.tsx`, `company-setup-form.tsx`,
`dashboard/company/page.tsx`).*

Laimingasis kelias trumpas ir geras: „Pradėti įmonės nustatymą →" → įvesti
pavadinimą → „Išsaugoti įmonę" (3 veiksmai, rolė suteikiama automatiškai, be
aklaviečių). STOP'ai — kalboje ir tankyje:

### STOP 5.1 — „…blokuojama duomenų bazės lygmenyje"

- **Kur:** `/dashboard/start` įžanga (`start/page.tsx:77`): „…ar dar laukia
  veiksmo, ar **blokuojama duomenų bazės lygmenyje**."
- **Kodėl sustojau:** ką statybos įmonės vadovui reiškia „duomenų bazės
  lygmuo"? Skamba kaip gedimas.
- **Kas neaišku:** ar man reikia ką nors daryti?
- **Kas erzina:** techninis pasiteisinimas vietoje žmogiško paaiškinimo.
- **Kas perteklinė:** visa frazė.
- **Dev-kalba:** taip — DB architektūra UI tekste. Taip pat poraštė
  (`start/page.tsx:289`): „Visi skaičiai realūs **iš DB**."

### STOP 5.2 — Ta pati vieta vadinama trimis vardais

- **Kur:** `/dashboard/start` ir `/dashboard/start/company`: „Eiti į įmonės
  **dashboardą** →" (start/page.tsx:194), „Eiti į įmonės **erdvę** →"
  (setup puslapyje), o pats puslapis vadinasi „Įmonės **darbo erdvė**".
- **Kodėl sustojau:** trys pavadinimai tam pačiam tikslui; „dashboardą" —
  anglicizmas.
- **Kas neaišku:** ar „nustatymas", „erdvė" ir „dashboardas" — trys skirtingi
  puslapiai?
- **Kas erzina:** jau pradėjus — du panašūs mygtukai „Atidaryti įmonės
  nustatymą →" ir „Eiti į įmonės dashboardą →" be paaiškinimo, kuo skiriasi.
- **Kas perteklinė:** vienas iš dviejų mygtukų.
- **Dev-kalba:** „dashboardas"; taip pat įmonės skydelyje „Atitikimas /
  **matching** dar nesiūlomas" — angliškas dublis šalia lietuviško žodžio.

### STOP 5.3 — Numatytasis įmonės tipas — „Kita"

- **Kur:** `company-setup-form.tsx:189` (`company_type` default `other`).
- **Kodėl sustojau:** užpildžiau tik pavadinimą, išsaugojau — mano statybos
  įmonė tapo „Kita".
- **Kas neaišku:** ar tai kam nors turi įtakos (turi — tipo žymė ir
  agentūros režimo logika).
- **Kas erzina:** dažniausias realus atvejis (statyba) nėra numatytasis.
- **Kas perteklinė:** —
- **Dev-kalba:** —

### STOP 5.4 — Įmonės darbo erdvė — sekcijų siena pirmą kartą

- **Kur:** `/dashboard/company` (valdymo juosta: Komanda / Projektai /
  Kvietimai / Vietos / Galerija / Kalendorius + sprendimų juosta + ops +
  sąrašai + pagalba).
- **Kodėl sustojau:** ką tik sukūriau įmonę — ekranas pilnas skaitliukų su
  nuliais ir didžiųjų raidžių antraščių.
- **Kas neaišku:** koks PIRMAS veiksmas (be `CompanyNextActions` bloko —
  jokio vedimo).
- **Kas erzina:** pojūtis „sistemos administratoriaus pultas", ne „mano
  įmonė".
- **Kas perteklinė:** pusė sekcijų tuščiai įmonei.
- **Dev-kalba:** būsena „Aktyvi · nepatvirtinta" — subtilus skirtumas, kurį
  tenka aiškintis (nors paaiškinimas geras: „neturite laukti
  administratoriaus").

**Scenarijaus 5 STOP: 4.**

---

## Scenarijus 6 — „Kviečiu žmogų"

*Metodas: gyvas dev serveris (`/lt/invite/<token>` elgsena patikrinta gyvai) +
kodo peržiūra (`invite-panel.tsx`, `invite/[token]/page.tsx`,
`lib/email/transactional.ts`).*

### STOP 6.1 — Kvietimo nuoroda gavėjui = plikas prisijungimo langas (patikrinta gyvai)

- **Kur:** `/lt/invite/<token>` — neprisijungusiam gavėjui `redirect` į
  `/auth/login?next=…` (`invite/[token]/page.tsx:60-64`). Gyvai patikrinta:
  atsidaro TIK login forma, be jokio kvietimo konteksto.
- **Kodėl sustojau:** gavau žinutę „prisijunk prie mūsų komandos", paspaudžiau
  — ir matau anoniminį „Prisijungti / Tęsti su Google" langą. Kas mane
  kvietė? Kur? Kodėl turiu registruotis?
- **Kas neaišku:** viskas — kvietėjo vardas, įmonė, rolė parodomi tik PO
  registracijos/prisijungimo. Negaliojanti/pasibaigusi nuoroda taip pat
  reikalauja pirma susikurti paskyrą, kad pamatytum „Kvietimas nerastas".
- **Kas erzina:** didžiausias atkritimo taškas visame kvietimo cikle —
  būtent šaltam gavėjui, dėl kurio visa funkcija ir egzistuoja.
- **Kas perteklinė:** —
- **Dev-kalba:** —

### STOP 6.2 — „Siųsti kvietimą" pagal nutylėjimą nieko nesiunčia

- **Kur:** `/dashboard/network`, `invite-panel.tsx` + `transactional.ts:38-49`
  — be `INVITE_EMAIL_*` env kintamųjų laiškas nesiunčiamas; po mygtuko
  „**Siųsti kvietimą**" parodoma pastaba „**El. laiškų siuntimas dar
  neaktyvuotas — pasidalinkite kvietimo nuoroda tiesiogiai.**" ir ženkliukas
  „Nuoroda paruošta" + „Kopijuoti nuorodą / Dalintis".
- **Kodėl sustojau:** paspaudžiau „Siųsti" — buvau tikras, kad laiškas
  išėjo. Pastaba smulki, o mygtuko pavadinimas žada siuntimą.
- **Kas neaišku:** ar žmogus gavo kvietimą? (Negavo.)
- **Kas erzina:** turiu pats kopijuoti nuorodą ir siųsti per Messenger —
  tada kam „Siųsti kvietimą"?
- **Kas perteklinė:** —
- **Dev-kalba:** „neaktyvuotas".
- *(Sąžiningumo pliusas: sistema nerodo netikro „Išsiųsta" — „Išsiųsta" tik
  po realaus tiekėjo patvirtinimo. Mechanika gera, pavadinimas klaidina.)*

### STOP 6.3 — „Siūloma rolė" — kvietėjo laisvas tekstas be vertimo

- **Kur:** `/invite/[token]` (`page.tsx:128`): „Siūloma rolė: {role}" —
  rodoma tai, ką kvietėjas įrašė ranka (gali būti angliškas/enum'iškas
  tekstas).
- **Kodėl sustojau:** gavėjas gali pamatyti „Siūloma rolė: site_manager".
- **Kas neaišku:** ar tai pareigos, ar sistemos rolė.
- **Kas erzina:** —
- **Kas perteklinė:** —
- **Dev-kalba:** potencialiai — priklauso nuo kvietėjo įvesties.

**Scenarijaus 6 STOP: 3.**
*(Sąžiningumo pliusai: negaliojančio kvietimo tekstai žmogiški („Kvietimo
galiojimas baigėsi. Paprašykite naujo kvietimo."); token'ai saugūs; paskyros
egzistavimas neatskleidžiamas.)*

---

## TOP-10 — blogiausi žmogaus patirties lūžiai (prioritetų tvarka)

| # | Lūžis | Kur | Sunkumas | Paviršiaus savininkas |
|---|---|---|---|---|
| 1 | Darbuotojas negali kandidatuoti: galimybių lenta pagal nutylėjimą „ruošiama"/tuščia, o net su duomenimis vienintelis veiksmas — „vidinis signalas" arba jokio mygtuko | `/dashboard/opportunities` | KRITINIS | dashboard |
| 2 | Darbdavys negali susisiekti: kontaktų prašymai „paruošti, bet dar neįjungti", rezervacija reikalauja apmokėjimo, kuris „dar neaktyvus" — abu srautai baigiasi siena prieš pat pagrindinę naudą | `/dashboard/company/scouting` | KRITINIS | dashboard |
| 3 | Naujo darbuotojo žurnalas užrakintas: „nėra aktyvaus darbo konteksto" — žmogus negali pildyti dienos, kol jo nepridėjo organizacija, ir pats to išspręsti negali | `/dashboard/journal` | KRITINIS | journal |
| 4 | Kvietimo nuoroda gavėjui — plikas login langas be kvietėjo/įmonės konteksto (patikrinta gyvai); didžiausias atkritimo taškas | `/invite/[token]` | AUKŠTAS | first-impression |
| 5 | „Siųsti kvietimą" pagal nutylėjimą nesiunčia laiško — tik sugeneruoja nuorodą; siuntėjas lieka įsitikinęs, kad laiškas išėjo | `/dashboard/network` | AUKŠTAS | dashboard |
| 6 | Viešas „Darbo galimybės" puslapis be nė vieno darbo + landing „iliustraciniai skaičiai" — pirmas įspūdis „čia tuščia" | `/work-opportunities`, `/` | AUKŠTAS | first-impression |
| 7 | Žurnalo dvigubas CTA („Išsaugoti" vs „Sutvarkyti tekstą") + pasiūlymų kortelių siena paverčia 2 paspaudimų veiksmą 5–15 sprendimų darbu | `/dashboard/journal` kompozitorius | AUKŠTAS | journal |
| 8 | Būsenų žodyno chaosas: „Savideklaruota / Dar neperžiūrėta / Laukia peržiūros / Su įrašais / Peržiūrėta / Patvirtinta" — tos pačios 2–3 būsenos skirtingais žodžiais skirtinguose paviršiuose (plius dvi skirtingos `cvBridge` kopijos) | profilis + žurnalas + CV | AUKŠTAS | language |
| 9 | Dev-kalba UI: „blokuojama duomenų bazės lygmenyje", „iš DB", „dashboardą", „Atitikimas / matching", „Pasiūlykite struktūrą", „darbo kontekstas", „fragmentai", ISO kodai „en, nl", SKL/REL/SPD kodai, ZZP; plius sugadinta eilutė „liks be paaiškinimo ir pasąraše" | visur po truputį | VIDUTINIS | language |
| 10 | Onboarding „Asmuo ar Įmonė" abstrakcija (niekur kitur rolė nevadinama „Asmuo") + šokinėjantis tu/Jūs kreipinys (signup, scouting) | `/onboarding`, `/auth/signup` | VIDUTINIS | profile / language |

## Bendra suvestinė

- STOP įrašų iš viso: **30** (S1: 5 · S2: 7 · S3: 6 · S4: 5 · S5: 4 · S6: 3).
- Struktūrinė išvada: **abu pagrindiniai vartotojų tikslai (gauti darbą /
  gauti darbuotoją) šiandien baigiasi sąmoningai užvertais vartais** —
  sąžiningai pažymėtais („dar neįjungta", „ruošiama"), bet žmogui tai vis
  tiek siena. Kol neatsidarys bent vienas galas iki galo (kandidatavimas
  ARBA kontaktas), visi kiti UX taisymai yra antriniai.
- Teigiama: laimingieji keliai trumpi (onboarding 3 paspaudimai, įmonė 3,
  žurnalo įrašas 2), sąžiningumo principas („Išsiųsta" tik po realaus
  siuntimo, jokių fake AI teiginių) įgyvendintas nuosekliai, raw enum'ai į
  darbuotojo UI beveik nepatenka.

## Vizualinio sluoksnio pastaba

Ekrano nuotraukos gyvame serveryje nepavyko (renderer timeout — tikėtina dėl
landing animacijų apkrovos; pats faktas vertas dėmesio kaip našumo signalas
silpnesniems įrenginiams). Vizualiniai vertinimai (kontrastas, overflow,
mobilus išdėstymas) šiame audite nepadengti — rekomenduojama atskira
`playwright-visual-qa` sesija.
