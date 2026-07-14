# Labour Market Intelligence — activation runbook v1

**Nothing in this layer activates itself.** Every step below is an explicit
owner action. Until Step 0 happens, the intelligence tables do not exist and
every intelligence surface shows its honest `needs-migration` state.

Architecture: `docs/intelligence/labour-market-intelligence-layer-v1.md`
Honest status: `docs/intelligence/honest-status-v1.md`

## Step 0 — apply the gated migration (owner only)

The migration is RED-class (new RLS-bearing tables + grants) and carries the
`-- @human-gate-approved` DRAFT banner. It has **not** been applied anywhere.

1. Review the exact SQL:
   `supabase/migrations/20260714230000_market_intelligence_observations_v1.sql`
2. Apply **only** via Supabase MCP `apply_migration` (never `db push`),
   pasting that file's content verbatim.
3. Smoke after apply:
   - `select source_key, source_kind, legal_status, activation from public.market_intelligence_sources order by source_key;`
     → 5 rows; only the two `internal_aggregated` rows are `on`; the three
     external rows are `unconfirmed` + `off`.
   - As an authenticated non-admin session: SELECT on
     `market_intelligence_insight_queries` returns 0 rows (admin-only
     policy); INSERT into any of the three tables is denied.
   - Try `update public.market_intelligence_sources set activation='on' where source_key='stat_gov_lt';`
     as service role → must FAIL on
     `market_intelligence_sources_activation_requires_approval`
     (no `owner_approved_at`, `legal_status` not `confirmed`).
4. Regenerate `apps/web/lib/supabase/types.ts`.

**Rollback path** (verified file, idempotent `if exists` drops in dependency
order): apply
`supabase/rollbacks/20260714230000_market_intelligence_observations_v1.down.sql`
via the same MCP path. It drops only the three new tables + their policies/
indexes; canonical tables are untouched. Note: it discards derived
observation rows and the insight-query audit log (all re-derivable from
canonical data / upstream snapshots).

## Per-source activation checklist (external sources)

Applies to `stat_gov_lt`, `eurostat`, `cvbankas_salary` — and any future
source, which must first be added to the registry as `unconfirmed` + `off`.

For EACH source, in order, before any data flows:

1. **Legal / terms / licensing** — owner (or counsel) reads the source's
   terms of use and confirms the intended reuse is permitted; record
   `terms_url` and the conclusion in `owner_approval_note`.
   - `stat_gov_lt`, `eurostat`: official statistics with reuse licences —
     still confirm attribution requirements before use.
   - `cvbankas_salary`: **commercial site; usage permission unconfirmed —
     PROPOSED ONLY.** Do not activate without an explicit permission basis.
2. **Robots / access** — record `robots_status` (what robots.txt / the API
   terms say about the capture path Agentai OS would use).
3. **Rate limits** — record `rate_limit_note` (documented API limits or a
   conservative self-imposed cap).
4. **Attribution** — set `attribution_text` exactly as the source requires;
   it renders wherever a value from this source is shown. For
   `cvbankas_salary` the shipped text already pins: never label as a
   LabourMarket.ai average.
5. **Owner review + switch-on — owner-run SQL only** (no code path performs
   this UPDATE):

   ```sql
   update public.market_intelligence_sources
      set legal_status      = 'confirmed',
          activation        = 'on',
          owner_approved_at = now(),
          owner_approval_note = '<what was checked, by whom, on what basis>',
          terms_url         = '<...>',
          robots_status     = '<...>',
          rate_limit_note   = '<...>'
    where source_key = '<source_key>';
   ```

   The CHECK constraint refuses `activation='on'` unless
   `owner_approved_at` is set and `legal_status='confirmed'`.
6. **Code-side gate (dual gate: DB + code)** — the source must ALSO be added
   to the active allowlist in the code-side source governance
   (`isExternalSourceActive()` in
   `apps/web/lib/intelligence/source-governance.ts`). Import and display
   paths require BOTH gates; flipping only the DB row does nothing, and
   flipping only the code does nothing. This is deliberate: no single
   accidental change can activate an external source.

## Crawl4AI import path (Agentai OS boundary)

LabourMarket.ai never scrapes. The only external inflow is the Agentai OS
Crawl4AI adapter delivering **already-captured snapshots**. For every
snapshot the adapter must provide:

- `snapshotRef` — a stable reference to the stored raw capture (provenance
  step 1),
- `sourceUrl` — the exact URL the data was captured from,
- `capturedAt` — the capture timestamp.

The import boundary:

- refuses any snapshot whose `source_key` is not `activation='on'` in the
  registry AND active in the code gate (both — dual gate),
- writes observations idempotently (`content_hash` unique — re-delivering the
  same snapshot is a no-op),
- records the full hop chain in `provenance`.

Until profiles are activated per the checklist above, the import boundary
refuses **everything** — this is the shipped state.

## Refresh jobs

**None are installed.** Repo rule: no schedulers before proven value (same
discipline as the Agentai OS "no scheduler before first real delivery" rule).
Recompute of internal observations is manual and idempotent (deterministic
transforms + `content_hash` dedupe make re-runs safe). Background refresh
with freshness SLAs is a PLANNED item — a separate owner decision.
