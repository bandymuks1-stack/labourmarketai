import { getTranslations } from "next-intl/server";

import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import { listOrganizationMembers } from "@/lib/company/memberships";
import {
  getAgreementRegister,
  listAgreementApprovalDefinitions,
} from "@/lib/agreements/agreements";
import {
  AGREEMENT_STATUSES,
  AGREEMENT_TYPES,
  applyAgreementFilters,
  daysUntilExpiry,
  isExpiringSoon,
  manualStatusTargetsFor,
  parseAgreementFilters,
  type AgreementAmendmentRow,
  type AgreementRow,
} from "@/lib/agreements/agreements-model";
import {
  addAgreementAmendmentAction,
  attachAgreementDocumentAction,
  attachAgreementSignatureEvidenceAction,
  createAgreementAction,
  setAgreementStatusAction,
  submitAgreementForApprovalAction,
  updateAgreementAction,
} from "@/lib/agreements/agreements-actions";
import { getOrgDocumentRegister } from "@/lib/documents/document-files";

/**
 * Agreement register (Agreement & Rights Engine v1) — the organization's
 * canonical register for employment-related AND general agreements, on the
 * EXISTING commercial page (no new route; the legacy B2B `contracts`
 * register above it keeps working untouched).
 *
 * LEGAL DOCTRINE: every status shown here is honest record-keeping state.
 * Nothing implies signed/legal/valid/binding; signature evidence is a
 * separate, explicitly-labeled attachment and the copy states that any
 * signature happened OUTSIDE the platform.
 *
 * Authority: the acting organization comes from the server-resolved
 * employer context (never the client); every write is a gated SECURITY
 * DEFINER RPC that re-checks owner/admin membership.
 *
 * Honest absence: while the human-gated migration is unapplied the read
 * answers needs-migration and the section says the register is prepared
 * but not enabled in this environment — nothing pretends.
 */

const KNOWN_NOTICES = new Set<string>([
  "created",
  "updated",
  "submitted",
  "amended",
  "attached",
  "evidence_attached",
  "repaired",
  "no_pending_workflow",
  "no_approval_definition",
  "invalid",
  "invalid_transition",
  "invalid_state",
  "not_editable",
  "not_found",
  "not_allowed",
  "limit_reached",
  "needs_migration",
  "error",
]);

const STATUS_TONE: Record<string, string> = {
  draft: "border-ink-500 bg-ink-800/40 text-text-muted",
  submitted_for_approval: "border-brand-blue/40 bg-brand-blue/5 text-brand-blue",
  approved_internally: "border-brand-blue/40 bg-brand-blue/5 text-brand-blue",
  active_record: "border-state-success/40 bg-state-success/5 text-state-success",
  amended: "border-state-success/40 bg-state-success/5 text-state-success",
  terminated_record: "border-ink-500 bg-ink-800/40 text-text-muted",
  expired: "border-state-warning/60 bg-state-warning/10 text-state-warning",
};

export async function AgreementsRegister({
  locale,
  searchParams,
}: {
  locale: string;
  searchParams: {
    readonly agr?: string;
    readonly agrType?: string;
    readonly agrStatus?: string;
    readonly agrSearch?: string;
    readonly agrExpiring?: string;
  };
}) {
  const t = await getTranslations("agreements");
  const ctx = await resolveEmployerCompanyContext();

  if (ctx.kind !== "ok") {
    return (
      <section
        id="agreements"
        className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/30 p-4"
        data-testid="agreements-register-unavailable"
      >
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("title")}
        </h2>
        <p className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted">
          {ctx.reason === "needs-migration" || ctx.reason === "error"
            ? t("unavailable")
            : t("needsOrgWorkspace")}
        </p>
      </section>
    );
  }

  const register = await getAgreementRegister(ctx.organizationId);
  const canManage = ctx.role === "owner" || ctx.role === "admin";
  const filters = parseAgreementFilters(searchParams);
  const notice = (searchParams.agr ?? "").trim();
  const now = new Date();

  const [definitions, docRegister, members] = canManage
    ? await Promise.all([
        listAgreementApprovalDefinitions(ctx.organizationId),
        getOrgDocumentRegister(ctx.organizationId),
        listOrganizationMembers(ctx.organizationId),
      ])
    : [[], null, null];
  const activeMembers =
    members?.kind === "ok"
      ? members.members.filter((m) => m.status === "active")
      : [];
  const docOptions =
    docRegister && docRegister.kind === "ok"
      ? docRegister.entries.map((e) => ({
          id: e.document.id,
          title: e.document.title,
          fileId: e.currentFile?.id ?? null,
          fileName: e.currentFile?.originalFilename ?? null,
        }))
      : [];

  return (
    <section
      id="agreements"
      className="flex flex-col gap-3 rounded-md border border-ink-600 bg-ink-800/30 p-4"
      data-testid="agreements-register"
    >
      <h2 className="font-display text-lg font-semibold text-text-primary">
        {t("title")}
      </h2>
      <p className="text-xs text-text-secondary">
        {t("intro", { org: ctx.organizationName })}
      </p>
      {/* The honest legal boundary, always visible. */}
      <p
        className="rounded-md border border-ink-500 bg-ink-800/40 px-3 py-2 text-meta leading-relaxed text-text-muted"
        data-testid="agreements-no-signature-note"
      >
        {t("noSignatureNote")}
      </p>
      <p className="text-meta text-text-muted">{t("relationshipNote")}</p>

      {notice.length > 0 ? (
        <p
          role="status"
          className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-sm text-text-secondary"
          data-testid="agreements-notice"
        >
          {KNOWN_NOTICES.has(notice)
            ? t(`notice.${notice}` as never)
            : t("notice.error")}
        </p>
      ) : null}

      {register.kind === "needs-migration" ? (
        <p
          className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-sm text-text-secondary"
          data-testid="agreements-preparing"
        >
          {t("preparing")}
        </p>
      ) : register.kind === "error" || register.kind === "not-authed" ? (
        <p className="rounded-md border border-state-warning bg-state-warning/10 px-3 py-2 text-xs text-state-warning">
          {t("error")}
        </p>
      ) : (
        <>
          {/* Filters — native GET form, applied on the RLS-scoped read. */}
          <form
            method="get"
            className="flex flex-wrap items-end gap-2"
            data-testid="agreements-filters"
          >
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              {t("filters.type")}
              <select
                name="agrType"
                defaultValue={filters.type ?? ""}
                className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
              >
                <option value="">{t("filters.all")}</option>
                {AGREEMENT_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {t(`types.${v}` as never)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              {t("filters.status")}
              <select
                name="agrStatus"
                defaultValue={filters.status ?? ""}
                className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
              >
                <option value="">{t("filters.all")}</option>
                {AGREEMENT_STATUSES.map((v) => (
                  <option key={v} value={v}>
                    {t(`status.${v}` as never)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              {t("filters.search")}
              <input
                type="text"
                name="agrSearch"
                defaultValue={filters.search}
                maxLength={100}
                placeholder={t("filters.searchPlaceholder")}
                className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
              />
            </label>
            <label className="flex items-center gap-1.5 pb-2 text-xs text-text-secondary">
              <input
                type="checkbox"
                name="agrExpiring"
                value="1"
                defaultChecked={filters.expiring}
              />
              {t("filters.expiringOnly")}
            </label>
            <button
              type="submit"
              className="rounded-md border border-ink-500 px-3 py-1.5 font-mono text-meta uppercase tracking-label text-text-secondary transition-colors hover:border-brand-blue hover:text-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
              data-testid="agreements-filter-apply"
            >
              {t("filters.apply")}
            </button>
          </form>

          {(() => {
            const visible = applyAgreementFilters(
              register.agreements,
              filters,
              now,
            );
            if (visible.length === 0) {
              return (
                <p
                  className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted"
                  data-testid="agreements-empty"
                >
                  {register.agreements.length === 0
                    ? t("empty")
                    : t("emptyFiltered")}
                </p>
              );
            }
            return (
              <ul className="flex flex-col gap-2" data-testid="agreements-list">
                {visible.map((row) => (
                  <AgreementRowItem
                    key={row.id}
                    locale={locale}
                    row={row}
                    amendments={register.amendments.get(row.id) ?? []}
                    documentTitles={register.documentTitles}
                    canManage={canManage}
                    definitions={definitions}
                    docOptions={docOptions}
                    members={activeMembers.map((m) => ({
                      profileId: m.profileId,
                      label: m.fullName || m.email || m.profileId.slice(0, 8),
                    }))}
                    now={now}
                    t={t}
                  />
                ))}
              </ul>
            );
          })()}

          {canManage ? (
            <details
              className="rounded-md border border-ink-500 bg-ink-800/40 p-3"
              data-testid="agreements-create"
            >
              <summary className="cursor-pointer font-mono text-meta uppercase tracking-label text-brand-blue">
                {t("create.title")}
              </summary>
              <form
                action={createAgreementAction}
                className="mt-3 flex flex-col gap-2"
              >
                <input type="hidden" name="locale" value={locale} />
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs text-text-secondary">
                    {t("create.typeLabel")}
                    <select
                      name="agreementType"
                      required
                      className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
                    >
                      {AGREEMENT_TYPES.map((v) => (
                        <option key={v} value={v}>
                          {t(`types.${v}` as never)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-text-secondary">
                    {t("create.titleLabel")}
                    <input
                      type="text"
                      name="title"
                      required
                      minLength={3}
                      maxLength={200}
                      className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-text-secondary">
                    {t("create.counterpartyLabel")}
                    <input
                      type="text"
                      name="counterpartyName"
                      required
                      maxLength={200}
                      className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-text-secondary">
                    {t("create.orgNumberLabel")}
                    <input
                      type="text"
                      name="counterpartyOrgNumber"
                      maxLength={60}
                      className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-text-secondary">
                    {t("create.responsibleLabel")}
                    <select
                      name="responsibleProfileId"
                      className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
                    >
                      <option value="">{t("create.responsibleNone")}</option>
                      {activeMembers.map((m) => (
                        <option key={m.profileId} value={m.profileId}>
                          {m.fullName || m.email || m.profileId.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-text-secondary">
                    {t("create.externalRefLabel")}
                    <input
                      type="text"
                      name="externalRef"
                      maxLength={200}
                      className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-text-secondary">
                    {t("create.effectiveFromLabel")}
                    <input
                      type="date"
                      name="effectiveFrom"
                      className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-text-secondary">
                    {t("create.effectiveToLabel")}
                    <input
                      type="date"
                      name="effectiveTo"
                      className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
                    />
                  </label>
                </div>
                <p className="text-meta text-text-muted">
                  {t("create.workerLinkNote")}
                </p>
                <button
                  type="submit"
                  className="self-start rounded-md border border-brand-blue/50 px-3 py-1.5 font-mono text-meta uppercase tracking-label text-brand-blue transition-colors hover:bg-brand-blue/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                  data-testid="agreements-create-submit"
                >
                  {t("create.submit")}
                </button>
              </form>
            </details>
          ) : null}
        </>
      )}
      <p className="text-meta text-text-muted">{t("scopeNote")}</p>
    </section>
  );
}

function AgreementRowItem({
  locale,
  row,
  amendments,
  documentTitles,
  canManage,
  definitions,
  docOptions,
  members,
  now,
  t,
}: {
  locale: string;
  row: AgreementRow;
  amendments: readonly AgreementAmendmentRow[];
  documentTitles: ReadonlyMap<string, string>;
  canManage: boolean;
  definitions: readonly { id: string; name: string }[];
  docOptions: readonly {
    id: string;
    title: string;
    fileId: string | null;
    fileName: string | null;
  }[];
  members: readonly { profileId: string; label: string }[];
  now: Date;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const expiring = isExpiringSoon(row, now);
  const days = daysUntilExpiry(row.effectiveTo, now);
  const manualTargets = manualStatusTargetsFor(row.status);
  const terminal =
    row.status === "terminated_record" || row.status === "expired";
  const canAttachDoc =
    !terminal &&
    (row.currentDocumentId === null ||
      row.status === "draft" ||
      row.status === "submitted_for_approval" ||
      row.status === "approved_internally");
  const canAmend =
    row.status === "approved_internally" ||
    row.status === "active_record" ||
    row.status === "amended";
  const fileOptions = docOptions.filter((d) => d.fileId !== null);

  return (
    <li
      className="flex flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/40 p-3"
      data-testid="agreement-row"
      data-status={row.status}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-semibold text-text-primary">
            {row.title}
          </span>
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">
            {t(`types.${row.agreementType}` as never)}
            {" · "}
            {row.counterpartyName}
            {row.counterpartyOrgNumber ? ` (${row.counterpartyOrgNumber})` : ""}
            {row.externalRef ? ` · ${row.externalRef}` : ""}
          </span>
          {row.effectiveFrom || row.effectiveTo ? (
            <span className="font-mono text-meta text-text-muted">
              {row.effectiveFrom ?? "…"} → {row.effectiveTo ?? "…"}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {expiring ? (
            <span
              className="rounded-sm border border-state-warning/60 bg-state-warning/10 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-state-warning"
              data-testid="agreement-expiring"
            >
              {days !== null && days < 0
                ? t("expiry.ended")
                : t("expiry.endsInDays", { days: days ?? 0 })}
            </span>
          ) : null}
          <span
            className={`rounded-sm border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${STATUS_TONE[row.status] ?? STATUS_TONE.draft}`}
          >
            {t(`status.${row.status}` as never)}
          </span>
        </div>
      </div>

      {/* Signature evidence — separate, explicit, never a legal claim. */}
      <p
        className="font-mono text-meta text-text-muted"
        data-testid="agreement-signature-status"
      >
        {row.signatureStatus === "externally_signed_evidence_attached"
          ? t("signature.evidenceAttached")
          : t("signature.none")}
      </p>

      {row.currentDocumentId ? (
        <p className="font-mono text-meta text-text-muted">
          {t("baseDocument")}:{" "}
          {documentTitles.get(row.currentDocumentId) ?? row.currentDocumentId.slice(0, 8)}
        </p>
      ) : null}

      {/* Amendment timeline: current terms = base + ordered amendments. */}
      {amendments.length > 0 ? (
        <ol
          className="flex flex-col gap-1 border-l border-ink-500 pl-3"
          data-testid="agreement-amendments"
        >
          {amendments.map((am) => (
            <li key={am.id} className="text-xs text-text-secondary">
              <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                {t("amendment.label", { n: am.sequence })}
              </span>{" "}
              {am.title}
              {am.effectiveDate ? ` · ${am.effectiveDate}` : ""}
              {am.documentId
                ? ` · ${documentTitles.get(am.documentId) ?? am.documentId.slice(0, 8)}`
                : ""}
              {am.description ? (
                <span className="block text-meta text-text-muted">
                  {am.description}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}

      {canManage ? (
        <div className="flex flex-col gap-2 border-t border-ink-600 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            {manualTargets.map((target) => (
              <form key={target} action={setAgreementStatusAction}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="agreementId" value={row.id} />
                <input type="hidden" name="status" value={target} />
                <button
                  type="submit"
                  className="rounded-md border border-ink-500 px-3 py-1.5 font-mono text-meta uppercase tracking-label text-text-secondary transition-colors hover:border-brand-blue hover:text-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                  data-testid={`agreement-set-${target}`}
                >
                  {t(`actions.${target}` as never)}
                </button>
              </form>
            ))}

            {row.status === "draft" ? (
              definitions.length > 0 ? (
                <form
                  action={submitAgreementForApprovalAction}
                  className="flex flex-wrap items-center gap-2"
                  data-testid="agreement-submit-form"
                >
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="agreementId" value={row.id} />
                  <label className="flex items-center gap-1 text-meta text-text-secondary">
                    {t("submitApproval.definitionLabel")}
                    <select
                      name="definitionId"
                      required
                      className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1 text-meta text-text-primary"
                    >
                      {definitions.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    className="rounded-md border border-brand-blue/50 px-3 py-1.5 font-mono text-meta uppercase tracking-label text-brand-blue transition-colors hover:bg-brand-blue/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                    data-testid="agreement-submit-approval"
                  >
                    {t("submitApproval.submit")}
                  </button>
                </form>
              ) : (
                <span
                  className="text-meta text-text-muted"
                  data-testid="agreement-no-definition"
                >
                  {t("submitApproval.noDefinition")}
                </span>
              )
            ) : null}
            {row.status === "submitted_for_approval" ? (
              <span className="text-meta text-text-muted">
                {t("submitApproval.pendingNote")}
              </span>
            ) : null}
          </div>

          {!terminal ? (
            <details className="rounded-md border border-ink-500 bg-ink-800/30 p-2">
              <summary className="cursor-pointer font-mono text-meta uppercase tracking-label text-text-secondary">
                {t("edit.title")}
              </summary>
              <form
                action={updateAgreementAction}
                className="mt-2 grid gap-2 sm:grid-cols-2"
              >
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="agreementId" value={row.id} />
                <label className="flex flex-col gap-1 text-xs text-text-secondary">
                  {t("create.titleLabel")}
                  <input
                    type="text"
                    name="title"
                    required
                    minLength={3}
                    maxLength={200}
                    defaultValue={row.title}
                    className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-text-secondary">
                  {t("create.counterpartyLabel")}
                  <input
                    type="text"
                    name="counterpartyName"
                    required
                    maxLength={200}
                    defaultValue={row.counterpartyName}
                    className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-text-secondary">
                  {t("create.orgNumberLabel")}
                  <input
                    type="text"
                    name="counterpartyOrgNumber"
                    maxLength={60}
                    defaultValue={row.counterpartyOrgNumber ?? ""}
                    className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-text-secondary">
                  {t("create.responsibleLabel")}
                  <select
                    name="responsibleProfileId"
                    defaultValue={row.responsibleProfileId ?? ""}
                    className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
                  >
                    <option value="">{t("create.responsibleNone")}</option>
                    {members.map((m) => (
                      <option key={m.profileId} value={m.profileId}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-text-secondary">
                  {t("create.effectiveFromLabel")}
                  <input
                    type="date"
                    name="effectiveFrom"
                    defaultValue={row.effectiveFrom ?? ""}
                    className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-text-secondary">
                  {t("create.effectiveToLabel")}
                  <input
                    type="date"
                    name="effectiveTo"
                    defaultValue={row.effectiveTo ?? ""}
                    className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-text-secondary">
                  {t("create.externalRefLabel")}
                  <input
                    type="text"
                    name="externalRef"
                    maxLength={200}
                    defaultValue={row.externalRef ?? ""}
                    className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
                  />
                </label>
                <button
                  type="submit"
                  className="self-end justify-self-start rounded-md border border-brand-blue/50 px-3 py-1.5 font-mono text-meta uppercase tracking-label text-brand-blue transition-colors hover:bg-brand-blue/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                  data-testid="agreement-edit-submit"
                >
                  {t("edit.submit")}
                </button>
              </form>
            </details>
          ) : null}

          {canAttachDoc && docOptions.length > 0 ? (
            <form
              action={attachAgreementDocumentAction}
              className="flex flex-wrap items-center gap-2"
              data-testid="agreement-attach-doc-form"
            >
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="agreementId" value={row.id} />
              <label className="flex items-center gap-1 text-meta text-text-secondary">
                {t("attach.documentLabel")}
                <select
                  name="orgDocumentId"
                  required
                  className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1 text-meta text-text-primary"
                >
                  {docOptions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="rounded-md border border-ink-500 px-3 py-1.5 font-mono text-meta uppercase tracking-label text-text-secondary transition-colors hover:border-brand-blue hover:text-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                data-testid="agreement-attach-doc-submit"
              >
                {t("attach.submit")}
              </button>
            </form>
          ) : null}

          {!terminal && fileOptions.length > 0 ? (
            <form
              action={attachAgreementSignatureEvidenceAction}
              className="flex flex-wrap items-center gap-2"
              data-testid="agreement-evidence-form"
            >
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="agreementId" value={row.id} />
              <label className="flex items-center gap-1 text-meta text-text-secondary">
                {t("signature.attachLabel")}
                <select
                  name="documentFileId"
                  required
                  className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1 text-meta text-text-primary"
                >
                  {fileOptions.map((d) => (
                    <option key={d.fileId} value={d.fileId ?? ""}>
                      {d.title}
                      {d.fileName ? ` — ${d.fileName}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="rounded-md border border-ink-500 px-3 py-1.5 font-mono text-meta uppercase tracking-label text-text-secondary transition-colors hover:border-brand-blue hover:text-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                data-testid="agreement-evidence-submit"
              >
                {t("signature.attachSubmit")}
              </button>
            </form>
          ) : null}

          {canAmend ? (
            <details
              className="rounded-md border border-ink-500 bg-ink-800/30 p-2"
              data-testid="agreement-amend"
            >
              <summary className="cursor-pointer font-mono text-meta uppercase tracking-label text-text-secondary">
                {t("amendment.addTitle")}
              </summary>
              <form
                action={addAgreementAmendmentAction}
                className="mt-2 flex flex-col gap-2"
              >
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="agreementId" value={row.id} />
                <label className="flex flex-col gap-1 text-xs text-text-secondary">
                  {t("amendment.titleLabel")}
                  <input
                    type="text"
                    name="title"
                    required
                    minLength={3}
                    maxLength={200}
                    className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-text-secondary">
                  {t("amendment.descriptionLabel")}
                  <textarea
                    name="description"
                    maxLength={2000}
                    rows={2}
                    className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
                  />
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs text-text-secondary">
                    {t("amendment.documentLabel")}
                    <select
                      name="documentId"
                      className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
                    >
                      <option value="">{t("amendment.documentNone")}</option>
                      {docOptions.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-text-secondary">
                    {t("amendment.effectiveDateLabel")}
                    <input
                      type="date"
                      name="effectiveDate"
                      className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
                    />
                  </label>
                </div>
                <p className="text-meta text-text-muted">
                  {t("amendment.honestNote")}
                </p>
                <button
                  type="submit"
                  className="self-start rounded-md border border-brand-blue/50 px-3 py-1.5 font-mono text-meta uppercase tracking-label text-brand-blue transition-colors hover:bg-brand-blue/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                  data-testid="agreement-amend-submit"
                >
                  {t("amendment.submit")}
                </button>
              </form>
            </details>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
