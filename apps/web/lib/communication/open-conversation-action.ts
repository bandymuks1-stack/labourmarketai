"use server";

import { redirect } from "next/navigation";
import { getOrCreateDirectConversation } from "./direct-conversation";

/**
 * Server action behind the "message worker / message company" entry points.
 * Resolves (or creates) the 1:1 conversation and redirects to the existing
 * conversation view + composer.
 *
 * On failure — no target profile, or the conversation cannot be opened (the
 * caller has no permission, the target is gone, RLS blocks it) — it lands the
 * user on the messages list with an honest restricted notice (`?notice=
 * cannot_open`) instead of silently bouncing them back with an unread `?error=`
 * param that no page reads. Nothing is ever sent and no fake success is shown.
 */
export async function openDirectConversationAction(formData: FormData): Promise<void> {
  const profileId = String(formData.get("profileId") ?? "");
  const locale = String(formData.get("locale") ?? "lt");
  const cannotOpen = `/${locale}/dashboard/communication?notice=cannot_open`;

  if (!profileId) redirect(cannotOpen);

  const result = await getOrCreateDirectConversation(profileId, locale);
  if (!result.ok) redirect(cannotOpen);

  redirect(`/${locale}/dashboard/communication/${result.data.id}`);
}
