-- Rollback for 20260714190000_billing_plans_offers_v1.sql (manual, owner-gated).
-- Drops the offer windows registry + eligibility memory. Only run on hard
-- failure — dropping billing_offer_eligibility erases earned commercial
-- rights that companies qualified for automatically.
begin;

drop policy if exists billing_offer_eligibility_select on public.billing_offer_eligibility;
drop policy if exists billing_offer_windows_select on public.billing_offer_windows;
drop index if exists billing_offer_eligibility_profile_idx;
drop table if exists public.billing_offer_eligibility;
drop table if exists public.billing_offer_windows;

commit;
