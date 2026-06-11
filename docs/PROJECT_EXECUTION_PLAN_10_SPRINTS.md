# HANDOFF — Labourmarket.ai 10 sprintų vykdymo programa (iki pilnos vizijos)

**Repo:** `bandymuks1-stack/labourmarketai` · **Lokalus kelias:** `C:\Users\Mano\Documents\labourmarketai`
**Šaltinis:** owner produkto schema (2026-06-10) + `docs/product/labourmarketai-full-product-overview-and-implementation-plan.md` + doktrina
**Galioja:** OWNER DEFAULT DECISIONS autonomijos vokas (iš `docs/handoffs/HANDOFF_phase3_matching_workbench.md`) visiems sprintams
**Pirmas veiksmas:** commitinti šį failą kaip `docs/PROJECT_EXECUTION_PLAN_10_SPRINTS.md` (doc-only commit), cross-link iš ROADMAP

---

## PROGRAMOS LOGIKA

Owner schema patvirtina kanoną ir išryškina seką: pirma realūs duomenys (matching, taksonomija, dokumentai, trust), tada vizualas (TASK 07, gyva rinka, command center), tada AI. Kiekvienas sprintas = atskiras branch `feat/cc/*`, atskiras PR, GREEN tier, validacija, merge jei green. Claude Code kiekvieno sprinto viduje bėga autonomiškai be sustojimo; sustoja TIK ties pažymėtais VARTAIS (hard blockers): migracijų taikymas, secrets/env, TASK 07 vizualinis užraktas, realus outbound siuntimas. Ties vartais — needs-human-gate + Telegram statusas + tęsiamas visas kitas įmanomas darbas.

Kiekvienam sprintui (S3–S10) prieš startą Chat Claude parengia detalų handoff pagal nusistovėjusį formatą; šis dokumentas — programos žemėlapis, ne detalių pakaitalas.

---

## SPRINTAI

### S1 — Phase 3.2: Human-Run Matching Workbench *(handoff jau išduotas)*
`customer_requests` šalia verified darbuotojų, žmogaus match, feedback pastaba. Schema §11 „Phase 3 — dabar" branduolys.
**VARTAI:** galimas match-įrašo migracijos draft → owner + MCP apply.

### S2 — ESCO taksonomijos pamatas *(handoff jau išduotas)*
Universali profesijų/įgūdžių taksonomija 9 rinkų kalbomis, deterministinis autocomplete, candidate-skills schema, LLM sluoksnio dizainas (tik dizainas).
**VARTAI:** taksonomijos migracijos + importas → owner + MCP apply.

### S3 — Dokumentai ir Readiness variklis v1
Schema §3 „Dokumentai" + §10: dokumentų tipai (CV, A1, sutartis, posted worker package, sertifikatai, ID), statusai missing/ready/expiring/blocked, galiojimo datos, append-only audit (doktrinos §3), šalies reikalavimų struktūra 9 rinkoms (Belgium = future), readiness skaičiavimas iš dokumentų + availability. Žmogui — paprastas „ko trūksta į Olandiją" vaizdas, ne popierių lentyna.
**VARTAI:** dokumentų domeno migracijos (papildomai: storage minimalizmo doktrinos §6 laikymasis — metaduomenys, ne failų kaupimas be reikalo).

### S4 — Trust ir Visibility sluoksnis v1
Schema §3 trust grandinė: evidence→trust, feedback→trust, trust→marketplace matomumas. Default-closed (§4): matomumo taisyklės iš readiness + trust + žmogaus sutikimo. Sąžiningos žymos — jokio „verified" be įrodymo, jokio skaitinio fake score.
**VARTAI:** galimos trust-signalų migracijos.

### S5 — Agency Worker Pool v1
Schema §5: agentūra valdo savo pool (per esamą `organizations`/`engagement_contexts` modelį — jokių paralelių), darbuotojų parengties apžvalga, pozicionavimas į demand, visibility control, komercinis saugumas. Bulk upload lieka `vision only`.
**VARTAI:** tik jei esamo modelio neužtenka — migracijos draft.

### S6 — Marketplace v1 konsolidacija
Schema §6: S1 workbench + S2 kanoniniai ID + S3 readiness + S4 trust + S5 agency supply = pilnas Marketplace v1. Filtrai: profesija, šalis, dokumentai, availability, rate fit. Match card su next action. Atsako „kas realiai gali dirbti", ne „kas yra sąraše". Žmogaus sprendimas išlieka centre.
**VARTAI:** paprastai jokių — kompozicija ant S1–S5.

### S7 — TASK 07: Living-Arena UI
**STARTO VARTAI: owner vizualinis užraktas — be jo sprintas nestartuoja.** Worker cockpit (ikona→vieta→laiko ratukas→reward), manager MAP→ARENA→DRAFT, FIFA kortelių galutinis vaizdas, marketplace arena, termometro formulė ((pozicijos vidurkis projekte + admin rinkos vidurkis)/2), atidėti manager team/worker/task views. Visi S1–S6 funkciniai ekranai aprengiami galutine estetika.

### S8 — Gyva darbo rinkos vizualizacija v1
Schema §7: realūs signalai iš S3 (dokumentų spragos), S4 (trust), S6 (demand/supply/aktyvumas) → šalių žemėlapis, profesijų paklausa, telkiniai, urgent needs, risk zones, rate heat. Kur duomenų maža — `preview` / `not live yet`, niekada fake live. TASK 07 estetika.

### S9 — Asmeninis Command Center v1
Schema §8 + §12: role-aware kortelės (mano profilis/dokumentai/readiness/pasiūlymai/rizikos/kiti veiksmai), „kitas veiksmas" variklis (vakar nepažymėta diena? A1 baigiasi po 14 d.?), mobile bottom nav, desktop command center, perstatomi blokai (saved layout, hide/show). Protingi defaults, progressive disclosure.

### S10 — AI sluoksnis, pirmas gabalas (M4+ pradžia)
Schema §9 ribose: LLM skill-mapping pipeline (ESCO Etapas 2), įgūdžių ištraukimas iš CV → Level 0, trūkstamų dokumentų paaiškinimas, match pasiūlymai su aiškia „suggestion" žyma. AI-never-lies guard'ai kode. Tik ant realių S1–S6 duomenų.
**STARTO VARTAI: owner sprendimas dėl LLM providerio, biudžeto, API raktų (secrets).**

---

## LYGIAGREČIOS LINIJOS (ne Claude Code)

- **Realus pirmas klientas (owner):** kainodara, teisininko peržiūra, outreach siuntimas — kliento feedback nuo S1 maitina S3–S6 prioritetus.
- **Doktrinos v1.1 (owner + Chat Claude):** §1.1, §10–14 patvirtinimas; §13 juodraštis jau ruošiamas S1.
- **TASK 07 vizualinis užraktas (owner):** reikalingas iki S7; FUT prototipas outputs nuo 05-30.

## TAISYKLĖS VISIEMS SPRINTAMS

Kanoninis modelis be paralelių · migracijos tik draft + needs-human-gate + MCP apply · GREEN tier, CI quality + migration-safety · slug→JSON visa copy, 10 locale · „demo" guard · default-closed · AI-never-lies · universal OS, ne construction-only · recruitment = core pillar · 9 rinkos lygia teise · Telegram statusas po didelio žingsnio · FINAL REPORT po kiekvieno sprinto pagal nusistovėjusią formą.

## VYKDYMO KOMANDA DABAR

1. Commitinti šį planą kaip `docs/PROJECT_EXECUTION_PLAN_10_SPRINTS.md` (doc-only).
2. Vykdyti S1 handoff (`docs/handoffs/HANDOFF_phase3_matching_workbench.md`) iki galo.
3. Po S1 merge — be pauzės vykdyti S2 handoff (`docs/handoffs/HANDOFF_esco_taxonomy_skill_recognition.md`) iki migracijų vartų.
4. Ties kiekvienais vartais: needs-human-gate + Telegram + tęsti visą kitą įmanomą darbą.
5. S3+ — laukti atskiro handoff iš Chat Claude (programos žemėlapis nepakeičia detalaus spec).
