# Public vacancy source pipeline v1 — Sweden first, every country after

> Status: implemented, tested, **inactive**. No vacancy has been imported.
> Activation is an owner decision plus an operator env flip — see §6.

## 1. What this is

The pipeline that turns a public employment service's job advertisements into
records the platform's own matching engine can evaluate. The first provider is
**Arbetsförmedlingen** (Sweden), published through JobTech Development.

Canonical §13 stages, in order:

```
fetch → parse → normalize → translate → categorize → validate
      → deduplicate → account → (gated) persist
```

## 2. Why it is two layers

| Layer | Path | May do | May never do |
|---|---|---|---|
| Pure | `apps/web/lib/vacancy-sources/**` | contracts, registry, normalization, hashing, dedup, categorization, the MatchNeed bridge, provider parsers | `fetch`, `process.env`, `server-only`, a URL literal, a supabase import |
| Server | `apps/web/lib/vacancy-import/**` | the kill switch, the one HTTP adapter, the orchestrator | anything country-specific |

`lib/guards/vacancy-source-boundary.test.ts` pins both halves. It is the same
split, and the same guard shape, that protects the Eurostat path
(`lib/guards/intelligence-boundary.test.ts`) — two ingest paths, one safety
standard.

## 3. Adding a country

Four edits, none of them in a shared stage:

1. a parser at `lib/vacancy-sources/providers/<country>-parse.ts`;
2. one line in `lib/vacancy-sources/providers/index.ts` (parser dispatch);
3. one descriptor in `lib/vacancy-sources/vacancy-provider-registry.ts`
   (host, path, channels, pagination, language, transform version);
4. one governance row in `lib/intelligence/source-governance.ts`.

The guard fails the build if a provider key leaks into a shared module, so
"reuses the pipeline" is enforced rather than hoped for.

## 4. The three channels

| Channel | Endpoint shape | Purpose |
|---|---|---|
| `snapshot` | full current set, unpaginated | cold start, periodic reconciliation |
| `stream` | deltas since a timestamp | freshness; carries withdrawals |
| `links` | paginated ad-link feed (JobAd Links) | identity + URL, usually no body |

A `links` record with an empty `descriptionRaw` is valid and expected — its
value is the link, and pretending otherwise would be the lie.

## 5. The honesty rules, and where they are enforced

| Rule | Enforced by |
|---|---|
| An absent number never becomes `0` (`Number(null) === 0`) | `toNumber` in `vacancy-normalization.ts` + regression test |
| A SEK salary is never converted to EUR — no FX rate exists here | `vacancy-need.ts`; `payOfferedEurMax` stays null, `pay_not_comparable` is reported |
| Coordinates are never geocoded; `0,0` is refused | `normalizeCoordinate` |
| Headcount is never defaulted to 1 | `normalizePositions` |
| An unrecognized language label is dropped, not passed through | `normalizeLanguageList` |
| Categorization is deterministic — no LLM | `vacancy-categorization.ts` composes `deriveNeedSkills`; guard (b) |
| A derived requirement is never labelled human-structured | `needSource` carried into `MatchNeed` |
| No translation is shown that does not exist | `translateInstruction`; a half-translated ad becomes `needs_review` |
| No second matching engine | guard (e): only `vacancy-need.ts` may import `match-v1` |

## 6. Activation — the dual gate

Both must be true before a single record enters. Neither alone is enough.

**Gate 1 — owner (code):** `lib/intelligence/source-governance.ts` must carry
`legalStatus: "confirmed"` and `activation: "on"` for the provider. Today it is
`unconfirmed` / `off` / `proposedOnly`. JobTech publishes openly, but "published
openly" is not the same decision as "we reviewed the terms and accept them" —
that review is the owner's and this code does not pre-empt it.

**Gate 2 — operator (env), fail-closed:**

| Variable | Effect |
|---|---|
| `VACANCY_SOURCE_ARBETSFORMEDLINGEN_ENABLED` | must be `1`/`true`/`on`, else the provider is dormant |
| `VACANCY_SOURCE_ARBETSFORMEDLINGEN_KILL_SWITCH` | stops this provider |
| `VACANCY_IMPORT_KILL_SWITCH` | stops every provider at once |

Deploying this code changes nothing in production. Disabling is not rollback —
nothing already stored is deleted.

## 7. What a dry run gives the owner

Run with `mode: "dry_run"` while the source is off and the result reports
`validAfterActivation`: how many well-formed records **would** be imported if
the owner said yes, alongside the data-quality rejections. That is the evidence
the activation decision should be made on, and producing it requires no
activation.

## 8. Bounds and safety

Shared ceilings live in `VACANCY_IMPORT_BOUNDS`. A provider descriptor may only
ever **tighten** them — `resolveProviderBounds` clamps, so a typo cannot widen a
limit (test-pinned). The adapter is GET-only, refuses redirects, sets an
explicit timeout and byte cap, checks content type, retries transient failures
only, and filters query parameters against a closed allowlist. An API key, when
an endpoint needs one, travels as a header and never appears in a URL, a log or
the session's `requestRef`.

## 9. Accounting, logging, monitoring

- **Accounting** reuses `buildImportSession` — the same exact-sum contract and
  mandatory `rollbackRef` as the Eurostat path.
- **Logging** is a returned array of `{ level, code, providerKey, channel,
  detail }` with stable machine codes. The importer never writes to the
  console, and there is no field on the event that could hold a secret.
- **Monitoring** is a flat counter set (`VacancyImportMetricsV1`): pages,
  bytes, parse/validation rejections, dedup outcomes, translation outcomes,
  `validAfterActivation`.

## 10. Not built, deliberately

- **No persistence table.** `runVacancyImport` accepts a `persist` callback and
  is unreachable in persist mode while the source is off. The storage schema is
  a migration, and a migration is an owner gate; writing one before the source
  is approved would be inventing a decision.
- **No UI surface.** An imported vacancy has no screen yet. Adding one before
  activation would ship an empty state that can never fill.
- **No translation provider.** The stage is wired to the platform's one
  translation service, which ships with no provider configured. Connecting a
  real one to external content is a separate owner decision.

## 11. Test coverage

131 tests: normalization (incl. the zero-coercion regression), hashing and the
three dedup collisions, the provider registry and bound clamping, the JobTech
parser against a realistically-shaped ad plus its defensive paths, the
MatchNeed bridge against the real `computeContextFit`, the kill switch, the
importer end to end (gates, accounting, failures, translation), and the
boundary guard.
