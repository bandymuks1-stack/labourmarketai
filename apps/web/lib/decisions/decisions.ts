import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  DECISION_READ_LIMIT,
  DECISION_WORKFLOW_CONTEXT,
  isDecisionMigrationMissingCode,
  isValidDecisionStatus,
  needsMirrorSync,
  type DecisionDocumentLinkRow,
  type DecisionTaskLinkRow,
  type ManagementDecisionRow,
} from "@/lib/decisions/decisions-model";

/**
 * Management Decisions read service (v1).
 *
 * Reads ONLY the new decision tables (plus the two link tables' joined
 * labels) with the caller's RLS-scoped client. It never reads or writes a
 * workflow table directly except through the gated read-repair command
 * below.
 *
 * READ-REPAIR: a row whose status MIRROR still says
 * 'submitted_for_approval' converges onto the workflow engine's terminal
 * truth through the idempotent gated RPC `sync_management_decision_v1`. The
 * repair decides nothing — it only copies what the engine already recorded,
 * and every repair leaves a management_decision_events row. If the engine is
 * still pending it is a no-op.
 *
 * INTERNAL ONLY: this layer never sends anything anywhere. No AI.
 *
 * Honest degradation: while the human-gated migration is not applied the
 * reads see 42P01 and report { kind: "needs-migration" }.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

type RawRow = Record<string, unknown>;

const DECISION_COLUMNS =
  "id, organization_id, title, agenda, decision_result, status, workflow_instance_id, responsible_profile_id, deadline, created_at";

function toDecision(r: RawRow): ManagementDecisionRow | null {
  const status = String(r.status ?? "");
  if (!isValidDecisionStatus(status)) return null;
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    title: String(r.title ?? ""),
    agenda: String(r.agenda ?? ""),
    decisionResult: (r.decision_result as string | null) ?? null,
    status,
    workflowInstanceId: (r.workflow_instance_id as string | null) ?? null,
    responsibleProfileId: (r.responsible_profile_id as string | null) ?? null,
    deadline: (r.deadline as string | null) ?? null,
    createdAt: String(r.created_at),
  };
}

export type DecisionsOverviewResult =
  | { readonly kind: "not-authed" }
  | { readonly kind: "needs-migration" }
  | { readonly kind: "error" }
  | {
      readonly kind: "ok";
      readonly decisions: readonly ManagementDecisionRow[];
      readonly documentLinks: readonly DecisionDocumentLinkRow[];
      readonly taskLinks: readonly DecisionTaskLinkRow[];
      /** The org's PUBLISHED workflow definitions for the
       *  'management_decision' context, so the submit form can offer the
       *  approval template the organization already authored. Read-only. */
      readonly approvalTemplates: readonly {
        readonly id: string;
        readonly name: string;
      }[];
      readonly viewerProfileId: string;
    };

export async function getDecisionsOverview(): Promise<DecisionsOverviewResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const first = await asAny(supabase)
    .from("management_decisions")
    .select(DECISION_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(DECISION_READ_LIMIT);
  if (first.error) {
    return isDecisionMigrationMissingCode(first.error.code)
      ? { kind: "needs-migration" }
      : { kind: "error" };
  }

  let rows = ((first.data ?? []) as RawRow[])
    .map(toDecision)
    .filter((r): r is ManagementDecisionRow => r !== null);

  // READ-REPAIR — idempotent, decides nothing, engine truth only.
  const pending = rows.filter((r) => needsMirrorSync(r.status));
  if (pending.length > 0) {
    let repaired = false;
    for (const row of pending) {
      const res = await asAny(supabase).rpc("sync_management_decision_v1", {
        p_decision_id: row.id,
      });
      if (!res.error && String(res.data ?? "") === "synced") repaired = true;
    }
    if (repaired) {
      const again = await asAny(supabase)
        .from("management_decisions")
        .select(DECISION_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(DECISION_READ_LIMIT);
      if (!again.error) {
        rows = ((again.data ?? []) as RawRow[])
          .map(toDecision)
          .filter((r): r is ManagementDecisionRow => r !== null);
      }
    }
  }

  const documentLinks: DecisionDocumentLinkRow[] = [];
  const taskLinks: DecisionTaskLinkRow[] = [];
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const docs = await asAny(supabase)
      .from("decision_document_links")
      .select("id, decision_id, org_document_id, org_documents(title)")
      .in("decision_id", ids)
      .limit(DECISION_READ_LIMIT);
    if (!docs.error) {
      for (const r of (docs.data ?? []) as RawRow[]) {
        const doc = r.org_documents as { title?: string } | null;
        documentLinks.push({
          id: String(r.id),
          decisionId: String(r.decision_id),
          orgDocumentId: String(r.org_document_id),
          documentTitle: doc?.title ?? null,
        });
      }
    }
    const tasks = await asAny(supabase)
      .from("decision_task_links")
      .select("id, decision_id, work_task_id, work_tasks(title, status)")
      .in("decision_id", ids)
      .limit(DECISION_READ_LIMIT);
    if (!tasks.error) {
      for (const r of (tasks.data ?? []) as RawRow[]) {
        const task = r.work_tasks as { title?: string; status?: string } | null;
        taskLinks.push({
          id: String(r.id),
          decisionId: String(r.decision_id),
          workTaskId: String(r.work_task_id),
          taskTitle: task?.title ?? null,
          taskStatus: task?.status ?? null,
        });
      }
    }
  }

  // The engine's own definitions, read-only, RLS-scoped. Writing an engine
  // table from this module is forbidden and guard-pinned.
  const templates: { id: string; name: string }[] = [];
  const defs = await asAny(supabase)
    .from("workflow_definitions")
    .select("id, name, is_active, context_entity_type")
    .eq("context_entity_type", DECISION_WORKFLOW_CONTEXT)
    .eq("is_active", true)
    .limit(DECISION_READ_LIMIT);
  if (!defs.error) {
    for (const r of (defs.data ?? []) as RawRow[]) {
      templates.push({ id: String(r.id), name: String(r.name ?? "") });
    }
  }

  return {
    kind: "ok",
    decisions: rows,
    documentLinks,
    taskLinks,
    approvalTemplates: templates,
    viewerProfileId: user.id,
  };
}
