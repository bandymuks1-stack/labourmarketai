"use client";

import { useActionState, useId, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { InlineConfirm } from "@/components/ui/InlineConfirm";
import {
  registerCounterpartyLink,
  revokeCounterpartyLink,
  type LinkActionState,
} from "@/lib/journal/counterparty-actions";
import {
  PARTY_ROLES,
  type LinkCandidate,
} from "@/lib/journal/counterparty-review-model";
import { formatUtcDate } from "@/lib/time/display";

/**
 * PROJECT PAGE - "Client acceptance of the work".
 *
 * The client's / owner's authorized representative registers their
 * organization as the counterparty of a worker who has a REAL, ACTIVE work
 * relationship on this project - a person assignment or a team assignment
 * (the worker is a member of a team assigned to the project). Nothing is
 * manufactured: the candidate list is produced by the database from those
 * assignments and the register / revoke actions re-check everything
 * server-side. The worker can never register their own counterparty.
 */
export function CounterpartyLinkPanel({
  projectId,
  candidates,
  loadFailed,
}: {
  projectId: string;
  candidates: readonly LinkCandidate[];
  loadFailed: boolean;
}) {
  const t = useTranslations("journal.counterparty.link");
  const headingId = useId();
  return (
    <section
      className="card-border flex flex-col gap-3 p-5"
      aria-labelledby={headingId}
      data-testid="counterparty-link-panel"
    >
      <h2
        id={headingId}
        className="font-mono text-meta uppercase tracking-label text-text-muted"
      >
        {t("title")}
      </h2>
      <p className="text-xs leading-relaxed text-text-secondary">{t("lead")}</p>
      {loadFailed ? (
        <p
          role="alert"
          className="rounded-md border border-state-warning/40 bg-state-warning/10 p-3 text-sm text-text-secondary"
          data-testid="counterparty-link-load-failed"
        >
          {t("loadFailed")}
        </p>
      ) : candidates.length === 0 ? (
        <p
          className="rounded-md border border-dashed border-ink-500 px-3 py-2 text-xs leading-relaxed text-text-muted"
          data-testid="counterparty-link-empty"
        >
          {t("empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {candidates.map((c) => (
            <li key={c.workerId}>
              <CandidateRow projectId={projectId} candidate={c} />
            </li>
          ))}
        </ul>
      )}
      <p className="text-meta leading-relaxed text-text-muted">{t("honestNote")}</p>
    </section>
  );
}

function CandidateRow({
  projectId,
  candidate,
}: {
  projectId: string;
  candidate: LinkCandidate;
}) {
  const t = useTranslations("journal.counterparty.link");
  const locale = useLocale();
  const roleId = useId();
  const [regState, regAction, regPending] = useActionState<LinkActionState | null, FormData>(
    registerCounterpartyLink,
    null,
  );
  const [revState, revAction, revPending] = useActionState<LinkActionState | null, FormData>(
    revokeCounterpartyLink,
    null,
  );
  const [, startTransition] = useTransition();
  const onRevoke = () => {
    if (!candidate.linkId) return;
    const fd = new FormData();
    fd.set("link_id", candidate.linkId);
    fd.set("project_id", projectId);
    fd.set("locale", locale);
    startTransition(() => revAction(fd));
  };
  const name = candidate.displayName ?? t("unnamedWorker");
  const revokedNow = revState?.ok === true && revState.code === "revoked";
  const registeredNow =
    regState?.ok === true && (regState.code === "registered" || regState.code === "already_registered");
  const hasLink = candidate.linkId !== null && !revokedNow;

  const message = (() => {
    const s = revState ?? regState;
    if (!s) return null;
    return { ok: s.ok, text: t(`result.${s.code}` as never) };
  })();

  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-ink-600 p-3"
      data-testid={`counterparty-link-row-${candidate.workerId}`}
      data-linked={hasLink || registeredNow ? "true" : "false"}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words font-display text-sm font-semibold text-text-primary">{name}</p>
          <p className="text-meta text-text-muted">
            {candidate.kind === "team" ? t("kind.team") : t("kind.person")}
          </p>
        </div>
        {hasLink ? (
          <p
            className="rounded-full border border-state-success/40 bg-state-success/10 px-2.5 py-0.5 text-meta font-medium text-state-success"
            data-testid={`counterparty-link-active-${candidate.workerId}`}
          >
            {candidate.partyRole
              ? t("registeredAs", { role: t(`role.${candidate.partyRole}` as never) })
              : t("registered")}
            {candidate.establishedAt && formatUtcDate(candidate.establishedAt, locale)
              ? ` · ${formatUtcDate(candidate.establishedAt, locale)}`
              : ""}
          </p>
        ) : null}
      </div>

      {hasLink && candidate.linkId ? (
        <div className="flex flex-wrap items-center gap-2">
          <RevokeButton
            pending={revPending}
            workerId={candidate.workerId}
            onRevoke={onRevoke}
          />
        </div>
      ) : (
        <form action={regAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="worker_id" value={candidate.workerId} />
          <input type="hidden" name="locale" value={locale} />
          <div className="flex min-w-[10rem] flex-1 flex-col gap-1">
            <label htmlFor={roleId} className="text-meta text-text-muted">
              {t("roleLabel")}
            </label>
            <Select id={roleId} name="party_role" defaultValue="client" disabled={regPending}>
              {PARTY_ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`role.${r}` as never)}
                </option>
              ))}
            </Select>
          </div>
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            disabled={regPending}
            aria-busy={regPending || undefined}
            data-testid={`counterparty-link-register-${candidate.workerId}`}
          >
            {regPending ? t("registering") : t("register")}
          </Button>
        </form>
      )}

      {message ? (
        <p
          role={message.ok ? "status" : "alert"}
          className={`text-meta leading-relaxed ${message.ok ? "text-state-success" : "text-state-danger"}`}
          data-testid={`counterparty-link-message-${candidate.workerId}`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

/** Revoking is a consequential, hard-to-notice act (the party stops being able
 *  to decide the worker's submitted work) - confirmed inline first. */
function RevokeButton({
  pending,
  workerId,
  onRevoke,
}: {
  pending: boolean;
  workerId: string;
  onRevoke: () => void;
}) {
  const t = useTranslations("journal.counterparty.link");
  return (
    <InlineConfirm
      label={pending ? t("revoking") : t("revoke")}
      question={t("revokeQuestion")}
      confirmLabel={t("revokeConfirm")}
      cancelLabel={t("cancel")}
      tier="important_write"
      disabled={pending}
      onConfirm={onRevoke}
      className="inline-flex min-h-11 items-center rounded-md border border-ink-500 px-3 py-2 text-xs font-semibold text-text-primary transition-colors hover:border-state-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue disabled:opacity-50"
      testId={`counterparty-link-revoke-${workerId}`}
    />
  );
}
