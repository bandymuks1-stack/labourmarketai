# LabourMarket.ai — funkcijų katalogas (LT)

Parengta 2026-11-12 susitikimui. **Vienintelis šaltinis — [`docs/program/FUNCTION_REGISTER.md`](../../program/FUNCTION_REGISTER.md)** (funkcijų eilutės ir lietuviška „Function map data“ dalis). Šis failas yra registro rodinys, ne antras registras: būsenos neperrašytos ranka, o išvestos iš registro statusų.

## Kaip skaityti būsenas

| Būsena | Reikšmė | Iš registro statusų |
|---|---|---|
| **VEIKIA** | realiai pasiekiama ir patvirtinta produkcijoje (produkcijos eisena, savininko ar realaus naudotojo veiksmas, realus naudojimas) | `LIVE_VERIFIED` |
| **SUKURTA / TIKRINAMA** | kodas yra, bet produkcijoje nepatvirtinta, laukia sprendimo / paskyros / konfigūracijos arba rasta klaida | `PASS_CI_ONLY`, `NOT_VERIFIED`, `BLOCKED`, `FAIL` |
| **PLANUOJAMA** | numatyta, dar nesukurta | `NOT_IMPLEMENTED` |

**Iš viso: 287 funkcijos** (288 suplanuotos minus 1 papildomas testinis scenarijus 7.4; 2 dublikatai neskaičiuojami). **VEIKIA 197**, **SUKURTA / TIKRINAMA 68**, **PLANUOJAMA 22**.

Svarbios išlygos:

- „Veikia“ reiškia, kad funkcija patvirtinta produkcijoje registre nurodytu įrodymu ir data; ji neįrodo kiekvieno funkcijos atvejo. Dauguma produkcijos eisenų vyko automatizuota naršykle su sintetinėmis paskyromis.
- Registro naujausi įrašai — iki 2026-11-09. Vėlesni PR (pvz. #3211 įmonės perėmimo kvietimas, #3213 įmonės perėmimo įrankiai, #3209 partnerių registracijos projektas) šiame kataloge **nevertinami kaip veikiantys**, kol registras neatnaujintas.
- Kainos: planų puslapis veikia, tačiau kainų sumos šiame dokumente nenurodomos (registre jos privačios), o internetinis apmokėjimas dar neįjungtas (7.5, 7.15).
- AI pagalba (LLM) produkte išjungta, kol nepraeis saugumo, teisinis ir funkcinis patikrinimas (10.6–10.10); atranka veikia taisyklėmis (4.5, 4.13).

## Suvestinė pagal sritį

| Sritis | Iš viso | VEIKIA | SUKURTA / TIKRINAMA | PLANUOJAMA |
|---|---|---|---|---|
| 1. Paskyra, registracija ir organizacijos | 15 | 14 | 1 | 0 |
| 2. Darbuotojo profilis, darbo žurnalas ir gyvas CV | 37 | 29 | 7 | 1 |
| 3. Įmonės darbai ir projektai | 36 | 33 | 3 | 0 |
| 4. Poreikiai, darbo skelbimai ir atranka | 26 | 22 | 3 | 1 |
| 5. Pokalbiai ir pranešimai | 21 | 15 | 4 | 2 |
| 6. Prekyvietė | 22 | 15 | 1 | 6 |
| 7. Planai ir mokėjimai | 29 | 4 | 17 | 8 |
| 8. Kalbos ir rinkos | 18 | 12 | 6 | 0 |
| 9. Administravimas, privatumas ir saugumas | 24 | 18 | 6 | 0 |
| 10. Pagalbininkai ir dirbtinis intelektas | 26 | 11 | 12 | 3 |
| 11. Mokymasis | 10 | 7 | 2 | 1 |
| 12. Rinkos žinios | 6 | 6 | 0 | 0 |
| 13. Infrastruktūra ir veikimas | 17 | 11 | 6 | 0 |

## 1. Paskyra, registracija ir organizacijos

| ID | Funkcija | Ką naudotojas gali atlikti | Kam | Kur rasti | Būsena | Pastaba | Šaltinis (registro data) |
|---|---|---|---|---|---|---|---|
| 1.1 | Registracija ir prisijungimas | Susikuri paskyrą ir prisijungi el. paštu bei slaptažodžiu. | darbuotojas, ieškantis darbo, įmonė, agentūra | /auth/signup, /auth/login | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-28 |
| 1.2 | Prisijungimas per Google | Prisijungi viena paspaudimu su savo Google paskyra. | darbuotojas, ieškantis darbo, įmonė, agentūra | /auth/login | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-18 |
| 1.3 | Slaptažodžio atkūrimas | Pamiršęs slaptažodį gauni laišką ir nusistatai naują. | darbuotojas, ieškantis darbo, įmonė, agentūra | /auth/forgot-password | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-02 |
| 1.4 | Pirmieji žingsniai po registracijos | Po registracijos žingsnis po žingsnio nustatai, ko tau reikia. | darbuotojas, ieškantis darbo, įmonė, agentūra | /onboarding | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 1.5 | Keli vaidmenys vienoje paskyroje | Vienoje paskyroje gali būti ir darbuotojas, ir įmonės žmogus. | darbuotojas, įmonė, agentūra | /dashboard/account | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 1.6 | Įmonės paskyros sukūrimas | Sukuri savo įmonės ar organizacijos paskyrą. | įmonė, vadovas, agentūra | /dashboard/start/company | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-25 |
| 1.7 | Įmonės patikra | Įmonė patvirtinama, kad kiti ja galėtų pasitikėti. | įmonė, administratorius | /dashboard/admin/company-verification | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-25 |
| 1.8 | Viena organizacija, keli veiklos tipai | Viena organizacija gali veikti keliose srityse vienu metu. | įmonė | — | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · — |
| 1.9 | Nariai, kvietimai ir vaidmenys | Pakvieti žmones į įmonę ir nustatai, ką kiekvienas gali daryti. | įmonė, vadovas | /invite/[token] | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-02 |
| 1.10 | Darbo erdvės perjungimas | Perjungi tarp savo asmeninės ir įmonės erdvių. | darbuotojas, įmonė, vadovas, agentūra | /dashboard | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 1.11 | Įmonių duomenų atskyrimas | Apsaugo, kad viena įmonė nematytų kitos įmonės duomenų. | sistema | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 1.12 | Kvietimai ir rekomendavimas | Pakvieti pažįstamus prisijungti per savo nuorodą. | darbuotojas, įmonė | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-28 |
| 1.13 | Sistemos laiškai | Gauni svarbius laiškus apie savo paskyrą ir veiksmus. | darbuotojas, ieškantis darbo, įmonė | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-28 |
| 1.14 | Pranešimas apie peržiūrą | Personalas gauna žinią, kai ką nors reikia peržiūrėti. | administratorius | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-21 |
| 1.15 | Įmonės praeitis ir jos perėmimas | Perimi savo įmonės ankstesnius darbo įrašus. | įmonė, vadovas | /dashboard/company/history | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |

## 2. Darbuotojo profilis, darbo žurnalas ir gyvas CV

| ID | Funkcija | Ką naudotojas gali atlikti | Kam | Kur rasti | Būsena | Pastaba | Šaltinis (registro data) |
|---|---|---|---|---|---|---|---|
| 2.1 | Profesinis profilis | Susirašai, kas esi ir ką moki dirbti. | darbuotojas, ieškantis darbo, savarankiškas specialistas | /dashboard/profile | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 2.2 | Darbo kortelė | Nurodai, kada gali dirbti, kokio atlygio tikiesi ir kur. | darbuotojas, ieškantis darbo, savarankiškas specialistas | /dashboard/profile | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 2.3 | CV įkėlimas ir patvirtinimas | Įkeli CV ir patvirtini kiekvieną joje rastą faktą. | darbuotojas, ieškantis darbo | /cv | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-04 |
| 2.4 | Gyvasis CV | Turi nuolat atsinaujinantį CV, kurį gali atsisiųsti. | darbuotojas, ieškantis darbo, savarankiškas specialistas | /cv | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 2.5 | Darbo patirtis | Surašai, kur dirbai ir ką darei. | darbuotojas, ieškantis darbo | /dashboard/profile | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-04 |
| 2.6 | Praktika ir savanorystė | Įrašai praktiką ir savanorystę kaip patirtį. | ieškantis darbo, besimokantis, darbuotojas | /dashboard/profile | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 2.7 | Išsilavinimas | Pridedi savo mokslus ir kvalifikacijas. | darbuotojas, ieškantis darbo, besimokantis | /dashboard/profile | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-04 |
| 2.8 | Pasiekimai ir pažymėjimai | Pridedi pasiekimus ir savo nurodytus pažymėjimus. | darbuotojas, ieškantis darbo | /dashboard/profile | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 2.9 | Kalbos | Nurodai, kokias kalbas moki ir kaip gerai. | darbuotojas, ieškantis darbo | /dashboard/profile | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 2.10 | Nuorodos į kitus profilius | Prie profilio pridedi nuorodas į savo darbus kitur. | darbuotojas, savarankiškas specialistas | — | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · — |
| 2.11 | Reikalavimų sąrašas | Matai, ko dar trūksta, kad atitiktum darbo reikalavimus. | darbuotojas, ieškantis darbo | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-25 |
| 2.12 | Įgūdžių ir profesijų sąrašas | Pasirenki savo profesijas ir įgūdžius iš bendro sąrašo. | darbuotojas, ieškantis darbo, savarankiškas specialistas | /dashboard/profile | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 2.13 | Įgūdžių atpažinimas iš darbo žurnalo | Iš tavo darbo įrašų atpažįstama, ką moki. | darbuotojas, ieškantis darbo | /dashboard/journal | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 2.14 | Įrodymų lygiai | Matai, kiek tavo įgūdis pagrįstas tikru darbu. | darbuotojas, ieškantis darbo, įmonė | /cv | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 2.15 | Savo įgūdžių pareiškimas | Įrašai įgūdį savais žodžiais, net jei jo nėra sąraše. | darbuotojas, ieškantis darbo, savarankiškas specialistas | /dashboard/profile | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 2.16 | Bendrieji gebėjimai | Matai gebėjimus, kurie tinka daugelyje darbų. | darbuotojas, ieškantis darbo | /cv | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 2.17 | Europos profesijų klasifikatorius | Profesijos ir įgūdžiai susiejami su Europos sąrašu. | sistema | — | **SUKURTA / TIKRINAMA** | produkcijoje dar nepatikrinta | `NOT_VERIFIED` · — |
| 2.18 | Dokumentai ir jų galiojimas | Laikai dokumentus ir matai, kada baigsis jų galiojimas. | darbuotojas, ieškantis darbo, įmonė | /dashboard/documents | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-03 |
| 2.19 | Darbo žurnalas | Kasdien užsirašai, ką padarei darbe. | darbuotojas, savarankiškas specialistas | /dashboard/journal | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 2.20 | Vadovo patvirtinimas | Vadovas peržiūri ir patvirtina tavo darbo įrašus. | vadovas, darbuotojas | /dashboard/inbox | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-02 |
| 2.21 | Darbo patvirtinimo būsenos | Matai, ar įrašą jau patvirtino, ar dar laukia. | darbuotojas, vadovas | /dashboard/journal | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 2.22 | Nuotraukos ir darbo įrodymai | Prie įrašo pridedi nuotraukas, kad parodytum atliktą darbą. | darbuotojas, savarankiškas specialistas | /dashboard/gallery | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 2.23 | Valandos ir suvestinės | Matai savo valandas ir darbo laiko lapus. | darbuotojas, vadovas, įmonė | /dashboard/hours | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-03 |
| 2.24 | Patirties įrašai ir ginčai | Gali užginčyti įrašą, kuris tau atrodo neteisingas. | darbuotojas, vadovas | — | **SUKURTA / TIKRINAMA** | rasta klaida, taisoma | `FAIL` · 2026-11-01 |
| 2.25 | Darbas skaičiais | Matai savo darbo apimtis skaičiais. | darbuotojas, savarankiškas specialistas | /dashboard/work-in-numbers | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 2.26 | Viena nuosekli profesinė istorija | Visa tavo darbo istorija sudėta į vieną vietą. | darbuotojas, ieškantis darbo | /dashboard/profile | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 2.27 | Įmonės istorinių įrašų įkėlimas | Įmonė įkelia ankstesnius savo darbuotojų darbo įrašus. | įmonė, vadovas | — | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · — |
| 2.28 | Senų įrašų sujungimas | Seni dubliuoti darbo įrašai sujungiami į vieną. | sistema | — | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · — |
| 2.29 | Galimi, dar neįrodyti gebėjimai | Parodomi gebėjimai, kuriuos tikėtina turi. | darbuotojas, ieškantis darbo | /cv | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 2.30 | Žurnalas balsu | Darbo žurnalą pasakai balsu, o ne rašai. | darbuotojas, savarankiškas specialistas | /dashboard/journal/voice | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · — |
| 2.31 | Žurnalo įrašų apsauga nuo keitimo | Apsaugo, kad praeities įrašai nebūtų slapčia pakeisti. | darbuotojas, vadovas, sistema | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-24 |
| 2.32 | Kitos pusės atsiliepimas | Klientas ar partneris patvirtina arba įvertina atliktą darbą. | savarankiškas specialistas, klientas, vadovas | /dashboard/inbox/counterparty | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 2.33 | Darbų galerija | Rodai savo atliktų darbų nuotraukas. | savarankiškas specialistas, darbuotojas | /dashboard/gallery | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 2.34 | Žurnalo ir valandų atsisiuntimas | Parsisiunti žurnalą ir valandas faile. | darbuotojas, vadovas | /dashboard/hours | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 2.35 | Sutikimas būti randamam | Pats nusprendi, ar darbdaviai gali tave rasti. | darbuotojas, ieškantis darbo | /dashboard/privacy | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 2.36 | Žurnalo šablonai pagal profesiją | Gauni žurnalo formą, pritaikytą tavo profesijai. | darbuotojas, savarankiškas specialistas | — | **SUKURTA / TIKRINAMA** | produkcijoje dar nepatikrinta | `NOT_VERIFIED` · 2026-11-01 |
| 2.37 | Įrašo atsisakymas | Žmogus gali atsisakyti apie jį įkelto įrašo. | darbuotojas | — | **PLANUOJAMA** | dar nesukurta | `NOT_IMPLEMENTED` · 2026-11-01 |

## 3. Įmonės darbai ir projektai

| ID | Funkcija | Ką naudotojas gali atlikti | Kam | Kur rasti | Būsena | Pastaba | Šaltinis (registro data) |
|---|---|---|---|---|---|---|---|
| 3.1 | Įmonės pradžia | Matai savo įmonės dienos vaizdą vienoje vietoje. | įmonė, vadovas | /dashboard/company | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-23 |
| 3.2 | Projektai | Sukuri projektą ir seki jo eigą. | įmonė, vadovas | /dashboard/projects | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-03 |
| 3.3 | Objektai ir vietos | Projektui priskiri objektą ar darbo vietą. | įmonė, vadovas | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-03 |
| 3.4 | Projekto etapai | Projektą suskaidai į etapus. | įmonė, vadovas | /dashboard/projects/[id] | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-03 |
| 3.5 | Užduotys | Skiri užduotis ir seki, ar jos atliktos. | įmonė, vadovas, darbuotojas | /dashboard/tasks | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-03 |
| 3.6 | Darbuotojo skyrimas projektui | Paskiri žmogų dirbti konkrečiame projekte. | įmonė, vadovas | /dashboard/projects/[id] | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-03 |
| 3.7 | Brigados | Sudarai brigadą iš kelių žmonių. | įmonė, vadovas | /dashboard/company/people | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-22 |
| 3.8 | Brigados skyrimas projektui | Visą brigadą paskiri į projektą. | įmonė, vadovas | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 3.9 | Projekto pasirengimas | Matai, ar viskas paruošta projektui pradėti. | įmonė, vadovas | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-03 |
| 3.10 | Defektai ir taisymai | Užfiksuoji trūkumus ir pažymi, kada jie ištaisyti. | įmonė, vadovas | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-03 |
| 3.11 | Perdavimo dokumentas | Užbaigus darbą parengi perdavimo dokumentą klientui. | įmonė, vadovas | /dashboard/projects/[id]/operations | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-03 |
| 3.12 | Projekto išlaidos ir pajamos | Matai, kiek projektas kainuoja ir kiek uždirba. | įmonė, vadovas | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-03 |
| 3.13 | Projekto operacijų lenta | Matai visus projekto darbus vienoje lentoje ir parsisiunti. | įmonė, vadovas | /dashboard/projects/[id]/operations | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-03 |
| 3.14 | Darbų planavimas ir kalendorius | Planuoji žmonių darbus kalendoriuje. | įmonė, vadovas | /dashboard/company/planning | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-21 |
| 3.15 | Nebuvimai ir atostogos | Užsirašai ir patvirtini atostogas bei nebuvimus. | darbuotojas, vadovas, įmonė | /dashboard/absences | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-23 |
| 3.16 | Žmonių trūkumo laiko juosta | Matai, kada trūks žmonių. | įmonė, vadovas | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-23 |
| 3.17 | Žmonių rezervavimas | Rezervuoji žmogaus laiką ateičiai. | įmonė, vadovas | /dashboard/company/planning | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-03 |
| 3.18 | Užimtumas | Matai, kiek kiekvienas žmogus užimtas. | įmonė, vadovas | /dashboard/company/planning | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-26 |
| 3.19 | Planas ir faktas | Palygini suplanuotą darbą su atliktu. | įmonė, vadovas | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-26 |
| 3.20 | Pamainos ir grafikai | Sudarai pamainų grafiką. | įmonė, vadovas | /dashboard/company/planning | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-28 |
| 3.21 | Darbuotojų sąrašas | Matai visus savo įmonės žmones. | įmonė, vadovas | /dashboard/company/people | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 3.22 | Žmonių įkėlimas | Įkeli žmonių sąrašą iš failo. | įmonė, vadovas | /dashboard/company/people | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 3.23 | Priėmimas ir išleidimas iš darbo | Seki naujo darbuotojo įvedimą ir išėjimą. | įmonė, vadovas | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 3.24 | Patvirtinimai ir procesai | Pateiktus prašymus patvirtini ar atmeti. | įmonė, vadovas | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-03 |
| 3.25 | Vadovo sprendimai | Užrašai sprendimus ir jų peržiūras. | vadovas | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-28 |
| 3.26 | Nurodymai | Darbuotojams išsiunti nurodymus. | vadovas, įmonė, darbuotojas | /dashboard/instructions | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 3.27 | Įmonės istorija ir duomenų kokybė | Matai įmonės istoriją ir kur trūksta duomenų. | įmonė, vadovas | /dashboard/company/history | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 3.28 | Atsakymai vadovui pokalbyje | Vadovas pokalbyje paklausia apie savo įmonę ir gauna atsakymą. | vadovas, įmonė | pokalbis | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-24 |
| 3.29 | Įmonės dokumentų sąrašas | Saugai įmonės dokumentus vienoje vietoje. | įmonė, vadovas | /dashboard/documents | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-03 |
| 3.30 | Įmonės nustatymai ir pagalbos prašymas | Keiti įmonės nustatymus ir paprašai pagalbos. | įmonė, vadovas | /dashboard/company/settings | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 3.31 | Ataskaitos ir atsisiuntimas | Gauni ataskaitas ir jas parsisiunti. | įmonė, vadovas | /dashboard/reports | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 3.32 | Įrankiai ir turtas | Seki, kas turi kokį įmonės įrankį. | įmonė, vadovas | /dashboard/assets | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 3.33 | Valandų puslapis | Žiūri ir tvirtini žmonių valandas. | įmonė, vadovas, darbuotojas | /dashboard/hours | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 3.34 | Projekto eigos prognozė | Prognozuojama, kada projektas baigsis. | įmonė, vadovas | — | **SUKURTA / TIKRINAMA** | produkcijoje dar nepatikrinta | `NOT_VERIFIED` · 2026-11-01 |
| 3.35 | Persidengiančių įsipareigojimų įspėjimas | Gauni įspėjimą, kai žmogus paskirtas į du darbus vienu metu. | įmonė, vadovas | — | **SUKURTA / TIKRINAMA** | produkcijoje dar nepatikrinta | `NOT_VERIFIED` · 2026-11-01 |
| 3.36 | Įmonės gyvasis CV | Įmonė turi savo nuolat atsinaujinantį profilį. | įmonė, vadovas | — | **SUKURTA / TIKRINAMA** | produkcijoje dar nepatikrinta | `NOT_VERIFIED` · 2026-11-01 |

## 4. Poreikiai, darbo skelbimai ir atranka

| ID | Funkcija | Ką naudotojas gali atlikti | Kam | Kur rasti | Būsena | Pastaba | Šaltinis (registro data) |
|---|---|---|---|---|---|---|---|
| 4.1 | Poreikio įvedimas | Įmonė vienodu būdu užrašo, kokių žmonių jai reikia. | įmonė, vadovas, agentūra | /dashboard/company/needs | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 4.2 | Poreikis ir pasiūla atskirai | Skiriama, ko įmonė ieško ir ką žmogus siūlo. | sistema | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-25 |
| 4.3 | Galimybių lenta darbuotojui | Matai tau tinkamas galimybes ir pasakai, kad domina. | darbuotojas, ieškantis darbo | /dashboard/opportunities | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 4.4 | Viešoji darbo skelbimų lenta | Be registracijos ieškai darbo skelbimų. | ieškantis darbo, darbuotojas | /jobs | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-05 |
| 4.5 | Žmonių ir darbų suderinimas | Siūlomi tinkami darbai žmonėms ir žmonės darbams. | ieškantis darbo, įmonė | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 4.6 | Komandos paieška ir pasiūlymas | Įmonė randa visą komandą ir jai pateikia pasiūlymą. | įmonė, agentūra | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 4.7 | Derybos tarp įmonių | Dvi įmonės susiderina sąlygas. | įmonė, agentūra | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-22 |
| 4.8 | Anoniminis poreikio pateikimas | Be registracijos įmonė palieka savo poreikį. | įmonė | /company-need | **SUKURTA / TIKRINAMA** | automatiniai testai praeina, produkcijoje nepatvirtinta | `PASS_CI_ONLY` · 2026-10-30 |
| 4.9 | Išsaugotos paieškos ir pranešimai | Išsaugai paiešką ir gauni žinią apie naujus skelbimus. | ieškantis darbo, darbuotojas | /jobs | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-02 |
| 4.10 | Pasiūlos paieška įmonėms | Įmonė ieško žmonių ir komandų pagal poreikį. | įmonė, vadovas | /dashboard/talent | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 4.11 | Kandidatų paieška | Įmonė ieško tinkamų kandidatų. | įmonė, agentūra | /dashboard/candidates | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 4.12 | Trumpasis sąrašas ir pastabos | Įmonė susideda kandidatus į sąrašą ir rašo pastabas. | įmonė, agentūra | /dashboard/company/scouting | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 4.13 | Automatinis kandidatų parinkimas | Kandidatai parenkami automatiškai ir pateikiamas kvitas. | įmonė, agentūra | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 4.14 | Kandidatų juodraščiai | Įmonė paruošia kandidato pasiūlymą prieš išsiunčiant. | agentūra, įmonė | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 4.15 | Agentūros ir kliento ryšys | Agentūra susieja su klientu ir siūlo jam žmones. | agentūra, klientas | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-03 |
| 4.16 | Susisiekimas su susidomėjusiu žmogumi | Įmonė parašo žmogui, kuris pareiškė susidomėjimą. | įmonė, agentūra | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 4.18 | Duomenų atskleidimas darbdaviui | Leidi konkrečiam darbdaviui matyti papildomus savo duomenis. | darbuotojas, ieškantis darbo | — | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · — |
| 4.19 | Prašymai atskleisti kontaktus | Įmonė paprašo tavo kontaktų, o tu nusprendi. | darbuotojas, ieškantis darbo, įmonė | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 4.20 | Asmens apsauga paieškoje | Paieškoje žmogaus tapatybė nerodoma be jo leidimo. | sistema | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-24 |
| 4.21 | Asmens vardo slėpimas | Žmogaus vardas rodomas tik gavus leidimą. | sistema | /dashboard/people/[workerId] | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 4.22 | Trys nemokami profilių peržiūrėjimai | Įmonė kelis profilius mato nemokamai, daugiau už papildomą planą. | įmonė | — | **PLANUOJAMA** | dar nesukurta | `NOT_IMPLEMENTED` · — |
| 4.25 | Derinimo valdymo skydas | Administratorius tikrina derinimo rezultatus. | administratorius | /dashboard/admin/matching | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-25 |
| 4.26 | Viešas tinkamumo peržiūrėjimas | Be registracijos pamatai, ar tinki darbui. | ieškantis darbo, darbuotojas | /match-preview | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-25 |
| 4.28 | Pasiūlos pareiškimas | Įmonė ar žmogus pasako, ką gali pasiūlyti. | savarankiškas specialistas, įmonė | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 4.29 | Susidomėjimas virsta laisva vieta | Žmogaus susidomėjimas paverčiamas darbo vieta įmonėje. | įmonė, agentūra | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-23 |
| 4.30 | Kandidatas, sprendimas, poreikio uždarymas | Nuo kandidato iki priėmimo sprendimo ir poreikio uždarymo. | įmonė, agentūra, vadovas | — | **SUKURTA / TIKRINAMA** | produkcijoje dar nepatikrinta | `NOT_VERIFIED` · 2026-11-01 |

## 5. Pokalbiai ir pranešimai

| ID | Funkcija | Ką naudotojas gali atlikti | Kam | Kur rasti | Būsena | Pastaba | Šaltinis (registro data) |
|---|---|---|---|---|---|---|---|
| 5.1 | Pokalbio pradžia | Pradedi nuo pokalbio ir paprašai, ko reikia. | darbuotojas, ieškantis darbo, įmonė, vadovas | pokalbis | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-25 |
| 5.2 | Pokalbio istorija | Pokalbis išlieka ir gali grįžti prie jo vėliau. | darbuotojas, įmonė | pokalbis | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 5.3 | Vienkartiniai patvirtinimai | Svarbų veiksmą patvirtini vieną kartą. | darbuotojas, įmonė, vadovas | pokalbis | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-21 |
| 5.4 | Žinutės ir gijos | Susirašinėji su kitais žmonėmis ir įmonėmis. | darbuotojas, įmonė, agentūra | /dashboard/communication | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-03 |
| 5.5 | Žinučių vertimas | Žinutė išverčiama, o originalas lieka matomas. | darbuotojas, įmonė | /dashboard/communication | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · 2026-10-26 |
| 5.6 | Pranešimai programoje | Matai naujus pranešimus programoje. | darbuotojas, ieškantis darbo, įmonė | /dashboard/activity | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-25 |
| 5.7 | Pranešimai el. paštu | Gauni svarbias žinias el. paštu. | darbuotojas, ieškantis darbo, įmonė | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-02 |
| 5.8 | Pranešimai telefone | Gauni pranešimą į telefoną. | darbuotojas, įmonė | — | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · — |
| 5.9 | Savaitės apžvalga | Kas savaitę gauni trumpą apžvalgą el. paštu. | darbuotojas, ieškantis darbo, įmonė | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-09 |
| 5.10 | Veiklos centras | Vienoje vietoje matai, kam reikia tavo dėmesio. | darbuotojas, įmonė, vadovas | /dashboard/activity | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 5.11 | Darbuotojo kalendorius | Matai savo darbus kalendoriuje. | darbuotojas, savarankiškas specialistas | /dashboard/planning | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-23 |
| 5.12 | Prieinamumas | Nurodai, kada gali dirbti. | darbuotojas, savarankiškas specialistas, ieškantis darbo | — | **VEIKIA** | — | `LIVE_VERIFIED` · — |
| 5.13 | Užsakymas, sutikimas, darbas | Gauni užsakymą, jį priimi ir pradedi darbą. | darbuotojas, savarankiškas specialistas, įmonė | /dashboard/bookings | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-03 |
| 5.14 | Greitoji paieška ir balsas | Greitai randi puslapį ar veiksmą, galima balsu. | darbuotojas, įmonė | — | **VEIKIA** | — | `LIVE_VERIFIED` · — |
| 5.15 | Balsas kaip lygiavertis būdas | Viską gali padaryti ir balsu. | darbuotojas, įmonė | — | **SUKURTA / TIKRINAMA** | produkcijoje dar nepatikrinta | `NOT_VERIFIED` · — |
| 5.16 | Įspėjimai savininkui | Savininkas gauna žinią per Telegram. | administratorius | — | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · — |
| 5.17 | Pagalbos pokalbiai | Parašai pagalbos komandai. | darbuotojas, įmonė | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 5.18 | Paieška skyriuje | Ieškai žmonių, projektų ir dokumentų vienoje vietoje. | darbuotojas, įmonė, vadovas | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 5.19 | Gautų ataskaitų peržiūra | Matai gautas ataskaitas. | vadovas, įmonė | /dashboard/inbox/report | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 5.20 | Savos automatizacijos | Pats susikuri automatinius veiksmus. | įmonė, vadovas | — | **PLANUOJAMA** | dar nesukurta | `NOT_IMPLEMENTED` · 2026-11-01 |
| 5.21 | SMS ir WhatsApp kanalai | Žinutes gauni per SMS ar WhatsApp. | darbuotojas, įmonė | — | **PLANUOJAMA** | dar nesukurta | `NOT_IMPLEMENTED` · 2026-11-01 |

## 6. Prekyvietė

| ID | Funkcija | Ką naudotojas gali atlikti | Kam | Kur rasti | Būsena | Pastaba | Šaltinis (registro data) |
|---|---|---|---|---|---|---|---|
| 6.1 | Paslaugos ir užklausų ratas | Siūlai paslaugas ir gauni užklausas. | savarankiškas specialistas, klientas | /dashboard/services | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-03 |
| 6.2 | Skelbimai: prekės, nuoma, ieškau | Skelbi prekes, nuomą ar ko ieškai. | savarankiškas specialistas, klientas, įmonė | /dashboard/listings | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-03 |
| 6.3 | Bendra paieška | Ieškai paslaugų ir skelbimų vienoje vietoje. | klientas, įmonė | /dashboard/listings | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-03 |
| 6.4 | Pirkėjo erdvė | Kaip pirkėjas matai savo užklausas ir pasiūlymus. | klientas, įmonė | /dashboard/buyer | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-03 |
| 6.6 | Pasiūlymai ir sutartys | Paruoši pasiūlymą ir sutartį klientui. | savarankiškas specialistas, įmonė | /dashboard/commercial | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-03 |
| 6.7 | Pirkimai | Valdai pirkimus savo įmonėje. | įmonė, vadovas | /dashboard/finance | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-03 |
| 6.8 | Komandiruotės | Planuoji ir seki komandiruotes. | įmonė, vadovas, darbuotojas | /dashboard/finance | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-03 |
| 6.9 | Finansų įrašai | Matai įmonės finansų įrašus. | įmonė, vadovas | /dashboard/finance | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-03 |
| 6.10 | Projekto kainos skaičiuoklė | Be registracijos apskaičiuoji projekto kainą. | klientas, įmonė, savarankiškas specialistas | /calculators/project-cost | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-25 |
| 6.11 | Pasirengimas darbui užsienyje | Matai, ko reikia dirbti kitoje šalyje. | įmonė, darbuotojas | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-23 |
| 6.12 | Tarptautiniai sandoriai | Įmonės sudaro sandorius tarp šalių. | įmonė | — | **PLANUOJAMA** | dar nesukurta | `NOT_IMPLEMENTED` · — |
| 6.13 | Prekių užsakymai | Perki prekes per platformą. | klientas, įmonė | — | **PLANUOJAMA** | dar nesukurta | `NOT_IMPLEMENTED` · — |
| 6.14 | Logistika | Susitvarkai prekių pristatymą. | įmonė | — | **PLANUOJAMA** | dar nesukurta | `NOT_IMPLEMENTED` · — |
| 6.16 | Perdavimas partnerio organizacijai | Užklausa perduodama partnerio organizacijai. | įmonė | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-24 |
| 6.17 | Pardavimų eiga | Seki potencialių klientų eigą. | administratorius | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-25 |
| 6.18 | Laukiančiųjų sąrašas | Užsirašai gauti žinią, kai funkcija atsiras. | darbuotojas, įmonė | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 6.19 | Komandos užklausos | Gauni komandos užklausas. | įmonė, agentūra | /dashboard/service-requests | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 6.20 | Vertės kanalai | Parodomi keliai, kuriais žmogus gauna naudą iš platformos. | sistema | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-26 |
| 6.21 | Viešas verslo puslapis | Verslas turi viešą savo puslapį. | įmonė, savarankiškas specialistas, klientas | /business/[slug] | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · — |
| 6.22 | Būstas | Susirandi nakvynę darbui. | darbuotojas, įmonė | — | **PLANUOJAMA** | dar nesukurta | `NOT_IMPLEMENTED` · 2026-11-01 |
| 6.23 | Paslaugos įvertinimas ir ginčai | Įvertini paslaugą, atšauki užsakymą ar paduodi skundą. | klientas, savarankiškas specialistas | — | **PLANUOJAMA** | dar nesukurta | `NOT_IMPLEMENTED` · 2026-11-01 |
| 6.24 | Paslaugų srautas telefone | Naršai paslaugas braukdamas pirštu. | klientas | — | **PLANUOJAMA** | dar nesukurta | `NOT_IMPLEMENTED` · 2026-11-01 |

## 7. Planai ir mokėjimai

| ID | Funkcija | Ką naudotojas gali atlikti | Kam | Kur rasti | Būsena | Pastaba | Šaltinis (registro data) |
|---|---|---|---|---|---|---|---|
| 7.1 | Planai ir kainų puslapis | Matai, kokie yra planai. | įmonė, darbuotojas, agentūra | /pricing | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-25 |
| 7.2 | Nemokamas planas: vienas atviras poreikis | Nemokamai gali turėti vieną atvirą poreikį. | įmonė | — | **SUKURTA / TIKRINAMA** | automatiniai testai praeina, produkcijoje nepatvirtinta | `PASS_CI_ONLY` · 2026-10-23 |
| 7.3 | Planų teisių nustatymas | Žinoma, ką leidžia tavo planas. | sistema | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-23 |
| 7.5 | Mokėjimas už planą | Įmonė už planą sumoka kortele. | įmonė | — | **SUKURTA / TIKRINAMA** | produkcijoje dar nepatikrinta | `NOT_VERIFIED` · 2026-11-01 |
| 7.6 | Mokėjimų įrašų atkūrimas | Pataisomi nepavykę mokėjimų įrašai. | sistema | — | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · — |
| 7.7 | Rankinis bandomojo plano suteikimas | Administratorius suteikia bandomąjį planą. | administratorius | — | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · — |
| 7.8 | Kreditų sąskaita | Seki kreditų likutį. | įmonė | — | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · — |
| 7.9 | Kreditų papildymas ir planų pakopos | Papildai kreditus ir renkiesi planą. | įmonė, agentūra | — | **PLANUOJAMA** | dar nesukurta | `NOT_IMPLEMENTED` · — |
| 7.11 | Atidėti planai | Ateityje bus papildomi planai darbuotojams ir agentūroms. | darbuotojas, agentūra | — | **PLANUOJAMA** | dar nesukurta | `NOT_IMPLEMENTED` · — |
| 7.12 | Dirbtinio intelekto kaštų skaičiavimas | Skaičiuojama, kiek kainuoja dirbtinio intelekto pagalba. | administratorius | — | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · — |
| 7.13 | Užsakymų riba pagal planą | Plane nustatyta, kiek užsakymų gali turėti. | įmonė | — | **SUKURTA / TIKRINAMA** | produkcijoje dar nepatikrinta | `NOT_VERIFIED` · 2026-10-25 |
| 7.14 | Skelbimų vertimo teisė | Skelbimo vertimas priklauso nuo plano. | įmonė | — | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · 2026-10-26 |
| 7.15 | Metinė prenumerata | Įmonė užsisako mokamą planą. | įmonė | — | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · — |
| 7.16 | Mokėjimo pranešimo patikra | Tikrinama, ar mokėjimo žinia tikra. | sistema | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-23 |
| 7.17 | Dvigubo apmokestinimo apsauga | Tavo kortelė nenurašoma du kartus už tą patį. | įmonė | — | **VEIKIA** | — | `LIVE_VERIFIED` · — |
| 7.18 | Mokėjimas keičia teises | Sumokėjus atsiranda teisės, nutrūkus mokėjimui jos dingsta. | įmonė | — | **SUKURTA / TIKRINAMA** | produkcijoje dar nepatikrinta | `NOT_VERIFIED` · 2026-10-23 |
| 7.19 | Grąžinimai ir ginčai | Pinigų grąžinimas ar ginčo sprendimas. | įmonė | — | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · — |
| 7.20 | Sąskaitos platformoje | Sąskaitas matai pačioje platformoje. | įmonė | — | **PLANUOJAMA** | dar nesukurta | `NOT_IMPLEMENTED` · — |
| 7.21 | Atsiskaitymo portalas | Kiekvienas už mokėjimus atsakingas žmogus gali atidaryti portalą. | įmonė, vadovas | /dashboard/account | **SUKURTA / TIKRINAMA** | produkcijoje dar nepatikrinta | `NOT_VERIFIED` · 2026-10-23 |
| 7.22 | Mokamų funkcijų teisės ir ribos | Kiekviena mokama funkcija taikoma pagal plano ribas. | įmonė | — | **SUKURTA / TIKRINAMA** | produkcijoje dar nepatikrinta | `NOT_VERIFIED` · — |
| 7.23 | Kreditų pirkimas | Vienkartinis kreditų pirkimas. | įmonė | — | **PLANUOJAMA** | dar nesukurta | `NOT_IMPLEMENTED` · — |
| 7.24 | Kreditai po vieno mokėjimo | Už vieną mokėjimą kreditai suteikiami vieną kartą. | įmonė | — | **PLANUOJAMA** | dar nesukurta | `NOT_IMPLEMENTED` · — |
| 7.25 | Kreditų likutis ir istorija | Matai savo kreditų likutį ir istoriją. | įmonė | pokalbis | **SUKURTA / TIKRINAMA** | produkcijoje dar nepatikrinta | `NOT_VERIFIED` · 2026-10-25 |
| 7.26 | Kreditų išleidimas ir grąžinimas | Išleidžiami ir grąžinami kreditai. | įmonė | — | **PLANUOJAMA** | dar nesukurta | `NOT_IMPLEMENTED` · — |
| 7.27 | Nemokamas VIP patvirtintoms įmonėms | Patvirtinta įmonė gauna VIP nemokamai. | įmonė | — | **SUKURTA / TIKRINAMA** | rasta klaida, taisoma | `FAIL` · — |
| 7.28 | Pardavėjas ir sąlygos | Matai, kas parduoda ir kokiomis sąlygomis. | įmonė | /legal/terms | **SUKURTA / TIKRINAMA** | rasta klaida, taisoma | `FAIL` · — |
| 7.29 | PVM skaičiavimas | Mokėjimuose skaičiuojamas PVM. | įmonė | — | **SUKURTA / TIKRINAMA** | produkcijoje dar nepatikrinta | `NOT_VERIFIED` · — |
| 7.30 | Sąskaitos ir priėmimo aktai iš žurnalo | Iš darbo žurnalo parengiama sąskaita ir priėmimo aktas. | savarankiškas specialistas, įmonė | — | **PLANUOJAMA** | dar nesukurta | `NOT_IMPLEMENTED` · 2026-11-01 |
| 7.31 | Planai darbuotojams ir įmonėms | Planai abiem pusėms: nemokamas ir mokami. | darbuotojas, įmonė | — | **PLANUOJAMA** | dar nesukurta | `NOT_IMPLEMENTED` · 2026-11-01 |

## 8. Kalbos ir rinkos

| ID | Funkcija | Ką naudotojas gali atlikti | Kam | Kur rasti | Būsena | Pastaba | Šaltinis (registro data) |
|---|---|---|---|---|---|---|---|
| 8.1 | Svetainės kalbos | Naudoji platformą savo kalba. | darbuotojas, ieškantis darbo, įmonė | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-23 |
| 8.2 | Darbas suprantamas keliomis kalbomis | Darbo aprašai suprantami keliomis kalbomis. | darbuotojas, ieškantis darbo, įmonė | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-26 |
| 8.3 | Automatinis vertimas | Tekstas išverčiamas į tavo kalbą. | darbuotojas, ieškantis darbo, įmonė | — | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · 2026-10-26 |
| 8.4 | Šalių darbo rinkos puslapiai | Skaitai apie darbo rinką skirtingose šalyse. | ieškantis darbo, darbuotojas | /labour-market | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-25 |
| 8.5 | Devynios pirmosios rinkos | Platforma pritaikoma devynioms šalims. | sistema | — | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · 2026-10-28 |
| 8.6 | Šalių reikalavimų lentelė | Matai, ko reikia dirbti konkrečioje šalyje. | ieškantis darbo, darbuotojas | /work-abroad | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-25 |
| 8.7 | Viešas atsakymų puslapis | Randi atsakymus į dažniausius klausimus. | ieškantis darbo, darbuotojas, įmonė | /questions | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-25 |
| 8.8 | Paieškos sistemų paruošimas | Svetainė tinkamai matoma paieškos sistemose. | sistema | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-25 |
| 8.9 | Viešas įmonės profilis | Įmonė turi viešą savo profilį. | įmonė, klientas | /business/[slug] | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · 2026-10-26 |
| 8.10 | Pristatymo svetainė | Perskaitai apie platformą prieš registruojantis. | ieškantis darbo, darbuotojas, įmonė, agentūra | /about | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-25 |
| 8.11 | Svetainė telefone | Naudoji platformą telefone. | darbuotojas, ieškantis darbo, įmonė | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 8.12 | Įdiegimas telefone | Platformą įdedi į telefono pradžios ekraną. | darbuotojas, įmonė | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-25 |
| 8.13 | Programėlė telefonui | Atskira programėlė telefone. | darbuotojas, įmonė | — | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · 2026-10-30 |
| 8.14 | Nuorodos į programėlę | Nuoroda iš laiško atidaro programėlę. | darbuotojas, įmonė | — | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · — |
| 8.15 | Programėlių parduotuvės | Programėlė pasiekiama programėlių parduotuvėse. | darbuotojas, įmonė | — | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · 2026-10-30 |
| 8.16 | Pastabos apie vertimą | Praneši, kad vertimas neteisingas. | darbuotojas, ieškantis darbo, įmonė, administratorius | /dashboard/admin/language-feedback | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-26 |
| 8.17 | Programėlė Android telefonui | Programėlė Android telefonui. | darbuotojas, įmonė | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-02 |
| 8.18 | Programėlė iPhone | Programėlė iPhone telefonui. | darbuotojas, įmonė | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-02 |

## 9. Administravimas, privatumas ir saugumas

| ID | Funkcija | Ką naudotojas gali atlikti | Kam | Kur rasti | Būsena | Pastaba | Šaltinis (registro data) |
|---|---|---|---|---|---|---|---|
| 9.1 | Administratoriaus skydas | Administratorius valdo platformą. | administratorius | /dashboard/admin | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-28 |
| 9.2 | Bandymai, rodikliai, lyga | Administratorius seka bandymus ir rodiklius. | administratorius | /dashboard/admin/pilots | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-25 |
| 9.3 | Naudotojo peržiūra | Administratorius pažiūri vieno naudotojo būseną. | administratorius | /dashboard/admin/users/[id] | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-25 |
| 9.4 | Privatumo prašymai | Gali paprašyti savo duomenų ar jų ištrynimo. | darbuotojas, ieškantis darbo, įmonė | /dashboard/privacy | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-19 |
| 9.5 | Duomenų atsisiuntimas | Parsisiunti visus apie save laikomus duomenis. | darbuotojas, ieškantis darbo, įmonė | /dashboard/privacy | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 9.6 | Duomenų ištrynimas | Tavo duomenys ištrinami, kai to paprašai. | darbuotojas, ieškantis darbo, įmonė | /dashboard/privacy | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-19 |
| 9.7 | Darbuotojo duomenų skyrimas | Atskiriami žmogaus ir jo įmonės duomenys. | sistema | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-21 |
| 9.8 | Duomenų prieigos taisyklės | Kiekvienas mato tik savo duomenis. | sistema | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-23 |
| 9.9 | Veiksmų žurnalas | Svarbūs veiksmai užrašomi. | sistema, administratorius | — | **SUKURTA / TIKRINAMA** | automatiniai testai praeina, produkcijoje nepatvirtinta | `PASS_CI_ONLY` · 2026-10-30 |
| 9.10 | Užklausų ribojimas | Apsaugo nuo piktnaudžiavimo. | sistema | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-23 |
| 9.11 | Užklausų kilmės patikra | Apsaugo nuo suklastotų užklausų. | sistema | — | **VEIKIA** | — | `LIVE_VERIFIED` · — |
| 9.12 | Teisiniai puslapiai | Perskaitai sąlygas ir privatumo politiką. | darbuotojas, ieškantis darbo, įmonė | /legal/privacy | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 9.13 | Asmens vietos apsauga | Tavo tikslios vietos kiti nemato. | darbuotojas, ieškantis darbo | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 9.14 | Naudojimo statistika | Administratorius mato, kaip naudojama platforma. | administratorius | /dashboard/admin/telemetry | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-25 |
| 9.15 | Paieškos būdai | Skirtingos paieškos randa žmones, darbus ir paslaugas. | sistema | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 9.16 | Rekomendavimo sąsaja | Išorinė sistema siunčia rekomendacijas. | sistema | — | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · — |
| 9.17 | Vidinis pasiūlos srautas | Vidinė sistema gauna pasiūlos duomenis. | sistema | — | **SUKURTA / TIKRINAMA** | automatiniai testai praeina, produkcijoje nepatvirtinta | `PASS_CI_ONLY` · 2026-10-23 |
| 9.18 | Viešos duomenų sąsajos | Kitos svetainės gali gauti viešus duomenis. | sistema | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 9.19 | Importo bandymų erdvė | Administratorius išbando importą. | administratorius | /dashboard/admin/import-sandbox | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · 2026-10-25 |
| 9.20 | Stebėjimų tikrintuvas | Administratorius tikrina stebėjimus. | administratorius | /dashboard/admin/intelligence-observations | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · 2026-10-25 |
| 9.22 | Aplinkos nustatymų patikra | Neleidžia paleisti sistemos su blogais nustatymais. | sistema | — | **VEIKIA** | — | `LIVE_VERIFIED` · — |
| 9.23 | Duomenų bazės funkcijų kontrolė | Saugo, kad duomenų funkcijos nebūtų per laisvos. | sistema | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-23 |
| 9.24 | Saugumo incidentų tvarkymas | Reaguojama į saugumo incidentus. | sistema | — | **VEIKIA** | — | `LIVE_VERIFIED` · — |
| 9.25 | Saugumo perspėjimai | Stebimi saugumo perspėjimai apie kodą. | sistema | — | **SUKURTA / TIKRINAMA** | rasta klaida, taisoma | `FAIL` · 2026-11-01 |

## 10. Pagalbininkai ir dirbtinis intelektas

| ID | Funkcija | Ką naudotojas gali atlikti | Kam | Kur rasti | Būsena | Pastaba | Šaltinis (registro data) |
|---|---|---|---|---|---|---|---|
| 10.1 | Atvira sąsaja dirbtinio intelekto programoms | Programa gali veikti tavo vardu su tavo leidimu. | darbuotojas, įmonė | MCP | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 10.2 | Dirbtinio intelekto scenarijai | Paruošti scenarijai dirbtinio intelekto programoms. | darbuotojas, įmonė | MCP | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-23 |
| 10.3 | Prisijungimas dirbtinio intelekto programoms | Programa saugiai gauna tavo leidimą. | darbuotojas, įmonė | MCP | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-02 |
| 10.4 | Dirbtinio intelekto leidimų sritys | Nustatai, ką programa gali daryti. | darbuotojas, įmonė | MCP | **PLANUOJAMA** | dar nesukurta | `NOT_IMPLEMENTED` · 2026-11-02 |
| 10.5 | Sąrašai dirbtinio intelekto parduotuvėse | Platforma rodoma dirbtinio intelekto programų sąrašuose. | sistema | — | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · — |
| 10.6 | Dirbtinio intelekto pagalba | Platforma naudoja dirbtinį intelektą pagalbai. | darbuotojas, įmonė | — | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · 2026-10-26 |
| 10.7 | Pokalbio ketinimų atpažinimas | Pokalbyje atpažįstama, ko nori. | darbuotojas, įmonė | pokalbis | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · — |
| 10.8 | CV sutvarkymas dirbtiniu intelektu | Iš CV dirbtinis intelektas išrenka faktus. | darbuotojas, ieškantis darbo | /cv | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · — |
| 10.9 | Žurnalo siūlymai | Žurnalo įrašui siūlomi patobulinimai. | darbuotojas | /dashboard/journal | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · — |
| 10.10 | Paaiškinimai | Gauni paaiškinimą, kodėl taip pasiūlyta. | darbuotojas, įmonė | — | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · — |
| 10.11 | Pagalbininkai be iškvietimo | Yra pagalbininkai, kurių dar niekas nekviečia. | sistema | — | **VEIKIA** | — | `LIVE_VERIFIED` · — |
| 10.13 | Pagalbininko puslapis | Pasikalbi su pagalbininku. | darbuotojas, įmonė | /dashboard/assist | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-25 |
| 10.14 | Pagalbininkų valdymas | Administratorius valdo pagalbininkus. | administratorius | /dashboard/admin/agent-os | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-25 |
| 10.15 | Pagalbininkų vykdymas | Pagalbininkai atlieka darbus patys. | administratorius | — | **PLANUOJAMA** | dar nesukurta | `NOT_IMPLEMENTED` · — |
| 10.16 | Pagalbininkai kaip dalyviai | Pagalbininkas yra pokalbio dalyvis. | darbuotojas, įmonė | — | **PLANUOJAMA** | dar nesukurta | `NOT_IMPLEMENTED` · — |
| 10.17 | Išorinių veiksmų kvitai | Gauni kvitą apie išorinį veiksmą. | darbuotojas, įmonė | MCP | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-23 |
| 10.18 | Skelbimai iš Švedijos | Platforma gauna skelbimus iš Švedijos. | ieškantis darbo, darbuotojas | foninis | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-23 |
| 10.19 | Skelbimai iš Norvegijos | Platforma gauna skelbimus iš Norvegijos. | ieškantis darbo, darbuotojas | foninis | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-23 |
| 10.20 | Senų skelbimų šalinimas | Pasenę skelbimai pašalinami. | ieškantis darbo, darbuotojas | foninis | **SUKURTA / TIKRINAMA** | rasta klaida, taisoma | `FAIL` · 2026-10-23 |
| 10.21 | Statistikos importas | Importuojama oficiali statistika. | sistema | — | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · — |
| 10.22 | Partnerio organizacijos sąsaja | Duomenys keičiasi su partnerio organizacija. | sistema | — | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · — |
| 10.23 | Agentūros pasiūlos srautas | Agentūros pasiūla patenka į platformą. | agentūra | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-24 |
| 10.24 | Savo serverio vertimas | Vertimas veikia mūsų serveryje. | sistema | — | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · — |
| 10.25 | Debesų dirbtinis intelektas | Papildomas dirbtinio intelekto tiekėjas. | sistema | — | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · — |
| 10.26 | Programų konkursas | Dalyvavimas dirbtinio intelekto programų konkurse. | sistema | — | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · — |
| 10.27 | Žemėlapiai | Matai vietas žemėlapyje. | darbuotojas, ieškantis darbo, įmonė | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |

## 11. Mokymasis

| ID | Funkcija | Ką naudotojas gali atlikti | Kam | Kur rasti | Būsena | Pastaba | Šaltinis (registro data) |
|---|---|---|---|---|---|---|---|
| 11.1 | Mokymo įstaiga ir besimokantysis | Mokymo įstaiga susieja su savo besimokančiais. | mokymo įstaiga, besimokantis | /dashboard/company/education | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-21 |
| 11.2 | Programos ir srautai | Mokymo įstaiga kuria programas ir grupes. | mokymo įstaiga | /dashboard/company/education | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-03 |
| 11.3 | Mokymosi kompasas | Matai, ką mokytis toliau. | besimokantis, darbuotojas, ieškantis darbo | /dashboard/learning | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-25 |
| 11.4 | Praktikos vietos | Įmonė pasiūlo vietų praktikai. | įmonė, mokymo įstaiga, besimokantis | /dashboard/company/education | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-25 |
| 11.5 | Besimokančiųjų rezultatai | Matai, kaip sekasi besimokantiems. | mokymo įstaiga, besimokantis | /dashboard/learning | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-25 |
| 11.6 | Mokymo įstaigos ataskaitos | Mokymo įstaiga gauna ataskaitas. | mokymo įstaiga | /dashboard/reports | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-25 |
| 11.7 | Praktika virsta gebėjimu | Atlikta praktika parodo įgytą gebėjimą. | besimokantis, mokymo įstaiga | /dashboard/learning | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-03 |
| 11.8 | Mokymų ir pažymėjimų sąrašas | Laikai mokymus ir pažymėjimus vienoje vietoje. | besimokantis, darbuotojas, mokymo įstaiga | /dashboard/learning | **SUKURTA / TIKRINAMA** | rasta klaida, taisoma | `FAIL` · 2026-10-28 |
| 11.9 | Mokymosi peržiūra žmogaus akimis | Žmogus peržiūri mokymosi rekomendacijas. | besimokantis, mokymo įstaiga | — | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · — |
| 11.10 | Ankstesnio mokymosi pripažinimas | Pripažįstamas anksčiau įgytas mokymasis. | besimokantis, darbuotojas | — | **PLANUOJAMA** | dar nesukurta | `NOT_IMPLEMENTED` · — |

## 12. Rinkos žinios

| ID | Funkcija | Ką naudotojas gali atlikti | Kam | Kur rasti | Būsena | Pastaba | Šaltinis (registro data) |
|---|---|---|---|---|---|---|---|
| 12.1 | Rinkos žemėlapis | Matai, kur yra darbo ir žmonių. | darbuotojas, ieškantis darbo, įmonė | /dashboard/market-map | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-23 |
| 12.2 | Darbo rinkos žinios | Skaitai apie darbo rinką. | darbuotojas, ieškantis darbo, įmonė | /dashboard/intelligence | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-23 |
| 12.3 | Žinių skydas | Žinias matai vienoje vietoje. | darbuotojas, įmonė, vadovas | /dashboard/intelligence | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-01 |
| 12.4 | Poreikio atpažinimas | Atpažįstamas rinkos poreikis. | administratorius, įmonė | /dashboard/market/recognize | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-23 |
| 12.5 | Viešieji rinkos faktai | Matai viešus rinkos faktus. | ieškantis darbo, darbuotojas, įmonė | /labour-market | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-23 |
| 12.6 | Administratoriaus rinkos puslapis | Administratorius mato rinkos vaizdą. | administratorius | /dashboard/admin/market | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-25 |

## 13. Infrastruktūra ir veikimas

| ID | Funkcija | Ką naudotojas gali atlikti | Kam | Kur rasti | Būsena | Pastaba | Šaltinis (registro data) |
|---|---|---|---|---|---|---|---|
| 13.1 | Svetainės talpinimas ir atnaujinimas | Svetainė pasiekiama ir atnaujinama be pertraukų. | sistema | — | **SUKURTA / TIKRINAMA** | rasta klaida, taisoma | `FAIL` · 2026-11-01 |
| 13.2 | Veikimo stebėjimas | Pastebima, kai svetainė neatsako. | sistema | — | **VEIKIA** | — | `LIVE_VERIFIED` · — |
| 13.3 | Paruoštas patikrinimo paketas | Automatiškai išbandomi pagrindiniai naudotojo žingsniai. | sistema | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-22 |
| 13.4 | Duomenų bazės talpa | Pasirūpinama, kad duomenys tilptų. | sistema | — | **SUKURTA / TIKRINAMA** | automatiniai testai praeina, produkcijoje nepatvirtinta | `PASS_CI_ONLY` · 2026-10-25 |
| 13.5 | Atsarginės kopijos | Tavo duomenys turi atsarginę kopiją. | sistema | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-11-05 |
| 13.6 | Reguliarūs foniniai darbai | Reguliariai atliekami foniniai darbai. | sistema | foninis | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-23 |
| 13.7 | Duomenų bazės pakeitimų patikra | Prieš keičiant duomenų bazę tikrinama, ar saugu. | sistema | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-23 |
| 13.8 | Pakeitimų žurnalo suderinimas | Pakeitimų žurnalas atitinka tikrą būseną. | sistema | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-23 |
| 13.9 | Ryšys su kodo saugykla | Duomenų bazė susieta su kodo saugykla. | sistema | — | **SUKURTA / TIKRINAMA** | sukurta, laukia savininko sprendimo, paskyros ar konfigūracijos | `BLOCKED` · — |
| 13.10 | Kokybės vartai | Prieš paskelbiant keitimą, jis tikrinamas. | sistema | — | **VEIKIA** | — | `LIVE_VERIFIED` · 2026-10-25 |
| 13.11 | Automatinė naudotojo kelio patikra | Automatiškai išbandomi pagrindiniai žingsniai. | sistema | — | **VEIKIA** | — | `LIVE_VERIFIED` · — |
| 13.12 | Produkto taisyklių patikra | Automatiškai tikrinama, ar laikomasi produkto taisyklių. | sistema | — | **VEIKIA** | — | `LIVE_VERIFIED` · — |
| 13.13 | Funkcijų prieinamumo sąrašas | Aišku, kurios funkcijos jau paruoštos. | administratorius, sistema | — | **SUKURTA / TIKRINAMA** | produkcijoje dar nepatikrinta | `NOT_VERIFIED` · 2026-11-01 |
| 13.14 | Išimčių valdymas | Savininkas leidžia išimtis kokybės vartams. | administratorius | — | **VEIKIA** | — | `LIVE_VERIFIED` · — |
| 13.15 | Senų naršyklių palaikymas | Svetainė atsidaro ir senesnėje naršyklėje. | darbuotojas, ieškantis darbo, įmonė | — | **VEIKIA** | — | `LIVE_VERIFIED` · — |
| 13.16 | Naršyklės klaidų pranešimai | Sužinoma, kai tavo naršyklėje įvyko klaida. | sistema | — | **SUKURTA / TIKRINAMA** | produkcijoje dar nepatikrinta | `NOT_VERIFIED` · — |
| 13.17 | Aplinkos suderinimas po perkėlimo | Po serverio keitimo viskas sulyginama. | sistema | — | **SUKURTA / TIKRINAMA** | rasta klaida, taisoma | `FAIL` · 2026-10-27 |

## Būsenos, kurių nepavyko patvirtinti

- Produkcijos svetainė iš šios rengimo aplinkos nebuvo pasiekiama (tinklo politika), todėl būsenos **nepertikrintos gyvai** 2026-11-12 — jos paimtos iš registro.
- Funkcijos su statusu `NOT_VERIFIED` ar `PASS_CI_ONLY` (žr. lenteles) — veikimas produkcijoje nepatvirtintas.
- Vėlesni nei 2026-11-09 pakeitimai — nevertinti.
