"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { joinConversationAsAdmin } from "@/lib/communication/actions";

/**
 * Admin-only "Join this conversation" button. Visible on the
 * thread-detail page only when:
 *   1. The viewer is admin (caller passes `isAdmin`).
 *   2. The viewer is NOT yet a participant (caller passes `isParticipant`).
 *
 * Both conditions must hold; otherwise the component renders nothing
 * (admins who are already participants don't need the button; non-
 * admins should never see it).
 *
 * Honest semantics: clicking "Join" inserts the admin into
 * `conversation_participants` so RLS-scoped INSERTs (sending messages,
 * marking read) start working for them. No mass-broadcast, no
 * impersonation.
 */
export function AdminJoinConversation({
  conversationId,
  locale,
  isAdmin,
  isParticipant,
}: {
  conversationId: string;
  locale: string;
  isAdmin: boolean;
  isParticipant: boolean;
}) {
  const t = useTranslations("communication.adminSupport");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!isAdmin || isParticipant) return null;

  function onJoin() {
    setError(null);
    startTransition(async () => {
      const result = await joinConversationAsAdmin({
        conversationId,
        locale,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="card-border bg-brand-blue/5 p-3 text-xs">
      <p className="mb-2 text-text-secondary">{t("joinHint")}</p>
      <button
        type="button"
        onClick={onJoin}
        disabled={pending}
        className="rounded-md border border-brand-blue/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-label text-brand-blue hover:border-brand-blue hover:text-text-primary disabled:opacity-50"
        data-testid="admin-join-conversation"
      >
        {pending ? t("joinPending") : t("joinLabel")}
      </button>
      {error && (
        <p
          role="alert"
          className="mt-2 text-state-danger"
          data-testid="admin-join-error"
        >
          {error}
        </p>
      )}
    </div>
  );
}
