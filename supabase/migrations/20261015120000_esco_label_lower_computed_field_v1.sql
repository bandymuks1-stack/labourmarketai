-- 20261015120000 — ESCO typeahead uses its index (computed field esco_label_lower)
--
-- WHY (production, 2026-10-15): the ESCO typeahead
-- (lib/taxonomy/esco-autocomplete.ts) filters `label ILIKE 'q%'` and orders
-- by `label`. The only matching index, `esco_labels_typeahead_idx`, is
-- `(locale, lower(label) text_pattern_ops)`; ILIKE cannot use its label part,
-- so every keystroke walked every label of the locale (~38k rows, ~30k
-- buffers): pg_stat_statements mean 2.9 s, max 7.8 s, 356 calls. EXPLAIN
-- ANALYZE of the same request: 1,665 ms. The same request written as
-- `lower(label) LIKE 'q%' ORDER BY lower(label)` uses the index: 4.8 ms,
-- identical rows.
--
-- WHAT: a PostgREST COMPUTED FIELD — an IMMUTABLE SQL function over the row
-- that returns lower(label). Postgres inlines it, so a filter/order on
-- `esco_label_lower` IS `lower(label)` and the existing index serves it. No
-- new index, no column, no data change, no grant (a SECURITY INVOKER function
-- with the default EXECUTE; the caller still reads esco_labels under its own
-- privileges).
--
-- UNDO: supabase/rollbacks/20261015120000_esco_label_lower_computed_field_v1.down.sql

create or replace function public.esco_label_lower(public.esco_labels)
returns text
language sql
immutable
parallel safe
as $$ select lower($1.label) $$;

comment on function public.esco_label_lower(public.esco_labels) is
  'PostgREST computed field: lower(label), inlined so esco_labels_typeahead_idx serves the ESCO typeahead (2026-10-15).';
