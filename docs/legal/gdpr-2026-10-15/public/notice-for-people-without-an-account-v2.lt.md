# Pranešimas žmonėms, neturintiems paskyros — LabourMarket.ai

*Informacija pagal BDAR 14 straipsnį (duomenys gauti ne iš jūsų)*

> **Būsena:** DRAFT v2 — 2026-10-15 (projektas)
> **Reikalinga teisininko peržiūra / Requires lawyer review.** Projektas teisininko peržiūrai. Jis nėra galutinis, dar neturi teisinės galios ir nesertifikuotas.
>
> **Naudoti faktų šaltiniai:**
> - 2026-10-15 auditas `01-personal-data-inventory-and-erasure-classes.md` §1c, §3.3 (43 žmonės organizacijos sąraše, 41 nesusietas su paskyra; 2 944 įrodymų įrašai; tarpiniai importo įrašai su `person_label` ir `activity_text`; `source_fact` gali turėti asmenų vardus ir adresus; paskyros ryšys — SET NULL; be paskyros teisių įgyvendinimo kelio nėra)
> - `03-rights-consent-legal-pages.md` §0, §3 (visi 43 vienoje organizacijoje; įrašus gali skaityti importavusios organizacijos ir šalių organizacijų vadovai; 14 str. pranešimo nėra; perimti galima tik per vadovo atsiųstą kvietimą; ginčyti — tik susiejus; įrašus galima tik papildyti; SE skelbimai: 41 353 aprašymai su el. pašto adresu, 22 500 su kontaktinio asmens formuluote; NAV: 3 809 su telefono numerio tipo eilutėmis; skelbimo tekstas prisijungusiems naudotojams rodomas pažodžiui; pašalinti skelbimai saugomi)
> - `02-processors-transfers-cookies-ai.md` §1 15 eil., D13 (NAV `contactList` niekada nesaugomas; SE aprašymas saugomas); §1 9, 21 eil. (įmonės poreikio kontaktai; kvietimų el. laiškai)
> - `docs/legal/retention-decision-package-v1.md` 3b sprendimas
>
> **Atviri sprendimai:**
> 1. [OWNER DECISION: prašymų kanalas žmonėms be paskyros — laikinas siūlymas: info@labourmarket.ai; svarstyti atskirą interneto formą su tapatybės patikrinimu]
> 2. [LAWYER: vaidmenų pasiskirstymas dėl organizacijų pateiktų įrašų — organizacija valdytoja, o platforma tvarkytoja; bendri valdytojai (26 str.); ar savarankiški valdytojai. Žr. `organisation-data-terms-v2` §2]
> 3. [LAWYER/OWNER: kas ir kada pateikia šį pranešimą organizacijų sąrašuose esantiems žmonėms (14 str. 3 d.: ne vėliau kaip per vieną mėnesį). Šiuo metu pranešimas neteikiamas]
> 4. [LAWYER: ar viešų darbo skelbimų kontaktiniams asmenims taikoma 14 str. 5 d. b p. išimtis (neproporcingos pastangos) ir kokios viešo informavimo priemonės turi ją lydėti]
> 5. [OWNER DECISION: prieš rodant skelbimo tekstą paslėpti el. pašto adresus ir telefonų numerius ar juos palikti; pašalintų skelbimų saugojimas (siūloma 12 mėn.)]
> 6. [OWNER DECISION: ištrynimo ar užtušavimo kelias organizacijų įrodymų įrašams, kuriuos galima tik papildyti]
> 7. [OWNER DECISION: tarpinių importo įrašų saugojimo terminas]

---

## 1. Kodėl galite skaityti šį pranešimą

LabourMarket.ai platformoje gali būti informacijos apie jus, nors niekada nesiregistravote. Taip nutinka keturiais atvejais:

- **A.** Įmonė, agentūra ar mokykla **užregistravo ar importavo jūsų darbo istoriją**. Pavyzdžiui, buvęs darbdavys įvedė projektus, kuriuose dirbote.
- **B.** Esate nurodytas kaip **kontaktinis asmuo viešame darbo skelbime**, kurį paskelbė Švedijos ar Norvegijos viešoji užimtumo tarnyba.
- **C.** Esate **kontaktinis asmuo verslo užklausoje**, kurią mums atsiuntė įmonė (pvz., darbuotojų poreikis).
- **D.** Kas nors **pakvietė jus el. paštu** prisijungti, bet jūs dar neprisijungėte.

Šiame pranešime paaiškiname, kokius duomenis turime, kodėl ir ką galite daryti.

## 2. Kas atsako

**UAB „Nonstop Group“**
Įmonės kodas 302676973
Mūšos g. 2C, Aukštikalnių k., Pasvalio apylinkių sen., LT-39103 Pasvalio r. sav., Lietuva
Privatumo kontaktas: **info@labourmarket.ai**. Duomenų apsaugos pareigūnas nepaskirtas.

**A atveju** organizacija, užregistravusi jūsų istoriją, pati sprendžia, ką apie jus registruoja, ir atsako už tuos įrašus. Už platformos pačios atliekamus veiksmus su jais (pvz., įrašo susiejimą su paskyra, jei vėliau prisijungsite) atsakome mes. [LAWYER: patvirtinti vaidmenų pasiskirstymą]

## 3. Kokius duomenis turime ir iš kur

| Atvejis | Duomenys | Šaltinis |
|---|---|---|
| A — darbo istorija | jūsų vardas taip, kaip jį įrašė organizacija, organizacijos jums suteikta nuoroda, darbų aprašymai, datos, darbo vietos ir adresai, pastabos, organizacijos patvirtinimai ir platformos iš šių įrašų išvesti įgūdžių signalai | organizacija (jos failai ar importas) |
| B — darbo skelbimai | darbdavio pavadinimas, organizacijos numeris (pagal jį galima nustatyti individualią veiklą vykdantį asmenį) ir skelbimo tekstas, kuriame gali būti kontaktinio asmens vardas, el. paštas ir telefonas. Atskiro struktūrizuoto užimtumo tarnybos kontaktų sąrašo nesaugome | Arbetsförmedlingen (Švedija) ir NAV (Norvegija), vieši atvirieji duomenys |
| C — užklausos | įmonės pavadinimas, jūsų vardas ir kontaktai, kuriuos įvedė įmonė, poreikio informacija | užklausą atsiuntusi įmonė |
| D — kvietimai | jūsų el. pašto adresas, kviečiančiojo įrašytas vardas ir jo žinutė | jus pakvietęs asmuo ar organizacija |

## 4. Kodėl naudojame duomenis ir kokiu teisiniu pagrindu

| Atvejis | Tikslas | Teisinis pagrindas |
|---|---|---|
| A | organizacija saugo ir naudoja savo darbo įrašus. Platforma juos talpina, leidžia jums vėliau juos perimti ir išveda įgūdžių signalus | organizacijos pagrindas jos įrašams. Platformos susiejimui ir išvestiniams signalams — mūsų teisėtas interesas suteikti žmonėms naudingą jų tikro darbo įrašą (BDAR 6 str. 1 d. f p.) [LAWYER] |
| B | rodyti laisvas darbo vietas darbo ieškantiems asmenims, kad jie galėtų kreiptis | teisėtas interesas (6 str. 1 d. f p.): skelbimas paskelbtas tam, kad žmonės kreiptųsi į darbdavį [LAWYER] |
| C | atsakyti į užklausą ir pasirengti galimai sutarčiai | veiksmai prieš sudarant sutartį / teisėtas interesas (6 str. 1 d. b, f p.) |
| D | pristatyti kvietimą ir leisti jį priimti | kviečiančiojo ir jūsų teisėtas interesas būti pakviestam (6 str. 1 d. f p.) |

Specialių kategorijų duomenų (9 str.) apie jus neprašome. Jei įraše tokių duomenų atsirado per klaidą, praneškite mums arba organizacijai.

## 5. Kas mato duomenis

- **A atvejis:** juos mato juos užregistravusios organizacijos vadovai. Taip pat — kitos organizacijos, tame pačiame įraše nurodytos kaip šalis (pvz., projekto užsakovo), vadovai. Kiti naudotojai jų nemato. Jie **nerodomi** kandidatų ieškantiems darbdaviams.
- **B atvejis:** skelbimo tekstas, įskaitant jame esančius kontaktus, rodomas **prisijungusiems** platformos naudotojams. [OWNER DECISION: užtušavimas]
- **C atvejis:** mūsų komanda. Jei įjungtas pranešimų savininkui kanalas, savininkui per Telegram ar Agentai OS tiltą siunčiamas trumpas pranešimas be darbuotojų duomenų. [OWNER: patvirtinti]
- **D atvejis:** kviečiantysis ir mūsų komanda.

Duomenis talpina mūsų paslaugų teikėjai (Supabase ES, Vercel ir kiti, išvardyti Privatumo politikos 6 skyriuje). Perdavimas už EEE ribų paaiškintas Privatumo politikos 7 skyriuje.

## 6. Kiek laiko saugome

- **A:** tol, kol įrašą saugo organizacija. [OWNER DECISION: numatytasis terminas; tarpiniai importo įrašai]
- **B:** kol skelbimas aktyvus. Pašalinti skelbimai paslepiami, bet šiuo metu saugomi. [OWNER DECISION: siūloma 12 mėnesių po pašalinimo]
- **C:** [OWNER DECISION: siūloma 24 mėnesiai po užklausos uždarymo]
- **D:** [OWNER DECISION: kol kvietimas priimamas, atšaukiamas ar nustoja galioti]

## 7. Jūsų teisės

Turite tas pačias teises kaip ir paskyrą turintys žmonės: susipažinti, ištaisyti, ištrinti, apriboti, nesutikti ir, kai taikoma, perkelti duomenis (BDAR 15–21 str.). Jos aprašytos Privatumo politikos 10 skyriuje.

**Nesutikimas.** Kai remiamės teisėtu interesu (6 str. 1 d. f p.), galite nesutikti. Tada tvarkymą nutraukiame, nebent turime įtikinamų priežasčių. Jei tai darbo skelbimo kontaktai (B atvejis), jūsų duomenis mūsų skelbimo kopijoje paslėpsime arba pašalinsime. [OWNER DECISION: patvirtinti veiksmą]

**A atvejis — organizacijos saugomi įrašai.**
- Galite mūsų paklausti, kuri organizacija užregistravo jūsų istoriją. Jūsų prašymą perduosime tai organizacijai arba pateiksime jos kontaktus.
- Platformos pačios išvestus įgūdžių signalus ir ryšius ištriname.
- Dėl savo įrašų sprendžia organizacija. Ji privalo jums atsakyti pagal savo BDAR pareigas.
- Įrašus galima tik papildyti, todėl pataisymas pridedamas kaip naujas įrašas. [OWNER DECISION: ištrynimo kelias]

**Darbo istorijos perėmimas.** Jei norite, kad istorija būtų jūsų paskyroje, paprašykite organizacijos atsiųsti jums kvietimą. Šiuo metu įrašo be kvietimo perimti negalima; taip neleidžiama svetimiems žmonėms ieškoti kitų asmenų įrašų. Susiejus paskyrą įrašą matysite ir galėsite jį užginčyti.

## 8. Kaip su mumis susisiekti

[OWNER DECISION: kanalas] Rašykite **info@labourmarket.ai**, tema „Prašymas — be paskyros“. Nurodykite:
- kuris atvejis jums taikomas (A, B, C ar D);
- savo vardą taip, kaip jis gali būti įrašytas;
- A atveju — organizaciją, jei ją žinote;
- B atveju — nuorodą į skelbimą arba darbdavio pavadinimą.

**Tapatybės patikrinimas.** Kadangi neturite paskyros, prieš ką nors pateikdami ar keisdami turime įsitikinti, kad esate tas asmuo. Prašome tik to, ko reikia, pvz., atsakymo iš įraše nurodyto el. pašto adreso ar duomenų, kuriuos žinotumėte tik jūs. Asmens dokumento kopijos neprašome, nebent kito būdo nėra. [LAWYER: patvirtinti]

**Terminas.** Atsakome per **vieną mėnesį**. Sudėtingiems prašymams terminą galime pratęsti dar dviem mėnesiais; tokiu atveju apie tai pranešame per pirmąjį mėnesį (12 str. 3 d.). Prašymai nagrinėjami nemokamai.

## 9. Skundai

Galite pateikti skundą priežiūros institucijai ES valstybėje, kurioje gyvenate ar dirbate. Mūsų vadovaujanti institucija — Valstybinė duomenų apsaugos inspekcija (VDAI): L. Sapiegos g. 17, LT-10312 Vilnius, ada@ada.lt, vdai.lrv.lt. [LAWYER: patikrinti]

## 10. Versija

v2 (projektas), 2026-10-15. Šis pranešimas skelbiamas adresu [OWNER DECISION: viešas URL, pvz., /legal/no-account-notice]. Nuoroda į jį pateikiama Privatumo politikoje.
