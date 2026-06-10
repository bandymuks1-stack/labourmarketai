# ESCO Taxonomy Backbone + Skill Recognition Pipeline — Design v1

> **Statusas:** S2 sprinto dizaino dokumentas (2026-06-10, branch
> `feat/cc/esco-taxonomy-foundation`). Migracijos — TIK DRAFT failai,
> NETAIKOMOS (needs-human-gate; owner + Chat Claude taiko per Supabase MCP
> `apply_migration`). LLM sluoksnis (Etapas 2) — TIK architektūra, jokio
> diegimo.
>
> **Šaltinis:** ESCO v1.2.1 (naujausia, 2026-06 patikrinta) —
> 3 039 occupations + 13 939 skills, 28 kalbos (visos ES + IS/NO/UK/AR).
> Visos 10 mūsų kalbų (EN LT LV ET NL DE DA NO SV PL) prieinamos.
> CSV atsisiuntimas: https://esco.ec.europa.eu/en/use-esco/download
> (nemokama; reikalinga atribucija — žr. §7).

## 1. Geležinė riba (doktrinos §7 + §18)

Taksonomija sako *kas tai per įgūdis*; įrodymai sako *ar žmogus jį tikrai
turi*. ESCO atpažinimas (deterministinis ar LLM) **NIEKADA** nekelia
patvirtinimo lygio ir **NIEKADA** nekuria „verified" žymos. Atpažintas
įgūdis = self-declared (Level 0). Kilimas — tik per manager-confirmed
journal → Work Proof grandinę. LLM mapping = vertimas į kanoną, ne tiesos
kūrimas. Žmogui visada rodomi JO žodžiai (`original_text`); kanoninis ID —
vidinis sluoksnis.

## 2. Žemėlapis į esamą modelį (negriauti, plėsti)

| Esamas objektas | Kas keičiasi | Kaip |
|---|---|---|
| `professions` (18 eilučių, slug+sector, pirmos klasės, extensible) | NEGRIAUNAMA | additive `esco_uri text` nuoroda; esamos eilutės gauna ESCO atitikmenį per kuravimą arba lieka custom (esco_uri NULL) |
| `skills` (94 eilutės, slug+category) | NEGRIAUNAMA | additive `esco_uri text` nuoroda; tas pats principas |
| `profession_skills` M:N | NEGRIAUNAMA | lieka kuruotas UI sluoksnis; ESCO ryšiai gyvena atskirai `esco_occupation_skills` |
| `worker_skills` / `profile_skill_claims` | NEGRIAUNAMA | be pakeitimų šiame sprinte; vėliau claims gali nešti `mapped_esco_uri` per candidate-skill kelią |
| NAUJA: `esco_occupations`, `esco_skills`, `esco_occupation_skills`, `esco_labels` | pilnas ESCO katalogas | migracijos DRAFT 20260610130000 |
| NAUJA: `candidate_skills` | Etapo 3 augimo kontūras | migracijos DRAFT 20260610130200 |

Kuruotas sluoksnis (professions/skills + slug→JSON labels) lieka tai, ką
UI rodo kaip platformos registrą. ESCO sluoksnis — pilnas paieškos /
atpažinimo kanonas po juo. Susiejimas — `esco_uri` nuorodos.

## 3. Multilingual labels — saugojimo sprendimas (owner peržiūrai)

**Doktrinos §2.2 sako:** platformos taksonomijos labels = slug→JSON failai,
ne DB. **Realybė:** pilnas ESCO = ~17 000 konceptų × 10 kalbų × (preferred +
alternative labels) ≈ 300–500 k eilučių. JSON failai po kelis MB kiekvienai
kalbai sulaužytų bundle dydį, o typeahead paieškai reikia DB indeksų.

**Siūlomas sprendimas (variantas A, rekomenduojamas):** ESCO labels = ne
„vertimo stulpeliai", o **normalizuota platform-content lentelė**
`esco_labels (concept, locale, label, label_type)` su indeksais paieškai:

- tai NE user-content (§2.3 netaikomas) ir NE „translation columns on a
  taxonomy table" (§2.2.2 draudžia `name_lt`/`name_en` STULPELIUS — čia jų
  nėra; lentelė normalizuota, kalba = eilutė);
- šaltinis — oficialus ESCO vertimas (ne AI kūryba, §2.2.4 patenkintas);
- ESCO versijos atnaujinimas = idempotentiškas re-import, ne migracija;
- kuruotas UI sluoksnis (professions/skills) LIEKA slug→JSON — §2 dvasia
  išlaikyta ten, kur labels yra UI chrome.

**Variantas B (atmestas):** JSON failai per 10 locale — bundle +30–50 MB,
be DB paieškos. **Variantas C (atmestas):** tik EN DB + vertimas on-read —
pažeistų „kiekvienas savo kalba" ir ESCO vertimai jau egzistuoja.

> Tai vienintelis sąmoningas §2 interpretacijos klausimas šiame sprinte —
> pažymėtas PR aprašyme owner sprendimui. Migracija vis tiek DRAFT.

## 4. candidate_skills (Etapo 3 schema, šiame sprinte tik lentelė + dizainas)

Neatpažinta įvestis → `candidate_skills` įrašas (doktrinos §2.3:
`original_text` + `original_language` privalomi) → `mention_count` auga su
nepriklausomais paminėjimais → owner patvirtinimo eilė (admin view —
vėlesnis slice) → patvirtinus virsta kanoniniu `skills` įrašu (slug+JSON)
arba `mapped_esco_uri` nuoroda. Statusai: `candidate → approved | rejected`.
RLS: owner mato/kuria savo, admin valdo. Jokio auto-approve.

## 5. Deterministinis atpažinimas be LLM (Etapas 1D)

`apps/web/lib/taxonomy/esco-autocomplete.ts` — prefix/substring paieška
per `esco_labels` žiūrinčiojo kalba (ilike, limit 10, be jokio ranking
modelio — alfabetinė/ilgio tvarka), graceful degrade kai lentelių nėra
(42P01 → tuščias sąrašas). UI: `EscoTypeahead` komponentas (dark, DarkListbox
stiliaus sąrašas), paruoštas profilio / onboarding / žurnalo įvedimo vietoms.

**Feature flag:** `ESCO_AUTOCOMPLETE_ENABLED = false`
(`apps/web/lib/config/esco.ts`). Įjungiama TIK po: migracijos pritaikytos →
importas paleistas → owner flip (vienos eilutės PR). Sąmoningai NEwirinta į
esamus composer'ius šiame sprinte: jie guard-pinned, o flag-off wiring =
negyvas kodas pinned failuose; wiring = to paties flag-flip slice dalis.

Vertė be jokio AI: struktūruota įvestis vietoj laisvo teksto — žmogus pats
pasirenka iš kanono savo kalba; vidinis CV iškart gauna ESCO ID.

## 6. LLM mapping sluoksnis (Etapas 2 — ATSKIRAS, GATED, čia tik architektūra)

**NEDIEGIAMA šiame sprinte** (API raktai = secrets = hard blocker).

- **Kur gyvena:** server-side service `apps/web/lib/taxonomy/llm-mapping/`
  (arba atskiras worker), kviečiamas TIK iš suggestion pipeline — niekada
  tiesiai į verified įrašus (§7.1).
- **Srautas:** laisvas tekstas (žurnalo įrašas / CV importas / profilio
  tekstas) → kandidatų sąrašas iš deterministinės paieškos → LLM parenka /
  patikslina ESCO ID + confidence → įrašoma kaip SUGGESTION → žmogus
  patvirtina → Level 0 self-declared faktas. Originalas visada saugomas.
- **Append-only audit (§7.1):** kiekvienas LLM run loguojamas: provider,
  model, raw response, žmogaus priimtas poaibis.
- **Provider variantai owner sprendimui:**
  | Variantas | Pastabos | Apytikslė kaina* |
  |---|---|---|
  | Anthropic Claude Haiku 4.5 | greitas, pigus, geras multilingual | ~0.5–2 €/1k mapping'ų |
  | Anthropic Claude Sonnet 4.6 | tikslesnis ribiniais atvejais | ~5–15 €/1k |
  | Vietinis (Ollama + multilingual modelis) | be API raktų, be duomenų išėjimo; lėtesnis, reikia infra | hosting kaina |
  *įvertis pagal ~1–2k tokenų vienam mapping'ui; tikslius skaičius owner
  tvirtina kartu su provider pasirinkimu ir biudžetu.
- **Kodėl ne embeddings-only:** ESCO turi alternative labels visomis
  kalbomis — deterministinė paieška + LLM disambiguation pigiau ir
  paaiškinamiau nei vektorinė infrastruktūra v1.

## 7. Import pipeline (Etapas 1C)

`scripts/esco/import-esco.mjs` (Node, be priklausomybių repo šaknyje):

- **Įvestis:** katalogas su ESCO CSV (operatorius atsisiunčia iš portalo
  per-language rinkinius į `data/esco/` — gitignored; portalas neturi
  stabilių tiesioginių URL, todėl atsisiuntimas rankinis arba per ESCO API
  vėliau).
- **Režimai:** `--dry-run` (parse + validacija + skaičiai, BE DB; veikia
  prieš commitintą fixture katalogą `scripts/esco/fixtures/`) ir `--apply`
  (vykdo upsert'us; reikalauja `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
  aplinkoje TIK paleidimo metu — niekas nesaugoma repo; paleidžiama TIK po
  migracijų pritaikymo, owner rankomis).
- **Idempotencija:** upsert pagal `esco_uri` (occupations/skills),
  `(concept_type, concept_id, locale, label, label_type)` (labels),
  `(occupation_id, skill_id)` (ryšiai) — ESCO versijos atnaujinimas =
  pakartotinis paleidimas.
- **Atribucija (privaloma, ES licencija):** dokumentuose ir UI footer
  plane: *„This service uses the ESCO classification of the European
  Commission."* Konstanta `ESCO_ATTRIBUTION` skripte ir
  `lib/config/esco.ts`.

## 8. Kalbų padengimas ir spragos

ESCO v1.2.1 dengia visas 28 kalbas, įskaitant visas 10 mūsų locale
(EN LT LV ET NL DE DA NO SV PL — NO yra tarp 4 ne-ES kalbų). Spragų pagal
viešą versijos aprašą nėra; faktinis patikrinimas įvyks importo dry-run
metu su realiais CSV — jei kuriai kalbai trūks failų, importas pažymi
spragą ataskaitoje ir NEKURIA savadarbių vertimų (handoff draudimas).

## 9. Rollout seka

1. (šis PR, draft) dizainas + migracijų DRAFT + import skriptas + flag-off
   autocomplete lib/komponentas + guard.
2. **VARTAI:** owner peržiūri → MCP `apply_migration` (3 failai eilės
   tvarka) → operatorius atsisiunčia CSV → `--dry-run` → `--apply`.
3. Flag-flip slice: `ESCO_AUTOCOMPLETE_ENABLED = true` + wiring į
   profilio/onboarding/žurnalo įvedimus + UI footer atribucija.
4. Etapas 2 (LLM) — atskiras owner sprendimas (provider + biudžetas +
   raktai). Etapas 3 (owner patvirtinimo eilė admin UI) — atskiras slice.
