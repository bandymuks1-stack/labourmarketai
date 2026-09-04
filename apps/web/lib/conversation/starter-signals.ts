import "server-only";

import { createClient } from "@/lib/supabase/server";
import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import { getOwnedCompanyById } from "@/lib/company/company-setup";
import { getActiveOrganizationContext } from "@/lib/company/active-organization";
import { readOrganizationCapabilities } from "@/lib/organizations/capability-read";
import { organizationCapabilities } from "@/lib/organizations/capabilities";
import { isEducationFirstWorkspace } from "@/lib/conversation/education-home";
import { listSharedRequestsForAgency, listAgencyOfferProgress } from "@/lib/agency/bridge-read";
import { ROLLUP_OPEN_DEMAND_STATUSES } from "@/lib/company/org-demand-rollup";
import {
  UNKNOWN_FACTS,
  type CompanyStarterFacts,
  type Fact,
  type StarterSignals,
} from "@/lib/conversation/starters";

/**
 * STARTER SIGNALS — the server half of `lib/conversation/starters.ts`.
 *
 * Reads, under the caller's own RLS, the few counts that decide which NEXT
 * REAL STEP each capability track offers: open needs, projects, roster,
 * client connections, shared requests, proposals, learners, programmes. Every
 * read is bounded (`head` counts or the existing bridge RPCs), independent
 * (its own try/catch) and degrades to `null` — a degraded read contributes
 * nothing, never a fabricated "0" that would suggest a first step already
 * taken or not taken.
 *
 * Same canonical resolvers the company page and the agency chat adapter use
 * (membership-validated employer context → creator-or-governing-member
 * company read → `organization_roles`); no second projection of the world.
 */
export interface WorkspaceStarterContext {
  readonly signals: StarterSignals;
  /** `companies.company_type === 'staffing_agency'` for the ACTIVE company. */
  readonly agencyWorkspace: boolean;
  /** `isEducationFirstWorkspace` over the canonical capability read. */
  readonly educationWorkspace: boolean;
  /** The active organization's display name — the "on whose behalf" line. */
  readonly organizationName: string | null;
  /** The active organization's id (membership-validated) — for reads that
   *  are keyed by organization (learners, programmes). */
  readonly organizationId: string | null;
}

const PERSON_SIGNALS: StarterSignals = {
  identity: "person",
  capabilities: [],
  staffingAgency: false,
  educationFirst: false,
  facts: UNKNOWN_FACTS,
  learnerLinked: false,
};

export function personStarterContext(learnerLinked: boolean): WorkspaceStarterContext {
  return {
    signals: { ...PERSON_SIGNALS, learnerLinked },
    agencyWorkspace: false,
    educationWorkspace: false,
    organizationName: null,
    organizationId: null,
  };
}

/** Company identity: resolve the active workspace's capabilities and facts. */
export async function loadCompanyStarterContext(): Promise<WorkspaceStarterContext> {
  const fallback: WorkspaceStarterContext = {
    signals: { ...PERSON_SIGNALS, identity: "company" },
    agencyWorkspace: false,
    educationWorkspace: false,
    organizationName: null,
    organizationId: null,
  };
  let companyId: string | null = null;
  let organizationId: string | null = null;
  let organizationName: string | null = null;
  try {
    const ctx = await resolveEmployerCompanyContext();
    if (ctx.kind === "ok") {
      companyId = ctx.companyId;
      organizationId = ctx.organizationId;
      organizationName = ctx.organizationName?.trim() || null;
    }
  } catch {
    /* degraded: the plain company greeting */
  }
  if (!companyId || !organizationId) return fallback;

  const [staffingAgency, capabilities, legacyType] = await Promise.all([
    safe(async () => {
      const company = await getOwnedCompanyById(companyId!);
      return company.kind === "ok" && company.row?.companyType === "staffing_agency";
    }, false),
    safe(() => readOrganizationCapabilities(organizationId!), [] as readonly string[]),
    safe(async () => {
      const org = await getActiveOrganizationContext();
      return org.activeOrganization?.organizationType ?? null;
    }, null as string | null),
  ]);
  const held = organizationCapabilities({ roleSlugs: capabilities, legacyType });
  const educationFirst = isEducationFirstWorkspace({ roleSlugs: capabilities, legacyType });
  const hasEducation = held.includes("training_provider");

  const supabase = await createClient();
  const count = async (build: (c: ReturnType<typeof asAny>) => Promise<{ count: number | null; error: unknown }>): Promise<Fact> => {
    try {
      const res = await build(asAny(supabase));
      if (res.error) return null;
      return typeof res.count === "number" ? res.count : null;
    } catch {
      return null;
    }
  };

  const [openDemands, projects, roster, connActive, connPending, shared, proposals, learners, programmes] =
    await Promise.all([
      count((c) =>
        c
          .from("customer_requests")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .in("status", [...ROLLUP_OPEN_DEMAND_STATUSES]),
      ),
      count((c) =>
        c.from("projects").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
      ),
      count((c) =>
        c
          .from("company_workers")
          .select("worker_id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("status", "active"),
      ),
      staffingAgency
        ? count((c) =>
            c
              .from("agency_client_connections")
              .select("id", { count: "exact", head: true })
              .eq("agency_company_id", companyId)
              .eq("status", "active"),
          )
        : Promise.resolve<Fact>(null),
      staffingAgency
        ? count((c) =>
            c
              .from("agency_client_connections")
              .select("id", { count: "exact", head: true })
              .eq("agency_company_id", companyId)
              .eq("status", "pending"),
          )
        : Promise.resolve<Fact>(null),
      staffingAgency
        ? safe(async () => {
            const res = await listSharedRequestsForAgency();
            return res.kind === "ok" ? res.rows.length : null;
          }, null as Fact)
        : Promise.resolve<Fact>(null),
      staffingAgency
        ? safe(async () => {
            const res = await listAgencyOfferProgress();
            return res.kind === "ok" ? res.rows.length : null;
          }, null as Fact)
        : Promise.resolve<Fact>(null),
      hasEducation
        ? count((c) =>
            c
              .from("engagement_contexts")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", organizationId)
              .eq("relationship_slug", "student")
              .eq("status", "active"),
          )
        : Promise.resolve<Fact>(null),
      hasEducation
        ? count((c) =>
            c
              .from("education_programs")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", organizationId)
              .is("archived_at", null),
          )
        : Promise.resolve<Fact>(null),
    ]);

  const facts: CompanyStarterFacts = {
    openDemands,
    projects,
    roster,
    clientConnectionsActive: connActive,
    clientConnectionsPending: connPending,
    sharedRequests: shared,
    proposals,
    learnersActive: learners,
    programmes,
  };

  return {
    signals: {
      identity: "company",
      capabilities: held,
      staffingAgency,
      educationFirst,
      facts,
      learnerLinked: false,
    },
    agencyWorkspace: staffingAgency,
    educationWorkspace: educationFirst,
    organizationName,
    organizationId,
  };
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(v: unknown): any {
  return v;
}
