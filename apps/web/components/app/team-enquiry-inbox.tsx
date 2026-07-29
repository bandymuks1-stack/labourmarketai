"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { respondTeamEnquiryAction } from "@/lib/company/team-brigade-actions";
import type { TeamEnquiry } from "@/lib/company/team-brigades";

/**
 * Team-leader enquiry inbox (Trust Connect Teams v1, gap 3): real enquiries
 * addressed to this team, with accept/decline going only through the gated
 * state-machine RPC. Statuses are always translated labels — never a raw
 * database word — and the proposer is shown by display name only (the read
 * model carries no emails or phones).
 */
export function TeamEnquiryInbox({
  teamId,
  enquiries,
}: {
  teamId: string;
  enquiries: readonly TeamEnquiry[];
}) {
  const router = useRouter();
  const t = useTranslations("teamBrigades.enquiries");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const statusLabel = (status: string) => {
    switch (status) {
      case "created":
        return t("status.created");
      case "accepted":
        return t("status.accepted");
      case "declined":
        return t("status.declined");
      case "withdrawn":
        return t("status.withdrawn");
      case "expired":
        return t("status.expired");
      default:
        return t("status.other");
    }
  };

  function respond(enquiryId: string, decision: "accepted" | "declined") {
    setMsg(null);
    startTransition(async () => {
      const res = await respondTeamEnquiryAction({ enquiryId, decision });
      if (res.outcome === "accepted") setMsg(t("respondOutcome.accepted"));
      else if (res.outcome === "declined") setMsg(t("respondOutcome.declined"));
      else if (res.outcome === "not_allowed") setMsg(t("respondOutcome.notAllowed"));
      else if (res.outcome === "not_open") setMsg(t("respondOutcome.notOpen"));
      else if (res.outcome === "needs_migration") setMsg(t("notEnabled"));
      else setMsg(t("respondOutcome.error"));
      router.refresh();
    });
  }

  if (enquiries.length === 0) {
    return (
      <p className="text-xs text-text-muted" data-testid={`team-enquiries-empty-${teamId}`}>
        {t("empty")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid={`team-enquiries-${teamId}`}>
      <ul className="flex flex-col gap-2">
        {enquiries.map((e) => (
          <li
            key={e.id}
            className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/30 p-3"
            data-testid={`team-enquiry-${e.id}`}
          >
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-sm font-medium text-text-primary">
                {e.proposerName ?? t("unknownProposer")}
              </span>
              {e.proposerCompanyName && (
                <span className="text-meta text-text-muted">
                  {e.proposerCompanyName}
                </span>
              )}
              <span className="ml-auto font-mono text-meta uppercase tracking-label text-text-muted">
                {statusLabel(e.status)}
              </span>
            </div>
            <p className="whitespace-pre-wrap break-words text-xs text-text-secondary">
              {e.message}
            </p>
            {(e.startDate ?? e.expectedEndDate) && (
              <p className="text-meta text-text-muted">
                {t("dates", {
                  from: e.startDate ?? "—",
                  to: e.expectedEndDate ?? "—",
                })}
              </p>
            )}
            {e.status === "created" && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={() => respond(e.id, "accepted")}
                  data-testid={`team-enquiry-accept-${e.id}`}
                >
                  {t("accept")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => respond(e.id, "declined")}
                  data-testid={`team-enquiry-decline-${e.id}`}
                >
                  {t("decline")}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {msg && (
        <p
          role="status"
          className="text-xs text-text-secondary"
          data-testid={`team-enquiries-msg-${teamId}`}
        >
          {msg}
        </p>
      )}
    </div>
  );
}
