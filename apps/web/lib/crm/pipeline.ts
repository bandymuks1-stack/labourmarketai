import "server-only";

/**
 * CRM / demand pipeline — server composition (control room PR F, gap map §5).
 *
 * ONE read view over ALL existing demand sources — WITHOUT a second funnel,
 * WITHOUT a new table, WITHOUT touching RLS, WITHOUT any outbound action.
 * This module EXTENDS the two existing read services by composition and adds
 * NO data access of its own:
 *
 *   - `getLeadIntakeOverview()` (lib/sales/lead-intake.ts, §8.14) — leads,
 *     waitlist and operator-state customer_requests, with the seed's own
 *     gating (user-scoped RLS reads; waitlist behind isSuperadmin +
 *     service-role, fenced there) and honest per-source degradation.
 *   - `listCompanyNeedIntakes()` (lib/admin/company-need-intakes.ts,
 *     PR #681) — anonymous public intakes, service-role read behind the
 *     explicit isSuperadmin() check that ALREADY lives in that lib.
 *
 * No new service-role call site exists here (no createAdminClient import,
 * no .from(), no .rpc()) and no mutation of any kind. Degradation semantics
 * are the seeds' own, surfaced per source — a source that cannot be read is
 * reported as unavailable, never as an empty (zero) list.
 *
 * Row window honesty: the seed reads are bounded (50 most recent per source
 * in the sales layer; the full owner queue for public intakes). All counts
 * are computed over these actually-fetched rows and the page says so.
 */

import { getLeadIntakeOverview } from "@/lib/sales/lead-intake";
import { listCompanyNeedIntakes } from "@/lib/admin/company-need-intakes";
import {
  countItemsByStage,
  countItemsBySource,
  customerRequestToItem,
  findPossibleDuplicateIds,
  leadToItem,
  publicIntakeToItem,
  sortPipelineItems,
  waitlistToItem,
  type PipelineItem,
  type PipelineSourceType,
  type PipelineStage,
} from "@/lib/crm/pipeline-model";

/**
 * Honest per-source availability, translated 1:1 from the seed libs' own
 * states (IntakeSection reasons; CompanyNeedIntakeListResult kinds).
 */
export type PipelineSourceState =
  | "ok"
  | "needs_admin_read"
  | "service_key_missing"
  | "needs_migration"
  | "not_admin"
  | "error";

export type PipelineSourceReport = {
  readonly sourceType: PipelineSourceType;
  readonly state: PipelineSourceState;
  /** Rows actually fetched from this source (0 when unavailable). */
  readonly count: number;
};

export type PipelineOverview = {
  readonly sources: readonly PipelineSourceReport[];
  /** Merged queue, newest first, over every READABLE source. */
  readonly items: readonly PipelineItem[];
  readonly stageCounts: Readonly<Record<PipelineStage, number>>;
  readonly sourceCounts: Readonly<Record<PipelineSourceType, number>>;
  /** Display-only "possible duplicate" ids (shared company name / email). */
  readonly duplicateIds: ReadonlySet<string>;
};

function sectionState(reason: "needs_admin_read" | "service_key_missing" | "error"): PipelineSourceState {
  return reason;
}

/**
 * Compose the operator pipeline overview. Superadmin-gated exactly as the
 * seeds are (page-level requireSuperadmin + the seeds' internal gates) —
 * nothing is loosened here.
 */
export async function getPipelineOverview(): Promise<PipelineOverview> {
  const [intake, publicIntakes] = await Promise.all([
    getLeadIntakeOverview(),
    listCompanyNeedIntakes(),
  ]);

  const items: PipelineItem[] = [];
  const sources: PipelineSourceReport[] = [];

  // customer_requests (operator-review states; drafts and typed help
  // requests are excluded by the seed read itself — the help queue is its
  // own internal surface, not demand).
  if (intake.requests.readable) {
    const rows = intake.requests.rows
      .map((r) =>
        customerRequestToItem({
          id: r.id,
          title: r.title,
          status: r.status,
          country: r.country,
          createdAt: r.createdAt,
        }),
      )
      .filter((x): x is PipelineItem => x !== null);
    items.push(...rows);
    sources.push({
      sourceType: "customer_request",
      state: "ok",
      count: rows.length,
    });
  } else {
    sources.push({
      sourceType: "customer_request",
      state: sectionState(intake.requests.reason),
      count: 0,
    });
  }

  // company_need_public_intakes (anonymous public funnel — deny-all RLS
  // untouched; read via the seed lib's own service-role + isSuperadmin gate).
  if (publicIntakes.kind === "ok") {
    const rows = publicIntakes.rows.map((r) =>
      publicIntakeToItem({
        id: r.id,
        status: r.status,
        companyName: r.companyName,
        contactEmail: r.contactEmail,
        country: r.country,
        createdAt: r.createdAt,
      }),
    );
    items.push(...rows);
    sources.push({
      sourceType: "public_intake",
      state: "ok",
      count: rows.length,
    });
  } else {
    sources.push({
      sourceType: "public_intake",
      state:
        publicIntakes.kind === "needs-migration"
          ? "needs_migration"
          : publicIntakes.kind === "not-admin"
            ? "not_admin"
            : "error",
      count: 0,
    });
  }

  // leads (dormant /api/leads funnel).
  if (intake.leads.readable) {
    const rows = intake.leads.rows.map((r) =>
      leadToItem({
        id: r.id,
        status: r.status,
        email: r.email,
        fullName: r.fullName,
        companyName: r.companyName,
        country: r.country,
        createdAt: r.createdAt,
      }),
    );
    items.push(...rows);
    sources.push({ sourceType: "lead", state: "ok", count: rows.length });
  } else {
    sources.push({
      sourceType: "lead",
      state: sectionState(intake.leads.reason),
      count: 0,
    });
  }

  // waitlist signups (no stored lifecycle — entry stage, storedStatus null).
  if (intake.waitlist.readable) {
    const rows = intake.waitlist.rows.map((r) =>
      waitlistToItem({ id: r.id, email: r.email, createdAt: r.createdAt }),
    );
    items.push(...rows);
    sources.push({ sourceType: "waitlist", state: "ok", count: rows.length });
  } else {
    sources.push({
      sourceType: "waitlist",
      state: sectionState(intake.waitlist.reason),
      count: 0,
    });
  }

  const sorted = sortPipelineItems(items);
  return {
    sources,
    items: sorted,
    stageCounts: countItemsByStage(sorted),
    sourceCounts: countItemsBySource(sorted),
    duplicateIds: findPossibleDuplicateIds(sorted),
  };
}
