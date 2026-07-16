# Vadovo suvestinė — Executive readiness dashboard (maketavimo specifikacija)

> Šis dokumentas yra vieno puslapio maketavimo specifikacija dizaineriui.
> Visos reikšmės paimtos iš `_FACTBASE.md`. Jokių išgalvotų statistikų,
> procentų ar € sumų. Kokybinės parengties etiketės: **Aukšta / Vidutinė /
> Ankstyva**. Pajamų skaičiai — pažymėtos prielaidos, ne prognozė.

---

## Antraštinė juosta — Platformos mastas

**Platformos mastas: Europa · daugiasektorė darbo rinkos operacinė sistema.**
**Pirmasis pilotas: konkretus sektorius ir rinka (statyba · Lietuva) — pažymėta kaip pirmasis pilotinis vertikalas, ne platformos riba.**

Paantraštė (maža): *„Kas yra tinkamas žmogus tinkamam darbui tinkamu laiku — ir kodėl?"*

---

## READINESS matuokliai

Kokybinės etiketės (be išgalvotų procentų). Įrodymų eilutės cituoja tik
produkcijoje patvirtintus faktus.

| Parengties sritis | Etiketė | Įrodymas / pagrindimas (iš faktų bazės) |
|---|---|---|
| Produkto funkcijos | **Aukšta** | Branduolio moduliai GYVA/PROD produkcijoje (main `3d1e6f00`): verifikuoti įgūdžiai, atradimas+sutikimas, Trust Connect, paaiškinamas atitikimas, CV importas, pilotų matavimas, žvalgyba, valdymo kambarys |
| Pasitikėjimas ir atitiktis | **Aukšta** | 26/26 autentifikuotų produkcijos testų praėjo; PII analitika = 0; RLS default-closed; rašymai tik per SECURITY DEFINER RPC; append-only auditas; priėmimas ≠ atskleidimas įrodyta; IDOR blokuotas |
| Monetizacijos infrastruktūra | **Ankstyva** | Kainos nustatytos (asmenys/įmonės/agentūros), bet self-serve mokėjimai NEĮJUNGTI (billing draft/RED/owner-gated); greičiausias kelias — rankinės sąskaitos founding-pilotams |
| Paklausa / pasiūla | **Ankstyva** | Techniškai gyva; pasiūla dar pildoma; parengtis kontroliuojamam realių vartotojų pilotui (2–5 vartotojai) |
| Go-to-market | **Vidutinė** | Pilotų valdymas, onboarding įvykiai, konversijos piltuvas ir laikas-iki-vertės matavimas GYVA; vieša reklama ir agentūrų kanalas planuojami tik po pirmo srauto |

Įrodymų ženklai (naudoti kaip mažas „chip" eilutes po lentele):
`26/26 autentifikuotų testų` · `PII = 0` · `RLS default-closed` ·
`main 3d1e6f00` · `11–12 kalbų (LT/EN/RU/NL/DE ranka)`.

---

## Kas patvirtinta produkcijoje

Statuso žymos: **GYVA** = veikia vartotojams · **PROD** = kodas + migracija produkcijoje.

| Funkcija | Žyma | Esmė |
|---|---|---|
| Verifikuoti įgūdžiai + Darbo dienoraštis + vadovo patvirtinimas | **GYVA** | Kiekvienas įgūdis „Deklaruotas" arba „✓ Vadovo patvirtintas"; append-only, auditojama; ne savideklaracija, ne pirktas reitingas |
| Darbuotojų atradimas ir sutikimas | **PROD** | Opt-in matomumas, riboti filtrai, anoniminės kortelės, kontaktai TIK po atskiro auditojamo sutikimo (priėmimas ≠ atskleidimas), greičio limitai |
| Trust Connect — komandos / brigados | **PROD** | Narystė per kvietimą, komandos prieinamumas/apgyvendinimas/transportas, auditojama būsenų mašina, be kontaktų nutekėjimo |
| Paaiškinamas atitikimas | **PROD** | Deterministinis variklis: privaloma/pageidautina/nežinoma/konfliktas; priežastys ir trūkstami faktai; jokio „juodos dėžės" balo |
| CV importas ir peržiūra | **PROD** | PDF/DOCX deterministinis ištraukimas, laukų peržiūra Patvirtinti/Atmesti, konfliktų sprendimas, jokio tylaus AI rašymo |
| Pilotų valdymas ir matavimas | **PROD** | Pilotai/dalyviai/rezultatai, admin panelė, onboarding įvykiai, konversijos piltuvas, laikas-iki-vertės, ne-PII analitika |
| Rinkos žvalgybos sluoksnis | **GYVA** | Šaltinių registras (išoriniai IŠJUNGTI pagal nutylėjimą), versijuotas stebėjimų kontraktas, atlyginimų/įgūdžių paklausos įžvalgos su pasitikėjimo ir šviežumo ženklais |
| Valdymo kambarys | **GYVA** | Moduliai: veikla, užduotys, planavimas, CRM, projektų operacijos, dokumentai, finansai |
| Daugiakalbystė | **GYVA** | 11–12 kalbų; LT/EN/RU/NL/DE rašytos ranka |

---

## Komercinis modelis

Kainos nustatytos. **Self-serve mokėjimai NEĮJUNGTI** — billing tebėra
draft/RED/owner-gated. Greičiausias kelias uždirbti — rankinės sąskaitos
founding-pilotams.

| Auditorija | Planai (€/mėn., jei nenurodyta kitaip) |
|---|---|
| Asmenys | FREE 0 · AI PLUS 9,99 · VIP MEDIA 24,99 |
| Įmonės | FREE 0 (1 aktyvus skelbimas) · PROJECT LAUNCH 99 (startinis pasiūlymas, matomas iki 2026-10-31 — neriboti skelbimai + vidinė promo) |
| Agentūros | START 99,99 · GROWTH 249,99 · SCALE 499,99 |

**Pajamų scenarijai — PRIELAIDOS (iliustracija, ~3 mėn.), ne prognozė:**
konservatyvus ~€400/mėn · bazinis ~€1 800/mėn · agresyvus ~€5 500/mėn.
Priklauso nuo mokėjimų įjungimo, pardavimo pastangų ir pasiūlos likvidumo.

**Sąžiningumo pastaba:** šie skaičiai NĖRA uždirbtos pajamos ir NĖRA prognozė —
tai prielaidų scenarijai, kurie realizuojasi tik įjungus mokėjimus ir užpildžius pasiūlą.

---

## Kiti žingsniai (sektoriams neutralūs)

Produktas techniškai gyvas produkcijoje; parengtas kontroliuojamam realių
vartotojų pilotui (2–5 vartotojai). Superadmin grant laukia (≈1 diena).

1. Įjungti pilotą.
2. Imti pirmas pajamas rankine sąskaita.
3. Užpildyti pasiūlą.
4. Paversti 1 pilotą į išmatuotą rezultatą (case study).
5. Tik po srauto — self-serve mokėjimai, vieša reklama, agentūrų kanalas.
6. Plėtra į 2-ą sektorių / 2-ą rinką ta pačia platforma.

---

## Sąžiningumo riba (poraštė)

- Jokių išgalvotų statistikų, rinkos dydžių, vartotojų skaičių ar € sumų kaip faktų.
- Parengties etiketės — kokybinės (Aukšta/Vidutinė/Ankstyva), ne išgalvoti procentai.
- Pajamų skaičiai — pažymėtos prielaidos, ne prognozė.
- Statyba · Lietuva = pirmasis pilotinis vertikalas ir rinka, ne platformos riba.
- Plėtra į kelis sektorius ir rinkas — **strateginė kryptis, ne patvirtinta prognozė.**
- Produktas = Europos daugiasektorė darbo rinkos operacinė sistema; įdarbinimas yra pamatinė funkcija.
