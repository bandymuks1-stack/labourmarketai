-- ROLLBACK for 20261015120000_esco_label_lower_computed_field_v1.sql
-- Removes the computed field. The typeahead falls back to its ILIKE query
-- (lib/taxonomy/esco-autocomplete.ts handles a missing field), so nothing
-- breaks — it is only slow again.
drop function if exists public.esco_label_lower(public.esco_labels);
