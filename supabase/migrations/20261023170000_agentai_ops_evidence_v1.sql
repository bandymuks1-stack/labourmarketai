-- @human-gate-approved  (acknowledgement only: RED class — SECURITY DEFINER + REVOKE/GRANT; draft + needs-human-gate, owner applies)
-- agentai_ops_evidence_v1 — read-only production evidence channel for Agentai OS.
--
-- WHY. Owner order 2026-10-23: Agentai OS production state (job outcomes, aggregate commercial counts, listener
-- heartbeat) must be verifiable without SSH, through an existing authorised channel, with no new credential and no
-- paid service. Agentai pushes one snapshot to POST /api/internal/agentai-ops-evidence/v1, behind the same
-- SUPPLY_FEED_BEARER_TOKEN machine secret as the capability readback route (#2665). This table is where it lands.
--
-- WHY A DEDICATED TABLE. Product telemetry (pilot_events) is first-party product use and is anon-writable; machine
-- evidence there would pollute product metrics and carry no provenance. Here only the route can write: RLS on with
-- ZERO policies, every privilege revoked from public / anon / authenticated, and the one writer is a SECURITY DEFINER
-- function whose EXECUTE is granted to service_role only — exactly the pattern of
-- 20261022150000_agentai_capability_readback_counts_v1. The route validates the snapshot strictly before calling it
-- (lib/api/agentai-ops-evidence.ts: fixed keys, regex-bound ids and outcomes, integer counts, any '@' refused), so no
-- name, email, address or correspondence can be stored.
--
-- ROLLBACK: supabase/rollbacks/20261023170000_agentai_ops_evidence_v1.down.sql

create table public.agentai_ops_evidence (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  deployed_sha text check (deployed_sha ~ '^[0-9a-f]{40}$'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and pg_column_size(snapshot) <= 4096)
);

alter table public.agentai_ops_evidence enable row level security;
revoke all on public.agentai_ops_evidence from public, anon, authenticated;

comment on table public.agentai_ops_evidence is
  'Agentai OS ops snapshots (machine evidence, no personal data). RLS on, no policies; written only via agentai_ops_evidence_insert_v1 (service_role).';

create or replace function public.agentai_ops_evidence_insert_v1(p_snapshot jsonb)
returns bigint
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.agentai_ops_evidence (deployed_sha, snapshot)
  values (nullif(p_snapshot->>'deployedSha', ''), p_snapshot)
  returning id
$$;

revoke all on function public.agentai_ops_evidence_insert_v1(jsonb) from public, anon, authenticated;
grant execute on function public.agentai_ops_evidence_insert_v1(jsonb) to service_role;

comment on function public.agentai_ops_evidence_insert_v1(jsonb) is
  'Sole writer of agentai_ops_evidence, for the Agentai OS ops evidence route. EXECUTE: service_role only.';
