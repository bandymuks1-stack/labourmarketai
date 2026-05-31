"use client";

import { useLocale, useTranslations } from "next-intl";
import { openDirectConversationAction } from "@/lib/communication/open-conversation-action";

/**
 * Entry-point button that opens (or reuses) a 1:1 conversation with another
 * profile, then lands on the existing conversation composer. Server-action
 * form → no fake messages. Renders nothing when the target profile can't be
 * resolved (honest: no dead button).
 */
export function MessageButton({
  profileId,
  labelKey,
  fallback,
}: {
  profileId: string | null | undefined;
  labelKey: "messageWorker" | "messageCompany";
  fallback?: string;
}) {
  const t = useTranslations("messaging");
  const locale = useLocale();
  if (!profileId) return null;
  return (
    <form action={openDirectConversationAction}>
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="locale" value={locale} />
      {fallback && <input type="hidden" name="fallback" value={fallback} />}
      <button
        type="submit"
        className="w-fit rounded-md border border-brand-blue/40 px-2.5 py-1 text-xs font-medium text-brand-blue hover:bg-brand-blue/10"
        data-testid={`message-button-${labelKey}`}
      >
        {t(labelKey)}
      </button>
    </form>
  );
}
