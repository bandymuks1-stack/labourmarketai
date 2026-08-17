-- ROLLBACK for 20260817150000_work_objects_v1.sql
-- Restores the prior state exactly: drops the four NEW RPCs, the NEW read
-- helper, the NEW trigger and the ONE new table. Nothing existing was
-- recreated by the up migration, so nothing needs restoring verbatim.
--
-- REFUSES while real object rows exist: feature-created rows live ONLY in
-- work_objects, and dropping a populated register would silently destroy an
-- organization's site records. After real use the correct move is a FORWARD
-- FIX or a separate owner data decision, never this rollback.

begin;

do $$
declare
  n bigint;
begin
  select count(*) into n from public.work_objects;
  if n > 0 then
    raise exception
      'work_objects rollback refused: % real object row(s) exist — forward-fix instead',
      n;
  end if;
end $$;

drop function if exists public.set_work_object_responsible_v1(text, text);
drop function if exists public.set_work_object_status_v1(text, text);
drop function if exists public.update_work_object_v1(text, text, text, text, text, text, text, double precision, double precision);
drop function if exists public.create_work_object_v1(text, text, text, text, text, text, text, double precision, double precision);

drop trigger if exists trg_work_objects_updated_at on public.work_objects;
drop table if exists public.work_objects;

drop function if exists public.is_org_member_or_engaged_v1(uuid);

commit;
