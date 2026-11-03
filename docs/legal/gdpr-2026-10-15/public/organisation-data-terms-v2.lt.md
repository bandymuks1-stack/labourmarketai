# Organizacijų duomenų sąlygos — LabourMarket.ai

*Įmonėms, agentūroms, mokykloms ir kitoms organizacijoms, kurios platformoje registruoja, įkelia ar tvarko duomenis apie žmones. Apima duomenų tvarkymo sąlygas pagal BDAR 28 straipsnį.*

> **Būsena:** DRAFT v2 — 2026-10-15 (projektas)
> **Reikalinga teisininko peržiūra / Requires lawyer review.** Projektas teisininko peržiūrai. Jis nėra galutinis, dar neturi teisinės galios ir nesertifikuotas.
>
> **Naudoti faktų šaltiniai:**
> - 2026-10-15 auditas `01-personal-data-inventory-and-erasure-classes.md` §1c, §2 (organizacijų įrašų REASSIGN / RETAIN tvarkymas), §3.2 (tik papildomos ir maišos grandine susietos lentelės), §3.3 (darbinis vertinimas: duomenis pateikusi organizacija yra savo įrašų valdytoja, platforma — tos kopijos tvarkytoja ir savo pridedamo atitikimo bei susiejimo valdytoja; įrodymų `organization_person_id` — NO ACTION; tarpiniai įrašai išlieka)
> - `03-rights-consent-legal-pages.md` §3, §4, §7 (nėra valdytojo nustatymo, DTS ir importo patvirtinimo; įrašus skaito importavusi organizacija ir šalių organizacijos; pataisymai tik papildant, vienas įrašui; asmuo gali ginčyti, kai susietas; dvejopas Nonstop Group vaidmuo)
> - `02-processors-transfers-cookies-ai.md` §1 14 eil. ir D4 (darbdavių prijungti MCP asistentai gauna darbuotojų duomenis); §4 (automatinis atitikimas, reitingavimas, `apply_learning_auto_confirmation`)
> - `docs/legal/legal-basis-matrix-v1.md` (santykiu grįstas matomumas); `entity-role-and-data-access-matrix-v1.md`; `subprocessor-register-v2.md`
>
> **Atviri sprendimai:**
> 1. [OPEN DECISION / LAWYER: vaidmuo kiekvienai veiklai — 2 skyriaus lentelė. Faktai to neišsprendžia]
> 2. [OWNER DECISION: pridėti importo patvirtinimo žingsnį (patvirtinamas teisinis pagrindas ir 14 str. pranešimas), kol organizacija dar negali importuoti žmonių duomenų. Šiuo metu jo nėra]
> 3. [OWNER DECISION: ištrynimo ir užtušavimo kelias tik papildomiems, maišos grandine susietiems įrodymų įrašams; trynimo tvarka (įrodymai prieš sąrašo asmenį)]
> 4. [OWNER DECISION: pranešimo apie subtvarkytojų pakeitimą terminas (7.6 p.)]
> 5. [OWNER DECISION: pranešimo organizacijoms apie pažeidimą terminas (7.8 p.)]
> 6. [OWNER DECISION: eksporto formatas ir ištrynimo terminas sutarčiai pasibaigus (7.10 p.)]
> 7. [OWNER DECISION: terminas organizacijoms atsakyti į ginčą ar persiųstą prašymą]
> 8. [LAWYER: atsakomybė ir žalos atlyginimas (9 sk.)]
> 9. [OWNER/LAWYER: ar organizacijos gali prijungti išorinius DI asistentus su prieiga prie darbuotojų nebuvimo ir žurnalo turinio, ar tie įrankiai ribojami (audito D4)]
> 10. [OWNER/LAWYER: kaip šios sąlygos priimamos (patvirtinimas kuriant organizaciją ar importuojant, ar pasirašoma DTS) — šiuo metu niekas neregistruojama]
> 11. [OWNER/LAWYER: 9 str. 2 d. b p. pagrindas ir duomenų kiekio mažinimas darbdavių saugomam nebuvimo priežasties tekstui]

---

## 1. Kam taikomos šios sąlygos

- Šios sąlygos taikomos bet kuriai organizacijai (įmonei, laikinojo įdarbinimo agentūrai, mokyklai ar kitam subjektui), kuri LabourMarket.ai platformoje:
  - registruoja, importuoja ar įkelia duomenis apie žmones — darbuotojus, buvusius darbuotojus, kandidatus, besimokančiuosius, klientų kontaktinius asmenis;
  - organizuoja žmonių darbą per projektus, sąrašus, užsakymus, darbo laiko žiniaraščius, nebuvimus, žurnalo peržiūras ir patvirtinimus.
- Platformą valdo **UAB „Nonstop Group“** (įmonės kodas 302676973, Lietuva), toliau — „mes“. Organizacija — „jūs“.
- Šios sąlygos papildo Naudojimosi sąlygas ir Privatumo politiką. Jei dėl asmens duomenų jos prieštarauja, organizacijų veiklai taikomos šios sąlygos.

## 2. Kas už ką atsako

Lentelėje pateiktas mūsų darbinis vertinimas. **Kur nurodyta OPEN DECISION, vaidmuo dar nenustatytas.** [LAWYER: patvirtinti kiekvieną eilutę. Svarstyti bendrą valdymą pagal 26 str., kai tikslus nustato abi šalys.]

| Veikla | Jūsų vaidmuo | Mūsų vaidmuo | Būsena |
|---|---|---|---|
| Jūsų įrašai apie žmones: sąrašai, importuota darbo istorija, įrodymų įrašai, projektų ir darbo įrašai, jūsų įkelti dokumentai | **Valdytoja** | **Tvarkytoja** (talpiname ir tvarkome jūsų nurodymu, 7 sk.) | OPEN DECISION — darbinis vertinimas 01 audito §3.3 |
| Jūsų darbuotojų darbo laiko, žiniaraščių, nebuvimo ir darbo planų įrašai | **Valdytoja** (darbdavio pareigos) | **Tvarkytoja** | OPEN DECISION |
| Darbuotojo žurnalo įrašų peržiūra ir patvirtinimas; taisyklės, automatiškai patvirtinančios įgūdžius | **Valdytoja** — dėl savo patvirtinimo | **Valdytoja** — dėl paties darbuotojo žurnalo | OPEN DECISION — įrašas susijęs su dviem žmonėmis |
| Sąrašo asmens susiejimas su platformos paskyra; įgūdžių signalų išvedimas iš jūsų įrašų | — | **Valdytoja** (mūsų pačių tikslas) | OPEN DECISION: arba bendri valdytojai (26 str.) |
| Darbuotojų atitikimas ir reitingavimas jūsų paskelbtiems poreikiams | **Valdytoja** — dėl savo atrankos sprendimų | **Valdytoja** — dėl atitikimo paslaugos | OPEN DECISION: arba bendri valdytojai (26 str.) |
| Duomenys, kuriuos darbuotojas jums atskleidžia sutikimu (kontaktai, CV) | Juos gavusi — **savarankiška valdytoja** | **Valdytoja** iki perdavimo | darbinis vertinimas `legal-basis-matrix-v1.md` |
| Jūsų DI asistento (ChatGPT, Claude) prijungimas prie platformos | **Valdytoja**: pati nusprendžiate siųsti duomenis tam teikėjui | suteikiame prieigą jūsų naudotojų teisių ribose | OPEN DECISION — audito D4 |
| Jūsų plano apmokėjimas | klientė | **Valdytoja** | nustatyta |

UAB „Nonstop Group“ viduje įdarbinimo veikla atskirta nuo platformos valdymo. Platformos duomenis ji gauna tik tada, kai to paprašo pats darbuotojas (Privatumo politika, 7 tikslas).

## 3. Jūsų, kaip valdytojos, pareigos

Registruodama ar įkeldama duomenis apie žmones, jūs privalote:

1. **Turėti teisinį pagrindą** (BDAR 6 str.) kiekvienam įrašui. Jei tvarkomi specialių kategorijų duomenys (pvz., sveikatos informacija nebuvimo priežastyje), papildomai reikia 9 str. sąlygos, pvz., darbo teisės pagal 9 str. 2 d. b p. [LAWYER]
2. **Informuoti žmones** (13 ir 14 str.). Praneškite jiems, kad jų duomenys yra platformoje, kodėl ir kaip įgyvendinti savo teises, ne vėliau kaip per vieną mėnesį (14 str. 3 d.).
   - Dėl platformos dalies galite nurodyti mūsų **„Pranešimą žmonėms, neturintiems paskyros“**.
   - Tas pranešimas jūsų pačių pranešimo nepakeičia. [OWNER DECISION: ar pateikiame paruoštą šabloną]
3. **Tvarkyti tik būtinus duomenis** (5 str. 1 d. c p.):
   - Registruokite tik tai, ko reikia tikslui.
   - Neįkelkite asmens dokumentų, sveikatos informacijos, asmens kodų ar banko duomenų, nebent to reikalauja funkcija ir turite teisinį pagrindą.
   - Nebuvimo priežastis rašykite trumpai ir faktiškai.
4. **Užtikrinti tikslumą** (5 str. 1 d. d p.). Atsakote už savo registruojamų ir importuojamų duomenų tikslumą. Klaidas taisykite nedelsdama (5 sk.).
5. **Leisti veikti tik įgaliotiems naudotojams.** Jūsų vardu gali veikti tik jūsų įgalioti asmenys. Už tai, ką jie daro jūsų vardu, įskaitant importą ir patvirtinimus, atsakote jūs.
6. **Įrašuose nurodytos šalys.** Jei įraše kaip šalį nurodote kitą organizaciją (pvz., projekto užsakovą), jos vadovai gali tą įrašą skaityti. Šalį nurodykite tik tada, kai turite teisę su ja dalytis įrašu.
7. **Nepilnamečiai.** Duomenų apie vaikus neregistruokite, nebent turite teisinį pagrindą ir, kai reikia, tėvų dalyvavimą. [OWNER DECISION: taisyklės mokykloms, įtraukiančioms nepilnamečius mokinius]
8. **DI asistentai.** Prijungdama išorinį DI asistentą, pati nusprendžiate siųsti duomenis tam teikėjui. Turite turėti teisinį pagrindą ir sutartį su teikėju. Nenaudokite jo nebuvimo priežastims ar kitam jautriam turiniui tvarkyti, nebent turite tam teisę. [OWNER/LAWYER: įrankių ribojimas]
9. **Nenaudoti kitiems tikslams.** Nenaudokite platformos duomenų nesusijusiems tikslams ir be teisinio pagrindo masiškai neeksportuokite jų į kitas sistemas.

## 4. Kas platformoje mato jūsų įrašus

- Jūsų organizacijos vadovai.
- Organizacijų, kurias įraše nurodote kaip šalį, vadovai.
- Mūsų įgalioti operatoriai, tik tiek, kiek reikia paslaugai teikti, palaikyti ir apsaugoti.

Jūsų įrašai **nerodomi** kitiems kandidatų ieškantiems darbdaviams. Jūsų užregistruotas asmuo įrašą mato tik susiejus jo paskyrą per jūsų atsiųstą kvietimą.

## 5. Tikslumas, pataisymai ir ginčai

- Įrašus galima **tik papildyti**: jų negalima redaguoti. Įrašui pataisyti pridėkite pataisymą. Kiekvienas įrašas gali turėti vieną pataisymą. Taip išlieka sąžininga istorija.
- Asmuo, kurio paskyra susieta su jūsų įrašu, gali įrašą **užginčyti** ir ginčą atsiimti.
- Gavusi ginčą, peržiūrėkite jį ir atsakykite asmeniui. [OWNER DECISION: terminas]
- Įrašą galime pažymėti kaip ginčijamą. Kas teisus, nesprendžiame, nebent to reikalauja teisė.
- [OWNER DECISION: tik papildomų įrašų ištrynimas ar užtušavimas. Šiuo metu sąrašo asmens negalima pašalinti, kol yra įrodymų įrašų, o įrodymų įrašų produkte ištrinti negalima.]

## 6. Susijusių asmenų prašymai

- Jei asmuo dėl duomenų platformoje kreipiasi **į jus**, atsakote jūs. Mes padedame, kaip nurodyta 7.7 punkte.
- Jei asmuo dėl jūsų įrašų kreipiasi **į mus**, nurodome, kad valdytoja esate jūs, ir persiunčiame prašymą jums, nebent teisė reikalauja kitaip. Tada atsakote per BDAR nustatytą terminą (12 str. 3 d.: vienas mėnuo, gali būti pratęstas).
- Dėl pačios platformos duomenų (susiejimų, išvestinių signalų, atitikimo) asmeniui atsakome patys.

## 7. Duomenų tvarkymo sąlygos (BDAR 28 str.)

Šis skyrius taikomas, kai veikiame kaip **jūsų tvarkytoja** (žr. 2 sk.).

1. **Dalykas ir trukmė.** Jūsų įrašų talpinimas ir tvarkymas platformoje — tol, kol naudojatės platforma, ir iki ištrynimo pagal 7.10 punktą.
2. **Pobūdis ir tikslas.** Saugojimas, rodymas jūsų įgaliotiems naudotojams ir jūsų nurodytoms šalims, paieška, eksportas, importo apdorojimas ir jūsų naudojamos funkcijos.
3. **Duomenų rūšys.** Vardai ir nuorodos; darbų aprašymai, datos, vietos ir adresai; darbo laiko, žiniaraščių ir nebuvimo įrašai; patvirtinimai; jūsų įkelti dokumentai ir nuotraukos; pastabos.
4. **Duomenų subjektai.** Jūsų darbuotojai, buvę darbuotojai, darbininkai, kandidatai, besimokantieji ir jūsų klientų kontaktiniai asmenys.
5. **Nurodymai.** Duomenis tvarkome tik pagal jūsų dokumentais įformintus nurodymus. Jūsų naudojimasis platformos funkcijomis ir nustatymais yra jūsų nurodymas. Savo tikslams jų netvarkome, išskyrus 2 skyriuje nurodytas valdytojos veiklas arba kai to reikalauja ES ar valstybės narės teisė; jei teisė to reikalauja, iš anksto jums apie tai pranešame, nebent teisė tai draudžia (28 str. 3 d. a p.).
6. **Subtvarkytojai.** Suteikiate bendrąjį leidimą subtvarkytojams, kurie prieina prie jūsų įrašų:
   - Supabase (duomenų bazė ir failų saugykla, ES);
   - Vercel (talpinimas ir serverio funkcijos);
   - GitHub (automatinės užduotys su technine prieiga prie produkcijos duomenų).

   Visas teikėjų sąrašas pateiktas Privatumo politikos 6 skyriuje. [LAWYER/OWNER: patvirtinti, ar Hostinger (susirašinėjimas dėl prašymų) turi būti šiame sąraše]

   Prieš pridėdami ar pakeisdami subtvarkytoją, pranešame jums prieš [OWNER DECISION: pvz., 30 dienų]. Galite pateikti pagrįstų prieštaravimų dėl duomenų apsaugos. Kiekvienam subtvarkytojui taikome lygiavertes duomenų apsaugos pareigas (28 str. 2 ir 4 d.). [LAWYER/OWNER: DTS su subtvarkytojais kol kas neįrodytos]
7. **Pagalba.** Atsižvelgdami į tai, ką leidžia mūsų sistemos, padedame jums:
   - atsakyti į asmenų prašymus (15–22 str.);
   - vykdyti saugumo, pranešimo apie pažeidimus, PDPV ir išankstinių konsultacijų pareigas (32–36 str.).
8. **Asmens duomenų saugumo pažeidimai.** Apie jūsų įrašus paliečiantį pažeidimą pranešame nepagrįstai nedelsdami, kai apie jį sužinome [OWNER DECISION: pvz., per 48 valandas]. Pateikiame turimą informaciją, kurios jums reikia pagal 33 str. 3 d.
9. **Konfidencialumas ir saugumas.** Prieigą prie duomenų turintiems asmenims taikoma konfidencialumo pareiga. Mūsų saugumo priemonės (32 str.):
   - pačioje duomenų bazėje taikomos ir automatiniais testais tikrinamos prieigos taisyklės;
   - privati failų saugykla su trumpalaikėmis nuorodomis;
   - tik papildomi audito ir sutikimų įrašai;
   - administratoriaus prieiga, suteikta tik nedideliam žmonių skaičiui.

   [OWNER/LAWYER: laukiama oficialaus techninių ir organizacinių priemonių aprašo]
10. **Sutarties pabaiga.** Nustojusi naudotis platforma, savo įrašus galite eksportuoti. Paskui juos ištriname, nebent ES ar valstybės narės teisė reikalauja juos saugoti. [OWNER DECISION: eksporto formatas ir ištrynimo terminas. Atkreipkite dėmesį į techninį apribojimą 5 skyriuje]
11. **Perdavimas.** Duomenys talpinami ES. Kai subtvarkytojas tvarko duomenis už EEE ribų, turi būti taikoma 44–49 str. numatyta priemonė. [LAWYER/OWNER: patvirtinti kiekvienam tiekėjui — kol kas nė viena neįrodyta]
12. **Informacija ir auditas.** Pateikiame informaciją, reikalingą įrodyti, kad šio skyriaus laikomasi. Leidžiame atlikti pagrįstus jūsų ar jūsų auditoriaus auditus ir juose dalyvaujame, iš anksto apie juos pranešus ir laikantis konfidencialumo (28 str. 3 d. h p.).
13. **Įrašai.** Kaip tvarkytoja tvarkome duomenų tvarkymo veiklos įrašus (30 str. 2 d.).

## 8. Kai esame valdytoja

2 skyriuje mums priskirtoms veikloms esame valdytoja pagal savo Privatumo politiką. Kai šios veiklos remiasi jūsų įrašais (pvz., susiejimas ar atitikimas), patvirtinate, kad galite mums pateikti įrašus šiems tikslams. [LAWYER]

## 9. Atsakomybė

[LAWYER: organizacijos ir UAB „Nonstop Group“ atsakomybės paskirstymas pagal BDAR 82 str.; žalos atlyginimas už neteisėtą duomenų įkėlimą; ribos, suderintos su Naudojimosi sąlygomis]

## 10. Pakeitimai, priėmimas ir taikoma teisė

- [OWNER/LAWYER: kaip šios sąlygos priimamos ir užregistruojamos]
- Apie esminius pakeitimus pranešame prieš jiems įsigaliojant. [OWNER DECISION: įspėjimo terminas]
- Taikoma Lietuvos teisė, o ginčų teismingumą nustato Naudojimosi sąlygos.
- Versija **v2 (projektas), 2026-10-15**.

## 11. Kontaktai

info@labourmarket.ai — UAB „Nonstop Group“, Mūšos g. 2C, Aukštikalnių k., Pasvalio apylinkių sen., LT-39103 Pasvalio r. sav., Lietuva. Duomenų apsaugos pareigūnas nepaskirtas.
