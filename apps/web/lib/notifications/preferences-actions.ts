"use server";

import "server-only";

/**
 * The ONE notification-preference write a client surface may call
 * (completion v1 — M5 closure: the applied `notification_preferences` table
 * finally gets its settings surface).
 *
 * Runs with the caller's OWN client: RLS with-check pins profile_id =
 * auth.uid(), so the request can only ever store the caller's own rows.
 * The type slug is validated against the canonical runtime list (never a
 * free string into the DB from the client), and the email channel is
 * refused for types that have no email dispatch path — a stored consent
 * for a send that cannot happen would be a quiet lie.
 */
import { createClient } from "@/lib/supabase/server";
import { NOTIFICATION_EVENT_TYPES } from "./events";
import { NOTIFICATION_EMAIL_INCAPABLE_TYPES } from "./email-dispatch";
import {
  setNotificationPreference,
  type NotificationChannel,
  type PreferenceWriteResult,
} from "./notification-preferences";

export async function setNotificationPreferenceAction(input: {
  notificationType: string;
  channel: NotificationChannel;
  enabled: boolean;
}): Promise<PreferenceWriteResult> {
  if (
    !(NOTIFICATION_EVENT_TYPES as readonly string[]).includes(
      input.notificationType,
    )
  ) {
    return { kind: "invalid" };
  }
  if (input.channel !== "in_app" && input.channel !== "email") {
    return { kind: "invalid" };
  }
  if (
    input.channel === "email" &&
    NOTIFICATION_EMAIL_INCAPABLE_TYPES.includes(input.notificationType)
  ) {
    return { kind: "invalid" };
  }
  if (typeof input.enabled !== "boolean") return { kind: "invalid" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "unexpected_error", code: "not_authenticated" };

  return setNotificationPreference(supabase, {
    profileId: user.id,
    notificationType: input.notificationType,
    channel: input.channel,
    enabled: input.enabled,
  });
}
