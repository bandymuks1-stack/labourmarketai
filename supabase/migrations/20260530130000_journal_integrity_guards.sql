-- 20260530130000 — journal integrity guards (salvaged from retired PR #10b 0014).
--
-- WHY: the TASK 03 audit compared the retired
-- feat/cc/pr10b-0014-hardening-implementation branch against live prod. Almost
-- all of it was already shipped the canonical way (append-only via RLS,
-- audit-on-confirm via review_journal_entry, manager-gated confirmation by
-- 0033–0036), and its confirm/reject/revoke RPCs would have DUPLICATED the live
-- review path. TWO small, real, additive gaps remained on prod — salvaged here.
--
-- SCOPE (exactly two guards; nothing else from the old 0014):
--   1. original_language CHECK — constrain to the canonical supported-language
--      set. SOURCE OF TRUTH: apps/web/lib/i18n/config.ts `locales` (the ONE
--      canonical locale set, PLATFORM_DOCTRINE §2.4). This list is NOT a new
--      parallel source — it mirrors config.ts, and a guard test
--      (journal-integrity-guards-migration.test.ts) FAILS if the two ever drift.
--   2. Direct-insert narrowed to closed-only (§4 default-closed) — the live app
--      already inserts visibility_scope='closed' everywhere
--      (apps/web/lib/journal/actions.ts), and the primary save path is the
--      create_journal_entry_full SECURITY DEFINER RPC (bypasses RLS), so this
--      only tightens the direct-insert RLS path. No live flow changes.
--
-- OUT OF SCOPE (captured in TASKS.md "Captured from retired branches"):
--   append-only TRIGGER guards (defense-in-depth; must respect the
--   correction/supersede/soft-delete lifecycle — deferred), and the unshipped
--   feature_flags / proof_of_work scaffolds.
--
-- SAFETY: additive + reversible. No DROP TABLE/COLUMN/FUNCTION, no data loss.
-- The single policy change is a NARROWING (not a loosening). RED (touches the
-- proof-spine RLS) → committed, queued for review, NOT applied. Never db push.

begin;

-- 1. original_language CHECK (canonical locale set; mirrors apps/web/lib/i18n/config.ts).
--    NOT VALID first so it never blocks on legacy rows; VALIDATE confirms the
--    existing M1 data (lt/en) conforms. If VALIDATE errors, a legacy row carries
--    an out-of-set code and must be corrected before apply — surfaced loudly.
alter table public.journal_entries
  add constraint journal_entries_original_language_chk
  check (original_language in ('en','lt','lv','et','nl','de','da','no','sv','pl')) not valid;
alter table public.journal_entries
  validate constraint journal_entries_original_language_chk;

-- 2. Narrow direct INSERT to own-worker AND closed-only (§4 default-closed).
--    Exposure to non-closed scopes must go through a controlled path, never a
--    raw insert. Matches the live app (always inserts 'closed').
drop policy if exists journal_entries_insert on public.journal_entries;
create policy journal_entries_insert on public.journal_entries for insert
  with check (owns_worker(worker_id) and visibility_scope = 'closed');

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK (manual — copy-paste). Restores the pre-guard state exactly.
-- ─────────────────────────────────────────────────────────────────────────
--   begin;
--   drop policy if exists journal_entries_insert on public.journal_entries;
--   create policy journal_entries_insert on public.journal_entries for insert
--     with check (owns_worker(worker_id));
--   alter table public.journal_entries
--     drop constraint if exists journal_entries_original_language_chk;
--   commit;
