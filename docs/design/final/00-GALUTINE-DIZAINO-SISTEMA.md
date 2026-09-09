# LABOURMARKET.AI — GALUTINĖ PRODUKTO PATIRTIS IR DIZAINO SISTEMA
Data: 2026-09-05. Statusas: **PATVIRTINTA SAVININKO IR UŽŠALDYTA (FROZEN)** — su pataisymais, įrašytais `00-FROZEN-DESIGN-CONTRACT.md`. Esant neatitikimui tarp šio dokumento ir FROZEN kontrakto, galioja FROZEN kontraktas.

Vizualinis rinkinys: `labourmarket-final-design/01…27.png` (privalomasis komplektas) + `A1…A4.png` (alternatyvos, įvertintos prieš pasirenkant) + `mockup-source/` (HTML/CSS/generatorius; į kodą nekopijuojama — produkte tokenai tik iš `apps/web/tokens/*` ir `globals.css`). **Visi duomenys paveikslėliuose — iliustraciniai**, kiekvienas paveikslėlis tai pažymi.

---

## 0. Atkurta prieš išrandant

Perskaityta ir sutikrinta: `OWNER_MASTER_EXECUTION_CONTRACT_2026-09-04` (§1–§38, §1a), `WORLD_STATE_UX_ARCHITECTURE_V1`, `DESIGN.md` (565 eil.), `LABOURMARKETAI_PREMIUM_VISUAL_SYSTEM` (V1–V10, L0–L4), `tokens/{colors,typography,motion,radii,shadows}.ts`, `globals.css` kanalai, `lib/player-card/*`, `lib/market-map/*`, `lib/conversation/*` (deterministinis router + action registry), migracijos (project_worker_assignments, project_stages, work_tasks, journal_entries + confirmations + photos, worker_documents, document_files, marketplace_listings, service_offerings, team_details/team_enquiries, education_programs/cohorts, training_programs/assignments, booking_requests, customer_requests), RESUME_CHECKPOINT 09-04.

Kas pasikeitė nuo DRAFT 1 dėl doktrinos:
- **Pokalbis neprivalomas.** DRAFT 1 pokalbį dėjo kaip nuolatinį kairį stulpelį; dabar jis — atidaromas skydelis / apatinė juosta, o pagrindinė scena visada vizuali.
- **Pasiruošimas kontekstinis.** DRAFT 1 turėjo 4 fiksuotus segmentus (dokumentai · įgūdis · kalba · mobilumas) — pažeidė §11. Dabar juostos segmentų skaičius = konkretaus konteksto reikalavimų skaičius.
- **Laukas (Field) — atskiras lęšis**, operacinis, su tiesiogine manipuliacija; DRAFT 1 tai buvo tik „World stulpelis".
- **Laikas ir kilmė — medžiaga, ne ženkliukai.** Faktas/išvesta/prognozė ir SELF/EVIDENCE/EMPLOYER/THIRD/SYSTEM turi vizualinę medžiagą (kraštas, tekstūra, kontūras), ne pill'ų sriubą.
- **Marketplace ir Time** pridėti kaip lęšiai; My Space — neprivalomas, po #1475.
- **Mobile — trys skirtukai** (Šiandien · Pasaulis · Paklausk), Field/Context — sheet'ai, ne skirtukai.

---

## A. GALUTINĖ DIZAINO DOKTRINA

1. **Vienas pasaulis, trys atstumai.** Pasaulis (kur kas yra) → Laukas (vienas operacinis kontekstas) → Context (vienas objektas). Judėjimas gilyn — fokusas ir sheet'ai, ne puslapiai. Kiekvienas lygis turi kanoninį adresą, bet peržiūra vyksta neišeinant.
2. **Dvi lygiavertės durys.** Vizuali (paspaudimas, tempimas) ir kalbinė (sakinys, balsas) — tas pats stuburas: intent → kontekstas → trūkstami duomenys → autorizacija → kanoninis veiksmas → įrašas → readback → visi lęšiai. Nė viena galimybė neegzistuoja tik viename kelyje.
3. **Būsena visada matoma, atsakymas visada su pagrindu.** Kiekvienas AI ar išvestas teiginys turi šaltinį, laiką, šviežumą. AI niekada nėra autoritetas ar duomenų bazė.
4. **Spraga niekada nėra pabaiga.** Kiekvienas „trūksta" tęsiasi: kodėl svarbu → kas tinka → kas gali padėti → kur/kada/kiek → veiksmas → būsena → įrodymas → perskaičiavimas.
5. **Kilmė yra medžiaga.** Savideklaruota — brūkšninis kraštas; įrodymais pagrįsta — cyan; darbdavio patvirtinta — auksas; trečiosios šalies — dvigubas auksas; sistemos išvesta — taškinis pilkas. Auksas niekada nėra dekoracija.
6. **Laikas yra medžiaga.** Faktas — solid; išvesta — įžambi tekstūra + „išvesta iš…"; prognozė — brūkšninis kontūras + prielaida. Praeitis/Dabar/Toliau — vienas skruberis visuose lęšiuose.
7. **Nėra bendro žmogaus balo.** Lygis L0–L5 + šaltinis + pasiruošimas konkrečiam kontekstui. Jokių žvaigždučių, žiedų-procentų, „87/100".
8. **Tuščia = tvarkinga.** Attention, rizika, Marketplace rodo tik tai, kas tikrai reikia. Niekas nerodoma dėl pilnumo.
9. **Objektas, ne eilutė.** Žmogus, komanda, įmonė, projektas, zona, poreikis, programa, paslauga, įrodymas, dokumentas — atpažįstami iš formos, ne iš etiketės.
10. **Premium iš aiškumo.** Hierarchija, tipografija, erdvė, medžiaga, tikra informacija, priežastis→pasekmė. Be gradientų, glassmorphism, fake grafikų, kortelių sriubos, žaidimo estetikos.

---

## B. PRODUKTO PATIRTIES ARCHITEKTŪRA (`27`)

Aštuoni lęšiai virš vienos būsenos:

| Lęšis | Klausimas | Web | App |
|---|---|---|---|
| Conversation | pasakyk / paklausk / veik | atidaromas kairysis skydelis arba apatinė juosta (⌘K); niekada privalomas | skirtukas „Paklausk" + ilgas paspaudimas ant objekto; balsas |
| World | kur kas yra | pagrindinė scena („Pasaulis") | skirtukas „Pasaulis", natyvus žemėlapis |
| Field | vienas operacinis kontekstas | pagrindinė scena („Laukas") | pilno ekrano sheet iš World/Šiandien |
| Context | vienas objektas | dešinė panelė 360 px (≥1280) / drawer (<1280) | bottom sheet |
| Attention | kas reikia manęs | skaitiklis viršuje → skydelis | namai „Šiandien" + push |
| Marketplace | kas uždaro poreikį | atsiranda ten, kur spraga (Context, Field, World sluoksnis) | tas pats, sheet |
| My Space | prisegti dalykai | 64 px dokas kairėje (po #1475) | prisegtos kortelės „Šiandien" viršuje |
| Time | kas buvo / yra / bus | skruberis viršuje, medžiaga objektuose | tas pats |

Kanoninis ciklas (§2 užduoties): realus pasaulis → geografija+laikas → žmonės/įmonės/projektai/poreikiai → supratimas/atitikimas → leidžiamas veiksmas → darbas → įrodymas → patvirtinimas → rezultatas → atnaujinta būsena. Kiekvienas lęšis rodo šio ciklo pjūvį; nė vienas jo nedubliuoja.

---

## C. OBJEKTŲ KALBA (`04`, `07`, `12`, `13`, `14`, `17`, `19`)

| Objektas | Forma | Kas jame būtinai matoma |
|---|---|---|
| **Person / Player** | horizontali kortelė su **kilmės kraštu** kairėje, avataras, kontekstinė pasiruošimo juosta | kas · ką daro · kilmė · pasiruošimas šiam kontekstui · laisvas nuo · vienas kitas veiksmas |
| **Team** | sluoksniuoti avatarai + **aprėpties žetonai** (turi / trūksta brūkšniniu) | sudėtis · aprėptis · vieta · laisva nuo · kur gali eiti · komandos įrodymai |
| **Company** | kortelė su **oranžine viršutine juosta** ir **vaidmenų juosta** (darbdavys · rangovas · tiekėjas · …) | vaidmenys vienu metu · projektai · žmonės · pajėgumas · dėmesys |
| **Project** | **laukas** — juostos = zonos/darbo paketai, žetonai = žmonės | kas dabar · kas toliau · trūkstamas pajėgumas · rizika · pasiruošę kraštas |
| **Work package / zone** | juosta su kairiuoju būsenos kraštu (baigta žalia · dabar cyan · rizika gintarinė · blokas raudona) | laikas · reikalavimai · žmonės · progresas · įrodymai |
| **Opportunity / Demand** | **brūkšninis lizdas** (slot) — tuščia vieta, kurią reikia užpildyti; pilnas → virsta žetonu | kiek · kada · kur · sąlygos · kas tinka |
| **Programme / Pathway** | **kelias** su etapais (baigta · dabar · prognozė brūkšninė) | teorija → sertifikatas → praktika → patvirtinimas → darbas |
| **Service / Resolution** | kortelė su **faktų eilute mono** (kur · kada · kiek) ir „kodėl tinka" | greitis · kaina · pasitikėjimas · tinka/netinka |
| **Evidence** | žetonas su nuotraukos/dokumento miniatiūra ir laiku | kas · kada · kur · patvirtinta ar ne |
| **Document / Credential** | juosta su **galiojimo laiko juosta** (žalia → gintarinė → brūkšninė trūksta) | galioja iki · kam reikalingas · kas uždaro |

Skiriamieji ženklai: Person — kraštas; Team — sluoksniai; Company — vaidmenų juosta; Project — juostos-zonos; Demand — brūkšnys; Programme — kelias; Service — mono faktai; Document — laiko juosta. Ta pati šeima: `r-object 14px`, `surface-raised`, `line-decor`, Bricolage antraštėms, mono skaičiams.

---

## D. WEB DARBO ERDVĖS SISTEMA (`02`, `08`–`12`, `20`)

Viršus 56 px: prekės ženklas · **konteksto pill'as** (akcento kvadratėlis + „Org › Projektas" ▾) · **Pasaulis | Laukas** perjungiklis · **laiko skruberis** (Praeitis · Dabar · Toliau, prognozė brūkšniu) · Attention skaitiklis · „Paklausk ⌘K" · avataras.
Scena: `[Conversation 380 px, uždarytas pagal nutylėjimą] + [World | Field, minmax(0,1fr)] + [Context 360 px, atsidaro paspaudus objektą]`. Apačioje — composer (48 px, plaukiojantis), tekstas „Paklausk arba parašyk, ko reikia — arba tiesiog dirbk vizualiai".
Breakpoint'ai: ≥1280 — trys sritys; 1024–1279 — Context kaip drawer (L3), Conversation kaip drawer; <1024 — mobile taisyklės (E).
Klaviatūra: ⌘K composer; ↑↓ objektai lauke; Enter → Context; Esc uždaro; tab tvarka top → scena → Context. Hover — tik papildoma informacija, niekada vienintelis kelias.
Deep link: `/lt/projects/[id]` atidaro Lauką su kontekstu; `/lt/people/[id]` — Pasaulį su Context; adresas keičiasi tik pereinant tarp kanoninių objektų, ne atidarant panelę.

---

## E. MOBILE / NATYVIOS PROGRAMĖLĖS SISTEMA (`03`, `18`, `24`–`26`)

Trys skirtukai: **Šiandien** (Attention + dabartinis laukas + kitas darbas; push atveda čia) · **Pasaulis** (natyvus žemėlapis, sluoksniai, objektas → sheet) · **Paklausk** (Conversation, balsas). Laukas ir Context — sheet'ai (kontekstiniai režimai). My Space — prisegtos kortelės „Šiandien" viršuje; ketvirtas skirtukas tik jei naudojimas ≥30 %. Aštuonių skirtukų nebus.
Objekte (`25`): taikiniai ≥56 px apačioje, vienas veiksmas ekrane, balsas lygiavertis, šviesi tema pagal aplinką, juodraštis lokaliai, fono įkėlimas, būsena „išsaugota telefone" matoma.
Natyvūs gebėjimai → tie patys kanoniniai veiksmai: kamera → journal_entry_photos/document_files; vieta/laikas → žurnalo faktai (su leidimu); push → Attention; balsas → composer/žurnalas; share → deep link į objektą; biometrija → grįžimas; offline → journal juodraštis + sinchronizacija. Jokio atskiro backend'o.
Tęstinumas (`26`): kanoninė būsena DB, nebaigtas veiksmas kaip juodraštis, „Tęsti" kortelė „Šiandien" viršuje, deep link.

---

## F. PREMIUM PLAYER CARD SISTEMA (`04`, `05`, `A1`)

Trys koncepcijos įvertintos: **K1 Pasas su kraštu — pasirinkta** (kilmė = kraštas, pasiruošimas = kontekstinė juosta, mastelis be perdarymo); K2 Įrodymų juosta — naudojama tik tapatybės rodinyje (neatsako „kam pasiruošęs dabar"); K3 Pasiruošimo žiedas — atmesta (skaitomas kaip balas, pažeidžia §19).
Šeima (viena kanoninė Person būsena):
- **Compact** — sąrašuose, laukuose, komandose: kraštas · avataras · vardas · rolė · vieta · laisvas nuo · juosta.
- **Standard** — World, atitikimai, Marketplace: + patvirtinimų pill'as, top 3 įgūdžiai su L, patvirtintos valandos, pasiruošimas aktyviam kontekstui.
- **Expanded / Premium** — Context, profilis, dalinimasis: visi įgūdžiai su lygiu, juosta, šaltiniu ir data; dabar/laisvas/kalbos/dokumentai tinklelis; žurnalas ir patvirtintojai.
- **Project-specific** — Standard + to projekto reikalavimų knyga (5 eilutės kaip `05`).
- **Opportunity-specific** — tas pats su galimybės reikalavimais; skiriasi tik reikalavimai.
- **Team-context** — Compact + vaidmuo komandoje + ko trūksta vaidmeniui.
- **Mobile** — Standard vertikaliai, juosta po vardu, vienas mygtukas.
Per 2–5 s atsakoma: kas · ką daro · ką įrodė · kodėl tikėti (kraštas + šaltinis) · kam pasiruošęs (juosta) · kur/kada (meta) · spraga (gintarinė/brūkšninė dalis) · dabar (lane „Dabar") · kitas veiksmas (mygtukas).

## G. LAUKO / STADIONO SISTEMA (`08`–`10`, `A2`)

Dvi koncepcijos: **F1 Zonų juostos laike — pasirinkta** (veikia visuose sektoriuose, laikas įmontuotas, prieinama kaip sąrašas, mobile vertikaliai); F2 Objekto planas — papildomas rodinys tam pačiam laukui, kai projektas turi zonų geometriją (ne pagal nutylėjimą: reikia plano, laikas nematomas, spatial-only a11y rizika, „žaidimo" rizika).
Erdvinė kalba: **aktyvi juosta** (cyan) = vyksta; **zonos** = darbo paketai/etapai; **žetonai** = priskirti; **pasiruošę kraštas** (brūkšninė juosta apačioje) = gali ateiti; **atvykstantys** = brūkšninis cyan žetonas; **užblokuotas** = raudonas kraštas; **trūkstamas pajėgumas** = brūkšninis raudonas lizdas; **laikas** = skruberis + juostų tvarka. Sporto terminų kanoniniuose duomenyse nėra — tik UI žodžiai „laukas", „zona", „pasiruošę".
Operacinis: pasirinkti žetoną → Context; tempti žetoną/komandą į kitą lauką → **kas-jei peržiūra abiem projektams** (`10`) → patvirtinti; paspausti lizdą → tinkami žmonės/komandos dešinėje (`09`); paspausti užblokuotą → spraga → sprendimai; paspausti zoną → komanda, reikalavimai, progresas, įrodymai, rezultatas. Kiekviena manipuliacija = registruotas kanoninis veiksmas (`assign`, `move`, `stage-status`, `task-status`), niekada — vien UI būsena.

## H. KOMANDOS SISTEMA (`07`)

Komanda = objektas su sudėtimi, aprėptimi (turi/trūksta), vieta, laisvumu, dabartiniu priskyrimu, pajėgumu, komandos įrodymais, judėjimo galimybėmis. Ta pati kortelė: World (žetonas su „· 3 žm."), Laukas (žetonas zonoje arba pasiruošę krašte), atitikimas (Standard su aprėptimi vs reikalavimai), Marketplace (kaip pasiūla, su €/h ir „kodėl tinka"), Įmonė (komandų eilė). Trūkstama aprėptis komandoje = brūkšninis žetonas → spraga → sprendimas.

## I. ĮMONĖS VIZUALINĖ OS (`12`, `A3`)

Dvi koncepcijos: **C1 Projektai laike × pajėgumas — pasirinkta** (atsako „kas vyksta, kur, su kuo, kas toliau, ko trūksta" vienu žvilgsniu; eilutė = laukas; skalė). C2 Laukų tinklelis — atmesta kaip namai (laikas nematomas, 70 projektų = kortelių siena), naudojama Pasaulyje kaip klasteriai.
Sudėtis: vaidmenų juosta (vienu metu darbdavys · rangovas · tiekėjas · paslaugų teikėjas · mokymų partneris — ne rolė) → projektų laukas laike (dabar | toliau išvesta | rizika) → keturi objektai: pajėgumas dabar · trūksta per 4 sav. · dėmesys · partneriai (klientai, rangovai, tiekėjai, komandos, mokyklos, paslaugos). Be pokalbio. Be KPI plytelių — skaičiai tik ten, kur veda į veiksmą.

## J. MARKETPLACE SISTEMA (`14`–`16`, `A4`)

Modeliai: **M1 Sprendimas vietoje spragos — pasirinkta**; M2 Katalogas su filtrais — atmesta (atsietas nuo poreikio, filtrų juosta kaip pagrindinė patirtis, 1M begalinis sąrašas).
Patirtis: poreikis → 2–5 tinkami → „kodėl šie / kodėl ne kiti" (kiek atmesta ir dėl ko) → pasitikėjimas (klientas, naudota anksčiau, patikrinta) → vieta/laikas/kaina (mono) → veiksmas → rezultatas įrašomas prie spragos (projekto, žmogaus, komandos).
Vienas Marketplace, penki kontekstai: poreikis (`14`), projektas ir žmogus (`15`), žemėlapis (`16` — World sluoksnis „pasiūla", tik tai, ko trūksta), tiekėjas (Company Context su „ką gali suteikti"). Objektai: paslauga, mokymas, sertifikatas, būstas, transportas, komanda/darbo jėga, kitas patvirtintas resursas — visi kaip `Resolution` kortelė su skirtinga faktų eilute (naktys/€, dienos/€, km/min, €/h).

## K. WORLD / MAP SISTEMA (`16`, `20`)

Sluoksniai: mano žmonės · mano projektai · trūksta · partnerių komandos · rinkos poreikiai (klasteriai) · pasiūla (Marketplace) · mokyklos. Viewport ribos, klasteriai su skaičiais, semantinis mastelis (Europa: šalys ir klasteriai → regionas: projektai ir komandos → objektas: laukas). Niekada >60 objektų ekrane. Prognozė/rinka — brūkšninis kontūras (ne mano). Valdymas sakiniu („Rodyk komandas, laisvas prie Roterdamo kitą mėnesį") ir ranka (sluoksnių pill'ai, mastelis). Prieinama alternatyva: kiekvienas World rodinys turi sąrašo rodinį tais pačiais objektais (Field juostos).

## L. GYVA PROFESINĖ TAPATYBĖ (`06`)

Ne CV. Kairė — praeitis→dabar faktais (objektai, valandos, įrašai, patvirtinimai, sertifikatai); dešinė — dabar→toliau išvesta ir prognoze: **įrodyta** (lygiai su šaltiniu) → **pasiruošęs** (N galimybių aplink su x/y) → **tampu** (jei įvykdysiu…) → **AI darbe** (įrodyta gebėjimas deleguoti/prižiūrėti/tikrinti AI rezultatus — arba „dar nėra įrodymų"). Kanoninė progresija: darbas/mokymasis → užduotis → žmogaus indėlis (+ AI) → įrodymas → peržiūra/patvirtinimas → rezultatas → įrodytas gebėjimas → tapatybė. Ta pati kortelė visiems aktoriams; skiriasi tik §20 privatumo laukai.

## M. ĮRODYMO / KILMĖS / PATVIRTINIMO KALBA (`04`, `19`)

Klasės ir medžiaga: SELF_DECLARED — brūkšninis pilkas kraštas + „iš CV, nepatvirtinta"; EVIDENCE_SUPPORTED — cyan kraštas + „14 žurnalo įrašų / sertifikatas iki…"; EMPLOYER_CONFIRMED — auksinis kraštas + „patvirtino Nonstop, 2025-06"; THIRD_PARTY_CONFIRMED — dvigubas auksinis + kas; SYSTEM_DERIVED — taškinis + „išvesta iš…". Kraštas niekada vienintelis signalas — visada ir tekstinė šaltinio eilutė (a11y). Grandinė (`19`): darbuotojas užrašo (nepatvirtinta) → brigadininkas patvirtina Attention'e (vardas + laikas, audit) → tapatybė atsinaujina automatiškai (lygis kyla tik iš patvirtintų įrašų; AI siūlo, niekada nepakelia).

## N. PASIRUOŠIMO / SPRAGOS / SPRENDIMO SISTEMA (`05`, `11`)

Pasiruošimas = **reikalavimų knyga konkrečiam kontekstui**: galimybė, projektas, darbo paketas, vaidmuo, klientas, reguliavimas. Reikalavimų rūšys: įgūdis, patirtis, dokumentas, sertifikatas, medicininė, kalba, laisvumas, mobilumas, mokymas, kliento, reguliacinis, projekto specifinis. Kiekviena knygos eilutė: būsena (įvykdyta žalia · baigiasi/nepatvirtinta gintarinė · trūksta brūkšninė raudona · nežinoma pilka) · šaltinis · galiojimas. Juosta kortelėje = ta pati knyga suspausta; segmentų skaičius kinta.
Spraga: kodėl svarbu (kurioms galimybėms) → kas tinka (kokia forma, galiojimas) → kas gali padėti (nuo greičiausio: kur · kada · kiek · kodėl tinka/netinka) → veiksmas (vienu žodžiu ar paspaudimu) → būsena (rezervuota · vizitas · įrodymas) → perskaičiavimas (3/5 → 5/5 žmogui, komandai, projektui).

## O. MOKYMAS → DARBAS (`17`, `18`)

Institucijos laukas: rinkos paklausa 90 d. iš tikrų poreikių (su brūkšniniais lizdais, ko trūksta kandidatams) → kelias su etapais → mokiniai kaip tie patys Person (kilmės kraštas) → praktikos spragos (brūkšninis lizdas „4 be praktikos vietos" → darbdaviai su atvirais poreikiais netoli) → rezultatai laidai (dirba pagal profesiją · patvirtinti darbdavių). Mokinys mobile: kelias, praktikos valandos, didelis „Užrašyti praktiką", patvirtinimai, „po praktikos" išvesta. Ne LMS: nėra kursų katalogo, pažymių, forumų.

## P. LAIKO KALBA (`21`)

Praeitis (solid, žalia/auksas) · Dabar (cyan, „atnaujinta prieš N min" visada) · Toliau (išvesta — įžambi tekstūra; prognozė — brūkšninis kontūras). Faktas — turi šaltinį ir laiką; išvesta — „išvesta iš N įrašų"; prognozė — „prielaida: …" ir „jei nieko nedarysim". Vienas skruberis visuose lęšiuose; objektas laike = tos pačios juostos su kitu kraštu. Šviežumas — meta eilutė kiekvienam gyvam objektui.

## Q. RESPONSYVUMO / PLATFORMOS TAISYKLĖS

Semantiškai vienoda: objektų kalba, hierarchija, būsenų medžiaga, kilmė, pasiruošimas, Player, Team, Field, World, Attention, Marketplace, Conversation, Context, veiksmų pavadinimai. Skiriasi mechanika (skirtukų pavadinimai — V1 prototipo hipotezė, ne negrįžtama architektūra): web — panelės, klaviatūra, hover; app — skirtukai, sheet'ai, gestai, kamera, vieta, push, balsas, natyvus žemėlapis. Vienas sluoksnių žodynas (`tokens.css` semantika → CSS / iOS / Compose): `surface.base|raised|inset`, `line.decor|control`, `text.1|2|3`, `accent.action|live|org`, `trust`, `state.ok|attention|risk`, `selection`, `focus`, `radius.object|control|sheet`, `elevation.L1–L4`, `motion.out|spring`, `type.identity|metric|section|body|meta|label`.

## R. JUDESYS

Aiškina, ne puošia: Pasaulis → Laukas (fokusas 220 ms); Context slide-in 180 ms; **perkėlimas** — žetonas juda, abu pajėgumo skaičiai keičiasi kartu (`10`); būsenos pokytis — juostos kraštas keičia spalvą; patvirtinimas — kraštas tampa auksinis vieną kartą (spring, „uždirbta"); Attention išsprendimas — įrašas išnyksta į „Viskas tvarkoje". `prefers-reduced-motion` — momentinis; `tokens/motion.ts` — vienintelis šaltinis. Jokių hover/fade kiekvienai kortelei.

## S. PRIEINAMUMAS

Klaviatūra visai scenai; Field ir World turi sąrašo ekvivalentą (tos pačios juostos); būsena niekada tik spalva (kraštas + tekstas + ikona); kontrastas AA abiejose temose (`globals.css` jau taisytas); taikiniai ≥44 px web / ≥56 px objekte; dinaminis tekstas iki 200 % be horizontalaus overflow; fokusas — cyan žiedas visur; screen reader: kiekvienas objektas — vardas · būsena · kilmė · kitas veiksmas kaip vienas pranešimas; žemėlapio alternatyva — „N objektų šiame rodinyje" + sąrašas.

## T. 1M+ MASTELIO UX TAISYKLĖS

Niekada: visų žmonių sąrašai, pasirinkimo meniu iš visų, klientinė filtracija, >60 pin'ų, begalinės laiko juostos, dashboard'ai. Visada: intent + kontekstas → ribotas rezultatas (2–5 sprendimai, ≤12 žmonių lauke, ≤60 objektų World), rangavimas su „kodėl šie / kodėl ne kiti (N atmesta)", semantinis mastelis, viewport, progresyvus atskleidimas, serverinė paieška po composer'iu ir World sluoksniais (techninė paieška privaloma; filtrų juosta kaip pagrindinė patirtis — draudžiama).

## U. KELIONIŲ VALIDACIJA (A–I)

| Kelionė | Paveikslėliai | Kur ji lūžta šiandien | Ką dizainas keičia |
|---|---|---|---|
| A Viešas darbdavys | 01 → 02 → 09 → 10 → 19 → 12 | hero suvaidintas; po login sakinys dingsta | intent atpažinimas, sakinys per `next`, Laukas iškart |
| B Darbuotojas | 03 → 05 → 11 → 15 → 25 → 19 → 06 → 20 | spraga baigiasi tekstu; žurnalas formose | knyga + sprendimai, mobile žurnalas, tapatybė atsinaujina |
| C Darbdavys | 12 → 09 → 07 → 05 → 10 → 08 → 19 → 22 (ataskaita/CSV — PRESENT) | operations lentelė; what-if tik sakiniu | Laukas su tempimu, kas-jei abiem projektams |
| D Mokymas | 17 → 18 → 19 → 06 | atskirai nuo rinkos | paklausa iš tikrų poreikių, mokinys = Person |
| E Vizualus darbdavys be chat | 22 | — | 11 žingsnių vien pele |
| F Vizualus darbuotojas be chat | 23 | — | 12 žingsnių vien pirštu |
| G Marketplace | 11 → 14 → 15 → 16 | listings atsieti | sprendimas vietoje spragos |
| H Conversation ↔ Visual | 02 (composer) + 09/10 | pokalbis ir vizualas nesidalina | sakinys keičia lauką; tempimas → pokalbis paaiškina |
| I Web → App | 26 | — | juodraštis DB, „Tęsti" kortelė |

## V. PRESENT / PARTIAL / TARGET (žemėlapis į esamą kodą)

| Gebėjimas | Būsena | Kanoninis šaltinis, kurį naudoti |
|---|---|---|
| Deterministinis intent, registry, dispatch su autorizacija | PRESENT | `lib/conversation/intent-router.ts`, `action-registry.ts`, `dispatch-core.ts` |
| LLM (Gemini) proposer | PRESENT runtime (LIVE prod, `gemini-3.5-flash-lite`, `AI_PROVIDER_MODE=live`) · PARTIAL pokalbyje (#1512 merged 09-05, PENDING_PROD_PROOF) | `lib/ai/runtime/*`, `lib/conversation/intent-catalogue.ts`, `data-egress.ts` grant `propose_conversation_intent` — savininko sprendimas UŽDARYTAS |
| Viešas hero su tikru intent'u ir sakinio perkėlimu | TARGET (router pure — galima) | `routeIntent()` + `lib/auth/redirect.ts` `next` |
| Projektas, etapai, užduotys, priskyrimai, what-if move, CSV | PRESENT (sakiniu) | `project_stages`, `work_tasks`, `project_worker_assignments`, `lib/conversation/project-move.ts`, `company-stages.ts`, `company-tasks.ts` |
| Laukas kaip vizualus rodinys su tempimu | TARGET (UI) | tie patys veiksmai; `/dashboard/projects/[id]/operations` → Field |
| Player card + pasiruošimas | PARTIAL (`lib/player-card/readiness.ts` — 6 profilio stulpai, ne kontekstinė knyga) | pridėti kontekstinę knygą virš `documents-gap`, `skill-gap`, reikalavimų iš `customer_requests`/projekto |
| Kilmės klasės | PARTIAL (tik SELF_DECLARED kode; žodynas checkpoint'e) | `journal_entry_confirmations` → EMPLOYER_CONFIRMED; sertifikatai → EVIDENCE_SUPPORTED |
| Dokumentų spraga + failas pokalbyje | PRESENT | `documents-gap.ts`, `document-file-chat.ts`, `worker_documents`, `document_files` |
| „Kas gali padėti" (Marketplace sprendimai prie spragos) | PARTIAL (`marketplace_listings`, `service_offerings`, `training_programs` yra; jungtis prie spragos — ne) | `Resolution` = listings/offerings/programs + tiekėjo pasitikėjimas |
| Komanda kaip objektas | PARTIAL (`team_details`, `team_enquiries` — komandos pasiūla; aprėptis — ne) | išvesti aprėptį iš narių įgūdžių/dokumentų |
| Įmonės projektų laukas laike | PARTIAL (employer greeting, „mano projektai", pajėgumas sakiniu) | `employer-workspace.ts`, `capacity.ts` → viena eilutė = projektas |
| World sluoksniai, klasteriai | PARTIAL (`market-map/*`, `spatial-entities.ts`) | viewport + klasteriai + sluoksniai virš esamų signalų |
| Attention | PRESENT (attention-brief) | `attention-brief`, `agenda-summary` |
| My Space | PARTIAL (#1475 owner gate) | `workspace_pins_v1` |
| Mokymas: programos, kohortos, mokiniai, rezultatai | PRESENT (sakiniu) | `education_programs`, `education_cohorts`, `education-workspace.ts` |
| Rinkos paklausa institucijai iš tikrų poreikių | PARTIAL | `customer_requests` agregatas + `public_vacancies` |
| Žurnalas + nuotraukos + patvirtinimas | PRESENT | `journal_entries`, `journal_entry_photos`, `journal_entry_confirmations`, `quick-confirm-actions` |
| Balsas žurnale | PRESENT (`/dashboard/journal/voice`, `services/transcribe`) | perkelti į mobile srautą |
| Laiko skruberis, faktas/išvesta/prognozė medžiaga | TARGET | išvesta = esami skaičiavimai; prognozė — tik su prielaida |
| Natyvi programėlė, offline, push, biometrija | TARGET (`apps/mobile` skeletas) — neblokuoja SAFE PILOT | tie patys veiksmai per `/api/*` bearer resolver (jau yra) |
| Mokėjimai/planai | PARTIAL: kodas — pre-payment planai (`free_worker`, `worker_plus`, `company_pilot` 5 poreikiai, `agency_pilot` 25), Stripe test, live-key guard; patvirtintas komercinis kontraktas — PERSON €0 · ORGANIZATION FREE = 1 aktyvus poreikis · ORGANIZATION €99/mėn. = iki 10 · >10 = susisiekite | `lib/billing/plans.ts` suderinti su kontraktu; Stripe LIVE — įgyvendinimo juosta, ne dizaino sprendimas |

## W. PERDAVIMO SEKA

Pakeista: paketai, prioritetai, lygiagretumas ir rašymo domenai apibrėžti `00-FROZEN-DESIGN-CONTRACT.md` §5–§9. Paketas = įgyvendinimo vienetas / dizaino kontraktas, ne PR; PR ribas, šakas ir kelionių grupavimą sprendžia MASTER orkestratorius.

## X. GALUTINIS VERTINIMO LAPAS (kiekvienam ekranui, „taip/ne")

1 suprantama žmogui · 2 kitas veiksmas akivaizdus · 3 tikra kanoninė būsena · 4 nėra dublikatų · 5 veikia be chat · 6 chat padeda, nedominuoja · 7 World naudingas · 8 kontekstas išlaikytas · 9 spraga → sprendimas · 10 kilmė suprantama · 11 pasitikėjimas uždirbtas · 12 ne generic SaaS · 13 ne puslapių labirintas · 14 1M+ · 15 mobile · 16 app-ready · 17 a11y · 18 praeitis/dabar/toliau · 19 faktas/išvesta/prognozė · 20 tas pats objektas visur atpažįstamas · 21 manipuliacija = veiksmas · 22 be vidinės architektūros žodyno · 23 tankis tinkamas · 24 premium iš aiškumo · 25 vienas LabourMarket.ai · **26 šviežumas matomas · 27 tuščia būsena veda į veiksmą · 28 auksas tik už patvirtinimą · 29 iliustraciniai duomenys niekur gamyboje.**

Savivertinimas DRAFT 2 (sąžiningai): 01–27 tenkina 1–29, išskyrus: 16/20 World — klasterių elgsena parodyta statiškai (reikia prototipo); 17 a11y — sąrašo ekvivalentai aprašyti, ne nupiešti; 14 — 1M patikrinta taisyklėmis, ne duomenimis.

## Y. SAVININKO SPRENDIMAI

Sprendimai 1–8 PATVIRTINTI 2026-09-05 (žr. FROZEN §2). 9 (LLM proposer) — uždarytas anksčiau, ne dizaino sprendimas. 10 (prognozės ir privatumas) — išspręsta FROZEN §2.6 taisykle. Likę tik FROZEN §9.

---

## KETURI GALUTINIAI TESTAI

1. Ignoruoja pokalbį — **TAIP**: `22`, `23`, `02`, `12`, `03`, `25` — visos kelionės pele/pirštu, tas pats stuburas.
2. Ignoruoja navigaciją, tik sako — **TAIP**: composer visur, sakinys keičia World State, kiekviena manipuliacija turi registruotą veiksmą; skirtumas tik įėjimo taške (`27`).
3. Viena kalba septyniems aktoriams — **TAIP**: tas pats shell, objektai, World, stuburas; skiriasi tik aktyvus kontekstas ir pradinis fokusas (`02`/`03`/`12`/`17`/`18`; klientas/prižiūrėtojas = Company Context su ribotu Field + Attention patvirtinimams — ta pati kalba, mažiau sluoksnių).
4. Web → PWA → iOS/Android → milijonai — **TAIP**: semantiniai tokenai, objektų kalba, sheet'ai vietoj panelių, natyvūs gebėjimai per tuos pačius veiksmus, 1M taisyklės įrašytos į kiekvieną lęšį (`24`–`27`).

**Galutinis atsakymas į dizaino klausimą:** paprasčiausia, nuosekliausia, patikimiausia ir savičiausia sąsaja gyvai darbo rinkai — **vienas pasaulis trimis atstumais (Pasaulis · Laukas · Objektas), kuriame kiekvienas objektas pats sako, kas jis, iš kur jo tiesa ir kam jis pasiruošęs, o kiekviena spraga baigiasi žmogumi ar paslauga, kuri ją uždaro** — nesvarbu, ar tai padarai sakiniu, ar pirštu.
