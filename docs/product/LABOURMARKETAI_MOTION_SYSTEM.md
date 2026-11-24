# LABOURMARKET.AI — MOTION SYSTEM

**Statusas:** FAZĖ A — specifikacija
**Data:** 2026-07-30
**Bazė:** `apps/web/tokens/motion.ts` (JAU EGZISTUOJA — ši sistema jį **praplečia**,
nekuria naujo)

---

## 0. MOTION TIKSLAS

Motion **nėra dekoracija**. Motion turi parodyti:

- iš kur atsirado rezultatas
- kaip keičiasi kontekstas
- kaip informacija grupuojama
- kaip rezultatas susijęs su pokalbiu
- kuri būsena pasikeitė

**Testas:** jei animaciją pašalinus vartotojas nieko nepraranda supratimo prasme —
tai dekoracija, ir ji pašalinama.

---

## 1. ESAMI TOKENAI (nekeičiami)

| Tokenas | Reikšmė | Paskirtis |
|---|---|---|
| `--motion-instant` | 90 ms | press/tap grįžtamasis ryšys |
| `--motion-fast` | 160 ms | hover, smulkūs būsenų pokyčiai |
| `--motion-base` | 240 ms | įėjimai, skydeliai |
| `--motion-slow` | 420 ms | „uždirbtas" momentas |
| `--motion-ease-out` | decelerate | dauguma UI |
| `--motion-ease-spring` | overshoot | šventinis / uždirbtas |

> Komponentai **niekada** nekoduoja trukmės ar kreivės tiesiogiai. Naujiems
> motion modeliams naujų tokenų **nereikia** — visi penki modeliai išreiškiami
> esamais.

---

## 2. PRIVALOMI MOTION MODELIAI

### 2.1 MESSAGE TO RESULT

**Ką reiškia:** AI žinutė transformuojasi į rezultato kortelę arba atidaro susietą
rezultatų skydelį.

| Aspektas | Specifikacija |
|---|---|
| Trukmė | `--motion-base` (240 ms) |
| Kreivė | `--motion-ease-out` |
| Desktop | rezultato skydelis įslenka iš dešinės; žinutė pokalbyje gauna „→ rezultatas" akcentą |
| Mobile | drawer kyla iš apačios |
| Kilmės ryšys | rezultatas prasideda nuo **žinutės kortelės ribų**, ne nuo ekrano krašto — taip matomas priežastinis ryšys |
| Reduced motion | be slinkimo; opacity 0→1 per `--motion-fast` |

**Draudžiama:** rezultatas, atsirandantis be jokio ryšio su žinute (staigus
pakeitimas) — vartotojas praranda „iš kur tai atsirado".

### 2.2 RESULT TO SUMMARY

**Ką reiškia:** uždarytas rezultatas susitraukia į kompaktišką pokalbio kortelę.

| Aspektas | Specifikacija |
|---|---|
| Trukmė | `--motion-base` |
| Kreivė | `--motion-ease-out` |
| Elgesys | skydelis susitraukia į tą pokalbio žinutę, iš kurios kilo |
| Rezultatas | pokalbyje **lieka** kompaktiška kortelė — rezultatas niekada nedingsta be pėdsako |
| Reduced motion | skydelis dingsta, kortelė atsiranda; be transformacijos |

**Kritinis reikalavimas.** Uždarius rezultatą vartotojas **negali** likti tuščiame
pokalbyje — santrauka privaloma. Tai apsauga nuo dead-end (§13.1).

### 2.3 CONTEXT SWITCH

**Ką reiškia:** perjungiant asmeninį / įmonės / projekto kontekstą.

| Aspektas | Specifikacija |
|---|---|
| Trukmė | `--motion-base` |
| Akcento spalva | pereina per `--motion-base`, žr. vizualinę sistemą §4 |
| Turinys | trumpai persitvarko (stagger ≤ 3 elementai × 40 ms) |
| Puslapis | **neperkraunamas** |
| Aiškumas | vartotojas privalo matyti, kad duomenys priklauso **kitam** kontekstui |
| Reduced motion | akcento spalva keičiasi iš karto; stagger išjungtas |

**Draudžiama:** kontekstas, pasikeitęs tyliai. Jei akcentas nepasikeitė —
vartotojas žiūrės į kito konteksto duomenis manydamas, kad tai jo.

### 2.4 CATALOG TRANSITION

**Ką reiškia:** katalogai (Pažanga / Patirtis / Įrodymai; rinkos 5 katalogai)
keičiasi sklandžiai.

| Aspektas | Specifikacija |
|---|---|
| Trukmė | `--motion-fast` (160 ms) |
| Kreivė | `--motion-ease-out` |
| Dydis | bloko aukštis **išsaugomas**, kai įmanoma — jokio layout šuolio |
| Kai neįmanoma | aukštis animuojamas per `--motion-fast`, ne staigiai |
| Reduced motion | cross-fade be judesio |

### 2.5 LIVE DATA

**Ką reiškia:** naujas įrašas ar pasikeitęs skaičius subtiliai pažymimas.

| Aspektas | Specifikacija |
|---|---|
| Trukmė | `--motion-slow` (420 ms), **vieną kartą** |
| Kreivė | `--motion-ease-spring` — tik čia leidžiamas overshoot |
| Apimtis | pasikeitęs skaičius arba naujas įrašas; **ne visas blokas** |
| Pasikartojimas | **neciklinama** — žymėjimas įvyksta vieną kartą |
| Reduced motion | vienkartinis fono blyksnis be mastelio pokyčio |

**Pagrindimas.** `--motion-ease-spring` rezervuojamas „uždirbtam" momentui: naujas
darbo įrašas, naujai pagrįstas įgūdis. Jei spring naudojamas visur — jis nustoja
reikšti, kad kažkas uždirbta.

---

## 3. DRAUDIMAI

- ❌ nuolat judantys fonai, trukdantys skaityti
- ❌ bereikalingas parallax
- ❌ ilgos animacijos (> `--motion-slow` bet kuriai UI būsenai)
- ❌ judesys kiekvienam smulkiam elementui
- ❌ motion, kuris blogina prieinamumą ar našumą
- ❌ trukmės/kreivės, koduojamos komponente vietoj tokeno
- ❌ `--motion-ease-spring` ne „uždirbtiems" momentams

---

## 4. `prefers-reduced-motion` — PRIVALOMA

Kiekvienas iš 5 modelių turi **apibrėžtą** reduced-motion elgesį (žr. lenteles).

**Taisyklė:** reduced motion ≠ jokio grįžtamojo ryšio. Būsenos pokytis privalo
likti matomas — keičiasi tik *kaip*, ne *ar*.

Esamos `globals.css` animacijos (`.verified-pop`, `.rise-in`, `.live-dot`) jau
laikosi šios taisyklės — naujos privalo laikytis taip pat.

---

## 5. PRIĖMIMO KRITERIJAI (FAZĖ B+)

| # | Kriterijus | Kaip tikrinama |
|---|---|---|
| M1 | Kiekvienas rezultatas turi matomą kilmę pokalbyje | rankinis srauto testas |
| M2 | Uždarytas rezultatas palieka santrauką | rankinis, kiekvienam rezultato tipui |
| M3 | Konteksto perjungimas keičia akcentą | vizualiai, 3 kontekstuose |
| M4 | Katalogų perjungimas nesukelia layout šuolio | 360 / 390 / 768 / 1440 |
| M5 | `prefers-reduced-motion: reduce` — nė vienas srautas nesulūžta | OS nustatymas + pilnas srautas |
| M6 | Jokia trukmė nekoduota komponente | `grep` dėl `duration-\[`, `ms`, `cubic-bezier` |

> **Šie kriterijai dar NEPATIKRINTI** — motion sistema yra specifikacija, ne
> įgyvendinimas. Įgyvendinimas priklauso FAZEI B.
