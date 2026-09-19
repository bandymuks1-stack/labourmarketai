"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import {
  endRosterLinkAction,
  type EndRosterLinkResult,
} from "@/lib/company/roster-link-end-actions";
import type { TeamLink } from "@/lib/company/team-links";

/**
 * ENDING A ROSTER LINK — the control, used on both sides (R-9).
 *
 * Two steps, because a relationship ends the moment this succeeds and the
 * organization stops recognising the person everywhere (assignment
 * eligibility, private profile read, agency offers) — not something to do by
 * mis-tap. The server action re-derives who is asking; the database decides
 * whether they may (the worker themselves, the owner, or an admin).
 *
 * `side` only picks the sentences: "leave" for the person, "remove" for the
 * owner. Authority is never a prop.
 */
export function RosterLinkEndControl({
  kind,
  orgLegacyId,
  workerId,
  side,
}: {
  kind: "company" | "agency";
  orgLegacyId: string;
  workerId: string;
  side: "self" | "owner";
}) {
  const t = useTranslations("rosterLinkEnd");
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState<EndRosterLinkResult | null, FormData>(
    endRosterLinkAction,
    null,
  );

  if (state?.ok) {
    return (
      <p className="text-xs text-text-secondary" role="status" data-testid="roster-link-ended">
        {side === "self" ? t("doneSelf") : t("doneOwner")}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="roster-link-end-open"
        className="min-h-11 w-fit rounded-md border border-ink-500 bg-ink-800 px-3 text-xs font-semibold text-text-secondary hover:border-state-warning/60"
      >
        {side === "self" ? t("openSelf") : t("openOwner")}
      </button>
    );
  }

  return (
    <form action={submit} className="flex flex-col gap-2" data-testid="roster-link-end-form">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="org_legacy_id" value={orgLegacyId} />
      <input type="hidden" name="worker_id" value={workerId} />
      <p className="text-xs text-text-secondary">
        {side === "self" ? t("confirmSelf") : t("confirmOwner")}
      </p>
      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        <span>{t("reasonLabel")}</span>
        <input
          name="reason"
          type="text"
          maxLength={500}
          className="rounded-md border border-ink-500 bg-ink-800 px-3 py-2 text-xs text-text-primary outline-none focus:border-state-warning"
          data-testid="roster-link-end-reason"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          data-testid="roster-link-end-submit"
          className="min-h-11 rounded-md border border-state-warning/50 bg-state-warning/10 px-3 text-xs font-semibold text-state-warning disabled:opacity-50"
        >
          {t("submit")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="min-h-11 rounded-md border border-ink-500 bg-ink-800 px-3 text-xs font-semibold text-text-secondary disabled:opacity-50"
        >
          {t("cancel")}
        </button>
      </div>
      {state?.ok === false ? (
        <p role="alert" className="text-xs text-state-warning" data-testid="roster-link-end-error">
          {state.code === "needs_migration"
            ? t("needsMigration")
            : state.code === "not_found"
              ? t("notFound")
              : t("failed")}
        </p>
      ) : null}
    </form>
  );
}

/**
 * "MY TEAMS" — the person's own active roster links, with the withdrawal.
 * Renders nothing when there is nothing to withdraw; a failed read is its
 * own sentence, never "you are on no team".
 */
export function TeamLinkWithdrawals({
  result,
}: {
  result:
    | { kind: "ok"; rows: readonly TeamLink[] }
    | { kind: "needs-migration" }
    | { kind: "error"; message: string };
}) {
  const t = useTranslations("rosterLinkEnd");
  if (result.kind === "needs-migration") return null;
  if (result.kind === "ok" && result.rows.length === 0) return null;
  return (
    <section
      id="team-link-withdrawals"
      className="flex flex-col gap-2"
      data-testid="team-links"
      aria-labelledby="team-link-withdrawals-title"
    >
      <p
        id="team-link-withdrawals-title"
        className="font-mono text-meta uppercase tracking-label text-text-muted"
      >
        {t("title")}
      </p>
      <p className="text-xs leading-relaxed text-text-secondary">{t("hint")}</p>
      {result.kind === "error" ? (
        <p className="text-xs text-state-danger" role="status" data-testid="team-links-error">
          {t("readFailed")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {result.rows.map((link) => (
            <li
              key={`${link.kind}-${link.orgLegacyId}`}
              className="card-border flex flex-col gap-2 p-3"
              data-testid="team-link"
              data-kind={link.kind}
            >
              <p className="text-sm text-text-primary">
                {link.organizationName ?? t("unnamedOrganization")}
                <span className="ml-2 font-mono text-meta text-text-muted">
                  {t("since", { date: link.since.slice(0, 10) })}
                </span>
              </p>
              <RosterLinkEndControl
                kind={link.kind}
                orgLegacyId={link.orgLegacyId}
                workerId={link.workerId}
                side="self"
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
