"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { Link } from "@/lib/i18n/navigation";
import { useAuth } from "@/lib/auth/context";
import {
  createFollowUpTaskAction,
  type FollowUpActionResult,
} from "@/lib/followup/follow-up-actions";
import {
  buildIntakeFollowUpNote,
  type IntakeKind,
  type IntakeHelpRequestRow,
  type IntakeLeadRow,
  type IntakeRequestRow,
  type IntakeSection,
  type IntakeWaitlistRow,
  type LeadIntakeOverview,
} from "@/lib/sales/lead-intake-model";

/**
 * Read-only sales / lead-intake panel on the EXISTING admin control room
 * (§8.14, branch 23).
 *
 * - READ-ONLY: this panel never writes to leads / waitlist /
 *   customer_requests. Its ONLY action is recording an INTERNAL follow-up
 *   task through the EXISTING §8.13 follow-up create action (reused, not
 *   duplicated). Nothing here contacts anyone.
 * - PII boundary: lead/waitlist emails render ONLY here (the panel only
 *   renders on the requireSuperadmin-gated control room), and the
 *   follow-up note NEVER copies an email/name — only an id prefix and a
 *   non-PII reference (source or title).
 * - Stored status/intent/source values are shown verbatim in mono type —
 *   recorded data, not CRM claims. No fake "contacted" state is invented.
 * - Every unavailable source shows an honest "not readable yet" state —
 *   no zero-count pretending an unreadable table is empty.
 */
export function SalesIntakePanel({ data }: { data: LeadIntakeOverview }) {
  const router = useRouter();
  const t = useTranslations("salesIntake");
  // Outcome strings for the reused follow-up action come from the EXISTING
  // followUp namespace — one action, one message catalogue.
  const tFollowUp = useTranslations("followUp");
  // Defense-in-depth: the /dashboard/admin inspect link renders only for an
  // admin session (admin-visibility guard), although the panel itself only
  // appears on the requireSuperadmin-gated admin page.
  const { isAdmin } = useAuth();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function handleResult(res: FollowUpActionResult) {
    if (res.ok) {
      setMsg(t("followUpRecorded"));
    } else if (res.code === "needs_migration") {
      setMsg(tFollowUp("outcome.needsMigration"));
    } else if (res.code === "not_authorized") {
      setMsg(tFollowUp("outcome.notAuthorized"));
    } else if (res.code === "limit_reached") {
      setMsg(tFollowUp("outcome.limitReached"));
    } else if (res.code === "invalid") {
      setMsg(tFollowUp("outcome.invalid"));
    } else {
      setMsg(tFollowUp("outcome.error"));
    }
    router.refresh();
  }

  function addFollowUp(
    kind: IntakeKind,
    id: string,
    reference: string | null,
    subjectProfileId?: string,
  ) {
    setMsg(null);
    startTransition(async () => {
      const res = await createFollowUpTaskAction({
        note: buildIntakeFollowUpNote(kind, id, reference),
        subjectProfileId,
      });
      handleResult(res);
    });
  }

  function notReadable(section: { reason: string }, testId: string) {
    const key =
      section.reason === "service_key_missing"
        ? "state.serviceKeyMissing"
        : section.reason === "error"
          ? "state.error"
          : "state.needsAdminRead";
    return (
      <p
        className="rounded-md border border-dashed border-ink-500 p-3 text-xs text-text-muted"
        data-testid={testId}
      >
        {t(key)}
      </p>
    );
  }

  function emptyState(testId: string) {
    return (
      <p
        className="rounded-md border border-dashed border-ink-500 p-3 text-xs text-text-muted"
        data-testid={testId}
      >
        {t("state.empty")}
      </p>
    );
  }

  function heading(labelKey: string, section: IntakeSection<unknown>) {
    return (
      <span className="font-mono text-meta uppercase tracking-label text-text-muted">
        {t(labelKey)}
        {section.readable ? ` · ${section.rows.length}` : ""}
      </span>
    );
  }

  function mono(value: string | null) {
    return (
      <span className="font-mono text-meta uppercase tracking-label text-text-muted">
        {value && value.trim() ? value : "—"}
      </span>
    );
  }

  function followUpButton(
    kind: IntakeKind,
    id: string,
    reference: string | null,
    subjectProfileId?: string,
  ) {
    return (
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => addFollowUp(kind, id, reference, subjectProfileId)}
        data-testid={`intake-follow-up-${kind}-${id}`}
      >
        {t("actions.addFollowUp")}
      </Button>
    );
  }

  function leadRow(r: IntakeLeadRow) {
    return (
      <li key={r.id} className="card-border flex flex-col gap-2 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="break-all text-sm font-semibold text-text-primary">
              {r.email ?? "—"}
            </span>
            <span className="text-xs text-text-secondary">
              {[r.fullName, r.companyName, r.country]
                .filter((v) => v && v.trim())
                .join(" · ") || t("noDetails")}
            </span>
          </div>
          {mono(r.status)}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-text-muted">
          <span>
            {t("sourceLabel")}: {r.source ?? "—"}
          </span>
          <span>
            {t("intentLabel")}: {r.intent ?? "—"}
          </span>
          <span>
            {t("createdLabel")}: {r.createdAt.slice(0, 10)}
          </span>
        </div>
        <div>{followUpButton("lead", r.id, r.source)}</div>
      </li>
    );
  }

  function waitlistRow(r: IntakeWaitlistRow) {
    return (
      <li key={r.id} className="card-border flex flex-col gap-2 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <span className="break-all text-sm font-semibold text-text-primary">
            {r.email}
          </span>
          {mono(r.locale)}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-text-muted">
          <span>
            {t("sourceLabel")}: {r.source}
          </span>
          <span>
            {t("createdLabel")}: {r.createdAt.slice(0, 10)}
          </span>
        </div>
        <div>{followUpButton("waitlist", r.id, r.source)}</div>
      </li>
    );
  }

  function requestRow(r: IntakeRequestRow) {
    return (
      <li key={r.id} className="card-border flex flex-col gap-2 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <span className="min-w-0 text-sm font-semibold text-text-primary">
            {r.title}
          </span>
          {mono(r.status)}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-text-muted">
          <span>
            {t("roleLabel")}: {r.roleOrWorkType ?? "—"}
          </span>
          <span>{r.country ?? "—"}</span>
          <span>
            {t("createdLabel")}: {r.createdAt.slice(0, 10)}
          </span>
          {isAdmin && (
            <Link
              href={`/dashboard/admin/users/${r.profileId}`}
              className="font-mono text-meta text-brand-blue hover:underline"
            >
              {r.profileId.slice(0, 8)}… → {t("openSubject")}
            </Link>
          )}
        </div>
        <div>{followUpButton("request", r.id, r.title, r.profileId)}</div>
      </li>
    );
  }

  /** WAGON 10 — typed internal help request row: closed type label,
   *  author note (superadmin panel only), id-only subject pointer, and the
   *  reused follow-up action. Status is recorded data, not a CRM claim. */
  function helpRequestRow(r: IntakeHelpRequestRow) {
    return (
      <li key={r.id} className="card-border flex flex-col gap-2 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <span className="min-w-0 text-sm font-semibold text-text-primary">
            {t(`helpTypes.${r.helpType}` as never)}
          </span>
          {mono(r.status)}
        </div>
        {r.note ? (
          <p className="text-xs leading-relaxed text-text-secondary">
            {r.note}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-text-muted">
          <span>
            {t("createdLabel")}: {r.createdAt.slice(0, 10)}
          </span>
          {r.demandRequestId ? (
            <span className="font-mono text-meta uppercase tracking-label">
              {t("helpDemandRef")}: {r.demandRequestId.slice(0, 8)}…
            </span>
          ) : null}
          {isAdmin && (
            <Link
              href={`/dashboard/admin/users/${r.profileId}`}
              className="font-mono text-meta text-brand-blue hover:underline"
            >
              {r.profileId.slice(0, 8)}… → {t("openSubject")}
            </Link>
          )}
        </div>
        <div>
          {followUpButton("help_request", r.id, r.helpType, r.profileId)}
        </div>
      </li>
    );
  }

  return (
    <section className="flex flex-col gap-3" data-testid="admin-sales-intake">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("title")}
        </h2>
        <p className="text-xs text-text-secondary">{t("intro")}</p>
        <p className="text-meta text-text-muted">{t("honestNote")}</p>
        {/* Control room PR F — the same rows also appear in the consolidated
            demand pipeline read view (read-only; statuses stay here). */}
        <Link
          href={"/dashboard/admin/pipeline" as "/dashboard"}
          className="self-start text-xs text-brand-blue hover:underline"
          data-testid="intake-view-pipeline"
        >
          {t("viewPipeline")} →
        </Link>
      </div>

      {/* Demand requests in operator-review states — the live sales queue. */}
      <div className="flex flex-col gap-1.5">
        {heading("requestsHeading", data.requests)}
        {!data.requests.readable ? (
          notReadable(data.requests, "intake-requests-unreadable")
        ) : data.requests.rows.length === 0 ? (
          emptyState("intake-requests-empty")
        ) : (
          <ul className="flex flex-col gap-2" data-testid="intake-requests">
            {data.requests.rows.map(requestRow)}
          </ul>
        )}
      </div>

      {/* WAGON 10 — typed internal help requests (recruiter / accounting /
          legal / documents / demand filling). Real rows from the same
          intake table; a human reviews them — nothing is auto-assigned. */}
      <div className="flex flex-col gap-1.5">
        {heading("helpRequestsHeading", data.helpRequests)}
        {!data.helpRequests.readable ? (
          notReadable(data.helpRequests, "intake-help-requests-unreadable")
        ) : data.helpRequests.rows.length === 0 ? (
          emptyState("intake-help-requests-empty")
        ) : (
          <ul className="flex flex-col gap-2" data-testid="intake-help-requests">
            {data.helpRequests.rows.map(helpRequestRow)}
          </ul>
        )}
      </div>

      {/* Waitlist signups (landing). */}
      <div className="flex flex-col gap-1.5">
        {heading("waitlistHeading", data.waitlist)}
        {!data.waitlist.readable ? (
          notReadable(data.waitlist, "intake-waitlist-unreadable")
        ) : data.waitlist.rows.length === 0 ? (
          emptyState("intake-waitlist-empty")
        ) : (
          <ul className="flex flex-col gap-2" data-testid="intake-waitlist">
            {data.waitlist.rows.map(waitlistRow)}
          </ul>
        )}
      </div>

      {/* Leads from the dormant anonymous funnel. */}
      <div className="flex flex-col gap-1.5">
        {heading("leadsHeading", data.leads)}
        {!data.leads.readable ? (
          notReadable(data.leads, "intake-leads-unreadable")
        ) : data.leads.rows.length === 0 ? (
          emptyState("intake-leads-empty")
        ) : (
          <ul className="flex flex-col gap-2" data-testid="intake-leads">
            {data.leads.rows.map(leadRow)}
          </ul>
        )}
      </div>

      {msg && (
        <p className="text-xs text-text-secondary" data-testid="intake-msg">
          {msg}
        </p>
      )}
    </section>
  );
}
