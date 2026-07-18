-- Rollback for 20260718190000_commercial_crm.sql
-- Brand-new objects only; nothing else depends on them. Reversible.

drop function if exists public.delete_contract_v1(uuid);
drop function if exists public.set_contract_status_v1(uuid, text);
drop function if exists public.create_contract_v1(text, bigint, uuid, uuid, uuid, text, text, text, date, date);
drop function if exists public.delete_proposal_v1(uuid);
drop function if exists public.set_proposal_status_v1(uuid, text, text);
drop function if exists public.create_proposal_v1(text, bigint, uuid, uuid, text, date, text, text);

drop table if exists public.contracts cascade;
drop table if exists public.proposals cascade;
