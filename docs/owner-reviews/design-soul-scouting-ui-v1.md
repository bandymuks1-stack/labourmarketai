# Owner review — DESIGN_SOUL + premium scouting UI v1 (TASK 07 slice 1)

Branch: `feat/cc/design-soul-scouting-ui-v1` · 2026-06-11

## Kur pamatyti gyvai

| Surface | Route | Sąlyga |
|---|---|---|
| Šiandienos ekranas (visas) | `/{locale}/dashboard` | prisijungus, aktyvi rolė = worker |
| Player card (atskiras kambarys) | `/{locale}/dashboard/player-card` | prisijungus |

Statinė vizuali peržiūra (su aiškiai pažymėtais pavyzdiniais skaičiais, NE
gyva programa): [`design-soul-scouting-ui-v1-preview.html`](design-soul-scouting-ui-v1-preview.html)
— atsidaryk naršyklėje; viršuje yra 390px / desktop perjungimas.

## Kas naujo

1. **docs/DESIGN_SOUL.md** — privaloma vizualinė filosofija (owner tekstas 1:1).
2. **Šiandienos ekranas** (`components/app/today/today-screen.tsx`):
   - ŠIANDIENOS VEIKSMAS — viena didelė kortelė: jei šiandien įrašo nėra →
     „Užrašyk, ką šiandien padarei" + vienas CTA į žurnalą; jei yra → rami
     patvirtinta būsena + „pridėti dar". N įrašų laukia patvirtinimo — rodoma
     tik kai realiai laukia.
   - SAVAITĖS SITUACIJA — realūs šios savaitės įrašai + patvirtinimai
     (latest-wins approved) + valandos TIK iš aiškiai užfiksuotų trukmių
     (fragment_time). Jokių eurų.
   - KELIAS Į DAUGIAU — pirmas trūkstamas core įgūdis iš profession_skills
     grafo arba sąžiningas premium empty state.
3. **Player card v2** (`worker-player-card.tsx` atnaujintas vietoje):
   inicialų avataras, gold trust žiedas TIK kai darbo kortelė realiai
   patvirtinta, patvirtintų įgūdžių ženkliukai (tik worker_skills.verified)
   su skill_icons piktogramomis, prieinamumo chip'as, naujausias įrodymas,
   skaitliukai su tyliu count-up.
4. **Token sluoksnis**: vienas semantinis `--c-trust-accent` (tier-gold alias,
   dark+light), `.trust-ring`, `.glow-hover` — viskas per tokenus,
   prefers-reduced-motion gerbiamas.

## Penki DESIGN_SOUL testai

1. **3 sekundžių** — pirmoji kortelė pasako veiksmą DABAR („užrašyk šiandienos
   darbą") ir ką gausi (diena lieka kaip įrodymas; savaitės kortelė rodo, kiek
   jau patvirtinta šią savaitę).
2. **Žmogaus kalbos** — „Šią savaitę tavo darbas patvirtintas 3 kartus", ne
   „Žurnalo įrašai: 12". Guard'as pina šią frazę LT+EN.
3. **Kito žingsnio** — kiekviena būsena baigiasi vienu natūraliu žingsniu:
   nėra įrašo → pildyk; yra → pridėk/lauk patvirtinimo; nėra įgūdžių kelio →
   atsidaryk profilį.
4. **Ramybės** — niekas nepulsuoja dėl dėmesio; gold žiedas statinis ir tik už
   realų patvirtinimą; piktogramos vietoje teksto; pending — informacija, ne
   aliarmas.
5. **Augimo** — count-up skaitliukai, patvirtintų įgūdžių ženkliukai su
   verified-pop, savaitės skaičiai auga nuo kiekvieno patvirtinto įrašo;
   tuščios būsenos kviečia į pirmą įrašą (steigėjo momentas).

## Sąžiningumas

- Visi skaičiai — tiesioginiai RLS-scoped COUNT/derive iš worker'io NUOSAVŲ
  eilučių; klaida → 0/null, niekada ne išgalvota reikšmė.
- Valandos rodomos tik kai fragment_time realiai užfiksuotas; kitaip slepiama.
- Jokių eurų (atlygio duomenų grandinėje nėra), jokio fake match/score/Top %.
- Kalbų sekcija NEĮDĖTA — kalbų stulpelio DB nėra (Realumo principas).
- Guard'as: `lib/guards/today-screen-honesty.test.ts` (CI vykdomas per
  `pnpm -F web test`).

## Validacija

- typecheck ✓ · lint ✓ (1 pre-existing warning) · test 182/182 failų,
  2935 testų ✓ · build ✓ · `git diff --check` ✓
- i18n: visi 10 locale; LT+EN+DE+DA žmogiški vertimai, kiti 6 — `[EN]`
  placeholder pagal §2.4 (debt ratchet nepažeistas).
