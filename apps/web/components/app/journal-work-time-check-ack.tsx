"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/lib/i18n/navigation";
import {
  OVERRIDE_REASON_MAX,
  OVERRIDE_REASON_MIN,
} from "@/lib/journal/work-time-plausibility";
import { acknowledgeWorkTimeCheck } from "@/lib/journal/work-time-plausibility-actions";

/**
 * "Stand by this record" — the worker acknowledges a plausibility check with
 * a reason (owner §13: overrides recorded with reason). One append-only row
 * through the one server action; the section re-renders from the real rows
 * (router.refresh) and shows the check as acknowledged with the reason —
 * nothing is hidden and no figure changes.
 */
export function JournalWorkTimeCheckAck({
  entryId,
  code,
  day,
  checkKey,
}: {
  entryId: string;
  code: string;
  day: string;
  checkKey: string;
}) {
  const t = useTranslations("journal.intelligence.checks");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "error" | "done">("idle");
  const [pending, start] = useTransition();
  const trimmed = reason.replace(/\s+/g, " ").trim();
  const valid =
    trimmed.length >= OVERRIDE_REASON_MIN && trimmed.length <= OVERRIDE_REASON_MAX;
  const id = `wi-check-ack-${checkKey.replace(/[^a-z0-9]+/gi, "-")}`;

  if (state === "done") {
    return (
      <p
        role="status"
        className="text-meta text-text-muted"
        data-testid={`${id}-done`}
      >
        {t("ackDone")}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-9 self-start rounded-md border border-border-subtle px-2.5 text-meta font-medium text-text-secondary hover:border-brand-blue/60 hover:text-text-primary"
        data-testid={`${id}-open`}
      >
        {t("ackOpen")}
      </button>
    );
  }

  return (
    <form
      className="flex flex-col gap-1.5"
      data-testid={id}
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || pending) return;
        start(async () => {
          const res = await acknowledgeWorkTimeCheck({
            entryId,
            code,
            day,
            reason: trimmed,
          });
          if (!res.ok) {
            setState("error");
            return;
          }
          setState("done");
          router.refresh();
        });
      }}
    >
      <label htmlFor={`${id}-reason`} className="text-meta text-text-secondary">
        {t("ackLabel")}
      </label>
      <input
        id={`${id}-reason`}
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={OVERRIDE_REASON_MAX}
        placeholder={t("ackPlaceholder")}
        className="min-h-9 rounded-md border border-border-subtle bg-surface-1 px-2.5 text-sm text-text-primary"
        data-testid={`${id}-reason`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={!valid || pending}
          className="min-h-9 rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-3 text-meta font-semibold text-ink-900 disabled:opacity-50"
          data-testid={`${id}-submit`}
        >
          {pending ? t("ackWorking") : t("ackSubmit")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-9 px-2 text-meta text-text-muted hover:text-text-primary"
        >
          {t("ackCancel")}
        </button>
        {state === "error" && (
          <span
            role="alert"
            className="text-meta text-state-warning"
            data-testid={`${id}-error`}
          >
            {t("ackError")}
          </span>
        )}
      </div>
    </form>
  );
}
