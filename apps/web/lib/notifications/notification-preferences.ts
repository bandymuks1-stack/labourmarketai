/**
 * NOTIFICATION PREFERENCES — the reader/resolver primitive over the applied
 * `notification_preferences` table (migration 20260823160000).
 *
 * The 2026-08-23 audit found the table existed with no reader: nothing could
 * answer "may this type reach this person on this channel?". This module is
 * that answer. It is the consent-resolution primitive the email dispatcher and
 * the settings UI both consume — neither exists yet; this is the shared core.
 *
 * THE DEFAULT CONTRACT (migration §4, binding):
 *   - NO ROW means the channel default applies.
 *   - EMAIL defaults OFF — email goes out ONLY where an explicit
 *     (profile, type, email, enabled=true) row exists (consent-first).
 *   - IN-APP defaults ON — today's behaviour; a row can turn one off.
 *   - An explicit row ALWAYS wins over the default, both directions.
 *
 * Follows the `events.ts` idiom: the pure resolver takes rows, the reader/
 * writer take an injected client and are RLS-scoped to the caller's own rows
 * (all four verbs granted to `authenticated`, own-row policies). Not
 * `server-only` — the pure resolver is safe on either side; the DB helpers are
 * only reached with a real client. No new taxonomy: types are the canonical
 * `NotificationEventType` slugs (§10 free slug, validated app-side).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type DbClient = Pick<SupabaseClient, "from">;

export type NotificationChannel = "in_app" | "email";

export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] = [
  "in_app",
  "email",
];

/**
 * The channel defaults applied when the person has stored no explicit row.
 * Email OFF is the consent-first rule (migration §4) — never flip it to true
 * as a "default": that would be silent opt-in, which the doctrine forbids.
 */
export const NOTIFICATION_CHANNEL_DEFAULTS: Readonly<
  Record<NotificationChannel, boolean>
> = {
  in_app: true,
  email: false,
};

/** One stored preference fact (the caller's own row; profile_id is implicit). */
export interface NotificationPreferenceRow {
  readonly notificationType: string;
  readonly channel: NotificationChannel;
  readonly enabled: boolean;
}

/**
 * Resolve whether a (type, channel) is enabled for a person, given their stored
 * rows. An explicit row wins; otherwise the channel default applies. Pure.
 */
export function resolveChannelEnabled(
  rows: readonly NotificationPreferenceRow[],
  notificationType: string,
  channel: NotificationChannel,
): boolean {
  const row = rows.find(
    (r) => r.notificationType === notificationType && r.channel === channel,
  );
  if (row) return row.enabled;
  return NOTIFICATION_CHANNEL_DEFAULTS[channel];
}

/** The effective on/off for every channel of one type — the shape a settings
 *  row renders and a dispatcher checks. `notificationType` is a free slug: the
 *  known code-side types are `NotificationEventType`, but the resolver also
 *  carries digest-family / registry-derived slugs the free-slug column allows
 *  (§10), so it is typed as `string`. */
export interface EffectiveTypePreference {
  readonly notificationType: string;
  readonly channels: Readonly<Record<NotificationChannel, boolean>>;
}

/** Resolve the effective preference for each requested type across all
 *  channels, applying the defaults where no row exists. Pure. Accepts any slug
 *  the caller derives (the code-side `NotificationEventType` set OR a
 *  registry/digest-family slug), never a hardcoded enum of its own. */
export function resolveEffectivePreferences(
  rows: readonly NotificationPreferenceRow[],
  types: readonly string[],
): EffectiveTypePreference[] {
  return types.map((notificationType) => ({
    notificationType,
    channels: {
      in_app: resolveChannelEnabled(rows, notificationType, "in_app"),
      email: resolveChannelEnabled(rows, notificationType, "email"),
    },
  }));
}

/** Codes returned by the DB helpers when the table is unreachable — the same
 *  graceful-degradation family the events reader uses. */
const FEATURE_ABSENT_CODES = new Set(["42P01", "PGRST205", "PGRST202"]);

export type PreferencesReadResult =
  | { readonly kind: "ok"; readonly rows: readonly NotificationPreferenceRow[] }
  | { readonly kind: "feature_unavailable" }
  | { readonly kind: "unexpected_error"; readonly code: string };

/**
 * A single profile's preference rows, ALWAYS filtered by `profileId`.
 *
 * The explicit filter is load-bearing, not redundant: under an RLS-scoped
 * (own-rows) client it simply matches the policy, but the email dispatcher
 * reads with a SERVICE-ROLE client that BYPASSES RLS — an unfiltered select
 * would then return every profile's rows, and because the mapper drops
 * `profile_id`, `resolveChannelEnabled` could read a STRANGER'S `enabled=true`
 * as this recipient's consent and email someone who never opted in. So the
 * scope is enforced here, on both paths. Degrades honestly if the table is
 * absent; never throws; never fabricates a default row.
 */
export async function readNotificationPreferencesFor(
  client: DbClient,
  profileId: string,
): Promise<PreferencesReadResult> {
  try {
    const { data, error } = await client
      .from("notification_preferences")
      .select("notification_type, channel, enabled")
      .eq("profile_id", profileId);
    if (error) {
      if (error.code && FEATURE_ABSENT_CODES.has(error.code)) {
        return { kind: "feature_unavailable" };
      }
      return { kind: "unexpected_error", code: error.code ?? "unknown" };
    }
    const rows: NotificationPreferenceRow[] = (data ?? [])
      .map((row) => {
        const r = row as Record<string, unknown>;
        const channel = String(r.channel);
        if (channel !== "in_app" && channel !== "email") return null;
        return {
          notificationType: String(r.notification_type),
          channel,
          enabled: Boolean(r.enabled),
        } satisfies NotificationPreferenceRow;
      })
      .filter((r): r is NotificationPreferenceRow => r !== null);
    return { kind: "ok", rows };
  } catch {
    return { kind: "feature_unavailable" };
  }
}

export type PreferenceWriteResult =
  | { readonly kind: "ok" }
  | { readonly kind: "invalid" }
  | { readonly kind: "feature_unavailable" }
  | { readonly kind: "unexpected_error"; readonly code: string };

/**
 * Upsert ONE of the caller's own preference rows (RLS with-check pins
 * profile_id = auth.uid()). `profile_id` is passed so the insert satisfies the
 * NOT NULL + own-row check; the caller supplies its own auth id. Idempotent on
 * the (profile, type, channel) primary key.
 */
export async function setNotificationPreference(
  client: DbClient,
  input: {
    readonly profileId: string;
    readonly notificationType: string;
    readonly channel: NotificationChannel;
    readonly enabled: boolean;
  },
): Promise<PreferenceWriteResult> {
  const type = input.notificationType.trim();
  if (type.length < 1 || type.length > 64) return { kind: "invalid" };
  if (input.channel !== "in_app" && input.channel !== "email") {
    return { kind: "invalid" };
  }
  try {
    const { error } = await client
      .from("notification_preferences")
      .upsert(
        {
          profile_id: input.profileId,
          notification_type: type,
          channel: input.channel,
          enabled: input.enabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "profile_id,notification_type,channel" },
      );
    if (error) {
      if (error.code && FEATURE_ABSENT_CODES.has(error.code)) {
        return { kind: "feature_unavailable" };
      }
      return { kind: "unexpected_error", code: error.code ?? "unknown" };
    }
    return { kind: "ok" };
  } catch {
    return { kind: "feature_unavailable" };
  }
}
