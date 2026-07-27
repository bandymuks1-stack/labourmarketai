# LabourMarket.ai — kanoninė produkto vizija ir vykdymo atmintis

> **Statusas: KANONINIS, PRIVALOMAS.** Įrašyta savininko (DI) sprendimu 2026-07-27.
> Prieš planuojant ar įgyvendinant BET KOKIĄ produkto funkciją šis dokumentas
> skaitomas pirmas. Jame aprašytos funkcijos yra **sutarta produkto
> architektūra, ne naujos idėjos** — jų nebereikia klausti iš naujo.
> Techninė doktrina (saugumas, migracijos, kanoninės struktūros) lieka
> `docs/PLATFORM_DOCTRINE.md`; konfliktų atveju doktrina saugo GRIEŽTESNĮ
> variantą, o šis dokumentas apibrėžia PRODUKTO apimtį ir kryptį.

---

## 1. Pagrindinė produkto idėja

LabourMarket.ai nėra paprastas darbo skelbimų portalas ir nėra tik CV
generatorius. Tai **globali, pokalbiu valdoma darbo, verslo ir profesinio
gyvenimo operacinė sistema**, kuri vienoje paskyroje sujungia:

- žmogų;
- darbuotoją;
- savarankiškai dirbantį specialistą;
- darbdavį;
- kelių įmonių savininką;
- agentūrą;
- paslaugų teikėją;
- paslaugų pirkėją;
- būsto, transporto ir kitų darbo infrastruktūros paslaugų naudotoją;
- mokymo įstaigas ir partnerius.

Sistema veikia globaliai, ne tik Lietuvoje ar Europoje.

## 2. Pagrindinis veikimo principas

**Pokalbis yra pagrindinė produkto valdymo sąsaja.** Vartotojas paprasta kalba
pasako tikslą, o sistema:

1. nustato ketinimą;
2. įkelia vartotojo, įmonės, projekto ir ankstesnio pokalbio kontekstą;
3. panaudoja jau turimus duomenis;
4. klausia tik to, ko iš tikrųjų trūksta;
5. vykdo realų backend veiksmą;
6. sukuria tikrą DB įrašą ir unikalų ID;
7. perskaito naują sistemos būseną;
8. parodo konkretų rezultatą ir kitą galimą veiksmą.

**Negalima rodyti fake success, jei realus veiksmas nebuvo atliktas.**

## 3. Viena paskyra, kelios tapatybės

Vienas vartotojas gali vienu metu būti: darbuotojas; darbo ieškantis asmuo;
individualios veiklos vykdytojas; laisvai samdomas specialistas; darbdavys;
įmonės savininkas; kelių įmonių savininkas; agentūros atstovas; paslaugų
teikėjas; partneris.

Vartotojas **nekuria atskirų paskyrų kiekvienai rolei**. Sistema turi aiškų
**aktyvų kontekstą**: asmeninis profilis; pasirinkta įmonė; pasirinkta veikla;
pasirinktas projektas; pasirinktas klientas.

## 4. Kelios įmonės ir veiklos

Vienas vartotojas gali valdyti: kelias įmones; individualią veiklą; kelis
prekės ženklus; kelias veiklos rūšis; kelis projektus; skirtingas komandas ir
darbuotojus.

Kiekviena įmonė ar veikla turi turėti atskirai: profilį; narius ir teises;
dokumentus; darbuotojus; klientus; projektus; paslaugas; užsakymus; darbo
žurnalus; sąskaitas; mokėjimus; ataskaitas; automatizacijas.

## 5. Darbuotojo ir specialisto grandinė

**Darbo žurnalas yra vienas pagrindinių tiesos šaltinių.**

Kiekvienas darbo įrašas gali turėti: datą; pradžios ir pabaigos laiką; trukmę;
klientą; įmonę; projektą; vietą; atliktus darbus; naudotas medžiagas; įrangą;
išlaidas; nuotraukas; dokumentus; pastabas; patvirtinimą.

Po darbo žurnalo įrašo sistema **automatiškai**:

1. išsaugo įrašą;
2. nustato atliktus darbus;
3. išgauna įgūdžius ir patirtį;
4. atnaujina profesinį profilį;
5. atnaujina CV;
6. atnaujina darbo istoriją;
7. perskaičiuoja matching;
8. atnaujina kvalifikacijų ir patirties suvestinę;
9. išsaugo provenance;
10. parodo, kas pasikeitė.

Papildomo bendro patvirtinimo nereikia. Klausti galima tik esant dviprasmybei
arba konfliktui su esamais duomenimis.

## 6. Darbdavio ir agentūros grandinė

Pokalbiu turi būti galima: sukurti įmonę; pasirinkti aktyvią įmonę; aprašyti
darbuotojų poreikį; sukurti darbo pasiūlymą; sukurti darbuotojų užklausą;
gauti unikalų ID; rasti ir vertinti kandidatus; kurti shortlist; planuoti
pokalbį; pateikti pasiūlymą; priimti darbuotoją; uždaryti poreikį; matyti
visą proceso istoriją.

Agentūros turi galėti: valdyti kandidatų bazę; valdyti kelias įmones-klientus;
valdyti darbuotojų pasiūlymus; sekti užsakymų ir kandidatų būsenas; gauti
komisinius; bendradarbiauti su kitomis agentūromis.

## 7. Paslaugų marketplace

Sistema palaiko ne tik darbus, bet ir realias paslaugas. Pokalbiu turi būti
galima: pasiūlyti paslaugą; rasti paslaugos teikėją; užsisakyti paslaugą;
pateikti kainos pasiūlymą; rezervuoti laiką; patvirtinti atlikimą; vertinti
rezultatą; apmokėti arba išrašyti sąskaitą.

Kategorijos apima (neribojant): statybą ir remontą; transportą; vertimą;
buhalteriją; teisę; draudimą; mokymus; darbuotojų atranką; dokumentų
tvarkymą; įrangą ir medžiagas; apgyvendinimą; kitas darbui ir verslui
reikalingas paslaugas.

Kiekvienas užsakymas turi turėti: ID; pirkėją; teikėją; pasirinktą įmonės
arba asmeninį kontekstą; kainą; terminą; būseną; žinutes; dokumentus;
mokėjimo būseną; atšaukimo ir ginčo logiką.

## 8. Būstas ir apgyvendinimas

Sistema turi palaikyti: būsto skelbimus; darbuotojų apgyvendinimą; trumpalaikę
ir ilgalaikę nuomą; lovų, kambarių, butų ir namų rezervavimą; būsto susiejimą
su projektu ar darbo vieta; įmonės apmokamą būstą; darbuotojų paskirstymą į
būstą; kainas ir užimtumą; sutartis ir mokėjimus; būsto atsiliepimus ir
incidentus.

Pokalbio pavyzdys: „Surask būstą 6 darbuotojams Roterdame nuo rugsėjo 1 d." —
sistema surenka trūkstamus kriterijus ir sukuria realią paiešką arba užsakymą.

## 9. Dokumentų variklis

Sistema turi žinoti: kokius dokumentus vartotojas turi; kokių trūksta; kurie
baigia galioti; kurie atmesti; kokių reikia konkrečiam darbui; kokių reikia
konkrečiai šaliai; kokių reikia įmonei, projektui ar paslaugai.

Dokumentai apima: asmens dokumentus; CV; sutartis; A1; VCA; sertifikatus;
diplomus; leidimus dirbti; vizas; draudimą; mokesčių dokumentus; įmonės
registracijos dokumentus; darbų aktus; sąskaitas; nuomos sutartis; kitus
profesinius ar teisinius dokumentus.

Sistema turi: (1) matyti trūkstamus dokumentus; (2) nustatyti reikalavimus
pagal kontekstą; (3) perspėti apie galiojimo pabaigą; (4) sukurti veiksmų
sąrašą; (5) leisti užsisakyti dokumentų tvarkymo paslaugą; (6) susieti
dokumentą su žmogumi, įmone, projektu ar užsakymu.

## 10. Sąskaitos ir finansai

Iš darbo žurnalų turi būti galima formuoti sąskaitas pagal: vieną dieną;
pasirinktą laikotarpį; savaitę; mėnesį; metus; projektą; klientą; darbuotoją;
įmonę; atliktų darbų rūšį.

Generuojami dokumentai: sąskaita faktūra; išankstinė sąskaita; kreditinė
sąskaita; darbų priėmimo aktas; darbo laiko žiniaraštis; atliktų darbų
suvestinė; išlaidų ataskaita; kliento ataskaita; PDF; struktūrizuotas
eksportas buhalterijai.

Sąskaitos būsenos: `draft → approved → sent → viewed → partially_paid →
paid | overdue | cancelled`.

Pokalbio pavyzdys: „Sukurk sąskaitą įmonei X už visus birželio darbus." —
sistema pati suranda tinkamus darbo įrašus, parodo skaičiavimą ir sukuria
realų dokumentą.

## 11. Komunikacija

Pokalbio variklis susietas su: el. paštu; sistemos pranešimais; vėliau SMS,
WhatsApp ar kitais patvirtintais kanalais.

**Dviejų etapų principas** (taikomas visoms ilgesnėms operacijoms, ne tik
laiškams): (1) iškart patvirtinti, kad veiksmas priimtas, įrašytas ir turi ID;
(2) atskirai pranešti, kai rezultatas paruoštas arba būsena pasikeitė.

## 12. Automatizacijos

Vartotojas pokalbiu kuria automatizacijas, pvz.: kas savaitę suformuoti darbo
suvestinę; mėnesio pabaigoje paruošti sąskaitas; priminti apie neapmokėtas
sąskaitas; perspėti apie dokumentų galiojimo pabaigą; ieškoti naujų tinkamų
darbų; pranešti apie naują tinkamą kandidatą; siųsti ataskaitą klientui;
tikrinti projekto rizikas; priminti darbuotojams užpildyti žurnalą; rezervuoti
paslaugas ar būstą pagal taisykles.

Kiekviena automatizacija turi: ID; savininką; aktyvų įmonės arba asmeninį
kontekstą; grafiką arba sąlygą; būseną; vykdymo istoriją; klaidų istoriją;
galimybę sustabdyti ir atnaujinti.

## 13. Globali lokacijų architektūra

Sistema NĖRA Europe-only. Palaiko: šalį; valstiją; regioną; apskritį; miestą;
adresą; koordinates; nuotolinį darbą; darbą keliose lokacijose.

Pirmos svarbios rinkos: Lietuva; Europa; Gruzija; JAV — bet architektūra
lieka globali (visos ISO šalys).

## 14. Pokalbio istorija ir kanoninė būsena

Pokalbio tekstas nėra vienintelis tiesos šaltinis. Tiesa saugoma kanoninėse DB
struktūrose: profiliuose; įmonėse; veiklose; projektuose; darbo žurnaluose;
CV; įgūdžiuose; dokumentuose; užsakymuose; darbo poreikiuose; sąskaitose;
automatizacijose.

Po kiekvieno veiksmo sistema iš naujo perskaito tikrą būseną. Pokalbio
istorija: susieta su vartotoju; susieta su aktyvia įmone ar projektu;
grupuojama; tęsiama; audituojama; neleidžianti sukurti dvigubų veiksmų.

## 15. Vartotojo sąsaja

Pagrindinė sąsaja: chat-first; vienas klausimas vienu metu; trumpi
pasirinkimai; aiškūs pavyzdžiai; jokio jau žinomų duomenų kartojimo; aiški
pažanga; kontekstiniai CTA; realūs rezultatai, ne dekoratyviniai mygtukai.

Struktūrizuoti duomenys matomi kaip redaguojami rezultatai fone: profilis; CV;
įmonė; projektas; dokumentai; sąskaitos; užsakymai; automatizacijos.

## 16. Architektūros principas

Kanoninė grandinė:

```
Natural language input
→ intent router
→ identity/company/project context resolver
→ missing-data resolver
→ authorization and policy gate
→ canonical dispatcher
→ domain executor
→ database transaction
→ audit/provenance event
→ state readback
→ contextual response
→ optional notification/automation
```

Pagrindiniai domenai: identity; people; organizations; activities; projects;
work journal; CV and skills; matching; demand and recruitment; services
marketplace; housing; documents; invoicing and payments; messaging;
automations; analytics and audit.

**Negalima kurti atskirų dubliuojančių mini sistemų kiekvienai funkcijai** —
kiekvienas naujas gebėjimas jungiasi į esamą kanoninę grandinę
(žr. `docs/PLATFORM_DOCTRINE.md` §2 kanoninių struktūrų žemėlapį).

## 17. Saugumo ir patikimumo principai

default deny; RLS; least privilege; audit trail; provenance; idempotency;
realūs request ID; jokių fake success; jokių neaiškių automatinių destruktyvių
veiksmų; migracijos su rollback; produkcijos migracijos ir pavojingi veiksmai
tik per owner gate; vartotojas mato tik savo arba jam deleguotus duomenis;
viena įmonė negali matyti kitos įmonės duomenų.

## 18. Kas JAU padaryta (neperpristatyti kaip naujų idėjų)

Būsenos 2026-07-27 (žr. `docs/audits/` ir PR istoriją #870–#888):

| Gebėjimas | Būsena | Kur |
|---|---|---|
| Chat-first pokalbio pagrindas (/dashboard) | IMPLEMENTED | #864/#881/#884 |
| Intent detection (deterministinis, LT/EN/RU) | IMPLEMENTED | `lib/conversation/intent-router.ts` |
| Profilio konteksto įkėlimas + state-aware opening | IMPLEMENTED | `worker-activity.ts`, #884 |
| Kriterijų readback iš kanoninių stulpelių | IMPLEMENTED | #881 |
| Darbo žurnalas (hash-chain, append-only) | IMPLEMENTED | `lib/journal/*` |
| Automatinė žurnalo → CV → profilio → matching grandinė | IMPLEMENTED | `skill-pipeline.ts` + #888 |
| Provenance (journal_entry_skills.provenance, prod APPLIED) | IMPLEMENTED | #888, ledger 20260727180000 |
| Darbuotojo vykdikliai (9) per kanoninį dispatch | IMPLEMENTED | `worker-executors.ts` |
| Darbdavio/agentūros vykdikliai (10) | IMPLEMENTED (be pilno UI srauto) | #886 |
| Kontekstiniai CTA, be pasikartojančio meniu | IMPLEMENTED | #884 + guard |
| Pokalbio istorijos UI (collapsed, paginated) | PARTIAL — laukia #883 DB apply | #884/#883 |
| Globalus šalių modelis (249 ISO, GE/US first-class) | IMPLEMENTED | #882 `country-model.ts` |
| Globalus landing su pasaulio žemėlapiu | IMPLEMENTED | #887 |
| Žurnalo klaidų i18n (11 lokalių) | IMPLEMENTED | #885 |
| Pagrindiniai saugumo pataisymai (auditai M/L/I-02, rotacija) | IMPLEMENTED (2 RED migracijos owner-gated: #879, #883) | #870/#871/#879 |
| E2E realumo matrica | PARTIAL (S1, S6a-d, S8 su įrodymais; S2-S5, S7 nebaigti) | PR-I šaka |

## 19. Kas dar PRIVALO būti įgyvendinta

1. pilnas kelių įmonių ir kelių veiklų UX bei teisių modelis;
2. dokumentų reikalavimų ir trūkumo variklis;
3. paslaugų marketplace;
4. būsto marketplace ir rezervacijos;
5. sąskaitų, PDF ir atliktų darbų dokumentų variklis;
6. el. laiškų ir kitų kanalų vykdymas;
7. automatizacijų variklis;
8. pilna pokalbio persistencija;
9. globalūs countries seed duomenys;
10. mokėjimų ir atsiskaitymų logika;
11. pilnas E2E realių vartotojų ir įmonių scenarijams;
12. administravimo ir pagalbos funkcijos;
13. pilotinių vartotojų analitika;
14. patikimas production observability.

Detalus suskaidymas: `docs/plans/LABOURMARKET_AI_FULL_IMPLEMENTATION_ROADMAP.md`.

## 20. Tolimesnio darbo taisyklė

Nuo šiol planuojant bet kokį LabourMarket.ai darbą:

- pirmiausia remtis šiuo dokumentu;
- NEKLAUSTI iš naujo, ar reikalingos kelios įmonės, paslaugos, būstas,
  dokumentai, sąskaitos ar automatizacijos — jos SUTARTOS;
- nelaikyti jų naujomis idėjomis;
- atskirti „sutarta produkto architektūra" nuo „jau įgyvendinta";
- kiekvienoje ataskaitoje būsenas žymėti tik taip:
  **IMPLEMENTED / PARTIAL / NOT_IMPLEMENTED / BLOCKED / VERIFIED_E2E**.
