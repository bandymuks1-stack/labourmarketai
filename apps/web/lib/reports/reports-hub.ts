import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Role } from "@/lib/auth/actions";
import { listOwnCustomerRequests } from "@/lib/buyer/customer-requests";
import {
  getOrgDemandRollup,
  type OrgDemandRollup,
} from "@/lib/company/org-demand-rollup";
import { buildVerifiedCv } from "@/lib/cv-export/verified-cv";
import {
  getOrgDocumentCentre,
  getWorkerDocumentCentre,
  type WorkProofSummary,
} from "@/lib/documents/document-centre";
import { getFinanceSummary } from "@/lib/finance/finance";
import { getJournalWindowReport } from "@/lib/journal/journal-window-report";
import { countReviewablePendingEntries } from "@/lib/journal/reviewable-count";
import { callerCompanyId } from "@/lib/projects/projects";
import { buildEvidenceReport } from "@/lib/reports/evidence-report";
import { createClient } from "@/lib/supabase/server";
import {
  OPEN_WORK_TASK_STATUSES,
  WORK_TASK_STATUSES,
  type WorkTaskStatus,
} from "@/lib/tasks/task-model";
import { listMyTasks } from "@/lib/tasks/tasks";

/**
 * Reports hub — server composition (control room PR K, capability gap map
 * §12). ONE role-specific index over report data the caller can already read,
 * composed from the SAME RLS-scoped reads the pages use. Real data only:
 *
 *  worker  → evidence figures via buildVerifiedCv() + buildEvidenceReport()
 *            (the EXACT evidence-report derivation, PR #479) and the OWN
 *            journal head counts via getWorkerDocumentCentre() (PR H).
 *  org     → own demand requests (listOwnCustomerRequests), own projects
 *            (owns_company RLS, the assist-page read pattern), own tasks
 *            (listMyTasks — degrades until D2), the consent-gated org docs
 *            aggregate (getOrgDocumentCentre) and the finance summary
 *            (getFinanceSummary — degrades until I2).
 *
 * HONESTY contract: no benchmark, no score, no projection, no "real-time"
 * claim. Every figure the page renders carries a BASIS label (reports.basis.*)
 * naming the calculation source. Missing data degrades to an explicit
 * unavailable state — never a fabricated zero presented as truth.
 *
 * INTERNAL ONLY: read-only (no insert/update/delete/upsert; the only RPC is
 * the already-applied consent aggregate inside getOrgDocumentCentre). No
 * admin client. No outbound call of any kind.
 */

const PROJECT_READ_LIMIT = 100;
/** The applied projects model's status set (the assist/planning precedent). */
// W11: `completed` joins the set. Before the lifecycle existed no project
// could leave `draft`, so omitting a terminal status cost nothing. Now that a
// project can really finish, leaving it out would make the hub UNDERCOUNT the
// company's work — the report would quietly stop matching reality.
export const REPORT_PROJECT_STATUSES = ["draft", "live", "paused", "completed"] as const;
export type ReportProjectStatus = (typeof REPORT_PROJECT_STATUSES)[number];

/** customer_requests statuses that still need attention/action. */
export const OPEN_DEMAND_STATUSES = [
  "draft",
  "submitted",
  "in_review",
  "needs_followup",
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export interface WorkerEvidenceFigures {
  readonly totalSkills: number;
  readonly workSupported: number;
  readonly confirmed: number;
  readonly journalEntries: number;
  readonly confirmations: number;
}

export interface WorkerReportsView {
  readonly kind: "worker";
  /** null = the caller has no worker evidence yet (honest empty state). */
  readonly evidence: WorkerEvidenceFigures | null;
  /** Own journal head counts (null members = counts not readable). */
  readonly activity: WorkProofSummary;
}

export type SectionState = "ok" | "needs-migration" | "unavailable";

/** The org rollup's ok-variant, reused so the two can never drift. */
type OrgRollup = Extract<OrgDemandRollup, { kind: "ok" }>;

export interface OrgReportsView {
  readonly kind: "org";
  /**
   * W8/W14-6: two honest scopes, never both. `ok` = the ORGANIZATION rollup
   * (org demand spine, `getOrgDemandRollup`) for a resolved org context;
   * `own` = the caller's OWN requests (the pre-spine read) when no org
   * context resolves — a personal customer's demand is their own
   * `customer_requests`. The basis label names which scope is rendered, so
   * the two counts can never be confused for one another.
   */
  readonly demand:
    | {
        readonly state: "ok";
        readonly open: number;
        readonly total: number;
        readonly structured: number;
        readonly shortlisted: number;
        readonly interest: OrgRollup["interest"] | null;
        readonly timeToFill: OrgRollup["timeToFill"] | null;
      }
    | { readonly state: "own"; readonly open: number; readonly total: number }
    | { readonly state: Exclude<SectionState, "ok"> };
  readonly projects:
    | {
        readonly state: "ok";
        readonly byStatus: Readonly<Record<ReportProjectStatus, number>>;
        readonly total: number;
      }
    | { readonly state: Exclude<SectionState, "ok"> };
  readonly tasks:
    | {
        readonly state: "ok";
        readonly open: number;
        readonly byStatus: Readonly<Record<WorkTaskStatus, number>>;
        readonly total: number;
      }
    | { readonly state: Exclude<SectionState, "ok"> };
  readonly documents:
    | {
        readonly state: "ok";
        readonly workers: number;
        readonly expiring: number;
        readonly attention: number;
      }
    | { readonly state: "unavailable" };
  readonly finance:
    | {
        readonly state: "ok";
        readonly overdueCount: number;
        readonly totalCount: number;
      }
    | { readonly state: Exclude<SectionState, "ok"> };
  /**
   * V8 GAP 5: work-journal activity in the org's engagements over the last 7
   * calendar days (UTC, inclusive of today) — the windowed-report lib's week
   * window, so the hub figure and /dashboard/reports/journal can never
   * disagree. `awaitingReview` is the CURRENT reviewable queue (not windowed);
   * `confirmed` counts the window's entries that carry a manager confirmation.
   */
  readonly journal:
    | {
        readonly state: "ok";
        readonly recorded: number;
        readonly awaitingReview: number;
        readonly confirmed: number;
      }
    | { readonly state: Exclude<SectionState, "ok"> };
}

export type ReportsView = WorkerReportsView | OrgReportsView;

/** The evidence-report page's own input mapping, reused verbatim so the hub
 *  figures can never disagree with the report they link. */
async function readWorkerEvidence(): Promise<WorkerEvidenceFigures | null> {
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
      unsupportedSkills: [
        ...cv.tiers.declared,
        ...cv.declaredClaims.map((c) => c.label),
      ],
      awaitingConfirmation: supported,
      journalEntries: cv.signals.journalEntries,
      confirmations: cv.signals.managerConfirmations,
      hasWorkNeedContext: false,
    });
    const byKey = Object.fromEntries(report.sections.map((s) => [s.key, s]));
    return {
      totalSkills: report.totalSkills,
      workSupported: byKey.profileEvidence?.metrics.workSupported ?? 0,
      confirmed: byKey.profileEvidence?.metrics.confirmed ?? 0,
      journalEntries: byKey.workEntrySummary?.metrics.entries ?? 0,
      confirmations: byKey.workEntrySummary?.metrics.confirmations ?? 0,
    };
  } catch {
    return null;
  }
}

async function getWorkerReportsView(): Promise<WorkerReportsView> {
  const [evidence, centre] = await Promise.all([
    readWorkerEvidence(),
    getWorkerDocumentCentre().catch(() => null),
  ]);
  return {
    kind: "worker",
    evidence,
    activity: centre?.workProof ?? {
      journalEntryCount: null,
      journalPhotoCount: null,
    },
  };
}

async function readDemandCounts(): Promise<OrgReportsView["demand"]> {
  try {
    // W8/W14-6: org scope first. A resolved org context gets the rollup over
    // organization-attributed rows (spine `20260806200000`); only when NO org
    // context resolves (a personal customer) does the section fall back to
    // the caller's OWN requests — and it says so via its basis label.
    const rollup = await getOrgDemandRollup();
    if (rollup.kind === "ok") {
      return {
        state: "ok",
        open: rollup.open,
        total: rollup.total,
        structured: rollup.structured,
        shortlisted: rollup.shortlisted,
        interest: rollup.interest,
        timeToFill: rollup.timeToFill,
      };
    }
    if (rollup.kind === "needs-migration") return { state: "needs-migration" };
    if (rollup.kind === "unavailable") return { state: "unavailable" };
    // no-company-context → the personal-scope fallback.
    const result = await listOwnCustomerRequests();
    if (result.kind === "needs-migration") return { state: "needs-migration" };
    if (result.kind !== "ok") return { state: "unavailable" };
    const open = result.rows.filter((r) =>
      (OPEN_DEMAND_STATUSES as readonly string[]).includes(r.status),
    ).length;
    return { state: "own", open, total: result.rows.length };
  } catch {
    return { state: "unavailable" };
  }
}

/** Own-company project status counts (owns_company RLS; bounded — the
 *  assist-page read pattern). No company → unavailable, never a fake zero. */
async function readProjectCounts(): Promise<OrgReportsView["projects"]> {
  try {
    const companyId = await callerCompanyId();
    if (!companyId) return { state: "unavailable" };
    const supabase = await createClient();
    const res = await asAny(supabase)
      .from("projects")
      .select("id, status")
      .eq("company_id", companyId)
      .limit(PROJECT_READ_LIMIT);
    if (res.error) return { state: "unavailable" };
    const byStatus: Record<ReportProjectStatus, number> = {
      draft: 0,
      live: 0,
      paused: 0,
      completed: 0,
    };
    let total = 0;
    for (const row of (res.data ?? []) as { status: string }[]) {
      if ((REPORT_PROJECT_STATUSES as readonly string[]).includes(row.status)) {
        byStatus[row.status as ReportProjectStatus] += 1;
        total += 1;
      }
    }
    return { state: "ok", byStatus, total };
  } catch {
    return { state: "unavailable" };
  }
}

async function readTaskCounts(): Promise<OrgReportsView["tasks"]> {
  try {
    const result = await listMyTasks();
    if (result.status === "needs-migration") return { state: "needs-migration" };
    if (result.status !== "ok") return { state: "unavailable" };
    const byStatus = Object.fromEntries(
      WORK_TASK_STATUSES.map((s) => [s, 0]),
    ) as Record<WorkTaskStatus, number>;
    for (const task of result.tasks) byStatus[task.status] += 1;
    const open = OPEN_WORK_TASK_STATUSES.reduce(
      (n, s) => n + byStatus[s],
      0,
    );
    return { state: "ok", open, byStatus, total: result.tasks.length };
  } catch {
    return { state: "unavailable" };
  }
}

async function readOrgDocumentCounts(): Promise<OrgReportsView["documents"]> {
  try {
    const centre = await getOrgDocumentCentre();
    if (centre.kind !== "ok") return { state: "unavailable" };
    return {
      state: "ok",
      workers: centre.summary.workers,
      expiring: centre.summary.expiring,
      attention: centre.summary.attention,
    };
  } catch {
    return { state: "unavailable" };
  }
}

async function readFinanceCounts(): Promise<OrgReportsView["finance"]> {
  try {
    const result = await getFinanceSummary();
    if (result.status === "needs-migration") return { state: "needs-migration" };
    if (result.status !== "ok") return { state: "unavailable" };
    return {
      state: "ok",
      overdueCount: result.summary.overdueCount,
      totalCount: result.summary.totalCount,
    };
  } catch {
    return { state: "unavailable" };
  }
}

/** Org journal activity, last 7 UTC calendar days. Reuses the windowed-report
 *  read (same org resolver, same minimised query) + the existing reviewable
 *  count — no second query truth. Any failure degrades to an explicit
 *  unavailable state, never a fabricated zero. */
async function readJournalCounts(): Promise<OrgReportsView["journal"]> {
  try {
    const report = await getJournalWindowReport("week");
    if (!report.applied) return { state: "unavailable" };
    const awaitingReview = await countReviewablePendingEntries();
    return {
      state: "ok",
      recorded: report.totals.entries,
      awaitingReview,
      confirmed: report.totals.confirmed,
    };
  } catch {
    return { state: "unavailable" };
  }
}

async function getOrgReportsView(): Promise<OrgReportsView> {
  const [demand, projects, tasks, documents, finance, journal] =
    await Promise.all([
      readDemandCounts(),
      readProjectCounts(),
      readTaskCounts(),
      readOrgDocumentCounts(),
      readFinanceCounts(),
      readJournalCounts(),
    ]);
  return { kind: "org", demand, projects, tasks, documents, finance, journal };
}

/**
 * The role-specific reports view. Worker → evidence + activity; org roles
 * (company/agency) and customer → the org view (a customer's demand rows are
 * their own customer_requests; the other sections degrade honestly).
 */
export async function getReportsView(role: Role): Promise<ReportsView> {
  if (role === "worker") return getWorkerReportsView();
  return getOrgReportsView();
}
