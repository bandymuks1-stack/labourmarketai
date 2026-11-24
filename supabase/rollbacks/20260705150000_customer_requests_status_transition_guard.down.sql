-- Rollback for 20260705150000_customer_requests_status_transition_guard.sql
-- Restores the pre-trigger state exactly: owner status latitude returns to
-- the RLS + CHECK-constraint baseline (no data touched either way).

drop trigger if exists customer_requests_status_transition_guard
  on public.customer_requests;

drop function if exists public.customer_requests_status_transition_guard();
