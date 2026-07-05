"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { Link } from "@/lib/i18n/navigation";
import { useAuth } from "@/lib/auth/context";
import {
  createFollowUpTaskAction,
  setFollowUpTaskStatusAction,
  type FollowUpActionResult,
} from "@/lib/followup/follow-up-actions";
import type {
  FollowUpQueueData,
  FollowUpTask,
} from "@/lib/followup/follow-up-tasks-model";

/**
 * Internal follow-up task queue on the EXISTING admin control room
 * (§8.13, branch 24).
 *
 * - INTERNAL ONLY: creating or resolving a task contacts nobody. No email,
 *   no SMS, no push, no Telegram — the copy says so honestly.
 * - Subjects are id pointers (optional profile OR company); the profile
 *   pointer links to the EXISTING admin user-inspect page. No copied PII
 *   in the task row.
 * - Statuses are the honest lifecycle pending/done/dismissed — no urgency
 *   scores, no fake "contacted" state.
 * - Pre-apply (owner-gated migration not applied) the panel shows an honest
 *   "not yet available" state — no fake tasks, no fake counts.
 */
export function FollowUpQueuePanel({ data }: { data: FollowUpQueueData }) {
  const router = useRouter();
  const t = useTranslations("followUp");
  // The panel only ever renders on the requireSuperadmin-gated admin page;
  // the isAdmin check is defense-in-depth so the /dashboard/admin inspect
  // link is never rendered for a non-admin session (admin-visibility guard).
  const { isAdmin } = useAuth();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [subjectProfileId, setSubjectProfileId] = useState("");
  const [subjectCompanyId, setSubjectCompanyId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  function handleResult(res: FollowUpActionResult, okKey: string) {
    if (res.ok) {
      setMsg(t(okKey));
    } else if (res.code === "needs_migration") {
      setMsg(t("outcome.needsMigration"));
    } else if (res.code === "not_authorized") {
      setMsg(t("outcome.notAuthorized"));
    } else if (res.code === "limit_reached") {
      setMsg(t("outcome.limitReached"));
    } else if (res.code === "not_found") {
      setMsg(t("outcome.notFound"));
    } else if (res.code === "invalid") {
      setMsg(t("outcome.invalid"));
    } else {
      setMsg(t("outcome.error"));
    }
    router.refresh();
  }

  function submitCreate() {
    setMsg(null);
    startTransition(async () => {
      const res = await createFollowUpTaskAction({
        note: note.trim(),
        subjectProfileId: subjectProfileId.trim() || undefined,
        subjectCompanyId: subjectCompanyId.trim() || undefined,
      });
      if (res.ok) {
        setNote("");
        setSubjectProfileId("");
        setSubjectCompanyId("");
      }
      handleResult(res, "outcome.created");
    });
  }

  function setStatus(taskId: string, status: "pending" | "done" | "dismissed") {
    setMsg(null);
    startTransition(async () => {
      const res = await setFollowUpTaskStatusAction({ taskId, status });
      handleResult(res, "outcome.updated");
    });
  }

  function subjectLine(task: FollowUpTask) {
    if (task.subjectProfileId) {
      return (
        <span className="flex flex-wrap items-center gap-1.5">
          <span>{t("subjectPerson")}</span>
          {isAdmin ? (
            <Link
              href={`/dashboard/admin/users/${task.subjectProfileId}`}
              className="font-mono text-[10px] text-brand-blue hover:underline"
            >
              {task.subjectProfileId.slice(0, 8)}… → {t("openSubject")}
            </Link>
          ) : (
            <span className="font-mono text-[10px]">
              {task.subjectProfileId.slice(0, 8)}…
            </span>
          )}
        </span>
      );
    }
    if (task.subjectCompanyId) {
      return (
        <span>
          {t("subjectCompany")}{" "}
          <span className="font-mono text-[10px]">
            {task.subjectCompanyId.slice(0, 8)}…
          </span>
        </span>
      );
    }
    return <span>{t("subjectNone")}</span>;
  }

  return (
    <section
      className="flex flex-col gap-3"
      data-testid="admin-follow-up-queue"
    >
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("title")}
        </h2>
        <p className="text-xs text-text-secondary">{t("intro")}</p>
        <p className="text-[11px] text-text-muted">{t("honestNote")}</p>
      </div>

      {!data.applied ? (
        <p
          className="rounded-md border border-dashed border-ink-500 p-3 text-xs text-text-muted"
          data-testid="follow-up-preapply"
        >
          {t("preApply")}
        </p>
      ) : (
        <>
          {/* Pending queue — oldest first (a queue, not a feed). */}
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {t("queueHeading")} · {data.pending.length}
            </span>
            {data.pending.length === 0 ? (
              <p
                className="rounded-md border border-dashed border-ink-500 p-3 text-xs text-text-muted"
                data-testid="follow-up-empty"
              >
                {t("queueEmpty")}
              </p>
            ) : (
              <ul className="flex flex-col gap-2" data-testid="follow-up-pending">
                {data.pending.map((task) => (
                  <li
                    key={task.id}
                    className="card-border flex flex-col gap-2 p-3"
                  >
                    <p className="whitespace-pre-wrap text-sm text-text-primary">
                      {task.note}
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-muted">
                      {subjectLine(task)}
                      <span>
                        {t("createdLabel")}: {task.createdAt.slice(0, 10)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={pending}
                        onClick={() => setStatus(task.id, "done")}
                        data-testid={`follow-up-done-${task.id}`}
                      >
                        {t("actions.markDone")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => setStatus(task.id, "dismissed")}
                        data-testid={`follow-up-dismiss-${task.id}`}
                      >
                        {t("actions.dismiss")}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recently resolved — honest history, reopenable. */}
          {data.resolved.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                {t("resolvedHeading")}
              </span>
              <ul className="flex flex-col gap-1.5" data-testid="follow-up-resolved">
                {data.resolved.map((task) => (
                  <li
                    key={task.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">
                      {task.note}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                      {t(`statuses.${task.status}`)}
                    </span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setStatus(task.id, "pending")}
                      className="font-mono text-[10px] uppercase tracking-label text-brand-blue hover:text-brand-cyan"
                      data-testid={`follow-up-reopen-${task.id}`}
                    >
                      {t("actions.reopen")}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Create form — internal note + optional id-only subject pointer. */}
          <div className="flex flex-col gap-2 border-t border-ink-600 pt-3">
            <label
              className="text-xs text-text-secondary"
              htmlFor="follow-up-note"
            >
              {t("form.noteLabel")}
            </label>
            <textarea
              id="follow-up-note"
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("form.notePlaceholder")}
              className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-sm text-text-primary"
              data-testid="follow-up-note"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                aria-label={t("form.subjectProfileLabel")}
                value={subjectProfileId}
                onChange={(e) => setSubjectProfileId(e.target.value)}
                placeholder={t("form.subjectProfileLabel")}
                className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1 font-mono text-xs text-text-primary"
                data-testid="follow-up-subject-profile"
              />
              <input
                aria-label={t("form.subjectCompanyLabel")}
                value={subjectCompanyId}
                onChange={(e) => setSubjectCompanyId(e.target.value)}
                placeholder={t("form.subjectCompanyLabel")}
                className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1 font-mono text-xs text-text-primary"
                data-testid="follow-up-subject-company"
              />
            </div>
            <p className="text-[11px] text-text-muted">{t("form.subjectHint")}</p>
            <div>
              <Button
                type="button"
                size="sm"
                disabled={pending || note.trim().length === 0}
                onClick={submitCreate}
                data-testid="follow-up-submit"
              >
                {pending ? t("form.saving") : t("form.submit")}
              </Button>
            </div>
          </div>
        </>
      )}

      {msg && (
        <p className="text-xs text-text-secondary" data-testid="follow-up-msg">
          {msg}
        </p>
      )}
    </section>
  );
}
