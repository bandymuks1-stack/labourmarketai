import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  AGREEMENT_READ_LIMIT,
  isAgreementMigrationMissingCode,
  isValidAgreementSignatureStatus,
  isValidAgreementStatus,
  isValidAgreementType,
  type AgreementAmendmentRow,
  type AgreementRow,
} from "@/lib/agreements/agreements-model";

/**
 * Agreement & Rights Engine read service (v1).
 *
 * Reads ONLY the new `agreements` family tables with the caller's RLS-scoped
 * client (org governance owner/admin, the row's responsible person, or
 * platform admin — RLS decides, this module never widens it).
 *
 * READ-REPAIR (the workflow mirror): a row whose status mirror says
 * 'submitted_for_approval' converges onto the workflow engine's terminal
 * truth through the idempotent gated RPC `sync_agreement_approval_v1`. The
 * repair decides nothing — it only converges the mirror onto what the
 * engine already recorded, and every repair leaves an agreement_events row.
 *
 * INTERNAL ONLY: this layer never sends anything anywhere — no email, no
 * SMS, no push, no webhook, no outbound call of any kind.
 *
 * Honest degradation: while the human-gated migration is not applied the
 * reads see 42P01 and report { kind: "needs-migration" } — the register
 * shows the calm "not enabled yet" state and nothing is faked.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const AGREEMENT_COLUMNS =
  "id, organization_id, agreement_type, title, counterparty_name, counterparty_org_number, worker_id, responsible_profile_id, effective_from, effective_to, status, signature_status, signature_evidence_file_id, current_document_id, external_ref, created_at";

type RawRow = Record<string, unknown>;

function toAgreement(r: RawRow): AgreementRow | null {
  const type = String(r.agreement_type ?? "");
  const status = String(r.status ?? "");
  const signatureStatus = String(r.signature_status ?? "");
  if (!isValidAgreementType(type)) return null;
  if (!isValidAgreementStatus(status)) return null;
  if (!isValidAgreementSignatureStatus(signatureStatus)) return null;
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    agreementType: type,
    title: String(r.title ?? ""),
    counterpartyName: String(r.counterparty_name ?? ""),
    counterpartyOrgNumber: (r.counterparty_org_number as string | null) ?? null,
    workerId: (r.worker_id as string | null) ?? null,
    responsibleProfileId: (r.responsible_profile_id as string | null) ?? null,
    effectiveFrom: (r.effective_from as string | null) ?? null,
    effectiveTo: (r.effective_to as string | null) ?? null,
    status,
    signatureStatus,
    signatureEvidenceFileId:
      (r.signature_evidence_file_id as string | null) ?? null,
    currentDocumentId: (r.current_document_id as string | null) ?? null,
    externalRef: (r.external_ref as string | null) ?? null,
    createdAt: String(r.created_at),
  };
}

export type AgreementRegisterResult =
  | { readonly kind: "not-authed" }
  | { readonly kind: "needs-migration" }
  | { readonly kind: "error" }
  | {
      readonly kind: "ok";
      readonly agreements: readonly AgreementRow[];
      readonly amendments: ReadonlyMap<
        string,
        readonly AgreementAmendmentRow[]
      >;
      /** Titles of org register documents referenced by base rows or
       *  amendments, for honest display. */
      readonly documentTitles: ReadonlyMap<string, string>;
    };

/**
 * One bounded, RLS-scoped pass building everything the register section
 * renders for the acting organization, converging stale approval mirrors
 * first. Never throws; never fabricates.
 */
export async function getAgreementRegister(
  organizationId: string,
): Promise<AgreementRegisterResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const res = await asAny(supabase)
    .from("agreements")
    .select(AGREEMENT_COLUMNS)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(AGREEMENT_READ_LIMIT);
  if (res.error) {
    if (isAgreementMigrationMissingCode(res.error.code)) {
      return { kind: "needs-migration" };
    }
    return { kind: "error" };
  }

  let agreements = ((res.data ?? []) as RawRow[])
    .map(toAgreement)
    .filter((a): a is AgreementRow => a !== null);

  // READ-REPAIR: converge submitted mirrors onto the engine's terminal
  // truth. Idempotent RPC; a still-pending workflow answers 'unchanged'.
  const submitted = agreements.filter(
    (a) => a.status === "submitted_for_approval",
  );
  let repaired = false;
  for (const row of submitted) {
    const sync = await asAny(supabase).rpc("sync_agreement_approval_v1", {
      p_agreement_id: row.id,
    });
    if (!sync.error && String(sync.data ?? "").startsWith("repaired")) {
      repaired = true;
    }
  }
  if (repaired) {
    const again = await asAny(supabase)
      .from("agreements")
      .select(AGREEMENT_COLUMNS)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(AGREEMENT_READ_LIMIT);
    if (!again.error) {
      agreements = ((again.data ?? []) as RawRow[])
        .map(toAgreement)
        .filter((a): a is AgreementRow => a !== null);
    }
  }

  // Amendment timelines for the listed rows (bounded, ordered).
  const ids = agreements.map((a) => a.id);
  const amendments = new Map<string, AgreementAmendmentRow[]>();
  if (ids.length > 0) {
    const amRes = await asAny(supabase)
      .from("agreement_amendments")
      .select(
        "id, agreement_id, sequence, title, description, document_id, effective_date, created_at",
      )
      .in("agreement_id", ids)
      .order("sequence", { ascending: true })
      .limit(AGREEMENT_READ_LIMIT * 5);
    for (const raw of (amRes.error ? [] : amRes.data ?? []) as RawRow[]) {
      const row: AgreementAmendmentRow = {
        id: String(raw.id),
        agreementId: String(raw.agreement_id),
        sequence: Number(raw.sequence),
        title: String(raw.title ?? ""),
        description: (raw.description as string | null) ?? null,
        documentId: (raw.document_id as string | null) ?? null,
        effectiveDate: (raw.effective_date as string | null) ?? null,
        createdAt: String(raw.created_at),
      };
      const list = amendments.get(row.agreementId) ?? [];
      list.push(row);
      amendments.set(row.agreementId, list);
    }
  }

  // Titles of referenced org register documents (honest display only).
  const docIds = [
    ...new Set(
      [
        ...agreements.map((a) => a.currentDocumentId),
        ...[...amendments.values()].flat().map((am) => am.documentId),
      ].filter((id): id is string => id !== null),
    ),
  ];
  const documentTitles = new Map<string, string>();
  if (docIds.length > 0) {
    const docRes = await asAny(supabase)
      .from("org_documents")
      .select("id, title")
      .in("id", docIds)
      .limit(AGREEMENT_READ_LIMIT);
    for (const raw of (docRes.error ? [] : docRes.data ?? []) as RawRow[]) {
      documentTitles.set(String(raw.id), String(raw.title ?? ""));
    }
  }

  return { kind: "ok", agreements, amendments, documentTitles };
}

export type AgreementWorkflowDefinitionOption = {
  readonly id: string;
  readonly name: string;
};

/**
 * Published workflow definitions of the acting org with the 'agreement'
 * context — the submit form's options. Empty list = honest degradation
 * (the record can still move draft → active_record without internal
 * approval, clearly labeled in the UI).
 */
export async function listAgreementApprovalDefinitions(
  organizationId: string,
): Promise<readonly AgreementWorkflowDefinitionOption[]> {
  const supabase = await createClient();
  const defRes = await asAny(supabase)
    .from("workflow_definitions")
    .select("id, name, is_active, context_entity_type")
    .eq("organization_id", organizationId)
    .eq("context_entity_type", "agreement")
    .eq("is_active", true)
    .limit(50);
  if (defRes.error) return [];
  const defs = (defRes.data ?? []) as RawRow[];
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
    ((verRes.error ? [] : verRes.data ?? []) as RawRow[]).map((v) =>
      String(v.definition_id),
    ),
  );
  return defs
    .filter((d) => published.has(String(d.id)))
    .map((d) => ({ id: String(d.id), name: String(d.name ?? "") }));
}
