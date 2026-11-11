-- Rollback of 20261112090000_operator_application_alerts_v1. The three functions are new and change
-- no row by themselves. The audit rows they wrote stay: public.audit_logs is append-only and they
-- are the record of what was sent. With the functions gone the sweep answers `needs_migration` and
-- sends nothing.
begin;
drop function if exists public.record_operator_alert_v1(text, text, uuid, text, uuid, uuid, text);
drop function if exists public.operator_alert_recipients_v1(text);
drop function if exists public.operator_alerts_due_v1();
commit;
