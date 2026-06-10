# HANDOFF — Phase 3.2: Human-Run Matching Workbench + Conflict Resolutions + Hygiene

**Repo:** `bandymuks1-stack/labourmarketai`
**Lokalus kelias:** `C:\Users\Mano\Documents\labourmarketai` (NENAUDOTI seno `C:\Users\Mano\Documents\labourmarket.ai`)
**Branch:** `feat/cc/phase3-matching-workbench`
**Tier:** GREEN kodas/docs. Jei prireiks DB pakeitimų — migracija TIK kaip draft failas, NETAIKOMA (žr. Migracijų protokolą).
**Pamatas:** PR #284 (canonical product overview doc) merged; Phase 3.1 demand intake LIVE; Phase 1–2 verified proof loop LIVE.

---

## GALUTINIS TIKSLAS

Pastatyti Marketplace v1 širdį pagal `docs/product/labourmarketai-full-product-overview-and-implementation-plan.md` §8: **žmogaus vykdomas matching**. Vadovas/owner turi galėti viename lange matyti atvirus poreikius (`customer_requests`) šalia turimų verified darbuotojų, žmogaus sprendimu juos sujungti ir užfiksuoti rezultatą su feedback pastaba. Tai paskutinis inžinerinis gabalas, kurio reikia, kad pirmas realus klientas galėtų pereiti pilną kelią: poreikis → žmogaus match → realus darbas → journal → verified proof → feedback.

Tai NĖRA automatinis matching (M4+), NĖRA TASK 07 galutinis UI (MAP→ARENA→DRAFT laukia vizualinio užrakto) ir NĖRA nauja duomenų sritis. Tai funkcinis, sąžiningas, low-fidelity darbastalis ant esamo kanoninio modelio, kurį TASK 07 vėliau aprengs.

---

## ŽINGSNIS 0 — PRIVALOMAS, BLOKUOJANTIS

```bash
pwd
git status --short
git branch --show-current
```

Perskaityti (visi yra `docs/`): `PROJECT_VISION.md`, `PROJECT_ROADMAP.md`, `PLATFORM_DOCTRINE.md`, `PHASE3_first_customer_plan.md`, `product/labourmarketai-full-product-overview-and-implementation-plan.md` (ypač §3, §8, §20, §21), `audits/product-overview-human-first-audit-v1.md`. Konfliktai — į PR aprašymą, nespręsti tyliai.

---

## OWNER DEFAULT DECISIONS — AUTONOMIJOS VOKAS (galioja visam sprintui)

Nesustoti ir nelaukti owner dėl pricing, teisininko peržiūros, outreach siuntimo ar TASK 07 vizualinio užrakto. Naudoti šiuos default sprendimus ir tęsti visą saugų GREEN darbą automatiškai.

**1. Pricing:** tik saugus placeholder. Jokio payments, checkout, subscriptions, billing aktyvavimo. Leistina vieša formuluotė: „Early access pricing available on request" / „Custom quote" / jokios fiksuotos viešos kainos iki owner patvirtinimo. (Žodis „pilot" viešoje copy nenaudojamas — Realumo principas, žr. Dalis A.6.) Jei iškyla pricing konfliktas — rinktis manual_quote / contact_sales ir tęsti, neblokuoti.

**2. Teisiniai dokumentai:** neskelbti teisinio patvirtinimo, nefinalizuoti dokumentų kaip lawyer-reviewed. Leistina: legal-review checklist, lawyer-review paketas, sekcijų žymėjimas „requires lawyer review before use". Produkto darbas tęsiamas be legal final approval. Sutarties kaip galutinės nesiųsti ir neskelbti.

**3. Outreach laiškas LT statybų įmonei:** NESIŲSTI outbound email automatiškai, nebent repo/runtime instrukcijose jau yra tikslus gavėjas + galutinis tekstas + aiškus send leidimas. Leistina: galutinis draft, gavėjo checklist, send-ready paketas; jei gegužės 30 medžiaga yra repo — surasti ir susumuoti. Jei send leidimo nėra — tęsti visą kitą darbą ir raportuoti „outreach send blocked — approval needed".

**4. TASK 07:** galutinio UI nepradėti. Leistina: low-fidelity preview, vizualinės krypties dokumentavimas, žymos „preview, to be replaced by TASK 07". Jei reikia vizualinio sprendimo — rinktis low-fidelity preview ir tęsti.

**5. Šeši konfliktai (Dalis A):** jei konfliktas nedestruktyvus ir išsprendžiamas saugiausiu doktrinai suderinamu variantu — rinktis konservatyvų variantą ir tęsti. Prioritetai: esama repo doktrina laimi → jokių DB migracijų → jokių naujų lentelių → jokių fake claims → jokios hardcoded copy → Phase 3 prieš didelį marketplace → preview prieš galutinį TASK 07 UI.

**6. Autonomijos taisyklė:** automatiškai pereiti per visą grandinę: handoff → Žingsnis 0 → darbas → doc-only commit kur taikoma → saugus GREEN UI/guard scope → validacija → PR → merge jei green → deploy jei saugu → smoke. Telegram statusas po kiekvieno didelio žingsnio.

**HARD BLOCKERS — vieninteliai sustojimo atvejai:** DB migracijos taikymas, naujos lentelės, secrets/env, DNS, billing/payment, production config keitimas, teisinis finalizavimas, realus outbound siuntimas be aiškaus leidimo, galutinis TASK 07 UI be owner vizualinio užrakto. Tik šiais atvejais stop + raportas; visa kita — tęsti.

---

## DALIS A — 6 KONFLIKTŲ SPRENDIMAI (owner patvirtinti šiuo handoff)

1. **Roles (VISION 7 vs schema 5):** schema laimi. VISION atnaujinti: realizuotos rolės = esamos schemoje; papildomos VISION rolės pažymimos `future / vision only`. Jokių schema pakeitimų.
2. **CLAUDE.md Sample/Demo marker pastaba vs doktrinos §18:** CLAUDE.md atnaujinti pagal doktriną — demo framing pašalinti, suderinti su „demo" guard testu.
3. **TASK 07 vieta vs ROADMAP Phases 4–5:** seka užrakinta owner sprendimu: Phase 3 → TASK 07 → M4+. ROADMAP atnaujinti, kad tai būtų parašyta tiesiogiai.
4. **Doktrinos §13 kabantis pricing reference:** parengti §13 (monetization) JUODRAŠTĮ kaip pasiūlymą PR aprašyme ir atskirame `docs/proposals/doctrine-13-monetization-draft.md`. Doktrinos failo NEKEISTI be owner patvirtinimo — doktrina yra binding dokumentas.
5. **Pasenęs SCHEMA_INVENTORY.md:** regeneruoti iš esamų migracijų/types, įrašyti generavimo datą ir šaltinį. Prie DB nesijungti — tik repo artefaktai.
6. **Likę „pilot" identifikatoriai:** pervadinti kodo lygio identifikatorius (komponentai, kintamieji, route'ai) pagal Realumo principą. DB objektų (pvz. `pilot_drafts` lentelės) NEPERVADINTI — tai migracija, ne šio sprinto scope; lentelė lieka dormant kaip yra.

Jei kuris sprendimas konfliktuoja su tuo, ką rasi repo — taikyti autonomijos voko taisyklę Nr. 5: rinktis konservatyvų, doktrinai suderinamą variantą ir tęsti, konfliktą aprašant PR aprašyme. Stop tik jei sprendimas reikalautų hard blocker veiksmo.

## DALIS B — HIGIENA IR PATIKROS

- Patikrinti, ar `handoff_dark_role_switcher.md` (baltas popup / native select Žurnalas ekrane) buvo įgyvendintas; jei ne — sutvarkyti šiame sprinte (GREEN, UI-only).
- Patikrinti ir į FINAL REPORT įrašyti: repo „Allow auto-merge" nustatymo būseną (PR #284 metu buvo išjungtas — prieštarauja PR #154 envelope); kas siunčia Telegram pranešimus ir kur tai sukonfigūruota (failas/workflow); ar `app.labourmarket.ai` rodo tą patį deployment kaip `labourmarketai.vercel.app`.
- Deploy taisyklės užfiksavimas: į `docs/PLATFORM_DOCTRINE.md` NIEKO nerašyti, bet PR aprašyme pasiūlyti formuluotę owner sprendimui: „GREEN merge į main reiškia automatinį Vercel production deploy — tai sąmoninga pipeline savybė" ARBA alternatyvą su deploy gate.

## DALIS C — MATCHING WORKBENCH (pagrindinis deliverable)

**Kas tai:** vadovo/owner ekranas (web, mobile-first), kuriame:

1. **Demand pusė:** atviros `customer_requests` (submitted būsenos) — profesija, šalis/miestas, data, trukmė, urgency, kalbos, biudžetas jei yra. Tik laukai, kurie realiai egzistuoja `payload`/stulpeliuose — nieko neišgalvoti.
2. **Supply pusė:** darbuotojai su jų profesijomis, skills (su declared / evidence / confirmed žymomis — NIEKADA nerodyti „verified" be įrodymo), availability jei modelyje yra, verified Work Proof skaičiumi. Default-closed visibility gerbiama: rodomi tik tie, kuriuos žiūrintysis turi teisę matyti pagal esamą RLS/engagement logiką.
3. **Žmogaus match veiksmas:** žiūrintysis sujungia poreikį su darbuotoju/komanda. Match'as = žmogaus sprendimas, UI tai sako tiesiai („match parinktas žmogaus, ne algoritmo").
4. **Feedback pastaba:** prie kiekvieno match — laisvo teksto pastaba (kas tiko, ko trūko). Tai Phase 3.6 feedback kilpos pradžia.

**Duomenų taisyklė (griežta):** match ir feedback įrašai PIRMIAUSIA žemėlapinami į esamą kanoninį modelį (`customer_requests` būsenos/payload, `engagement_contexts`, esamos lentelės). Jei sąžiningai neįmanoma be naujos struktūros — parengti migracijos draft failą `supabase/migrations/` formatu `YYYYMMDDHHMMSS_snake_case.sql`, PR pažymėti `needs-human-gate`, migracijos NETAIKYTI niekaip (jokio db push, jokio apply). Owner + Chat Claude pritaikys per Supabase MCP `apply_migration` po peržiūros, tada Claude Code tęs UI dalį. Iki tol UI gali veikti read-only režimu be match įrašymo.

**UI lygis:** low-fidelity, esami design tokens, „bus pakeistas TASK 07" žyma. Funkcija > grožis. Jokio MAP→ARENA→DRAFT — tai TASK 07.

**Lokalizacija:** visa copy per slug→JSON, visos 10 locale failų. Jokių hardcoded tekstų. „Demo" guard testas privalo praeiti.

---

## NELEIDŽIAMA

Galioja visas ankstesnio handoff NELEIDŽIAMA sąrašas, plius:
- Jokio automatinio matching, scoring ar AI siūlymų — tik žmogaus sprendimas.
- Jokio migracijos taikymo bet kokiu būdu (draft failas — vienintelė leistina forma).
- Jokio doktrinos failo keitimo (tik proposals).
- Jokio TASK 07 lygio UI.
- Jokių naujų vision-only sričių (accommodation, compliance ir kt.) backend'o.

## VALIDACIJA

typecheck, lint, build, visi testai (įsk. „demo" guard), CI `quality` + `migration-safety`. Route smoke naujam workbench ekranui LT ir EN locale. Responsive patikra mobile.

## FINAL REPORT

Branch, commit SHA, PR nuoroda; ar buvo migracijos draft (jei taip — kelias ir kodėl esamo modelio neužteko); Dalies A 6 sprendimų statusas; Dalies B patikrų atsakymai (auto-merge, Telegram, custom domain, popup fix); workbench ekrano kelias ir ką jis rodo; kas liko; safety patvirtinimai (migracijos taikytos NE, doktrina keista NE, senas repo NE, fake duomenys NE).
