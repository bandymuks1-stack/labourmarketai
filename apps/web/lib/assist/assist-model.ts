import type {
  AiDisabledReason,
  AiProviderKind,
  AiRuntimeConfig,
  AiRuntimeState,
} from "@/lib/ai/runtime/config-core";
import { moduleForSignal } from "@/lib/dashboard/activity-centre";
import {
  inventoryHref,
  type DocumentAttention,
} from "@/lib/documents/document-centre-model";
import {
  SPINE_SIGNALS,
  type SpineCounts,
} from "@/lib/notifications/spine-signals";
import type { EvidenceReport } from "@/lib/reports/evidence-report";

/**
 * AI assistance centre — pure model (control room PR J, capability gap map
 * §10). No DB, no IO, no LLM — the server composition (assist.ts) fetches,
 * the page renders.
 *
 * HONESTY CONTRACT (guard: lib/guards/assist-centre.test.ts):
 *
 *  - "What needs my attention" is DETERMINISTIC system status computed from
 *    the caller's own real records: the notification spine (the same counts
 *    the bell shows), the derived document-expiry attention (PR H) and the
 *    derived finance-overdue flag (PR I). Every item names its data source
 *    and links the REAL surface that resolves it. No score, no ranking
 *    model, no generated text.
 *  - The deterministic summaries are assembled from real fields by fixed
 *    rules (evidence-report tiers; the caller's own project rows) with the
 *    source list attached. Nothing here is produced by a language model.
 *  - The AI provider view exposes the runtime's honest state
 *    (disabled/mock/live + reason) from the existing config-core resolver.
 *    The key VALUE never exists on the config and never reaches this view.
 *  - NOTHING in this slice calls runAiAgent or any provider. Two gates are
 *    deliberately open: the provider is unconfigured in production
 *    (EXTERNAL_PROVIDER_GATED) and the ai_runs/ai_suggestions audit store is
 *    an owner-gated migration — generating without the audit path would
 *    violate the programme's own rules (gap map §10 gate register).
 */

/* ------------------------------------------------------------------ */
/* Section 1 — "What needs my attention" (deterministic composition)   */
/* ------------------------------------------------------------------ */

/** The real data source an attention row is computed from — rendered as a
 *  visible source chip (assist.sources.*). */
export type AttentionSourceKey =
  | "notificationSpine"
  | "workerDocuments"
  | "financeRecords";

export interface AttentionItem {
  /** Stable row id (testids, React keys). */
  readonly id: string;
  /** Full i18n path of the row label. Spine rows REUSE the bell's own copy
   *  (auth.notifications.types.*) — never a parallel phrasing. */
  readonly labelKey: string;
  /** The REAL surface that resolves the item (guard-pinned: never empty,
   *  always an in-app dashboard route). */
  readonly href: string;
  /** Real derived count (> 0 — zero rows are not attention). */
  readonly count: number;
  readonly sourceKey: AttentionSourceKey;
  /** For spine rows: the source module's existing label key (registry
   *  linkage — one truth for module naming). */
  readonly moduleLabelKey: string | null;
}

/** Derived-overdue finance state as the attention composer consumes it.
 *  null = finance is not readable for this caller (role without the finance
 *  module, signed out, or the owner-gated migration is unapplied) — the row
 *  is simply absent, never faked. */
export interface FinanceAttentionInput {
  readonly overdueCount: number;
}

export interface AttentionInputs {
  readonly counts: SpineCounts;
  /** null = no worker document inventory readable for this caller. */
  readonly documents: DocumentAttention | null;
  /** null = finance records not readable for this caller. */
  readonly finance: FinanceAttentionInput | null;
}

/** The one place the derived finance-overdue filter URL is written. */
export const FINANCE_OVERDUE_HREF = "/dashboard/finance?status=overdue";

/**
 * Compose the ordered attention answer from real inputs. Order is
 * deterministic: spine catalogue order first (people waiting on you outrank
 * passive state — the bell's own ladder), then document expiry attention,
 * then overdue finance records. A row exists ONLY while its real count is
 * positive, so the answer clears itself as the underlying state resolves.
 */
export function buildAttentionItems(
  inputs: AttentionInputs,
): readonly AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const s of SPINE_SIGNALS) {
    const count = s.count(inputs.counts);
    if (count <= 0) continue;
    items.push({
      id: `spine-${s.id}`,
      labelKey: `auth.notifications.types.${s.type}`,
      href: s.href,
      count,
      sourceKey: "notificationSpine",
      moduleLabelKey: moduleForSignal(s.id)?.labelKey ?? null,
    });
  }

  const docs = inputs.documents;
  if (docs) {
    if (docs.expiring > 0) {
      items.push({
        id: "doc-expiring",
        labelKey: "assist.attention.docExpiring",
        href: inventoryHref({ status: "expiring" }),
        count: docs.expiring,
        sourceKey: "workerDocuments",
        moduleLabelKey: null,
      });
    }
    if (docs.missing > 0) {
      items.push({
        id: "doc-missing",
        labelKey: "assist.attention.docMissing",
        href: inventoryHref({ status: "missing" }),
        count: docs.missing,
        sourceKey: "workerDocuments",
        moduleLabelKey: null,
      });
    }
    if (docs.reviewNeeded > 0) {
      items.push({
        id: "doc-review",
        labelKey: "assist.attention.docReview",
        href: inventoryHref({}),
        count: docs.reviewNeeded,
        sourceKey: "workerDocuments",
        moduleLabelKey: null,
      });
    }
  }

  if (inputs.finance && inputs.finance.overdueCount > 0) {
    items.push({
      id: "finance-overdue",
      labelKey: "assist.attention.financeOverdue",
      href: FINANCE_OVERDUE_HREF,
      count: inputs.finance.overdueCount,
      sourceKey: "financeRecords",
      moduleLabelKey: null,
    });
  }

  return items;
}

/* ------------------------------------------------------------------ */
/* Section 2 — deterministic summaries (real fields, sources attached)  */
/* ------------------------------------------------------------------ */

/** Worker profile/evidence summary — real counts lifted from the evidence
 *  report's own sections (PR #479 projection), never recomputed twice. */
export interface WorkerEvidenceSummary {
  readonly totalSkills: number;
  readonly workSupported: number;
  readonly confirmed: number;
  readonly journalEntries: number;
  readonly confirmations: number;
  /** The full report the summary condenses. */
  readonly href: string;
  /** assist.sources.* leaves — the visible source list. */
  readonly sourceKeys: readonly string[];
}

export const EVIDENCE_REPORT_HREF = "/dashboard/reports/evidence";

export const WORKER_SUMMARY_SOURCE_KEYS = [
  "workerSkills",
  "workJournal",
  "managerConfirmations",
] as const;

export function buildWorkerEvidenceSummary(
  report: EvidenceReport,
): WorkerEvidenceSummary {
  const byKey = new Map(report.sections.map((s) => [s.key, s]));
  const profile = byKey.get("profileEvidence");
  const entries = byKey.get("workEntrySummary");
  return {
    totalSkills: report.totalSkills,
    workSupported: profile?.metrics.workSupported ?? 0,
    confirmed: profile?.metrics.confirmed ?? 0,
    journalEntries: entries?.metrics.entries ?? 0,
    confirmations: entries?.metrics.confirmations ?? 0,
    href: EVIDENCE_REPORT_HREF,
    sourceKeys: WORKER_SUMMARY_SOURCE_KEYS,
  };
}

/** Bounded org project read (the planning-page precedent — same table, same
 *  owns_company RLS). Closed projects are history and stay on /projects. */
export const ASSIST_PROJECT_READ_LIMIT = 50;
export const ASSIST_PROJECT_STATUSES = ["draft", "live", "paused"] as const;

export const ORG_SUMMARY_SOURCE_KEYS = ["projects", "assignments"] as const;

export interface AssistProjectRowInput {
  readonly id: string;
  readonly title: string | null;
  readonly city: string | null;
  /** Source-native lifecycle value (draft/live/paused) — shown verbatim. */
  readonly status: string;
  readonly startDate: string | null;
  readonly endDate: string | null;
  /** Real active-assignment count (0 is honest). */
  readonly assignedCount: number;
}

export interface AssistProjectRow extends AssistProjectRowInput {
  /** Full i18n path of the status label — REUSES the planning surface's own
   *  project-status copy (one naming source per lifecycle). */
  readonly statusKey: string;
  /** The project's real operations centre (PR G). */
  readonly href: string;
}

export function buildProjectStatusRow(
  input: AssistProjectRowInput,
): AssistProjectRow {
  return {
    ...input,
    statusKey: `planning.projectStatus.${input.status}`,
    href: `/dashboard/projects/${input.id}/operations`,
  };
}

/* ------------------------------------------------------------------ */
/* Section 3 — honest AI provider state (from config-core, never a key) */
/* ------------------------------------------------------------------ */

/** What the page may show about the runtime: state + reason always; the
 *  provider/model ids only when a non-disabled mode is actually configured.
 *  There is deliberately NO key field of any kind on this view — config-core
 *  itself only ever carries a presence flag, and even that flag is not
 *  forwarded here (the disabled reason already tells the honest story). */
export interface AiProviderView {
  readonly state: AiRuntimeState;
  readonly reason: AiDisabledReason;
  readonly provider: AiProviderKind | null;
  readonly model: string | null;
}

export function buildAiProviderView(
  cfg: Pick<AiRuntimeConfig, "state" | "reason" | "provider" | "model">,
): AiProviderView {
  return {
    state: cfg.state,
    reason: cfg.reason,
    // A provider/model id is claimed ONLY when a live provider is really
    // configured — mock is a deterministic built-in and names no vendor;
    // disabled claims nothing provider-shaped at all.
    provider: cfg.state === "live" ? cfg.provider : null,
    model: cfg.state === "live" ? cfg.model : null,
  };
}
