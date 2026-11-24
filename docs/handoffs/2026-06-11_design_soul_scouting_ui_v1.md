# Handoff — DESIGN_SOUL + premium scouting UI v1 (2026-06-11)

Branch: `feat/cc/design-soul-scouting-ui-v1` · Tier: GREEN (UI/app/docs, jokių
migracijų) · Pirmasis TASK 07 (living-arena UI) slice.

Šis failas — pilnas owner GOAL tekstas, commit'inamas pirmu commit'u, kad
kontekstas išliktų repo istorijoje.

---

## GALUTINIS TIKSLAS

Du susiję darbai viename slice:
A) Įforminti projekto vizualinę filosofiją kaip privalomą dokumentą docs/DESIGN_SOUL.md.
B) Pagal ją įgyvendinti pirmą realų premium "worker as player card / scouting" vizualinį sluoksnį su "šiandienos ekrano" logika. Tai pirmasis TASK 07 (living-arena UI) slice.

## PRIVALOMA SESIJOS PRADŽIA

1. Perskaityk šia tvarka: docs/PROJECT_VISION.md → AGENTS.md → CLAUDE.md → TASKS.md → šis handoff.
2. docs/PLATFORM_DOCTRINE.md privalomas: §2 (i18n slug→JSON), §3 (append-only proof), §7 (AI-never-lies), Realumo principas.
3. Sukurk handoff failą docs/handoffs/2026-06-11_design_soul_scouting_ui_v1.md su pilnu šio GOAL turiniu — pirmas commit.
4. Branch: feat/cc/design-soul-scouting-ui-v1. GREEN tier (UI/app/docs) — PR su praeinančiu CI auto-merge'ins.

## ŽINGSNIS A — SUKURK docs/DESIGN_SOUL.md

Tikslus turinys — žr. `docs/DESIGN_SOUL.md` (commit'intas šiame slice; turinys
perkeltas 1:1 iš owner GOAL, be redagavimo).

## ŽINGSNIS B — VIZUALINIS SLICE

Vieta (prioritetas): worker dashboard / "šiandienos ekranas" + player card
komponentas. Manager pusės neliesk šiame slice, išskyrus jei būtina dėl bendrų
komponentų.

Darbuotojo "šiandienos ekranas" (390px mobile first):
1. ŠIANDIENOS VEIKSMAS — viena didelė kortelė: užpildyk dienos žurnalą /
   N įrašų laukia vadovo patvirtinimo. Tik realūs duomenys iš žurnalo grandinės.
2. SAVAITĖS SITUACIJA — patvirtintos valandos ir įrašai šią savaitę.
   BE EURŲ: atlygio duomenų DB nėra, pinigų nerodome (Realumo principas).
3. KELIAS Į DAUGIAU — viena sąžininga įgūdžio rekomendacija iš realių
   duomenų (profession_skills / ESCO ryšiai): "tavo profesijoje dažnai
   reikalaujamas įgūdis, kurio dar neturi patvirtinto". Jokio fake
   "+X% atlyginimo". Jei duomenų neužtenka — premium empty state.
4. PLAYER CARD — avataras/inicialai, profilio parengtis arba kita sąžininga
   metrika, patvirtinti įgūdžiai (su piktogramomis per skill_icons, kur yra),
   kalbos, prieinamumas, patvirtinimo statusas, naujausias darbo įrodymas
   (arba empty state).

Vizualinė kryptis:
- Bazė: dark navy, graphite, black per esamus design tokens.
- Akcentai: electric blue, neon lime, silver per token sluoksnį.
- GOLD tik kaip ribotas trust/score/status akcentas (trust badge, readiness
  highlight, confirmed status, premium border/ring). Jei reikia — TIK vienas
  semantinis alias tokenas (pvz. --c-trust-accent). Jokios gold paletės.
- Subtilus motion: hover glow, card entrance, score count-up. Leidžiama
  įdiegti "motion" paketą, jei projekte nėra framer-motion ar analogo; jei
  yra — naudok esamą. Trukmės/easing iš motion tokens. prefers-reduced-motion.
- Maksimaliai piktogramos, minimaliai teksto (Ramybės testas).
- Tipografija: esama (Bricolage Grotesque, Instrument Serif, JetBrains Mono);
  monospace skaičiams — JetBrains Mono.

UI/UX PRO MAX SKILL:
- Įdiek: npm install -g uipro-cli; projekto šaknyje: uipro init --ai claude.
- Naudok TIK kaip UX kokybės patarėją: kontrastas 4.5:1+, touch targets 44px+,
  reduced-motion, focus states, responsive 375/768/1024/1440, no overflow.
- NENAUDOK jo palečių, font pairings ir stilių šablonų — labourmarket.ai
  tokens, tipografija ir doktrina visada viršesni. Konfliktas = atmesti.

I18n:
- LT ir EN per esamą i18n sistemą (slug→JSON). Jokių hardcoded public tekstų.
- LT tekstai pagal Žmogaus kalbos testą: natūralūs, šilti, antruoju asmeniu.

## NELEIDŽIAMA

- Jokių DB migracijų, RPC, auth, billing, env, secrets, Vercel, DNS pakeitimų.
  (Batch patvirtinimo RPC, atlygio sluoksnis ir galerijos lentelės yra ATSKIRI
  būsimi slice — šiame jų nedaryk.)
- Neliesk seno deprecated projekto.
- Nekurk fake matching, fake verified, fake score, fake "Top X%".
- Nekurk paralelinės design system ir naujos gold paletės.
- Nedėk stock/lifestyle nuotraukų. Neperrašyk projekto nuo nulio.
- Nedeployink nieko rankiniu būdu — tik standartinis PR flow.

## VALIDACIJA

- typecheck, lint (jei yra), test (jei yra), build.
- Mobile overflow check (jei yra guardas), i18n check (jei yra), git diff --check.
- Pakeistų failų sąrašas + tikslūs route, kur matyti naują UI.
- Jei galima — owner-review screenshot/html artefaktas (390px mobile + desktop).

## FINAL REPORT

- Ką radai esamoje struktūroje ir ką konkrečiai pakeitei.
- Kaip kiekvienas iš penkių DESIGN_SOUL testų praeitas (privaloma, po vieną).
- Kaip užtikrinai, kad nėra fake claims.
- Validacijos rezultatai ir review artefaktai.
- Ką siūlai kaip kitą slice (kandidatai: galerijos duomenų modelis, atlygio
  sluoksnis, batch patvirtinimo RPC su išimčių piramide, manager žemėlapis).

---

## Sesijos pastabos (Claude Code, 2026-06-11)

- `framer-motion@12` jau yra `apps/web` dependencies — naujo motion paketo
  nediegiame, naudojame esamą + `tokens/motion.ts` trukmes/easing.
- Gold akcentas: `--c-tier-gold` kanalas jau egzistuoja (dark `255 200 87`,
  light `176 122 0`). Pridedamas TIK semantinis alias `--c-trust-accent`
  (rodo į tas pačias reikšmes) + `trust.accent` token `colors.ts` — jokios
  naujos paletės.
- Kalbų (languages) stulpelio DB NĖRA (workers/profiles) — pagal Realumo
  principą kortelėje kalbų sekcija nerodoma, kol nėra realių duomenų
  (fabrikuoti negalima; atskiras būsimas slice).
- `worker-player-card.tsx` ir dashboard worker šaka pažymėtos
  "low-fidelity preview, bus pakeistas TASK 07" — šis slice yra būtent tas
  TASK 07 pirmas žingsnis: komponentas atnaujinamas VIETOJE, išlaikant
  honesty-guard kontraktus (String(card.x) verbatim, safeCount→0, attentionZero).
- Savaitės valandos: tik iš `journal_entry_metrics` `fragment_time`
  (`unit_slug='hours'|'minutes'`) eilučių ant PATVIRTINTŲ (latest-wins
  approved) įrašų — kai jokios aiškios trukmės nėra, valandos nerodomos
  (ne 0 fabrikuojam, o slepiam metriką). Jokių eurų.
- Įgūdžio rekomendacija: `profession_skills` (is_core pirmiausia,
  display_order tvarka) minus jau turimi `worker_skills` — pirmas trūkstamas
  nepatvirtintas įgūdis. Nėra duomenų → premium empty state.
