# Employer campaign kit — Luxembourg, Netherlands, Denmark (v1, 2026-11-10)

Owner order 2026-11-10: employer acquisition, **P1 Luxembourg, P2 the Netherlands, P3 Denmark**.
This file is the material for those adverts. **Nothing here is launched.** The ad accounts, the
budget and the decision to publish are the owner's. No agent sends a commercial message or an offer.

The file holds no personal data: no names, e-mail addresses, phone numbers or customer lists.

## 1. Where every advert lands

One page per market: the employer version of `/for-companies` (`?market=lu|nl|dk`). Each has one
headline, three plain points and **one** call to action, which opens the company-need inquiry
(`/company-need`) with the country already chosen.

| Market | Advert languages | Page | Not yet |
|---|---|---|---|
| LU | DE, EN | `/de/for-companies?market=lu`, `/en/for-companies?market=lu` | FR: the copy below is ready, but there are no `/fr` pages yet. `employerAdLink` refuses `fr` until FR is an active locale. |
| NL | NL, EN | `/nl/for-companies?market=nl`, `/en/for-companies?market=nl` | — |
| DK | EN | `/en/for-companies?market=dk` | DA: the Danish UI is about 29% done and is not active. Do not link `/da`. |

The canonical URL and hreflang set stay those of `/for-companies`. That is deliberate: search engines
see one page, not three near-copies. Each advert version still has its own `<title>` and meta
description, in its language.

Code: `apps/web/lib/marketing/employer-markets.ts` (markets, the UTM convention, `employerAdLink`)
and its test.

## 2. What an advert may and may not say

These follow the honesty doctrine and the product as it is on 2026-11-10.

**May say** (true today):
- Submitting an inquiry is free and needs no account, only a contact e-mail.
- Nothing is published automatically.
- A person follows up on the inquiry.
- For construction inquiries, a partner company can coordinate documents and onboarding.
- If no suitable person is available yet, we say so.

**Never say:**
- How many workers are available, or any "pool" or "network" size.
- "Verified", "certified" or "vetted" workers.
- A start date, response time or placement guarantee.
- Prices, rates or savings.
- AI matching or AI anything: the language models are off.
- "Demo", "trial" or "test".

## 3. UTM convention

| Channel | utm_source | utm_medium |
|---|---|---|
| Google Ads (search) | `google` | `cpc` |
| Facebook / Instagram | `facebook` | `paid` |
| LinkedIn | `linkedin` | `paid` |

- `utm_campaign` = `<market>-employers-<variant>`, e.g. `lu-employers-v1`.
- `utm_content` = the page language (`de`, `en`, `nl`).

So the admin conversion read-out (campaign × content) splits every market by language without extra
tags. Variants are lowercase letters, digits and hyphens, at most 40 characters.

### Ready links (variant `v1`)

LU:
- Google DE: `https://labourmarket.ai/de/for-companies?market=lu&utm_source=google&utm_medium=cpc&utm_campaign=lu-employers-v1&utm_content=de`
- Google EN: `https://labourmarket.ai/en/for-companies?market=lu&utm_source=google&utm_medium=cpc&utm_campaign=lu-employers-v1&utm_content=en`
- Facebook DE: `https://labourmarket.ai/de/for-companies?market=lu&utm_source=facebook&utm_medium=paid&utm_campaign=lu-employers-v1&utm_content=de`
- LinkedIn DE: `https://labourmarket.ai/de/for-companies?market=lu&utm_source=linkedin&utm_medium=paid&utm_campaign=lu-employers-v1&utm_content=de`
- LinkedIn EN: `https://labourmarket.ai/en/for-companies?market=lu&utm_source=linkedin&utm_medium=paid&utm_campaign=lu-employers-v1&utm_content=en`

NL:
- Google NL: `https://labourmarket.ai/nl/for-companies?market=nl&utm_source=google&utm_medium=cpc&utm_campaign=nl-employers-v1&utm_content=nl`
- Google EN: `https://labourmarket.ai/en/for-companies?market=nl&utm_source=google&utm_medium=cpc&utm_campaign=nl-employers-v1&utm_content=en`
- Facebook NL: `https://labourmarket.ai/nl/for-companies?market=nl&utm_source=facebook&utm_medium=paid&utm_campaign=nl-employers-v1&utm_content=nl`
- LinkedIn NL: `https://labourmarket.ai/nl/for-companies?market=nl&utm_source=linkedin&utm_medium=paid&utm_campaign=nl-employers-v1&utm_content=nl`

DK:
- Google EN: `https://labourmarket.ai/en/for-companies?market=dk&utm_source=google&utm_medium=cpc&utm_campaign=dk-employers-v1&utm_content=en`
- LinkedIn EN: `https://labourmarket.ai/en/for-companies?market=dk&utm_source=linkedin&utm_medium=paid&utm_campaign=dk-employers-v1&utm_content=en`

## 4. Offer and audience (all three markets)

**Who:** construction contractors and subcontractors, and companies looking for specialists:
welders, electricians, carpenters and scaffolders.

**Offer:** describe the people you need, how many, where and from when, in one free inquiry. A
person follows up.

**Audiences** (to be set in the owner's ad accounts):
- **LinkedIn:**
  - Location: LU / NL / DK.
  - Company industry: Construction, Civil Engineering, Building Construction, Specialty Trade Contractors.
  - Company size: 11–500.
  - Job titles: project manager, site manager, construction manager, operations manager, purchasing manager, managing director.
- **Meta:**
  - Location: LU / NL / DK.
  - Interests: construction, general contractor, civil engineering, building.
  - Exclude job-seeker interests where offered.
  - Luxembourg is a small audience, so expect high frequency.
- **Google search:** the keywords below, with the negative list. Use location targeting
  "presence: people in or regularly in" the country.

## 5. Google Ads — keywords and responsive search ads

### LU — German
- **Keywords** (phrase match):
  - "Fachkräfte Luxemburg"
  - "Schweißer Luxemburg"
  - "Elektriker Baustelle Luxemburg"
  - "Gerüstbauer Luxemburg"
  - "Zimmerer Luxemburg"
  - "Bauarbeiter Luxemburg"
  - "Subunternehmer Bau Luxemburg"
- **Headlines** (≤ 30 characters):
  - Fachkräfte für Luxemburg
  - Schweißer oder Elektriker?
  - Anfrage kostenlos senden
  - Zimmerer und Gerüstbauer
  - Für Bau- und Subunternehmen
- **Descriptions** (≤ 90 characters):
  - Beschreiben Sie, welche Fachkräfte Sie wo und ab wann brauchen. Ein Mensch meldet sich.
  - Kostenlose Anfrage, nichts wird automatisch veröffentlicht. Kein Treffer? Wir sagen es.

### LU — English
- **Keywords:**
  - "construction workers luxembourg"
  - "welders luxembourg"
  - "hire electricians luxembourg"
  - "scaffolders luxembourg"
  - "construction subcontractors luxembourg"
- **Headlines:**
  - Skilled trades in Luxembourg
  - Need welders or electricians?
  - Free workforce inquiry
  - Carpenters and scaffolders
  - For contractors and subs
- **Descriptions:**
  - Tell us which specialists you need, where and from when. A person follows up.
  - Free to submit. Nothing is published automatically. No match yet? We say so.

### LU — French (HOLD: publish only when `/fr` is live)
- **Keywords:**
  - "soudeur luxembourg"
  - "électricien bâtiment luxembourg"
  - "main d'oeuvre bâtiment luxembourg"
  - "échafaudeur luxembourg"
  - "sous-traitant construction luxembourg"
- **Headlines:**
  - Ouvriers qualifiés Luxembourg
  - Besoin de soudeurs ?
  - Demande gratuite
  - Charpentiers, échafaudeurs
  - Pour le bâtiment
- **Descriptions:**
  - Dites-nous quels spécialistes il vous faut, où et à partir de quand. Une personne répond.
  - Demande gratuite, rien n’est publié automatiquement. Aucun profil adapté ? Nous le disons.

### NL — Dutch
- **Keywords:**
  - "lassers inhuren"
  - "elektriciens inhuren"
  - "timmerlieden inhuren"
  - "steigerbouwers inhuren"
  - "bouwpersoneel inhuren"
  - "onderaannemer bouw"
  - "vakmensen bouw"
- **Headlines:**
  - Vakmensen voor de bouw
  - Lassers of elektriciens nodig?
  - Gratis aanvraag versturen
  - Timmerlieden, steigerbouwers
  - Voor (onder)aannemers
- **Descriptions:**
  - Beschrijf welke vakmensen u nodig hebt, waar en vanaf wanneer. Een mens neemt contact op.
  - Gratis aanvraag, niets wordt automatisch gepubliceerd. Geen match? Dan zeggen we dat.

### NL — English
- **Keywords:**
  - "hire welders netherlands"
  - "construction workers netherlands"
  - "scaffolders netherlands"
- **Headlines:** as LU English, with "Skilled trades, Netherlands" as the first.
- **Descriptions:** as LU English.

### DK — English
- **Keywords:**
  - "hire welders denmark"
  - "construction workers denmark"
  - "electricians denmark contractor"
  - "scaffolders denmark"
- **Headlines:** as LU English, with "Skilled trades in Denmark" as the first.
- **Descriptions:** as LU English.
- Danish search terms such as "svejsere" or "stilladsbyggere" would land a Danish searcher on an
  English page. Test them only as a separate ad group, and only if the owner accepts the mismatch.

### Negative keywords (every market)
These keep job seekers out, because these adverts are for employers:
- English: job, jobs, vacancy, salary, cv, training, course.
- German: Stelle, Gehalt, Ausbildung.
- French: emploi, salaire, formation.
- Dutch: vacature, salaris, opleiding.
- Danish: job, løn, uddannelse.

## 6. Facebook and LinkedIn copy

**LU — German**
- Text: Bau- oder Subunternehmen in Luxemburg? Beschreiben Sie, welche Fachkräfte Sie brauchen — Schweißer, Elektriker, Zimmerer, Gerüstbauer —, wie viele, wo und ab wann. Die Anfrage ist kostenlos, und ein Mensch meldet sich.
- Headline: Fachkräfte für Ihre Baustellen in Luxemburg
- Button: Mehr erfahren

**LU / NL / DK — English**
- Text: A construction contractor or subcontractor in Luxembourg? Tell us which specialists you need — welders, electricians, carpenters, scaffolders — how many, where and from when. The inquiry is free, and a person follows up.
- Headline: Skilled trades for your sites in Luxembourg
- Button: Learn more
- For the other markets, replace "Luxembourg" with "the Netherlands" or "Denmark".

**NL — Dutch**
- Text: Aannemer of onderaannemer in Nederland? Beschrijf welke vakmensen u nodig hebt — lassers, elektriciens, timmerlieden, steigerbouwers — hoeveel, waar en vanaf wanneer. De aanvraag is gratis en een mens neemt contact op.
- Headline: Vakmensen voor uw bouwplaatsen in Nederland
- Button: Meer informatie

**LU — French** (HOLD until `/fr` is live)
- Text: Entreprise de construction ou sous-traitant au Luxembourg ? Dites-nous quels spécialistes il vous faut — soudeurs, électriciens, charpentiers, échafaudeurs —, combien, où et à partir de quand. La demande est gratuite et une personne vous répond.
- Headline: Des spécialistes pour vos chantiers au Luxembourg

## 7. What is measured, and its limits

- **Before analytics consent, nothing is stored or sent.** Counts are therefore a lower bound.
  Compare them with the clicks the ad platform reports, never treat them as the total.
- **After consent:**
  - `landing_viewed` carries audience `companies`, the landing path and the five `utm_*` values.
  - `cta_clicked` carries `cta_id = companies_market_<m>`.
  - `company_need_started` carries **no** `utm_*` values, only the audience. Tie it to a campaign
    through its `session_id`, which it shares with that visit's `landing_viewed` and `cta_clicked`.
  - `company_need_submitted` carries the first-touch `utm_*` values and `landing_path`. It is
    sent only when the inquiry was really stored.
  - Neither event holds the stored inquiry's id. To find the inquiry behind a submitted event,
    match `company_need_public_intakes` on time (within seconds), `source_path` and country.
  - The inquiry's `locale` column holds only `lt`, `en` or `ru` today. A German or Dutch
    inquiry is stored as `lt`, so read the language from `source_path` (`/de/company-need`).
- **Where to read it:** the admin conversion funnel. The campaign table groups by `utm_campaign` and
  `utm_content`.
- **No third-party pixel, tag or tracker** (Google tag, Meta pixel, LinkedIn Insight) is installed.
  Adding one is a privacy change: it needs a separate owner decision and a consent-text change. This
  kit does not add one.
- **Platform conversion tracking** (e.g. Google Ads "conversions") is therefore not available yet.
  Optimise for clicks, or wait for that decision.
