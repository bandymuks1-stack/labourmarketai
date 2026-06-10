# HANDOFF — ESCO Taxonomy Backbone + Skill Recognition Pipeline (tikslesnis vidinis CV)

**Repo:** `bandymuks1-stack/labourmarketai`
**Lokalus kelias:** `C:\Users\Mano\Documents\labourmarketai` (NENAUDOTI seno `C:\Users\Mano\Documents\labourmarket.ai`)
**Branch:** `feat/cc/esco-taxonomy-foundation`
**Tier:** kodas/docs GREEN; DB pakeitimai = migracijų DRAFT failai, NETAIKOMI (hard blocker protokolas žemiau)
**Kada vykdyti:** PO Phase 3.2 matching workbench sprinto pabaigos (main = viena švari linija)

---

## GALUTINIS TIKSLAS

Pakeisti dabartinę 18 įrašų statybos profesijų lentelę pilnu universaliu taksonomijos stuburu ir pastatyti atpažinimo grandinę, kuri leidžia sistemai suprasti VISKĄ, ką žmogus įrašo — profesijas, įgūdžius, darbus, veiklas — bet kuria iš 9 rinkų kalbų, ir iš to formuoti tikslų vidinį asmens CV.

Destinacija: darbuotojas žurnale ar profilyje rašo savais žodžiais („klojam plyteles", „moku armatūrą rišt"), o sistema viduje laiko kanoninį ESCO ID. Olandų įmonės poreikis ir lietuvio darbuotojo įgūdis susitinka per tą patį ID — tai matching'o gyvybinis pagrindas visoms 9 rinkoms ir visiems sektoriams (universali OS, ne construction-only). Žmogui visada rodomi JO žodžiai; kanonas — vidinis sluoksnis (human-first §3: vidiniai duomenų taškai nematomi, rezultatas paprastas).

**GELEŽINĖ RIBA (doktrinos §7 + Realumo principas):** taksonomija sako *kas tai per įgūdis*; įrodymai sako *ar žmogus jį tikrai turi*. ESCO atpažinimas NIEKADA nekelia verified lygio ir NIEKADA nekuria „verified" žymos. Atpažintas įgūdis = self-declared (Level 0). Kilimas — tik per manager-confirmed journal → Work Proof grandinę. LLM mapping'as yra vertimas į kanoną, ne tiesos kūrimas.

---

## ŽINGSNIS 0 — PRIVALOMAS, BLOKUOJANTIS

Perskaityti: `docs/PROJECT_VISION.md`, `docs/PROJECT_ROADMAP.md`, `docs/PLATFORM_DOCTRINE.md` (ypač §2 vertimai, §7 AI-never-lies), `docs/product/labourmarketai-full-product-overview-and-implementation-plan.md` (§3, §4, §14, §19), esamą professions/skills schemą (migracijos + types), SCHEMA_INVENTORY.md. Konfliktai — konservatyvus doktrinai suderinamas variantas + PR aprašymas; stop tik hard blocker atveju.

ESCO šaltinis: https://esco.ec.europa.eu — atsisiunčiami CSV rinkiniai, nemokama naudoti su atribucija (ES licencija). Reikalingos kalbos: LT, LV, ET, NL, DE, DA, NO, SV, PL + EN. Patikrinti aktualią ESCO versiją ir kalbų prieinamumą; jei kurios kalbos rinkinyje nėra — pažymėti FINAL REPORT, nekurti savų vertimų.

---

## ETAPAI

### ETAPAS 1 — Taksonomijos pamatas (šis sprintas)

**1A. Dizaino dokumentas:** `docs/product/esco-taxonomy-design.md` — kaip ESCO occupations žemėlapinasi į esamą `professions` modelį (pirmos klasės entitetas, extensible — NEGRIAUTI, plėsti: esamos 18 profesijų gauna ESCO atitikmenis arba lieka kaip custom įrašai), kaip ESCO skills jungiasi su profession-scoped skills modeliu, kaip saugomi multilingual labels (suderinti su doktrinos §2 — pasiūlyti sprendimą: taksonomijos labels kaip platform content; konkretus variantas PR aprašyme owner peržiūrai), candidate-skill būsenos modelis.

**1B. Migracijų DRAFT failai** (`supabase/migrations/YYYYMMDDHHMMSS_*.sql`, NETAIKYTI): taksonomijos lentelės (occupations, skills, occupation–skill ryšiai, multilingual labels), esamų `professions`/skills lentelių plėtiniai ESCO nuorodoms (additive only, jokių DROP), `candidate_skills` lentelė (original_text, original_language, mention_count, status: candidate → approved/rejected). PR žymėti `needs-human-gate`. Owner + Chat Claude pritaikys per Supabase MCP `apply_migration`.

**1C. Import tooling:** skriptas (repo `scripts/` arba `tools/`), kuris iš ESCO CSV užpildo taksonomijos lenteles visomis turimomis kalbomis. Paruoštas paleisti PO migracijų pritaikymo. Idempotentiškas (galima leisti pakartotinai ESCO versijos atnaujinimui). ESCO atribucijos eilutė įrašoma docs ir UI footer plane.

**1D. Deterministinis atpažinimas be LLM:** autocomplete/typeahead įgūdžių ir profesijų įvedimo vietose (profilis, onboarding, žurnalas) prieš taksonomiją žiūrinčiojo kalba. Tai jau dabar duoda tikslesnį vidinį CV be jokio AI — struktūruota įvestis vietoj laisvo teksto, kur žmogus pats pasirenka. Feature flag, įjungiamas po migracijų + importo. Visa copy slug→JSON.

### ETAPAS 2 — LLM mapping sluoksnis (ATSKIRAS, GATED — nepradėti be owner)

Laisvo teksto (žurnalo įrašai, CV importas, profilio tekstas) → kanoninis ESCO ID per LLM. Šiame sprinte: TIK architektūros pasiūlymas dizaino dokumente (kur gyvena servisas, kokie kaštai, koks provideris, kaip saugomi originalai). NEDIEGTI: LLM API raktai = secrets/env = hard blocker. Owner spręs providerį ir biudžetą atskirai.

### ETAPAS 3 — Augimo kontūras (po Etapo 2)

Neatpažinta įvestis → `candidate_skills` įrašas → N nepriklausomų paminėjimų → owner patvirtinimo eilė (admin view) → kanoninis įrašas. Šiame sprinte tik schema (1B) ir dizainas; UI eilė — vėlesnis slice.

---

## KAIP TAI MAITINA VIDINĮ CV

Vidinis CV = esamos grandinės produktas, dabar su kanonu: profilio įgūdžiai (ESCO ID + žmogaus originalus tekstas) → CV importas seed'ina Level 0 → žurnalo įrašai atpažįstami prieš taksonomiją → manager confirm kelia verified lygį → CV rodo, kas self-declared / evidence / confirmed, žiūrinčiojo kalba. Jokios naujos CV struktūros nekurti — naudoti esamą profilio/skills/proof modelį, tik praturtintą kanoniniais ID.

---

## NELEIDŽIAMA

Galioja ankstesnių handoff NELEIDŽIAMA + autonomijos vokas, plius:
- Jokio migracijų taikymo (tik draft + needs-human-gate).
- Jokio LLM diegimo, API raktų, env keitimo (Etapas 2 = tik dizainas).
- Jokio auto-verified iš taksonomijos atpažinimo — atpažinimas visada Level 0 self-declared.
- Jokio esamų professions/skills duomenų trynimo ar DROP — tik additive plėtiniai.
- Originalus žmogaus tekstas visada saugomas (`original_text` + `original_language`) — kanonas jo nepakeičia.
- Jokių savadarbių vertimų ten, kur ESCO kalbos trūksta — pažymėti spragą.
- ESCO naudojimas be atribucijos.

## VALIDACIJA

typecheck, lint, build, visi testai (įsk. „demo" guard), CI `quality` + `migration-safety` (draft migracijos turi praeiti safety check kaip additive). Import skripto dry-run testas prieš lokalų/test DB jei repo turi tokią galimybę — prod neliesti.

## FINAL REPORT

Branch, commit SHA, PR; dizaino dokumento kelias; migracijų draft sąrašas su papildoma kiekvienos paskirties santrauka; import skripto kelias ir dry-run rezultatas; autocomplete feature flag būsena; ESCO versija, atsisiųstos kalbos ir rastos spragos; Etapo 2 architektūros pasiūlymo santrauka (provideris/kaštai owner sprendimui); safety patvirtinimai (migracijos taikytos NE, LLM/secrets NE, auto-verified NE, originalai saugomi TAIP, DROP NE).
