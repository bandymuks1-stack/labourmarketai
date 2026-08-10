-- Rollback for 20260810070000_notification_events_v1.sql
--
-- Safety rationale: the table holds only derived notification events — every
-- one was emitted from a domain row (booking, absence, engagement) that still
-- exists and remains the source of truth. Dropping it loses read-markers and
-- the event history, never a domain fact. The application degrades cleanly:
-- every reader/writer in lib/notifications/events.ts classifies the absent
-- table as feature_unavailable and the product behaves exactly as before the
-- migration (derived spine only).

drop table if exists public.notification_events;
