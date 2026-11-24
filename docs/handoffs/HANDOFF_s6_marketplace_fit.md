# HANDOFF — S6: Marketplace konsolidacija + Atitiktis pagal §19

**Repo:** `bandymuks1-stack/labourmarketai` · **Branch:** `feat/cc/s6-marketplace-fit`
**Tier:** kodas/docs GREEN; DB = DRAFT iki vartų. Galioja OWNER DEFAULT DECISIONS vokas. DESIGN_SOUL + §19 privalomi; fit-not-rating guard privalo likti žalias visą sprintą.
**Vieta programoje:** S6 — paskutinis duomenų branduolio sprintas. Po jo lieka S8/S9 likučiai (poliravimas) ir S10 (AI, owner-gated).

## GALUTINIS TIKSLAS
Marketplace atsako į klausimą „kas realiai gali padaryti ŠITĄ darbą" — per kontekstinę atitiktį, ne per žmonių reitingą (doktrinos §19). Fit = |Y∩C|/|Y| per ESCO kanoninius ID: poreikio įgūdžių aibė Y prieš subjekto aibę C, visada su pagrindu („atitinka 95%: 19 iš 20, iš jų 14 patvirtinti"), visada skaičiuojama skaitymo metu, NIEKADA nesaugoma. Sprendimas lieka žmogaus — fit yra žibintas, ne teisėjas.

## ŽINGSNIS 0 — standartiniai šaltiniai + `docs/product/s6-matching-fit-spec-note.md` + inventorizacija: kaip šiandien demand aprašo poreikį (role_or_work_type = laisvas tekstas be profesijos FK — tai pagrindinė spraga), kur gyvena subjekto C aibė (worker_skills + verified flag, profession_skills grafas, ESCO refs), kokie filtrai jau yra workbench/draft board.

## SCOPE
1. **Demand → ESCO tiltas (DRAFT + gate):** customer_requests gauna galimybę neštis struktūruotą poreikį — profession ref + reikalaujamų įgūdžių aibė (ESCO ID). Additive (payload arba stulpeliai — spręsk pagal esamą šabloną), seniems request'ams NIEKO neišgalvojama (be struktūros = fit nerodomas, sąžininga „poreikis dar nestruktūruotas" būsena + vieno paspaudimo kelias admin'ui jį struktūruoti per ESCO typeahead). Intake forma naujiems — profesijos/įgūdžių pasirinkimas per esamą EscoTypeahead.
2. **Fit servisas (be DB):** skaičiavimas skaitymo metu — |Y∩C|/|Y|, atskirai bendras % ir patvirtintų dalis; deterministinis, paaiškinamas, su pilnu pagrindo objektu (kurie įgūdžiai atitiko, kurie trūksta, kurie patvirtinti). Jokio persistinimo, jokio cache lentelėse.
3. **Fit rodymas workbench + draft board:** kontekstinis % prie kiekvieno kandidato KONKREČIAM poreikiui su pagrindu ir trūkstamų įgūdžių sąrašu; rikiavimas pagal fit leidžiamas TIK poreikio kontekste (tai atitikties, ne žmogaus rikiavimas); žmogaus-match taisyklė ir no-global-scoring guard'ai nepaliesti.
4. **Marketplace filtrai:** readiness (S3 agregatai), patvirtintų proof skaičius, availability, šalis, profesija — visi faktiniai, paaiškinami, be juodųjų dėžių.
5. **Darbuotojo sutikimo jungiklis (DRAFT + gate, S5 likutis):** worker-level consent, leidžiantis agentūrai matyti jo dokumentų parengties AGREGATUS (kategorijos lygiu, niekada turinio). Default = išjungta (§4). UI darbuotojo erdvėje su aiškiu paaiškinimu, ką tiksliai pamatys agentūra.
6. **Agency offers matomumas workbench'e:** admin mato „galim pasiūlyti" žymas prie request'ų (payload.agency_offers skaitymas) — pasiūlymas matomas šalia fit, sprendimas žmogaus.

## NELEIDŽIAMA — standartai + vokas, plius: jokio fit persistinimo; jokio fit be pagrindo objekto; jokio rikiavimo pagal fit už poreikio konteksto ribų; seniems request'ams jokio išgalvoto struktūrinimo; sutikimo jungiklis default-off; fit-not-rating žalias.

## VALIDACIJA — standartinė + guard'ai: fit deterministinis (tas pats input = tas pats %), pagrindo objektas pilnas, nestruktūruotas poreikis = jokio %, consent-off = agentūra agregatų nemato.

## FINAL REPORT — standartinė forma + migracijų draft sąrašas (tikėtina 2: demand struktūra + consent jungiklis) review failui, fit formulės įgyvendinimo aprašymas su pavyzdžiu, kas liko S8/S9 poliravimui.
