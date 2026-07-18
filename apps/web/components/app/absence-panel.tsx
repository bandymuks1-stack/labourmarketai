"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import {
  cancelAbsenceAction,
  requestAbsenceAction,
  reviewAbsenceAction,
} from "@/lib/leave/absences-actions";
import {
  ABSENCE_TYPES,
  type AbsenceStatus,
  type AbsenceType,
  type ManagerAbsencesData,
  type MyAbsencesData,
} from "@/lib/leave/absences-model";

const STATUS_TONE: Record<AbsenceStatus, string> = {
  requested: "border-state-warning/40 text-state-warning",
  approved: "border-state-success/40 text-state-success",
  rejected: "border-state-danger/40 text-state-danger",
  cancelled: "border-ink-500 text-text-muted",
};

function StatusChip({ status, label }: { status: AbsenceStatus; label: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label ${STATUS_TONE[status]}`}>
      {label}
    </span>
  );
}

/** Worker: request an absence + see own requests. */
export function MyAbsencesPanel({ data }: { data: MyAbsencesData }) {
  const router = useRouter();
  const t = useTranslations("absences");
  const [pending, startTransition] = useTransition();
  const [absenceType, setAbsenceType] = useState<AbsenceType>("annual_leave");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [halfDay, setHalfDay] = useState(false);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  function report(m: string) {
    setMsg(m);
    router.refresh();
  }

  function submit() {
    if (!data.applied || !data.workerId) return;
    setMsg(null);
    startTransition(async () => {
      const res = await requestAbsenceAction({
        workerId: data.workerId as string,
        absenceType,
        startDate,
        endDate,
        halfDay,
        note: note.trim() || undefined,
      });
      if (res.ok) {
        setStartDate("");
        setEndDate("");
        setNote("");
        report(t("outcome.requested"));
      } else {
        report(t(`outcome.${res.code}`));
      }
    });
  }

  function cancel(id: string) {
    startTransition(async () => {
      const res = await cancelAbsenceAction({ absenceId: id });
      report(res.ok ? t("outcome.cancelled") : t(`outcome.${res.code}`));
    });
  }

  return (
    <section className="card-border flex flex-col gap-4 p-5" data-testid="my-absences-panel">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-text-primary">{t("myTitle")}</h2>
        <p className="text-[11px] leading-relaxed text-text-muted">{t("honestNote")}</p>
      </header>

      {!data.applied ? (
        <p className="text-sm text-text-muted" data-testid="absences-preapply">{t("preApply")}</p>
      ) : !data.workerId ? (
        <p className="text-sm text-text-secondary" data-testid="absences-no-worker">{t("noWorker")}</p>
      ) : (
        <>
          {data.absences.length === 0 ? (
            <p className="text-sm text-text-secondary" data-testid="my-absences-empty">{t("myEmpty")}</p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="my-absences-list">
              {data.absences.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-md border border-ink-600 bg-ink-800/40 p-3">
                  <span className="text-sm text-text-primary">{t(`types.${a.absenceType}`)}</span>
                  <span className="font-mono text-[10px] text-text-muted">{a.startDate} → {a.endDate}{a.halfDay ? ` · ${t("halfDay")}` : ""}</span>
                  <StatusChip status={a.status} label={t(`statuses.${a.status}`)} />
                  {(a.status === "requested" || a.status === "approved") && (
                    <button type="button" onClick={() => cancel(a.id)} disabled={pending}
                      className="ml-auto rounded-md border border-ink-500 px-2 py-1 text-[11px] text-text-muted hover:border-state-danger hover:text-state-danger"
                      data-testid="absence-cancel">
                      {t("cancel")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-2 border-t border-ink-600 pt-3">
            <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">{t("requestHeading")}</span>
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label={t("typeLabel")} value={absenceType} disabled={pending}
                onChange={(e) => setAbsenceType(e.target.value as AbsenceType)}
                className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-text-primary" data-testid="absence-type">
                {ABSENCE_TYPES.map((tp) => (<option key={tp} value={tp}>{t(`types.${tp}`)}</option>))}
              </select>
              <input type="date" aria-label={t("startLabel")} value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-text-primary" data-testid="absence-start" />
              <input type="date" aria-label={t("endLabel")} value={endDate} onChange={(e) => setEndDate(e.target.value)}
                className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-text-primary" data-testid="absence-end" />
              <label className="flex items-center gap-1 text-xs text-text-secondary">
                <input type="checkbox" checked={halfDay} onChange={(e) => setHalfDay(e.target.checked)} data-testid="absence-halfday" />
                {t("halfDay")}
              </label>
            </div>
            <input aria-label={t("noteLabel")} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)}
              placeholder={t("notePlaceholder")}
              className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-sm text-text-primary" data-testid="absence-note" />
            <div>
              <Button type="button" size="sm" disabled={pending || !startDate || !endDate} onClick={submit} data-testid="absence-submit">
                {pending ? t("saving") : t("requestButton")}
              </Button>
            </div>
          </div>
        </>
      )}
      {msg && <p className="text-xs text-text-secondary" data-testid="absences-msg">{msg}</p>}
    </section>
  );
}

/** Manager: approve / reject pending requests for workers they manage. */
export function ManagerAbsencesPanel({ data }: { data: ManagerAbsencesData }) {
  const router = useRouter();
  const t = useTranslations("absences");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function review(id: string, decision: "approved" | "rejected") {
    setMsg(null);
    startTransition(async () => {
      const res = await reviewAbsenceAction({ absenceId: id, decision });
      setMsg(res.ok ? t(`outcome.${decision}`) : t(`outcome.${res.code}`));
      router.refresh();
    });
  }

  return (
    <section className="card-border flex flex-col gap-4 p-5" data-testid="manager-absences-panel">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-text-primary">{t("managerTitle")}</h2>
        <p className="text-[11px] leading-relaxed text-text-muted">{t("managerNote")}</p>
      </header>
      {!data.applied ? (
        <p className="text-sm text-text-muted" data-testid="manager-absences-preapply">{t("preApply")}</p>
      ) : data.pending.length === 0 ? (
        <p className="text-sm text-text-secondary" data-testid="manager-absences-empty">{t("managerEmpty")}</p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="manager-absences-list">
          {data.pending.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-md border border-ink-600 bg-ink-800/40 p-3" data-testid="manager-absence-row">
              <span className="text-sm font-semibold text-text-primary">{a.workerName ?? t("unknownWorker")}</span>
              <span className="text-sm text-text-secondary">{t(`types.${a.absenceType}`)}</span>
              <span className="font-mono text-[10px] text-text-muted">{a.startDate} → {a.endDate}{a.halfDay ? ` · ${t("halfDay")}` : ""}</span>
              <div className="ml-auto flex gap-2">
                <Button type="button" size="sm" disabled={pending} onClick={() => review(a.id, "approved")} data-testid="absence-approve">
                  {t("approve")}
                </Button>
                <button type="button" disabled={pending} onClick={() => review(a.id, "rejected")}
                  className="rounded-md border border-ink-500 px-3 py-1 text-xs text-text-muted hover:border-state-danger hover:text-state-danger" data-testid="absence-reject">
                  {t("reject")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="text-xs text-text-secondary" data-testid="manager-absences-msg">{msg}</p>}
    </section>
  );
}
