# Owner-visible rebuild — progress (W1–W6 + chat-first UX + landing)

> Savininko direktyva 2026-07-29: užbaigti owner-visible W1–W6, chat-first UX ir
> profesionalų landing rebuild. Galutinis verdiktas tik
> `OWNER_VISIBLE_W1_W6_AND_LANDING_REBUILD_PRODUCTION_VERIFIED` arba
> `OWNER_VISIBLE_REBUILD_NOT_COMPLETE_<BLOKATORIAI>`.

## SESSION RECOVERY (2026-07-29)

Faktinė Git būsena atkūrimo momentu:

- **Šaka:** `feat/cc/owner-shell-ux` (lokali, NEPUSHINTA — jokio upstream)
- **HEAD:** `520a8173` — W6 map join + waiver removal
- **origin/main:** `60c65244` (= production SHA pagal owner-rebuild-audit-v1)
- **Šakos commitai virš main (3):**
  1. `edf31ac6` fix(auth): P0 — Google sign-in ONE same-tab redirect, popup gone
  2. `5efc779c` feat(shell): chat opens with the person's real day, button wall gone
  3. `520a8173` feat(workspace): W6 — map joins the one workspace, waiver dies
- **Necommitintas darbas (IŠSAUGOTAS, nieko neatmesta):**
  - 11 lokalių `messages/*.json` (da/de/en/et/lt/lv/nl/no/pl/ru/sv): +77 eil.
    kiekvienoje — `landing.demo`, `landing.chain`, `landing.moment`,
    `landing.proof` copy (landing rebuild žodynas)
  - `lib/guards/i18n-debt.ts` — da baseline 1216 → 1263 (+47, dokumentuota)
  - 4 nauji komponentai (`components/marketing/`): `live-product-demo.tsx`,
    `product-chain-band.tsx`, `market-moment.tsx`, `proof-band.tsx` —
    pilni, §18-sąžiningi (sample chips), reduced-motion saugūs,
    **dar niekur neimportuoti**
  - 2 e2e spec: `pr-i-reality-chat.spec.ts`, `pr-i-reality-landing.spec.ts`
    (PR-I realybės matricos artefaktai — fiksuoja IKI-rebuild realybę)
  - Audito dokumentai `docs/audits/labourmarketai-*-v1.md` (9 vnt.),
    `owner-rebuild-audit-v1.md`, planai `docs/plans/*-v1.md`,
    evidence katalogai (`owner-rebuild-before/`, `owner-rebuild-after/`,
    `pr-i-e2e-reality-v1/`)
- **Owner tikslo failas `docs/owner-goals/owner-visible-rebuild.md` NEEGZISTUOJA**
  — kanoninis planas yra `docs/audits/owner-rebuild-audit-v1.md`
  (PR A shell UX → PR B W6 map → PR C landing rebuild → QA → merge → deploy).

## Žinomi suvaržymai (guardai)

- `landing-freeze.ts` + baseline JSON: landing failai ir `landing/hero/...`
  namespace hash'ai užšaldyti (lt/en/ru). Necommitintas copy JAU laužo
  baseline → pergeneruoti per `scripts/generate-landing-freeze-baseline.ts`
  (sankcionuota: tai ir yra „explicit landing replacement" darbas).
- `global-landing.test.ts` (a): pina `live-world-map` importą hero —
  perrašyti į naują kompoziciją.
- `service-offers-baseline.test.ts`: pina LiveWorldMap/PlayerCardShowcase/
  MarketPulse/DraftBoard puslapyje — atnaujinti markerių sąrašą.
- `public-nav-canonical`: page.tsx PRIVALO turėti `/company-need`, NEGALI
  turėti `/for-companies` (hero businessLink dengia).
- Nav inkarai `/#how-it-works` ir `/#partners` privalo egzistuoti landing
  medyje (`global-landing` (c)).
- `public-evidence-integrity`: `LabourMarketEvidence` privalo likti puslapyje.
- CI = `quality` + `migration-safety`; e2e Playwright CI nevykdomas.

## Plano seka (savininko tvarka) ir būsena

| # | Etapas | Būsena |
|---|---|---|
| 1 | Stabilizuoti landing diff (pajungti 4 komponentus, guardai, green) | VYKDOMA |
| 2 | Google popup P0 patikra (edf31ac6 jau šakoje) | laukia |
| 3 | W1 mobile chip | laukia (5efc779c dalinai?) |
| 4 | W3 mobile drawer | laukia |
| 5 | W5 vienas completeness šaltinis | laukia |
| 6 | Journal chat-first | laukia |
| 7 | W6 žemėlapio patikra (520a8173 jau šakoje) | laukia |
| 8 | Top bar + mobile menu | laukia |
| 9 | W2/W4 realių veiksmų patikra | laukia |
| 10 | Landing motion + polish (tik framer-motion; 3D NEDIEGTI — dokumentuota) | laukia |
| 11 | Visual QA desktop+mobile → evidence/owner-rebuild-after | laukia |
| 12 | Merge → deploy → post-deploy patikra | laukia |

## Etapo įrašai

### 1. Landing stabilizacija — pradėta 2026-07-29

Sprendimas (nauja IA, pagal owner-rebuild-audit-v1 PR C):

- Hero dešinė: `LiveWorldMap` + `PreviewChip` → `LiveProductDemo`
  (gyva produkto seka: žinutė → žurnalo įrašas → skill signalas → match).
- `HowItWorksBand` pašalinamas; `ProductChainBand` perima `#how-it-works`
  inkarą (6 grandžių grandinė, žurnalas — pivot).
- `MarketMoment` — kontroliuoto aukščio žemėlapio momentas (vietoj sienos).
- `ProofBand` — faktas / įrodytas įgūdis / nuomonė, prieš `TrustBand`.
- Pašalinta: why-now pillars sekcija, two-paths kortelės (dubliavo hero +
  final CTA duris; `/company-need` lieka hero).
- Lieka: LiveTicker, MarketCounters, audience chips, AudienceValueSections
  (#partners), ConversationOsPanel (#conversation), LabourMarketEvidence,
  PlayerCardShowcase, DraftBoard, MarketPulse, TrustBand (#trust), FinalCtaBand.

**BAIGTA 2026-07-29.** Commitai: `f058cccb` (audito docs), `ba4a1db8`
(landing rebuild + guardai). Šaka pushinta į origin (upstream sukurtas).

Kliūtys, rastos ir išspręstos stabilizuojant:
- §18 forbidden-terms guardas skenuoja ir JSON RAKTUS → namespace
  `landing.demo` pervadintas į `landing.loop` (visos 11 lokalių; vertimų
  tekstuose savarankiško „demo" nebuvo — patikrinta ta pačia regex).
- `landing` root pridėtas į `CLIENT_MESSAGE_ROOTS` + 
  `MARKETING_CLIENT_MESSAGE_ROOTS` (client-messages-allowlist guardas).
- `global-landing.test.ts` (a) perrašytas: hero = live product demo;
  `service-offers-baseline` markeris LiveWorldMap → LiveProductDemo;
  freeze sąrašas +4 komponentai + use-mounted; baseline pergeneruotas.
- e2e `pr-i-reality-landing.spec.ts` atnaujintas į naują kompoziciją
  (world-canvas count → 0, demo/moment testid'ai).

Patikros (visos žalios): `tsc --noEmit` 0; eslint 0 errors; vitest
**780/780 failų**; `next build` sėkmingas.

Reali naršyklės patikra (production build, `next start -p 3100`,
Playwright/chromium): lt+en × 1440+390 — overflow 0 visur, demo+moment
matomi, `#how-it-works` = 1, seno world-map canvas 0.

Pakeisti failai: `app/[locale]/(marketing)/page.tsx`,
`components/marketing/{live-product-demo,product-chain-band,market-moment,proof-band}.tsx`,
`lib/i18n/client-messages.ts`, `lib/guards/{global-landing.test.ts,
service-offers-baseline.test.ts,landing-freeze.ts,landing-freeze-baseline.json,
i18n-debt.ts}`, `messages/*.json` (11), `tests/e2e/pr-i-reality-*.spec.ts`,
`scripts/capture-owner-rebuild-{after,sections}.mjs`.

Screenshotai: `docs/audits/evidence/owner-rebuild-after/`
`landing-rebuild-{lt,en}-{1440,390}-{full,hero}.png`,
`section-{chain,moment,demo-reduced,proof-title,trust}.png`.
