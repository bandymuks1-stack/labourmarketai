# Public vacancy source pipeline v1 — Sweden first, every country after

> Status: implemented and tested. **Provider permission is confirmed. Production
> activation and persistence are not.** No vacancy has been imported.

## 1. Seven different things, deliberately kept apart

Most of the confusion about an integration like this comes from collapsing
these into one word. They are separate, and each has its own owner.

| # | Thing | State today | Whose decision |
|---|---|---|---|
| 1 | **Provider permission** | ✅ **CONFIRMED 2026-08-04** | Arbetsförmedlingen / JobTech — already given |
| 2 | **Source governance** | `legalStatus: confirmed`, `activation: owner_review` | ours — recorded |
| 3 | **Production activation** | ❌ off (`activation !== "on"` + env flag off) | owner + operator |
| 4 | **Persistence** | ❌ no table, no migration | owner |
| 5 | **Worker application route** | → the publisher's own ad | fixed by policy, not configurable |
| 6 | **Employer claim** | ❌ workflow not built | later slice |
| 7 | **Employer outreach** | ❌ prohibited for 30 days, never automatic | human, per company |

## 2. Provider permission — what we were actually told

Arbetsförmedlingen / JobTech Development confirmed directly:

- the APIs are **free**;
- **no API key** is required;
- **no prior notification** is required;
- **JobStream**: one initial snapshot, then stream polling roughly once per
  minute, with incremental retry/backoff;
- **JobAd Links**: refresh roughly once per day;
- the data is **CC0**;
- **attribution is requested**.

This is recorded as `legalStatus: "confirmed"` and `proposedOnly: false` in
`lib/intelligence/source-governance.ts`. Nothing in this repository should say
the provider has not approved the source — it has.

What is *not* implied by that permission: any right to import into production,
to build a contact list, or to approach the employers who posted the ads.

## 3. Architecture

```
fetch → parse → normalize → translate → categorize → validate
      → deduplicate → account → (gated) persist
```

| Layer | Path | May do | May never do |
|---|---|---|---|
| Pure | `apps/web/lib/vacancy-sources/**` | contracts, registry, normalization, hashing, dedup, categorization, presentation, cursor, outreach policy, MatchNeed bridge, parsers | `fetch`, `process.env`, `server-only`, a URL literal, a supabase import |
| Server | `apps/web/lib/vacancy-import/**` | kill switch, the ONE HTTP adapter, the orchestrator | anything country-specific |

`lib/guards/vacancy-source-boundary.test.ts` pins both halves, the same way
`intelligence-boundary.test.ts` pins the Eurostat path.

### Adding a country

Four edits, none in a shared stage: a parser, one line in the parser dispatch,
one descriptor, one governance row. A guard fails the build if a provider key
leaks into a shared module.

## 4. Channel cadence — the provider's own recommendation

Encoded in the descriptor (`cadence`), not left to whoever writes the cron:

| Channel | Cadence | Checkpointed | Notes |
|---|---|---|---|
| `snapshot` | **once** (`runOnce: true`) | no | cold start / reconciliation. Never scheduled. |
| `stream` | ~60 s | **yes** | resumes from the cursor, minus a 1 s overlap |
| `links` | ~24 h | yes | paged; preserves the external application link |

**The cursor is not optional.** A checkpointed channel with no cursor is
refused before any request — an unbounded stream request is a full re-read
wearing the costume of a one-minute poll, and that is exactly the load an
open, keyless, CC0 API asks you not to generate. The cursor moves forward
only, comes from publisher timestamps rather than our clock, and stays put
when a run returns nothing.

Retries are bounded (2) with incremental backoff, and never fire on a 4xx.

## 5. One canonical product, not two

An imported vacancy is an **opportunity**, rendered by the same contract as a
directly-created one (`vacancy-presentation.ts`). There is no second card, no
"external jobs" section, no second ranking engine, no second recognizer — and
the guard proves it: the pipeline ships **zero `.tsx` files**.

The only permitted difference is truthful provenance:

- the source (Arbetsförmedlingen / JobTech), always attributed;
- that it is a public external-source vacancy;
- that the employer has not claimed it here yet.

All three are i18n codes. No technical enum name (`unclaimed_external`,
`source_original`, …) may appear in a locale catalogue — guard-pinned.

### Never claimed

That the employer is a client or partner · that they approved our reading of
their ad · that we deliver candidates to them · that the vacancy is managed
here · that we are anyone's official recruitment channel.

### Capabilities before a claim

`canApplyInternally`, `canShortlistForEmployer`, `canBookThroughPlatform`,
`canMessageEmployerInbox` are **all false** for an unclaimed external vacancy.
There is no inbox to deliver to and no booking anyone agreed to honour;
offering those controls would be offering a button that does nothing.

## 6. Worker application route

Before an employer claim, the worker's CTA goes to **the publisher's own
application route**. If the ad carried none, the route is `unavailable` — an
honest and not-rare answer. We never pretend to receive an application on an
employer's behalf, because they never agreed to that.

After a future *verified* claim, the internal flow unlocks. That workflow is
not built in this PR.

## 7. Employer relationship protection

**The source is used first to improve worker supply and market completeness.**
That is the point of the integration.

- **No direct employer outreach during the first 30 days.** Days 0–29:
  prohibited, no exceptions.
- **No automatic outreach exists, at any age.** After 30 days a company
  becomes *eligible for human review* — eligible is not approved. No
  computation can produce "send"; only a person can.
- **Company-level, not vacancy-level.** An employer with eleven open ads
  receives one message, not eleven. The **oldest** ad sets the age, so
  reposting cannot reset the clock.
- **One initial contact maximum.** There is no state that permits a second, so
  no automatic reminder can be constructed.
- **Opt-out is permanent** and outranks every other input. Ageing never
  reverses it.
- **A company claim ends external outreach eligibility** — they are a user
  now, not a prospect.
- **No partnership claim**, ever.
- **Fail-closed:** a missing, unparseable or future publication date denies. A
  missing company key denies, because one-per-company cannot be guaranteed
  without one.

**Protecting the provider relationship takes priority over short-term sales.**
Arbetsförmedlingen gave us open, keyless, CC0 access to Sweden's public
vacancies. Turning that into same-day outbound sales against the employers who
posted them would be using a public good as a lead list, and would risk the
thing that makes the whole integration possible in order to win one deal. A
vacancy still open a month later is a real signal of unmet need; a vacancy
posted yesterday is just a vacancy.

`employer-outreach-policy.ts` is a **decision function, not a sender**: no IO,
no transport, no queue, no persistence, and no imports at all.

## 8. Contact data boundary

The parser preserves an official application route **only when it is explicitly
present in the public source data**. There is no enrichment and no scraping:
no guessed email formats, no personal social profiles, no hidden contacts, no
unrelated employees. Guard-pinned.

Any future outreach must prefer an official company contact, an HR/recruitment
address, or a career page — and only where lawful and reviewed.

## 9. The honesty rules, and where they are enforced

| Rule | Enforced by |
|---|---|
| An absent number never becomes `0` (`Number(null) === 0`) | `toNumber` in `vacancy-normalization.ts` + regression test |
| Missing headcount stays unknown — never defaulted to 1 | `normalizePositions` |
| Missing geography stays unknown; `0,0` is refused | `normalizeCoordinate` |
| A SEK salary is never converted to EUR — no FX rate exists here | `vacancy-need.ts`; reports `pay_not_comparable` |
| An unrecognized language label is dropped, not passed through | `normalizeLanguageList` |
| Categorization is deterministic — no LLM | composes `deriveNeedSkills`; guard (b) |
| A derived requirement is never labelled human-structured | `needSource` carried into `MatchNeed` |
| No translation is shown that does not exist | `translateInstruction`; half-translated → `needs_review` |
| No second matching engine | guard (e): only `vacancy-need.ts` imports `match-v1` |
| No fabricated status, fit, confidence or application link | the contract has no field for them |

## 10. Activation gates — four, independent

1. **Source governance** — provider confirmed ✅, but `activation` is
   `owner_review`, not `on`. The import boundary refuses with `activation_off`.
2. **Persistence schema** — does not exist. No table, no migration.
3. **Operator env flag** — `VACANCY_SOURCE_ARBETSFORMEDLINGEN_ENABLED`
   defaults off; `VACANCY_SOURCE_*_KILL_SWITCH` and
   `VACANCY_IMPORT_KILL_SWITCH` stop one provider or all of them.
4. **Outreach** — off, 30-day floor, human approval mandatory.

**No single flag bypasses all four.** Provider approval does not activate
persistence, and activation does not enable outreach.

## 11. What a dry run gives the owner

With activation still off, a dry run reports fetched / valid / rejected /
duplicate / translatable / matchable counts and `validAfterActivation` — how
many records **would** import if the owner said yes. That is the evidence the
activation decision should rest on, and producing it needs no approval and
persists nothing.

## 12. Not built, deliberately

- **No persistence table or migration.** `runVacancyImport` takes a `persist`
  callback and is unreachable in persist mode while activation is off.
- **No UI surface.** A screen before activation is an empty state that can
  never fill.
- **No employer claim workflow.**
- **No CRM, contact store or outreach queue.** The policy module is ready for
  one; building it is a separate approved slice.
- **No translation provider.** The stage delegates to the platform's one
  translation service, which ships unconfigured and answers `unavailable`.
- **No scheduler.** The cadences are recorded as a contract; nothing runs on a
  timer in this repository.

## 13. Test coverage

209 tests across the pipeline: normalization (incl. the zero-coercion
regression), hashing and the three dedup collisions, the cursor's
forward-only/overlap rules, the provider registry and bound clamping, the
JobTech parser against a realistically-shaped ad plus its defensive paths, the
presentation contract and application route, the 30-day outreach policy
(boundary at 29/30, fail-closed inputs, company-level dedup, terminal
`contacted`), the MatchNeed bridge against the real `computeContextFit`, the
kill switch, the importer end to end, and the two boundary guards.
