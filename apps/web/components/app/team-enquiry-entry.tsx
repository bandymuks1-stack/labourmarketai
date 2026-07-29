"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import {
  proposeTeamEnquiryAction,
  withdrawTeamEnquiryAction,
} from "@/lib/company/team-enquiry-actions";
import type { MyTeamEnquiry } from "@/lib/company/team-enquiries";

/**
 * Employer-side team enquiry surfaces (Trust Connect Teams v1, gap 3).
 *
 * TeamEnquiryButton lives ONLY where a team org is already legitimately
 * visible (the network company search — organizations expose their public
 * display fields there today). It is NOT a team directory: nothing new
 * becomes discoverable, the button just turns existing visibility into a
 * structured, auditable enquiry instead of an off-platform contact hunt.
 *
 * Honesty rules:
 *  - platform messages only; the server refuses embedded emails/phone-like
 *    numbers and the form says so up front;
 *  - every outcome is reported truthfully, including the "prepared, not
 *    enabled" state before the owner applies 20260716131000;
 *  - statuses render as translated labels, never raw database words.
 */
export function TeamEnquiryButton({
  teamOrgId,
  locale,
}: {
  teamOrgId: string;
  locale: string;
}) {
  const router = useRouter();
  const t = useTranslations("teamEnquiries");
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function submit() {
    if (message.trim().length === 0) return;
    setMsg(null);
    startTransition(async () => {
      const res = await proposeTeamEnquiryAction({
        teamOrgId,
        message,
        startDate: startDate || null,
        endDate: endDate || null,
        locale,
      });
      if (res.outcome === "created") {
        setMessage("");
        setStartDate("");
        setEndDate("");
        setOpen(false);
        setMsg(t("outcome.created"));
      } else if (res.outcome === "existing_open") {
        // Idempotent create: the platform returned the already-open enquiry.
        setOpen(false);
        setMsg(t("outcome.duplicateOpen"));
      }
      else if (res.outcome === "own_team") setMsg(t("outcome.ownTeam"));
      else if (res.outcome === "contact_details_in_message")
        setMsg(t("outcome.contactDetails"));
      else if (res.outcome === "message_required") setMsg(t("outcome.messageRequired"));
      else if (res.outcome === "message_too_long") setMsg(t("outcome.messageTooLong"));
      else if (res.outcome === "invalid_dates") setMsg(t("outcome.invalidDates"));
      else if (res.outcome === "rate_limited" || res.outcome === "limit_reached")
        setMsg(t("outcome.rateLimited"));
      else if (res.outcome === "needs_migration") setMsg(t("notEnabled"));
      else setMsg(t("outcome.error"));
      router.refresh();
    });
  }

  return (
    <div className="flex w-full flex-col gap-2" data-testid={`team-enquiry-entry-${teamOrgId}`}>
      {!open ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setOpen(true)}
          data-testid={`team-enquiry-open-${teamOrgId}`}
        >
          {t("enquireButton")}
        </Button>
      ) : (
        <div className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/30 p-3">
          <p className="text-xs text-text-secondary">{t("formIntro")}</p>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {t("messageLabel")}
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder={t("messagePlaceholder")}
              data-testid={`team-enquiry-message-${teamOrgId}`}
              className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              {t("startLabel")}
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="min-h-9 rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              {t("endLabel")}
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="min-h-9 rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pending || message.trim().length === 0}
              onClick={submit}
              data-testid={`team-enquiry-submit-${teamOrgId}`}
            >
              {pending ? t("sending") : t("submit")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}
      {msg && (
        <p
          role="status"
          className="text-xs text-text-secondary"
          data-testid={`team-enquiry-msg-${teamOrgId}`}
        >
          {msg}
        </p>
      )}
    </div>
  );
}

/** The employer's own enquiries with real lifecycle + the ONLY employer view
 *  of a team's availability (the bounded snapshot from the read model). */
export function MyTeamEnquiriesList({
  items,
  locale,
}: {
  items: readonly MyTeamEnquiry[];
  locale: string;
}) {
  const router = useRouter();
  const t = useTranslations("teamEnquiries");
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

  function withdraw(enquiryId: string) {
    setMsg(null);
    startTransition(async () => {
      const res = await withdrawTeamEnquiryAction({ enquiryId, locale });
      if (res.outcome === "withdrawn") setMsg(t("withdrawOutcome.withdrawn"));
      else if (res.outcome === "not_open") setMsg(t("withdrawOutcome.notOpen"));
      else if (res.outcome === "needs_migration") setMsg(t("notEnabled"));
      else setMsg(t("withdrawOutcome.error"));
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <p className="text-xs text-text-muted" data-testid="my-team-enquiries-empty">
        {t("myList.empty")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="my-team-enquiries">
      <ul className="flex flex-col gap-2">
        {items.map((e) => (
          <li
            key={e.id}
            className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/30 p-3"
            data-testid={`my-team-enquiry-${e.id}`}
          >
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-sm font-medium text-text-primary">
                {e.teamName ?? t("myList.unknownTeam")}
              </span>
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
            {e.teamAvailability && (
              <ul className="flex flex-wrap gap-1.5">
                <li className="rounded-md border border-ink-600 bg-ink-800/60 px-2 py-0.5 text-meta text-text-secondary">
                  {e.teamAvailability.availabilityStatus === "available_now"
                    ? t("availability.availableNow")
                    : e.teamAvailability.availabilityStatus === "available_from"
                      ? t("availability.from", {
                          date: e.teamAvailability.availableFrom ?? "—",
                        })
                      : t("availability.notAvailable")}
                </li>
                {e.teamAvailability.accommodationNeeded && (
                  <li className="rounded-md border border-ink-600 bg-ink-800/60 px-2 py-0.5 text-meta text-text-secondary">
                    {t("availability.accommodationNeeded")}
                  </li>
                )}
                {e.teamAvailability.transportOwn && (
                  <li className="rounded-md border border-ink-600 bg-ink-800/60 px-2 py-0.5 text-meta text-text-secondary">
                    {t("availability.ownTransport")}
                  </li>
                )}
                {e.teamAvailability.maxTripDays != null && (
                  <li className="rounded-md border border-ink-600 bg-ink-800/60 px-2 py-0.5 text-meta text-text-secondary">
                    {t("availability.maxTripDays", {
                      count: e.teamAvailability.maxTripDays,
                    })}
                  </li>
                )}
              </ul>
            )}
            {e.status === "created" && (
              <div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => withdraw(e.id)}
                  data-testid={`my-team-enquiry-withdraw-${e.id}`}
                >
                  {t("withdraw")}
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
          data-testid="my-team-enquiries-msg"
        >
          {msg}
        </p>
      )}
    </div>
  );
}
