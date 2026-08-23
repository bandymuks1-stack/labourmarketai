# Value Train 1 — owner decisions package (v1)

**Date:** 2026-08-23 · **Branch:** `claude/labourmarket-value-integration-ou6mc7`
**Status:** every item below is OWNER-GATED. Nothing here was applied or
executed. The GREEN half of the train (rate limits, parity refresh + snapshot
mode, regenerated DB types) ships in the PR; this document is the queue of
decisions only the owner can take, each with the exact change and its reversal.

Verification evidence for the claims below: read-only SQL against production
(`gorgitwvdzxbnaxhrsrw`) on 2026-08-23, recorded in
`docs/migrations/production-parity-register.md` (Refresh 2026-08-23).

---

## D1 — Add a read-only `SUPABASE_DB_URL` Actions secret (~1 minute, console)

One secret arms TWO already-shipped CI gates that currently warn-and-skip:

1. **Anon SECURITY DEFINER live catalog gate** (`quality.yml`) — the only
   check that can see the defect class behind the 2026-07-22 P0 (a leftover
   default PUBLIC EXECUTE grant no migration diff reveals).
2. **Migration parity live ledger gate** (`quality.yml`, added in this train) —
   proves every production migration still has a repo file on every PR,
   instead of at manual refresh time.

Use a **read-only** connection string. No code change needed after adding it.

## D2 — Public employer count: registry identity, not name spelling (T-1)

`count_public_vacancies_v1` returns `count(distinct employer_name)`.
Production today: **8,975** distinct names vs **8,451** registry ids
(+517 published rows with no registry id). `lib/employers/employer-identity.ts`
(binding): the registry id is identity; the name is *"a label, never evidence
of identity."* The published number therefore over-counts employers and is
rendered on both landing arms.

**Proposed migration** (RED — replaces a SECURITY DEFINER function; will be
authored as `supabase/migrations/<ts>_employer_count_registry_identity_v1.sql`
+ paired rollback restoring the current body, only after approval):

```sql
create or replace function public.count_public_vacancies_v1()
returns table (
  active_vacancies bigint,
  distinct_employers bigint,
  last_refreshed_at timestamptz
) language sql security definer set search_path = public stable as $$
  select
    count(*)::bigint,
    -- Registry id IS identity (employer-identity.ts). Rows without a
    -- registry id fall back to the name as an honest upper bound for that
    -- residue only. Result: the honest registry-based figure, not spelling
    -- variants counted as employers.
    count(distinct coalesce('org:' || v.employer_external_org_id,
                            'name:' || v.employer_name))::bigint,
    max(v.last_seen_at)
  from public.public_vacancies v
  where v.is_active
    and (v.expires_at is null or v.expires_at > now());
$$;
```

Effect on the public number today: ~8,975 → ~8,767. Reversible (rollback
restores the name-based body). Grants unchanged.

**Decision:** APPROVE / DECLINE.

## D3 — Public vacancy text search: make it index-usable (choose one)

The anonymous board search (`search_public_vacancy_previews_v1`) matches
`ilike '%term%'` on `title_raw` — a leading wildcard no index can serve, so
every text search is a sequential scan over 53k+ rows, reachable without
auth. This train added an app-layer per-client throttle on the board page
(honest SEARCH_BUSY state, browsing never limited), but a caller talking to
the RPC directly bypasses the app layer. Options, both RED (extension /
SECDEF replace):

- **Option A — `pg_trgm` GIN index** on `title_raw` (and optionally
  `description_raw`): `create extension if not exists pg_trgm;` +
  `create index concurrently ... using gin (title_raw gin_trgm_ops);`
  Keeps the RPC's behaviour identical; ILIKE becomes index-served.
  Simplest; extension add is the gate trigger.
- **Option B — rewrite the RPC to full-text search** using the existing
  fulltext index. Changes result semantics (word matching, not substring);
  needs copy/UX review of "no results" behaviour for partial words.

**Recommendation:** Option A (behaviour-preserving).
**Decision:** A / B / DEFER (app-layer throttle only).

## D4 — The gated DRAFT queue: apply or retire, per file

Nine repo migrations are deliberately unapplied (parity register, unchanged
set since 2026-08-18). Each has finished UI degrading to an honest gated
state. Per-file decision:

| DRAFT migration | Feature behind it | Recommendation |
|---|---|---|
| `20260714180000_journal_profession_templates_v1` | profession templates in the journal composer | **APPLY** — worker-value, additive |
| `20260714170000_worker_opportunity_seen_v1` | "new since you last looked" markers on the board | **APPLY** — additive, feeds weekly-report "new since last week" later |
| `20260713160000_agency_clients_v1` | agency client roster | APPLY if agencies are a near-term audience, else keep gated |
| `20260717150000_demand_interest_seen_v1` | company ack of worker interest | APPLY with `agency_clients` wave |
| `20260714211000_dashboard_preferences_v1` | dashboard preferences store | keep gated until a surface needs it |
| `20260713210000_multi_source_talent_v1` | external profiles + talent sources (`worker_external_profiles`) | split decision: the profile-links UI already renders; APPLY if external profiles are wanted, else remove the UI slot |
| `20260717130000_open_markets_countries_draft_v1` | open-markets country set | owner call |
| `20260713120000_company_locations_v1` | **superseded by Train M (`work_objects`)** | **NEVER APPLY** — mark retired |
| `20260714210000_company_memberships_v1` | superseded duplicate slug (see parity register) | **NEVER APPLY** — already documented |

Two repo DRAFT files are already **satisfied by different applied designs**
and must never be applied (details in the parity register Refresh section):
`20260819094500_worker_saved_public_vacancies_v1`,
`20260716121000_request_rate_limits_v3`.

Applies happen only via Supabase MCP `apply_migration` after this decision,
never `db push`, each with its rollback file verified first.

---

*This document intentionally contains no matching/scoring/verification
mechanics and no private capability intelligence — decisions and reversals
only (AGENTS.md → public communication; doctrine §18 disclosure).*
