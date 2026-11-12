# LabourMarket.ai — P0 pataisymų ir užbaigimo planas

**Data:** 2026-11-12 · Remiasi: `LabourMarket_AI_Produkto_Auditas.md` (tos pačios dienos produkcijos patikra ir eisenos)

**Pagrindinė išvada:** platformos branduolys veikia. Komercinį paleidimą stabdo ne programavimas, o **sprendimų eilė**. Daugumai P0 darbų pirmiausia reikia **savininko veiksmo** (paskyra, kainodara, teisinis patvirtinimas, vertimų šaltinis); kodas jau parašytas arba guli juodraščiuose.

Trukmės yra **įvertinimai**: darbo dienos nuo savininko sprendimo iki įrodymo produkcijoje, kai nėra kitų trukdžių. Tai ne pažadai.

## 1. Svarbiausi neužbaigti darbai

| # | Problema | Priežastis | Kas blokuoja | Reikalingas veiksmas | Prioritetas | Įvertinta trukmė |
|---|---|---|---|---|---|---|
| 1 | **Negalima sumokėti internetu.** Organizacijos planas (99 €/mėn.) įsigyjamas tik rankiniu būdu | Mokamų paslaugų sąlygos (atnaujinimas, atšaukimas, grąžinimas, atsisakymas) nepatvirtintos; PVM / Stripe Tax kelias neįjungtas | Savininkas ir teisininkas: #2842 (sąlygos), #2685 (PVM), #2441 (antrasis įjungimo veiksmas), #3047 (pilotinio apmokėjimo apsauga) | 1) teisininkas patvirtina sąlygas; 2) savininkas patvirtina PVM sprendimą ir sujungia RED; 3) TEST eisena, tada vienas LIVE apmokėjimas | **P0** | 3–5 d. d. po teisinio patvirtinimo |
| 2 | **Švedų, norvegų, danų, estų, latvių ir suomių kalbos neaktyvios** (nukreipiama į EN) | Trūksta ~9 400 vertimų vienai kalbai, dalis esamų — EN vietos rezervai | Savininkas: vertimo šaltinis ir biudžetas (galioja „jokio mokamo AI“ politika) | Pasirinkti: profesionalūs vertėjai, savanoriai gimtakalbiai ar leidimas mašininiam vertimui su žmogaus peržiūra. Pradėti nuo **SV**, tada NO ir DA | **P0** (SV) | SV: 5–10 d. d. (vertimas + peržiūra + patikra); kitos — po 5–10 d. d. lygiagrečiai |
| 3 | **Programėlių nėra Google Play ir App Store** | Nėra parduotuvių paskyrų | Savininkas: Google Play Console (vienkartinis mokestis) ir Apple Developer Program (metinis mokestis); ARCH-6 | Sukurti paskyras → #3216 (TestFlight / Play vidinis testavimas) → #3217 (leidimo darbų eiga) → parduotuvių aprašai | **P0** | 2–3 d. d. iki vidinio testavimo; viešas leidimas — po parduotuvių peržiūrų (kelios dienos – 2 savaitės) |
| 4 | **B2B grandinė „užklausa → pasiūlymas → sutartis“ nevientisa** | Priimta paslaugos užklausa nesusiejama su pasiūlymu ir sutartimi | Savininkas: RED-1 #2946 (nuo 2026-11-02); įmonių paieška #3214; viešas įmonės puslapis 6.21 | Peržiūrėti ir pritaikyti #2946, tada #3214; produkcijos eisena J-13 iki sutarties | **P0** | 3–4 d. d. |
| 5 | **Vieša /jobs paieška laisvu tekstu lėta ir randa ne viską** (SR-1/SR-10) | Ieškoma tik pagal profesijos žymą; šaltas užklausos planas lėtas | Kodas + RED duomenų bazės indeksas (#3083 sujungtas; ankstesni bandymai atšaukti dėl lėtumo) | Plano talpyklos įrodymas (≥10 užklausų vienam terminui), tada indeksas; šalies filtras #3173 | **P1** | 3–5 d. d. |
| 6 | **Nemokamo plano riba (1 aktyvi pozicija) produkcijoje nepatikrinta** | Pilotinės QA organizacijos riba panaikinta | Koordinatorius | Sukurti sintetinę nemokamą organizaciją ir paleisti eiseną | **P1** | 1 d. d. |
| 7 | **Pranešimai apie naujas žinutes ir B2B pasiūlymus nepilni** | Naujos žinutės el. laiškas ne pagal nutylėjimą; B2B pasiūlymo kita pusė nepranešama | Juodraščiai #3226, #3227 (ir #3242) | Peržiūrėti, sujungti, paleisti notifications eisenas | **P1** | 1–2 d. d. |
| 8 | **AI pagalba išjungta** (atitiktis, vertimas, CV struktūravimas, žurnalo pasiūlymai) | Saugumas, teisė, kaina | Savininkas + teisininkas: AI tvarkytojai (#2752), mėnesinis limitas (#3166), lietuviškos patikros (#3167) | Patvirtinti tvarkytojus ir biudžetą; įjungti po vieną funkciją su eisena | **P2** | 5–10 d. d. |
| 9 | **Push pranešimai telefone išjungti** | Nėra VAPID raktų ir pristatymo testo | Savininkas: raktai | Raktai → flag → pristatymo eisena | P2 | 1–2 d. d. |
| 10 | **VPS automatinis diegimas — FAIL** (13.1) | Tinklo kelias tarp CI ir VPS | Infrastruktūra (privatus įrašas) | Užbaigti #2911 sprendimą | P1 (operacinė rizika) | 1–3 d. d. |
| 11 | **Saugumo ir priklausomybių perspėjimai — FAIL** (9.25) | Neperžiūrėti perspėjimai | Infrastruktūra | Triažas ir pataisymai | P1 | 2–3 d. d. |
| 12 | **106 atidaryti PR** | Juodraščiai kaupiasi greičiau nei peržiūrimi; dalis RED laukia savininko 3–4 savaites | Savininko peržiūros pralaidumas | Savaitinė RED peržiūros sesija; uždaryti pasenusius juodraščius | **P0** (procesas) | 1 sesija per savaitę |
| 13 | Statinių failų adresai su `%28` / `%29` grąžina 404 | Serveris nekoduoja skliaustų | Kodas / VPS | Normalizuoti adresus serveryje (nginx arba Next) | P2 | 0,5 d. d. |

## 2. Rekomenduojama tvarka (iki pirmojo mokančio kliento)

1. **Savininko sprendimų sesija (1 diena):** mokėjimų sąlygos ir PVM (#2842, #2685, #2441, #3047), parduotuvių paskyros, švedų vertimo šaltinis, RED-1 #2946.
2. **1 savaitė:** B2B grandinė (#2946 → #3214); pranešimai (#3226, #3227); nemokamo plano ribos eisena; /jobs paieška.
3. **2 savaitė:** švedų kalba (vertimas → peržiūra → `sv` įjungimas → eisena); programėlės vidiniame testavime.
4. **3 savaitė:** pirmas LIVE apmokėjimas, programėlių viešas leidimas, norvegų ir danų kalbos.
5. **Toliau:** AI funkcijos — po vieną, kiekvieną su teisiniu patvirtinimu ir eisena.

## 3. Ko šis planas nedaro

- Nekeičia produkcijos funkcijų ar kainodaros (reikia atskiro patvirtinimo).
- Nepažymi jokios funkcijos „veikiančia“ be įrodymo produkcijoje.
- Nesujungia RED juodraščių — tai savininko sprendimas.
