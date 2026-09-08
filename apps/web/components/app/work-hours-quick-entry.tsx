"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { TimesheetImportReview } from "@/components/app/timesheet-import-review";
import { recordAllocationAction } from "@/lib/work-hours/allocations-actions";
import type { AllocationActionState } from "@/lib/work-hours/allocations-actions";
import type {
  HoursPageEntry,
  HoursPageObject,
  HoursPageWorker,
} from "@/lib/work-hours/hours-page-data";

/**
 * QUICK ENTRY — built for a site manager entering a whole crew on a phone.
 *
 * The shape of the real task drove every decision here. An operator does not
 * fill one form and leave; they enter twenty people, mostly on the same date
 * and often on the same object, standing up, with one thumb. So:
 *
 *   * DATE AND OBJECT PERSIST after a save. They are the fields that repeat
 *     across a crew, and re-picking them twenty times is the whole reason
 *     paper still wins.
 *   * ONLY THE WORKER AND HOURS RESET. Those are what actually differ per
 *     person, and leaving a previous worker selected is how somebody's hours
 *     get recorded against the wrong name.
 *   * "SAME WORKER — ANOTHER OBJECT" keeps the worker and clears the object,
 *     which is the exact Vitalii case: 8 h on 01, then 2 h on 05.
 *   * OBJECTS ARE TAP TARGETS, not a dropdown, tinted so they are told apart
 *     by colour before they are read.
 *
 * Convenience never writes anything by itself. Every allocation is one
 * deliberate Save, and an identical entry within two minutes raises a warning
 * the operator can override — because two identical allocations are also a
 * legitimate morning and afternoon shift, and only the person standing there
 * knows which it is.
 */

const INITIAL: AllocationActionState = { status: "idle" };

export function WorkHoursQuickEntry({
  workDate,
  workers,
  objects,
  entries,
  dayTotal,
}: {
  workDate: string;
  workers: readonly HoursPageWorker[];
  objects: readonly HoursPageObject[];
  entries: readonly HoursPageEntry[];
  dayTotal: number;
}) {
  const t = useTranslations("workHours");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, action, pending] = useActionState(recordAllocationAction, INITIAL);

  const [date, setDate] = useState(workDate);
  const [workerId, setWorkerId] = useState("");
  const [objectId, setObjectId] = useState("");
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const hoursRef = useRef<HTMLInputElement>(null);

  // What the operator just saved, so a repeat of the SAME shape can be
  // questioned once rather than blocked forever.
  const lastSaved = useRef<string | null>(null);
  const [duplicateArmed, setDuplicateArmed] = useState(false);
  const signature = `${workerId}|${date}|${objectId}|${hours}`;

  useEffect(() => {
    if (state.status !== "saved") return;
    lastSaved.current = signature;
    setDuplicateArmed(false);
    // Keep date + object (they repeat across a crew); clear who and how much.
    setWorkerId("");
    setHours("");
    setNote("");
    router.refresh();
    // signature is intentionally not a dependency: this must run once per
    // save, not whenever the operator edits a field afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, router]);

  const workersById = useMemo(
    () => new Map(workers.map((w) => [w.workerId, w])),
    [workers],
  );
  const selectedWorker = workersById.get(workerId) ?? null;

  const wouldRepeatLastSave =
    lastSaved.current !== null && lastSaved.current === signature;
  const blockedByDuplicate = wouldRepeatLastSave && !duplicateArmed;

  const errorText = (): string | null => {
    if (state.status === "invalid") {
      if (state.field === "hours") {
        return state.problem === "not-a-quarter"
          ? t("errors.quarter")
          : t("errors.hours");
      }
      return t(`errors.${state.field}`);
    }
    if (state.status === "not-authorized") return t("errors.notAuthorized");
    if (state.status === "needs-migration") return t("states.needsMigration");
    if (state.status === "error") return t("errors.generic");
    return null;
  };
  const error = errorText();

  // `?import=1` swaps the entry form for the TIMESHEET IMPORT surface — the
  // same screen, because a historical monthly grid and today's quick entry
  // produce the exact same canonical facts (work_hour_allocations), just in
  // bulk and with a human-reviewed interpretation step in between. It renders
  // only here, on the employer/manager `ok` branch this component requires.
  if (searchParams.get("import") === "1") {
    return (
      <div className="flex w-full flex-col gap-5">
        <Link
          href={`?d=${workDate}`}
          className="self-start text-sm underline underline-offset-4"
          data-testid="hours-import-back"
        >
          {t("import.backToEntry")}
        </Link>
        <TimesheetImportReview workers={workers} objects={objects} />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <Link
        href="?import=1"
        className="self-start text-sm underline underline-offset-4"
        data-testid="hours-import-link"
      >
        {t("import.entryLink")}
      </Link>
      <form action={action} className="flex flex-col gap-4">
        {/* The server reads only these. `entered_by` is never a form field —
            it is taken from the session, so an operator cannot be recorded as
            somebody else. */}
        <input type="hidden" name="work_date" value={date} />
        <input type="hidden" name="worker_id" value={workerId} />
        <input type="hidden" name="work_object_id" value={objectId} />

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("date")}</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="min-h-12 rounded-md border border-border-subtle bg-surface-1 px-3 text-base"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("worker")}</span>
          <select
            value={workerId}
            onChange={(e) => setWorkerId(e.target.value)}
            className="min-h-12 rounded-md border border-border-subtle bg-surface-1 px-3 text-base"
            data-testid="hours-worker-select"
          >
            <option value="">{t("selectWorker")}</option>
            {workers.map((w) => (
              <option key={w.workerId} value={w.workerId}>
                {w.name}
                {w.dayTotal > 0 ? ` · ${w.dayTotal} h` : ""}
              </option>
            ))}
          </select>
          {selectedWorker && selectedWorker.dayTotal > 0 ? (
            // The running total for this person today — the number that tells
            // an operator whether they have already entered them.
            <span className="text-xs text-text-secondary" data-testid="hours-worker-day-total">
              {t("dayTotal")}: {selectedWorker.dayTotal} h
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("object")}</span>
          <div className="flex flex-wrap gap-2" data-testid="hours-object-picker">
            {objects.map((o) => {
              const selected = o.id === objectId;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setObjectId(selected ? "" : o.id)}
                  aria-pressed={selected}
                  data-testid={`hours-object-${o.id}`}
                  className={`min-h-12 min-w-16 rounded-md border-2 px-4 text-base font-semibold transition ${
                    selected ? "text-white" : "bg-surface-1 text-text-primary"
                  }`}
                  style={{
                    borderColor: o.tint,
                    backgroundColor: selected ? o.tint : undefined,
                  }}
                >
                  {o.name}
                </button>
              );
            })}
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("hours")}</span>
          <input
            ref={hoursRef}
            name="hours"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            // `decimal` rather than `numeric`: a Lithuanian phone keypad must
            // be able to produce the comma this form accepts.
            inputMode="decimal"
            placeholder={t("hoursHint")}
            className="min-h-12 rounded-md border border-border-subtle bg-surface-1 px-3 text-base"
            data-testid="hours-input"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("note")}</span>
          <input
            name="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="min-h-12 rounded-md border border-border-subtle bg-surface-1 px-3 text-base"
            data-testid="hours-note"
          />
        </label>

        {blockedByDuplicate ? (
          <p
            className="rounded-md border border-dashed border-state-warning/50 px-3 py-2 text-sm"
            data-testid="hours-duplicate-warning"
            role="status"
          >
            {t("duplicateWarning")}
          </p>
        ) : null}

        {error ? (
          <p className="text-sm text-state-danger" role="alert" data-testid="hours-error">
            {error}
          </p>
        ) : null}
        {state.status === "saved" && !error ? (
          <p className="text-sm text-state-success" role="status" data-testid="hours-saved">
            {t("saved")}
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <button
            type="submit"
            disabled={pending}
            onClick={() => {
              // A repeat of the exact last save arms the warning instead of
              // writing. The SECOND press goes through — the operator, not the
              // form, decides whether it is a mistake or a second shift.
              if (wouldRepeatLastSave && !duplicateArmed) setDuplicateArmed(true);
            }}
            className="min-h-12 rounded-md bg-accent px-4 text-base font-semibold text-white disabled:opacity-60"
            data-testid="hours-save"
          >
            {pending ? t("saving") : t("save")}
          </button>

          {state.status === "saved" ? (
            <button
              type="button"
              onClick={() => {
                // The Vitalii case, as one tap: keep the person, clear where.
                setWorkerId(state.workerId);
                setObjectId("");
                setHours("");
                hoursRef.current?.focus();
              }}
              className="min-h-12 rounded-md border border-border-subtle px-4 text-base"
              data-testid="hours-add-another"
            >
              {t("addAnother")}
            </button>
          ) : null}
        </div>
      </form>

      <section className="flex flex-col gap-2" data-testid="hours-entries">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold">{t("entriesTitle")}</h2>
          <span className="text-sm text-text-secondary" data-testid="hours-day-total">
            {t("dayTotal")}: {dayTotal} h
          </span>
        </div>
        {entries.length === 0 ? (
          <p className="text-sm text-text-secondary">{t("noEntries")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex items-center gap-3 rounded-md border border-border-subtle p-3"
                data-testid="hours-entry"
              >
                <span
                  aria-hidden
                  className="h-8 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: e.objectTint }}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{e.workerName}</span>
                  <span className="truncate text-xs text-text-secondary">
                    {e.objectName}
                    {e.note ? ` · ${e.note}` : ""}
                    {e.enteredForSomeoneElse ? ` · ${t("enteredForSomeoneElse")}` : ""}
                  </span>
                </span>
                <span className="ml-auto text-base font-semibold tabular-nums">
                  {e.hours} h
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
