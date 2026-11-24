-- invitations: columns added by later migrations (relationship_invitations_v1 / universal_invitation_referral_network_v1)
-- that create_invitation_v1/v2 insert into. Reduced stand-ins; they play no part in the guards under test.
alter table public.invitations add column if not exists relationship_slug text;
alter table public.invitations add column if not exists target_request_id uuid;
alter table public.invitations add column if not exists max_uses integer not null default 1;
alter table public.invitations add column if not exists campaign_label text;

-- create_invitation_v1: production has ONE overload (the 10-arg relationship_slug form, 20260827200000
-- dropped the original 9-arg). The first migrations in this chain leave the 9-arg one; drop it so the
-- scratch catalog matches production's signatures.
drop function if exists public.create_invitation_v1(text, text, text, text, uuid, uuid, text, text, text);
