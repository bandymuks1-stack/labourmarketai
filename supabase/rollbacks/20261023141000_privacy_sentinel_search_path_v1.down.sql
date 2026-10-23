-- Rollback of 20261023141000_privacy_sentinel_search_path_v1: back to the unpinned search_path.
alter function public.privacy_erasure_sentinel_profile_id() reset search_path;
alter function public.privacy_erasure_sentinel_worker_id() reset search_path;
alter function public.privacy_erasure_is_sentinel(uuid) reset search_path;
