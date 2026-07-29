# OWNER VISUAL ACCEPTANCE 2026 — GALUTINIS VYKDYMO GOAL

> Šis failas yra **galutinis vykdymo GOAL**. Jis nepakeičia savininko audito —
> jis nurodo, kaip auditas užbaigiamas.
>
> Kanoniniai tiesos šaltiniai (šia tvarka):
> 1. [`owner-visual-acceptance-audit-2026.md`](owner-visual-acceptance-audit-2026.md) — savininko auditas (verbatim)
> 2. [`owner-visual-acceptance-addendum-2026.md`](owner-visual-acceptance-addendum-2026.md) — privaloma vykdymo politika
> 3. [`owner-visual-acceptance-traceability-2026.md`](owner-visual-acceptance-traceability-2026.md) — atsekamumas ir statusai
>
> Ankstesnis verdiktas `OWNER_VISIBLE_W1_W6_AND_LANDING_REBUILD_PRODUCTION_VERIFIED`
> — **galutinai atmestas**. Dabartinis statusas: `OWNER_VISUAL_ACCEPTANCE_NOT_COMPLETE`.

## 1. Kanoninis tikslas

Ne taisyti pavienius bugus. Ne „praeiti testus". Ne „užbaigti PR".

Tikslas: **labourmarket.ai production versija yra vientisas, chat-first,
2026 premium AI produktas, pilnai atitinkantis savininko auditą.**

Jeigu esama architektūra tam trukdo — ji perprojektuojama.

## 2. Vykdymo principai

1. **Pokalbis yra operacinis centras.** Kalendorius, žurnalas, žinutės,
   žemėlapis, kortelė — jo projekcijos. Prieš kiekvieną funkciją:
   „Ar tai gali būti atlikta per pokalbį?" Jei TAIP — ne atskiras CRUD ekranas.
2. **Landing = produktas.** Tas pats komponentas, ta pati vizualinė kokybė,
   jokių pažadų, kurių nėra viduje.
3. **Kiekvienas taisymas užbaigia visą komponentą** (overlay, z, keyboard,
   focus, escape, click-outside, mobile, empty state, loading, polish).
4. **Premium standartas:** „Ar šis ekranas atrodytų natūraliai tarp geriausių
   2026 AI produktų?" Jei atsakymas nėra aiškus TAIP — nebaigta.
5. **Po kiekvieno etapo agentas pats klausia:** „Kas šiame komponente dar
   atrodo ne premium?" Rasta → `AGENT_DISCOVERED_ADDITIONAL_DEFECTS` → sutvarkoma.

## 3. Etapų seka

| # | Etapas | Apimtis |
|---|---|---|
| 1 | §7 Kalendorius | day/week/month/year; laikas, trukmė, workspace, projektas, vieta, statusas, konfliktas, tipas, šaltinis, susijęs žmogus, susijusi organizacija; visi šaltiniai; 0 dublikatų |
| 2 | §8 Žinutės | sender, preview, unread, priority, thread, archive, quick reply, compose, reply-from-chat, send-after-confirmation; pokalbio projekcija |
| 3 | §5.2 Premium Player Card | avataras, profesinis identitetas, vieta, prieinamumas, darbo istorija, įrodyti įgūdžiai, signalai, dokumentų būsena, reputacijos statistika, paaiškinami įrodymai, galimybės; vienas komponentas landing + produkte |
| 4 | §10 CV | jokio „iki 5 MB"; sistema optimizuoja/suspaudžia; LMC paaiškinimas PRIEŠ veiksmą; jokių paslėptų mokesčių |
| 5 | §12 Premium design pass | visi autentikuoti ekranai: spacing, hierarchy, typography, cards, buttons, dialogs, overlays, colors, empty states, loading, transitions |
| 6 | §16 QA matrica | 360/390/412/768/1280/1440/1920 × light/dark × workspace, profile, settings, Player Card, calendar, messages, search, chat, landing, map, overlay, keyboard, escape, focus, browser-back, refresh, mobile |

Po kiekvieno etapo: production patikra → screenshot evidence → progress
update → traceability update → checkpoint commit. Tarp etapų nesustojama.

## 4. Priėmimo kriterijai

Savininko audito §15 penkiolika kriterijų + kiekvieno etapo apimtis
patikrinta **realiu production click-through su screenshot įrodymais**.
Guard/testų žalumas yra būtina, bet NEPAKANKAMA sąlyga.

## 5. Draudimai

- CSS workaround vietoj architektūrinio sprendimo
- `TODO`, `placeholder`, `temporary`, „vėliau"
- Fake data, mock AI
- Skirtingas Landing ir Product komponentas
- Bugo paslėpimas ar apėjimas nepašalinus priežasties
- Neveikiantys mygtukai production
- `completed` be production click-through

## 6. QA reikalavimai

Tikrinama ne tik screenshot: realūs click, keyboard, focus, escape,
browser back, refresh state ir production elgsena. QA harness'ai:
- `apps/web/scripts/verify-prod-owner-visual-acceptance.mjs` (gyvas domenas, 7 viewport)
- `apps/web/scripts/qa-owner-visual-acceptance.mjs` (lokalus prod build :3100)

## 7. OWNER GATE taisyklės

Tik **po visų etapų**. Read-only auditas: OAuth Identity, Workspace Pointer.

Jeigu reikia DNS / Google Console / Supabase Billing / migracijos —
**nieko nekeisti**. Paruošti tik: auditą, planą, evidence, laukimo tašką.

## 8. Galutinio verdikto taisyklės

Leidžiami TIK du variantai:

- Jeigu neliko nė vieno OWNER blokatoriaus:
  `OWNER_VISUAL_ACCEPTANCE_2026_PREMIUM_PRODUCTION_VERIFIED`
- Jeigu liko bent vienas:
  `OWNER_VISUAL_ACCEPTANCE_NOT_COMPLETE_<TIKSLŪS_BLOKATORIAI>`

Kiti `completed` variantai draudžiami.
