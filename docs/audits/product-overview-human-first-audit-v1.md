# Audit — product-overview-human-first (v1)

**Branch:** `feat/cc/product-overview-human-first` · **Tier:** GREEN ·
**Data:** 2026-06-10

Handoff: full product overview + human-first implementation start. Scope
prioritetas buvo: dokumentas + Phase 3 aiškumas + no-fake/no-migration
guardai > UI perrašymas.

## Kas padaryta

1. **Kanoninis produkto planas** —
   `docs/product/labourmarketai-full-product-overview-and-implementation-plan.md`
   (21 skyrius; visi funkcijų ryšiai žemėlapinti į esamą kanoninį modelį arba
   pažymėti `vision only`; sequencing Phase 3 → TASK 07 → M4+; 6 open
   conflicts — nė vienas neblokuoja; missing sources — nėra). Pirmas commit —
   tik docs (`ebee4fc`).
2. **Cross-links:** `docs/PROJECT_VISION.md` (viena eilutė po antrašte) +
   `TASKS.md` (nuoroda į kanoninį planą).
3. **Naujas guard** — `apps/web/lib/guards/product-copy-forbidden-terms.test.ts`:
   draudžia žodį „demo“ (Unicode lookarounds — JS `\b` LT diakritikų
   neaptinka), demo-mode/demo-data framing, „trial access“ / LT bandomosios
   prieigos framing visuose 10 lokalių failuose + taxonomy sluoksniuose;
   sanity-pin, kad sąžiningas preview/PRE-ALPHA ženklinimas lieka. 242
   assertions, žalias.
4. **Vidinė „demo“ higiena:** `demo-chip.tsx` → `preview-chip.tsx`
   (`DemoChip` → `PreviewChip`) — banned žodis nebegyvena ir identifikatoriuose.
   Matomas copy nesikeitė (jis jau buvo sąžiningas: „PRE-ALPHA · Activity
   preview“).
5. **TASK 07 žymos kode** (low-fidelity preview, bus pakeistas TASK 07):
   `player-card.tsx` (FIFA koncepcija), `worker-player-card.tsx` (visual
   layer), `live-map.tsx` (live market preview), `dashboard/page.tsx`
   (personal command center — dokumentuotas pirmas sluoksnis).

## Kas NEdaryta sąmoningai (su priežastimi)

- **Landing copy perrašymas** — landing jau atnaujintas premium kryptimi
  (PR #55/#56: hero, LiveMap, PlayerCardShowcase, DraftBoard, premium
  cleanup); naujas perrašymas be owner vizualinio užrakto konkuruotų su
  TASK 07 ir rizikuotų esamais copy-honesty guardais. Scope prioritetas
  leidžia tai praleisti.
- **Nauji `LiveMarketPreview` / `PersonalCommandCenterPreview` komponentai** —
  esami `LiveMap` + dashboard cockpit JAU yra tie low-fidelity preview
  sluoksniai; sukurti paralelius komponentus = dubliavimas prieš kanoninį
  modelį. Pažymėti žymomis vietoj kūrimo iš naujo.

## Kas lieka kitam sprintui

**Laukia TASK 07 (owner vizualinis užraktas):**
- Living-arena UI: worker cockpit, manager super-league coach view,
  galutinė FIFA-card estetika, premium command-center look.
- Landing vizualinis poliravimas pagal užraktą.

**`vision only` (jokios DB struktūros be atskiro owner sprendimo):**
- Documents/compliance modelis (lentelių nėra), country requirements 9
  rinkoms, accommodation↔project readiness, payment reliability,
  scam-risk memory, agency bulk upload, calendar booking, WhatsApp/SMS,
  follow-up engine, saved layout preferences.

**Hygiene backlog:**
- `SCHEMA_INVENTORY.md` atnaujinimas (stale nuo konvergencijos — žr. plano
  C5).
- Vidinių „pilot“ identifikatorių pervadinimas (C6).
- Doktrinos §13 (pricing) trūkstama sekcija (C4).

## Saugos patvirtinimai

- DB migracijos: **NE** (jokių naujų lentelių, jokių SQL pakeitimų).
- Env/secrets/DNS/billing touch: **NE**.
- Fake data / fake verified / „demo“ copy: **NE** (guard dabar tai pin'ina).
- Senas repo/deployment (`labourmarket.ai/lt`): **neliestas**.
- LABMA pavadinimas naujuose tekstuose: **nenaudotas** (cituojamas tik
  istoriniuose repo failuose, kurie nekeisti).
