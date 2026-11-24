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
import { FoldedRows } from "@/components/app/folded-rows";
import { StatusChip, type StatusChipVariant } from "@/components/app/status-chip";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

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
  /** "Show all ({count})" with `{count}` left for the list to fill. */
  readonly showAll: string;
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

/** Demand status tone -> the one StatusChip pattern (word + shape). */
const TONE_VARIANT: Record<ReturnType<typeof demandStatusTone>, StatusChipVariant> = {
  muted: "neutral",
  info: "waiting",
  warning: "attention",
  success: "success",
};

function DemandStatusChip({
  status,
  labels,
}: {
  status: string;
  labels: AgencyClientsLabels;
}) {
  return (
    <StatusChip variant={TONE_VARIANT[demandStatusTone(status)]} testid="agency-client-demand-status" className="shrink-0">
      {labels.statuses[status] ?? status}
    </StatusChip>
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
      <DemandStatusChip status={demand.status} labels={labels} />
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
  const showAll = (count: number) => labels.showAll.replace("{count}", String(count));
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
          <p className="font-mono text-meta uppercase tracking-label text-state-warning">
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
                        <Button
                          type="submit"
                          aria-label={labels.removeButton}
                          title={labels.removeButton} variant="secondary" size="sm" className="min-h-11 min-w-11 text-text-muted hover:border-state-danger hover:text-state-danger"
                          data-testid={`agency-client-remove-${client.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </Button>
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
              <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">
                {clientRows.length > 0
                  ? labels.unassignedHeading
                  : labels.demandsHeading}
              </h3>
              <FoldedRows
                rows={unassigned}
                showAll={showAll}
                testId="agency-clients-unassigned-rest"
                listClassName="flex flex-col gap-1.5"
                render={(d) => (
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
                        <Select
                          id={`assign-${d.id}`}
                          name="clientId"
                          defaultValue=""
                          className="min-w-0 sm:w-auto sm:max-w-xs"
                        >
                          <option value="">{labels.assignNone}</option>
                          {clientRows.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </Select>
                        <Button
                          type="submit"
                          disabled={linkPending} variant="secondary" size="sm" className="min-h-11"
                        >
                          {labels.assignButton}
                        </Button>
                      </form>
                    )}
                  </DemandRow>
                )}
              />
            </div>
          )}

          {demandRows.length === 0 && (
            <p
              className="rounded-md border border-dashed border-ink-500 px-3 py-3 text-xs leading-relaxed text-text-muted"
              data-testid="agency-clients-demands-empty"
            >
              {labels.demandsEmpty}{" "}
              <a
                href={`/${locale}/dashboard/company/needs?audience=need#demand-intake`}
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
            <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">
              {labels.addHeading}
            </h3>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
              <label className="flex min-w-40 flex-1 flex-col gap-1">
                <span className="text-xs font-medium text-text-secondary">
                  {labels.nameLabel}
                </span>
                <Input
                  type="text"
                  name="name"
                  required
                  minLength={2}
                  maxLength={160}
                />
              </label>
              <label className="flex min-w-36 flex-1 flex-col gap-1">
                <span className="text-xs font-medium text-text-secondary">
                  {labels.contactNameLabel}
                </span>
                <Input
                  type="text"
                  name="contactName"
                  maxLength={120}
                />
              </label>
              <label className="flex min-w-36 flex-1 flex-col gap-1">
                <span className="text-xs font-medium text-text-secondary">
                  {labels.contactEmailLabel}
                </span>
                <Input
                  type="email"
                  name="contactEmail"
                  maxLength={200}
                />
              </label>
              <label className="flex min-w-40 flex-1 flex-col gap-1">
                <span className="text-xs font-medium text-text-secondary">
                  {labels.noteLabel}
                </span>
                <Input
                  type="text"
                  name="note"
                  maxLength={500}
                />
              </label>
              <Button
                type="submit"
                disabled={savePending}
                data-testid="agency-client-add-submit" variant="primary" size="sm" className="min-h-11"
              >
                {labels.addButton}
              </Button>
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
          <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">
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
                href={`/${locale}/dashboard/company/needs?audience=need#demand-intake`}
                className="font-semibold text-brand-blue hover:underline"
              >
                {labels.demandsEmptyCta} →
              </a>
            </p>
          ) : (
            <FoldedRows
              rows={demandRows}
              showAll={showAll}
              testId="agency-clients-demands-rest"
              listClassName="flex flex-col gap-1.5"
              render={(d) => <DemandRow key={d.id} demand={d} locale={locale} labels={labels} />}
            />
          )}
        </div>
      )}
    </section>
  );
}
