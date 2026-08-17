import { getTranslations } from "next-intl/server";

import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import { listOrganizationMembers } from "@/lib/company/memberships";
import {
  getOrgDocumentRegister,
  type OrgRegisterEntry,
} from "@/lib/documents/document-files";
import {
  DOCUMENT_FILE_MIME_TYPES,
  ORG_DOCUMENT_TYPE_SLUGS,
} from "@/lib/documents/document-file-model";
import { uploadOrgDocumentFileAction } from "@/lib/documents/document-file-actions";
import {
  archiveOrgDocumentAction,
  assignDocumentAckAction,
  createOrgDocumentAction,
  revokeOrgDocumentAction,
} from "@/lib/documents/org-document-actions";

/**
 * Org document register (Document & Evidence Engine v1) — the organization's
 * OWN documents (policies, procedures, instructions, correspondence), on the
 * EXISTING documents page's org branch. This is org-scope data: worker
 * document rows are untouched and never rendered here.
 *
 * Authority: the acting organization comes from the server-resolved
 * employer context (never the client); every write is a gated SECURITY
 * DEFINER RPC that re-checks owner/admin membership. Members with lesser
 * roles see the RLS-scoped read (active, non-classified entries) and no
 * manage controls.
 *
 * Honest absence: while the human-gated migration is unapplied the read
 * answers needs-migration and the section says the register is prepared
 * but not enabled in this environment — nothing pretends.
 */

const STATUS_TONE: Record<string, string> = {
  active: "border-state-success/40 bg-state-success/5 text-state-success",
  archived: "border-ink-500 bg-ink-800/40 text-text-muted",
  revoked: "border-state-warning/60 bg-state-warning/10 text-state-warning",
};

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export async function OrgDocumentsRegister({ locale }: { locale: string }) {
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

  const register = await getOrgDocumentRegister(ctx.organizationId);
  const canManage = ctx.role === "owner" || ctx.role === "admin";
  const members = canManage
    ? await listOrganizationMembers(ctx.organizationId)
    : null;
  const activeMembers =
    members?.kind === "ok"
      ? members.members.filter((m) => m.status === "active")
      : [];
  const accept = (DOCUMENT_FILE_MIME_TYPES as readonly string[]).join(",");

  return (
    <section
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
          {register.entries.length === 0 ? (
            <p
              className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted"
              data-testid="org-documents-empty"
            >
              {t("empty")}
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
                  <select
                    name="typeSlug"
                    required
                    className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
                  >
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
                    className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-text-secondary">
                  {t("create.descriptionLabel")}
                  <textarea
                    name="description"
                    maxLength={2000}
                    rows={2}
                    className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
                  />
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs text-text-secondary">
                    {t("create.classificationLabel")}
                    <select
                      name="classification"
                      className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
                    >
                      <option value="standard">{t("classification.standard")}</option>
                      <option value="classified">{t("classification.classified")}</option>
                    </select>
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
                    {t("create.validFromLabel")}
                    <input
                      type="date"
                      name="validFrom"
                      className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-text-secondary">
                    {t("create.expiresOnLabel")}
                    <input
                      type="date"
                      name="expiresOn"
                      className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
                    />
                  </label>
                </div>
                <label className="flex flex-col gap-1 text-xs text-text-secondary">
                  {t("create.externalRefLabel")}
                  <input
                    type="text"
                    name="externalRef"
                    maxLength={200}
                    className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
                  />
                </label>
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

function RegisterRow({
  locale,
  entry,
  canManage,
  accept,
  members,
  t,
}: {
  locale: string;
  entry: OrgRegisterEntry;
  canManage: boolean;
  accept: string;
  members: readonly { profileId: string; label: string }[];
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const d = entry.document;
  return (
    <li
      className="flex flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/40 p-3"
      data-testid="org-document-row"
      data-status={d.status}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-semibold text-text-primary">
            {d.title}
          </span>
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">
            {t(`types.${d.documentTypeSlug}` as never)}
            {d.externalRef ? ` · ${d.externalRef}` : ""}
            {d.expiresOn ? ` · ${t("expiresOn", { date: d.expiresOn })}` : ""}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {d.classification === "classified" ? (
            <span className="rounded-sm border border-state-warning/60 bg-state-warning/10 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-state-warning">
              {t("classification.classified")}
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
