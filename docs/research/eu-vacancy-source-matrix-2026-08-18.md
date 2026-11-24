# EU / EEA vacancy + employer source matrix — 2026-08-18

**TRAIN G — research only. No code was changed by this document.**

## Why this exists

Production today ingests exactly one provider: `arbetsformedlingen` (Swedish
Public Employment Service via JobTech), 44,113 vacancies, all `country=SE`.
This matrix is the evidence base for choosing the next providers.

## Evidence rule applied here

Every row below is marked with how it was evidenced:

- **FETCHED** — I retrieved the cited page/endpoint myself and the claim comes
  from its content.
- **SEARCH-ONLY** — the claim comes from a search result snippet, not a page I
  fetched. Treated as weaker.
- **UNCONFIRMED** — I could not confirm the thing exists. Not a "no"; a "not
  proven". No endpoint is invented anywhere in this document.

No recommendation in this document involves CAPTCHA bypass, login bypass,
anti-bot evasion, session/cookie reuse, or identity rotation. Where a source's
own terms forbid automated access, the recommendation is **REJECT**, not
"work around it".

## Fit against the existing provider contract

Read first: `apps/web/lib/vacancy-sources/vacancy-provider-registry.ts`.
A new country is a descriptor: bare `host` + `path`, one of five `pagination`
modes (`none` | `offset_limit` | `cursor` | `time_window` | `record_offset`),
`bodyFormat` `json` | `json_lines`, `requiresApiKey`, and a provider-declared
`cadence`. Anything that is not HTTPS-GET-JSON needs a new transport, which is
a much larger change than a descriptor row. That is called out per source under
"implementation effort".

Two sources below need transport work the pipeline does not have today:

- **SOAP/XML** (Poland, Denmark) — the adapter is JSON-only.
- **CSV** (Latvia) — same.

---

# SUMMARY TABLE

| # | Country | Operator | Type | Auth | Cost | Jobs | Employers | Contacts | Effort | Priority | Evidence |
|---|---------|----------|------|------|------|------|-----------|----------|--------|----------|----------|
| 0 | SE | Arbetsförmedlingen / JobTech | OPEN API | none | free | yes | yes | partial | — LIVE — | — | in production |
| 1 | LT | Užimtumo tarnyba | OPEN API (Spinta) | none | free | yes | yes | yes | S | **P0** | FETCHED |
| 2 | CZ | MPSV / Úřad práce ČR | OPEN DATA (JSON+JSON-LD+SPARQL) | none | free | yes | yes | yes | M | **P0** | FETCHED |
| 3 | NO | NAV | DOCUMENTED FEED | bearer JWT | free | yes | yes | yes | S–M | **P0** | FETCHED |
| 4 | FR | France Travail | OFFICIAL API | OAuth client creds | free | yes | yes | restricted | M | **P0** | FETCHED |
| 5 | BE-VL | VDAB | OFFICIAL API | portal key + request | free | yes | yes | unknown | M | **P1** | FETCHED |
| 6 | DK | STAR (Jobnet) | WEBSERVICE (SOAP) | signed agreement | free | yes | yes | unknown | L | P1 | FETCHED |
| 7 | FI | KEHA / Työmarkkinatori | OFFICIAL API | OAuth2 (Azure B2C) | free | yes | yes | unknown | M–L | P1 | FETCHED |
| 8 | PL | MRPiPS / CBOP | WEBSERVICE (SOAP) | none stated | free | yes | yes | unknown | L | P1 | FETCHED |
| 9 | LV | NVA | OPEN DATA (CSV) | none | free | yes (public sector only) | yes | unknown | S | P2 | FETCHED |
| 10 | EU | ELA / EURES portal | UNDOCUMENTED JSON (unofficial) | none | free | yes | partial | no | M | P2 | FETCHED |
| 11 | ES-GA | Xunta de Galicia (SPEG) | RSS FEED | none | free | yes | partial | no | S | P2 | FETCHED |
| 12 | NL | UWV | OPEN DATA — **aggregate only** | none | free | **no** | no | no | — | P2 (not a supply source) | FETCHED |
| 13 | ES | SEPE | — no vacancy-level open data — | — | — | **no** | no | no | — | P2 | FETCHED |
| 14 | AT | AMS | UNCONFIRMED | ? | ? | ? | ? | ? | ? | P2 | SEARCH-ONLY |
| 15 | EE | Töötukassa | UNCONFIRMED | ? | ? | ? | ? | ? | ? | P2 | SEARCH-ONLY |
| 16 | IE | DSP / JobsIreland | UNCONFIRMED | ? | ? | ? | ? | ? | ? | P2 | FETCHED (negative) |
| 17 | DE | Bundesagentur für Arbeit | **LEGALLY UNSUITABLE — REJECT** | — | — | — | — | — | — | **REJECT** | FETCHED |

---

# FULL RECORDS

## 1. LITHUANIA — **P0**

| field | value |
|---|---|
| country | LT |
| authority / operator | Užimtumo tarnyba prie LR SADM (Lithuanian Employment Service); served through Valstybės duomenų agentūra's open-data platform |
| source name | "Užimtumo tarnybos skelbiamos laisvos darbo vietos" (`gov/uzt/ldv`) |
| type | **OFFICIAL OPEN API** (Spinta, HTTPS GET JSON/JSONL) |
| endpoint / docs | `https://get.data.gov.lt/datasets/gov/uzt/ldv` (model listing, FETCHED); `https://get.data.gov.lt/datasets/gov/uzt/ldv/:all/:format/jsonl`; `.../:all/:format/json`; `.../Vieta/:format/json` (live query FETCHED); catalogue entry `https://data.gov.lt/datasets/2894/` (403 to my fetcher; mirrored at data.europa.eu, FETCHED) |
| auth required | **no** — no credential was needed for the live query I ran |
| cost | free |
| rate limits | none published on the pages I fetched — UNCONFIRMED |
| licence / terms | **CC BY 4.0** (per the data.europa.eu record for this dataset, FETCHED) |
| attribution required | **yes** (CC BY) |
| jobs? | yes — full ad record incl. `profesijos_pareigybes_pav`, `darbo_aprasymas_lt`, salary min/avg/max, validity dates |
| employers? | yes — `darbdavys`, `darbdavio_bustine` |
| public contact channels? | **yes** — `darbdavio_tel_nr`, `darbdavio_kontaktinis_asmuo` are in the payload |
| expected yield | corpus spans **1990 → present**, so total rows are large but mostly archived. Live-active count **UNCONFIRMED** — the sample record I pulled was `statusas: "archyvuota"` with currency `LTL`. There is an `ar_aktuali_siandien` ("is current today") flag; the active subset must be filtered on it |
| implementation effort | **S** — best contract fit of any source found. `bodyFormat: "json_lines"` already exists for the JSONL distribution; paging is a continuation token in `_page.next`, which maps directly to `pagination: "cursor"` |
| maintenance risk | low–medium. The portal itself warns the Spinta backend is "actively developed"; field names are Lithuanian and stable-looking but unversioned |
| legal risk | **low**. CC BY 4.0. Caveat: the feed carries a named employer contact person + phone — personal data. Do not surface those fields in the anonymous public preview |
| recommended priority | **P0** — highest yield-per-effort of everything surveyed |

## 2. CZECHIA — **P0**

| field | value |
|---|---|
| country | CZ |
| authority / operator | Ministerstvo práce a sociálních věcí (MPSV); data originates in Úřad práce ČR's AIS / JPŘ PSV |
| source name | "Volná místa za celou ČR" + "Přírůstky volných míst za celou ČR" (daily increments) |
| type | **OPEN DATA** — bulk JSON / JSON-LD, plus a SPARQL endpoint |
| endpoint / docs | full: `https://data.mpsv.cz/od/soubory/volna-mista/volna-mista.json` (FETCHED — see size note); JSON-LD `.../volna-mista.jsonld`; schema `.../volna-mista.schema.json` (FETCHED); increments schema `https://data.mpsv.cz/od/soubory/volna-mista-prirustek/volna-mista-prirustek.schema.json`; dataset pages `https://data.mpsv.cz/web/data/volna-mista-za-celou-cr` and `.../prirustky-volnych-mist-za-celou-cr` (both FETCHED); SPARQL `https://data.mpsv.cz/sparql/` |
| auth required | **no** |
| cost | free |
| rate limits | none published — UNCONFIRMED |
| licence / terms | machine-readable conditions-of-use node at `https://data.gov.cz/zdroj/datové-sady/00551023/adb4b3fb85cd2e96ee508e4e5a78b567/distribuce/2da84b0d758d2186c8457506393bba70/podmínky-užití` — I could **not** read its contents (the fetcher returned only a link prompt). Exact licence **UNCONFIRMED**; must be resolved before activation |
| attribution required | UNCONFIRMED (pending the licence node above) |
| jobs? | yes — `pozadovanaProfese`, `pocetMist`, `mesicniMzdaOd/Do`, `typMzdy`, start date, reference number |
| employers? | yes — `zamestnavatel.nazev` + `zamestnavatel.ico` (company registration number). **IČO is a genuine differentiator**: it joins straight to the Czech business register |
| public contact channels? | **yes** — `prvniKontaktSeZamestnavatelem` carries `komuSeHlasit` (named person, title, position) and `kdeSeHlasit` (address, phone, email) |
| expected yield | tens of thousands (Úřad práce national register). Exact count UNCONFIRMED. Note the page states some vacancies are published **without** employer identity at the employer's request |
| implementation effort | **M**. The full file is a single non-paginated `{ "polozky": [...] }` document and it **exceeded a 10 MiB read cap during my fetch** — real size UNCONFIRMED but definitely >10 MiB, i.e. near or over the pipeline's `maxResponseBytes`. Practical shape: one cold-start ingest of the full file, then the **daily increments file as the recurring channel** (records inserted/changed/deleted on the date in the filename). The increments file is date-addressed, which maps to `pagination: "time_window"` with a 1-day width; there is no finer granularity |
| maintenance risk | low — plain daily files, stable schema published alongside |
| legal risk | **medium until the licence node is read.** Also: this feed contains named contact persons with direct email/phone. Personal data — must not reach the anonymous public preview |
| recommended priority | **P0**, gated on reading the conditions-of-use node |

## 3. NORWAY — **P0**

| field | value |
|---|---|
| country | NO |
| authority / operator | NAV (Arbeids- og velferdsetaten) — `arbeidsplassen.nav.no` |
| source name | NAV Job Vacancy Feed (`pam-stilling-feed`) |
| type | **DOCUMENTED FEED** (official, versioned, OpenAPI) |
| endpoint / docs | docs `https://navikt.github.io/pam-stilling-feed/` (FETCHED); base `https://pam-stilling-feed.nav.no/api/v1/`; public token `https://pam-stilling-feed.nav.no/api/publicToken`; terms `https://arbeidsplassen.nav.no/vilkar-api` (FETCHED) |
| auth required | **yes** — signed JWT bearer. A **public token** exists (rotates irregularly, no registration). A **private token** requires emailing `nav.team.arbeidsplassen@nav.no` with company + contact details and written acceptance of the terms |
| cost | free |
| rate limits | not specified in the docs — UNCONFIRMED |
| licence / terms | `arbeidsplassen.nav.no/vilkar-api`. Republication **is** permitted, including statistical/analytical use |
| attribution required | not stated in the terms text I fetched |
| jobs? | yes — title, description, employment type, occupation categories, position count, publication/expiry, application URL |
| employers? | yes — employer name, **organisasjonsnummer**, business description, work address down to municipality |
| public contact channels? | yes — contact information is a documented field, but see obligations |
| expected yield | NAV states its database holds the majority of publicly advertised Norwegian vacancies since ~2019 (Finn.no excluded). Absolute count UNCONFIRMED |
| implementation effort | **S–M**. JSON over HTTPS with a cursor-style feed → fits `pagination: "cursor"`. The one new thing is `requiresApiKey: true` with a **rotating** public token, or a provisioned private token — the descriptor already models `requiresApiKey`, but token rotation is new operational surface |
| maintenance risk | medium — token rotation on the public token; private token removes that risk |
| legal risk | **medium — obligations are ongoing, not one-off.** The terms require: (a) ads removed from NAV must be **immediately** removed from our result lists; (b) ads updated in the API must be updated immediately; (c) the "apply" function must **deep-link back to the original system supplier's application function**. NAV also flags not exposing contact information for inactive vacancies. Our public preview therefore needs an active expiry/takedown loop, not just an importer |
| recommended priority | **P0** |

## 4. FRANCE — **P0**

| field | value |
|---|---|
| country | FR |
| authority / operator | France Travail (ex-Pôle emploi) |
| source name | API Offres d'emploi v2 |
| type | **OFFICIAL OPEN API** |
| endpoint / docs | `https://francetravail.io/data/api/offres-emploi` (JS-rendered; my fetch returned no content); catalogue `https://francetravail.io/produits-partages/catalogue/offres-emploi`; registration `https://francetravail.io/inscription`; **official dataservice record FETCHED** at `https://www.data.gouv.fr/api/1/dataservices/api-offres-demploi/` |
| auth required | **yes** — account registration on francetravail.io, then OAuth2 client-credentials. Search-only detail: the reuse conditions are published as a dedicated "licence de réutilisation de la base de données des offres d'emploi" |
| cost | free |
| rate limits | **10 calls / second** (FETCHED from the data.gouv.fr dataservice record) |
| licence / terms | reuse licence for the France Travail job-offer database. Per SEARCH-ONLY evidence: offers "may be reused for any purpose and in particular redistributed to third-party sites", and a derived database must be provided under the same licence or later. **Read the licence PDF before activation** |
| attribution required | likely (share-alike-style licence) — UNCONFIRMED in exact wording |
| jobs? | yes — real-time offers collected by France Travail and its partners |
| employers? | yes |
| public contact channels? | **restricted.** SEARCH-ONLY evidence states that where an employer's contact data is visible on francetravail.fr, the **employer's consent** is required for use and distribution of that contact data through the API. Treat contact fields as not-redistributable by default |
| expected yield | large (national PES for France). Exact count UNCONFIRMED |
| implementation effort | **M** — JSON/REST, `offset_limit`-style range paging, plus an OAuth2 token exchange the adapter does not have today. Token acquisition is genuinely new code, not a descriptor row |
| maintenance risk | low–medium |
| legal risk | **low for the ad body, medium for contact fields.** The redistribution permission is the strongest of any source here; the contact-consent carve-out is the thing to honour |
| recommended priority | **P0** |

## 5. BELGIUM (FLANDERS) — P1

| field | value |
|---|---|
| country | BE (Flanders / Dutch-speaking region) |
| authority / operator | VDAB (Vlaamse Dienst voor Arbeidsbemiddeling en Beroepsopleiding) |
| source name | "Vacature" API (v4.1.3 / v4.2.0) on the VDAB Open Services developer portal |
| type | **OFFICIAL OPEN API** (REST) |
| endpoint / docs | portal `https://developer.vdab.be/openservices/` and product list `https://developer.vdab.be/openservices/product` (FETCHED — confirms "Vacature 4.2.0", "Vacature 4.1.3", "Vacature Posting 1.0.2", plus CV, Profiel, Opleiding, Competent); service overview `https://werkgevers.vdab.be/openservices` (FETCHED) |
| auth required | **yes** — developer-portal account + subscription. For most services (Vacature included) VDAB requires an online request form and a "discovery conversation" before granting docs/credentials. The Competent competency API alone is instant-access open data |
| cost | free ("most APIs are provided at no charge") |
| rate limits | UNCONFIRMED |
| licence / terms | condition stated on the VDAB page: "the data exchange must be intended for professional purposes and provide added value for both parties" |
| attribution required | **yes (requested)** — "VDAB requests that external sites displaying job listings acknowledge VDAB as the source" |
| jobs? | yes — retrieve vacancies from VDAB's database, filter, and display on your own site in your own branding (this is VDAB's own described use case, which is close to ours) |
| employers? | yes |
| public contact channels? | UNCONFIRMED (docs are behind the approval gate) |
| expected yield | Flanders-scale. Exact count UNCONFIRMED |
| implementation effort | **M** — REST/JSON, so transport fits; the cost is the human approval loop before we can even read the spec |
| maintenance risk | low |
| legal risk | **low.** This is the only source whose operator explicitly describes third-party re-display in own branding as the intended use. Attribution must be rendered |
| recommended priority | **P1** — high confidence, but blocked on an approval conversation, so it cannot be the first one built |

Note: Belgium is federal. VDAB covers Flanders only. **Le Forem** (Wallonia) and **Actiris** (Brussels) were not researched in this pass — open gap.

## 6. DENMARK — P1

| field | value |
|---|---|
| country | DK |
| authority / operator | Styrelsen for Arbejdsmarked og Rekruttering (STAR) — Jobnet.dk |
| source name | JobAD webservice (import + export of jobannoncer) |
| type | **DOCUMENTED WEBSERVICE** (SOAP; the guide names `SearchJob` and `GetJob`) |
| endpoint / docs | official access page `https://star.dk/digital-service/saadan-arbejder-vi-med-it-i-styrelsen/oversigt-over-digitale-platforme-for-eksterne-brugere/styrelsen-for-arbejdsmarked-og-rekrutterings-webservices-og-wiki/jobnet-webservice/webservice-til-import-og-eksport-af-jobannoncer/` (FETCHED); integration wiki `https://starwiki.atlassian.net/wiki/spaces/FYS/pages/87916748/` (fetched but body truncated — endpoint URLs not obtained) |
| auth required | **yes** — a binding *tilslutningsaftale* (connection agreement) must be signed before test-environment access. Certificate-based auth is referenced in third-party integration notes (SEARCH-ONLY) |
| cost | **free to use**; STAR gives 5 free support hours, further vendor support is billed hourly |
| rate limits | UNCONFIRMED |
| licence / terms | governed by the signed connection agreement — text not public, so redistribution terms are **UNCONFIRMED** |
| attribution required | UNCONFIRMED |
| jobs? | yes — STAR describes the service as explicitly supporting "import [of] announcements for display on their own job portals or websites" |
| employers? | yes (implied by the ad payload) — UNCONFIRMED in detail |
| public contact channels? | UNCONFIRMED |
| expected yield | national (Jobnet is Denmark's official portal). Exact count UNCONFIRMED |
| implementation effort | **L** — SOAP/XML plus certificate auth. The pipeline is JSON-only today; this is a new transport, not a descriptor row |
| maintenance risk | medium (SOAP, versioned contract, external agreement) |
| legal risk | medium — everything hinges on unread agreement text |
| recommended priority | **P1** — legitimate and explicitly designed for our use case, but the highest build cost of the confirmed set. Start the `spoc@star.dk` conversation early since it gates everything |

## 7. FINLAND — P1

| field | value |
|---|---|
| country | FI |
| authority / operator | KEHA-keskus / ELY (Työmarkkinatori — Job Market Finland) |
| source name | Job posting **retrieval** interface (noutorajapinta); a separate import interface exists |
| type | **OFFICIAL API** (REST/JSON) |
| endpoint / docs | overview `https://tyomarkkinatori.fi/en/instructions-and-support/interfaces/interfaces-for-job-postings` (FETCHED); interface guide PDF `https://tyomarkkinatori.fi/en/dam/jcr:6193a157-9813-4e92-88b4-199f57edfda0/noutorajapintaohje-en.pdf` (FETCHED); production base `https://integraatiot.tyomarkkinatori.fi/` |
| auth required | **yes** — OAuth2 client-credentials via Azure AD B2C (`https://tedigib2c.b2clogin.com/tedigib2c.onmicrosoft.com/B2C_1A_SIGNIN/oauth2/v2.0/token`). Access rights are bound to the consumer's **Finnish business ID (Y-tunnus)** |
| cost | free |
| rate limits | UNCONFIRMED |
| licence / terms | a separate "terms of use for job posting APIs" page exists and must be accepted on the activation form; text **UNCONFIRMED** — the PDF I read stated no reuse restriction, but it is not the terms document |
| attribution required | UNCONFIRMED |
| jobs? | yes |
| employers? | yes |
| public contact channels? | UNCONFIRMED |
| expected yield | national. Exact count UNCONFIRMED |
| implementation effort | **M–L** — REST/JSON transport fits, but onboarding is: activation form → KEHA eligibility check → test credentials → notify KEHA → production credentials. **The business-ID binding is the real risk**: it is not obvious that a non-Finnish entity qualifies |
| maintenance risk | medium |
| legal risk | medium (terms unread; eligibility unproven) |
| recommended priority | **P1**, with an early eligibility question to `tmt-rajapinnat.keha@ely-keskus.fi` |

## 8. POLAND — P1

| field | value |
|---|---|
| country | PL |
| authority / operator | Ministerstwo Rodziny, Pracy i Polityki Społecznej — Centralna Baza Ofert Pracy (CBOP), pooling all powiat labour offices |
| source name | "Oferty pracy PSZ" (dane.gov.pl dataset 538) |
| type | **DOCUMENTED WEBSERVICE** (SOAP/WSDL), catalogued as open data |
| endpoint / docs | dataset `https://api.dane.gov.pl/1.4/datasets/538` (FETCHED); resources `https://api.dane.gov.pl/1.4/datasets/538/resources` (FETCHED); **WSDL v1** `http://oferty.praca.gov.pl/integration/services/oferta?wsdl`; **WSDL v2 (current)** `http://oferty.praca.gov.pl/integration/services/v2/oferta?wsdl`; instructions PDF `https://api.dane.gov.pl/resources/28815,instrukcja-pobierania-danych-z-cbop/file` (FETCHED); conditions DOCX `https://api.dane.gov.pl/resources/34232,warunki-udostepniania-informacji-o-ofertach-pracy-z-cbop/file` (fetched but binary — **not read**) |
| auth required | none stated in the material I read — UNCONFIRMED |
| cost | free |
| rate limits | UNCONFIRMED |
| licence / terms | **CC BY 4.0** on the dane.gov.pl dataset record (FETCHED). A separate "Warunki udostępniania informacji o ofertach pracy z CBOP" document exists and I could not read it — **read it before activation** |
| attribution required | **yes** (CC BY 4.0) |
| jobs? | yes — the ministry's own description is a WebService "enabling external entities to retrieve information about job offers published in CBOP in an automated manner". Automated retrieval is the *stated purpose* |
| employers? | yes (implied) — UNCONFIRMED in field detail |
| public contact channels? | UNCONFIRMED |
| expected yield | national, all powiat offices pooled. Exact count UNCONFIRMED |
| implementation effort | **L** — SOAP/XML. New transport. Also note the WSDL URLs are advertised as `http://`, which must be verified as available over HTTPS before any use |
| maintenance risk | medium — two live service versions, XML contract |
| legal risk | **low on licence** (CC BY 4.0, explicitly automation-friendly), **unknown on the separate conditions document** |
| recommended priority | **P1** — best licence posture after Lithuania, worst transport fit |

## 9. LATVIA — P2

| field | value |
|---|---|
| country | LV |
| authority / operator | Nodarbinātības valsts aģentūra (NVA) |
| source name | "Vakances" (data.gov.lv) |
| type | **OPEN DATA** (CSV file, daily) |
| endpoint / docs | CKAN package `https://data.gov.lv/dati/api/3/action/package_show?id=vakances` (FETCHED); dataset page `https://data.gov.lv/dati/eng/dataset/vakances` (FETCHED); resource `https://data.gov.lv/dati/dataset/cb6831cb-1d89-44a3-b889-b43c411df4fe/resource/7f68f6fc-a0f9-4c31-b43c-770e97a06fda/download/vakances-2026-08-18.csv` |
| auth required | **no** |
| cost | free |
| rate limits | none published |
| licence / terms | **CC0-1.0** — the most permissive licence in this survey. Flagged by the portal as a high-value dataset |
| attribution required | **no** (CC0) |
| jobs? | yes — **but scope-limited**: the description is "aktuālās vakances Latvijas **valsts sektorā**" (current vacancies in Latvia's **public sector**) |
| employers? | yes |
| public contact channels? | UNCONFIRMED |
| expected yield | **small.** The daily CSV was 368,686 bytes on 2026-08-18 — order of hundreds to low thousands of rows, not tens of thousands. Latvia's full vacancy set lives in the NVA CVVP portal (`cvvp.nva.gov.lv`), which has **no confirmed open API** |
| implementation effort | **S on transport-if-CSV-supported, M otherwise** — the pipeline has no CSV reader today |
| maintenance risk | low. One wrinkle: the resource URL embeds the date (`vakances-2026-08-18.csv`), so the descriptor's `path` cannot be static — resolve via the CKAN `package_show` call each run |
| legal risk | **very low** (CC0) |
| recommended priority | **P2** — cleanest licence, smallest payoff. Good "second country" proof-of-multi-country if a CSV reader is wanted anyway |

## 10. EU-LEVEL — EURES — P2

| field | value |
|---|---|
| country | EU/EEA (31 states) |
| authority / operator | European Labour Authority (ELA) / European Commission |
| source name | EURES portal job-vacancy search backend |
| type | **UNDOCUMENTED JSON API (unofficial)** — there is no publicly published output API |
| endpoint / docs | base `https://europa.eu/eures/api` — documented only by a **community-maintained, reverse-engineered** spec: `https://github.com/rorar/EURES-API-Documentation` (README FETCHED). That README states plainly: "This is an unofficial, community-maintained documentation project. It is not affiliated with or endorsed by the European Commission or the EURES network." The **official** EURES API that is documented is the *input* API — how member states push vacancies **to** EURES (e.g. `https://github.com/navikt/pam-eures-stilling-eksport`), not how third parties pull them out |
| auth required | none observed |
| cost | free |
| rate limits | UNCONFIRMED |
| licence / terms | EURES legal notice (FETCHED, `https://eures.europa.eu/legal-notice_en`): "Re-use is authorised, provided that ELA is acknowledged as the source of the material", with the caveat that individual documents may carry their own copyright notices. The notice **does not** address automated access or bulk redistribution of vacancy records |
| attribution required | **yes** — ELA as source |
| jobs? | yes (aggregated from 31 national services) |
| employers? | partial |
| public contact channels? | no |
| expected yield | large in principle — but it is **the same national vacancies re-exposed**, so it overlaps whatever national feeds we already ingest, and it re-imports their upstream terms |
| implementation effort | **M** on transport, but building against a reverse-engineered contract is unbounded maintenance |
| maintenance risk | **high** — undocumented, unversioned, can change without notice |
| legal risk | **medium-high.** Two compounding problems: (a) reliance on an endpoint the operator has not published for third-party use; (b) **the underlying ads carry their national operators' terms** — including Germany's, which forbid exactly this (see #17). EURES is not a laundering route around a national prohibition |
| recommended priority | **P2** — do not build. Revisit only if ELA publishes an official consumer API, or as a *discovery* aid for finding which national feeds exist |

## 11. SPAIN (GALICIA) — P2

| field | value |
|---|---|
| country | ES (Galicia) |
| authority / operator | Xunta de Galicia — Servizo Público de Emprego de Galicia (SPEG) |
| source name | "Ofertas de emprego" (abertos.xunta.gal dataset 0042) |
| type | **OPEN DATA / DOCUMENTED FEED** (RSS + RDF) |
| endpoint / docs | dataset `https://abertos.xunta.gal/catalogo/economia-empresa-emprego/-/dataset/0042/ofertas-emprego` (FETCHED); RSS `https://abertos.xunta.gal/catalogo/economia-empresa-emprego/-/dataset/0042/ofertas-emprego/001/descarga-directa-ficheiro.rss` |
| auth required | **no** |
| cost | free |
| rate limits | none published |
| licence / terms | **CC BY-SA 4.0** — share-alike |
| attribution required | **yes**, and share-alike propagates to derived databases |
| jobs? | yes (regional public employment service offers) |
| employers? | partial |
| public contact channels? | no |
| expected yield | **very small** — the RSS resource is listed at ~5 KB, i.e. a handful of current offers, and RSS feeds are typically truncated to the latest N items |
| implementation effort | **S** on paper, but RSS/XML is another transport the pipeline lacks |
| maintenance risk | low |
| legal risk | low, with one caution: **CC BY-SA share-alike could contaminate a mixed derived database**. Keep it isolated or skip |
| recommended priority | **P2** |

## 12. NETHERLANDS — P2 (not a vacancy-supply source)

| field | value |
|---|---|
| country | NL |
| authority / operator | UWV (Uitvoeringsinstituut Werknemersverzekeringen) |
| source name | UWV Open Match Data |
| type | OPEN DATA — **aggregate statistics, not vacancy records** |
| endpoint / docs | `https://data.overheid.nl/dataset/uwv-open-match-data` (FETCHED) |
| auth required | no |
| cost | free |
| rate limits | none |
| licence / terms | **CC BY 4.0** |
| attribution required | yes |
| jobs? | **NO — this is the finding.** The data are werk.nl vacancies and anonymised CVs "geaggregeerd 1) per beroep en 2) per viercijferig postcodegebied". Counts per occupation × 4-digit postcode. No individual ads |
| employers? | no |
| public contact channels? | no |
| expected yield | **zero vacancies.** Useful as demand-signal context only |
| implementation effort | n/a (weekly ZIP downloads) |
| maintenance risk | low |
| legal risk | low |
| recommended priority | **P2 — and explicitly NOT a supply source.** A separate community data request ("Vacatures Werk.nl", `https://data.overheid.nl/community/datarequest/vacatures-werk-nl`) exists precisely because werk.nl has no all-vacancies API. **Netherlands has no confirmed legitimate vacancy-level open feed.** Do not fill the gap by scraping werk.nl |

## 13. SPAIN (NATIONAL) — P2, negative result

| field | value |
|---|---|
| country | ES |
| authority / operator | SEPE (Servicio Público de Empleo Estatal) |
| source name | Catálogo de datos del SEPE |
| type | OPEN DATA — **statistics only** |
| endpoint / docs | `https://sede.sepe.gob.es/portalSede/en/datos-abiertos/catalogo-de-datos-del-SEPE` (FETCHED) |
| auth / cost / limits | no auth, free |
| licence / terms | general conditions under art. 7 RD 1495/2011 and Ley 37/2007. No CC-style licence named |
| jobs? | **NO.** The catalogue holds exactly four datasets: contracts by municipality, jobseekers by municipality, unemployment-benefit expenditure, registered unemployment by municipality. **No individual vacancies** |
| employers? / contacts? | no |
| expected yield | zero vacancies |
| effort / risk | n/a |
| recommended priority | **P2.** The Empléate portal (`empleate.gob.es`) aggregates offers from the national system and the autonomous communities, but **no public API for it was confirmed** — UNCONFIRMED. The realistic Spanish route is per-region (see Galicia, #11) |

## 14. AUSTRIA — P2, UNCONFIRMED

| field | value |
|---|---|
| country | AT |
| authority / operator | AMS (Arbeitsmarktservice Österreich) |
| source name | AMS eJob-Room / `jobs.ams.at` "Alle Jobs"; AMS open data on data.gv.at |
| type | **UNCONFIRMED** |
| endpoint / docs | I could not fetch a working AMS API document. `https://www.data.gv.at/katalog/api/3/action/package_search` returned 404 to me. SEARCH-ONLY evidence indicates: (a) AMS publishes **aggregate** labour-market data on data.gv.at (unemployed, open positions by district/occupation) — statistics, not ads; (b) AMS operates an **HR-API** for employers to *submit* vacancies from their recruiting systems; (c) there is **no publicly documented REST API for eJob-Room search**, which is why commercial scrapers exist for it |
| auth required | UNCONFIRMED |
| cost | UNCONFIRMED |
| rate limits | UNCONFIRMED |
| licence / terms | UNCONFIRMED |
| attribution required | UNCONFIRMED |
| jobs? | aggregate yes / individual ads UNCONFIRMED |
| employers? / contacts? | UNCONFIRMED |
| expected yield | UNCONFIRMED (SEARCH-ONLY mentions 100k+ jobs on jobs.ams.at — not verified) |
| implementation effort | UNCONFIRMED |
| maintenance risk | UNCONFIRMED |
| legal risk | **potentially high** — a search-result note describes third parties calling AMS search/detail endpoints with HMAC-SHA512 auth. Signed-but-undocumented endpoints are a strong signal that programmatic use is not offered to the public. **Do not build against them.** Ask AMS directly instead |
| recommended priority | **P2 — needs a direct enquiry to AMS, not more scraping research** |

## 15. ESTONIA — P2, UNCONFIRMED

| field | value |
|---|---|
| country | EE |
| authority / operator | Eesti Töötukassa (Estonian Unemployment Insurance Fund) |
| source name | — none identified — |
| type | **UNCONFIRMED** |
| endpoint / docs | `https://andmed.eesti.ee/information-holders/eesti-tootukassa` returned only a page title to my fetcher; the portal's search API returned HTTP 400 for the queries I tried. No official vacancy API or machine-readable feed was found |
| auth / cost / limits / licence / attribution | UNCONFIRMED |
| jobs? / employers? / contacts? | UNCONFIRMED |
| expected yield | UNCONFIRMED (Estonia is small — likely low thousands even if found) |
| implementation effort | UNCONFIRMED |
| maintenance risk | UNCONFIRMED |
| legal risk | UNCONFIRMED |
| recommended priority | **P2.** Töötukassa vacancies do reach EURES, so an Estonian slice may arrive indirectly if EURES is ever legitimately available. Next step is a direct enquiry to Töötukassa — **not** the third-party `tootukassa.ee` scrapers that dominate search results |

## 16. IRELAND — P2, UNCONFIRMED

| field | value |
|---|---|
| country | IE |
| authority / operator | Department of Social Protection (Intreo) — JobsIreland |
| source name | — none identified — |
| type | **UNCONFIRMED** |
| endpoint / docs | data.gov.ie CKAN search FETCHED (`https://data.gov.ie/api/3/action/package_search?q=jobs+vacancies`) — it returns only **CSO aggregate statistics** (EHQ59, EHQ16 "Job Vacancies", CC BY 4.0, via `ws.cso.ie` PxStat). **No JobsIreland vacancy-level dataset exists on the national portal** |
| auth / cost / limits | n/a |
| licence / terms | CC BY 4.0 for the CSO statistics |
| jobs? | **no individual vacancies found** |
| employers? / contacts? | no |
| expected yield | zero from the confirmed sources |
| implementation effort | n/a |
| maintenance risk | n/a |
| legal risk | n/a |
| recommended priority | **P2** — direct enquiry to the Open Data Unit / DSP is the only honest next step |

## 17. GERMANY — **REJECT — LEGALLY UNSUITABLE**

| field | value |
|---|---|
| country | DE |
| authority / operator | Bundesagentur für Arbeit (BA) |
| source name | BA JOBBÖRSE, reached via the community `bundesAPI/jobsuche-api` wrapper |
| type | **UNOFFICIAL / reverse-engineered** |
| endpoint / docs | `https://raw.githubusercontent.com/bundesAPI/jobsuche-api/main/README.md` (FETCHED). Base `https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/`, header `X-API-Key: jobboerse-jobsuche`, endpoints `/pc/v6/jobs`, `/pc/v4/jobdetails/{base64Refnr}`. The README itself states the BA "has no official API to this day" |
| auth required | a hard-coded client id in a header — **not a credential issued to us** |
| cost | free |
| rate limits | none published |
| licence / terms | **`https://www.arbeitsagentur.de/en/terms-of-use` (FETCHED). This is the disqualifier.** The terms: (1) **§2a(3) forbids using "robots, web spiders or similar technologies" and forbids using "communication or programming interfaces" to "read out content from the portal or apps for the purpose of data collection"** — i.e. exactly this API, for exactly this purpose; (2) **§3(1): copyright in the portal, its content and the apps is held in its entirety by the BA**; (3) §6b grants only the BA and *its selected cooperation partners* the right to use posted offers for their own placement purposes; (4) §6c forbids passing content to third parties; (5) §4 provides for account deactivation on violation |
| attribution required | moot |
| jobs? | yes — Germany's largest vacancy database (which is exactly why this hurts) |
| employers? | yes |
| public contact channels? | yes |
| expected yield | the single largest in Europe — **and unavailable to us** |
| implementation effort | trivial technically |
| maintenance risk | high (unofficial, reprogrammed by BA in the past to add anti-automation measures) |
| legal risk | **DISQUALIFYING.** Automated retrieval is expressly prohibited, the BA asserts full copyright over the content, and onward transmission to third parties is prohibited. A public anonymous preview of BA ad content would breach §3, §6b and §6c simultaneously |
| recommended priority | **REJECT.** Do not add a `bundesagentur` descriptor. The only legitimate German route is to approach the BA about becoming a *cooperation partner* under §6b — a business/legal conversation, not an engineering task. Note the BA has also previously introduced anti-automation measures including CAPTCHA; **nothing in this document should be read as a suggestion to defeat them** |

---

# REDISTRIBUTION FLAGS FOR THE ANONYMOUS PUBLIC PREVIEW

Since the product shows a restricted anonymous preview publicly, redistribution
terms are a first-class constraint, not fine print.

| Source | Full ad content publicly redisplayable? | Notes |
|---|---|---|
| SE Arbetsförmedlingen | **yes** | CC0, attribution by our own policy. Current baseline |
| LT Užimtumo tarnyba | **yes** with attribution | CC BY 4.0. **Withhold the employer contact person/phone fields** |
| LV NVA | **yes**, unconditionally | CC0-1.0 |
| PL CBOP | **yes** with attribution | CC BY 4.0 — but the separate "Warunki udostępniania" document is unread |
| CZ MPSV | **UNKNOWN — blocker** | licence node not readable. Also carries named contact person + email/phone → withhold |
| FR France Travail | **yes** for ad body | licence explicitly contemplates redistribution to third-party sites. **Contact data requires employer consent — withhold** |
| NO NAV | **yes, with ongoing duties** | must remove inactive ads immediately, must keep updated, must deep-link the apply function to the original supplier, must not expose contact info for inactive ads |
| BE VDAB | **yes** with source acknowledgement | own-branding re-display is the stated intended use |
| DK STAR | **UNKNOWN** | governed by an unpublished connection agreement |
| FI Työmarkkinatori | **UNKNOWN** | separate terms document not read |
| ES-GA Xunta | yes **but share-alike** | CC BY-SA 4.0 can contaminate a mixed derived database |
| EU EURES | **NO — do not rely on it** | undocumented consumer API; underlying national terms travel with the ads |
| DE Bundesagentur | **NO — prohibited** | see #17 |

---

# OPEN GAPS IN THIS PASS

- Belgium: Le Forem (Wallonia) and Actiris (Brussels) not researched.
- Italy, Portugal, Slovakia, Slovenia, Hungary, Romania, Bulgaria, Croatia,
  Greece, Iceland not in scope of the brief and not researched.
- Czech licence node content — must be read before CZ activation.
- Poland "Warunki udostępniania" DOCX — must be read before PL activation.
- Finland terms-of-use page and Finnish-business-ID eligibility for a
  non-Finnish consumer — must be resolved before FI onboarding.
- France reuse-licence full text — must be read before FR activation.
- Exact live-vacancy counts for LT, CZ, NO, FR — all UNCONFIRMED. Every yield
  figure in this document that is not a measured byte size is an estimate or
  explicitly marked unconfirmed.
