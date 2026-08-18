import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  EMPTY_ORG_REGISTER_FILTERS,
  ORG_DOCUMENT_WORKFLOW_CONTEXT,
  currentDocumentFile,
  deriveAckProgress,
  isDocumentFileAbsentCode,
  type AckProgress,
  type DocumentFileRow,
  type OrgDocumentApprovalState,
  type OrgDocumentClassification,
  type OrgDocumentRow,
  type OrgDocumentStatus,
  type OrgRegisterFilters,
} from "@/lib/documents/document-file-model";
import {
  emitOrgDocumentExpiringNotifications,
  emitWorkerDocumentExpiringNotifications,
} from "@/lib/notifications/event-emitters";

/**
 * Document FILE layer — server read composition (Document & Evidence
 * Engine v1). Reads ride the caller's OWN RLS-scoped client; there is no
 * admin client and no write anywhere in this module (writes are the gated
 * RPCs behind lib/documents/document-file-actions.ts).
 *
 * HONEST AVAILABILITY: every read feature-detects the human-gated migration
 * (42P01/42883/PGRST202/…) and answers `available: false` — the page then
 * KEEPS its truthful "file upload is not available yet" note. The note is
 * removed from a rendered path only when this layer really answered.
 *
 * The expiry emitters called here are FIRE-AND-FORGET enhancements: they
 * run in the durable-notification module (service-role there, per that
 * module's own contract), never block or fail a read, and deduplicate via
 * the notification store's UNIQUE key.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

const FILE_READ_LIMIT = 500;
const REGISTER_READ_LIMIT = 200;
const ACK_READ_LIMIT = 200;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFileRow(r: any): DocumentFileRow {
  return {
    id: r.id as string,
    scope: r.scope as DocumentFileRow["scope"],
    workerDocumentId: (r.worker_document_id as string | null) ?? null,
    orgDocumentId: (r.org_document_id as string | null) ?? null,
    version: r.version as number,
    originalFilename: r.original_filename as string,
    mimeType: r.mime_type as string,
    byteSize: r.byte_size as number,
    uploadedAt: r.uploaded_at as string,
    supersededAt: (r.superseded_at as string | null) ?? null,
  };
}

export type WorkerDocumentFileInfo = {
  readonly current: DocumentFileRow | null;
  readonly versionCount: number;
};

export type WorkerDocumentFilesResult =
  | {
      readonly available: true;
      readonly byDocument: ReadonlyMap<string, WorkerDocumentFileInfo>;
    }
  /** The migration is not applied here (or the read failed) — the page
   *  keeps the honest no-upload note and renders NO file controls. */
  | { readonly available: false };

/** File state for the caller's OWN worker documents. RLS scopes every row;
 *  the caller's worker identity is resolved server-side (never a param a
 *  client could influence). */
export async function getWorkerDocumentFiles(
  workerDocumentIds: readonly string[],
): Promise<WorkerDocumentFilesResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { available: false };
    const { data: worker } = await asAny(supabase)
      .from("workers")
      .select("id")
      .eq("profile_id", user.id)
      .maybeSingle();
    const workerId = (worker?.id as string | undefined) ?? null;
    if (!workerId) return { available: false };

    const { data, error } = await asAny(supabase)
      .from("document_files")
      .select(
        "id, scope, worker_document_id, org_document_id, version, original_filename, mime_type, byte_size, uploaded_at, superseded_at",
      )
      .in(
        "worker_document_id",
        workerDocumentIds.length > 0 ? [...workerDocumentIds] : ["00000000-0000-4000-8000-000000000000"],
      )
      .limit(FILE_READ_LIMIT);
    if (error) return { available: false };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = ((data ?? []) as any[]).map(mapFileRow);
    const byDocument = new Map<string, WorkerDocumentFileInfo>();
    for (const docId of workerDocumentIds) {
      const mine = rows.filter((r) => r.workerDocumentId === docId);
      byDocument.set(docId, {
        current: currentDocumentFile(mine),
        versionCount: mine.length,
      });
    }

    // Durable "entering the 30-day window" fact — enhancement, never blocks.
    emitWorkerDocumentExpiringNotifications(workerId);

    return { available: true, byDocument };
  } catch {
    return { available: false };
  }
}

export type OrgRegisterEntry = {
  readonly document: OrgDocumentRow;
  readonly currentFile: DocumentFileRow | null;
  readonly versionCount: number;
  /** Ack progress of the CURRENT version only — acks are version-bound. */
  readonly ackProgress: AckProgress | null;
};

export type OrgDocumentRegisterResult =
  | {
      readonly kind: "ok";
      readonly entries: readonly OrgRegisterEntry[];
      /** True only when the register DELTA migration (20260817240000) really
       *  answered here. False ⇒ the correspondence / object / retention /
       *  approval affordances render nothing at all — never an empty column
       *  pretending the data exists. */
      readonly deltaAvailable: boolean;
      /** The filters actually applied (echoed so the UI cannot claim a
       *  filter that the environment could not honour). */
      readonly filters: OrgRegisterFilters;
    }
  | { readonly kind: "needs-migration" }
  | { readonly kind: "error" };

/** Train C column list — the contract that exists once 20260817140000 is
 *  applied. `retention_until` / `retention_note` are train C columns whose
 *  first WRITER arrives with the delta migration. */
const REGISTER_BASE_COLUMNS =
  "id, organization_id, document_type_slug, title, description, status, classification, responsible_profile_id, worker_id, project_id, external_ref, valid_from, expires_on, retention_until, retention_note, created_at";

/** …plus the delta columns (20260817240000). */
const REGISTER_DELTA_COLUMNS = `${REGISTER_BASE_COLUMNS}, object_id, counterparty_name, correspondence_date, counterparty_reference, approval_state`;

/** PostgREST answers 42703 when a COLUMN is unknown — that is precisely the
 *  "train C applied, delta not applied yet" state, and it must NOT hide the
 *  whole register the way a missing TABLE does. */
const UNDEFINED_COLUMN_CODE = "42703";

/** The org register for ONE organization (the caller's RLS decides which
 *  rows answer — managers see everything, members see active standard).
 *
 *  Filters are applied SERVER-SIDE (so the row cap is spent on matches, not
 *  on rows the caller filtered away); `q` is a bounded ILIKE over register
 *  METADATA only — never inside a file. */
export async function getOrgDocumentRegister(
  organizationId: string,
  filters: OrgRegisterFilters = EMPTY_ORG_REGISTER_FILTERS,
): Promise<OrgDocumentRegisterResult> {
  try {
    const supabase = await createClient();

    const todayIso = new Date().toISOString().slice(0, 10);

    // Filters are applied BEFORE order/limit so the row cap is spent on
    // matches, and so the chain never depends on a transform builder still
    // exposing filter methods.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const applyFilters = (q: any, delta: boolean) => {
      let out = q.eq("organization_id", organizationId);
      if (filters.status) out = out.eq("status", filters.status);
      if (delta) {
        if (filters.direction) {
          out = out.eq(
            "document_type_slug",
            filters.direction === "incoming"
              ? "org_correspondence_incoming"
              : "org_correspondence_outgoing",
          );
        }
        if (filters.objectId) out = out.eq("object_id", filters.objectId);
        if (filters.retention === "scheduled") {
          out = out.gt("retention_until", todayIso);
        } else if (filters.retention === "due") {
          out = out.lte("retention_until", todayIso);
        }
      }
      if (filters.q) {
        // `filters.q` is sanitized by parseOrgRegisterFilters: no comma,
        // parenthesis, dot or star can reach the `or=` grammar.
        const like = `*${filters.q}*`;
        const cols = delta
          ? [
              `title.ilike.${like}`,
              `description.ilike.${like}`,
              `external_ref.ilike.${like}`,
              `counterparty_name.ilike.${like}`,
              `counterparty_reference.ilike.${like}`,
            ]
          : [
              `title.ilike.${like}`,
              `description.ilike.${like}`,
              `external_ref.ilike.${like}`,
            ];
        out = out.or(cols.join(","));
      }
      return out.order("created_at", { ascending: false }).limit(REGISTER_READ_LIMIT);
    };

    let deltaAvailable = true;
    let res = await applyFilters(
      asAny(supabase).from("org_documents").select(REGISTER_DELTA_COLUMNS),
      true,
    );
    if (res.error && res.error.code === UNDEFINED_COLUMN_CODE) {
      // Train C is live, the delta is not applied here yet. Fall back to the
      // train C contract and tell the UI the delta axes are unavailable.
      deltaAvailable = false;
      res = await applyFilters(
        asAny(supabase).from("org_documents").select(REGISTER_BASE_COLUMNS),
        false,
      );
    }
    const { data, error } = res;
    if (error) {
      return isDocumentFileAbsentCode(error.code)
        ? { kind: "needs-migration" }
        : { kind: "error" };
    }

    const appliedFilters: OrgRegisterFilters = deltaAvailable
      ? filters
      : { ...filters, direction: null, objectId: null, retention: null };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const docs: OrgDocumentRow[] = ((data ?? []) as any[]).map((r) => ({
      id: r.id as string,
      organizationId: r.organization_id as string,
      documentTypeSlug: r.document_type_slug as string,
      title: r.title as string,
      description: (r.description as string | null) ?? null,
      status: r.status as OrgDocumentStatus,
      classification: r.classification as OrgDocumentClassification,
      responsibleProfileId: (r.responsible_profile_id as string | null) ?? null,
      workerId: (r.worker_id as string | null) ?? null,
      projectId: (r.project_id as string | null) ?? null,
      externalRef: (r.external_ref as string | null) ?? null,
      validFrom: (r.valid_from as string | null) ?? null,
      expiresOn: (r.expires_on as string | null) ?? null,
      createdAt: r.created_at as string,
      objectId: (r.object_id as string | null) ?? null,
      counterpartyName: (r.counterparty_name as string | null) ?? null,
      correspondenceDate: (r.correspondence_date as string | null) ?? null,
      counterpartyReference:
        (r.counterparty_reference as string | null) ?? null,
      retentionUntil: (r.retention_until as string | null) ?? null,
      retentionNote: (r.retention_note as string | null) ?? null,
      approvalState: (r.approval_state as OrgDocumentApprovalState | null) ?? null,
    }));

    // READ-REPAIR of the approval mirror: converge every 'submitted' row
    // onto the workflow engine's terminal truth. Idempotent gated RPC; a
    // still-pending instance answers 'unchanged'. Never decides anything.
    if (deltaAvailable) {
      const submitted = docs.filter((d) => d.approvalState === "submitted");
      for (const row of submitted) {
        const sync = await asAny(supabase).rpc(
          "sync_org_document_approval_v1",
          { p_org_document_id: row.id },
        );
        const outcome = sync.error ? "" : String(sync.data ?? "");
        if (outcome === "repaired_approved") {
          // Mutating the local copy is the same convergence the DB just did.
          const i = docs.findIndex((d) => d.id === row.id);
          if (i >= 0) docs[i] = { ...docs[i], approvalState: "approved" };
        } else if (outcome === "repaired_returned") {
          const i = docs.findIndex((d) => d.id === row.id);
          if (i >= 0) docs[i] = { ...docs[i], approvalState: "returned" };
        }
      }
    }

    let files: DocumentFileRow[] = [];
    if (docs.length > 0) {
      const fileRes = await asAny(supabase)
        .from("document_files")
        .select(
          "id, scope, worker_document_id, org_document_id, version, original_filename, mime_type, byte_size, uploaded_at, superseded_at",
        )
        .in(
          "org_document_id",
          docs.map((d) => d.id),
        )
        .limit(FILE_READ_LIMIT);
      // A failed file read degrades to "no file info", never a crash.
      if (!fileRes.error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        files = ((fileRes.data ?? []) as any[]).map(mapFileRow);
      }
    }

    const currentIds = docs
      .map((d) => currentDocumentFile(files.filter((f) => f.orgDocumentId === d.id)))
      .filter((f): f is DocumentFileRow => f !== null)
      .map((f) => f.id);
    const ackByFile = new Map<string, { acknowledgedAt: string | null }[]>();
    if (currentIds.length > 0) {
      const ackRes = await asAny(supabase)
        .from("document_acknowledgements")
        .select("document_file_id, acknowledged_at")
        .in("document_file_id", currentIds)
        .limit(ACK_READ_LIMIT * 2);
      if (!ackRes.error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const r of (ackRes.data ?? []) as any[]) {
          const list = ackByFile.get(r.document_file_id as string) ?? [];
          list.push({ acknowledgedAt: (r.acknowledged_at as string | null) ?? null });
          ackByFile.set(r.document_file_id as string, list);
        }
      }
    }

    const entries: OrgRegisterEntry[] = docs.map((document) => {
      const mine = files.filter((f) => f.orgDocumentId === document.id);
      const current = currentDocumentFile(mine);
      const acks = current ? ackByFile.get(current.id) : undefined;
      return {
        document,
        currentFile: current,
        versionCount: mine.length,
        ackProgress: current && acks ? deriveAckProgress(acks) : current ? { assigned: 0, acknowledged: 0 } : null,
      };
    });

    // Durable expiry facts for the register's responsible people.
    emitOrgDocumentExpiringNotifications(organizationId);

    return { kind: "ok", entries, deltaAvailable, filters: appliedFilters };
  } catch {
    return { kind: "error" };
  }
}

export type OrgDocumentApprovalDefinition = {
  readonly id: string;
  readonly name: string;
};

/**
 * PUBLISHED workflow definitions of the acting org carrying the context
 * this module rides ('generic_request'). An empty list is honest
 * degradation: the register still works, the approval control simply does
 * not render (no approval is ever faked). Mirrors
 * `listAgreementApprovalDefinitions`.
 */
export async function listOrgDocumentApprovalDefinitions(
  organizationId: string,
): Promise<readonly OrgDocumentApprovalDefinition[]> {
  try {
    const supabase = await createClient();
    const defRes = await asAny(supabase)
      .from("workflow_definitions")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("context_entity_type", ORG_DOCUMENT_WORKFLOW_CONTEXT)
      .eq("is_active", true)
      .limit(50);
    if (defRes.error) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const defs = (defRes.data ?? []) as any[];
    if (defs.length === 0) return [];

    const verRes = await asAny(supabase)
      .from("workflow_definition_versions")
      .select("definition_id, published_at")
      .in(
        "definition_id",
        defs.map((d) => String(d.id)),
      )
      .not("published_at", "is", null)
      .limit(100);
    const published = new Set(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((verRes.error ? [] : (verRes.data ?? [])) as any[]).map((v) =>
        String(v.definition_id),
      ),
    );
    return defs
      .filter((d) => published.has(String(d.id)))
      .map((d) => ({ id: String(d.id), name: String(d.name ?? "") }));
  } catch {
    return [];
  }
}

export type AckInboxItem = {
  readonly ackId: string;
  readonly documentFileId: string;
  readonly documentTitle: string;
  readonly version: number;
  readonly originalFilename: string;
  readonly requiredBy: string | null;
  readonly acknowledgedAt: string | null;
  readonly createdAt: string;
};

export type AckInboxResult =
  | {
      readonly kind: "ok";
      readonly pending: readonly AckInboxItem[];
      readonly completed: readonly AckInboxItem[];
    }
  | { readonly kind: "needs-migration" }
  | { readonly kind: "error" };

/** The CALLER's own acknowledgement inbox (assignee-scoped by RLS). */
export async function getMyAcknowledgementInbox(): Promise<AckInboxResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { kind: "ok", pending: [], completed: [] };

    const { data, error } = await asAny(supabase)
      .from("document_acknowledgements")
      .select(
        "id, document_file_id, required_by, acknowledged_at, created_at, document_files(version, original_filename, org_documents(title))",
      )
      .eq("assignee_profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(ACK_READ_LIMIT);
    if (error) {
      return isDocumentFileAbsentCode(error.code)
        ? { kind: "needs-migration" }
        : { kind: "error" };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: AckInboxItem[] = ((data ?? []) as any[]).map((r) => {
      const file = r.document_files as {
        version?: number;
        original_filename?: string;
        org_documents?: { title?: string } | null;
      } | null;
      return {
        ackId: r.id as string,
        documentFileId: r.document_file_id as string,
        documentTitle: file?.org_documents?.title ?? "",
        version: file?.version ?? 0,
        originalFilename: file?.original_filename ?? "",
        requiredBy: (r.required_by as string | null) ?? null,
        acknowledgedAt: (r.acknowledged_at as string | null) ?? null,
        createdAt: r.created_at as string,
      };
    });
    return {
      kind: "ok",
      pending: items.filter((i) => i.acknowledgedAt === null),
      completed: items.filter((i) => i.acknowledgedAt !== null).slice(0, 10),
    };
  } catch {
    return { kind: "error" };
  }
}
