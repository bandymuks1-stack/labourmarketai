-- ============================================================================
-- ROLLBACK for 20260901140000_labour_economics_metric_widening_v1
--
-- Removes exactly the six keys the forward migration added, restoring the
-- pre-migration baseline:
--
--   eurostat                      -> labour.employment_rate,
--                                    labour.unemployment_rate,
--                                    labour.job_vacancy_rate,
--                                    labour.cost_index_yoy        (4 keys)
--   internal_platform_aggregates  -> demand.role_request_count,
--                                    demand.skill_request_count   (2 keys)
--
-- Rolling back RE-SEALS the fail-closed allowlist: the labour-economics spec
-- goes inert again and no importer may write those metrics.
--
-- It deliberately does NOT delete observations already imported under the
-- permission. That data was lawfully imported while the permission stood, and
-- withdrawing a future import right is not a reason to destroy history. Delete
-- observations separately and deliberately if that is ever actually intended.
--
-- Apply ONLY via Supabase MCP / SQL editor after an explicit owner decision.
-- ============================================================================

begin;

update public.market_intelligence_sources s
   set import_policy = jsonb_set(
         s.import_policy,
         '{metric_keys}',
         (select coalesce(jsonb_agg(k), '[]'::jsonb)
            from jsonb_array_elements_text(s.import_policy->'metric_keys') as t(k)
           where k not in ('labour.cost_level_hour',
                           'labour.wage_level_hour',
                           'productivity.value_per_hour',
                           'productivity.value_per_person',
                           'labour.unit_labour_cost'))
       )
 where s.source_key = 'eurostat';

update public.market_intelligence_sources s
   set import_policy = jsonb_set(
         s.import_policy,
         '{metric_keys}',
         (select coalesce(jsonb_agg(k), '[]'::jsonb)
            from jsonb_array_elements_text(s.import_policy->'metric_keys') as t(k)
           where k <> 'productivity.value_to_cost_ratio')
       )
 where s.source_key = 'internal_platform_aggregates';

commit;

-- Verification after rollback:
--   select source_key, jsonb_array_length(import_policy->'metric_keys')
--     from public.market_intelligence_sources
--    where source_key in ('eurostat','internal_platform_aggregates');
--   EXPECT eurostat = 4, internal_platform_aggregates = 2.
