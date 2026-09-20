-- @human-gate-approved
-- Owner authorization (2026-09-20, verbatim): "APPROVE MIGRATION
-- 20260920173000_privacy_consent_locale_pl_hash_repin_v1. Apply only the
-- reviewed migration. Preserve historical consent evidence and verify all
-- three resulting pins by read-back after application."
--
-- privacy_consent_locale_pl_hash_repin_v1
-- ========================================
-- Data-only re-pin (RED `data-dml` by route, owner-gated above): three UPDATE rows on public.privacy_consent_purposes.
-- No DDL, no grant, no policy, no SECURITY DEFINER, no row added or removed.
--
-- WHY THE HASHES MOVE WHILE THE VERSIONS DO NOT
-- consentTextHash() (apps/web/lib/privacy/consent-definitions.ts) hashes the
-- texts of EVERY locale in CONSENT_LOCALES. On 2026-09-20 `pl` joined that set
-- under the owner's approval "APPROVE PL CONSENT TEXTS v1 WITH REQUIRED INLINE
-- EDITS" (docs/human-gates/pl-consent-texts-owner-review-v1.md), so all three
-- purposes hash differently although the lt/en/ru/nl/de wording of
-- profile_discoverability and employer_data_disclosure is byte-identical.
-- partner_supply_representation additionally carries the owner's REQUIRED
-- CORRECTION in all six locales: the outbound record is described as a
-- professional summary WITHOUT DIRECT IDENTIFYING DATA (an opaque reference
-- plus professional attributes = pseudonymised), never as "anonymised" /
-- "de-identified". Scope, recipients, data categories and usage are unchanged
-- (verified against first_party_supply_feed_v1() in production and the
-- FORBIDDEN_IDENTITY_KEYS contract), so the registry's own rule requires NO
-- version bump: 2026-07-11.v2 / 2026-07-11.v2 / 2026-09-04.v1 stay.
--
-- EFFECT ON EXISTING GRANTS (production read 2026-09-20 before authoring):
--   profile_discoverability      8 events / 5 grants at 2026-07-11.v2 — they
--                                stay `granted`: worker_profile_discoverable()
--                                and current_profile_discoverability_consent()
--                                compare consent_text_version ONLY.
--   employer_data_disclosure     0 events.
--   partner_supply_representation 0 events, 0 declarations, 0 feed rows.
-- The grant RPCs compare version AND hash and fail closed
-- (stale_consent_version), so this file is applied in the SAME step as the
-- production deploy of the registry change (#1810): between the two, a new
-- grant attempt is refused, never recorded against the wrong text.
--
-- ROLLBACK (down): supabase/rollbacks/20260920173000_privacy_consent_locale_pl_hash_repin_v1.down.sql
-- restores the three pre-2026-09-20 hashes byte-for-byte (versions untouched).

update public.privacy_consent_purposes
   set current_text_hash = 'd4145ac3d118b17e5bc3bd68c3f2737ff0c872e08a38df034464213aad534549',
       updated_at = now()
 where purpose = 'profile_discoverability'
   and current_version = '2026-07-11.v2';

update public.privacy_consent_purposes
   set current_text_hash = '6f57d9167a6313220ba34ae46a1ca03357db0737d17f5985b3dd5f1e75b6fb81',
       updated_at = now()
 where purpose = 'employer_data_disclosure'
   and current_version = '2026-07-11.v2';

update public.privacy_consent_purposes
   set current_text_hash = '28b2a552ae56b5e0f260896664a9f5f7a5a918fe536e613c62c0028ac267db7f',
       updated_at = now()
 where purpose = 'partner_supply_representation'
   and current_version = '2026-09-04.v1';
