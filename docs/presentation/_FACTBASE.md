# Prezentacijos faktų bazė (vidinis pagrindas — griežtai laikytis)

> Šis failas yra vienintelis leistinas faktų šaltinis prezentacijos turiniui.
> Naudok TIK tai, kas čia patvirtinta. **Jokių išgalvotų statistikų, rinkos
> dydžių, vartotojų skaičių ar € sumų kaip faktų.** Pajamų scenarijai —
> aiškiai pažymėtos prielaidos, ne prognozė. Šaltinis: repo `docs/`,
> `PROJECT_VISION.md`, `ARCHITECTURE_UNIVERSAL_LABOURMARKETAI.md`,
> Commercial Pilot Readiness Train V1 (PR #774–#778), produkcijos patikra.

## 0. POZICIONAVIMO TAISYKLĖS (privaloma — iš „Strateginė pozicija")

- Produktas = **Europos daugiasektorė darbo rinkos operacinė sistema**.
- DRAUDŽIAMA apibrėžti kaip: LT darbo rinkos sprendimą; statybų platformą;
  darbuotojų siuntimo sistemą; vien įdarbinimo/skelbimų portalą.
- **Įdarbinimas yra pamatinė funkcija** (recruitment IS core) — niekada
  nepozicionuoti „prieš įdarbinimą".
- Statyba = TIK pirmas pilotinis vertikalas / konkretus naudojimo atvejis /
  realių funkcijų iliustracija. Ne visos prezentacijos tema, ne branduolio riba.
- Lietuva = TIK viena iš startinių rinkų / pilotavimo vieta / vienas Europos
  ekosistemos dalyvis.
- **≥70 % strateginio naratyvo turi būti sektoriams neutralus.**
- Branduolio funkcijos aiškinamos nepriklausomai nuo vienos profesijos.
- Plėtros logika: pirmasis vertikalas → keli sektoriai → kelios Europos rinkos
  → bendra Europos darbo rinkos infrastruktūra. **Tai strateginė kryptis, NE
  patvirtinta prognozė** (visada taip pažymėti).
- Terminija: „Europos darbo rinkos operacinė sistema" (ne „LT statybų OS");
  „su pirmuoju komerciniu pritaikymu pasirinktame vertikale" (ne „statybų
  vertikalui"); „Platformos mastas: Europa · daugiasektorė / Pirmasis pilotas:
  konkretus sektorius ir rinka".
- Kalba: profesionali lietuvių. Jokių emoji, jokio clipart, jokių placeholder'ių,
  jokių „coming soon", jokių TODO.

## 1. Vienas sakinys (kanoninis, iš PROJECT_VISION)

LabourMarket.ai / LABMA OS — gyva, universali darbo rinkos operacinė sistema,
jungianti žmones, įgūdžius, darbo įrodymus, įmonių poreikius, projektus,
komandas, įdarbinimą ir AI pagalbą, kad bet kuris verslas bet kuriame sektoriuje
galėtų greičiau, tiksliau ir saugiau rasti, patikrinti, valdyti ir auginti
reikalingą darbo jėgą.

Centrinis klausimas: **„Kas yra TINKAMAS žmogus TINKAMAM darbui TINKAMU laiku —
IR KODĖL?"** Pasitikėjimas ateina iš „kodėl" — sistema turi PAAIŠKINTI sprendimus.

## 2. Branduolio formulė (sektoriams neutrali)

Profiliai + Įgūdžiai + Darbo įrodymai + Dokumentai + Prieinamumas +
Įmonių poreikiai + Projektai + Komandos + Atitikimas (Matching) + Komunikacija +
AI sprendimų pagalba + Auditas.

## 3. Neginčijami principai (verified doctrine)

- Jokių nepažymėtų netikrų duomenų, netikros verifikacijos, netikro AI.
- AI niekada nepatvirtina ir nesiunčia žmogaus vardu (žmogus visada patvirtina).
- Numatytasis matomumas — uždaras (default-closed).
- Auditas — append-only (neperrašoma istorija).
- CV yra centrinis gyvas pasitikėjimo objektas (computed, real-time).
- Vienas žmogus → daug profesijos kontekstų → daug dienoraščio įrašų →
  įgūdžių patvirtinimai → vienas gyvas CV.

## 4. Patvirtintos funkcijos (gyva / įdiegta produkcijoje 2026-07-16, main 3d1e6f00)

Statuso žymos: GYVA = veikia vartotojams; PROD = kodas + migracija produkcijoje.

- **Verifikuoti įgūdžiai + Darbo dienoraštis + vadovo patvirtinimas** (GYVA).
  Kiekvienas įgūdis „Deklaruotas" arba „✓ Vadovo patvirtintas". Append-only,
  auditojama. Ne savideklaracija, ne pirktas reitingas.
- **Darbuotojų atradimas ir sutikimas** (PROD). Saugus opt-in matomumas,
  darbdavio paieška su ribotais filtrais, anoniminės kortelės, kontaktų
  atskleidimas TIK po ATSKIRO auditojamo sutikimo (priėmimas ≠ atskleidimas),
  greičio limitai, profilio šviežumas.
- **Trust Connect — komandos/brigados** (PROD). Narystė per kvietimą (sutikimas
  priimant), komandos prieinamumas/apgyvendinimas/transportas, darbdavio
  užklausos komandai su auditojama būsenų mašina (created→accepted|declined|
  withdrawn|expired), be jokio kontaktų nutekėjimo.
- **Paaiškinamas atitikimas** (PROD). Deterministinis variklis: privaloma /
  pageidautina / nežinoma / konfliktas; rodo priežastis ir trūkstamus faktus;
  komandų atitikimas; jokio „juodos dėžės" balo; jokių diskriminacinių laukų.
- **CV importas ir peržiūra** (PROD). PDF/DOCX deterministinis ištraukimas,
  laukų peržiūra Patvirtinti/Atmesti, konfliktų sprendimas, jokio tylaus AI
  rašymo, jokio auto-publikavimo.
- **Pilotų valdymas ir matavimas** (PROD). Pilotai/dalyviai/rezultatai, admin
  panelė, onboarding žingsnių įvykiai, konversijos piltuvas, laikas-iki-vertės,
  ne-PII analitika.
- **Rinkos žvalgybos sluoksnis** (GYVA). Šaltinių registras (išoriniai
  IŠJUNGTI pagal nutylėjimą), versijuotas stebėjimų kontraktas, atlyginimų /
  įgūdžių paklausos įžvalgos su pasitikėjimo ir šviežumo ženklais.
- **Valdymo kambarys** (GYVA). Moduliai: veikla, užduotys, planavimas, CRM,
  projektų operacijos, dokumentai, finansai.
- **Daugiakalbystė** — 11–12 kalbų; LT/EN/RU/NL/DE rašytos ranka.

## 5. Pasitikėjimo architektūra — patvirtinta produkcijoje

- Autentifikuotas produkcijos patikrinimas: **26/26 testų praėjo**.
- **PII analitika = 0** (0 el. pašto/telefono/PII visose analitikos eilutėse).
- RLS default-closed; rašymai tik per SECURITY DEFINER RPC; append-only žurnalai.
- Priėmimas ≠ atskleidimas įrodyta; IDOR blokuotas; greičio limitai veikia.

## 6. Sektoriai, kuriems tinka tas pats branduolys (iš vizijos)

Statyba · gamyba · logistika ir transportas · energetika · techninė priežiūra ·
svetingumas (viešbučiai/maitinimas) · sveikatos ir socialinė priežiūra ·
žemės ūkis · paslaugos · kitos techninės profesijos.

## 7. Auditorijos vertė (sektoriams neutrali)

- **Darbdaviai / įmonės:** greičiau randa tinkamus žmones ir komandas; sprendimai
  su „kodėl"; verifikuota brigados sudėtis; savaime augantis kvalifikacijos įrašas.
- **Įdarbinimo agentūros:** operacinis sluoksnis kandidatų srautui, komandoms,
  poreikiams; multiplikatorius (viena agentūra = daug darbuotojų).
- **Profesinės mokyklos / universitetai:** mokinių/absolventų realių gebėjimų
  perkeliamas įrodymas; tiltas mokymas → darbas; kvalifikacijų matomumas.
- **Ministerijos / valstybė:** ne-PII darbo rinkos įžvalgos; įgūdžių paklausos
  signalai; skaidrus, auditojamas, privatumą saugantis infrastruktūros sluoksnis.
- **Investuotojai:** daugiasektorė, daugiarinkė EU infrastruktūra; pasitikėjimo
  duomenų flywheel; komercinis modelis su keliomis auditorijomis.
- **Strateginiai partneriai:** bendras operacinis sluoksnis, jungiantis atskiras
  sistemas (mokymas, agentūros, darbdaviai, valstybė).

## 8. Komercinis modelis (kainos nustatytos; self-serve mokėjimai NEĮJUNGTI)

Billing tebėra draft/RED/owner-gated — self-serve mokėjimai negyvi. Greičiausias
kelias uždirbti — rankinės sąskaitos founding-pilotams. Kainos:

- Asmenys: FREE 0 · AI PLUS 9,99 · VIP MEDIA 24,99 (€/mėn).
- Įmonės: FREE 0 (1 aktyvus skelbimas) · PROJECT LAUNCH 99 (startinis pasiūlymas,
  matomas iki 2026-10-31 — neriboti skelbimai + vidinė promo).
- Agentūros: START 99,99 · GROWTH 249,99 · SCALE 499,99.

Pajamų scenarijai (iliustracija, ~3 mėn., PRIELAIDOS ne prognozė): konservatyvus
~€400/mėn; bazinis ~€1 800/mėn; agresyvus ~€5 500/mėn. Priklauso nuo mokėjimų
įjungimo, pardavimo pastangų ir pasiūlos likvidumo.

## 9. Parengtis ir kiti žingsniai

- Produktas techniškai gyvas produkcijoje; **kontroliuojamo realių vartotojų
  piloto parengtis** (2–5 vartotojai). Superadmin grant laukia (1 diena).
- Kiti žingsniai (sektoriams neutralūs): įjungti pilotą; imti pajamas rankine
  sąskaita; užpildyti pasiūlą; paversti 1 pilotą į išmatuotą rezultatą (case
  study); tik po srauto — self-serve mokėjimai, vieša reklama, agentūrų kanalas;
  plėtra į 2-ą sektorių / 2-ą rinką ta pačia platforma.

## 10. Kanoninis grafikų sąrašas (nuorodų nuoseklumui)

Visi failai: `docs/presentation/svg/<name>.svg`. Nuorodose naudok šiuos vardus:

1. `platform-architecture` — branduolio sluoksniai (žmonės/įgūdžiai/įrodymai/
   poreikiai/atitikimas/AI/auditas), sektoriams neutralu.
2. `multi-sector-grid` — tas pats branduolys per 9 sektorius.
3. `verification-model` — deklaruota → dienoraštis → vadovo patvirtinimas →
   ✓ verifikuota.
4. `trust-model` — pasitikėjimo sluoksniai (sutikimas, default-closed, audit, PII=0).
5. `matching-engine` — privaloma/pageidautina/nežinoma/konfliktas + priežastys.
6. `flywheel` — duomenų/pasitikėjimo flywheel.
7. `worker-lifecycle` — darbuotojo kelias.
8. `employer-lifecycle` — darbdavio kelias.
9. `agency-lifecycle` — agentūros kelias.
10. `ai-architecture` — AI pagalba su žmogaus patvirtinimu (human-in-loop).
11. `market-intelligence` — ne-PII žvalgybos sluoksnis.
12. `expansion-roadmap` — vertikalų + rinkų plėtra (pažymėta „strateginė kryptis").
13. `pilot-funnel` — piloto piltuvas.
14. `revenue-funnel` — komercinis piltuvas.
15. `timeline` — fazių laiko juosta.
16. `readiness-dashboard` — parengties matuokliai.
17. `data-flow` — duomenų srautas.

Diagramų šaltiniai (redaguojami): `docs/presentation/diagrams/*.md` (Mermaid).
