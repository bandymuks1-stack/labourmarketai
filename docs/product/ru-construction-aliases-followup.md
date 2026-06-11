# FOLLOW-UP — RU praktiniai statybų aliasai → ESCO/kanoniniai įgūdžiai

**Statusas:** follow-up po S2 ESCO importo (2026-06-10). Ne blokeris importui.

## Kontekstas

Rusų kalba **nėra oficiali ESCO kalba** — ESCO v1.2.1 klasifikacija turi 28
kalbas (visos ES + ar/is/no/uk), bet ne RU. Importas vykdomas su visomis
oficialiomis kalbomis; RU nebuvimas importo NESTABDO ir jokios savadarbės
RU vertimų kolonos į `esco_labels` NEkuriamos (handoff taisyklė: jokių
home-made vertimų, `esco_labels` šaltinis = tik oficialūs ESCO vertimai).

## Ko reikia (atskiras slice'as po importo)

Praktinis poreikis: dalis darbuotojų įgūdžius įvardija rusiškais statybų
žargonо terminais (pvz. „штукатурка", „гипсокартон", „опалубка",
„сварщик"). Jiems reikia ALIAS sluoksnio, kuris mapina RU praktinius
terminus į ESCO URI / kanoninius `skills`/`professions` slug'us:

1. **Atskira lentelė** (pvz. `skill_aliases`: alias_text, alias_language
   ('ru' ir kt. ne-ESCO kalbos), target = esco_uri ARBA kanoninis slug,
   source_status `needs_source` šablonu) — NE `esco_labels` (ten tik
   oficialus katalogas; guard'ai tai prisega).
2. Aliasai kuruojami ranka (admin/owner), ne generuojami — sąžiningumo
   doktrina §7; pradinis rinkinys — realių pilotinių darbuotojų vartojami
   terminai iš skill-clarify candidate įrašų (`skill_candidate_clarifications`
   su `original_language='ru'`... pastaba: candidate_skills lentelė jau turi
   original_language stulpelį — natūralus aliasų kandidatų šaltinis).
3. Typeahead sluoksnis: RU užklausa → alias hit → rodomas KANONINIS
   pavadinimas žiūrinčiojo locale (ne RU vertimas) + alias kaip
   paaiškinimas.

## Susiję

- `docs/product/esco-taxonomy-design.md` (S2) — katalogo sluoksnio ribos.
- Migracija `20260610172251` (candidate_skills) — original_language šaltinis.
