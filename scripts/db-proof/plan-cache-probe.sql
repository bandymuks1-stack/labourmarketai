-- ============================================================================
-- PLAN-CACHE PROBE: an RPC performance claim measured the way production
-- runs it (system audit 2026-11-03, root cause "plan change on a reused
-- connection").
--
-- Why: plpgsql caches the plans of the statements inside a function per
-- backend. The first ~5 calls use custom plans. After that it may switch to
-- ONE generic plan for every argument. #3020's trigram index looked good on
-- the first call per backend; on the 6th+ call the generic plan chose it for
-- 1-2 character terms: 16-26 s against the 3 s anon timeout. It was rolled
-- back the same day. A one-call measurement cannot see this.
--
-- Rule: every RPC performance claim (a new index, extension, or rewritten
-- search function) runs >= 10 calls per term on ONE connection, under BOTH
-- plan_cache_mode = auto and force_generic_plan, with short (1-2 char), mid
-- and long terms. The claim cites the worst call, not the first.
--
-- Read-only: the whole probe runs in one READ ONLY transaction and ends with
-- ROLLBACK. Run it against the scratch/local copy first; in production only
-- with read-only SQL.
--
-- Usage (psql, one connection):
--   psql -v ON_ERROR_STOP=1 \
--        -v call="select count(*) from search_public_vacancy_previews_v1(%L, null, 20, 0)" \
--        -v terms="{a,el,kock,snickare,undersköterska}" \
--        -f scripts/db-proof/plan-cache-probe.sql
-- `call` is a format() string with ONE %L for the term.
-- ============================================================================
\set calls 10
begin read only;
select set_config('probe.call', :'call', true),
       set_config('probe.terms', :'terms', true),
       set_config('probe.calls', :'calls', true);
do $$
declare
  v_call  text   := current_setting('probe.call');
  v_terms text[] := current_setting('probe.terms')::text[];
  v_n     int    := current_setting('probe.calls')::int;
  v_mode  text;
  v_term  text;
  v_i     int;
  v_t0    timestamptz;
  v_ms    numeric;
  v_first numeric;
  v_worst numeric;
begin
  if v_n < 10 then
    raise exception 'plan-cache probe needs >= 10 calls per term, got %', v_n;
  end if;
  foreach v_mode in array array['auto', 'force_generic_plan'] loop
    perform set_config('plan_cache_mode', v_mode, true);
    foreach v_term in array v_terms loop
      v_worst := 0;
      for v_i in 1..v_n loop
        v_t0 := clock_timestamp();
        execute format(v_call, v_term);
        v_ms := round(extract(epoch from clock_timestamp() - v_t0) * 1000, 1);
        if v_i = 1 then v_first := v_ms; end if;
        v_worst := greatest(v_worst, v_ms);
      end loop;
      raise notice 'PROOF mode=% term=% calls=% first_ms=% worst_ms=%',
        v_mode, v_term, v_n, v_first, v_worst;
    end loop;
  end loop;
end $$;
rollback;
