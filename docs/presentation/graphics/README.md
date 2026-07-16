# Grafikų inventorius

Kiekvienas reikalaujamas grafikas ir kur jis gyvena. Trys formos:
**SVG** = savarankiškas, temos atžvilgiu adaptyvus failas `../svg/` (pakartotinai
naudojamas); **Denio komponentas** = realizuotas `../presentation.html` HTML/CSS
(pakartotinai naudojamas komponentų sistemoje); **Mermaid** = redaguojamas
šaltinis `../diagrams/` (dizaineriui/dev regeneruoti).

| # | Grafikas | Forma | Failas / vieta |
|---|---|---|---|
| 1 | Platformos architektūra | SVG + Mermaid | `../svg/platform-architecture.svg` · `../diagrams/platform-architecture.md` |
| 2 | Verifikacijos modelis | SVG + Mermaid | `../svg/verification-model.svg` · `../diagrams/verification-model.md` |
| 3 | Paaiškinamas atitikimas | SVG + Mermaid | `../svg/matching-engine.svg` · `../diagrams/matching-engine.md` |
| 4 | Pasitikėjimo flywheel | SVG + Mermaid | `../svg/flywheel.svg` · `../diagrams/flywheel.md` |
| 5 | Plėtros modelis (sektoriai + rinkos) | SVG + Mermaid | `../svg/expansion-roadmap.svg` · `../diagrams/expansion-roadmap.md` |
| 6 | Parengties suvestinė | SVG | `../svg/readiness-dashboard.svg` |
| 7 | Logotipo lockup | SVG | `../assets/logo-lockup.svg` |
| 8 | Daugiasektorė tinklelis | Denio komponentas | `presentation.html` skaidrė 04 (sektorių juosta) + architektūros SVG |
| 9 | Pasitikėjimo modelis (metrikos) | Denio komponentas | `presentation.html` skaidrė 10 (metric row: 26/26 · PII=0 · RLS · audit) |
| 10 | AI architektūra (human-in-loop) | Denio komponentas | `presentation.html` skaidrė 15 (two-column principas) |
| 11 | Rinkos žvalgyba | Denio komponentas | `presentation.html` skaidrė 15 · executive-dashboard.md |
| 12 | Darbuotojo kelias | Denio komponentas | `presentation.html` skaidrė 05 (journey) |
| 13 | Darbdavio kelias | Denio komponentas | `presentation.html` skaidrė 06 (journey) |
| 14 | Agentūros kelias | Denio komponentas | `presentation.html` skaidrė 07 |
| 15 | Piloto piltuvas | Denio komponentas + Mermaid | `presentation.html` skaidrė 16 · `../diagrams/pilot-funnel.md` |
| 16 | Pajamų / komercinis piltuvas | Denio komponentas | `presentation.html` skaidrės 18–19 (lentelė + scenarijai) |
| 17 | Laiko juosta (fazės) | Denio komponentas | `presentation.html` skaidrė 21 (timeline) |
| 18 | Duomenų srautas | Mermaid | `../diagrams/data-flow.md` |

## Nuoseklumo taisyklės

- Visi SVG dalijasi ta pačia paletės ir tipografijos gramatika (žr.
  `../design-system.md`) ir yra temos atžvilgiu adaptyvūs
  (`@media (prefers-color-scheme:dark)` viduje).
- Vienas akcentas (kobaltas) per grafiką; „✓" — verifikacijos žalia;
  struktūra — plaukų linijos.
- Statybų/LT pavyzdžiai — visada pažymėti „pirmasis pilotas".
- Jokių netikrų ekrano nuotraukų, clipart ar dekoratyvių gradientų.
