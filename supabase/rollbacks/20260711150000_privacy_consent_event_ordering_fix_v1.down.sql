-- Rollback for 20260711150000_privacy_consent_event_ordering_fix_v1.sql
-- Restores the (created_at desc, id desc) ordering of the v1 functions and
-- drops the seq column + index. NOTE: rolling back reintroduces the
-- same-timestamp tie-break nondeterminism this migration fixed — only for
-- hard technical failure.

drop index if exists public.privacy_consent_events_user_purpose_seq_idx;

-- Recreate the v1 function bodies (ordering by created_at desc, id desc):
-- see supabase/migrations/20260711130000_privacy_consent_and_disclosure_v1.sql
-- sections 4 and 6 for the exact originals; re-apply those CREATE OR REPLACE
-- statements for: worker_profile_discoverable,
-- current_profile_discoverability_consent, has_employer_data_disclosure,
-- my_privacy_consent_history, record_personal_data_disclosure,
-- admin_privacy_readiness_counts, admin_list_worker_privacy_states.

alter table public.privacy_consent_events drop column if exists seq;
