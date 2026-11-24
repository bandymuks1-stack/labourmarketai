# OWNER CANONICAL DECISION — Work-Journal-First Conversation Architecture v1

> **Status:** `CANONICAL` · **Priimta:** 2026-07-25 · **Šaltinis:** savininko
> direktyva (OWNER CANONICAL DIRECTIVE, LT) · **Taikymas:** visas
> LabourMarket.ai produktas, UX, duomenų modelis ir techninė architektūra.
>
> Šis dokumentas yra **kanoninis**. Jis pakeičia bet kokias ankstesnes
> interpretacijas dokumentuose, audituose, PR aprašuose ir agentų planuose.
> Visi tolesni auditai, planai, PR ir produkto sprendimai vertinami pagal jį.
> Jei nauja užduotis prieštarauja šiam dokumentui — **neinterpretuoti tyliai**:
> aiškiai parodyti prieštaravimą, sustoti, paprašyti savininko sprendimo.
>
> Šis dokumentas nekeičia jokio kodo, jokios schemos ir nieko nediegia. Jis yra
> sprendimo įrašas + kryptis.

---

## 0. Nekintamos tezės (invariants)

Penkios tezės yra šio dokumento branduolys. Jos saugomos guard testu
(`apps/web/lib/guards/work-journal-first-architecture.test.ts`). Guard saugo
**principą**, ne dabartinę implementacijos formą — jis netvirtina failų,
komponentų ar route pavadinimų.

### CONVERSATION_IS_PRIMARY_WORK_JOURNAL

Pokalbio langas yra **pirminis darbo žurnalas**, o ne navigacija, ne asistentas
virš senų ekranų ir ne dar vienas dashboard dizainas. Tai pagrindinė darbo
aplinka, kurioje žmogus pasakoja, ką dirbo, ir tas pasakojimas tampa realiais
domeno duomenimis.

### JOURNAL_ROUTE_IS_STRUCTURED_PROJECTION

Struktūrizuotas žurnalo route yra **antrinis vaizdas** to, kas sukurta per
pokalbį: istorija, redagavimas, įrodymai, patvirtinimų seka, sudėtingesnė
kontrolė. Tai **nėra** atskiras pirminis žurnalas ir **nėra** lygiagretus
duomenų kūrimo kelias.

### CV_IS_WORK_HISTORY_PROJECTION

CV nėra izoliuota rankinė forma. CV yra **struktūrizuota profesinės istorijos
projekcija**. Rankinis redagavimas lieka kaip koregavimo / importo / papildymo
/ išimties mechanizmas, o ne kaip pagrindinis duomenų kūrimo kelias.

### CONVERSATION_AND_UI_SHARE_DOMAIN_USE_CASES

Pokalbis ir klasikinis struktūrizuotas UI naudoja **tuos pačius canonical
domeno use-case**. Draudžiama atskira „chat logika“, kuri apeina canonical
domeno veiksmus, ir draudžiami UI komponentai, savarankiškai realizuojantys tą
pačią verslo būseną skirtingai.

### DEEP_SURFACES_ARE_NOT_PRIMARY_ENTRY_POINTS

Gilieji / išplėstiniai ekranai yra sudėtingo valdymo paviršiai, **ne pirminis
įėjimas**. Jie neturi dubliuoti pagrindinio įėjimo, nereikalauti, kad
vartotojas žinotų vidinę route struktūrą, ir turi būti atidaromi iš konkretaus
pokalbio rezultato bei grąžinti vartotoją į bendrą kontekstą.

---

## 1. Ką ši direktyva pakeičia

Neteisingos interpretacijos, kurios nuo šiol **negalioja**:

- pokalbis yra tik navigacija;
- pokalbis yra tik AI asistentas virš senų ekranų;
- darbo žurnalas yra atskiras papildomas modulis;
- CV pirmiausia pildomas rankinėmis formomis;
- įgūdžiai yra tik vartotojo savarankiškai pažymėti profilio laukai;
- darbo paieška yra tik atskira pasiūlymų lenta;
- darbuotojų paieška yra tik atskiras darbdavio filtras;
- conversation-first reiškia tik naują dashboard dizainą.

## 2. Kanoninė grandinė

```
POKALBIS / DARBO ŽURNALAS
    ↓
DARBO ĮVYKIAI
    ↓
ĮRODYMAI IR PATVIRTINIMAI
    ↓
PROFESINĖ ISTORIJA
    ↓
CV + ĮGŪDŽIAI + PATIKIMUMAS
    ↓
REALUS PROFESINIS PROFILIS
    ↓
DARBO PAIEŠKA / DARBUOTOJŲ PAIEŠKA / MOKYMOSI KRYPTYS
    ↓
VEIKSMAI, KOMUNIKACIJA IR PLANAVIMAS
```

Pokalbio langas yra ne papildomas UI sluoksnis, o pagrindinis produkto duomenų
kūrimo ir darbo procesų vykdymo mechanizmas.

## 3. Pagrindinė vartotojo patirtis

Kanoninis pagrindinis route yra dashboard šaknis: pagrindinis pokalbis,
pirminis darbo žurnalas, pagrindinė kasdienė darbo aplinka, pagrindinis duomenų
pateikimo ir veiksmų inicijavimo būdas.

Vartotojas neturi būti verčiamas suprasti vidinių produkto modulių. Jis turi
galėti natūraliai parašyti, pvz.: „Šiandien montavau langus objekte Vilniuje“,
„Dirbau 8 valandas“, „Įkelk šias nuotraukas kaip darbo įrodymą“, „Parodyk,
kokie mano įgūdžiai dar nepatvirtinti“, „Atnaujink mano CV“, „Rask man tinkamų
darbų“, „Kodėl man siūlomas šis darbas?“, „Man reikia penkių suvirintojų
Nyderlanduose“, „Rask žmones, kurie turi patvirtintą TIG patirtį“, „Parodyk
neatsakytas žinutes“.

Sistema privalo: (1) suprasti intenciją; (2) nustatyti rolę ir kontekstą;
(3) surinkti trūkstamus duomenis; (4) aiškiai parodyti, ką ketina daryti;
(5) taikyti patvirtinimo vartus, kai jie reikalingi; (6) vykdyti canonical
domeno veiksmą; (7) išsaugoti rezultatą; (8) paaiškinti rezultatą; (9) pasiūlyti
tik logišką kitą žingsnį.

## 4. Worker kanoninė kilpa

```
POKALBIS → DARBO ĮRAŠAS → STRUKTŪRIZUOTI FAKTAI → ĮRODYMAI → PATVIRTINIMAI
 → ĮGŪDŽIŲ IR PATIRTIES ATNAUJINIMAS → CV ATNAUJINIMAS
 → DARBO ATITIKIMO ATNAUJINIMAS → NAUJI PASIŪLYMAI IR REKOMENDACIJOS
```

Worker pokalbis turi galėti: sukurti darbo žurnalo įrašą; papildyti neužbaigtą
įrašą; susieti įrašą su darbu, projektu, darbdaviu ar engagement; priimti
tekstą, failus, nuotraukas ir kitus įrodymus; išskirti galimus įgūdžius;
atskirti faktą nuo sistemos išvados; parodyti, kas išgauta; paprašyti
patvirtinti arba pataisyti; registruoti įgūdžio įrodymo šaltinį ir patvirtinimo
būseną; formuoti chronologinę darbo istoriją; atnaujinti CV nepažeidžiant
ankstesnių faktų; aptikti prieštaravimus; rodyti, kurios CV dalys yra
deklaruotos / išvestos / patvirtintos / nepatvirtintos / ginčijamos; naudoti
šiuos duomenis darbo paieškai; paaiškinti, kodėl darbas tinka arba netinka.

## 5. Employer kanoninė kilpa

```
POKALBIS → DARBUOTOJŲ POREIKIO APRAŠYMAS → STRUKTŪRIZUOTAS DEMAND
 → REALUMO IR TRŪKSTAMŲ DUOMENŲ PATIKRA → KANDIDATŲ PAIEŠKA
 → PAAIŠKINAMAS ATITIKIMAS → KONTAKTAS / KVIETIMAS / INTERVIU
 → DARBO SANTYKIO AR ENGAGEMENT KILPA → PATVIRTINTA DARBO ISTORIJA
```

Employer pokalbis išskiria: profesiją, įgūdžius, patirties lygį, vietą, darbo
laiką, atlyginimą, trukmę, kalbą, sertifikatus, pradžios datą, darbuotojų
skaičių; prašo **tik trūkstamų** duomenų; rodo rinkos realumo signalus; kuria
demand; ieško darbuotojų pagal realius žurnalų, CV, įrodymų ir patvirtinimų
duomenis; paaiškina atitikimą; **neskiria išgalvotų AI balų be aiškaus
pagrindo**; inicijuoja kvietimą; seka kandidatų būseną; priima arba pateikia
atlikto darbo patvirtinimą.

## 6. Agency kanoninė kilpa

```
POKALBIS → KLIENTAS AR KLIENTO RYŠYS → KLIENTO POREIKIS → DARBUOTOJŲ PAIEŠKA
 → PRISKYRIMAS → KOMUNIKACIJA IR VYKDYMAS → REZULTATAS IR PATVIRTINIMAS
```

Prieš diegiant naują agentūros klientų modelį privaloma aiškiai atskirti:
(1) privatų agentūros CRM įrašą; (2) realią LabourMarket.ai registruotą įmonę;
(3) agency ↔ client connection; (4) poreikį, vykdomą kliento vardu. **Negalima
kurti dviejų neatskirtų konkuruojančių klientų modelių.**

## 7. Kitų ekranų paskirtis

Pagrindinė navigacija: **Pokalbis · Žinutės · Kalendorius · Profilis ·
Išplėstinis valdymas.**

Kiti route nėra lygiaverčiai pagrindiniai produktai — jie yra specializuoti
struktūrizuoti vaizdai:

| Paviršius | Kanoninė paskirtis |
|---|---|
| dashboard šaknis | pagrindinis pokalbis; pirminis darbo žurnalas; kasdienis veikimas |
| communication | žmonių tarpusavio žinutės; sistemos inicijuotų kontaktų tęsinys; kvietimai ir atsakymai |
| planning | kalendorius; pokalbiai; darbo datos; susitikimai; suplanuoti veiksmai |
| profile | iš darbo žurnalo suformuoto profilio peržiūra; klaidų taisymas; privatumo ir matomumo kontrolė |
| advanced | išplėstinis struktūrizuotas valdymas; **neprivalomas** įprastam naudojimui |
| journal | struktūrizuotas per pokalbį sukurto turinio vaizdas; istorija; redagavimas; įrodymai; patvirtinimų seka |
| opportunities | pilnas jau pagal profilį surastų galimybių valdymas; **ne** darbo paieškos pradžia |
| company ir kiti valdymo route | giluminiai employer/agency valdymo paviršiai; pagrindinė veikla inicijuojama per pokalbį |

Sub-surfaces gali likti, jeigu turi realų unikalų sudėtingą funkcionalumą.
Tačiau jie neturi dubliuoti pagrindinio įėjimo, neturi reikalauti vidinės
struktūros išmanymo, neturi būti pateikti kaip lygiaverčiai pagrindiniai
moduliai, turi būti atidaromi iš konkretaus pokalbio rezultato ir turi grąžinti
vartotoją į bendrą kontekstą.

## 8. Duomenų šaltinio tiesa (provenance)

Pokalbio tekstas **nėra** galutinis duomenų modelis. Sistema privalo atskirti
šešias klases:

1. **RAW INPUT** — vartotojo tekstas, failas, nuotrauka, importuotas dokumentas, garso transkripcija.
2. **EXTRACTED CLAIM** — sistemos išgautas teiginys; dar nepatvirtintas faktas.
3. **USER-CONFIRMED FACT** — vartotojo patvirtintas arba pataisytas faktas.
4. **EXTERNALLY VERIFIED FACT** — darbdavio, vadovo, kliento, institucijos, dokumento ar kito patikimo šaltinio patvirtinta.
5. **DERIVED SIGNAL** — sistemos išvada: įgūdžio stiprumas, patirties trukmė, atitikimo paaiškinimas, kompetencijos spraga.
6. **PUBLISHED PROFILE PROJECTION** — kas rodoma CV, profilyje, kandidatų paieškoje, darbdaviui, rekomendacijose.

Negalima: AI išvados pateikti kaip patvirtinto fakto; nepatvirtinto įgūdžio
rodyti kaip sertifikuoto; ištrinti originalaus šaltinio; perrašyti profesinės
istorijos be audito pėdsako; sumaišyti pokalbio teksto su struktūrizuota
patvirtinta tiesa.

Kiekvienas svarbus faktas turi turėti provenance: kas pateikė, kada, iš kokio
šaltinio, kas patvirtino, kokia dabartinė ir kokia ankstesnė būsena.

## 9. Transcript persistence

Pokalbio istorija yra **verslo duomenų dalis**, ne laikina naršyklės būsena.

Privaloma išsaugoti: conversation; thread; message; sender/actor; role context;
timestamp; locale; raw text; attachment references; tool/workflow veiksmus;
patvirtinimo užklausas; vartotojo patvirtinimus; sukurtų domeno objektų
nuorodas; klaidas ir nutrauktus veiksmus be jautrių duomenų nutekinimo; modelio
ar taisyklių versiją, kai tai svarbu auditui.

Iš transcript turi būti atsekama: kuris pokalbio momentas sukūrė žurnalo įrašą;
kuris teiginys papildė CV; kuris įrodymas pagrindė įgūdį; kuris patvirtinimas
pakeitė fakto būseną; kuris pokalbis sukūrė employer demand; kuris veiksmas
inicijavo darbo paiešką; kuris rezultatas buvo parodytas vartotojui.

Transcript **negali** būti kuriamas kaip nuo domeno objektų atskiras tekstų
sandėlis — jis turi būti susietas su domeno įvykiais ir rezultatais.

## 10. Darbo paieškos logika

Darbo paieška prasideda **ne nuo tuščio filtro puslapio**, o nuo realaus worker
profilio: darbo žurnalo, CV, įgūdžių, patirties, įrodymų, patvirtinimų, vietos,
prieinamumo, pageidavimų, kalbų, atlygio lūkesčių, darbo teisės ir mobilumo
duomenų (kai teisėtai naudojama).

Pokalbis turi galėti pats pasiūlyti paiešką, kai profilis pakankamas; parodyti
kelis svarbiausius rezultatus; paaiškinti, kodėl jie tinkami; parodyti, ko
trūksta; leisti patikslinti natūralia kalba; leisti išsaugoti; leisti išreikšti
susidomėjimą; leisti atidaryti pilną opportunities paviršių.

Darbo rezultato parodymas yra **produkto įvykis**. Taisyklė *rendering is the
read event* galioja ir pokalbyje, ir visuose specializuotuose paviršiuose.
Seen-state turi būti **canonical domeno būsena**, o ne keli atskiri UI triukai.

## 11. Darbuotojų paieškos logika

Darbuotojų paieška remiasi ne tik savarankiškai įrašytu CV, bet ir profesinės
istorijos faktais, žurnalo įrašais, patvirtintais įgūdžiais, įrodymais, darbo
trukme, darbo kontekstu, prieinamumu, pageidavimais, teisėtu matomumu ir
privatumo taisyklėmis.

Darbdaviui aiškiai paaiškinama: kodėl kandidatas rodomas; kurie kriterijai
atitinka; kurie neatitinka; kurie duomenys patvirtinti; kurie tik deklaruoti;
kokių duomenų trūksta. **Negalima rodyti tariamo tikslaus AI balo be aiškios
formulės, šaltinių ir paaiškinimo.**

## 12. Techninė architektūra

Neleistinas ilgalaikis modelis:

```
UI COMPONENT → TIESIOGINIS ATSITIKTINIS RPC → DB
```

Tikslinis modelis:

```
UI SURFACE
  → APPLICATION USE CASE / ACTION
  → DOMAIN SERVICE
  → AUTHORIZATION + VALIDATION + STATE TRANSITION
  → REPOSITORY / ADAPTER
  → RPC / DATABASE / EXTERNAL SERVICE
```

Pavyzdys (darbo įrašas):

```
Conversation work-log action | Journal structured form | Import flow
  → CreateOrUpdateWorkEvent → WorkHistory domain
  → Journal entry + evidence links + extracted claims → Profile projection update
```

Pavyzdys (galimybės):

```
Conversation find-work | Advanced recommendation card | Opportunity board | Journal contextual opportunity
  → Opportunity service → load / rank / explain / mark shown / save / interest
  → Canonical backend contracts
```

## 13. Kanoniniai domenai

IDENTITY · CONVERSATION · WORK HISTORY · EVIDENCE · SKILLS · CV/PROFILE ·
EMPLOYER DEMAND · MARKETPLACE · AGENCY · COMMUNICATION · PLANNING ·
INTELLIGENCE.

- **IDENTITY** — auth, profiles, roles, permissions, consent, privacy.
- **CONVERSATION** — threads, messages, attachments, intent, role context, workflow state, confirmations, domain-action links.
- **WORK HISTORY** — work events, journal entries, engagements, projects, employers, locations, working time, responsibilities, outcomes.
- **EVIDENCE** — files, photos, documents, source metadata, evidence claims, verification, decisions, audit trail.
- **SKILLS** — extracted / declared / confirmed skills, evidence links, proficiency, recency, duration, confidence, provenance.
- **CV / PROFILE** — work-history projection, education, certifications, languages, skills, preferences, availability, visibility, export/import.
- **EMPLOYER DEMAND** — company, location, role, requirements, duration, salary, urgency, headcount, status.
- **MARKETPLACE** — opportunities, candidate discovery, recommendations, explanations, seen, saved, interest, comparison, invitations.
- **AGENCY** — client relationship, client context, assigned demand, supplied workers, agency workflow.
- **COMMUNICATION** — person-to-person messages, invitations, notifications, responses.
- **PLANNING** — meetings, interviews, work dates, reminders, calendar events.
- **INTELLIGENCE** — salary, demand, skills, gaps, explainability, trust, provenance.

## 14. Realumo ir sąžiningumo principas

Kiekvienas matomas elementas turi būti realiai veikiantis, prijungtas prie tikro
backend, aiškiai pažymėtas, jei funkcija dar neįdiegta, neimituojantis AI ar
duomenų, kurių nėra, nepasiekiamas, jei būtina backend capability neegzistuoja,
ir turintis honest-degradation būseną, jei funkcija atidėta.

Negalima: rodyti netikrų rezultatų; slėpti function-not-found klaidų kaip
sėkmės; laikyti RPC canonical production kontraktu vien todėl, kad jis paminėtas
kode; laikyti statinį guard testą runtime įrodymu; kurti UI, kuris atrodo
užbaigtas, bet neturi duomenų srauto; žymėti etapą užbaigtu be E2E įrodymo.

## 15. Audito taisyklės

Kiekvienam route, komponentui, RPC, lentelei ar feature atsakyti:

1. Kokią vartotojo problemą sprendžia? 2. Kurioje canonical kilpoje yra?
3. Ar veiksmas prasideda pokalbyje? 4. Jei ne — ar tam yra reali priežastis?
5. Pirminis duomenų kūrimo kelias ar antrinis vaizdas? 6. Ar dubliuoja kitą
ekraną? 7. Ar turi unikalų sudėtingą funkcionalumą? 8. Ar naudoja canonical
domeno use-case? 9. Ar tiesiogiai ir savarankiškai kviečia RPC? 10. Ar backend
capability realiai egzistuoja production? 11. Ar yra runtime E2E įrodymas?
12. Ar būsenos vienodos pokalbyje ir klasikiniame UI? 13. Ar duomenys turi
provenance? 14. Ar AI išvada atskirta nuo fakto? 15. Ar rodoma sąžininga
būsena? 16. Ar artina prie work-journal-first architektūros? 17. Ar palaiko
seną paralelinę architektūrą be būtinybės? 18. Ar tą patį galima pasiekti
kompaktiškiau?

Audito lentelė:

| Capability | User goal | Conversation path | Structured surface | Canonical use-case | Backend real in prod | Data provenance | Duplicate path | Runtime proof | Alignment | Required action |
|---|---|---|---|---|---|---|---|---|---|---|

`Alignment` reikšmės: `ALIGNED` · `PARTIALLY ALIGNED` · `LEGACY BUT REQUIRED` ·
`DUPLICATED` · `DISCONNECTED` · `FAKE / NOT BACKED` · `DEFERRED` ·
`BLOCKING TARGET ARCHITECTURE`.

## 16. Darbo prioritetų taisyklės

- **P0** — saugumo pažeidimai; neteisėta prieiga; duomenų praradimas;
  production mutacija be leidimo; privatumo pažeidimas.
- **P1** — pagrindinis pokalbio / darbo žurnalo kelias neveikia; transcript
  neišsaugomas; darbo įrašas nesukuria struktūrizuoto domeno rezultato; CV ar
  įgūdžių būsena neatnaujinama; rodomas veiksmas kviečia neegzistuojantį
  backend; pagrindinis worker/employer/agency lifecycle nutrūksta; pokalbis ir
  struktūrizuotas UI rodo nesuderinamą būseną.
- **P2** — dubliuojantis kelias; perteklinis route; nekonsekventiškas
  paaiškinimas; prastas observability; nepakankamas UX kompaktiškumas;
  papildoma rankinė forma ten, kur pokalbis jau galėtų surinkti duomenis.
- **P3** — kosmetika; smulkūs teksto skirtumai; neesminis išdėstymas.

Negalima teikti pirmenybės naujam antriniam ekranui, dekoratyvinei kortelei,
papildomai analitikai ar naujai DRAFT capability, jei dar neužbaigta pagrindinė
pokalbio → žurnalo → profilio → paieškos kilpa.

## 17. Įgyvendinimo seka

Dirbti etapais, neperrašant viso projekto vienu metu.

| Etapas | Turinys | Būsena |
|---|---|---|
| **A** | Kanoninio sprendimo išsaugojimas (šis dokumentas + registro nuoroda + guard testas) | vykdoma šiame žingsnyje |
| **B** | Opportunity SEEN correctness kaip **canonical marketplace state use-case** (ne keli tiesioginiai UI RPC sprendimai) | kitas |
| **C** | Transcript persistence (conversation, messages, role context, attachments, confirmation state, domain action links, audit trail; read/write modelis, auth, RLS, grants, local E2E; istorija išlieka po refresh ir naujo prisijungimo) | po B |
| **D** | Conversation-first užbaigimas (dashboard šaknis = pagrindinis pokalbis ir darbo žurnalas; canonical domeno veiksmai; transcript išsaugomas; darbo įrašai susieti su journal/work-history; pokalbio darbo paieška naudoja canonical marketplace logiką; kompaktiška navigacija; advanced = antrinis režimas) | po C |
| **E** | Worker end-to-end kilpa (pokalbis → darbo įrašas → struktūrizuotas journal → įrodymas → įgūdžio claim → vartotojo patvirtinimas → CV/profile projekcija → darbo paieška → paaiškinimas → interest/save/contact). **Nelaikyti baigtu be vieno pilno local authenticated E2E.** | po D |
| **F** | Employer end-to-end kilpa | po E |
| **G** | Agency end-to-end kilpa — **pirma produkto sprendimas** dėl private CRM / registered client / agency_client_connections / demand ownership, tik tada schemos | po F |
| **H** | Legacy ir dubliavimo valymas — tik kai pagrindinės kilpos veikia | paskutinis |

## 18. DRAFT capability sprendimai

DRAFT migracija **nėra** automatiškai planas diegti. Kiekvienai reikia
nustatyti: ar reikalinga canonical kilpai; ar yra realus UI; ar pokalbis ją
naudos; ar yra duomenų šaltinis; ar dubliuoja naujesnį modelį; ar suderinama su
dabartine schema; ar verta BUILD / REBUILD / DEFER / REMOVE.

| DRAFT capability | Sprendimas |
|---|---|
| Company Locations | `DEFER` — kol nėra employer lifecycle prioriteto |
| Agency Clients | `DEFER` — kol neišspręstas modelio dubliavimas |
| Multi-Source Talent | `DEFER AND SPLIT` |
| Worker Opportunity Seen | `BUILD NOW` — kaip canonical marketplace state capability |

Šių sprendimų nekeisti be naujo savininko sprendimo.

## 19. Agento darbo taisyklės

Prieš bet kokį naują darbą agentas privalo: (1) perskaityti šį dokumentą;
(2) įvardyti, kurią canonical kilpą darbas keičia; (3) parodyti dabartinį
duomenų srautą; (4) parodyti tikslinį duomenų srautą; (5) patikrinti, ar
nekuria paralelinės architektūros; (6) patikrinti, ar pokalbis lieka pirminis
kelias; (7) patikrinti, ar klasikinis UI naudoja tą patį use-case;
(8) patikrinti production realybę; (9) patikrinti local E2E galimybę;
(10) sustoti prieš owner-gated veiksmus.

**Draudžiama be aiškaus owner leidimo:** merge; production migration apply;
deploy; production env pakeitimai; feature flag įjungimas; production duomenų
mutacija; production auth vartotojų keitimas; mokamų paslaugų aktyvavimas;
realus outbound siuntimas.

**Production auditai:** read-only SQL; read-only katalogai; GET-only browsing;
network inspection be mutacijos. Jei faktui patikrinti būtina mutacija —
**STOP ir OWNER GATE**.

## 20. Kiekvieno PR reikalavimai

Kiekvienas PR turi būti siauras. Ataskaitoje privaloma: (1) kuri canonical
kilpa pakeista; (2) elgesys prieš; (3) elgesys po; (4) ar pokalbis yra pirminis
kelias; (5) ar struktūrizuotas UI naudoja tą patį use-case; (6) kokie DB
objektai keisti; (7) RLS matrica; (8) RPC grant matrica; (9) authz ir tenant
isolation; (10) provenance; (11) idempotency; (12) error handling ir
observability; (13) local authenticated E2E; (14) network įrodymas; (15) full
suite; (16) typecheck; (17) build; (18) migration safety; (19) Codex review;
(20) kas sąmoningai nepaliesta; (21) rollback planas; (22) patvirtinimas, kad
production nepaliesta; (23) STOP prieš merge/apply.

Negalima pateikti: vien statinių testų kaip runtime įrodymo; vien build kaip
produkto veikimo įrodymo; vien UI screenshot kaip backend veikimo įrodymo; vien
RPC egzistavimo kaip teisingo lifecycle įrodymo.

## 21. Architektūriniai acceptance criteria

Idėja laikoma įgyvendinta 100 % tik tada, kai:

**WORKER** — gali pradėti nuo tuščio pokalbio; aprašyti atliktą darbą; pridėti
įrodymą; gauti struktūrizuotą darbo įrašą; patvirtinti išgautus faktus; matyti
atnaujintą profesinę istoriją, CV, įgūdžius ir jų patikimumą; gauti pagal tai
rastus darbus; suprasti, kodėl darbas pasiūlytas; išreikšti susidomėjimą;
tęsti komunikaciją; planuoti kitą veiksmą — **neprivalant naršyti per daugybę
modulių**.

**EMPLOYER** — pokalbyje aprašo poreikį; sistema suformuoja demand; prašo tik
trūkstamų faktų; paaiškina realumą; randa kandidatus pagal realius duomenis;
paaiškina atitikimą; inicijuoja kontaktą; valdo procesą.

**AGENCY** — pasirenka ar sukuria tinkamą kliento kontekstą; suformuoja kliento
poreikį; randa darbuotojus; priskiria ir valdo procesą; **nekuria dvigubų
klientų modelių**.

**BENDRAI** — pokalbis išsaugomas; kiekvienas svarbus faktas turi provenance;
AI išvada atskirta nuo patvirtinto fakto; pokalbis ir struktūrizuoti ekranai
rodo tą pačią būseną; nėra production UI, kviečiančio neegzistuojantį backend;
nėra netikrų ar imituojamų funkcijų; nėra būtinybės suprasti vidinę route
struktūrą; advanced režimas yra pasirenkamas; pagrindinė navigacija išlieka
kompaktiška; sistema veikia **visiems sektoriams**, ne tik statybai; sistema
projektuojama **Europos mastui**, ne tik Lietuvai.

---

## GALUTINĖ NEKINTAMA FORMULĖ

**POKALBIS YRA PIRMINIS DARBO ŽURNALAS.**

**DARBO ŽURNALAS KURIA PROFESINĘ ISTORIJĄ.**

**PROFESINĖ ISTORIJA KURIA CV, ĮGŪDŽIUS IR PATIKIMUMĄ.**

**REALUS PROFILIS VALDO DARBO IR DARBUOTOJŲ PAIEŠKĄ.**

**KITI EKRANAI YRA STRUKTŪRIZUOTI VALDYMO VAIZDAI, O NE ATSKIRI PRODUKTO
CENTRAI.**
