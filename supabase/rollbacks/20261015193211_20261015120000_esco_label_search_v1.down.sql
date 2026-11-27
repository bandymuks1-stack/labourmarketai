-- ROLLBACK for 20261015193211_20261015120000_esco_label_search_v1.sql
-- RECONSTRUCTED after the production apply; the production ledger stored NO rollback.
drop function if exists public.search_esco_labels_v1(text, text, text, integer);
