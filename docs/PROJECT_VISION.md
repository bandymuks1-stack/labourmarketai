> **THIS DOCUMENT IS THE CANONICAL VISION SOURCE.** Before starting any
> major slice on labourmarket.ai, all AI agents (Claude Code, Codex,
> Antigravity, new sessions) **must read this file**. It defines what we
> are building, why, for whom, and in what order. Disagreements with this
> document must be raised with the founder — **not silently ignored**.
>
> Primary language: Lithuanian (source language, founder DI's "Idėjos
> knyga"). Each chapter ends with a short English summary for
> international agents.

# labourmarket.ai — Projekto vizija / Project Vision

> Pilna produkto apžvalga ir įgyvendinimo planas (human-first):
> [`docs/product/labourmarketai-full-product-overview-and-implementation-plan.md`](product/labourmarketai-full-product-overview-and-implementation-plan.md)

---

## 1. Vienas sakinys / One sentence

labourmarket.ai yra gyva, universali darbo rinkos operacinė
sistema, kuri sujungia žmones, įgūdžius, darbo įrodymus, įmonių poreikius,
projektus, komandas, įdarbinimą ir AI pagalbą, kad bet kuris verslas bet
kuriame sektoriuje galėtų greičiau, tiksliau ir saugiau rasti, patikrinti,
valdyti ir auginti reikalingą darbo jėgą.

**EN:** labourmarket.ai is a living, universal labour-market operating system
connecting people, skills, work evidence, company needs, projects, teams,
recruitment and AI assistance so any business in any sector can find,
verify, manage and grow its workforce faster, more precisely and more
safely.

---

## 2. Kas tai yra / What it is

- Bendra darbo rinkos operacinė sistema, **ne tik konstrukcijai**.
- Apima **ĮDARBINIMĄ kaip pamatinę funkciją** (recruitment IS core, plius
  daugiau). Niekada nepozicionuoti prieš įdarbinimą — „we're not a
  recruitment system" yra **neteisingas** teiginys.
- Plius: workforce management, skill verification, project planning, team
  building, market intelligence, AI assistance, audit.
- Visi sektoriai: statyba, gamyba, logistika, viešbučiai/maitinimas,
  sveikatos/slauga, IT, žemės ūkis, valymas/apsauga, paslaugos.
- Statyba = **pirmas vertikalus pavyzdys**, ne ribojantis branduolį.

**EN:** A universal labour-market OS. Recruitment is a core function (plus
much more) — never positioned "against" recruitment. Construction is the
first vertical example, not a limit on the core.

> **Reconciliation note (2026-08-14):** the product BOUNDARY doctrine in
> `docs/product/OPPORTUNITY_REALIZATION_LOCK_V1.md` ("never reducible to a
> job board / recruitment platform / …") does not conflict with this section:
> recruitment stays a core function; the boundary rule only says recruitment
> is not the boundary of the product. The "pirmas vertikalus pavyzdys"
> wording here is historical — the binding universal rule is constitution
> §7.1 (no sector priority constructs).

---

## 3. Pagrindinė formulė / The core formula

Profiliai + Įgūdžiai + Darbo įrodymai + Dokumentai + Prieinamumas +
Įmonių poreikiai + Projektai + Komandos + Matching + Komunikacija + AI
sprendimų pagalba + Auditas.

Centrinis klausimas: **„Kas yra TINKAMAS žmogus TINKAMAM darbui TINKAMU
laiku — IR KODĖL?"** Pasitikėjimas ateina iš „kodėl" — sistema turi
**paaiškinti** sprendimus, ne tik juos rodyti.

**EN:** The central question is *"who is the RIGHT person for the RIGHT
work at the RIGHT time — AND WHY?"* Trust comes from the *why*: the system
must explain decisions, not just display them.

---

## 4. Launch rinkos (9 prioritetinės) / Launch markets

LT, LV, EE, NL, DE, DK, NO, SE, PL — **visos vienodu prioritetu nuo
starto**. Visos trys Baltijos šalys (LT/LV/EE) kartu, plius Šiaurės
(DK/NO/SE) ir centrinė Europa (NL/DE/PL). Plėtra po pirmųjų 9 turi būti
greita ir be kliūčių — **architektūrinis reikalavimas**: naujos šalies
pridėjimas neturi reikalauti core schema migracijų ar UI perdarymo. Kita
Europa = expansion candidates (kontekstas žemėlapyje).

**EN:** Nine equal-priority launch markets (full Baltic + key Nordic +
NL/DE/PL). Adding a country after the first 9 must not need core schema
migrations or UI rework. Rest of Europe = expansion candidates.

---

## 5. Pamatiniai objektai (8) / Foundational objects

1. **Žmogus** — sistemos centras, ne CV, o gyvas darbo pasas.
2. **Įgūdis** — su 5 patvirtinimo lygiais (žr. §6).
3. **Darbo įrodymas** — ženklas, kad kažkas realiai padaryta.
4. **Darbo poreikis** — turtinga struktūra (kalbos, apgyvendinimas,
   transportas, komanda vs individas, dokumentai, kas priims sprendimą).
5. **Projektas** — vieta/užduotis (statyboj=objektas, gamyboj=pamaina,
   logistikoj=maršrutų ciklas, viešbutyje=sezoninis užimtumas, IT=produkto
   etapas).
6. **Komanda** — pirmos klasės objektas (brigados, montuotojai, pamainos,
   virtuvės komandos, IT produkto komandos).
7. **Įmonė** — darbdavys, rangovas, gamykla, viešbutis, agentūra,
   logistika, paslaugų įmonė, bet koks verslas.
8. **Agentūra** — kandidatų paruošimo ir pasiūlymo sistema, ne paprastas
   sąrašas.

**EN:** Eight foundational objects: Person, Skill, Work-evidence, Work-need
(rich), Project, Team (first-class), Company, Agency.

---

## 6. Įgūdžio patvirtinimo lygiai (5) / Skill verification levels

Pamatinis architektūrinis sprendimas: **visi įgūdžiai pažymimi vienu iš
lygių**. Niekada nesakoma „verified" jei nepatvirtinta.

1. Paties nurodyta (self-declared)
2. Darbo žurnalu pagrįsta (work-journal-backed)
3. Vadovo patvirtinta (manager-confirmed)
4. Kliento patvirtinta (client-confirmed)
5. Dokumentais pagrįsta (document-backed: sertifikatas, leidimas,
   pažymėjimas)

**EN:** Every skill carries exactly one of five verification levels:
self → work-journal → manager → client → document. Never label "verified"
unless it actually is.

---

## 7. Vaidmenys sistemoje (7) / Roles

1. Darbuotojas (`worker`)
2. Komandos vadovas / brigadininkas (`team_leader`)
3. Įmonės vadovas (`company_manager`)
4. HR / personalo žmogus (`hr_personnel`)
5. Agentūra (`agency`)
6. Administratorius (`admin`)
7. Klientas / užsakovas (`customer`) — B2C, užsako paslaugą, mato kas ją
   realiai teikia.

**EN:** Seven roles: worker, team_leader, company_manager, hr_personnel,
agency, admin, customer (B2C). See `docs/ROLES.md`.

> **Realizacijos būsena (owner sprendimas, 2026-06-10):** schemoje realizuotos
> rolės = `worker`, `company`, `agency`, `customer`, `admin` (fiksuotas RBAC
> rinkinys, doktrinos §5.2). `team_leader` ir `hr_personnel` — **future /
> vision only**: modeliuojamos kaip organizacijos pozicijos (§5.4) arba
> catalogue eilutės vėliau, ne kaip nauji RBAC įrašai. Jokių schema pakeitimų.
> **EN:** Realized roles in schema = worker/company/agency/customer/admin;
> team_leader + hr_personnel are future / vision only (org positions per §5.4),
> not new RBAC entries.

---

## 8. Sistemos moduliai (13) / System modules

1. Profilio modulis — vienas profesinės tapatybės centras
2. Įgūdžių modulis — su 5 patvirtinimo lygiais
3. Darbo žurnalo modulis — profesijai-specifiniai šablonai
4. Dokumentų modulis — leidimai, sertifikatai, galiojimo laikai
5. Projektų modulis — projektai, poreikiai, žmonės, rizikos
6. Komandų modulis — sudarymas, valdymas, vertinimas
7. Darbo poreikių modulis — turtinga struktūra
8. Kandidatų/matching modulis — su paaiškinimu („kodėl 82%")
9. Komunikacijos modulis — žinutės, užklausos, pranešimai
10. Sprendimų eilė (decision queue) — pirmos klasės UI, rangiruota pagal
    skubumą; ne tik sąrašas
11. Rinkos žvalgyba — išorinės įmonės, paklausos signalai, pardavimo
    galimybės
12. Analitikos modulis — trūkstami įgūdžiai, užimtumas, rizika
13. Mokymų ir augimo modulis — ką padaryti norint tikti darbui

**EN:** Thirteen modules — profile, skills, work-journal, documents,
projects, teams, work-needs, matching (explained), communication, decision
queue (first-class), market intelligence, analytics, training/growth.

---

## 9. AI agentai (6 tipai, M4+) / AI agents

Branduolio **neimplementuoti dabar — tik dokumentuoti**. AI sluoksnis
ateina **ANT** branduolio, ne kartu su juo.

1. Darbuotojų paieškos agentas — ieško rinkoje, paruošia sąrašą
2. Kandidatų tinkamumo agentas — lygina, paaiškina kodėl tinka
3. Dokumentų pasiruošimo agentas — patikrina trūkumus, sąrašai
4. Vadovo sprendimų agentas — sprendimų eilės operatorius
5. Rinkos stebėjimo agentas — kur trūksta įgūdžių, paklausa
6. Komunikacijos agentas — paruošia laiškus, **NESIUNČIA** be leidimo

**PAMATINĖ TAISYKLĖ:** AI padeda, BET rizikingi veiksmai patvirtinami
žmogaus. Niekada nemeluoja, neapsimeta, kad kažkas patvirtinta. NESIUNČIA
masinių laiškų be leidimo. NEKEIČIA dokumentų be leidimo. NEPRIIMA
darbuotojo be žmogaus sprendimo. NESUKURIA netikrų duomenų.

**EN:** Six agent types, documented only, delivered M4+ on top of the
core. Hard rule: AI assists; risky actions need human approval; AI never
lies, never fakes verification, never mass-sends or alters documents
without permission, never creates fake data.

---

## 10. Sąžiningumo principai / Honesty principles

- „Paties nurodyta" kai ne patvirtinta
- „Nepatikrinta" kai dokumentas ne patikrintas
- „Ruošiama" / „Dar neaktyvu" kai funkcija dar neveikia
- „AI pasiūlymas" kai tai tik pasiūlymas
- **Spalvos negali meluoti** — žalia tik kai realiai patvirtinta

Įgyvendinta per `content/placeholders.ts` ir `<Placeholder>` wrapper —
visi fake duomenys pažymėti dev/preview aplinkose, paslepiami produkcijoje.

**EN:** Honesty is enforced in code via the placeholder governance system
(`content/placeholders.ts` + `<Placeholder>`): colours never lie; nothing
says "verified"/"green" unless it truly is.

---

## 11. Darbo rinkos žemėlapis (sluoksniai) / The labour-market map

Žemėlapis nėra tik geografinis — tai **sluoksniuotas** vaizdas:

- Žmonių sluoksnis (kas kur, kas laisvas)
- Įgūdžių sluoksnis (kur trūksta, kur stiprybės)
- Projektų sluoksnis (kur dirbama, kur vėluoja)
- Dokumentų sluoksnis (kas pasiruošęs teisėtai)
- Prieinamumo sluoksnis (kas gali pradėti šiandien)
- Patikimumo sluoksnis (kas turi patvirtintų įrodymų)
- Kainos/ekonomikos sluoksnis (rinkos kainos, trūkumai)
- Rizikos sluoksnis (kur kandidatas netinka, kur vėlavimas)

**EN:** The map is layered, not merely geographic: people, skills,
projects, documents, availability, trust, price/economics, risk. The M0
LiveMap is the first visual seed of this.

---

## 12. 6 kūrimo etapai / Six build stages (→ roadmap)

- **Etapas 1 = M1:** aiški produkto šerdis — auth, profiles, `customer`
  role enum, profilio modulio pagrindas, įgūdžių sąrašas, dokumentų
  būsenos.
- **Etapas 2 = M2:** pirmas parduodamas įmonės valdymo ekranas —
  workforce + candidates + work needs + matching + work journals (statybų
  profesijos pirmiausia) + decision queue + teams as first-class entity.
- **Etapas 3 = M3:** darbo įrodymų branduolys + B2C customer marketplace
  (`service_requests`, `service_bookings`).
- **Etapas 4 = M4:** agentūros + išorinės paieškos + rinkos žvalgyba + AI
  operacinio sluoksnio pradžia (6 agentų tipai).
- **Etapas 5 = M5:** marketplace network effects, polish, legal, email.
- **Etapas 6+ = post-M5:** visa rinkos infrastruktūra, daugiau profesijų
  šeimų.

**EN:** Six stages map 1:1 to M1–M5+. See `docs/ROADMAP.md`.

---

## 13. Pirmas parduodamas produktas (M2) / First sellable product

Pavadinimas: **„Darbo jėgos valdymo ir greito darbuotojų radimo sistema
įmonei"**.

10 minimumo funkcijų: įmonės paskyra; darbuotojų/kandidatų profiliai;
įgūdžių sąrašas; dokumentų būsenos; darbo poreikio sukūrimas; kandidatų
tinkamumo sąrašas; work journal pagrindas; vadovo sprendimų eilė;
komunikacija; aiškūs trūkstami veiksmai.

Pardavimo žinutė: *„Padedame jūsų įmonei vienoje vietoje matyti
darbuotojus, kandidatus, įgūdžius, dokumentus ir trūkstamus žmones, kad
greičiau užpildytumėte projektus ir mažiau prarastumėte laiko atrankoje."*

**Niekada nesakyti** pirmame pirkimo pokalbyje: „Mes kuriame viso pasaulio
darbo rinkos AI operacinę sistemą" — per didelis pažadas.

**EN:** M2 ships a focused, sellable company workforce tool (10 minimum
functions). Pitch the concrete value, never the grand vision, in a first
sales conversation.

---

## 14. Klaidos, kurių vengti / Mistakes to avoid

1. Nedaryti tik paprasto dashboardo (reikia operacinės logikos).
2. Nesukurti dublių (vienas CV, vienas profilis, vienas žurnalas).
3. Nežadėti to, kas neveikia (sąžiningumas > polish).
4. Neapkrauti darbuotojo (paprastumas = adopcijos sąlyga).
5. Nepamiršti verslo sprendimo (gražus vaizdas nepakanka).
6. Neduoti AI per daug laisvės (žmogaus patvirtinimas privalomas).

**EN:** Avoid: a mere dashboard; duplicate records; promising what doesn't
work; overloading the worker; forgetting the business decision; giving AI
too much autonomy.

---

## 15. Pažadai pagal vaidmenį / Promises per role

- **Darbuotojui:** „Padėsime aiškiai parodyti tavo vertę ir rasti
  tinkamesnį darbą."
- **Įmonei:** „Padėsime greičiau rasti, patikrinti ir valdyti reikalingus
  žmones."
- **Agentūrai:** „Padėsime profesionaliai paruošti kandidatus ir greičiau
  juos pasiūlyti klientams."
- **Vadovui:** „Padėsime matyti, kas vyksta, ko trūksta ir ką reikia
  nuspręsti dabar."
- **Rinkai:** „Padėsime darbo informaciją padaryti aiškesnę, patikimesnę
  ir naudingesnę."

**EN:** One honest promise per audience: worker (show your value), company
(find/verify/manage faster), agency (prepare & place candidates), manager
(see and decide now), market (clearer, more trustworthy work data).
