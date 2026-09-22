# HUMAN GATE — NAV / Arbeidsplassen.no (Norway) inbound source ACTIVATION

State: `OPEN — NOT APPROVED`. Scaffold registered 2026-09-22 (PR
`feat/cc/nav-arbeidsplassen-inbound-scaffold-v1`). Nothing is activated,
nothing is fetched, no token exists, the legal status is `unconfirmed`.

Owner directive context: 2026-09-22 "LabourMarket.ai production closure +
commercial launch", §19 — a bounded lane that must not block launch.

Research source of every external fact below:
`docs/research/eu-vacancy-source-matrix-2026-08-18.md` §3 (lines 117–138)
and the reuse table (line 462). Those facts came from a research pass that
FETCHED the NAV docs site and the terms page; the feed itself has never been
called from this codebase, no sample payload exists in the repository, and
this scaffold made NO network call to any nav.no host (guard-pinned:
`apps/web/lib/guards/nav-inbound-scaffold.test.ts` §(4)).

---

## 1. What exists now — `EXISTING_NAV_IMPLEMENTATION`

MEASURED before this lane (origin/main `94dbde1da`): the vacancy provider
registry held exactly one provider (`arbetsformedlingen`); there was no NAV
descriptor, no NAV governance row, no NAV parser, no bearer-auth path, no
continuation-token walk, and no code path that ever sourced a provider
credential. `EXISTING_NAV_IMPLEMENTATION = NONE`.

After this lane, ADDITIVELY and reusing the existing structures (no second
connector):

| Piece | File | State |
|---|---|---|
| Provider key | `apps/web/lib/vacancy-sources/vacancy-contract.ts` — `VacancyProviderKey` widened with `"nav"` | code fact |
| Descriptor | `apps/web/lib/vacancy-sources/vacancy-provider-registry.ts` — `NAV`: `countryIso: "NO"`, `sourceLanguage: "nb"`, one `stream` channel on host `pam-stilling-feed.nav.no`, `pagination: "cursor"`, `requiresApiKey: true`, `authScheme: "bearer"`, `checkpointed: true`, `transformVersion: "vacancy-nav-v0-scaffold"` | registered; every feed path / parameter marked ASSUMED (see §6) |
| Governance row | `apps/web/lib/intelligence/source-governance.ts` — key `nav`, `legalStatus: "unconfirmed"`, `activation: "off"`, `proposedOnly: true`, `attributionRequired: true`, `importPolicy: null` | OFF |
| Endpoint auth scheme | `VacancyChannelEndpointV1.authScheme?: "api-key" \| "bearer"` (default `api-key`) | additive |
| Adapter header branch | `apps/web/lib/vacancy-import/vacancy-adapter.ts` — `buildVacancyRequestHeaders()`; `bearer` → `Authorization: Bearer <secret>`, default → `api-key: <secret>`; `requestRef` stays the URL and never carries the secret | arbetsformedlingen behaviour byte-identical (guard) |
| Continuation-token paging | `VacancyChannelCursorV1 { queryKey, nextTokenPath }` on the endpoint; importer walk in `vacancy-importer.ts` (`tokenWalk`); checkpoint codec `continuation-token:<token>` in `vacancy-cursor.ts`, persisted through the EXISTING `vacancy_import_cursors.cursor_value` upsert — no new table, no migration | implemented, guard-tested with a stubbed feed |
| Per-provider secret | `apps/web/lib/vacancy-import/vacancy-provider-secret.ts` — env NAME `VACANCY_SOURCE_NAV_API_TOKEN` (pattern `VACANCY_SOURCE_<KEY>_API_TOKEN`), read server-side by the runner (`vacancy-ingestion.ts`) and passed as `apiKey`; never logged | NAME only; VALUE is an owner gate |
| Parser stub | `apps/web/lib/vacancy-sources/providers/nav-parse.ts` + dispatch in `providers/index.ts` | every JSON key ASSUMED (`NAV_FIELD_MAP`) |
| i18n | `intelligence.sources.nav`, `intelligence.sources.terms.nav`, `vacancySources.attribution.nav` in all 11 catalogues | present |
| Guards | `apps/web/lib/guards/nav-inbound-scaffold.test.ts` (23 tests); `vacancy-source-boundary.test.ts` re-pinned (dated 2026-09-22) | green locally |

Three independent gates keep the provider inert, and all three are closed:

1. governance `activation: "off"` + `legalStatus: "unconfirmed"` → the batch
   gate answers `legal_status_unconfirmed` / `activation_off`; nothing enters;
2. env `VACANCY_SOURCE_NAV_ENABLED` absent → `provider_disabled`; the adapter
   asserts this BEFORE any request, so no nav.no host is contacted;
3. env `VACANCY_SOURCE_NAV_API_TOKEN` absent → `api_key_required`; there is no
   anonymous fallback for a key-requiring endpoint.

`VACANCY_IMPORT_KILL_SWITCH` remains the instant global stop, and
`VACANCY_SOURCE_NAV_KILL_SWITCH` the per-provider stop.

## 2. INBOUND status (NAV → LabourMarket.ai)

`INBOUND = SCAFFOLDED, INACTIVE, LEGAL STATUS UNCONFIRMED.`

The full pipeline shape exists end to end (fetch → parse → normalize →
translate → categorize → validate → dedupe → account → gated persist), with
the NAV-specific pieces confined to the descriptor and the parser module,
exactly as the "one entry per country" architecture requires. It has been
exercised ONLY against stubbed feed pages in the guard test.

## 3. OUTBOUND status (LabourMarket.ai → Arbeidsplassen.no)

`OUTBOUND = NOT_FOUND.`

Nothing in the repository, and nothing in the research matrix, describes a
path for publishing a LabourMarket.ai demand record ONTO Arbeidsplassen.no.
The matrix covers the inbound feed only. What must be researched before any
outbound claim is made (NOT done in this lane — no web browsing was allowed):

- whether NAV offers an ad-import / "stillingsimport" API for third-party
  systems (the terms text mentions an "original system supplier", which
  implies such suppliers exist), its terms, registration and cost;
- whether an employer must be the legal advertiser (LabourMarket.ai is a
  marketplace, not the employer — republishing a customer's demand as our own
  ad may be prohibited);
- data-protection basis for sending employer and contact data to NAV;
- whether outbound publication conflicts with the product constitution
  (external ads never become platform demand and vice versa).

Until that research exists, no outbound work may start.

## 4. AUTH and terms (`vilkar-api`) — owner + NAV action

| Item | Fact (matrix) | Who acts |
|---|---|---|
| Token type | signed JWT, sent as `Authorization: Bearer` | code: done (`authScheme: "bearer"`) |
| Public token | exists at `pam-stilling-feed.nav.no/api/publicToken`, rotates irregularly, no registration | NOT used by this scaffold — rotation is operational surface the runner does not have (no fetch-a-token step; it would also be a nav.no call, which this lane forbids) |
| Private token | requires e-mailing the NAV Arbeidsplassen team with company + contact details and WRITTEN ACCEPTANCE of the terms | **OWNER** (live outreach + accepting terms = owner-only gate, §3/§4 CLAUDE.md) |
| Terms acceptance | `arbeidsplassen.nav.no/vilkar-api` — republication permitted incl. statistical/analytical use, with ongoing duties (§7) | **OWNER + NAV** |
| Provisioning | set `VACANCY_SOURCE_NAV_API_TOKEN` in production | **OWNER** (new secret = owner gate) |
| Legal record | flip governance row to `legalStatus: "confirmed"` only after written acceptance is on file; record the date in this document | **OWNER** decision, then a PR |

## 5. Field mapping (parser stub) — ASSUMED until a real page is captured

`NAV_FIELD_MAP` in `nav-parse.ts` is the single source of truth and marks
every key `assumed: true`. Summary of the mapping to the existing normalized
row (`PublicVacancyV1` → `public_vacancies`):

| Canonical field | Assumed feed key(s) | Note |
|---|---|---|
| `externalId` | `uuid`, then `id` | publisher's ad id |
| `lifecycle` | `status` — anything not clearly active (`INACTIVE`, `DELETED`, `STOPPED`, `REJECTED`, `EXPIRED`, `REMOVED`) → `removed` | safe direction for the removal duty |
| `titleRaw` / `descriptionRaw` | `title` / `description` | verbatim, bounded |
| `publishedAt` / `expiresAt` / `startDate` | `published` / `expires` / `starttime` | ISO normalised |
| `positions` | `positioncount` | |
| `employmentForm` | `employmentType` — Norwegian labels (`Fast`, `Vikariat`, `Engasjement`, `Sesong`, `Prosjekt`, `Selvstendig`…) mapped in the provider module, shared normalizer as fallback | `unknown` when not recognised |
| `workingTime` | `extent` (`Heltid` / `Deltid`) | |
| `employer.*` | `employer.name`, `employer.orgnr`, `employer.homepage` | `orgnr` = organisasjonsnummer, verbatim |
| `location.*` | `workLocations[0].country / county / municipal` | no coordinates invented |
| `occupationRaw` / `occupationConceptId` | `categoryList[0].name` / `categoryType:code` | verbatim |
| `applicationUrl` | `applicationUrl`, then `sourceurl` | deep-link duty |
| `requiredLanguages` | — | not documented; empty |
| `compensation` | — | not documented; `salary_min/max/currency` read defensively, `NOK` only when an amount exists |
| page wrapper | `items[]`, `items[].ad_content`, `next_id` | continuation token |

FIRST STEP of activation: capture ONE real feed page under an owner-provisioned
token (dry run, `VACANCY_SOURCE_NAV_ENABLED=on`, governance still off) and
diff it against `NAV_FIELD_MAP`. Every mismatch is a parser edit and a
`transformVersion` bump BEFORE any persist run.

## 6. ESCO mapping

None is invented. `occupationRaw` keeps the publisher's label; the publisher's
own category code (STYRK / JANZZ / ESCO as NAV types it) is kept verbatim in
`occupationConceptId`. Profession and skill slugs come from the ONE shared
deterministic recognizer (`vacancy-categorization.ts`) and are marked
`derived`; its needles are Swedish/English today, so Norwegian ads will mostly
categorise to `null` — honest, and visible in the dry-run metrics. Adding
Norwegian needles is a follow-up to the recognizer, not to this provider.

## 7. Provenance, lifecycle, duplicate prevention, employer identity

- **Provenance**: every row carries `provider_key = 'nav'`, `attribution_code
  = vacancySources.attribution.nav`, `transform_version`, `request_ref` (the
  request URL — the bearer token travels as a header and is never in it), and
  the ingestion `session_id`. Attribution is REQUIRED by our product policy
  (governance `attributionRequired: true`) even though NAV's terms do not state
  it.
- **Update / close / delete lifecycle — ACTIVATION PRECONDITION**: NAV's terms
  require that an ad removed from NAV is removed from our result lists
  IMMEDIATELY, that an updated ad is updated immediately, and that contact
  information is never shown for an inactive ad. The read path already treats
  a row as actionable only while `is_active = true AND (expires_at IS NULL OR
  expires_at > now)` (`vacancy-read.ts`, provider-agnostic, unchanged); a
  `removed` lifecycle from the parser becomes `is_active = false` through the
  existing repository arm. What does NOT yet exist and MUST before activation:
  a poll cadence tight enough to honour "immediately" (the descriptor's
  placeholder is one hour; NAV states no recommendation), and a decision on
  whether "immediately" can be met by polling at all or needs the publisher's
  expiry as a hard cut-off. `NAV_REMOVAL_DUTY_MET = NOT_YET`.
- **Duplicate prevention**: the existing natural key `(provider_key,
  external_id)` plus `content_hash` — a re-seen ad with the same hash is
  `unchanged`, a changed hash is `updated`, a stream `removed` is a withdrawal.
  The continuation-token overlap (the head page is re-read on the next poll)
  is collapsed by the same dedup stage.
- **Employer identity**: `employer_external_org_id` carries the Norwegian
  organisasjonsnummer verbatim. `lib/employers/employer-identity.ts` resolves
  identity from the registry id and never merges by name; that module is
  provider-scoped already (`registry:<provider>:<id>`), so NO rows will never
  merge with SE rows. Privacy note carried over: a sole trader's registry
  number may identify a person — same storage/display caution as the Swedish
  case (`docs/audits/employer-identity-v1.md`).

## 8. WHAT_CAN_BE_IMPLEMENTED_NOW vs WHAT_REQUIRES_NAV_APPROVAL

**WHAT_CAN_BE_IMPLEMENTED_NOW (done in this lane, no NAV contact):**
descriptor, governance row (off), auth-scheme branch, continuation-token walk
+ checkpoint, secret env NAME plumbing, parser stub with declared
assumptions, i18n codes, guards, this document.

**WHAT_CAN_BE_IMPLEMENTED_NEXT without NAV approval (still no network):**
Norwegian needles for the shared recognizer; a `withdrawnAfterExpiry`
read-path proof for NO rows; an admin health row rendering (the health read
already iterates `VACANCY_PROVIDERS`, so `nav` appears as
`unconfirmed / off / closed` automatically).

**WHAT_REQUIRES_NAV_APPROVAL / OWNER ACTION (hard stops):**

1. written acceptance of `vilkar-api` and the private-token request e-mail
   (live outreach + legal text = owner);
2. provisioning `VACANCY_SOURCE_NAV_API_TOKEN` (new secret = owner);
3. the first dry run against the real feed (a nav.no network call = only
   after 1–2);
4. governance flip `unconfirmed → confirmed`, `off → on` (owner decision, this
   document updated with the date, guard `OWNER_ACTIVATED` set updated with
   the same date);
5. `VACANCY_SOURCE_NAV_ENABLED=on` in production (owner env action);
6. a cadence decision that satisfies the "immediately" duties (§7).

None of these is started. The lane is closed at "scaffold registered,
inactive".

## 9. Verification record (this lane, local — CI billing-blocked)

Recorded in the PR body: `pnpm -F web typecheck`, `eslint` on every changed
file, `vitest run` on `lib/vacancy-*`, `lib/intelligence`, the vacancy and
i18n guards, `placeholders:check`, `check:primary-route-smoke`,
`check:i18n-debt`, `check:worker-plain-language`, `check:constitution`. No
migration was added, so `migration-safety.mjs` was not applicable.
