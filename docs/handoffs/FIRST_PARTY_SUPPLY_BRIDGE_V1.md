# First-party supply bridge v1 — the labourmarket.ai half

**Contract:** `agentai-first-party-market-signal/v1`
**Counterpart:** Agentai OS `docs/handoff/labourmarket-first-party-supply-feed-v1.md` (#634, `origin/main` `8f5ccf1`)
**Built:** 2026-09-04 · **Branch:** `feat/cc/first-party-supply-bridge-v1` · **Base:** `origin/main` `461326d2`

Agentai OS built the consumer and nothing emitted. This is the emitter.

---

## 1. What already existed, and was reused

Nothing about a person was re-modelled. The audit found a canonical structure
for every fact the contract needs except three, and those three are what this
slice adds.

| the contract needs | canonical structure reused |
|---|---|
| person / worker profile | `workers` (52 rows), `profiles` |
| profession / trade | `worker_professions` → `professions.slug` (49 slugs) |
| skills | `worker_skills` (source: `self_declared` / `work_journal` / `manager_confirmed`, `verified`) |
| adjacent trades | `profession_skills.is_core` (232 links) |
| languages | `worker_languages` |
| credentials + validity | `worker_documents` (`valid_until`, `verification`) |
| evidence completeness | `workers.profile_completeness` |
| geography (preference) | `workers.current_location_country`, `workers.preferred_countries` |
| mobility / conditions | `workers.willing_to_relocate`, `has_transport`, `max_trip_days`, `own_vehicle`, `preferred_contract_type`, shift flags |
| team / crew | `team_details`, `organizations` |
| consent, as a legal act | `privacy_consent_events` (append-only, trigger-enforced), `privacy_consent_purposes` (version+hash pinning), `apps/web/lib/privacy/consent-definitions.ts` |
| visibility predicate pattern | `worker_profile_discoverable(uuid)`, `can_view_worker(uuid)` |

**Three facts genuinely did not exist**, and no amount of reading around them
would have produced them:

1. **A current work-seeking intent in the contract's five-state vocabulary.**
   `workers.availability_status` is `available | busy | unavailable` — an
   operational status. It cannot distinguish *open to offers* from *looking for
   work*, and it carries no statement of when the answer stops being true.
   (48 of 52 rows are `null`.)
2. **The countries a person may LEGALLY work in, and — separately — the
   countries they AGREE to be offered work in.** `preferred_countries` is a
   preference, which is neither.
3. **The three authorities beyond matching**, each independently answerable.

## 2. What was added

One table, one consent purpose, six functions. No existing table, policy or
column was altered.

### The consent purpose — and why it is a new one

`profile_discoverability` names its recipients as *"registered and signed-in
companies and staffing agencies on LabourMarket.ai"*. Representing the same
person as supply inside a partner network that searches employers **outside**
this product is a different recipient category, so it is a different purpose
under Art. 5(1)(b). Reusing the discoverability grant would extend a consent
past the sentence the person read, and an emitter cannot repair that afterwards.

`partner_supply_representation` v`2026-09-04.v1`, hash
`c1b888b7…5791`, five locales, defined in
`apps/web/lib/privacy/consent-definitions.ts` and pinned in
`privacy_consent_purposes`. A stale hash is refused by the grant RPC, exactly as
the two purposes before it.

### The declaration

`public.first_party_supply_declarations` — one row per profile, owner-written,
RLS `profile_id = auth.uid()` for select/insert/update and **no delete policy**
(withdrawal is a stamp, so a person can prove what they withdrew and when).

Constraints that carry meaning rather than tidiness:

- `allowed_markets <@ work_authorised_countries` — a market someone agreed to be
  offered in but may not legally work in is a legal error, enforced not trusted;
- `valid_until > declared_at` — a declaration always has a validity window;
- `intent_state = 'AVAILABLE_FROM'` requires `available_from`;
- `actor_type = 'TEAM'` requires `team_organization_id` (§10 extensibility: the
  shape admits a crew without a contract change; no crew feature was built).

### Where each authority comes from

| authority | source | default |
|---|---|---|
| `matchAuthority` | newest `partner_supply_representation` ledger event is `granted` **at the current text version** | **deny** (absent row, stale version, or withdrawal → deny) |
| `contactAuthority` | `first_party_supply_declarations.contact_authority` | `false` |
| `publicationAuthority` | `…publication_authority` | `false` |
| `identityDisclosureAuthority` | `…identity_disclosure_authority` | `false` |

Registration, a CV upload, an application, or a grant for another purpose are
worth exactly zero here. The MATCH filter lives in SQL
(`first_party_supply_feed_v1`), not in application code, so a second caller
cannot get a laxer answer than the first.

## 3. The emitted contract

Exactly the twenty v1 keys, in the contract's order, one JSON object per line.
No name, no email, no phone, no address, no document, no journal content — the
SQL select list has no such column and the emitter **rejects** any row that grew
one (`FORBIDDEN_IDENTITY_KEYS`).

An extra key is rejected too, not passed through: the consumer's validator
rebuilds the object from the keys it knows, so an extra field would vanish in
silence and this end would believe it had sent something.

### UNKNOWN vs ZERO

| situation | artefact | consumer reads |
|---|---|---|
| the canonical read failed | **no file written; the previous file is left untouched** | `SUPPLY_SOURCE_UNAVAILABLE` — *we did not look* |
| read succeeded, nobody authorised | **empty file, written** | `searched: true`, matches `0` — *we hold nobody* |
| read succeeded, rows present | file with rows | real counts |

`buildFeedBody` takes a read *outcome*, not an array, so there is no way to hand
it "nothing" without also saying whether that means zero or unknown. The pull
route answers **503 with no body** on a failed read and never 200-with-zero-rows.

### Freshness

`CURRENT` → `AGEING` (no reconfirmation for 30 days) → `EXPIRED` (past
`valid_until`); `WITHDRAWN` outranks all. **Expired and withdrawn supply is not
exported at all** (owner §5), so the file never asserts it. `AGEING` *is*
exported — the consumer decays it ×0.7 rather than dropping it, and saying
AGEING is more honest than continuing to say CURRENT.

Credential history and current credential validity stay separate: historical
evidence lives in `experience_records` / the journal and never becomes
availability.

### Adjacent trades — never only the CV job title

`first_party_supply_trades(worker)` emits declared professions **plus**
professions whose **core** skills the worker holds **with evidence**
(`verified`, or source `work_journal` / `manager_confirmed`). A self-declared
skill never widens the search, and a skill is never inferred from a neighbouring
skill. Slugs are emitted with underscores as spaces because the consumer
classifies free-text titles: `concrete_worker` matches nothing,
`concrete worker` matches `CONCRETE_WORKER`. An unrecognised trade is not
dropped on either side — it returns in the consumer's `unresolvedTrades`, so a
taxonomy gap stays countable.

## 4. Transport

Two paths, one logic.

**Production: an authorised pull.**
`GET /api/internal/supply-feed/first-party-v1`
→ `Authorization: Bearer $SUPPLY_FEED_BEARER_TOKEN`
→ `application/x-ndjson`, `no-store`, headers `x-feed-built-at`, `x-feed-rows`,
`x-feed-rejected`.

Pull, not push, because a shared filesystem couples two deployments that must be
able to fail separately and a push would need a credential for the other
product's disk. The secret is **separate from `CRON_SECRET`** — a leaked cron
secret triggers a digest job; a leaked feed secret hands over every authorised
person's projection, and sharing one secret means rotating both to fix either.
Compared in constant time. **Refused (401) while unset** — a secretless
comparison would turn this into a public worker API.

**Operator / proof: `pnpm -F web supply-feed:emit`** (`--dry-run` supported),
writing `runtime/labourmarket-supply/first-party-supply-feed.jsonl` whole,
temp-file + rename (atomic: a reader sees the old complete file or the new one,
never a half-written one that parses as fewer people than we hold).

Idempotent: stable key order means two rebuilds of unchanged consent state are
byte-identical. Rebuilt **whole** every run — a withdrawn consent disappears
rather than being appended as a tombstone, because a tombstone is still a row
about a person who asked to stop being a row.

### The exact Agentai-side step (not made here)

Per §11 this is documented rather than applied in the other repo. Agentai needs
a loader that fetches the URL above and sets `FirstPartySupplyFeed.present` from
**whether the fetch produced a file**, then passes it to the already-merged
`firstPartySupplyAdapter(feed, nowIso)`. Concretely, on the Agentai VPS:

```sh
# hourly; writes only on HTTP 200, so a 503 leaves the previous file in place
curl -fsS --max-time 30 \
  -H "Authorization: Bearer $SUPPLY_FEED_BEARER_TOKEN" \
  -o /app/runtime/labourmarket-supply/first-party-supply-feed.jsonl.tmp \
  https://labourmarket.ai/api/internal/supply-feed/first-party-v1 \
&& mv /app/runtime/labourmarket-supply/first-party-supply-feed.jsonl.tmp \
      /app/runtime/labourmarket-supply/first-party-supply-feed.jsonl
```

`curl -f` is load-bearing: without it a 503 body would be written as the feed
and a failed read would become a measured zero.

**No Agentai code change is required** beyond wiring that loader — the adapter,
the projection, the ranking factor and the inverse query all merged in #634.

## 5. Acceptance evidence

Run against **production** (`gorgitwvdzxbnaxhrsrw`) on 2026-09-04 inside a single
transaction ending in `ROLLBACK`. The migration DDL, four synthetic people, their
consents and their declarations were created and the whole thing was rolled back.

**Zero residue verified after the run:** table `ABSENT`, feed function `ABSENT`,
purpose row `ABSENT`, `proof-%@example.invalid` users `0`, `PROOF SYNTHETIC`
profiles `0`, `PROOF %` workers `0`, `privacy_consent_events` back at **8**,
`workers` back at **52**.

| step | result |
|---|---|
| purpose pinned from the TS registry hash | `2026-09-04.v1 / c1b888b72022` |
| **A** declares (lowercase `lt`,`nl` normalised to `LT`,`NL`) | `{"ok":true,"status":"declared"}` |
| **A** tries a market outside her work authorisation | `market_outside_work_authorisation` — refused, not clipped |
| **A** tries `"Germany"` instead of `DE` | `country_code_not_iso2` — refused, not dropped |
| **B** declares with all three authorities `true`, but never consented | declaration written… |
| RLS readback as **B** | sees **1** row of 4 — her own |
| feed RPC called as `authenticated` | **refused, SQLSTATE 42501** — the `service_role`-only grant holds |
| declarations in the table | **4** |
| **rows in the feed** | **1** |
| freshness cases | `AGEING`, `EXPIRED`, `WITHDRAWN` all correct |

The one emitted row — A, the only person with both a current consent and a live
declaration:

```json
{"schemaVersion":"agentai-first-party-market-signal/v1","signalId":"lm-sig-c8b0e24b-…","signalType":"WORKER_AVAILABILITY","actorType":"WORKER","actorRef":"lm:worker:c8b0e24b-…","projectScope":"labourmarketai","currentState":"AVAILABLE_FROM","freshness":"CURRENT","geography":["DE","LT","NL"],"allowedMarkets":["DE"],"trades":["carpenter"],"availableFromIso":"2026-10-01","headcount":null,"requirementSummary":null,"evidenceCompleteness":null,"verifiedAtIso":"2026-09-04T21:10:33.298Z","expiresAtIso":"2026-11-03T21:10:33.298Z","authorities":{"matchAuthority":"GRANTED","contactAuthority":"GRANTED","publicationAuthority":"DENIED","identityDisclosureAuthority":"DENIED"},"allowedChannels":[],"provenance":"FIRST_PARTY_REGISTERED"}
```

**B excluded** (no MATCH consent), **C excluded** (withdrew), **D excluded**
(validity window expired) — the three privacy negatives, proven at the database
rather than in a mock.

### Consumer compatibility

`lib/supply-bridge/__contract__/agentai-v1-consumer.vendored.ts` is Agentai's
`first-party-signal-contract.ts` copied **verbatim** from `origin/main`
`8f5ccf1` (the only edit is inlining two type aliases from a sibling module —
marked in the file). **54 vitest cases** across three files run every emitted row
through the real `validateFirstPartySignal`, `decideMatchability` and
`decidePublication`, including the production row above, pinned in
`production-emitted-row.test.ts` and asserted `toEqual` after the round trip —
no field lost, none altered.

### The artefact, and the honest-degradation path

`feed-file.test.ts` pins the file rather than the string: an empty feed **is** a
file (present, zero bytes); a failed read writes **none** and does **not**
truncate the one already there; a non-array answer is unavailable; a withdrawn
person **disappears** on the next whole-file rebuild rather than becoming a
tombstone; two rebuilds of unchanged state are byte-identical; no `.tmp`
survives a successful write.

The unavailable path was then run against the **live production database**,
where this slice's migration is deliberately UNAPPLIED:

```
$ pnpm -F web supply-feed:emit --dry-run
[supply-feed] UNAVAILABLE — nothing written, previous file untouched
[supply-feed] reason: first_party_supply_feed_v1 is not applied to this database
```

No file was created. That is *"we did not look"* reaching the consumer as an
absent feed — not a measured zero — proven against production rather than a mock.

**Not proven here:** `classifyOccupation` and the ~600-line construction
occupation taxonomy, which decide whether a trade string resolves to an
occupation group. That vocabulary is Agentai's. `carpenter`, `welder`,
`electrician`, `concrete worker`, `rebar`, `drywall`, `tiler`, `roofer`,
`plumber`, `painter`, `crane operator`, `site manager` and `scaffolder` were
confirmed present in it by inspection; `mason` and `general laborer` are not,
and will surface as `unresolvedTrades` — countable, not silently narrowing.

## 6. Real questionnaires and CVs

A real person can now enter the canonical system and become matchable with **no
ad-hoc storage**: `profiles` → `workers` → `worker_professions` /
`worker_skills` / `worker_languages` / `worker_documents` → the consent grant →
`upsert_my_first_party_supply_declaration(...)` → the feed. Server actions in
`apps/web/lib/privacy/partner-supply-actions.ts` cover grant, withdraw, upsert,
reconfirm and read.

The questionnaire must ask, because each is an exclusion when missing:

| ask | missing ⇒ |
|---|---|
| every trade the evidence supports — not just the CV job title | `TRADE_MISMATCH` |
| countries they may legally work in | declaration refused (required) |
| countries they agree to be **offered** in — a *separate* question | `MARKET_NOT_ALLOWED` |
| a stated availability, not merely "looking" | counted `POTENTIAL` only, never `LIKELY` |
| the start date | usable, weaker |
| how long the answer stays true (`validDays`) | sets the re-ask cadence |
| the four permissions, **per person** | default-deny; effectively invisible |

Unknown stays unknown: nothing fabricates experience, skills, certificates,
legal status, availability or preferences.

## 7. Known gaps, stated rather than papered over

1. **`evidenceCompleteness` is `null` for every real worker.** `profile_completeness`
   is 0 for all 52 rows because nothing computes it. Null is honest ("not
   measured", neutral downstream); 0.0 would be a false measurement. Closing it
   is the separate `AVAILABILITY_CAPACITY` requirement in Agentai's
   `docs/handoff/labourmarket-availability-capacity-v1.md`.
2. **v1 has no field for credential classes or languages.** The type is fixed at
   twenty keys and unknown keys are dropped by the consumer, so emitting them
   would be an invisible no-op. `worker_documents` is empty in production
   anyway (0 rows). **If the commercial loop needs credential validity or
   languages, that is a deliberate v2 contract change with a consent story — a
   decision for the Agentai train, not a field to add quietly.**
3. **`allowedChannels` is empty for everyone** — there is no canonical channel
   consent yet, and empty means *none*, never *all*. Publication is therefore
   refused at the channel gate even when `publicationAuthority` is granted. The
   column exists so a person can grant a channel explicitly later.
4. **No UI surface yet.** The server actions exist and are typed; the privacy
   screen does not render them. Nobody can grant this consent through the
   product until that is built — so the production feed would be a *measured
   zero* today, which is exactly what the contract says to emit.

## 8. Production gates (owner)

1. **Apply the migration.** RED class (SECURITY DEFINER + GRANT + policies), so
   `-- @human-gate-approved` is present and the PR opens as a draft with
   `needs-human-gate`. Apply via Supabase MCP `apply_migration` after review —
   never `supabase db push`.
2. **Set `SUPPLY_FEED_BEARER_TOKEN`** (≥32 chars) in Vercel production, and give
   the same value to the Agentai VPS. Until then the pull route answers 401 and
   the bridge is inert by design.
3. **Decide whether the privacy screen ships the consent + declaration UI** in
   this slice or the next.

Merge is additionally held by the parallel full-project train — see the PR.
