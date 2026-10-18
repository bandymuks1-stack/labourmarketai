import { getTranslations } from "next-intl/server";
import { FileText } from "lucide-react";

import { Card } from "@/components/ui/Card";
import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrgDocumentRegister } from "@/lib/documents/document-files";
import { EMPTY_ORG_REGISTER_FILTERS } from "@/lib/documents/document-file-model";

/**
 * LINKED DOCUMENTS - a READ-ONLY view of the organization's document register
 * rows that are linked to ONE project (`org_documents.project_id`) or ONE
 * worker (`org_documents.worker_id`).
 *
 * No new access path: this is `getOrgDocumentRegister` with a surface filter,
 * so the caller's own RLS decides every row (managers see the register;
 * classified entries stay classified; members see only what the policy admits)
 * and the existing download door `/api/documents/file/:id` decides every file
 * (including recording downloads of classified documents). Nothing is created,
 * edited or sent from here; management stays on the documents page.
 *
 * Honest states: a failed read is an error state, never "none linked"; an
 * environment without the register renders nothing at all.
 */

const SHOWN = 20;

export type LinkedDocumentsScope =
  | { readonly kind: "project"; readonly projectId: string }
  | { readonly kind: "worker"; readonly workerId: string };

export async function LinkedDocuments({
  organizationId,
  scope,
}: {
  organizationId: string;
  scope: LinkedDocumentsScope;
}) {
  const t = await getTranslations("linkedDocuments");
  const tDoc = await getTranslations("orgDocuments");

  const result = await getOrgDocumentRegister(organizationId, {
    ...EMPTY_ORG_REGISTER_FILTERS,
    projectId: scope.kind === "project" ? scope.projectId : null,
    workerId: scope.kind === "worker" ? scope.workerId : null,
  });
  if (result.kind === "needs-migration") return null;

  const heading = (suffix = "") => (
    <h2 className="inline-flex items-center gap-2 font-mono text-meta uppercase tracking-label text-text-muted">
      <FileText className="h-3.5 w-3.5" aria-hidden />
      {t("title")}
      {suffix}
    </h2>
  );

  if (result.kind === "error") {
    return (
      <section className="flex flex-col gap-3" data-testid="linked-documents" data-status="unavailable">
        {heading()}
        <Card variant="error" compact>
          <p className="text-sm text-text-secondary" data-testid="linked-documents-unavailable">
            {t("unavailable")}
          </p>
        </Card>
      </section>
    );
  }

  const registerLink = (
    <Link
      href={"/dashboard/documents" as "/dashboard"}
      className="w-fit font-mono text-meta uppercase tracking-label text-brand-blue underline-offset-2 hover:underline"
      data-testid="linked-documents-open-register"
    >
      {t("openRegister")}
    </Link>
  );

  if (result.entries.length === 0) {
    return (
      <section className="flex flex-col gap-3" data-testid="linked-documents" data-status="empty">
        {heading()}
        <p
          className="rounded-md border border-dashed border-ink-500 px-3 py-2 text-xs leading-relaxed text-text-muted"
          data-testid="linked-documents-empty"
        >
          {scope.kind === "project" ? t("emptyProject") : t("emptyPerson")}
        </p>
        {registerLink}
      </section>
    );
  }

  const shown = result.entries.slice(0, SHOWN);
  return (
    <section
      className="flex flex-col gap-3"
      data-testid="linked-documents"
      data-status="ready"
      data-count={result.entries.length}
    >
      {heading(` · ${result.entries.length}`)}
      <p className="text-xs leading-relaxed text-text-secondary">
        {scope.kind === "project" ? t("introProject") : t("introPerson")}
      </p>
      <ul className="flex flex-col gap-2">
        {shown.map(({ document: d, currentFile }) => (
          <li key={d.id} data-testid="linked-document" data-status={d.status}>
            <Card compact className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm font-medium text-text-primary">{d.title}</span>
                <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                  {tDoc.has(`types.${d.documentTypeSlug}` as never)
                    ? tDoc(`types.${d.documentTypeSlug}` as never)
                    : d.documentTypeSlug}
                </span>
                <span className="font-mono text-meta uppercase tracking-label text-text-secondary">
                  {tDoc.has(`status.${d.status}` as never) ? tDoc(`status.${d.status}` as never) : d.status}
                </span>
                {d.classification === "classified" ? (
                  <span className="font-mono text-meta uppercase tracking-label text-text-secondary">
                    {tDoc("classification.classified")}
                  </span>
                ) : null}
              </div>
              {currentFile ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-meta text-text-muted">{currentFile.originalFilename}</span>
                  <a
                    href={`/api/documents/file/${currentFile.id}`}
                    className="font-mono text-meta uppercase tracking-label text-brand-blue underline-offset-2 hover:underline"
                    data-testid="linked-document-download"
                  >
                    {t("download")}
                  </a>
                </div>
              ) : (
                <p className="text-meta text-text-muted">{t("noFile")}</p>
              )}
            </Card>
          </li>
        ))}
      </ul>
      {result.entries.length > shown.length ? (
        <p className="text-meta text-text-muted">{t("more", { n: result.entries.length - shown.length })}</p>
      ) : null}
      {registerLink}
    </section>
  );
}

/**
 * The project page's entry: the register is organization-scoped, so the
 * project's own organization is read (under the viewer's RLS) and used. A
 * project with no organization binding has no register to read - nothing is
 * rendered rather than a claim of "none linked".
 */
export async function ProjectLinkedDocuments({ projectId }: { projectId: string }) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (supabase as any)
    .from("projects")
    .select("organization_id")
    .eq("id", projectId)
    .maybeSingle();
  const organizationId = (res.data?.organization_id as string | null | undefined) ?? null;
  if (res.error || !organizationId) return null;
  return <LinkedDocuments organizationId={organizationId} scope={{ kind: "project", projectId }} />;
}
