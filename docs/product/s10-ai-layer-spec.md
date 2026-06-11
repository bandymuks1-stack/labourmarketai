# S10 — AI sluoksnio specifikacija (TIK SPEC; jokio diegimo)

> Statusas: **specifikacija owner sprendimui**. Šiame dokumente NIEKO
> neįdiegta — jokių raktų, env kintamųjų, provider SDK ar runtime kodo.
> Privalomi rėmai: PLATFORM_DOCTRINE **§7 (AI niekada nemeluoja)**, **§7.1
> (AI — vertėjas/siūlytojas, ne autorius)**, **§19 (Atitikties principas)**,
> §18 (Realumo), PRODUCT_CONSTITUTION §10. AI ateina ANT branduolio
> (VISION §9) — branduolys jau gyvas (S1–S9).

## 0. Bendri invariantai (visoms keturioms funkcijoms)

- **AI siūlo → žmogus patvirtina → tik tada persistinama.** Joks AI
  rezultatas niekada nerašomas tiesiai į verified/confirmed sluoksnį.
- **Append-only AI auditas** — jau yra modelis: `journal_entry_extractions`
  (provider, model, raw_response, worker_confirmed_subset). Kiekviena nauja
  AI funkcija gauna tą pačią formą (events lentelė arba payload įrašas per
  gate, jei prireiks naujos lentelės — DRAFT + vartai).
- **Lygis 0 (self-declared)** — visi AI pasiūlymai, kuriuos žmogus priima,
  įsirašo kaip savideklaracija; patvirtinimo koPėČIOS (§6 VISION) nekinta.
- **Kalba:** AI gali skaityti `original_text` ir siūlyti struktūrą; vertimai
  on-read pagal §2 (niekada nesaugomi).
- **Degradacija:** AI sluoksniui neveikiant viskas veikia kaip dabar —
  AI yra pagreitintojas, ne priklausomybė.

## 1. LLM skill-mapping (candidate_skills → ESCO)

**Kas:** laisvo teksto įgūdžių frazes (`candidate_skills.original_text`,
žurnalo fragmentai) LLM siūlo susieti su ESCO skill ID (katalogas prod'e:
13 939 įgūdžių, 28 kalbų etiketės).

**Srautas:** batch'as per admin „mapping inbox" — LLM pateikia top-3
kandidatus su pagrindu (kodėl), **admin pasirenka** (esamas
`candidate_skills.status='approved'` + `mapped_esco_uri` kelias — jokio
naujo modelio). Worker mato rezultatą kaip Level 0.

**§19 sąsaja:** patvirtinti mapping'ai automatiškai praplečia fit C aibę —
vienas žmogaus patvirtinimas → daug atitikties vaisių (DESIGN_SOUL §1).

## 2. CV ekstrakcija į Level 0

**Kas:** įkeltas CV (PDF/tekstas) → LLM siūlo: profesijos kandidatą,
įgūdžių sąrašą (ESCO typeahead atitikmenimis), patirties metus, kalbas.

**Srautas:** worker mato pasiūlymų PERŽIŪROS ekraną (kaip S3.5 batch —
kiekvienas punktas pažymimas atskirai arba „priimti visus" su pilnu sąrašu);
priimti punktai → `profile_skill_claims` / `worker_professions` Level 0.
CV failas — owner-only storage (S3 modelis), LLM gauna tik turinį runtime,
raw_response audituojamas.

**Draudimas:** niekas iš CV niekada nevirsta „verified"; jokio „CV
balas" (§19 a).

## 3. Dokumentų paaiškinimai

**Kas:** prie `worker_documents` tipo/šalies — LLM sugeneruotas paprastas
paaiškinimas „kas tai per dokumentas, kam jo reikia šalyje X, kaip atnaujinti".

**Srautas:** turinys generuojamas KURAVIMO metu (admin peržiūri ir
patvirtina kaip platform-curated tekstą → slug + JSON per §2, NE runtime
LLM atsakymai vartotojui). Teisiniai niuansai — tik su `needs_legal_source`
žyma, kaip dabar country_document_requirements.

**§7 sąsaja:** paaiškinimas niekada nesako „tavo dokumentas tinkamas" —
tik aprašo kategoriją.

## 4. Match suggestions (workbench žibintas)

**Kas:** prie S6 fit — LLM paaiškinimas žmogui-sprendėjui: „kandidatas X
atitinka 7 iš 9; trūksta Y,Z — jo žurnale yra panašios veiklos įrašų,
verta paklausti". Visada šalia deterministinio fit %, niekada vietoj jo.

**Ribos:** LLM nerikiuoja žmonių ir nekuria skaičių — naudoja TIK fit
pagrindo objektą + readable įrašus; išvestis = tekstinis pastebėjimas su
nuorodomis į faktus; sprendimą fiksuoja žmogus (workbench human-rule
guard'ai nepakitę).

## 5. Provider / kaštų variantai (owner sprendimui)

| Variantas | Modeliai | Privalumai | Rizikos/kaštai | Tinka |
|---|---|---|---|---|
| **A. Anthropic Claude API** | Haiku 4.5 (pigus, greitas) skill-mapping/paaiškinimams; Sonnet 4.6 CV ekstrakcijai | aukšta kokybė LT/multi-kalboms, geras struktūruotas output (tool use), vienas tiekėjas | ~ $1/M in (Haiku) – $3/M in (Sonnet) tokenų; EU duomenų apdorojimo sutartis būtina | rekomenduojamas startas: Haiku batch'ams, Sonnet CV |
| **B. OpenAI API** | gpt-4.1-mini / 4.1 | plačiai žinomas, batch API −50% | panašūs kaštai; tas pats DPA klausimas | alternatyva A |
| **C. EU-hosted atviras modelis** | pvz., Mistral (EU) arba self-host Llama | duomenų suverenitetas, fiksuoti kaštai | žemesnė LT kokybė, ops našta | jei owner prioritetas — EU duomenys |
| **D. Hibridas** | C jautriems (CV) + A/B katalogo darbams | balansas | dviguba integracija | vėlesnė optimizacija |

**Kaštų rėmai (apytikslis startas, 100 aktyvių workers/mėn):**
skill-mapping batch ~2k frazių × ~500 tok ≈ <1 € / mėn (Haiku-klasė);
CV ekstrakcija ~100 CV × ~8k tok ≈ 2–5 € / mėn; dokumentų paaiškinimai —
vienkartinis kuravimo batch'as ≈ <5 €. **AI sluoksnis startui — dešimtys
eurų per mėnesį, ne šimtai.**

**Owner sprendimai prieš diegimą:** (1) provider (A–D); (2) DPA/duomenų
teritorija; (3) ar CV failai gali keliauti pas provider'į (ar tik tekstas);
(4) mėnesio kaštų lubos; (5) kuri funkcija pirma (rekomendacija: №1
skill-mapping — mažiausia rizika, didžiausias fit poveikis).

## 6. Diegimo eskizas (kai owner atrakins)

Kiekviena funkcija = atskiras slice su: env raktu (owner įveda), audit
įrašais nuo pirmos užklausos, flag-off default, guard'ais („AI pasiūlymas"
žymėjimas §10 sąžiningumo kalba), i18n 10 locale. Jokio auto-send, jokio
auto-verify — niekada.
