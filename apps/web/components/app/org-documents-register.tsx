import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import { listOrganizationMembers } from "@/lib/company/memberships";
import {
  getOrgDocumentRegister,
  listOrgDocumentApprovalDefinitions,
  type OrgRegisterEntry,
} from "@/lib/documents/document-files";
import {
  CORRESPONDENCE_DIRECTIONS,
  DOCUMENT_FILE_MIME_TYPES,
  EMPTY_ORG_REGISTER_FILTERS,
  ORG_CORRESPONDENCE_SLUGS,
  ORG_DOCUMENT_COUNTERPARTY_MAX,
  ORG_DOCUMENT_COUNTERPARTY_REF_MAX,
  ORG_DOCUMENT_RETENTION_NOTE_MAX,
  ORG_DOCUMENT_STATUSES,
  ORG_DOCUMENT_TYPE_SLUGS,
  ORG_REGISTER_ANCHOR,
  ORG_REGISTER_SEARCH_MAX,
  correspondenceDirectionForSlug,
  orgRegisterHref,
  retentionState,
  type OrgRegisterFilters,
} from "@/lib/documents/document-file-model";
import { getOrgWorkObjects } from "@/lib/objects/objects";
import { workObjectPlace } from "@/lib/objects/objects-model";
import { uploadOrgDocumentFileAction } from "@/lib/documents/document-file-actions";
import {
  archiveOrgDocumentAction,
  assignDocumentAckAction,
  createOrgDocumentAction,
  revokeOrgDocumentAction,
  setOrgDocumentRetentionAction,
  submitOrgDocumentForApprovalAction,
} from "@/lib/documents/org-document-actions";

/**
 * Org document register (Document & Evidence Engine v1 + register delta v1)
 * — the organization's OWN documents (policies, procedures, instructions,
 * correspondence), on the EXISTING documents page's org branch. This is
 * org-scope data: worker document rows are untouched and never rendered
 * here.
 *
 * Authority: the acting organization comes from the server-resolved
 * employer context (never the client); every write is a gated SECURITY
 * DEFINER RPC that re-checks owner/admin membership. Members with lesser
 * roles see the RLS-scoped read (active, non-classified entries) and no
 * manage controls.
 *
 * Register delta (20260817240000): a correspondence VIEW over the same
 * register (direction is DERIVED from the type slug — never a stored
 * column), the object (site) link, a bounded metadata search, and honest
 * RETENTION surfacing. Retention here is a RECORD of what the organization
 * decided; nothing on this surface, and nothing in this product, deletes a
 * document when the date passes.
 *
 * Honest absence: while the human-gated migrations are unapplied the read
 * answers needs-migration (train C) or `deltaAvailable: false` (delta) and
 * the affected controls do not render at all — no empty column pretends the
 * data exists.
 */

const STATUS_TONE: Record<string, string> = {
  active: "border-state-success/40 bg-state-success/5 text-state-success",
  archived: "border-ink-500 bg-ink-800/40 text-text-muted",
  revoked: "border-state-warning/60 bg-state-warning/10 text-state-warning",
};

const APPROVAL_TONE: Record<string, string> = {
  submitted: "border-brand-blue/40 bg-brand-blue/5 text-brand-blue",
  approved: "border-state-success/40 bg-state-success/5 text-state-success",
  returned: "border-state-warning/60 bg-state-warning/10 text-state-warning",
};

const CHIP_BASE =
  "inline-flex min-h-9 items-center rounded-md border px-3 py-1.5 font-mono text-meta uppercase tracking-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue";
const CHIP_ACTIVE = "border-brand-blue text-brand-blue";
const CHIP_IDLE = "border-ink-500 text-text-secondary hover:border-brand-blue";
const FIELD =
  "rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary";

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

type ObjectOption = { readonly id: string; readonly label: string };

export async function OrgDocumentsRegister({
  locale,
  filters = EMPTY_ORG_REGISTER_FILTERS,
}: {
  locale: string;
  filters?: OrgRegisterFilters;
}) {
  const t = await getTranslations("orgDocuments");
  const ctx = await resolveEmployerCompanyContext();

  if (ctx.kind !== "ok") {
    // No employer context (personal workspace, no org, …) — the org branch
    // of the page already explains the workspace situation; the register
    // adds one honest line only for infrastructure-shaped reasons.
    if (ctx.reason === "needs-migration" || ctx.reason === "error") {
      return (
        <section
          className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/30 p-4"
          data-testid="org-documents-register-unavailable"
        >
          <h2 className="font-display text-lg font-semibold text-text-primary">
            {t("title")}
          </h2>
          <p className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted">
            {t("unavailable")}
          </p>
        </section>
      );
    }
    return null;
  }

  const register = await getOrgDocumentRegister(ctx.organizationId, filters);
  const canManage = ctx.role === "owner" || ctx.role === "admin";
  const members = canManage
    ? await listOrganizationMembers(ctx.organizationId)
    : null;
  const activeMembers =
    members?.kind === "ok"
      ? members.members.filter((m) => m.status === "active")
      : [];
  const accept = (DOCUMENT_FILE_MIME_TYPES as readonly string[]).join(",");

  const deltaAvailable = register.kind === "ok" && register.deltaAvailable;
  const applied = register.kind === "ok" ? register.filters : filters;

  // Objects (train D) — only fetched when the delta axis really exists here.
  let objectOptions: readonly ObjectOption[] = [];
  if (deltaAvailable) {
    const objects = await getOrgWorkObjects();
    if (objects.kind === "ok") {
      objectOptions = objects.rows.map((o) => {
        const place = workObjectPlace(o);
        return { id: o.id, label: place ? `${o.name} · ${place}` : o.name };
      });
    }
  }
  const objectLabels = new Map(objectOptions.map((o) => [o.id, o.label]));

  // Approval routing rides the EXISTING engine; with no published
  // definition for this context the control simply does not render.
  const approvalDefinitions =
    deltaAvailable && canManage
      ? await listOrgDocumentApprovalDefinitions(ctx.organizationId)
      : [];

  const todayIso = new Date().toISOString().slice(0, 10);
  const filtersActive =
    applied.status !== null ||
    applied.direction !== null ||
    applied.objectId !== null ||
    applied.retention !== null ||
    applied.q !== "";

  return (
    <section
      id={ORG_REGISTER_ANCHOR.slice(1)}
      className="flex flex-col gap-3 rounded-md border border-ink-600 bg-ink-800/30 p-4"
      data-testid="org-documents-register"
    >
      <h2 className="font-display text-lg font-semibold text-text-primary">
        {t("title")}
      </h2>
      <p className="text-xs text-text-secondary">
        {t("intro", { org: ctx.organizationName })}
      </p>

      {register.kind === "needs-migration" ? (
        <p
          className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-sm text-text-secondary"
          data-testid="org-documents-preparing"
        >
          {t("preparing")}
        </p>
      ) : register.kind === "error" ? (
        <p className="rounded-md border border-state-warning bg-state-warning/10 px-3 py-2 text-xs text-state-warning">
          {t("error")}
        </p>
      ) : (
        <>
          <RegisterFilters
            filters={applied}
            deltaAvailable={deltaAvailable}
            objectOptions={objectOptions}
            filtersActive={filtersActive}
            locale={locale}
            t={t}
          />

          {register.entries.length === 0 ? (
            <p
              className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted"
              data-testid={
                filtersActive ? "org-documents-no-matches" : "org-documents-empty"
              }
            >
              {filtersActive ? t("filters.noMatches") : t("empty")}
            </p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="org-documents-list">
              {register.entries.map((entry) => (
                <RegisterRow
                  key={entry.document.id}
                  locale={locale}
                  entry={entry}
                  canManage={canManage}
                  accept={accept}
                  deltaAvailable={deltaAvailable}
                  objectLabels={objectLabels}
                  approvalDefinitions={approvalDefinitions}
                  todayIso={todayIso}
                  members={activeMembers.map((m) => ({
                    profileId: m.profileId,
                    label: m.fullName || m.email || m.profileId.slice(0, 8),
                  }))}
                  t={t}
                />
              ))}
            </ul>
          )}

          {canManage ? (
            <details
              className="rounded-md border border-ink-500 bg-ink-800/40 p-3"
              data-testid="org-documents-create"
            >
              <summary className="cursor-pointer font-mono text-meta uppercase tracking-label text-brand-blue">
                {t("create.title")}
              </summary>
              <form
                action={createOrgDocumentAction}
                className="mt-3 flex flex-col gap-2"
              >
                <input type="hidden" name="locale" value={locale} />
                <label className="flex flex-col gap-1 text-xs text-text-secondary">
                  {t("create.typeLabel")}
                  <select name="typeSlug" required className={FIELD}>
                    {ORG_DOCUMENT_TYPE_SLUGS.map((slug) => (
                      <option key={slug} value={slug}>
                        {t(`types.${slug}` as never)}
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
                    className={FIELD}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-text-secondary">
                  {t("create.descriptionLabel")}
                  <textarea
                    name="description"
                    maxLength={2000}
                    rows={2}
                    className={FIELD}
                  />
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs text-text-secondary">
                    {t("create.classificationLabel")}
                    <select name="classification" className={FIELD}>
                      <option value="standard">{t("classification.standard")}</option>
                      <option value="classified">{t("classification.classified")}</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-text-secondary">
                    {t("create.responsibleLabel")}
                    <select name="responsibleProfileId" className={FIELD}>
                      <option value="">{t("create.responsibleNone")}</option>
                      {activeMembers.map((m) => (
                        <option key={m.profileId} value={m.profileId}>
                          {m.fullName || m.email || m.profileId.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-text-secondary">
                    {t("create.validFromLabel")}
                    <input type="date" name="validFrom" className={FIELD} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-text-secondary">
                    {t("create.expiresOnLabel")}
                    <input type="date" name="expiresOn" className={FIELD} />
                  </label>
                </div>
                <label className="flex flex-col gap-1 text-xs text-text-secondary">
                  {t("create.externalRefLabel")}
                  <input
                    type="text"
                    name="externalRef"
                    maxLength={200}
                    className={FIELD}
                  />
                </label>

                {/* Delta fields render ONLY where the delta migration really
                    answered — a control that cannot save is never shown. */}
                {deltaAvailable ? (
                  <>
                    {objectOptions.length > 0 ? (
                      <label
                        className="flex flex-col gap-1 text-xs text-text-secondary"
                        data-testid="org-documents-create-object"
                      >
                        {t("create.objectLabel")}
                        <select name="objectId" className={FIELD}>
                          <option value="">{t("create.objectNone")}</option>
                          {objectOptions.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    <fieldset
                      className="flex flex-col gap-2 rounded-md border border-ink-600 p-3"
                      data-testid="org-documents-create-correspondence"
                    >
                      <legend className="px-1 font-mono text-meta uppercase tracking-label text-text-muted">
                        {t("create.correspondenceLegend")}
                      </legend>
                      <p className="text-meta text-text-muted">
                        {t("create.correspondenceHint")}
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="flex flex-col gap-1 text-xs text-text-secondary">
                          {t("fields.counterparty")}
                          <input
                            type="text"
                            name="counterpartyName"
                            maxLength={ORG_DOCUMENT_COUNTERPARTY_MAX}
                            className={FIELD}
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-text-secondary">
                          {t("fields.correspondenceDate")}
                          <input
                            type="date"
                            name="correspondenceDate"
                            className={FIELD}
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-text-secondary sm:col-span-2">
                          {t("fields.counterpartyReference")}
                          <input
                            type="text"
                            name="counterpartyReference"
                            maxLength={ORG_DOCUMENT_COUNTERPARTY_REF_MAX}
                            className={FIELD}
                          />
                        </label>
                      </div>
                    </fieldset>

                    <fieldset
                      className="flex flex-col gap-2 rounded-md border border-ink-600 p-3"
                      data-testid="org-documents-create-retention"
                    >
                      <legend className="px-1 font-mono text-meta uppercase tracking-label text-text-muted">
                        {t("retention.legend")}
                      </legend>
                      <p className="text-meta text-text-muted">
                        {t("retention.noDeletionNote")}
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="flex flex-col gap-1 text-xs text-text-secondary">
                          {t("retention.untilLabel")}
                          <input
                            type="date"
                            name="retentionUntil"
                            className={FIELD}
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-text-secondary">
                          {t("retention.noteLabel")}
                          <input
                            type="text"
                            name="retentionNote"
                            maxLength={ORG_DOCUMENT_RETENTION_NOTE_MAX}
                            className={FIELD}
                          />
                        </label>
                      </div>
                    </fieldset>
                  </>
                ) : null}

                <button
                  type="submit"
                  className="self-start rounded-md border border-brand-blue/50 px-3 py-1.5 font-mono text-meta uppercase tracking-label text-brand-blue transition-colors hover:bg-brand-blue/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                  data-testid="org-documents-create-submit"
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

/** Filter + search bar. Chips are plain links (searchParams only, no new
 *  route); the search/object form is a plain GET form — submitting IS the
 *  navigation, so no inline pending state is owed. */
function RegisterFilters({
  filters,
  deltaAvailable,
  objectOptions,
  filtersActive,
  locale,
  t,
}: {
  filters: OrgRegisterFilters;
  deltaAvailable: boolean;
  objectOptions: readonly ObjectOption[];
  filtersActive: boolean;
  locale: string;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  return (
    <div className="flex flex-col gap-2" data-testid="org-documents-filters">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("filters.statusLabel")}
        </span>
        <Link
          href={orgRegisterHref({ ...filters, status: null }) as "/dashboard"}
          className={`${CHIP_BASE} ${filters.status === null ? CHIP_ACTIVE : CHIP_IDLE}`}
        >
          {t("filters.all")}
        </Link>
        {ORG_DOCUMENT_STATUSES.map((s) => (
          <Link
            key={s}
            href={orgRegisterHref({ ...filters, status: s }) as "/dashboard"}
            className={`${CHIP_BASE} ${filters.status === s ? CHIP_ACTIVE : CHIP_IDLE}`}
            data-testid={`org-documents-filter-status-${s}`}
          >
            {t(`status.${s}` as never)}
          </Link>
        ))}
      </div>

      {deltaAvailable ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-meta uppercase tracking-label text-text-muted">
              {t("filters.directionLabel")}
            </span>
            <Link
              href={
                orgRegisterHref({ ...filters, direction: null }) as "/dashboard"
              }
              className={`${CHIP_BASE} ${filters.direction === null ? CHIP_ACTIVE : CHIP_IDLE}`}
            >
              {t("filters.all")}
            </Link>
            {CORRESPONDENCE_DIRECTIONS.map((d) => (
              <Link
                key={d}
                href={
                  orgRegisterHref({ ...filters, direction: d }) as "/dashboard"
                }
                className={`${CHIP_BASE} ${filters.direction === d ? CHIP_ACTIVE : CHIP_IDLE}`}
                data-testid={`org-documents-filter-direction-${d}`}
              >
                {t(`direction.${d}` as never)}
              </Link>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-meta uppercase tracking-label text-text-muted">
              {t("retention.filterLabel")}
            </span>
            <Link
              href={
                orgRegisterHref({ ...filters, retention: null }) as "/dashboard"
              }
              className={`${CHIP_BASE} ${filters.retention === null ? CHIP_ACTIVE : CHIP_IDLE}`}
            >
              {t("filters.all")}
            </Link>
            {(["scheduled", "due"] as const).map((r) => (
              <Link
                key={r}
                href={
                  orgRegisterHref({ ...filters, retention: r }) as "/dashboard"
                }
                className={`${CHIP_BASE} ${filters.retention === r ? CHIP_ACTIVE : CHIP_IDLE}`}
                data-testid={`org-documents-filter-retention-${r}`}
              >
                {t(`retention.${r}` as never)}
              </Link>
            ))}
          </div>
        </>
      ) : null}

      <form
        method="GET"
        action={`/${locale}/dashboard/documents`}
        className="flex flex-wrap items-end gap-2"
        data-testid="org-documents-search-form"
      >
        {/* Chip axes survive a search submit. */}
        {filters.status ? (
          <input type="hidden" name="regStatus" value={filters.status} />
        ) : null}
        {deltaAvailable && filters.direction ? (
          <input type="hidden" name="regDirection" value={filters.direction} />
        ) : null}
        {deltaAvailable && filters.retention ? (
          <input type="hidden" name="regRetention" value={filters.retention} />
        ) : null}
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {t("filters.searchLabel")}
          <input
            type="search"
            name="regQ"
            defaultValue={filters.q}
            maxLength={ORG_REGISTER_SEARCH_MAX}
            placeholder={t("filters.searchPlaceholder")}
            className={FIELD}
          />
        </label>
        {deltaAvailable && objectOptions.length > 0 ? (
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {t("filters.objectLabel")}
            <select
              name="regObject"
              defaultValue={filters.objectId ?? ""}
              className={FIELD}
              data-testid="org-documents-filter-object"
            >
              <option value="">{t("filters.all")}</option>
              {objectOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          type="submit"
          className={`${CHIP_BASE} ${CHIP_IDLE}`}
          data-testid="org-documents-search-submit"
        >
          {t("filters.searchSubmit")}
        </button>
        {filtersActive ? (
          <Link
            href={orgRegisterHref({}) as "/dashboard"}
            className={`${CHIP_BASE} ${CHIP_IDLE}`}
            data-testid="org-documents-filters-clear"
          >
            {t("filters.clear")}
          </Link>
        ) : null}
      </form>
      {/* The search box is metadata-only, and says so — it never looks
          inside an uploaded file. */}
      <p className="text-meta text-text-muted">{t("filters.searchScopeNote")}</p>
    </div>
  );
}

function RegisterRow({
  locale,
  entry,
  canManage,
  accept,
  deltaAvailable,
  objectLabels,
  approvalDefinitions,
  todayIso,
  members,
  t,
}: {
  locale: string;
  entry: OrgRegisterEntry;
  canManage: boolean;
  accept: string;
  deltaAvailable: boolean;
  objectLabels: ReadonlyMap<string, string>;
  approvalDefinitions: readonly { id: string; name: string }[];
  todayIso: string;
  members: readonly { profileId: string; label: string }[];
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const d = entry.document;
  const direction = correspondenceDirectionForSlug(d.documentTypeSlug);
  const retention = retentionState(d.retentionUntil, todayIso);
  const objectLabel = d.objectId ? objectLabels.get(d.objectId) : undefined;

  return (
    <li
      className="flex flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/40 p-3"
      data-testid="org-document-row"
      data-status={d.status}
      data-direction={direction ?? undefined}
      data-retention={deltaAvailable ? retention : undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-semibold text-text-primary">
            {d.title}
          </span>
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">
            {t(`types.${d.documentTypeSlug}` as never)}
            {d.externalRef ? ` · ${t("fields.ourRef")}: ${d.externalRef}` : ""}
            {d.expiresOn ? ` · ${t("expiresOn", { date: d.expiresOn })}` : ""}
          </span>
          {/* Correspondence register line — rendered only for a
              correspondence row that really carries the facts. */}
          {deltaAvailable && direction ? (
            <span
              className="font-mono text-meta uppercase tracking-label text-text-muted"
              data-testid="org-document-correspondence"
            >
              {[
                d.counterpartyName
                  ? `${t("fields.counterparty")}: ${d.counterpartyName}`
                  : null,
                d.correspondenceDate
                  ? `${t("fields.correspondenceDate")}: ${d.correspondenceDate}`
                  : null,
                d.counterpartyReference
                  ? `${t("fields.counterpartyReference")}: ${d.counterpartyReference}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ") || t("fields.correspondenceUnrecorded")}
            </span>
          ) : null}
          {deltaAvailable && objectLabel ? (
            <span
              className="font-mono text-meta uppercase tracking-label text-text-muted"
              data-testid="org-document-object"
            >
              {t("fields.object")}: {objectLabel}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {deltaAvailable && direction ? (
            <span
              className="rounded-sm border border-brand-blue/40 bg-brand-blue/5 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-brand-blue"
              data-testid="org-document-direction"
            >
              {t(`direction.${direction}` as never)}
            </span>
          ) : null}
          {d.classification === "classified" ? (
            <span className="rounded-sm border border-state-warning/60 bg-state-warning/10 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-state-warning">
              {t("classification.classified")}
            </span>
          ) : null}
          {deltaAvailable && d.approvalState ? (
            <span
              className={`rounded-sm border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${APPROVAL_TONE[d.approvalState]}`}
              data-testid="org-document-approval"
              data-approval={d.approvalState}
            >
              {t(`approval.${d.approvalState}` as never)}
            </span>
          ) : null}
          {deltaAvailable && retention !== "none" ? (
            <span
              className={`rounded-sm border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${
                retention === "due"
                  ? "border-state-warning/60 bg-state-warning/10 text-state-warning"
                  : "border-ink-500 bg-ink-800/40 text-text-muted"
              }`}
              data-testid="org-document-retention"
              data-retention={retention}
              title={d.retentionNote ?? undefined}
            >
              {retention === "due"
                ? t("retention.badge.due", { date: d.retentionUntil ?? "" })
                : t("retention.badge.scheduled", {
                    date: d.retentionUntil ?? "",
                  })}
            </span>
          ) : null}
          <span
            className={`rounded-sm border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${STATUS_TONE[d.status] ?? STATUS_TONE.archived}`}
          >
            {t(`status.${d.status}` as never)}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {entry.currentFile ? (
          <>
            <span className="font-mono text-meta uppercase tracking-label text-text-muted">
              {t("currentVersion", { n: entry.currentFile.version })} ·{" "}
              {entry.currentFile.originalFilename} ·{" "}
              {formatBytes(entry.currentFile.byteSize)}
              {entry.versionCount > 1
                ? ` · ${t("versionHistory", { n: entry.versionCount })}`
                : ""}
            </span>
            <a
              href={`/api/documents/file/${entry.currentFile.id}`}
              className="font-mono text-meta uppercase tracking-label text-brand-blue underline-offset-2 hover:underline"
              data-testid="org-document-download"
            >
              {t("download")}
            </a>
            {entry.ackProgress ? (
              <span
                className="rounded-sm border border-ink-500 bg-ink-800/40 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-muted"
                data-testid="org-document-ack-progress"
              >
                {t("ackProgress", {
                  done: entry.ackProgress.acknowledged,
                  total: entry.ackProgress.assigned,
                })}
              </span>
            ) : null}
          </>
        ) : (
          <span className="text-meta text-text-muted">{t("noFileYet")}</span>
        )}
      </div>

      {canManage && d.status === "active" ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-ink-600 pt-2">
          <form
            action={uploadOrgDocumentFileAction}
            className="flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="orgDocumentId" value={d.id} />
            <input
              type="file"
              name="file"
              required
              accept={accept}
              className="max-w-full text-meta text-text-secondary file:mr-2 file:rounded-md file:border file:border-ink-500 file:bg-ink-800/40 file:px-2 file:py-1 file:text-meta file:text-text-secondary"
            />
            <button
              type="submit"
              className="rounded-md border border-brand-blue/50 px-3 py-1.5 font-mono text-meta uppercase tracking-label text-brand-blue transition-colors hover:bg-brand-blue/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
              data-testid="org-document-upload-submit"
            >
              {entry.currentFile ? t("uploadNewVersion") : t("uploadFirst")}
            </button>
          </form>

          {entry.currentFile && members.length > 0 ? (
            <form
              action={assignDocumentAckAction}
              className="flex flex-wrap items-center gap-2"
              data-testid="org-document-assign-form"
            >
              <input type="hidden" name="locale" value={locale} />
              <input
                type="hidden"
                name="documentFileId"
                value={entry.currentFile.id}
              />
              <label className="flex items-center gap-1 text-meta text-text-secondary">
                {t("assign.assigneeLabel")}
                <select
                  name="assigneeProfileId"
                  required
                  className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1 text-meta text-text-primary"
                >
                  {members.map((m) => (
                    <option key={m.profileId} value={m.profileId}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1 text-meta text-text-secondary">
                {t("assign.requiredByLabel")}
                <input
                  type="date"
                  name="requiredBy"
                  className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1 text-meta text-text-primary"
                />
              </label>
              <button
                type="submit"
                className="rounded-md border border-ink-500 px-3 py-1.5 font-mono text-meta uppercase tracking-label text-text-secondary transition-colors hover:border-brand-blue hover:text-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                data-testid="org-document-assign-submit"
              >
                {t("assign.submit")}
              </button>
            </form>
          ) : null}

          {/* Retention decision — a RECORD only. Nothing deletes on it. */}
          {deltaAvailable ? (
            <form
              action={setOrgDocumentRetentionAction}
              className="flex flex-wrap items-end gap-2"
              data-testid="org-document-retention-form"
            >
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="orgDocumentId" value={d.id} />
              <label className="flex items-center gap-1 text-meta text-text-secondary">
                {t("retention.untilLabel")}
                <input
                  type="date"
                  name="retentionUntil"
                  defaultValue={d.retentionUntil ?? ""}
                  className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1 text-meta text-text-primary"
                />
              </label>
              <label className="flex items-center gap-1 text-meta text-text-secondary">
                {t("retention.noteLabel")}
                <input
                  type="text"
                  name="retentionNote"
                  defaultValue={d.retentionNote ?? ""}
                  maxLength={ORG_DOCUMENT_RETENTION_NOTE_MAX}
                  className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1 text-meta text-text-primary"
                />
              </label>
              <button
                type="submit"
                className="rounded-md border border-ink-500 px-3 py-1.5 font-mono text-meta uppercase tracking-label text-text-secondary transition-colors hover:border-brand-blue hover:text-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                data-testid="org-document-retention-submit"
              >
                {t("retention.submit")}
              </button>
            </form>
          ) : null}

          {/* Optional internal approval — rides the EXISTING engine. With no
              published definition for this context the control is absent
              (nothing pretends an approval route exists). */}
          {deltaAvailable &&
          approvalDefinitions.length > 0 &&
          (d.approvalState === null || d.approvalState === "returned") ? (
            <form
              action={submitOrgDocumentForApprovalAction}
              className="flex flex-wrap items-end gap-2"
              data-testid="org-document-approval-form"
            >
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="orgDocumentId" value={d.id} />
              <label className="flex items-center gap-1 text-meta text-text-secondary">
                {t("approval.definitionLabel")}
                <select
                  name="definitionId"
                  required
                  className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1 text-meta text-text-primary"
                >
                  {approvalDefinitions.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="rounded-md border border-ink-500 px-3 py-1.5 font-mono text-meta uppercase tracking-label text-text-secondary transition-colors hover:border-brand-blue hover:text-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                data-testid="org-document-approval-submit"
              >
                {t("approval.submit")}
              </button>
            </form>
          ) : null}

          <form action={archiveOrgDocumentAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="orgDocumentId" value={d.id} />
            <button
              type="submit"
              className="rounded-md border border-ink-500 px-3 py-1.5 font-mono text-meta uppercase tracking-label text-text-secondary transition-colors hover:border-brand-blue hover:text-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
              data-testid="org-document-archive"
            >
              {t("archive")}
            </button>
          </form>
          <form action={revokeOrgDocumentAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="orgDocumentId" value={d.id} />
            <button
              type="submit"
              className="rounded-md border border-state-warning/50 px-3 py-1.5 font-mono text-meta uppercase tracking-label text-state-warning transition-colors hover:bg-state-warning/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
              data-testid="org-document-revoke"
            >
              {t("revoke")}
            </button>
          </form>
        </div>
      ) : null}
    </li>
  );
}
