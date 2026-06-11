# S6 matching — atitikties (fit) spec pastaba

> Privaloma S6 dizaino įvestis (doktrinos §19 — Atitikties principas).
> Įrašyta S5 slice metu (2026-06-11); pati S6 implementacija čia NEdaroma.

## Skaičiavimo forma (privaloma)

- Atitiktis skaičiuojama per **ESCO kanoninius ID** (prod jau turi pilną
  katalogą: `esco_occupations` / `esco_skills` / `esco_occupation_skills`,
  28 kalbų `esco_labels`):
  - **Y** = poreikio reikalaujamų įgūdžių aibė (ESCO skill ID, surinkta iš
    poreikio konteksto — niekada iš laisvo teksto be žmogaus patvirtinimo);
  - **C** = subjekto turimų įgūdžių aibė (worker_skills → ESCO ref per
    `esco_uri` nuorodas);
  - **fit % = |Y ∩ C| / |Y|** (overlap), visada kartu su pagrindu.
- **Visada kontekstinė**: % egzistuoja tik poros (poreikis, subjektas)
  kontekste. Jokio kešuoto „bendro" subjekto %, jokio globalaus balo
  (§19 a/d).
- **Visada su patvirtintų dalimi**: rezultatas atskirai įvardija, kiek
  sankirtos įgūdžių yra manager-patvirtinti (worker_skills.verified=true)
  ir kiek savideklaruoti (§19 c). Privaloma rodymo forma:
  „atitinka 95% šio darbo įgūdžių: 19 iš 20, iš jų 14 patvirtinti".
- Žmogus sprendžia: fit % yra rikiavimo/filtravimo pagalba workbench/draft
  board žmogui, niekada ne automatinis match (§7, workbench human-rule).

## Ko S6 negali daryti

- Persistinti fit % kaip subjekto stulpelio/lauko (jis skaičiuojamas
  užklausos metu savo kontekste).
- Maišyti patvirtintų ir deklaruotų įgūdžių į vieną neskaidrų skaičių.
- Rodyti % be vardiklio ir be patvirtintų dalies.
