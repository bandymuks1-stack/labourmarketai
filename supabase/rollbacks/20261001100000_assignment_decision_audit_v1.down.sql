-- Rollback 20261001100000: remove the decision writer. Audit rows already
-- written stay (append-only record of real decisions).
drop function if exists public.record_assignment_decision(text, text, text, text);
