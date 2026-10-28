-- Pin search_path on the three privacy-erasure sentinel helpers (Supabase advisor
-- function_search_path_mutable). Their bodies are constants or fully qualified calls, so behaviour
-- does not change; the pin only removes the mutable-search_path warning.
alter function public.privacy_erasure_sentinel_profile_id() set search_path = '';
alter function public.privacy_erasure_sentinel_worker_id() set search_path = '';
alter function public.privacy_erasure_is_sentinel(uuid) set search_path = '';
