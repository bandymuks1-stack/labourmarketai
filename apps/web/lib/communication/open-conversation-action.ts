"use server";

import { redirect } from "next/navigation";
import { getOrCreateDirectConversation } from "./direct-conversation";

/**
 * Server action behind the "message worker / message company" entry points.
 * Resolves (or creates) the 1:1 conversation and redirects to the existing
 * conversation view + composer. On failure it redirects back with an ?error
 * marker rather than throwing — no fake success.
 */
export async function openDirectConversationAction(formData: FormData): Promise<void> {
  const profileId = String(formData.get("profileId") ?? "");
  const locale = String(formData.get("locale") ?? "lt");
  const fallback = String(formData.get("fallback") ?? `/${locale}/dashboard`);

  if (!profileId) redirect(`${fallback}?error=messaging`);

  const result = await getOrCreateDirectConversation(profileId, locale);
  if (!result.ok) redirect(`${fallback}?error=messaging`);

  redirect(`/${locale}/dashboard/communication/${result.data.id}`);
}
