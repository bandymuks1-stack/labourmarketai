-- @human-gate-approved
-- Owner authorization: legal-entity-ip-license-truth goal command (2026-07-11).
--
-- privacy_consent_text_v2_controller_identity
-- ===========================================
-- Consent text version bump 2026-07-11.v1 -> 2026-07-11.v2: the texts now
-- NAME THE DATA CONTROLLER (UAB „Nonstop Group“, code 302676973, privacy
-- contact info@labourmarket.ai) and state that the IP owner Labour Market AI
-- Sp. z o.o. receives no personal data (GDPR Art. 13(1)(a) transparency).
-- Registry source: apps/web/lib/privacy/consent-definitions.ts (adds the
-- `controller` block to every locale of both purposes).
--
-- Ledger state at authoring: 0 consent events in production (verified
-- 2026-07-11) — NO real user consent exists, so no re-consent flow and no
-- backfill question arises; the version simply advances. Had grants existed,
-- worker_profile_discoverable would have flipped them to
-- granted_stale_version (fail closed) — that behavior is already live and
-- guard-tested.
--
-- Rollback: supabase/rollbacks/20260711170000_privacy_consent_text_v2_controller_identity.down.sql

update public.privacy_consent_purposes
   set current_version = '2026-07-11.v2',
       current_text_hash = '4562567880e1d72534d5efba985623f1932fb1f9512735460a93e510d9a5acf4',
       updated_at = now()
 where purpose = 'profile_discoverability';

update public.privacy_consent_purposes
   set current_version = '2026-07-11.v2',
       current_text_hash = '7d5719029a6088910e89bb2d2e854c30324d42aae5a48ecf37451669f0d5ba1a',
       updated_at = now()
 where purpose = 'employer_data_disclosure';
