-- ROLLBACK for 20261015120000_esco_label_search_v1.sql
-- Removes the search function. The typeahead falls back to its ILIKE query
-- (lib/taxonomy/esco-autocomplete.ts handles a missing function), so nothing
-- breaks — it is only slow again.
drop function if exists public.search_esco_labels_v1(text, text, text, integer);
