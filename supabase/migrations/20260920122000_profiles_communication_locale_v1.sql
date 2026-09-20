-- @human-gate-approved
-- ============================================================================
-- 20260920122000_profiles_communication_locale_v1
-- RED — owner gate (COMM-1 of the 2026-09-20 launch-completion audit).
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
--
-- The annotation above lets migration-safety CI pass STRUCTURALLY; it does NOT
-- make this migration green. This PR is RED-class by owner classification
-- (a column on `profiles`, the person's identity row, plus the code behind
-- it): draft + needs-human-gate + explicit owner approval, and prod apply
-- stays MANUAL via Supabase MCP `apply_migration` after approval. Never
-- `db push`.
--
-- FINDING (owner contract RED-1, 2026-09-17: UI_LANGUAGE ≠
-- COMMUNICATION_LANGUAGE; "each authorized recipient sees the message in
-- THEIR preferred language"): the AUTHORED language of a message is now
-- preserved (original_language CHECK widened to uk/ka, applied 2026-09-17)
-- and the composer lets the author declare it (#1812). The READ side has no
-- home: the viewer language passed to resolveViewerTexts is the ROUTE
-- locale (lt/en/ru/nl/de only), so a Georgian or Ukrainian reader can never
-- be rendered Georgian/Ukrainian, and a Polish worker on the Lithuanian UI
-- reads every translation in Lithuanian.
--
-- WHY NOT "reuse profiles.locale": that column IS the UI locale (the
-- auth-callback reads it to route the next device) and is CHECK-bound to
-- the active UI set — widening it to uk/ka would route people to a /uk
-- page that does not exist. WHY NOT "a settings blob / a new table": one
-- nullable column on the person's own row is the smallest coherent
-- structure; the person already owns the row (profiles_update = id =
-- auth.uid()) and the read is one column on a row every page already
-- fetches.
--
-- MINIMUM CHANGE: one nullable text column, CHECK-bound to the communication
-- set that the four original_language CHECKs already share (kept in
-- lockstep with lib/i18n/config `communicationLocales` by the guard
-- lib/guards/red-comm1-communication-locale.test.ts). NULL = follow the UI
-- locale (today's behaviour, unchanged for everyone until they choose).
--
-- NOT changed, on purpose: no policy (profiles_select / profiles_update
-- untouched — the person writes their own row, nobody else's), no grant, no
-- trigger, no function, no row (the column is NULL for every existing
-- profile), no default. The app writes it only through
-- persistCommunicationLocaleAction (own row, isCommunicationLocale-validated)
-- and reads it through readCommunicationLocale, both degrading on 42703
-- while this migration is unapplied.
--
-- BLAST RADIUS: one column. DOWN drops it
-- (supabase/rollbacks/20260920122000_profiles_communication_locale_v1.down.sql).
-- ============================================================================

-- COMM-1 — the person's COMMUNICATION language (≠ UI locale).
-- Owner contract: "each authorized recipient sees the message in THEIR
-- preferred language". Today the viewer language = the ROUTE locale
-- (lt/en/ru/nl/de only), so a Georgian or Ukrainian reader can never be
-- rendered Georgian/Ukrainian although their AUTHORED language is now
-- preserved (RED-1 applied 2026-09-17) and the composer lets them declare it
-- (#launch-completion PR). The missing home for the READ side is one nullable
-- column on the person's own row, writable only by the person (profiles_update
-- = id = auth.uid(), unchanged), CHECK-bound to the communication set that the
-- four original_language CHECKs already share.
alter table public.profiles
  add column if not exists communication_locale text
  check (communication_locale is null or communication_locale in
    ('en','lt','lv','et','nl','de','da','no','sv','pl','ru','uk','ka'));

comment on column public.profiles.communication_locale is
  'The language this person prefers to READ work messages in (translation-on-read target). NULL = follow the UI locale. Communication set, not the UI-locale set (RED-1 2026-09-17).';

-- ROLLBACK
-- see supabase/rollbacks/20260920122000_profiles_communication_locale_v1.down.sql
--   alter table public.profiles drop column if exists communication_locale;
-- No policy, grant, trigger or row is touched. RLS unchanged.
