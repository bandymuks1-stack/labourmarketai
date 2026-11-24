# Labour Economics Metrics v1 — cost vs value vs efficiency

Status: SPEC RECORDED (2026-09-01). Extends the applied intelligence layer
(`market_intelligence_sources` / `market_intelligence_observations` /
`market_intelligence_insight_queries`, prod ledger `20260715064810`) with a
**metric vocabulary** for labour economics. **No schema change is required or
proposed** — every metric below fits the existing observation contract
(`apps/web/lib/intelligence/observation-contract.ts`): `metricKey`, `geo`
(country/region/city), `window`, `unit`, `statMethod` (incl. `ratio`),
`sampleSize`, `confidence`, `sourceKey`/`sourceUrl`, `transformVersion`,
`provenance`.

Authority: subordinate to `docs/PLATFORM_DOCTRINE.md` (§18 realumo — no
fabricated numbers) and `docs/intelligence/labour-market-intelligence-layer-v1.md`
(source governance: a metric may only be imported when the source's
owner-recorded `import_policy.metric_keys` lists it — fail-closed).

## 1. Why

The product needs to reason about three distinct economic quantities that are
routinely conflated:

| Quantity | Question it answers |
|---|---|
| **Labour cost** | What does one hour of this labour cost the employer? |
| **Value / productivity** | What economic value does one hour of this labour produce? |
| **Efficiency (ratio)** | How much value per unit of labour cost? |

A market where labour costs 2× more can still be the *better* hire if value
per hour is 3× higher. Cost alone is not a signal.

## 2. Metric keys (v1 vocabulary)

All keys match `METRIC_KEY_RE = /^[a-z0-9_.]+$/` and extend the existing
`labour.*` family (`labour.employment_rate`, `labour.unemployment_rate`,
`labour.job_vacancy_rate`, `labour.cost_index_yoy` are already owner-approved
for the `eurostat` source).

| metricKey | unit | statMethod | Meaning |
|---|---|---|---|
| `labour.cost_level_hour` | `eur_hour` | `mean` | Hourly labour cost level (wages + non-wage costs) |
| `labour.wage_level_hour` | `eur_hour` | `mean`/`median` | Hourly gross earnings component |
| `productivity.value_per_hour` | `eur_hour` | `mean` | Nominal labour productivity per hour worked |
| `productivity.value_per_person` | `eur_year` | `mean` | Nominal labour productivity per person employed |
| `productivity.value_to_cost_ratio` | `ratio` | `ratio` | `value_per_hour / cost_level_hour`, same geo + window |
| `labour.unit_labour_cost` | `index` | `mean` | Nominal unit labour cost (inverse efficiency signal) |

Dimensions ride the existing contract fields — country via `geo.country`,
occupation via `subjectKind: "profession"` + slug, skill via
`subjectKind: "skill"` + slug, whole-market via `subjectKind: "geo_market"`.
Sector (NACE) rows use `subjectKind: "geo_market"` with a
`sector.<nace_code>` subjectId until a dedicated subject kind is warranted —
recorded here so the first importer does not invent its own convention.

## 3. Candidate sources (all under existing governance — nothing activates here)

| Dataset | Source | Feeds |
|---|---|---|
| `lc_lci_lev` (labour cost levels) | `eurostat` (already `confirmed` + `on`) | `labour.cost_level_hour` |
| `nama_10_lp_ulc` (productivity & unit labour costs) | `eurostat` | `productivity.*`, `labour.unit_labour_cost` |
| `earn_ses_*` (structure of earnings, by occupation) | `eurostat` | `labour.wage_level_hour` per ISCO group |

`productivity.value_to_cost_ratio` is a **derived** observation: computed from
two same-window, same-geo Eurostat rows, written with
`sourceKind: "internal_aggregated"` and `derivationIds` pointing at both input
observation ids (the contract already enforces this).

## 4. Honesty and product rules (binding for any surface using these metrics)

1. **The owner's screenshot is a research signal only.** No number from it may
   be stored or displayed until its original source, methodology and exact
   definitions are verified — observations carry `sourceUrl` + provenance or
   they do not exist.
2. **Never recommend a worker, market, or candidate solely because labour is
   cheaper.** Any surface ranking by these metrics must rank on value or
   ratio, never on cost ascending alone. This is a product invariant, not a
   styling preference.
3. Cost, value and ratio are always shown **together with window + source
   badge** (existing intelligence display rule); a ratio without its two
   inputs' windows is not displayable.
4. Unknown stays absent. No interpolation across countries or years without a
   `transformVersion` documenting the method.

## 5. Potential product surfaces (future slices, each needs its own gate)

Employer hiring economics · market comparison · worker opportunity comparison
· education programme demand/value signals · agency margin intelligence ·
Learning Compass. None ship with this spec.

## 6. Owner gate (single action, deferrable)

Importing the new metrics requires widening the owner-recorded
`import_policy.metric_keys` of the `eurostat` source row (same legal basis —
Eurostat reuse policy already confirmed in
`docs/intelligence/eurostat-legal-evidence-v1.md`). One statement, run via
Supabase MCP after owner ack:

```sql
update market_intelligence_sources
   set import_policy = jsonb_set(import_policy, '{metric_keys}',
     (import_policy->'metric_keys')
       || '["labour.cost_level_hour","labour.wage_level_hour",
            "productivity.value_per_hour","productivity.value_per_person",
            "labour.unit_labour_cost"]'::jsonb)
 where source_key = 'eurostat';
```

(`productivity.value_to_cost_ratio` belongs to
`internal_platform_aggregates`' policy instead — same pattern.)

Until then this spec is inert by design: the fail-closed import policy is the
enforcement, and that is the point of it.
