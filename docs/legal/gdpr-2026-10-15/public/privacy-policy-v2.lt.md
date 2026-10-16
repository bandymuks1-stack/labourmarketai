# Privatumo politika — LabourMarket.ai

> **Būsena:** DRAFT v2 — 2026-10-15 (projektas)
> **Reikalinga teisininko peržiūra / Requires lawyer review.** Tai projektas teisininko peržiūrai. Jis nėra galutinis, dar neturi teisinės galios ir niekieno nesertifikuotas.
>
> **Naudoti faktų šaltiniai (ir tik jie):**
> - 2026-10-15 auditas: `gdpr-2026-10-15/audit/01-personal-data-inventory-and-erasure-classes.md`, `02-processors-transfers-cookies-ai.md`, `03-rights-consent-legal-pages.md`
> - `docs/legal/`: `corporate-identity-source-of-truth-v1.md`, `legal-basis-matrix-v1.md`, `data-retention-matrix-v1.md`, `retention-decision-package-v1.md`, `processing-activities-register-v1.md`, `subprocessor-register-v2.md`, `entity-role-and-data-access-matrix-v1.md`, `dpo-requirement-assessment-v1.md`, `consent-copy-register-v1.md`, `deletion-process-design-v1.md`, `privacy-risk-and-dpia-screening-v1.md`
> - Dabar paskelbtas tekstas: `apps/web/messages/lt.json` → `legal.*`; `apps/web/lib/privacy/consent-definitions.ts`; `apps/web/lib/billing/plans.ts`
>
> **Atviri sprendimai (būtina išspręsti prieš skelbiant):**
> 1. [OWNER DECISION: saugojimo terminai kiekvienai duomenų klasei — A paketo sprendimai 1, 2, 3, 3b nepatvirtinti; visi 9 skyriaus terminai yra tik siūlymai]
> 2. [OWNER DECISION: sutikimo juosta analitikos saugyklai ARBA telemetriją padaryti griežtai būtiną / tik agreguotą. Šiuo metu analitikos įrašai įrenginyje daromi be sutikimo]
> 3. [OWNER DECISION: minimalus amžius (16 ar 18) ir taisyklė besimokantiesiems / studentams]
> 4. [OWNER DECISION: prašymų kanalas žmonėms be paskyros]
> 5. [OWNER DECISION: Gemini — patvirtinti mokamą planą prieš vėl įjungiant užduotis su asmens duomenimis; iki tol ši politika teigia, kad jos išjungtos]
> 6. [LAWYER/OWNER: patvirtinti perdavimo priemonę (SSS / ES ir JAV duomenų privatumo sistema / tinkamumo sprendimas) kiekvienam tiekėjui — saugykloje nė viena neįrodyta]
> 7. [LAWYER/OWNER: patvirtinti, kad DTS priimtos su Supabase, Vercel, Stripe, Resend, Hostinger, GitHub]
> 8. [LAWYER: teisinis pagrindas kiekvienam tikslui (4 skyriaus lentelė) — tik darbinis susiejimas]
> 9. [LAWYER: organizacijų, įkeliančių žmonių duomenis, vaidmuo — žr. `organisation-data-terms-v2`, kur tai pažymėta kaip ATVIRAS SPRENDIMAS, įskaitant bendrą valdymą pagal 26 str.]
> 10. [OWNER/LAWYER: PDPV automatiniam atitikimui ir kandidatų reitingavimui — riba jau peržengta, PDPV nėra]
> 11. [OWNER: patvirtinti, ar produkcijoje įjungtos Nonstop Group perdavimo jungtis (`NONSTOP_HANDOFF_ENDPOINT`), Telegram pranešimai savininkui ir Agentai OS pranešimų tiltas]
> 12. [OWNER: įvardyti partnerių galimybių tinklo „partnerių infrastruktūros“ teikėją]
>
> **[VIDINĖ PASTABA — pašalinti prieš skelbiant]**
> - [OWNER/LAWYER: laukiama ankstesnio nemokamo plano tvarkymo vertinimo] Nuo 2026-08-28 iki #2399 žinučių tekstas ir pokalbyje įvesti sakiniai buvo siunčiami Gemini be įrodymo, kad naudotas mokamas planas. Ši politika to laikotarpio neaprašo kaip fakto. Reikia sprendimo dėl pažeidimo vertinimo pagal 33–34 str.
> - IŠSPRĘSTA 2026-10-15: 2 `extract_cv` ir 13 `translate_vacancy` įrašai Gemini nepasiekė (duomenų perdavimo filtras atmetė, žetonų nėra). `data_categories_sent` fiksuoja numatytas, o ne perduotas kategorijas. 8 skirsnis dabartiniam veikimui tikslus. Ankstesnis tvarkymas (145 žinučių vertimai 2026-09-28→10-09, 79 pokalbio supratimo užklausos 2026-09-05→10-14) – vidinis vertinimo klausimas (INC-2026-001), ne viešas tekstas.
> - Iš gyvų puslapių pašalinti teiginius „mokėjimai neaktyvūs“, „nekuriami elgsenos profiliai“, „nėra analitikos“ ir „Gemini verčia darbo skelbimus“. Audito D1, D5, D10 ir L7 punktai rodo, kad jie neteisingi.
> - Direktoriaus vardo negalima skelbti viešame tekste, kol jis nepatikrintas (`corporate-identity-source-of-truth-v1.md` §4 Nr. 2).

---

## 1. Kas mes esame ir kaip su mumis susisiekti

LabourMarket.ai platformos duomenų valdytoja:

**UAB „Nonstop Group“**
Įmonės kodas 302676973, PVM mokėtojo kodas LT100010790613
Mūšos g. 2C, Aukštikalnių k., Pasvalio apylinkių sen., LT-39103 Pasvalio r. sav., Lietuva

- Privatumo kontaktas: **info@labourmarket.ai**. Tai pašto dėžutė, o ne duomenų apsaugos pareigūnas.
- **Duomenų apsaugos pareigūnas (DAP) nepaskirtas.** Įvertinome BDAR 37 straipsnį ir nustatėme, kad šiuo metu jo skirti neprivaloma. [LAWYER: įvertinti iš naujo — dabar veikia automatinis atitikimas, o tai yra pakartotinio vertinimo sąlyga pagal `dpo-requirement-assessment-v1.md` §5]
- „LabourMarket.ai“ yra platformos pavadinimas, o ne įmonė.
- **Labour Market AI Sp. z o.o.** (Varšuva, Lenkija) priklauso programinė įranga ir prekės ženklas. Ji suteikia jų licenciją UAB „Nonstop Group“. Ji nėra jūsų duomenų valdytoja ar tvarkytoja ir neturi įprastinės prieigos prie produkcijos duomenų bazės, profilių, CV, kontaktų ar dokumentų.

## 2. Mūsų vaidmuo ir organizacijų vaidmuo

Galimos trys situacijos. Nuo jų priklauso, kas atsako už jūsų duomenis.

| Situacija | Kas sprendžia dėl duomenų | Mūsų vaidmuo |
|---|---|---|
| Jūsų paskyra, profilis, gyvasis CV, darbo žurnalas, sutikimai, žinutės, atitikimas ir kitos platformos funkcijos | UAB „Nonstop Group“ | **Valdytoja** |
| Įrašai, kuriuos įmonė, agentūra ar mokykla sukuria ar įkelia apie žmones (pvz., darbuotojų sąrašas, importuota darbo istorija, projektų įrašai, nebuvimo ar darbo laiko įrašai) | Ta organizacija — dėl savo įrašų | Dažniausiai organizacijos **tvarkytoja** (BDAR 28 str.). Tai, ką platforma prideda pati, pvz., įrašo susiejimą su paskyra ar atitikimą, tvarkome kaip **valdytoja**. [LAWYER: patvirtinti kiekvienai veiklai — žr. `organisation-data-terms-v2`, kur tai pažymėta kaip ATVIRAS SPRENDIMAS, įskaitant bendrą valdymą pagal 26 str.] |
| Duomenys, kuriuos patys nusprendžiate siųsti kitur (savo DI asistentui, savo Google paskyrai, darbdaviui, gavusiam duomenis jums sutikus) | Gavėjas — dėl savo tvarkymo | Už gavėjo atliekamą tvarkymą neatsakome |

Jei valdytoja yra organizacija, ji pati turi jus informuoti apie savo tvarkymą. Vis tiek galite kreiptis į mus: prašymą perduosime arba nurodysime, į ką kreiptis.

## 3. Kieno duomenims taikoma ši politika

- **Žmonėms, turintiems paskyrą:** darbuotojams, darbo ieškantiems asmenims, besimokantiesiems ir žmonėms, kurie naudojasi platforma įmonės, agentūros ar mokyklos vardu.
- **Žmonėms be paskyros**, kurių duomenys patenka į platformą:
  - žmonėms, kurių darbo istoriją užregistravo ar importavo organizacija;
  - kontaktiniams asmenims, nurodytiems viešuose darbo skelbimuose;
  - kontaktiniams asmenims verslo užklausose (pvz., įmonės poreikio užklausoje);
  - el. paštu pakviestiems, bet dar neprisijungusiems žmonėms.

  Žmonėms be paskyros skirtas atskiras pranešimas — **„Pranešimas žmonėms, neturintiems paskyros“**.
- **Viešosios svetainės lankytojams** (techniniai duomenys, žr. Slapukų ir saugyklos politiką).

## 4. Kam naudojame duomenis ir kokiu teisiniu pagrindu

Teisiniai pagrindai nurodyti BDAR 6 straipsnio 1 dalyje: a) sutikimas, b) sutartis, c) teisinė prievolė, f) teisėtas interesas. [LAWYER: patvirtinti kiekvieną eilutę]

Skiltyje „Saugoma“ nurodyta dabartinė taisyklė; siūlomi terminai — 9 skyriuje. „Tvarkytojai“ — tai mūsų paslaugų teikėjai, išvardyti 6 skyriuje.

| Nr. | Tikslas | Duomenys | Teisinis pagrindas | Šaltinis | Saugoma | Gavėjai |
|---|---|---|---|---|---|---|
| 1 | Sukurti ir tvarkyti jūsų paskyrą, prijungti jus | el. paštas, prisijungimo tapatybė, kalba. Jungiantis per Google: vardas, el. paštas, profilio nuotraukos nuoroda, Google paskyros ID | 6(1)(b) | jūs; Google | kol paskyra ištrinama | tvarkytojai (Supabase; Resend ir Amazon SES — prisijungimo laiškams) |
| 2 | Jūsų profilis ir gyvasis CV | profesija, įgūdžiai, patirtis, išsilavinimas, pasiekimai, kalbos, prieinamumas, atlygio lūkesčiai (jei nurodėte), nuotrauka, nuorodos į išorinius profilius, dokumentų sąrašas | 6(1)(b) | jūs | kol paskyra ištrinama | tvarkytojai; kitiems — tik pagal 4, 5, 6, 8 tikslus |
| 3 | Darbo žurnalas ir darbo įrašai | žurnalo įrašai (tekstas, nuotraukos, rodikliai), valandos, darbo laiko žiniaraščiai, darbo planai, užduotys, nebuvimai | 6(1)(b). Kai darbdavys tvarko darbo laiko ar nebuvimo įrašus, valdytojas yra darbdavys, vykdantis savo teisines prievoles (6(1)(c)) | jūs; jūsų organizacija | kol paskyra ištrinama; darbdavio įrašai — žr. 9 sk. | organizacijos, kuriai priklauso darbas, vadovai; tvarkytojai |
| 4 | Leisti įmonėms ir agentūroms rasti ribotą profesinę santrauką | rodomas vardas, profesija, patirtis, įgūdžiai, apytikslis regionas, prieinamumas, kalbos, atlygio lūkesčiai (tik jei nurodėte) | **6(1)(a) sutikimas** („profilio matomumas“), įjungiamas savo noru | jūs | kol atšauksite | registruotos įmonės ir agentūros |
| 5 | Perduoti jūsų kontaktus, CV ar pasirinktus laukus **vienai** įvardytai įmonei dėl vieno poreikio | tik jūsų patvirtinti laukai | **6(1)(a) sutikimas** („perdavimas įmonei“) | jūs | perdavimo įrašas — 9 sk. | tik ta įmonė |
| 6 | Rodyti jūsų prieinamumą partnerių galimybių tinkle, kuris ieško darbo ir už platformos ribų | tik neatpažįstama nuoroda ir profesiniai požymiai: be vardo, el. pašto, telefono, adreso, CV failo ar žurnalo turinio. Tai pseudonimizuoti, ne anoniminiai duomenys | **6(1)(a) sutikimas** („partnerių tinklas“) | jūs | kuriama iš naujo kiekvieno atnaujinimo metu; atšaukus sutikimą dingsta per kitą atnaujinimą | partnerių infrastruktūra, veikianti mūsų nurodymu [OWNER: įvardyti teikėją] |
| 7 | Perduoti jūsų susidomėjimą darbo skelbimu Nonstop Group įdarbinimo paslaugai, kai to paprašote | leidžiamų sąraše esantys faktai, kurių reikia skelbimui | 6(1)(a) tame žingsnyje duotas sutikimas [LAWYER: arba 6(1)(b)] | jūs | [OWNER DECISION] | UAB „Nonstop Group“ įdarbinimo paslauga |
| 8 | Jūsų priimti darbo santykiai (sąrašas ar komanda, užsakymai, įsipareigojimai, projektai) | profesinė santrauka; žurnalo įrašai pagal tą įsipareigojimą | 6(1)(b); 6(1)(f) — organizacijos koordinavimui | jūs; organizacija | kol santykis aktyvus; įrašai — 9 sk. | tos organizacijos atsakingi asmenys |
| 9 | Atitikimas ir rekomendacijos (žr. 8 sk.) | profesiniai duomenys, prieinamumas, regionas, įrodymai jūsų įraše | 6(1)(b) — rekomendacijoms jums; 6(1)(f) — darbdaviams rodomam reitingavimui, **tik tarp žmonių, įjungusių matomumą** [LAWYER] | platforma | perskaičiuojama; atitikimo kvituose saugomi tik skaičiai ir nuorodos | jūs; darbdaviai (tik jei įjungtas matomumas) |
| 10 | Mūsų operatorių komandos atliekamas atitikimas | vardai ir profesiniai duomenys vidiniame telkinyje. Be jūsų sutikimo niekas neperduodama | 6(1)(f) | platforma | kol yra paskyra | tik mūsų operatorių komanda |
| 11 | Naudotojų žinutės | žinutės tekstas, priedai, kito asmens rodomas vardas | 6(1)(b) | jūs; kitas asmuo | saugoma (9 sk.) | pokalbio dalyviai; tvarkytojai |
| 12 | Įrodyti sutikimus ir duomenų perdavimus (7 str. 1 d., 5 str. 2 d.) | sutikimo įvykiai (tikslas, teksto versija ir maiša, kalba, laikas), perdavimo įrašai. **Be IP adreso ir naršyklės duomenų** | 6(1)(c) ir 6(1)(f) | platforma | negali būti keičiami (9 sk.) | jūs; institucijos, jei to reikalauja teisė |
| 13 | Nagrinėti privatumo prašymus | prašymas ir mūsų nagrinėjimo pastabos | 6(1)(c) | jūs | 9 sk. | mūsų privatumo komanda; tvarkytojai |
| 14 | Organizacijos apie jus tvarkomi įrašai (pvz., importuota darbo istorija) | vardas taip, kaip jį įrašė organizacija, jos nuoroda, darbų aprašymai, datos, vietos, patvirtinimai | organizacijos pagrindas (ji yra valdytoja). Mūsų susiejimas ir atitikimas — 6(1)(f) [LAWYER] | organizacija | sprendžia organizacija | tos organizacijos vadovai ir organizacijų, nurodytų įraše kaip šalis, vadovai |
| 15 | Vieši darbo skelbimai | darbdavio pavadinimas, organizacijos numeris, skelbimo tekstas, kuriame gali būti kontaktinio asmens vardas, el. paštas ar telefonas | 6(1)(f) — rodyti esamą darbą [LAWYER: 14 str. 5 d. b p.] | Švedijos ir Norvegijos viešosios užimtumo tarnybos | kol aktyvūs; pašalinti skelbimai paslepiami (9 sk.) | visi prisijungę naudotojai |
| 16 | Verslo užklausos ir pranešimai savininkui | įmonės pavadinimas, kontaktinis asmuo, poreikio informacija | 6(1)(b) — iki sutarties / 6(1)(f) | užklausos pateikėjas | [OWNER DECISION] | mūsų komanda; pranešimų savininkui kanalas, jei įjungtas |
| 17 | Mokami organizacijų planai ir sąskaitos | atsiskaitymo kontakto el. paštas ir vardas, **atsiskaitymo adresas, PVM ar mokesčių mokėtojo kodas**, organizacijos ir plano nuoroda. Kortelės duomenys keliauja tiesiai į Stripe | 6(1)(b); 6(1)(c) — apskaita ir mokesčiai | organizacija; Stripe | įstatymo nustatytas terminas (9 sk.) | Stripe; mokesčių institucijos ir buhalteriai, kai to reikalauja teisė |
| 18 | Produkto analitika (žr. 8 sk. ir Slapukų ir saugyklos politiką) | su jūsų paskyros ID susieti įvykiai, atsitiktinis seanso ID, puslapis, kalba, pirmojo apsilankymo kampanijos duomenys (`utm_*`, nukreipusi svetainė, pirmas puslapis), organizacijos ID | 6(1)(f) — analizei; **sutikimas** — identifikatorių saugojimui jūsų įrenginyje (e. privatumo direktyvos 5 str. 3 d.) [OWNER DECISION: juosta arba atsisakyti] | jūsų įrenginys | saugoma (9 sk.) | mūsų komanda; tvarkytojai |
| 19 | Saugumas, piktnaudžiavimo prevencija ir audito žurnalai | užklausų duomenys, IP adresas talpinimo žurnaluose, svarbių pakeitimų audito įrašai | 6(1)(f) | jūsų įrenginys; platforma | [OWNER: talpinimo žurnalų laikotarpis] | tvarkytojai |
| 20 | DI pagalbinės funkcijos (žr. 8 sk.) | šiuo metu DI teikėjui siunčiama tik vieša rinkos statistika | 6(1)(f) | platforma | rezultato ištraukos ištrinamos po 90 dienų | Google (Gemini API) |
| 21 | Jūsų DI asistento prijungimas (ChatGPT, Claude ir kt.) | tai, ką leidžiate asistentui skaityti, neviršijant jūsų teisių | 6(1)(b), jūsų prašymu | jūs | kol atjungsite | asistento teikėjas |
| 22 | Apytikslė prisijungimo vieta, jei nusprendžiate ja pasidalyti | vieta miesto tikslumu | 6(1)(a) [OWNER: patikrinti funkciją ir sutikimo tekstą] | jūs | kol atšauksite | tvarkytojai |
| 23 | Susirašinėjimas su mumis | jūsų el. paštas ir laiškas | 6(1)(f); 6(1)(c) — teisių įgyvendinimo prašymui | jūs | [OWNER DECISION] | pašto dėžutės teikėjas |

**Specialių kategorijų duomenys (BDAR 9 str.).** Neprašome duomenų apie sveikatą, rasinę ar etninę kilmę, religiją, politines pažiūras, narystę profesinėse sąjungose ar biometrinių duomenų. Vis dėlto laisvo teksto laukuose tokių duomenų gali atsirasti, jei kas nors juos įrašo, pvz., nebuvimo priežastyje. Nebuvimo priežastį mato tik jūs ir ją peržiūrintis vadovas. [LAWYER: 9 str. 2 d. b p. pagrindas darbdavių nebuvimo įrašams; svarstyti priežasties teksto ribojimą]

**Ar privalote pateikti duomenis?** Duomenys, pažymėti 6(1)(b), reikalingi funkcijai teikti. Be jų funkcija neveiks. Kiekvienas sutikimo tikslas yra neprivalomas. Atsisakius niekas kita jūsų paskyroje nesikeičia.

## 5. Iš kur gauname duomenis

- **Iš jūsų:** tai, ką įvedate, įkeliate ar pasakote produkte.
- **Iš organizacijų:** įmonė, agentūra ar mokykla gali užregistruoti ar importuoti faktus apie jūsų darbą (sąrašus, darbo istoriją, projektų ir darbo laiko įrašus). Ji taip pat gali patvirtinti jūsų žurnalo įrašus.
- **Iš kitų naudotojų:** žinutės, jūsų darbo patvirtinimai, kvietimai, kuriuose jūs įvardytas.
- **Iš Google**, jei jungiatės per Google.
- **Iš Stripe** — apie organizacijos plano mokėjimus.
- **Iš viešų šaltinių:** darbo skelbimai, kuriuos skelbia Arbetsförmedlingen (Švedija) ir NAV (Norvegija). Struktūrizuoto NAV kontaktų sąrašo nesaugome. Tačiau skelbimo tekste gali būti nurodytas kontaktinis asmuo.
- **Iš jūsų įrenginio:** techniniai ir analitikos duomenys (žr. Slapukų ir saugyklos politiką).

## 6. Kas gauna duomenis

**Platformos viduje** duomenys pagal nutylėjimą uždari. Kiti naudotojai mato tik tai, ką leidžia konkreti taisyklė. Šios taisyklės aprašytos puslapyje „Jūsų duomenys ir kas juos mato“.
- Įmonės ir agentūros mato jūsų ribotą santrauką tik tada, jei įjungėte matomumą (4 tikslas).
- Jūsų kontaktus, CV ar dokumentus jos mato tik po atskiro patvirtinimo konkrečiai įmonei (5 tikslas).
- Organizacijos, su kuria dirbate, vadovai mato tai, ko reikia tam santykiui (8 tikslas).
- Jūsų darbo istoriją užregistravusios organizacijos vadovai gali ją skaityti. Taip pat gali ir organizacijos, įraše nurodytos kaip šalis, vadovai.
- Kai darbdavys ar vadovas prijungia savo DI asistentą, asistentas gali skaityti tai, ką gali skaityti tas vadovas. Tai gali apimti duomenis apie jus, pvz., kandidatų paieškos rezultatus, darbuotojų sąrašą ar nebuvimo prašymus. Už šį pasirinkimą atsako organizacija. [LAWYER: valdytojo ir gavėjo analizė — audito D4 punktas]

**Mūsų paslaugų teikėjai (tvarkytojai).** Jie veikia mūsų nurodymu:

| Teikėjas | Ką daro | Vieta |
|---|---|---|
| Supabase | duomenų bazė, prisijungimas, failų saugykla | ES (Airija, eu-west-1); patronuojančioji įmonė JAV |
| Vercel | talpinimas, serverio funkcijos (Dublinas), užklausų žurnalai | funkcijos Dubline; dalis užklausų apdorojimo vyksta Vercel pasauliniame kraštinių serverių tinkle; JAV įmonė |
| Resend, siunčiantis per Amazon SES (eu-west-1) | registracijos ir prisijungimo laiškai | JAV įmonė; siuntimas ES |
| Stripe Payments Europe | organizacijų planų mokėjimų apdorojimas. Savo sukčiavimo prevencijos ir teisinių pareigų atžvilgiu Stripe yra savarankiška valdytoja | Airija; pasaulinė grupė |
| Hostinger | info@labourmarket.ai pašto dėžutė [OWNER: patikrinti teikėją ir vietą] | [patikrinti] |
| GitHub | kodo talpinimas ir automatinės užduotys. Šios užduotys techniškai gali pasiekti produkcijos duomenis ir įrašyti viešus darbo skelbimų duomenis | JAV |
| Google (Gemini API) | DI apdorojimas. Šiuo metu siunčiama **tik vieša rinkos statistika** | Google infrastruktūra |
| Telegram arba Agentai OS pranešimų tiltas | trumpi pranešimai savininkui apie verslo užklausas. Be darbuotojų duomenų. **Tik jei įjungta** [OWNER: patvirtinti] | už EEE ribų |

**Savarankiški gavėjai.** Jie patys sprendžia, kaip naudoti duomenis:
- **Google**, kai naudojate „Tęsti su Google“.
- **OpenStreetMap Foundation.** Žemėlapio dalys kraunamos iš jos serverių, todėl jūsų naršyklė jai siunčia jūsų IP adresą ir peržiūrimą žemėlapio sritį.
- **Jūsų naršyklės gamintojas** (pvz., Google ar Apple), jei naudojate balso diktavimą. Naršyklė siunčia garsą į savo kalbos atpažinimo paslaugą; mes garso negauname.
- **DI asistento teikėjas**, kurį prijungiate jūs arba jūsų organizacija.
- **Įmonės**, gavusios jūsų duomenis jums sutikus.
- **Institucijos**, kai to reikalauja teisė.

**UAB „Nonstop Group“ viduje.** UAB „Nonstop Group“ taip pat vykdo įdarbinimo veiklą. Šiai veiklai jūsų duomenis ji gauna tik tada, kai to paprašote (7 tikslas).

## 7. Perdavimas už Europos ekonominės erdvės ribų

Pagrindinė mūsų duomenų bazė yra ES. Kai kurie teikėjai yra JAV įmonės arba tvarko duomenis už EEE ribų:
- Vercel kraštinių serverių tinklas;
- JAV patronuojančiųjų įmonių prieiga pagalbos tikslais;
- GitHub valdomi vykdymo serveriai;
- Google;
- Telegram, jei įjungtas.

OpenStreetMap Foundation veikia Jungtinėje Karalystėje, kuriai priimtas ES tinkamumo sprendimas.

Kai duomenys perduodami už EEE ribų, turi būti taikoma BDAR 44–49 straipsniuose numatyta priemonė: tinkamumo sprendimas, ES ir JAV duomenų privatumo sistema arba standartinės sutarčių sąlygos. [LAWYER/OWNER: patvirtinti SSS / DPF / tinkamumo pagrindą kiekvienam tiekėjui. Mūsų įrašuose kol kas nė vienas neįrodytas. Neskelbti nepatvirtintos priemonės.] Galite paprašyti apsaugos priemonių kopijos.

## 8. DI funkcijos, atitikimas ir profiliavimas

**Automatinis atitikimas ir reitingavimas vyksta. Tačiau sprendimų, grindžiamų vien automatizuotu tvarkymu ir sukeliančių jums teisinių ar panašiai reikšmingų pasekmių, nepriimame (BDAR 22 str.).** Kiekvieną reikšmingą sprendimą priima žmogus: su kuo susisiekti, kam pasiūlyti darbą, ką priimti, patvirtinti ar atmesti.

Kas vyksta automatiškai:

- **Poreikio ir darbuotojų atitikimas.** Organizacijai paskelbus ar vėl atidarius poreikį, taisyklėmis grįsta atitikimo sistema surikiuoja darbuotojus, įjungusius matomumą. Ji nesiunčia jokių žinučių, kvietimų ar pranešimų. Ar su kuo nors susisiekti, sprendžia organizacija.
- **Kandidatų reitingavimas.** Darbdavio paieškos rezultatai rikiuojami pagal atitiktį. Darbdavys pirmiausia mato trumpą geriausių rezultatų sąrašą (šiuo metu 8). Reitingas lemia, kas matomas pirmas. Jis niekada nieko neatmeta.
- **Darbo pranešimai ir „nauji tinkami darbai“.** Lyginame jūsų profilį su laisvomis darbo vietomis ir jas jums rekomenduojame.
- **Gyvojo CV išvados.** Iš jūsų įrodymų siūlome tiesioginius, netiesioginius ir galimus gebėjimus. Pasiūlymas lieka pasiūlymu. Jis žymimas atskirai nuo to, ką deklaravote, ir nuo to, ką kas nors patvirtino ar sertifikavo.
- **Organizacijų patvirtinimo taisyklės.** Organizacija gali nustatyti taisyklę, kuri jos įraše patvirtina įgūdį, kai pasiekiama jos pasitikėjimo riba. [OWNER/LAWYER: trūksta pranešimo ir paaiškinimo darbuotojui — 03 audito priedas]

**DI modeliai.**
- Šiuo metu vienintelė užduotis, pasiekianti išorinį DI modelį (Google Gemini), yra **viešos rinkos statistikos** paaiškinimas. Joje nėra asmens duomenų.
- Žinučių vertimas ir pasiūlymai pokalbyje įvestiems sakiniams asmens duomenims yra **išjungti**. Jie liks išjungti, kol bus patvirtintos mokamos, sutartimi grįstos DI teikėjo sąlygos. [OWNER DECISION: vėl įjungti tik patvirtinus mokamą planą; prieš tai atnaujinti šį skyrių]
- DI rezultatas visada yra tik pasiūlymas. Niekas neišsaugoma kaip faktas apie jus, kol to nepatvirtinate jūs ar atsakingas asmuo.
- DI niekada nepatvirtina įgūdžių, nepriima ir neatmeta kandidatų ir su niekuo nesusisiekia.
- DI vykdymų žurnaluose saugoma trumpa rezultato ištrauka. Ji ištrinama po 90 dienų.

**Jūsų pasirinkimai.**
- Matomumą galite bet kada išjungti. Tada naujose paieškose nebedalyvaujate darbdavių atitikime.
- Galite nesutikti su profiliavimu, grindžiamu teisėtu interesu (10 sk.), ir paprašyti, kad žmogus paaiškintų reitingą.

[LAWYER: įvertinti, ar taisyklėmis grįsta atitikimo sistema yra „DI sistema“ pagal ES dirbtinio intelekto aktą (Reglamentas (ES) 2024/1689, 3 str. 1 p.). Jei taip, patikrinti III priedo 4 punktą (užimtumas). Viešai klasifikacijos neskelbti, kol neįvertinta.]

## 9. Kiek laiko saugome duomenis

Šiuo metu duomenys saugomi, kol egzistuoja jūsų paskyra ir kol jų dar reikia funkcijai. Toliau nurodyti terminai yra **siūlymai, kurie dar nepatvirtinti**. [OWNER DECISION: patvirtinti arba pakeisti kiekvieną — A paketas]

| Duomenys | Dabar | Siūlomas terminas |
|---|---|---|
| Paskyra, profilis, gyvasis CV | kol paskyra ištrinama | tas pats |
| Darbo žurnalas | kol paskyra ištrinama | [OWNER DECISION: ištrinti ar išsaugoti atsietus įrodymus. Dabar ištrynus paskyrą ištrinamas ir žurnalas] |
| Žinutės | saugomos | [OWNER DECISION: 36 mėnesiai po pokalbio uždarymo] |
| Užsakymai ir įsipareigojimai | saugomi | [OWNER DECISION: 6 metai po pabaigos — reikalavimų pareiškimo terminas; LAWYER] |
| Nebuvimo priežasties tekstas | saugomas | [OWNER DECISION: 12 mėnesių] |
| Pranešimai | saugomi | [OWNER DECISION: 12 mėnesių] |
| Analitikos įvykiai | saugomi | [OWNER DECISION: 24 mėnesiai arba ištrinti paprašius] |
| Sutikimų ir perdavimų įrašai | saugomi, keisti negalima | [OWNER DECISION: paskyros galiojimo laikas + 6 metai; ištrynus paskyrą — pseudonimizuoti] |
| Privatumo prašymai | saugomi | [OWNER DECISION: 3 metai po užbaigimo] |
| Atsiskaitymai ir sąskaitos faktūros | saugomi | [LAWYER: įstatymo nustatytas apskaitos dokumentų saugojimo terminas; pagal Lietuvos teisę įprastai 10 metų] |
| DI rezultatų ištraukos | **ištrinamos po 90 dienų** (vykdoma kasdien) | tas pats |
| Organizacijų pateikti įrašai | saugomi | sprendžia organizacija [OWNER DECISION: numatytasis terminas importo tarpiniams įrašams] |
| Pašalinti vieši darbo skelbimai | saugomi, paslėpti | [OWNER DECISION: 12 mėnesių po pašalinimo] |
| Atsarginės kopijos | rotuojamos teikėjo nustatyta tvarka | teikėjo laikotarpis [OWNER: nurodyti tikrąjį laikotarpį] |

## 10. Jūsų teisės

Pagal BDAR 15–22 straipsnius turite teisę:

- **Susipažinti** (15 str.): gauti savo duomenų kopiją ir informaciją, kaip juos naudojame.
- **Ištaisyti** (16 str.): pataisyti neteisingus duomenis. Išsaugotų žurnalo įrašų perrašyti negalima, bet galite pridėti pataisymą. Organizacijos tvarkomus įrašus taiso ta organizacija; kai jūsų paskyra susieta, juos galite užginčyti.
- **Ištrinti** (17 str.): reikalauti ištrinti duomenis, išskyrus tuos, kuriuos privalome saugoti (pvz., apskaitos dokumentus ar sutikimo įrodymus).
- **Apriboti** (18 str.): prašyti apriboti naudojimą, kol tikrinamas klausimas.
- **Perkelti** (20 str.): gauti mums pateiktus duomenis kompiuterio skaitomu formatu.
- **Nesutikti** (21 str.): nesutikti su tvarkymu, grindžiamu teisėtu interesu, įskaitant profiliavimą, analitiką ir operatorių atitikimą. Tada tvarkymą nutrauksime, nebent turime įtikinamų teisėtų priežasčių.
- **Reikalauti žmogaus peržiūros** (22 str.): kad jums nebūtų taikomas vien automatizuotu tvarkymu grindžiamas sprendimas, reikšmingai jus paveikiantis. Tokių sprendimų nepriimame (8 sk.). Vis tiek galite paprašyti, kad bet kurį automatinį rezultatą peržiūrėtų žmogus.
- **Atšaukti sutikimą** (7 str. 3 d.) bet kuriuo metu, vienu veiksmu. Atšaukimas nepaveikia iki jo vykdyto tvarkymo teisėtumo. Duomenys, kuriuos darbdavys jau teisėtai gavo, lieka pas tą darbdavį, jo paties atsakomybe.

## 11. Kaip įgyvendinti savo teises

**Savo paskyroje:** atidarykite **Valdymo skydas → Privatumas** (`/dashboard/privacy`; mobiliojoje programėlėje — Nustatymai → Privatumas).
- **Atsisiųsti duomenis:** JSON failas su jūsų duomenimis ir CSV failas su darbo žurnalu. Tai vyksta iš karto.
- **Prašyti ištrinti:** pateikite paskyros ištrynimo prašymą. Ištrynimas **nėra akimirksnio veiksmas**. Prašymą peržiūri žmogus ir praneša, kas ištrinta, kas saugoma ir kodėl.
- **Sutikimai:** kiekvieną galite įjungti arba išjungti.

**El. paštu:** rašykite **info@labourmarket.ai**. Taip kreipkitės dėl visos 15 straipsnyje numatytos informacijos, ištaisymo, apribojimo, nesutikimo ar bet ko, ko neapima paskyros puslapis. [OWNER DECISION: produkte pridėti ištaisymo, apribojimo ir nesutikimo prašymų tipus]

**Neturite paskyros?** Žr. „Pranešimą žmonėms, neturintiems paskyros“. [OWNER DECISION: kanalas]

**Tapatybės patikrinimas.** Paskyroje jūsų tapatybę patvirtina prisijungimas. Kreipiantis el. paštu, galime paprašyti rašyti iš paskyros el. pašto adreso arba pateikti duomenis, kuriuos žinotų tik tikrasis asmuo. Prašome tik to, ko reikia įsitikinti, kad tai jūs.

**Terminas.** Atsakome **per vieną mėnesį** nuo prašymo gavimo. Jei prašymai sudėtingi ar jų daug, terminą galime pratęsti dar iki dviejų mėnesių. Apie tai pranešame per pirmąjį mėnesį ir paaiškiname priežastis (12 str. 3 d.). Prašymai nagrinėjami nemokamai, išskyrus akivaizdžiai nepagrįstus ar neproporcingus (12 str. 5 d.).

## 12. Vaikai ir jaunimas

[OWNER DECISION: minimalus amžius paskyrai sukurti — 16 ar 18 metų]

- Platforma skirta darbui, pameistrystei ir mokymuisi, todėl ja gali naudotis besimokantieji ir studentai.
- [LAWYER: Lietuvoje informacinės visuomenės paslaugų sutikimo amžius pagal BDAR 8 str. nustatytas 14 metų — patikrinti. Jaunesniems asmenims sutikimu grindžiamiems tikslams reikia tėvų sutikimo. Taip pat patikrinti Lietuvos taisykles dėl nepilnamečių darbo.]
- [OWNER DECISION: ar jaunesni nei 18 metų asmenys gali įjungti matomumą darbdaviams ir ar mokykla gali pridėti nepilnamečius mokinius]
- Šiuo metu registruojantis amžius netikrinamas.

## 13. Saugumas

Ką iš tikrųjų darome:
- Prieigos taisyklės veikia pačioje duomenų bazėje. Be prieigą suteikiančios taisyklės niekas duomenų nemato. Šias taisykles tikrina automatiniai testai.
- Failai ir nuotraukos laikomi privačioje saugykloje. Juos galima atidaryti tik per trumpalaikes nuorodas.
- Sutikimų ir perdavimų įrašus galima tik papildyti. Niekas, įskaitant administratorius, negali jų pakeisti.
- Administratoriaus ekranai prieinami tik nedideliam administratorių skaičiui.
- Joks administratorius negali duoti sutikimo už jus.

Jokia sistema nėra visiškai saugi. Įvykus asmens duomenų saugumo pažeidimui, pranešame priežiūros institucijai, o kai to reikalauja teisė, ir jums (33–34 str.). Pastebėję problemą, rašykite info@labourmarket.ai.

## 14. Skundai

Galite pateikti skundą priežiūros institucijai, ypač ES valstybėje, kurioje gyvenate ar dirbate arba kurioje įvyko pažeidimas (77 str.).

Mūsų vadovaujanti priežiūros institucija yra **Valstybinė duomenų apsaugos inspekcija (VDAI)**:
- L. Sapiegos g. 17, LT-10312 Vilnius;
- ada@ada.lt;
- vdai.lrv.lt.

[LAWYER: patikrinti adresą ir kontaktus]

Norėtume turėti galimybę pirmiausia patys išspręsti problemą, todėl prašome parašyti ir mums. Tai neprivaloma.

## 15. Politikos pakeitimai

- Versija: **v2 (projektas), 2026-10-15**. Pakeičia ankstesnį paprasta kalba parašytą puslapį.
- Pakeitę šią politiką, čia atnaujiname datą ir versiją.
- Jei pakeitimas paliečia tai, kam davėte sutikimą, prieš jam įsigaliojant pranešame produkte. Sutikimų tekstai turi versijas: pasikeitus sutikimo tekstui, jūsų paklausiame iš naujo.
