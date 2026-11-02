-- 20261020025000_workspace_pins_original_language_v1
--
-- Review finding on 20261020020000 (PR #2540): a pin's optional `label` is
-- text the person wrote (≤ 80 chars), and PLATFORM_DOCTRINE §2.3 requires the
-- language of user-written text to be stored with it (original text +
-- original_language; never a translated copy). The label IS the original
-- text; this adds its language and makes it required whenever a label exists.
-- A label-less pin (the common case — chips render from the catalogue) needs
-- no language.
--
-- Safe: the table holds 0 rows in production (created 2026-10-20). Additive
-- column + CHECKs; no RLS, grant or function change.
-- Rollback: supabase/rollbacks/20261020025000_workspace_pins_original_language_v1.down.sql

begin;

alter table public.workspace_pins
  add column if not exists original_language char(2);

alter table public.workspace_pins
  add constraint workspace_pins_original_language_chk
    check (original_language is null
           or original_language in ('lt','en','pl','de','nl','lv','et','da','no','sv','ru'));

alter table public.workspace_pins
  add constraint workspace_pins_label_language_chk
    check (label is null or original_language is not null);

commit;
