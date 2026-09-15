-- Rollback for 20260915140000_competency_recognitions_v1.sql
--
-- READ BEFORE APPLYING. A recognition is an assessor's act with legal
-- weight for the person it concerns. Dropping the table destroys that
-- record for both parties. The drop refuses while any recognition exists;
-- a deliberate teardown must first decide, and record elsewhere, that losing
-- those acts is acceptable.
--
-- ONE TRANSACTION, load-bearing.
begin;

do $$
declare n integer;
begin
  if to_regclass('public.competency_recognitions') is not null then
    select count(*) into n from public.competency_recognitions;
    if n > 0 then
      raise exception
        'competency_recognitions still holds % recognition(s) — these are assessor acts; decide deliberately before rolling back', n;
    end if;
  end if;
end $$;

drop function if exists public.revoke_competency_recognition_v1(uuid, text);
drop function if exists public.record_competency_recognition_v1(uuid, text, text, text, jsonb, uuid, text, date, date, text, uuid);
drop policy if exists competency_recognitions_select on public.competency_recognitions;
drop index if exists public.competency_recognitions_subject_idx;
drop index if exists public.competency_recognitions_assessor_idx;
drop table if exists public.competency_recognitions;

commit;
