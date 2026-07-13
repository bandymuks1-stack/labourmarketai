"use client";

import { useActionState } from "react";
import { Briefcase, Trash2 } from "lucide-react";

import {
  demandStatusTone,
  groupDemandsByClient,
  type AgencyClientsState,
  type AgencyDemandRow,
  type AgencyDemandsState,
} from "@/lib/agency/clients-model";
import {
  linkDemandToClientAction,
  removeAgencyClientAction,
  saveAgencyClientAction,
  type AgencyClientActionState,
} from "@/lib/agency/clients-actions";

/**
 * "Klientai" — staffing-agency client panel (canonical journey P5).
 *
 * Renders ONLY inside the staffing_agency block of the canonical company
 * workspace. A client is a private CRM record; its demands are the agency's
 * OWN rows on the canonical customer_requests table, each linking into the
 * existing scouting/lifecycle surface (link only — candidates, statuses and
 * communication stay on the canonical path). Until the owner applies the
 * gated migration this panel shows an honest "prepared" state and the
 * demands render as not-yet-linkable — nothing is faked.
 */
export interface AgencyClientsLabels {
  readonly title: string;
  readonly subtitle: string;
  readonly gatedHeading: string;
  readonly gatedBody: string;
  readonly notLinkable: string;
  readonly clientsEmpty: string;
  readonly demandsHeading: string;
  readonly demandsEmpty: string;
  readonly demandsEmptyCta: string;
  readonly unassignedHeading: string;
  readonly noLinkedDemands: string;
  readonly openScouting: string;
  readonly addHeading: string;
  readonly nameLabel: string;
  readonly contactNameLabel: string;
  readonly contactEmailLabel: string;
  readonly noteLabel: string;
  readonly addButton: string;
  readonly removeButton: string;
  readonly assignLabel: string;
  readonly assignNone: string;
  readonly assignButton: string;
  readonly errorLabel: string;
  readonly statuses: Record<string, string>;
}

const IDLE: AgencyClientActionState = { status: "idle" };

const TONE_CLASS: Record<ReturnType<typeof demandStatusTone>, string> = {
  muted: "border-ink-500 text-text-muted",
  info: "border-brand-blue/50 text-brand-blue",
  warning: "border-state-warning/50 text-state-warning",
  success: "border-state-success/50 text-state-success",
};

function StatusChip({
  status,
  labels,
}: {
  status: string;
  labels: AgencyClientsLabels;
}) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-label ${TONE_CLASS[demandStatusTone(status)]}`}
      data-testid="agency-client-demand-status"
    >
      {labels.statuses[status] ?? status}
    </span>
  );
}

function DemandRow({
  demand,
  locale,
  labels,
  children,
}: {
  demand: AgencyDemandRow;
  locale: string;
  labels: AgencyClientsLabels;
  children?: React.ReactNode;
}) {
  return (
    <li
      className="flex flex-wrap items-center gap-2 rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2"
      data-testid="agency-client-demand-row"
    >
      <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
        {demand.title}
      </span>
      <StatusChip status={demand.status} labels={labels} />
      {/* Link ONLY — candidates/status/communication live on the canonical
          scouting + lifecycle surface for this demand. */}
      <a
        href={`/${locale}/dashboard/company/scouting?request=${demand.id}`}
        className="shrink-0 text-xs font-semibold text-brand-blue hover:underline"
        data-testid="agency-client-demand-scouting-link"
      >
        {labels.openScouting} →
      </a>
      {children}
    </li>
  );
}

export function AgencyClientsSection({
  clients,
  demands,
  locale,
  labels,
}: {
  clients: AgencyClientsState;
  demands: AgencyDemandsState;
  locale: string;
  labels: AgencyClientsLabels;
}) {
  const [saveState, saveAction, savePending] = useActionState(
    saveAgencyClientAction,
    IDLE,
  );
  const [, removeAction] = useActionState(removeAgencyClientAction, IDLE);
  const [linkState, linkAction, linkPending] = useActionState(
    linkDemandToClientAction,
    IDLE,
  );

  const gated =
    clients.kind === "needs-migration" ||
    saveState.status === "needs-migration" ||
    linkState.status === "needs-migration";
  const demandRows = demands.kind === "ok" ? demands.rows : [];
  const clientRows = clients.kind === "ok" ? clients.rows : [];
  const { byClient, unassigned } = groupDemandsByClient(clientRows, demandRows);

  return (
    <section
      className="card-border flex flex-col gap-4 p-5"
      data-testid="agency-clients-section"
    >
      <header className="flex flex-col gap-1">
        <h2 className="inline-flex items-center gap-2 font-display text-lg font-semibold text-text-primary">
          <Briefcase className="h-4 w-4 text-brand-blue" aria-hidden />
          {labels.title}
        </h2>
        <p className="text-sm text-text-secondary">{labels.subtitle}</p>
      </header>

      {gated ? (
        <div
          className="rounded-md border border-state-warning bg-state-warning/10 p-3"
          data-testid="agency-clients-gated"
        >
          <p className="font-mono text-[10px] uppercase tracking-label text-state-warning">
            {labels.gatedHeading}
          </p>
          <p className="mt-1 text-xs text-text-secondary">{labels.gatedBody}</p>
        </div>
      ) : clients.kind === "error" || demands.kind === "error" ? (
        <p className="text-xs text-state-danger" role="alert">
          {labels.errorLabel}
        </p>
      ) : (
        <>
          {clientRows.length === 0 ? (
            <p
              className="rounded-md border border-dashed border-ink-500 px-3 py-3 text-xs leading-relaxed text-text-muted"
              data-testid="agency-clients-empty"
            >
              {labels.clientsEmpty}
            </p>
          ) : (
            <ul className="flex flex-col gap-3" data-testid="agency-clients-list">
              {clientRows.map((client) => {
                const linked = byClient.get(client.id) ?? [];
                return (
                  <li
                    key={client.id}
                    className="card-border flex flex-col gap-2 p-3"
                    data-testid="agency-client-row"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-semibold text-text-primary">
                          {client.name}
                        </span>
                        {(client.contactName || client.contactEmail) && (
                          <span className="truncate text-xs text-text-secondary">
                            {[client.contactName, client.contactEmail]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        )}
                        {client.note && (
                          <span className="truncate text-xs text-text-muted">
                            {client.note}
                          </span>
                        )}
                      </div>
                      <form action={removeAction}>
                        <input type="hidden" name="id" value={client.id} />
                        <button
                          type="submit"
                          aria-label={labels.removeButton}
                          title={labels.removeButton}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-ink-500 text-text-muted transition-colors hover:border-state-danger hover:text-state-danger"
                          data-testid={`agency-client-remove-${client.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </form>
                    </div>
                    {linked.length === 0 ? (
                      <p className="text-xs text-text-muted">
                        {labels.noLinkedDemands}
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-1.5">
                        {linked.map((d) => (
                          <DemandRow
                            key={d.id}
                            demand={d}
                            locale={locale}
                            labels={labels}
                          />
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* Unassigned demands: real rows from the canonical demand table.
              Next action per row: assign to a client (or open scouting). */}
          {unassigned.length > 0 && (
            <div className="flex flex-col gap-2" data-testid="agency-clients-unassigned">
              <h3 className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                {clientRows.length > 0
                  ? labels.unassignedHeading
                  : labels.demandsHeading}
              </h3>
              <ul className="flex flex-col gap-1.5">
                {unassigned.map((d) => (
                  <DemandRow key={d.id} demand={d} locale={locale} labels={labels}>
                    {clientRows.length > 0 && (
                      <form
                        action={linkAction}
                        className="flex shrink-0 items-center gap-1.5"
                        data-testid="agency-client-link-form"
                      >
                        <input type="hidden" name="requestId" value={d.id} />
                        <label className="sr-only" htmlFor={`assign-${d.id}`}>
                          {labels.assignLabel}
                        </label>
                        <select
                          id={`assign-${d.id}`}
                          name="clientId"
                          defaultValue=""
                          className="rounded-md border border-ink-500 bg-ink-700 px-2 py-1 text-xs text-text-primary outline-none focus:border-brand-blue"
                        >
                          <option value="">{labels.assignNone}</option>
                          {clientRows.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          disabled={linkPending}
                          className="rounded-md border border-brand-blue/50 px-2 py-1 text-xs font-semibold text-brand-blue transition-colors hover:border-brand-blue disabled:opacity-60"
                        >
                          {labels.assignButton}
                        </button>
                      </form>
                    )}
                  </DemandRow>
                ))}
              </ul>
            </div>
          )}

          {demandRows.length === 0 && (
            <p
              className="rounded-md border border-dashed border-ink-500 px-3 py-3 text-xs leading-relaxed text-text-muted"
              data-testid="agency-clients-demands-empty"
            >
              {labels.demandsEmpty}{" "}
              <a
                href={`/${locale}/dashboard#demand-intake`}
                className="font-semibold text-brand-blue hover:underline"
              >
                {labels.demandsEmptyCta} →
              </a>
            </p>
          )}

          {/* ONE clear next action for the section: add a client. */}
          <form
            action={saveAction}
            className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/40 p-3"
            data-testid="agency-client-add-form"
          >
            <h3 className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {labels.addHeading}
            </h3>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
              <label className="flex min-w-40 flex-1 flex-col gap-1">
                <span className="text-xs font-medium text-text-secondary">
                  {labels.nameLabel}
                </span>
                <input
                  type="text"
                  name="name"
                  required
                  minLength={2}
                  maxLength={160}
                  className="rounded-lg border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue"
                />
              </label>
              <label className="flex min-w-36 flex-1 flex-col gap-1">
                <span className="text-xs font-medium text-text-secondary">
                  {labels.contactNameLabel}
                </span>
                <input
                  type="text"
                  name="contactName"
                  maxLength={120}
                  className="rounded-lg border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue"
                />
              </label>
              <label className="flex min-w-36 flex-1 flex-col gap-1">
                <span className="text-xs font-medium text-text-secondary">
                  {labels.contactEmailLabel}
                </span>
                <input
                  type="email"
                  name="contactEmail"
                  maxLength={200}
                  className="rounded-lg border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue"
                />
              </label>
              <label className="flex min-w-40 flex-1 flex-col gap-1">
                <span className="text-xs font-medium text-text-secondary">
                  {labels.noteLabel}
                </span>
                <input
                  type="text"
                  name="note"
                  maxLength={500}
                  className="rounded-lg border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue"
                />
              </label>
              <button
                type="submit"
                disabled={savePending}
                data-testid="agency-client-add-submit"
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-brand-blue/50 bg-brand-blue/10 px-4 text-sm font-semibold text-brand-blue transition-colors hover:border-brand-blue disabled:opacity-60"
              >
                {labels.addButton}
              </button>
            </div>
          </form>
          {(saveState.status === "error" ||
            saveState.status === "invalid" ||
            linkState.status === "error" ||
            linkState.status === "invalid") && (
            <p className="text-xs text-state-danger" role="alert">
              {labels.errorLabel}
            </p>
          )}
        </>
      )}

      {/* Gated mode still shows the REAL demand list (works today) so the
          agency path is usable — rows are honestly "not yet linkable". */}
      {gated && (
        <div className="flex flex-col gap-2" data-testid="agency-clients-gated-demands">
          <h3 className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {labels.demandsHeading}
          </h3>
          <p className="text-xs text-text-muted">{labels.notLinkable}</p>
          {demandRows.length === 0 ? (
            <p
              className="rounded-md border border-dashed border-ink-500 px-3 py-3 text-xs leading-relaxed text-text-muted"
              data-testid="agency-clients-demands-empty"
            >
              {labels.demandsEmpty}{" "}
              <a
                href={`/${locale}/dashboard#demand-intake`}
                className="font-semibold text-brand-blue hover:underline"
              >
                {labels.demandsEmptyCta} →
              </a>
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {demandRows.map((d) => (
                <DemandRow key={d.id} demand={d} locale={locale} labels={labels} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
