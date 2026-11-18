# Slapukų ir naršyklės saugyklos politika — LabourMarket.ai

> **Būsena:** DRAFT v2 — 2026-10-15 (projektas)
> **Reikalinga teisininko peržiūra / Requires lawyer review.** Projektas teisininko peržiūrai. Jis nėra galutinis, dar neturi teisinės galios ir nesertifikuotas.
>
> **Naudoti faktų šaltiniai:**
> - 2026-10-15 auditas `02-processors-transfers-cookies-ai.md` §2.1–2.5 (visi slapukai ir saugyklos raktai su vieta kode), D5, D12; `03-rights-consent-legal-pages.md` §2, L3, L4
> - Galiojimo laikas patikrintas kode 2026-10-15: `lm_active_workspace` — 180 dienų (`apps/web/lib/company/organization-actions.ts:54`); `lm_hide_admin_ui` — 365 dienos (`apps/web/lib/auth/admin-ui-actions.ts:20`)
> - Dabartinis puslapis: `apps/web/messages/lt.json` → `legal.cookies`
>
> **Atviri sprendimai:**
> 1. [OWNER DECISION: įdiegti sutikimo juostą, kad 4 skyriaus analitikos įrašai būtų daromi tik po sutikimo, ARBA telemetriją padaryti griežtai būtiną / tik agreguotą ir pašalinti `lm.attr.first`, `lm.funnel.*` ir `lm.pilot.session`. **Šiuo metu šie įrašai daromi be sutikimo, juostos nėra.** Šios politikos negalima skelbti tokios, kokia ji parašyta, kol neįgyvendintas vienas iš variantų.]
> 2. [LAWYER: ar pagal Lietuvos teisę taikoma kokia nors analitikos išimtis. Numatytasis vertinimas: su profiliu susietai analitikai — netaikoma]
> 3. [LAWYER: 3 skyriaus „funkcinių“ įrašų, kurių naudotojas aiškiai neprašė (naudojimo skaitikliai, neseniai peržiūrėti darbai), klasifikacija]
> 4. [OWNER: patvirtinti prisijungimo slapuko galiojimo laiką — tai bibliotekos numatytoji reikšmė, mūsų kode nenustatyta]
> 5. [OWNER: patvirtinti, ar mokėjimui naudojami Stripe talpinami Checkout puslapiai, ir tai nurodyti 5 skyriuje]
> 6. [LAWYER: patikrinti nuorodą į Lietuvos elektroninių ryšių įstatymo straipsnį (audite nurodytas 61 str. 3 d.) pagal galiojančią redakciją]

---

## 1. Kam taikoma ši politika

Platforma jūsų naršyklėje saugo nedidelius įrašus:
- **slapukus**;
- **vietinę saugyklą** (local storage) — ji lieka, kol jos neišvalote;
- **seanso saugyklą** (session storage) — ji ištrinama uždarius skirtuką.

Kai kurios funkcijos taip pat priverčia jūsų naršyklę tiesiogiai kreiptis į kitas paslaugas (5 sk.).

Bet kokiam informacijos saugojimui jūsų įrenginyje ar jos nuskaitymui reikia jūsų **sutikimo**, nebent tai **griežtai būtina** jūsų prašomai paslaugai teikti. Ši taisyklė kyla iš e. privatumo direktyvos 2002/58/EB 5 str. 3 d., kurią Lietuvoje įgyvendina Elektroninių ryšių įstatymas (61 str.). [LAWYER: patikrinti straipsnį]

Trečiųjų šalių reklamos slapukų nenaudojame. Nenaudojame jokios trečiųjų šalių analitikos paslaugos ir seansų įrašymo. Tačiau **turime** savo (pirmosios šalies) produkto analitiką, aprašytą 4 skyriuje.

## 2. Griežtai būtini įrašai

Šiems įrašams sutikimo nereikia. Be jų jūsų prašoma paslauga negali veikti.

| Pavadinimas | Tipas | Galiojimas | Paskirtis |
|---|---|---|---|
| `sb-<project>-auth-token` (gali būti padalytas į `.0`, `.1`, …) | slapukas | kol esate prisijungę; atnaujinamas automatiškai [OWNER: patikrinti ilgiausią galiojimą] | išlaiko jus prisijungusius |
| `sb-<project>-auth-token-code-verifier` | slapukas | trumpai, tik prisijungimo metu | apsaugo prisijungimą per Google (PKCE) |
| `lm_active_workspace` | slapukas (puslapio skriptai jo negali nuskaityti) | 180 dienų | įsimena, kurioje darbo erdvėje (asmeninėje ar organizacijos) dirbate |
| `lmai:command-finder-speech-consent:v1` | vietinė saugykla | kol išvalysite | įsimena, kad sutikote su balso diktavimo pranešimu |
| `lm.oauth.trace` | seanso saugykla | kol uždarysite skirtuką | atsitiktinis ID, padedantis atsekti nepavykusį prisijungimą |
| `lm-chunk-reload` | seanso saugykla | kol uždarysite skirtuką | neleidžia puslapiui po atnaujinimo persikrauti be galo |

## 3. Nuostatų ir funkciniai įrašai

Jie įsimena jūsų pasirinkimus arba išsaugo jūsų darbą, kol naudojatės funkcija.

| Pavadinimas | Tipas | Galiojimas | Paskirtis |
|---|---|---|---|
| `NEXT_LOCALE` | slapukas | 1 metai | jūsų kalba |
| `lm_tz` | slapukas | 1 metai | jūsų laiko juosta, kad dienos ir laikas būtų rodomi teisingai |
| `lm_hide_admin_ui` | slapukas | 1 metai | tik administratoriams: ar paslėpti administratoriaus valdikliai. Teisių nekeičia |
| `theme` | vietinė saugykla | kol išvalysite | šviesi ar tamsi tema |
| `lm.communication.writeLanguage` | vietinė saugykla | kol išvalysite | kalba, kuria rašote žinutes |
| `lmai:voice-speech-language` | vietinė saugykla | kol išvalysite | diktavimo kalba |
| `lm.search-location.v1` | vietinė saugykla | kol išvalysite | jūsų pasirinkta paieškos vieta. Ji gali būti tiksli ir lieka jūsų įrenginyje |
| `lm.opportunities.recentlyViewed.v1` | vietinė saugykla | kol išvalysite | neseniai peržiūrėti darbo skelbimai [LAWYER: klasifikacija] |
| `lm.commandFinder.recentCommandIds` | vietinė saugykla | kol išvalysite | paskutinės jūsų komandos |
| `lm.myspace.usage.v1`, `lm.myspace.asked.v1` | vietinė saugykla | kol išvalysite | kaip dažnai naudojate funkcijas, kad galėtume pasiūlyti nuorodas. Lieka jūsų įrenginyje [LAWYER: klasifikacija] |
| `lm.professionRecoveryPrompt.v1.dismissed` | vietinė saugykla | kol išvalysite | šį raginimą uždarėte |
| `lm.work-card-checks.kept` | vietinė saugykla | kol išvalysite | patikrinimai, kuriuos nusprendėte palikti |
| `lm.employerVisibilityAsk.v1` | vietinė saugykla | kol išvalysite | jūsų atsakymas į klausimą dėl matomumo darbdaviams. Pats sutikimas registruojamas mūsų serveryje |
| `lm.chat.continueAfterSwitch` | seanso saugykla | kol uždarysite skirtuką | iki 500 jūsų įvesto sakinio ženklų, kad galėtumėte tęsti pakeitę darbo erdvę |
| `lmai:voice-transcript-draft` | seanso saugykla | kol uždarysite skirtuką | jūsų diktavimo teksto juodraštis |

## 4. Analitikos įrašai — reikalingas sutikimas

Matuojame, kaip naudojamasi produktu: kuriuos puslapius ir žingsnius žmonės pasiekia, registracijos žingsnius, dienos aktyvumą ir kuri kampanija atvedė lankytoją. Įvykiai saugomi mūsų pačių serveriuose; jei esate prisijungę, jie susiejami su jūsų paskyra.

[OWNER DECISION: juosta arba atsisakyti] **Šie įrašai daromi tik jums sutikus.** Savo pasirinkimą galite bet kada pakeisti [OWNER DECISION: kur keičiamas pasirinkimas, pvz., poraštės nuoroda „Slapukų nustatymai“].

| Pavadinimas | Tipas | Galiojimas | Paskirtis |
|---|---|---|---|
| `lm.attr.first` | vietinė saugykla | kol išvalysite | pirmojo apsilankymo kampanijos duomenys (`utm_*` žymos, nukreipusi svetainė, pirmas puslapis). Registruojantis jie nukopijuojami į jūsų paskyros įrašą |
| `lm.funnel.last_seen_day` | vietinė saugykla | kol išvalysite | paskutinė diena, kai buvote aktyvūs, — dienos aktyvių naudotojų skaičiavimui |
| `lm.funnel.signup_pending` | vietinė saugykla | kol išvalysite | žymi, kad registracija vyksta |
| `lm.pilot.session` | seanso saugykla | kol uždarysite skirtuką | atsitiktinis seanso ID, siunčiamas su kiekvienu analitikos įvykiu |
| `lm.funnel.*` (pvz., `landing_fired`, `login_succeeded`) | seanso saugykla | kol uždarysite skirtuką | neleidžia to paties analitikos įvykio suskaičiuoti du kartus |

Jei nesutinkate, produktas veikia taip pat.

Pati analizė grindžiama mūsų teisėtu interesu tobulinti produktą (BDAR 6 str. 1 d. f p.). Galite jai nesutikti (žr. Privatumo politikos 10 sk.).

## 5. Paslaugos, į kurias jūsų naršyklė kreipiasi tiesiogiai

- **OpenStreetMap žemėlapio dalys** (`tile.openstreetmap.org`). Rinkos žemėlapis savo dalis krauna iš OpenStreetMap Foundation serverių. Jūsų naršyklė siunčia jūsų IP adresą, naršyklės duomenis ir peržiūrimą žemėlapio sritį. Mūsų slapukai čia nenaudojami. Taikoma OpenStreetMap Foundation privatumo politika.
- **Balso diktavimas.** Jei komandų paieškoje naudojate diktavimą, jūsų naršyklė siunčia garsą į savo gamintojo kalbos atpažinimo paslaugą (pvz., Chrome — Google, Safari — Apple). Mes garso negauname. Prieš pirmą kartą naudojant parodomas pranešimas.
- **Mokėjimo puslapiai.** Kai organizacija moka, Stripe puslapiuose taikomos pačios Stripe sąlygos ir slapukai. [OWNER: patvirtinti talpinamą Checkout]
- **Šriftai** pateikiami iš mūsų pačių svetainės. Į Google Fonts nesikreipiama.

## 6. Kaip valdyti ar ištrinti šiuos įrašus

- Naršyklės nustatymuose bet kada galite ištrinti slapukus ir svetainės duomenis (vietinę ir seanso saugyklą).
- Ištrynus prisijungimo slapukus, būsite atjungti.
- Seanso saugykla išvaloma uždarius skirtuką.
- [OWNER DECISION: produkte esantis 4 skyriaus sutikimo pasirinkimas, kai jis bus sukurtas]

## 7. Pakeitimai

- Versija **v2 (projektas), 2026-10-15**.
- Šį sąrašą atnaujiname prieš pridėdami naują slapuką ar saugyklos įrašą.
- Klausimai: info@labourmarket.ai.
- Valdytoja: UAB „Nonstop Group“, įmonės kodas 302676973 (žr. Privatumo politikos 1 sk.).
