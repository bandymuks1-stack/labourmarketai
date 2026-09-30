-- Rollback 20260930090000: the receipt writer did not exist before.
-- Receipts already written stay in audit_logs (history is never deleted);
-- the app degrades to `receipt: not_enabled` once the function is gone.
drop function if exists public.record_external_action_receipt_v1(text, uuid, text, text);
