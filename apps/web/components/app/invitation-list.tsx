"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/lib/i18n/navigation";
import { Check, Copy } from "lucide-react";

import {
  acceptInvitationByIdAction,
  resendInvitationAction,
  revokeInvitationAction,
} from "@/lib/invitations/actions";
import type {
  IncomingInvitationRow,
  SentInvitationRow,
} from "@/lib/invitations/network";
import { formatUtcDate } from "@/lib/time/display";

/**
 * Sent-invitation manager + incoming-invitation cards (core-network area B).
 * Every state shown is the REAL stored state; resend rotates the token and
 * shows the fresh link once; revoke kills the link immediately.
 */

export function SentInvitationList({
  items,
  locale,
}: {
  items: SentInvitationRow[];
  locale: string;
}) {
  const t = useTranslations("network.sent");
  const tTypes = useTranslations("network.invite.types");
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [freshLinks, setFreshLinks] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function onRevoke(id: string) {
    setBusyId(id);
    setNotice(null);
    try {
      const r = await revokeInvitationAction({ invitationId: id, locale });
      setNotice(r.status === "ok" ? t(`notices.${r.outcome}`) : t("notices.error"));
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function onResend(row: SentInvitationRow) {
    setBusyId(row.id);
    setNotice(null);
    try {
      const r = await resendInvitationAction({
        invitationId: row.id,
        email: row.invitedEmail,
        locale,
        invitationType: row.invitationType,
        personalMessage: row.personalMessage,
      });
      if (r.status === "ok" && r.inviteLink) {
        setFreshLinks((m) => ({ ...m, [row.id]: r.inviteLink as string }));
      }
      setNotice(r.status === "ok" ? t(`notices.${r.outcome}`) : t("notices.error"));
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(link);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      /* clipboard unavailable — link stays visible */
    }
  }

  if (items.length === 0) {
    return (
      <p className="text-xs text-text-muted" data-testid="sent-invitations-empty">
        {t("empty")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {notice && (
        <p role="status" className="text-xs text-text-secondary" data-testid="sent-invitations-notice">
          {notice}
        </p>
      )}
      <ul className="flex flex-col gap-2" data-testid="sent-invitations">
        {items.map((row) => (
          <li
            key={row.id}
            className="flex flex-col gap-1.5 rounded-md border border-ink-600 bg-ink-800/30 px-3 py-2"
            data-testid={`sent-invitation-${row.id}`}
          >
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-0 break-all font-medium text-text-primary">
                {row.invitedName ? `${row.invitedName} · ` : ""}
                {row.invitedEmail}
              </span>
              <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                {tTypes(row.invitationType)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 font-mono text-meta uppercase tracking-label">
              <span
                className={
                  row.status === "accepted"
                    ? "text-state-success"
                    : row.status === "pending"
                      ? "text-brand-blue"
                      : "text-text-muted"
                }
                data-testid={`sent-invitation-status-${row.id}`}
              >
                {t(`status.${row.status}`)}
              </span>
              {row.status === "pending" && (
                <span
                  className={
                    row.deliveryStatus === "sent"
                      ? "text-state-success"
                      : row.deliveryStatus === "delivery_failed"
                        ? "text-state-danger"
                        : "text-text-muted"
                  }
                  data-testid={`sent-invitation-delivery-${row.id}`}
                >
                  {t(`delivery.${row.deliveryStatus}`)}
                </span>
              )}
              <span className="text-text-muted">
                {formatUtcDate(row.createdAt, locale)}
              </span>
            </div>
            {row.status === "pending" && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onResend(row)}
                  disabled={busyId === row.id}
                  data-testid={`sent-invitation-resend-${row.id}`}
                  className="inline-flex items-center rounded border border-ink-500 px-2 py-1 text-meta text-text-secondary hover:border-brand-blue hover:text-text-primary disabled:opacity-50"
                >
                  {t("resend")}
                </button>
                <button
                  type="button"
                  onClick={() => onRevoke(row.id)}
                  disabled={busyId === row.id}
                  data-testid={`sent-invitation-revoke-${row.id}`}
                  className="inline-flex items-center rounded border border-state-danger/40 px-2 py-1 text-meta text-state-danger hover:border-state-danger disabled:opacity-50"
                >
                  {t("revoke")}
                </button>
                {freshLinks[row.id] && (
                  <button
                    type="button"
                    onClick={() => copyLink(freshLinks[row.id])}
                    data-testid={`sent-invitation-copy-${row.id}`}
                    className="inline-flex items-center gap-1 rounded border border-ink-500 px-2 py-1 text-meta text-text-secondary hover:border-brand-blue hover:text-text-primary"
                  >
                    {copied === freshLinks[row.id] ? (
                      <Check className="h-3 w-3" aria-hidden />
                    ) : (
                      <Copy className="h-3 w-3" aria-hidden />
                    )}
                    {copied === freshLinks[row.id] ? t("copied") : t("copyNewLink")}
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function IncomingInvitationList({
  items,
  locale,
}: {
  items: IncomingInvitationRow[];
  locale: string;
}) {
  const t = useTranslations("network.incoming");
  const tTypes = useTranslations("network.invite.types");
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onAccept(id: string) {
    setBusyId(id);
    setNotice(null);
    try {
      const r = await acceptInvitationByIdAction({ invitationId: id, locale });
      setNotice(
        r.status === "ok" ? t(`notices.${r.outcome}`) : t("notices.error"),
      );
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {notice && (
        <p role="status" className="text-xs text-text-secondary" data-testid="incoming-invitations-notice">
          {notice}
        </p>
      )}
      <ul className="flex flex-col gap-2" data-testid="incoming-invitations">
        {items.map((row) => (
          <li
            key={row.id}
            className="flex flex-col gap-1.5 rounded-md border border-brand-blue/40 bg-brand-blue/5 px-3 py-2"
            data-testid={`incoming-invitation-${row.id}`}
          >
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-text-primary">
                {tTypes(row.invitationType)}
              </span>
              {(row.organizationName ?? row.projectTitle) && (
                <span className="text-text-secondary">
                  {row.organizationName ?? row.projectTitle}
                </span>
              )}
              {row.inviterName && (
                <span className="text-meta text-text-muted">
                  {t("from", { name: row.inviterName })}
                </span>
              )}
            </div>
            {row.personalMessage && (
              <p className="text-xs text-text-secondary">
                &ldquo;{row.personalMessage}&rdquo;
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onAccept(row.id)}
                disabled={busyId === row.id}
                data-testid={`incoming-invitation-accept-${row.id}`}
                className="inline-flex min-h-9 items-center rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-3 py-1.5 text-xs font-semibold text-ink-900 transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busyId === row.id ? t("accepting") : t("accept")}
              </button>
              <span className="text-meta text-text-muted">
                {t("expires", {
                  date: formatUtcDate(row.expiresAt, locale) ?? "",
                })}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
