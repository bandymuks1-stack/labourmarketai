# Owner review — Marketplace intent separation + dashboard wording v1

**Provisional owner review before deploy. Final verdict after deploy.**

## Problem summary
`/lt/dashboard` blurred three distinct intents into one vague "poreikis / need":
buyer/client marketplace requests, company/employer hiring, and agency
candidate supply. The same "Pateikti poreikį / Submit your need" CTA was shown
for a **company hiring** as for a buyer — treating a company looking for workers
as a buyer by default. Copy-only fix; no DB / matching / AI.

## Before → after

### Buyer / client (chain-action card, `auth.dashboard.chainActions`)
| | Before | After |
|---|---|---|
| Title | Jūsų poreikių erdvė | **Pirkėjo užklausos** |
| CTA | Tvarkyti poreikius | **Mano užklausos** |
| EN title | Your requests workspace | **Buyer requests** |
| Buyer field | Poreikio aprašymas | **Užklausos aprašymas** / Request summary |

### Company / employer (pilot card + flow, intent `hire_workers`)
| | Before (generic buyer "need") | After (hiring) |
|---|---|---|
| Pilot title | Pasakykite, ko jums reikia | **Ieškoti darbuotojo ar komandos** |
| Pilot CTA | Pateikti poreikį | **Sukurti darbo pasiūlymą** |
| Flow step c1 | Apibrėžkite poreikį | **Apibrėžkite darbą** |
| Flow step c4 | Pateikti poreikį | **Sukurti darbo pasiūlymą** |
| EN CTA | Submit your need | **Create job request** |

The pilot CTA + card title are now selected by **intent** (`hire` vs `partner`)
in `pilot-request-button.tsx` and `dashboard/page.tsx`, so company hiring is
never rendered as a generic buyer request.

### Agency (intent `partner`)
| | Before | After |
|---|---|---|
| Pilot title | Pasakykite, ko jums reikia | **Pasiūlykite kandidatą ar komandą** |
| Pilot CTA | Pateikti poreikį | **Siūlyti kandidatą ar komandą** |
| EN CTA | Submit your need | **Offer a candidate or team** |

### English fallback on LT (request-flow)
`pilot-request.ts` no longer writes `"Demand submitted from the dashboard."`.
It now writes an intent-specific LT summary
(`"Darbuotojų ar komandos paieška, pateikta iš skydelio."` /
`"Kandidatų ar paslaugų pasiūla, pateikta iš skydelio."`).

### Stepper (1–4 circles)
The journey rail is already a static `<nav>` of spans (no link/button/onClick).
Added a helper line beneath it: **"Šie žingsniai rodo eigą. Aktyvūs veiksmai
pateikiami žemiau." / "These steps show progress. Active actions are shown
below."** No clickable affordance was added.

### Future modules ("Ruošiama" / coming-later)
| | Before | After |
|---|---|---|
| Title | Vėliau įjungiamos galimybės | **Vėliau įjungiami moduliai** |
| Body | …įjungtos vėliau. Kol kas jos be veikiančių mygtukų. | …įjungtos **atskirais etapais. Kol kas jos nėra aktyvūs veiksmai.** |

## Routes affected (copy only)
- `/[locale]/dashboard` (chain actions, pilot card, journey-rail helper, coming-later)
- `/[locale]/dashboard/buyer` (request-summary field label)
- `/[locale]/dashboard/company` (unchanged here — already hiring/workspace language from PRs #198/#199/#201)

## Migration status
**No migration.** Copy/i18n + component wiring only. `migration-safety`: *no migration files changed — GREEN.*

## Identifiers
- Branch: `feat/cc/marketplace-intent-separation-dashboard-wording-v1`
- Base main SHA: `217a7d2`
- Head SHA: see the PR (open, **not merged**, **not deployed**)
