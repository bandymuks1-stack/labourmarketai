# Handoff — T07.1: tipografijos užraktas + worker living-arena tęsinys

Branch: `feat/cc/t07-1-typography-living-arena` · 2026-06-11 · GREEN tier.
TASK 07 vykdomas sluoksnis po sluoksnio, atskiri PR, auto-merge vokas galioja.

## Owner patikslinimai (privalomi visiems TASK 07 slice)

- (a) **docs/DESIGN_SOUL.md yra PRIVALOMAS** dizaino dokumentas šalia FUT
  (owner vizualinio) užrakto — kiekvienas slice tikrinamas prieš §1–§4,
  final report atsako į penkis testus.
- (b) **Tipografijos sprendimas — token swap**: Bricolage Grotesque
  display/antraštėms/kortelėms, JetBrains Mono skaičiams, Inter lieka body.
  Įgyvendinta ŠIAME slice (T07.1 dalis).
- (c) **T07.1 worker dalis iš dalies padaryta PR #298** (šiandienos ekranas +
  player card) — tęsiama nuo jos, nedubliuojama.
- (d) **T07.4 nestatomas, kol S4 migracijos nepritaikytos** (review paketas:
  `C:\Users\Mano\Downloads\s4_draft_migrations_for_review.sql`, 2026-06-11).

> PASTABA: `docs/handoffs/HANDOFF_task07_living_arena.md`, į kurį rodė owner
> užduotis, NEEGZISTUOJA nei repo, nei Downloads (patikrinta 2026-06-11).
> Šis slice vykdytas pagal aukščiau užfiksuotus patikslinimus; T07.2+ scope
> detalėms reikalingas trūkstamas handoff failas iš owner.

## Kas padaryta šiame slice

1. **Tipografijos token swap** (`app/[locale]/layout.tsx` + `tokens/typography.ts`):
   - `--font-display` → Bricolage Grotesque (antraštės/kortelės)
   - `--font-mono` → JetBrains Mono (skaičiai, mono etiketės)
   - `--font-sans` → Inter (body, nepakitęs)
   - Visi trys su `latin-ext` subset — LT diakritikai (ąčęėįšųūž) anksčiau
     buvo už `latin` subset ribų ir krisdavo į fallback šriftą.
   - Nulis komponentų pakeitimų — jie naudoja `font-display`/`font-mono`
     klases (DESIGN_TOKENS.md architektūra).
2. **TrustBlock living-arena re-skin** (`components/app/trust-block.tsx`):
   piktogramos (ShieldCheck/ClipboardCheck/NotebookPen), tylus state-success
   švytėjimas TIK kai realus skaičius > 0, CountUp skaitliukai, card-border +
   rise-in; test id ir label sąsaja nepakitusi; "low-fidelity preview" žymė
   pašalinta — tai ir YRA TASK 07 re-skin.

## Kas liko TASK 07 (laukia trūkstamo handoff / S4)

- T07.2 / T07.3 — scope nežinomas be HANDOFF_task07_living_arena.md.
- T07.4 — UŽBLOKUOTAS iki S4 migracijų apply (owner sprendimas d).
- Manager pusės arena (žemėlapis, batch confirm UI ant naujo RPC) — atskiri
  slice po S4/batch RPC apply.
