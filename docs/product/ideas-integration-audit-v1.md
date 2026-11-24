# Canonical Ideas Integration v1 — idėjų integravimo auditas ir atidėjimų matrica

> Data: 2026-07-17 · Šaka: `feat/cc/canonical-ideas-integration-v1`
> Doktrina: **užbaigti ir sujungti esamą produktą** — jokių naujų dashboard'ų,
> jokio antro paraiškų centro, jokio antro ATS, jokio antro CV šaltinio,
> jokių „coming soon", jokių negyvų mygtukų.

Šis dokumentas fiksuoja, kur kiekviena savininko plano idėja JAU gyvena
produkte, kas buvo pakeista šiame PR (tik trys mažos esamų modelių
plėtros — A/B/C), ir kas sąmoningai ATIDĖTA su viena sąžininga priežastimi.

## Ką šis PR pakeitė (santrauka)

- **A. „Mano susidomėjimai"** — darbuotojo savų signalų sąrašas ESAMOJE
  galimybių lentoje (`/dashboard/opportunities`), nepriklausomas nuo lentos
  matomumo: uždaryto poreikio signalas lieka su sąžininga žyma „Poreikis
  nebeaktyvus". Jokio naujo route, jokių naujų mutacijų — veiksmai tik
  esami (atšaukti / parašyti darbdaviui / peržiūrėti poreikį / pritaikytas CV).
- **B. Shortlist pastaba + sprendimo priežastis** — ESAMA
  `demand_shortlist.note` kolona (migracija 20260612220000, niekada nenaudota)
  pagaliau rašoma/rodoma scouting kortelėje; žymint „Netinka" priežastis
  PRIVALOMA (tikrinama serveryje). Nulis schemos pakeitimų. Pastaba vidinė —
  darbuotojas shortlist eilučių pagal RLS niekada nemato.
- **C. Pritaikyto CV nuoroda susidomėjimo metu** — `{template, need_id,
  tailored_at}` įrašoma į ESAMĄ `match_snapshot` jsonb (be schemos keitimo);
  „Peržiūrėti pritaikytą CV" nuoroda darbuotojo susidomėjimo eilutėje veda į
  ESAMĄ deterministinį `/cv?need=` atvaizdavimą. DI nieko neišgalvoja.
- **Juodraštinė migracija (NETAIKYTA, REQUIRES_OWNER_DECISION)** —
  `20260717150000_demand_interest_seen_v1.sql`: seen-modelis, atrakinantis
  spine'e sąmoningai atidėtą „įmonė atsakė į jūsų susidomėjimą" signalą.
  Signalas specialiai NEprijungtas — be lentelės jis niekada neišsivalytų.

## Atidėjimų matrica — visos 10 savininko plano idėjų

| Idėja | Jau veikia | Dalinai | Vieta | Keista šiame PR | Atidėta + priežastis |
|---|---|---|---|---|---|
| 1. Dinaminis CV paketas (pritaikytas CV prie konkretaus poreikio) | Deterministinis pritaikytas CV `/cv?need=<id>` (skaitymo metu, niekas nesaugoma) | ✔ | `/cv` + galimybių lenta | **C**: CV nuorodos „inkaras" susidomėjimo metu (`match_snapshot.cv` stash) + nuoroda „Mano susidomėjimų" eilutėje | Darbdavio pusėje CV nuoroda ATIDĖTA: `/cv` rodo tik prisijungusio žmogaus CV; rodyti darbuotojo CV darbdaviui reikėtų naujos atskleidimo semantikos / token infrastruktūros — šiame PR privatumo plėtros nėra |
| 2. Paraiškų būsenos (kur mano paraiška?) | Signalo būsenos interested/reviewed/contacted/withdrawn jau saugomos `demand_interest_signals`; inline mygtukas kortelėje | ✔ | Galimybių lenta | **A**: agreguotas savų signalų sąrašas su žmogiškomis būsenomis (Išsiųsta / Įmonė peržiūrėjo / Įmonė susisiekė / Atšaukta) ir sąžininga uždaryto poreikio žyma | „Įmonė atsakė" pranešimo signalas atidėtas už owner-gate: reikia `demand_interest_seen` lentelės (juodraštis PR'e, NETAIKYTA) — be seen-modelio skaitiklis niekada neišsivalytų |
| 3. Ankstyvieji įspėjimai apie naujus darbus | JAU YRA: `new_job_matches` spine signalas + `worker_opportunity_seen` seen-modelis; lentos apsilankymas = perskaitymas | ✔ | Varpelis + lenta | Nieko (nedubliuojame) | Išoriniai šaltiniai (skelbimų portalai ir pan.) — uždrausti šaltinių valdymo doktrinos (visi external OFF); jokio pakeitimo |
| 4. Paaiškinamas match'as darbuotojui | JAU YRA: `MatchTierExplanation` (blocking/strengths/negotiables/missing), be procentų be pagrindo | ✔ | Galimybių kortelė | Nieko (guard'ai saugo, kad nebūtų liesta) | — |
| 5. Įgūdžių / dokumentų pasas | Evidencijos pakopos (self/journal/manager) + dokumentų galiojimas JAU YRA | dalinai | Profilis / CV | Nieko | Dalinimosi nuoroda / QR — reikia token infrastruktūros migracijos (nauja lentelė + vieša prieiga); atskiras owner-gate sprendimas |
| 6. Pokalbio (interview) treniruoklis | — | — | — | Nieko | AI tiekėjas išjungtas (`AI_PROVIDER_MODE=disabled`) ir `ai_runs` audito migracija NETAIKYTA — be audito jokių gyvų AI funkcijų |
| 7. Darbdavio pipeline (kandidatų eiga) | JAU YRA: 7 IŠVEDAMOS stadijos (`deriveCandidatePipelineStage`, niekada nesaugomos) + viena kita veiksena per stadiją | ✔ | Scouting kortelė | **B**: pastaba + privaloma „Netinka" priežastis ant ESAMOS `demand_shortlist.note` kolonos | Kanban lenta SĄMONINGAI nestatoma: stadijos yra išvedamos iš faktų — saugoma vilkimo būsena sukurtų antrą tiesą ir antrą ATS |
| 8. Rėmimo / tinkamumo (sponsorship/eligibility) sluoksnis | Pasirengimo matrica (šalis/dokumentai/prieinamumas) JAU YRA scouting readiness signale | dalinai | Scouting / profilis | Nieko | Plėtra (vizų/leidimų logika pagal šalis) — teisinis turinys, reikalauja savininko formuluočių; owner-gate |
| 9. Partnerių kanalai | — | — | — | Nieko | Pagal planą — tik dokumentacija; jokio produkto paviršiaus šiame PR |
| 10. Nišiniai puslapiai (pvz., suvirintojai NL) | — | — | — | Nieko | SEO/turinio sprendimas su savininko pozicionavimo formuluotėmis; be to, viešų puslapių copy — owner-gate |

## Kas SĄMONINGAI nesukurta (dubliavimo prevencija)

- Jokio `/dashboard/applications` ar kito antro paraiškų centro
  (guard'as `canonical-ideas-integration.test.ts` tai prisega).
- Jokio antro ATS: pipeline stadijos lieka išvedamos, ne saugomos.
- Jokio antro CV šaltinio: pritaikytas CV lieka vienintelis skaitymo metu
  skaičiuojamas `/cv?need=` atvaizdavimas.
- Jokio spine signalo be seen-modelio (jis lauks owner sprendimo dėl
  `demand_interest_seen`).

## RLS faktai, kuriais remtasi

- `demand_interest_signals`: darbuotojas pilnai valdo SAVO eilutes
  (`workers.profile_id = auth.uid()`), įskaitant `match_snapshot` — todėl
  context/cv stash rašymas yra RLS-teisėtas be pakeitimų. Poreikio savininkė
  įmonė savo poreikio signalus tik SKAITO.
- `demand_shortlist`: SELECT tik `owner_id = auth.uid() or is_admin()` —
  darbuotojas shortlist eilučių (taigi ir pastabos) niekada nemato.
