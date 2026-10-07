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
  projectId,
  variant = "outline",
}: {
  profileId: string | null | undefined;
  /** The project this person is on, when the contact is opened from it. */
  projectId?: string | null;
  labelKey: "messageWorker" | "messageCompany";
  fallback?: string;
  /** `outline` (default) = the gold-edged button; `primary` = a card's one
   *  contextual primary; `quiet` = a text-weight secondary. */
  variant?: "outline" | "primary" | "quiet";
}) {
  const t = useTranslations("messaging");
  const locale = useLocale();
  if (!profileId) return null;
  return (
    <form action={openDirectConversationAction}>
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="locale" value={locale} />
      {projectId && <input type="hidden" name="projectId" value={projectId} />}
      {fallback && <input type="hidden" name="fallback" value={fallback} />}
      <button
        type="submit"
        className={
          variant === "primary"
            ? "inline-flex min-h-11 w-fit items-center rounded-control border border-brand-blue/50 bg-brand-blue/10 px-3 py-2 text-xs font-semibold text-brand-blue transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
            : variant === "quiet"
              ? "inline-flex min-h-11 w-fit items-center rounded-control px-2.5 py-2 text-xs font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
              : "w-fit rounded-md border border-brand-blue/40 px-2.5 py-1 text-xs font-medium text-brand-blue hover:bg-brand-blue/10"
        }
        data-testid={`message-button-${labelKey}`}
      >
        {t(labelKey)}
      </button>
    </form>
  );
}
