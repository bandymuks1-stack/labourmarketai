# Naudojimosi sąlygos — LabourMarket.ai

> **Būsena:** DRAFT v2 — 2026-10-15 (projektas)
> **Reikalinga teisininko peržiūra / Requires lawyer review.** Projektas teisininko peržiūrai. Jis nėra galutinis, dar neturi teisinės galios ir nesertifikuotas.
>
> **Naudoti faktų šaltiniai:**
> - `docs/legal/corporate-identity-source-of-truth-v1.md` (sutarties šalis, IP savininkė, taisyklė „prekės ženklas nėra juridinis asmuo“); `entity-role-and-data-access-matrix-v1.md`
> - Dabartinės sąlygos ir prekyvietės taisyklės: `apps/web/messages/lt.json` → `legal.terms`, `legal.marketplaceRules`
> - 2026-10-15 auditas `03-rights-consent-legal-pages.md` §0 (3 gyvo režimo Stripe atsiskaitymo sesijos organizacijos planui, 0 prenumeratų), §5 (amžius netikrinamas), L7 (sąlygos per siauros); `02-processors-transfers-cookies-ai.md` §1 4 eil. (Stripe renka atsiskaitymo adresą, PVM kodą, vardą), §4 (automatinio atmetimo nėra)
> - `apps/web/lib/billing/plans.ts` (asmens ir nemokamas organizacijos planai — 0 €; vienas mokamas organizacijos planas; Worker Plus, agentūrų planai, kreditai ir medijos priedai atidėti ir neparduodami)
> - `docs/legal/retention-decision-package-v1.md` 2 sprendimas (atsiskaitymų įrašai)
>
> **Atviri sprendimai:**
> 1. [OWNER DECISION: ar mokami planai parduodami tik verslui (B2B)? Jei pirkti gali vartotojai ar kaip vartotojai veikiantys individualią veiklą vykdantys asmenys, taikomas 9.6 punktas — 14 dienų teisė atsisakyti sutarties pagal Direktyvos 2011/83/ES 9 str. ir Lietuvos Respublikos civilinį kodeksą [LAWYER: patikrinti straipsnį]]
> 2. [OWNER DECISION: atsiskaitymo laikotarpis, automatinis pratęsimas, atsisakymo įspėjimo terminas ir pinigų grąžinimas]
> 3. [OWNER DECISION: minimalus amžius (16 ar 18)]
> 4. [LAWYER: atsakomybės ribojimo formuluotė ir ribos pagal Lietuvos ir vartotojų teisę]
> 5. [LAWYER: vartotojų ginčų ne teismo tvarka institucija (Valstybinė vartotojų teisių apsaugos tarnyba, VVTAT) ir ar dar reikia nuorodos į ES EGS platformą — ES EGS platforma veiklą nutraukė 2025 m., patikrinti]
> 6. [OWNER DECISION: įspėjimo apie sąlygų pakeitimus terminas]
> 7. [OWNER DECISION: paskyros sustabdymo ir uždarymo taisyklės bei apskundimo tvarka]
> 8. [LAWYER: ar „LabourMarket.ai“ kur nors gali būti nurodytas kaip sutarties šalis — pagal tapatybės taisykles negali]

---

## 1. Su kuo sudarote sutartį

- Platformą valdo ir visas jos paslaugas parduoda **UAB „Nonstop Group“**:
  - įmonės kodas 302676973;
  - PVM mokėtojo kodas LT100010790613;
  - Mūšos g. 2C, Aukštikalnių k., Pasvalio apylinkių sen., LT-39103 Pasvalio r. sav., Lietuva;
  - el. paštas info@labourmarket.ai.

  Šiose sąlygose ji vadinama „mes“.
- Sutartį dėl bet kurios platformos paslaugos sudarote su UAB „Nonstop Group“. Ji išrašo sąskaitas ir gauna mokėjimus.
- „LabourMarket.ai“ yra platformos pavadinimas, o ne įmonė.
- **Labour Market AI Sp. z o.o.** (Varšuva, Lenkija; KRS 0001218752) priklauso programinė įranga, prekės ženklas ir susijusi intelektinė nuosavybė. Ji suteikia mums jų licenciją. Ji nėra jūsų sutarties šalis ir neturi prieigos prie jūsų asmens duomenų.

## 2. Kas yra platforma ir kas ji nėra

- Platforma padeda žmonėms ir organizacijoms rasti, registruoti, pristatyti ir koordinuoti darbą. Ji apima:
  - asmens profilį, gyvąjį CV ir darbo žurnalą;
  - organizacijų poreikius, projektus, komandas ir įrašus;
  - atitikimą, žinutes ir užsakymus;
  - viešus darbo skelbimus.
- Koordinavime dalyvauja žmogus operatorius.
- Naudojimasis platforma **savaime nesukuria darbo santykių**. Jis nežada darbo, darbuotojų ar kokio nors rezultato.
- Bet koks darbas, užduotis ar sutartis, dėl kurios žmonės susitaria per platformą, yra jų tarpusavio reikalas. Mes nesame jos šalis, nebent tai raštu nurodome.

## 3. Paskyros

- [OWNER DECISION: paskyrą galima sukurti nuo 16 / 18 metų; taisyklė besimokantiesiems ir studentams]
- Pateikite teisingą informaciją ir ją atnaujinkite.
- Saugokite prisijungimo duomenis. Nedelsdami praneškite, jei manote, kad jūsų paskyra pasinaudojo kas nors kitas.
- Viena asmeninė paskyra — vienam žmogui. Organizacijos paskyra naudojasi organizacijos įgalioti asmenys. Už tai, ką jie daro organizacijos vardu, atsako organizacija.

## 4. Jūsų turinys

- Teisės į tai, ką įvedate (profilį, gyvąjį CV, žurnalo įrašus, nuotraukas, dokumentus ir žinutes), lieka jums.
- Suteikiate mums neišimtinę licenciją šį turinį talpinti, saugoti, rodyti ir tvarkyti. Licencija apima tik tai, ko reikia platformai jums teikti ir turiniui rodyti žmonėms, kuriems tai leidžia platformos taisyklės ar jūsų sutikimai.
- Neįkelkite turinio, kuriuo neturite teisės dalytis, ar neteisėto turinio. Neįkelkite kitų žmonių asmens duomenų, jei tam neturite teisės. Neįkelkite asmens dokumentų, nebent jų prašo konkreti funkcija.
- Išsaugotų žurnalo įrašų vėliau perrašyti negalima, bet galite pridėti pataisymą. Taip darbo įrašas išlieka sąžiningas.

## 5. Matomumas ir sutikimai

- Jūsų profesinis profilis įmonėms ir agentūroms **nematomas**, kol neįjungiate matomumo.
- Jūsų kontaktai, CV ir dokumentai įmonei perduodami tik po atskiro jūsų patvirtinimo tai įmonei.
- Šie pasirinkimai niekada nesujungiami su šiomis sąlygomis ir niekada nėra privalomi paskyrai naudoti.
- Išsamiau — Privatumo politikoje.

## 6. Organizacijos

Jei platforma naudojatės įmonės, agentūros, mokyklos ar kitos organizacijos vardu, papildomai taikomos **Organizacijų duomenų sąlygos**. Dvi pareigos yra svarbiausios:
- Organizacija, registruojanti ar įkelianti duomenis apie žmones (darbuotojus, buvusius darbuotojus, kandidatus, besimokančiuosius), privalo turėti tam teisinį pagrindą ir tuos žmones informuoti.
- Ji atsako už savo įrašų tikslumą.

## 7. Naudojimosi taisyklės

Draudžiama:
- teikti melagingą informaciją, apsimesti kitu asmeniu ar nurodyti neturimą patvirtinimą;
- siūlyti ar parduoti reguliuojamas ar neteisėtas prekes ar paslaugas, skelbti diskriminuojančius ar klaidinančius darbo pasiūlymus;
- rinkti kitų naudotojų duomenis, automatiškai kopijuoti platformos turinį ar kreiptis į žmones tikslais, su kuriais jie nesutiko;
- bandyti apeiti prieigos taisykles ar saugumo priemones, perkrauti paslaugą;
- naudoti platformą nepageidaujamiems masiniams pranešimams siųsti.

Galime paslėpti šias taisykles pažeidžiantį turinį ar pasiūlymus. Vieši pasiūlymai rodomi tik po moderavimo. Apie netinkamą elgesį ar įtartiną veiklą galite pranešti; pranešimus peržiūri moderatoriai.

## 8. Patvirtinimas, DI ir atitikimas

- Būsena „patvirtinta“ atsiranda tik po tikro žmogaus patikrinimo, niekada automatiškai.
- Platforma niekada nepatvirtina teisės dirbti ar teisinio tinkamumo be reikiamų dokumentų.
- DI funkcijos teikia **pasiūlymus**. Niekas neišsaugoma kaip faktas, kol to nepatvirtinate jūs ar atsakingas asmuo.
- Atitikimas ir reitingavimas padeda organizacijoms pirmiausia pamatyti tinkamus žmones. **Jie niekada nieko automatiškai neatmeta.** Dėl kiekvieno kontakto, pasiūlymo ar atrankos sprendžia žmogus. Kaip veikia atitikimas, paaiškinta Privatumo politikos 8 skyriuje.
- Jei prijungiate savo DI asistentą (pvz., ChatGPT ar Claude), jis veikia tik jūsų teisių ribose. Veiksmams su pasekmėmis reikia atskiro patvirtinimo. Už savo tvarkymą atsako asistento teikėjas.

## 9. Mokamos paslaugos

1. **Kas nemokama.** Dalyvavimas asmens teisėmis yra nemokamas. Organizacijos gali naudotis nemokamu planu, kuriame vienu metu gali būti viena aktyvi laisva darbo vieta.
2. **Kas mokama.** Organizacijos gali įsigyti mokamą organizacijos planą. Kaina, atsiskaitymo laikotarpis ir mokesčiai rodomi kainų puslapyje ir atsiskaitymo metu, prieš jums sumokant. [OWNER DECISION: atsiskaitymo laikotarpis]
3. **Mokėjimas.** Mokėjimus apdoroja Stripe. Atsiskaitymo metu Stripe prašo atsiskaitymo kontakto, atsiskaitymo adreso ir PVM ar mokesčių mokėtojo kodo. Kortelės duomenys keliauja tiesiai į Stripe; mes jų negauname.
4. **Pratęsimas ir atsisakymas.** [OWNER DECISION: pratęsimas, kaip atsisakyti, atsisakymo pasekmės, pinigų grąžinimas]
5. **Sąskaitos faktūros.** Sąskaitas išrašo UAB „Nonstop Group“. Atsiskaitymų įrašus saugome tiek, kiek reikalauja apskaitos ir mokesčių teisė. [LAWYER: patvirtinti terminą]
6. **Vartotojai.** [OWNER DECISION: tik B2B?]
   - **Jei pirkti gali tik verslas:** mokami planai skirti verslui, veikiančiam savo profesinėje veikloje. Pirkdami patvirtinate, kad neveikiate kaip vartotojas.
   - **Jei pirkti gali vartotojai:** vartotojas gali atsisakyti sutarties per 14 dienų nenurodydamas priežasties (Direktyvos 2011/83/ES 9 str.). Jei paprašėte pradėti teikti paslaugą per tas 14 dienų ir paskui atsisakote, sumokate už tai, kas suteikta iki atsisakymo (14 str. 3 d.). [LAWYER: Civilinio kodekso straipsnis; atsisakymo forma; skaitmeninių paslaugų taisyklės]
7. Funkcijos, kreditai ir priedai, nesiūlomi atsiskaitymo metu, neparduodami.

## 10. Intelektinė nuosavybė

Platformos programinė įranga, dizainas ir prekės ženklas priklauso Labour Market AI Sp. z o.o.; jų licenciją ji suteikia mums. Platforma galite naudotis tik taip, kaip leidžia šios sąlygos. Atvirojo kodo komponentams taikomos jų pačių licencijos.

## 11. Paslaugos prieinamumas ir pakeitimai

Stengiamės, kad platforma veiktų ir būtų tiksli. Negalime pažadėti, kad ji visada bus pasiekiama, be klaidų ar be pertrūkių. Funkcijas galime keisti, pridėti ar pašalinti. Jei pakeitimas iš esmės sumažina mokamą paslaugą, apie tai pranešame iš anksto. [OWNER DECISION: įspėjimo terminas ir kompensacija]

## 12. Atsakomybė

[LAWYER: atsakomybės sąlyga — išimtys ir ribos, kurias leidžia Lietuvos teisė. Ji negali panaikinti atsakomybės už tyčią ar didelį neatsargumą, už žalą gyvybei ar sveikatai ir negali riboti privalomų vartotojų teisių.]

Neatsakome už:
- kitų naudotojų ar organizacijų sprendimus ir veiksmus;
- viešųjų užimtumo tarnybų pateiktų darbo skelbimų turinį;
- trečiųjų šalių paslaugas, kuriomis nusprendžiate naudotis, pvz., jūsų DI asistentą.

## 13. Sustabdymas ir pabaiga

- Naudotis platforma galite nustoti bet kada. Paskyros ir duomenų ištrynimo galite paprašyti skiltyje **Valdymo skydas → Privatumas** (žr. Privatumo politiką).
- Galime sustabdyti ar uždaryti paskyrą, kuri šiurkščiai ar pakartotinai pažeidžia šias sąlygas ar teisę. Kai įmanoma, iš anksto įspėjame ir paaiškiname priežastį. [OWNER DECISION: taisyklės ir apskundimo tvarka]
- Sutarčiai pasibaigus, kas vyksta su jūsų duomenimis, įskaitant tai, ką privalome saugoti pagal įstatymą, nustato Privatumo politika.

## 14. Sąlygų pakeitimai

Šias sąlygas galime atnaujinti. Parodome naują versiją ir jos datą. Apie esminius pakeitimus pranešame produkte prieš jiems įsigaliojant. [OWNER DECISION: įspėjimo terminas] Jei nesutinkate, galite nustoti naudotis platforma prieš pakeitimui įsigaliojant.

## 15. Taikoma teisė ir ginčai

- Šioms sąlygoms ir kiekvienai sutarčiai su klientu taikoma Lietuvos Respublikos teisė.
- Ginčus sprendžia kompetentingi Lietuvos teismai.
- Šios dvi taisyklės taikomos, išskyrus atvejus, kai privalomos vartotojų, darbo, duomenų apsaugos ar kitos teisės normos suteikia jums teises ar teismingumą, kurių negalima atimti. Jei esate vartotojas, visada išlaikote privalomas savo gyvenamosios šalies teises.
- Vartotojai ginčą ne teismo tvarka taip pat gali spręsti Valstybinėje vartotojų teisių apsaugos tarnyboje. [LAWYER: patikrinti]
- Prašome pirmiausia kreiptis į mus info@labourmarket.ai. Norime problemą išspręsti kartu su jumis.

## 16. Versija

**v2 (projektas), 2026-10-15.** Pakeičia ankstesnį trijų skyrių puslapį.
