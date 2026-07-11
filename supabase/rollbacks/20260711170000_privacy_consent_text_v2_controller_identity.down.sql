-- Rollback for 20260711170000_privacy_consent_text_v2_controller_identity.sql
-- Restores the v1 (version, hash) pins. NOTE: reverting removes the
-- controller identification from the CURRENT consent text — only for hard
-- technical failure.

update public.privacy_consent_purposes
   set current_version = '2026-07-11.v1',
       current_text_hash = '8ef7c1b10511f01904045621ef56f167838f27409ceb209311e7ee0dc1d8acd9',
       updated_at = now()
 where purpose = 'profile_discoverability';

update public.privacy_consent_purposes
   set current_version = '2026-07-11.v1',
       current_text_hash = 'ba18a01f1d90f774a4119aefe01e7bc3c0e807047d30054d85d7f2c7150e85f7',
       updated_at = now()
 where purpose = 'employer_data_disclosure';
