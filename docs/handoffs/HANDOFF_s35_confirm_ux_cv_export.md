# HANDOFF — S3.5 (mini): One-Tap patvirtinimas + Verified CV PDF eksportas

**Repo:** `bandymuks1-stack/labourmarketai` · **Branch:** `feat/cc/s35-confirm-ux-cv-export`
**Tier:** GREEN. JOKIŲ migracijų — abu darbai privalo tilpti į esamą kanoninį modelį. Galioja OWNER DEFAULT DECISIONS vokas.
**Vieta programoje:** tarpinis sprintas tarp S3 (prie vartų) ir S4 (Termometras). Nepriklauso nuo #286/#288 vartų.

## GALUTINIS TIKSLAS
Du maži darbai, saugantys visą verified grandinę ir sprendžiantys šaltąjį startą:
1. **One-tap patvirtinimas:** vadovo patvirtinimas turi trukti ≤10 sekundžių telefone. Brigadininkas purvinomis rankomis nepildys formų — jei patvirtinimas sunkus, miršta visa proof grandinė, platformos stuburas.
2. **Verified CV PDF eksportas:** darbuotojo Work Journal vertė VIENAM žmogui be jokio tinklo — jis gali išsinešti savo patvirtintą istoriją bet kur. Darbuotojai ateina dėl savęs, ne dėl platformos.

## ŽINGSNIS 0 — standartiniai šaltiniai + esamų primityvų inventorizacija: confirm flow (PR #157/#158 RPC grandinė — `confirm_entry_and_verify_skills` ir kt.), žurnalo peržiūros ekranai, profilio/skills modelis su declared/evidence/confirmed žymom.

## DARBAS 1 — One-Tap Confirm
- Vadovo mobile vaizdas: nepatvirtintų įrašų eilė kortelėmis; vienas tap = patvirtinti per ESAMĄ RPC (jokių naujų rašymo kelių); batch „patvirtinti visus šios dienos" su vienu confirm dialogu.
- Aiškumas prieš greitį: kortelėje matosi KĄ tvirtina (darbuotojas, data, darbai, įgūdžiai) — vienas žvilgsnis, vienas tap. Patvirtinimas lieka teisiškai reikšmingas veiksmas, todėl batch'e — sąrašo santrauka prieš confirm.
- Atmetimo kelias šalia (su trumpa priežastim) — kad „nepatogu atmesti" netaptų fake patvirtinimais.
- Jokio auto-confirm, jokio default-checked. Append-only nepažeidžiamas.

## DARBAS 2 — Verified CV PDF
- Darbuotojo profilyje „Eksportuoti CV (PDF)": player-card stiliaus santrauka + profesijos + įgūdžiai SU SĄŽININGOM ŽYMOM (self-declared / evidence / confirmed — vizualiai atskirta, niekur žodžio „verified" be patvirtinimo) + patvirtintų Work Proof sąrašas (data, projektas, patvirtinusio rolė — BE asmens vardų be jo sutikimo, default-closed) + ESCO kanoniniai pavadinimai kai bus pritaikyta (#286), iki tol — esami.
- Kalba: žiūrinčiojo pasirinkta locale (10), generuojama serveryje ar kliente — spręsti pagal esamą stack'ą, be naujų sunkių dependency be reikalo.
- PDF apačioje: generavimo data + „Patvirtinimus galima patikrinti platformoje" eilutė (be viešo linko, kol nėra viešo proof puslapio — to NEKURTI šiame sprinte).
- Eksportas = darbuotojo veiksmas su jo paties duomenimis. Jokių darbdavio duomenų nutekėjimo.

## NELEIDŽIAMA — standartiniai sąrašai + vokas, plius: jokių migracijų (jei kas netelpa į esamą modelį — tas gabalas atidedamas, ne lentelė kuriama); jokio viešo CV puslapio/linko; jokio auto-confirm; „demo" guard galioja.

## VALIDACIJA — standartinė + mobile smoke confirm flow (one-tap ir batch) + PDF generavimo testas bent LT/EN locale + guard testas žymoms (PDF'e confirmed tik su tikru patvirtinimu).

## FINAL REPORT — standartinė forma + atskirai: kiek sekundžių užtrunka vienas patvirtinimas (realus smoke), PDF pavyzdžio aprašymas, kas atidėta jei netilpo be migracijų.
