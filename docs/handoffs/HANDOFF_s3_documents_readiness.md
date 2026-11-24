# HANDOFF — S3: Dokumentai ir Readiness variklis v1

**Repo:** `bandymuks1-stack/labourmarketai` · **Branch:** `feat/cc/s3-documents-readiness`
**Tier:** kodas/docs GREEN; DB = migracijų DRAFT iki vartų (kaip S2). Galioja OWNER DEFAULT DECISIONS autonomijos vokas.
**Vieta programoje:** S3 iš `docs/PROJECT_EXECUTION_PLAN_10_SPRINTS.md`. Vykdyti po S2 darbo iki vartų.

## GALUTINIS TIKSLAS
Dokumentai = readiness variklis, ne popierių lentyna (owner schema §3): sistema žino, kokių dokumentų žmogui trūksta į konkrečią šalį, kada jie baigiasi, ir paverčia tai paprastu vaizdu „ką turi / ko trūksta / ką daryti toliau". Tai kritinė posted-worker grandis visoms 9 rinkoms ir tiesioginis maitinimas S4 (trust/visibility) bei S6 (marketplace filtrai).

## ŽINGSNIS 0 — PRIVALOMAS
Standartiniai šaltiniai + PRIVALOMA esamų primityvų inventorizacija PRIEŠ bet kokį dizainą: `upsert_worker_readiness_item` RPC (project-scoped readiness jau egzistuoja!), `register_customer_request_attachment`, storage buckets, bet kokios documents/attachments lentelės. Kanono taisyklė: PLĖSTI esamą, ne statyti paralelę. Jei esamas readiness modelis tinka kaip pagrindas — naudoti jį.

## SCOPE
1. **Dizaino dokumentas** `docs/product/documents-readiness-design.md`: dokumentų tipų registras (CV, A1, employment contract, posted worker package, sertifikatai, ID); statusai missing/ready/expiring/blocked; galiojimo datos; šalies reikalavimų struktūra (9 launch rinkos; Belgium=future; NL Wadi kaip informacinis pavyzdys); worker readiness skaičiavimas šaliai X; append-only audit (doktrinos §3); storage minimalizmas (§6: metaduomenys pirmiausia, failai default-closed bucket'uose, jokio kaupimo be reikalo).
2. **Migracijų DRAFT failai** (NETAIKYTI, needs-human-gate): additive only, jokių DROP, RLS default-closed, rašymas tik per SECURITY DEFINER RPC su `set search_path` (pagal SECURITY_HARDENING standartą) ir explicit grant tik authenticated.
3. **UI low-fidelity** už feature flag: worker „Mano dokumentai" (statusai + „ko trūksta į [šalis]" + kitas veiksmas), „bus pakeista TASK 07" žyma. Visa copy slug→JSON, 10 locale.
4. **Sąžiningumo riba:** jokių teisinių garantijų copy — formuluotės tipo „pagal viešai skelbiamus reikalavimus; galutinį atitikimą tikrina institucijos/teisininkas". Jokio fake compliance „verified".

## NELEIDŽIAMA
Ankstesni sąrašai + vokas, plius: jokio failų turinio skenavimo/AI (M4+); jokio scam-risk/payment (vision only); šalių reikalavimų turinys = struktūra + aiškiai pažymėti placeholder/„needs legal source" įrašai, ne išgalvoti teisiniai faktai.

## VALIDACIJA + FINAL REPORT — standartinė forma (kaip S1/S2), atskirai: esamų primityvų inventorizacijos išvada (ką perpanaudojom), migracijų draft sąrašas, flag būsena, kas laukia vartų.
