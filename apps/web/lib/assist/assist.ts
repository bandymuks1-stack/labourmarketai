import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getAiRuntimeConfig } from "@/lib/ai/runtime/config";
import type { Role } from "@/lib/auth/actions";
import { buildVerifiedCv } from "@/lib/cv-export/verified-cv";
import { getWorkerDocumentCentre } from "@/lib/documents/document-centre";
import { getFinanceSummary } from "@/lib/finance/finance";
import { getSpineCounts } from "@/lib/notifications/spine";
import { callerCompanyId } from "@/lib/projects/projects";
import { buildEvidenceReport } from "@/lib/reports/evidence-report";
import { createClient } from "@/lib/supabase/server";
import {
  ASSIST_PROJECT_READ_LIMIT,
  ASSIST_PROJECT_STATUSES,
  buildAiProviderView,
  buildAttentionItems,
  buildProjectStatusRow,
  buildWorkerEvidenceSummary,
  type AiProviderView,
  type AssistProjectRow,
  type AttentionItem,
  type FinanceAttentionInput,
  type WorkerEvidenceSummary,
} from "@/lib/assist/assist-model";

/**
 * AI assistance centre — server composition (control room PR J, capability
 * gap map §10). ONE read that COMPOSES the same request-cached, RLS-scoped
 * reads other pages already use and duplicates no source record:
 *
 *  - attention  → getSpineCounts() (request-cached — shared with the bell),
 *                 getWorkerDocumentCentre() derived attention (PR H, worker
 *                 role only) and getFinanceSummary() derived overdue counts
 *                 (PR I, roles that carry the finance module). Each source
 *                 degrades independently to "absent" — never a fake row.
 *  - worker     → buildVerifiedCv() + buildEvidenceReport() — the EXACT
 *                 derivation the evidence-report page performs, condensed.
 *  - org        → the caller's own company's projects (owns_company RLS —
 *                 the planning-page precedent) + one active-assignment count
 *                 read (the project-map precedent). Bounded.
 *  - provider   → getAiRuntimeConfig() (the existing server config wrapper).
 *                 The state/reason travel to the page; a key value never
 *                 exists on the config and nothing here reads process.env.
 *
 * DELIBERATELY ABSENT (gap map §10 gate register): no runAiAgent call, no
 * provider client, no generation of any kind. The provider is unconfigured
 * in production (EXTERNAL_PROVIDER_GATED) and the ai_runs/ai_suggestions
 * audit store is an owner-gated migration — generating without the audit
 * path would violate the programme's own rules, so this slice wires the
 * honest state, not the runtime.
 *
 * INTERNAL ONLY: this layer sends nothing anywhere — no email, no push, no
 * Telegram, no webhook, no outbound call of any kind. Read-only: no insert,
 * no update, no delete, no RPC.
 */

const ORG_ROLES: readonly Role[] = ["company", "agency"];
/** Roles that carry the finance module (mirror of the module registry). */
const FINANCE_ROLES: readonly Role[] = ["company", "agency", "worker"];

export type AssistProjectsState = "ok" | "not-applicable" | "error";

export interface AssistView {
  readonly attention: readonly AttentionItem[];
  /** Worker deterministic summary; null = caller has no worker evidence. */
  readonly workerSummary: WorkerEvidenceSummary | null;
  /** Org deterministic summary rows (empty array = honestly no projects). */
  readonly projects: {
    readonly state: AssistProjectsState;
    readonly rows: readonly AssistProjectRow[];
  };
  readonly provider: AiProviderView;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

/** Worker document attention via the EXISTING PR H composition — only the
 *  derived attention counts travel; any non-ok inventory state → null. */
async function readDocumentAttention() {
  try {
    const centre = await getWorkerDocumentCentre();
    if (centre.inventory.kind !== "ok") return null;
    return centre.inventory.attention;
  } catch {
    return null;
  }
}

/** Derived finance-overdue input via the EXISTING PR I summary read —
 *  needs-migration / signed-out → null (the row is absent, never faked). */
async function readFinanceAttention(): Promise<FinanceAttentionInput | null> {
  try {
    const result = await getFinanceSummary();
    if (result.status !== "ok") return null;
    return { overdueCount: result.summary.overdueCount };
  } catch {
    return null;
  }
}

/** The evidence-report page's own input mapping, reused verbatim so the
 *  assist summary can never disagree with the report it links. */
async function readWorkerSummary(): Promise<WorkerEvidenceSummary | null> {
  try {
    const cvRes = await buildVerifiedCv();
    if (!cvRes.ok) return null;
    const cv = cvRes.cv;
    const supported = cv.tiers.evidence;
    const report = buildEvidenceReport({
      tierCounts: {
        self_declared: cv.tiers.declared.length + cv.declaredClaims.length,
        work_supported: cv.tiers.evidence.length,
        manager_confirmed: cv.tiers.confirmed.length,
        verified: 0,
      },
      supportedSkills: supported,
      unsupportedSkills: [...cv.tiers.declared, ...cv.declaredClaims],
      awaitingConfirmation: supported,
      journalEntries: cv.signals.journalEntries,
      confirmations: cv.signals.managerConfirmations,
      hasWorkNeedContext: false,
    });
    return buildWorkerEvidenceSummary(report);
  } catch {
    return null;
  }
}

/** Org project status rows — the caller's OWN company's live project set
 *  (owns_company RLS, bounded; the planning-page read pattern) plus one
 *  active-assignment count read (the project-map pattern). */
async function readProjectRows(): Promise<{
  state: AssistProjectsState;
  rows: AssistProjectRow[];
}> {
  const companyId = await callerCompanyId();
  if (!companyId) return { state: "not-applicable", rows: [] };

  const supabase = await createClient();
  const res = await asAny(supabase)
    .from("projects")
    .select("id, title, city, status, start_date, end_date")
    .eq("company_id", companyId)
    .in("status", [...ASSIST_PROJECT_STATUSES])
    .order("start_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(ASSIST_PROJECT_READ_LIMIT);
  if (res.error) return { state: "error", rows: [] };

  type Row = {
    id: string;
    title: string | null;
    city: string | null;
    status: string;
    start_date: string | null;
    end_date: string | null;
  };
  const projects = ((res.data ?? []) as Row[]).filter((p) =>
    (ASSIST_PROJECT_STATUSES as readonly string[]).includes(p.status),
  );

  const counts = new Map<string, number>();
  if (projects.length > 0) {
    try {
      const assignRes = await asAny(supabase)
        .from("project_worker_assignments")
        .select("project_id")
        .in(
          "project_id",
          projects.map((p) => p.id),
        )
        .eq("status", "active");
      for (const row of (assignRes.data ?? []) as { project_id: string }[]) {
        counts.set(row.project_id, (counts.get(row.project_id) ?? 0) + 1);
      }
    } catch {
      // keep zeros — honest degradation, never a fabricated team size
    }
  }

  return {
    state: "ok",
    rows: projects.map((p) =>
      buildProjectStatusRow({
        id: p.id,
        title: p.title ?? null,
        city: p.city ?? null,
        status: p.status,
        startDate: p.start_date ?? null,
        endDate: p.end_date ?? null,
        assignedCount: counts.get(p.id) ?? 0,
      }),
    ),
  };
}

/**
 * The full assistance-centre view for one caller. Role gates mirror the
 * module registry: document attention is the worker's own inventory;
 * finance attention follows the finance module's roles; project summaries
 * are org-role reads (the RLS would bound them anyway — the role gate just
 * avoids pointless queries).
 */
export async function getAssistView(role: Role): Promise<AssistView> {
  const [counts, documents, finance, workerSummary, projects] =
    await Promise.all([
      getSpineCounts(),
      role === "worker" ? readDocumentAttention() : Promise.resolve(null),
      FINANCE_ROLES.includes(role)
        ? readFinanceAttention()
        : Promise.resolve(null),
      role === "worker" ? readWorkerSummary() : Promise.resolve(null),
      ORG_ROLES.includes(role)
        ? readProjectRows()
        : Promise.resolve({
            state: "not-applicable" as const,
            rows: [] as AssistProjectRow[],
          }),
    ]);

  return {
    attention: buildAttentionItems({ counts, documents, finance }),
    workerSummary,
    projects,
    provider: buildAiProviderView(getAiRuntimeConfig()),
  };
}
