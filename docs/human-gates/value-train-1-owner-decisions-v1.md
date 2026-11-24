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

## D1 — Grant the CI role read access to the migration ledger (~1 minute)

**CORRECTED 2026-08-23 (evidence: PR #1236 CI run):** the `SUPABASE_DB_URL`
secret is **already configured** — the anon-SECDEF live catalog gate ran and
PASSED on this PR (396 SECDEF functions checked, 8/8 allowlisted). The one
remaining owner action is narrower: the configured read-only role has **no
USAGE on schema `supabase_migrations`**, so the new migration-parity live
gate warns and skips. To arm it, run as the database owner:

```sql
grant usage on schema supabase_migrations to <ci_role>;
grant select on supabase_migrations.schema_migrations to <ci_role>;
```

(`<ci_role>` = the role the read-only `SUPABASE_DB_URL` connects as.)
No code change needed after granting.

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

## D5 — /jobs board search throttle (code written, withdrawn pending waiver)

An app-layer per-client throttle on the public board's free-text search
(30/min, text queries only; browsing/pagination/profession filter and
crawlers never limited; honest SEARCH_BUSY notice instead of a fake
"0 results") was implemented and then **withdrawn from PR #1236**: the
scoped product-gate waiver `public-acquisition-route-jobs` binds by PR
number, and its history shows every extension (#1193, #1203, #1208)
carried a verbatim owner approval. Self-extending it would breach that
precedent.

The implementation is preserved in this branch's history (commit
`136e677`, reverted by `7cc5104`) and re-applies as one cherry-pick.

**Decision:** approve the waiver extension for the follow-up PR that
re-applies it (the approval formula used for #1208: "add ONLY `<PR>` to
the existing `pullRequests` list; do not change or weaken the gate
criteria"), or decline and rely on the DB-side fix (D3) alone.

## D6 — AI activation route (from the 2026-08-23 AI-reality audit)

AI is structurally dormant by your own design: the egress-grant list is
empty, so **no cloud provider can be activated by environment variables
alone** — this is working as intended, not a bug. Two honest activation
routes exist:

- **Route A — local-first (no egress decision needed):** deploy a
  self-hosted OpenAI-compatible runtime and set the `AI_LOCAL_*` /
  `AI_PROVIDER_MODE=live` variables. The only env-only path today;
  satisfies the stated "local/free first" order.
- **Route B — cloud:** an owner-level source edit adding one egress-grant
  row (with a real legal basis + date), plus small code fixes an agent can
  ship first (model-aware thinking parameter, canonical Haiku model id,
  schema hint wiring, output-token ceiling) and rate limits on the three
  public marketing-route AI actions.

Either route ends with the same proof: one `ai_runs` row with
`schema_validation='passed'` + its paired `usage_cost_events` row.

**Decision:** Route A / Route B / defer AI activation.

---

*This document intentionally contains no matching/scoring/verification
mechanics and no private capability intelligence — decisions and reversals
only (AGENTS.md → public communication; doctrine §18 disclosure).*
