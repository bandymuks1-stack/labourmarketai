"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { confirmEntry, rejectEntry } from "@/lib/journal/confirm-actions";

export type InboxEntry = {
  id: string;
  originalText: string;
  workerName: string;
  createdAt: string;
  metrics: { label: string; value: string }[];
  skills: string[];
};

function PendingButton({
  children,
  variant = "primary",
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {children}
    </Button>
  );
}

/** One pending entry in the manager confirm inbox (§13.2). Confirm is a single
 *  click; reject reveals a reason field. */
export function JournalInboxEntry({ entry }: { entry: InboxEntry }) {
  const t = useTranslations("journal");
  const locale = useLocale();
  const [rejecting, setRejecting] = useState(false);

  return (
    <li className="card-border flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-sm font-semibold text-text-primary">
            {entry.workerName}
          </p>
          <p className="mt-0.5 text-[11px] text-text-muted">
            {new Date(entry.createdAt).toLocaleDateString(locale)}
          </p>
        </div>
      </div>

      <p className="text-sm text-text-primary">{entry.originalText}</p>

      {entry.metrics.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-muted">
          {entry.metrics.map((m) => (
            <span key={m.label}>
              <span className="uppercase tracking-label">{m.label}:</span> {m.value}
            </span>
          ))}
        </div>
      )}

      {entry.skills.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {t("inbox.skills")}
          </span>
          {entry.skills.map((s) => (
            <span
              key={s}
              className="rounded-full border border-ink-500 px-2 py-0.5 text-[11px] text-text-secondary"
            >
              {s}
            </span>
          ))}
        </div>
      )}

      {!rejecting ? (
        <div className="flex items-center gap-2">
          <form action={confirmEntry}>
            <input type="hidden" name="entry_id" value={entry.id} />
            <input type="hidden" name="locale" value={locale} />
            <PendingButton>{t("inbox.confirm")}</PendingButton>
          </form>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setRejecting(true)}
          >
            {t("inbox.reject")}
          </Button>
        </div>
      ) : (
        <form action={rejectEntry} className="flex flex-col gap-2">
          <input type="hidden" name="entry_id" value={entry.id} />
          <input type="hidden" name="locale" value={locale} />
          <Input name="reason" placeholder={t("inbox.rejectReason")} required />
          <div className="flex items-center gap-2">
            <PendingButton variant="secondary">{t("inbox.reject")}</PendingButton>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setRejecting(false)}
            >
              {t("inbox.cancel")}
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}
