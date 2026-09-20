-- Rollback for 20260920173000_privacy_consent_locale_pl_hash_repin_v1.sql
-- Restores the three pre-2026-09-20 (5-locale) text hashes byte-for-byte.
-- Versions are untouched by both directions. NOTE: after this rollback the
-- registry that ships `pl` in CONSENT_LOCALES can no longer record a grant
-- (stale_consent_version, fail closed) — only for hard technical failure,
-- together with reverting the registry change.

update public.privacy_consent_purposes
   set current_text_hash = '4562567880e1d72534d5efba985623f1932fb1f9512735460a93e510d9a5acf4',
       updated_at = now()
 where purpose = 'profile_discoverability'
   and current_version = '2026-07-11.v2';

update public.privacy_consent_purposes
   set current_text_hash = '7d5719029a6088910e89bb2d2e854c30324d42aae5a48ecf37451669f0d5ba1a',
       updated_at = now()
 where purpose = 'employer_data_disclosure'
   and current_version = '2026-07-11.v2';

update public.privacy_consent_purposes
   set current_text_hash = '1e756f06b662c4297d48eb7366e755228ac445ca933026c5592e50a8acef788f',
       updated_at = now()
 where purpose = 'partner_supply_representation'
   and current_version = '2026-09-04.v1';
