import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperadmin } from "@/lib/auth/superadmin";

/**
 * Sales / lead-intake read service (product-tree branch 23, train §8.14).
 *
 * READ-ONLY. Surfaces the EXISTING intake data to the superadmin operator
 * on the EXISTING admin control room — no new dashboard, no new route, no
 * CRM writes, no lead scoring, no outbound contact of any kind:
 *
 *   - `leads`            — the dormant /api/leads funnel table (0001).
 *                          Read through the user-scoped client; the
 *                          `leads_admin` is_admin() RLS policy allows the
 *                          admin SELECT. 42P01/42501 probe → honest
 *                          "not readable yet" state.
 *   - `waitlist`         — landing signups (0005). BY DESIGN the table has
 *                          no authenticated read policy (anon INSERT only,
 *                          reads restricted to service_role), so a
 *                          user-scoped read would silently show zero rows
 *                          — a lie. Instead the read uses the service-role
 *                          client, ONLY after an explicit isSuperadmin()
 *                          re-check (the admin page is already
 *                          requireSuperadmin-gated; this is defense in
 *                          depth because service role bypasses RLS). When
 *                          the service key is not configured the section
 *                          degrades honestly to "service_key_missing".
 *                          This wagon writes NO migration — adding an
 *                          admin read policy stays a separate owner-gated
 *                          decision.
 *   - `customer_requests` — submitted demand in its operator-review states
 *                          (submitted / in_review / needs_followup), read
 *                          through the user-scoped client (0028 RLS:
 *                          profile_id = auth.uid() OR is_admin()).
 *
 * PII: lead/waitlist emails are returned ONLY from here and rendered ONLY
 * on the requireSuperadmin-gated control room. Nothing in this layer
 * writes, sends, or copies an email anywhere else.
 */

import type {
  IntakeHelpRequestRow,
  IntakeLeadRow,
  IntakeRequestRow,
  IntakeSection,
  IntakeWaitlistRow,
  LeadIntakeOverview,
} from "@/lib/sales/lead-intake-model";
import { INTAKE_REQUEST_STATUSES } from "@/lib/sales/lead-intake-model";

const RELATION_NOT_FOUND_CODE = "42P01";
const PERMISSION_DENIED_CODE = "42501";
const UNDEFINED_COLUMN_CODE = "42703";
const ROW_LIMIT = 50;

const LEADS_SELECT =
  "id, source, email, full_name, company_name, country, intent, status, created_at";
const WAITLIST_SELECT = "id, email, source, locale, created_at";
const REQUESTS_SELECT =
  "id, title, status, profile_id, role_or_work_type, country, created_at";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

function isNotReadableCode(code: string | undefined): boolean {
  return (
    code === RELATION_NOT_FOUND_CODE ||
    code === PERMISSION_DENIED_CODE ||
    code === UNDEFINED_COLUMN_CODE
  );
}

async function readLeads(
  supabase: SupabaseClient,
): Promise<IntakeSection<IntakeLeadRow>> {
  const res = await asAny(supabase)
    .from("leads")
    .select(LEADS_SELECT)
    .order("created_at", { ascending: false })
    .limit(ROW_LIMIT);
  if (res.error) {
    return {
      readable: false,
      reason: isNotReadableCode(res.error.code) ? "needs_admin_read" : "error",
    };
  }
  type Row = {
    id: string;
    source: string | null;
    email: string | null;
    full_name: string | null;
    company_name: string | null;
    country: string | null;
    intent: string | null;
    status: string | null;
    created_at: string;
  };
  return {
    readable: true,
    rows: ((res.data ?? []) as Row[]).map((r) => ({
      id: r.id,
      source: r.source,
      email: r.email,
      fullName: r.full_name,
      companyName: r.company_name,
      country: r.country,
      intent: r.intent,
      status: r.status,
      createdAt: r.created_at,
    })),
  };
}

async function readWaitlist(): Promise<IntakeSection<IntakeWaitlistRow>> {
  // Defense in depth: service role bypasses RLS, so re-check the admin gate
  // here even though the only caller is the requireSuperadmin-gated page.
  if (!(await isSuperadmin())) {
    return { readable: false, reason: "needs_admin_read" };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let admin: any;
  try {
    admin = createAdminClient();
  } catch {
    // requireSupabaseServiceEnv throws when SUPABASE_SERVICE_ROLE_KEY is
    // not configured — honest "not connected in this environment" state.
    return { readable: false, reason: "service_key_missing" };
  }
  const res = await admin
    .from("waitlist")
    .select(WAITLIST_SELECT)
    .order("created_at", { ascending: false })
    .limit(ROW_LIMIT);
  if (res.error) {
    return {
      readable: false,
      reason: isNotReadableCode(res.error.code) ? "needs_admin_read" : "error",
    };
  }
  type Row = {
    id: string;
    email: string;
    source: string;
    locale: string | null;
    created_at: string;
  };
  return {
    readable: true,
    rows: ((res.data ?? []) as Row[]).map((r) => ({
      id: r.id,
      email: r.email,
      source: r.source,
      locale: r.locale,
      createdAt: r.created_at,
    })),
  };
}

async function readRequests(
  supabase: SupabaseClient,
): Promise<IntakeSection<IntakeRequestRow>> {
  const res = await asAny(supabase)
    .from("customer_requests")
    .select(REQUESTS_SELECT)
    .in("status", [...INTAKE_REQUEST_STATUSES])
    // WAGON 10: typed help requests have their OWN queue section —
    // keep the demand queue demand-only.
    .is("payload->>help_type", null)
    .order("created_at", { ascending: false })
    .limit(ROW_LIMIT);
  if (res.error) {
    return {
      readable: false,
      reason: isNotReadableCode(res.error.code) ? "needs_admin_read" : "error",
    };
  }
  type Row = {
    id: string;
    title: string;
    status: string;
    profile_id: string;
    role_or_work_type: string | null;
    country: string | null;
    created_at: string;
  };
  return {
    readable: true,
    rows: ((res.data ?? []) as Row[])
      .filter((r) =>
        (INTAKE_REQUEST_STATUSES as readonly string[]).includes(r.status),
      )
      .map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status as IntakeRequestRow["status"],
        profileId: r.profile_id,
        roleOrWorkType: r.role_or_work_type,
        country: r.country,
        createdAt: r.created_at,
      })),
  };
}

/** WAGON 10 — typed internal help requests (payload.help_type set). Read
 *  under the same admin RLS as the demand queue; honest degradation via the
 *  same not-readable states. The note (need_summary) renders only on the
 *  requireSuperadmin-gated panel. */
async function readHelpRequests(
  supabase: SupabaseClient,
): Promise<IntakeSection<IntakeHelpRequestRow>> {
  const res = await asAny(supabase)
    .from("customer_requests")
    .select("id, status, profile_id, need_summary, payload, created_at")
    .in("status", [...INTAKE_REQUEST_STATUSES])
    .not("payload->>help_type", "is", null)
    .order("created_at", { ascending: false })
    .limit(ROW_LIMIT);
  if (res.error) {
    return {
      readable: false,
      reason: isNotReadableCode(res.error.code) ? "needs_admin_read" : "error",
    };
  }
  type Row = {
    id: string;
    status: string;
    profile_id: string;
    need_summary: string | null;
    payload: Record<string, unknown> | null;
    created_at: string;
  };
  return {
    readable: true,
    rows: ((res.data ?? []) as Row[])
      .filter(
        (r) =>
          (INTAKE_REQUEST_STATUSES as readonly string[]).includes(r.status) &&
          typeof r.payload?.help_type === "string",
      )
      .map((r) => ({
        id: r.id,
        helpType: String(r.payload?.help_type),
        status: r.status as IntakeHelpRequestRow["status"],
        profileId: r.profile_id,
        note: r.need_summary,
        demandRequestId:
          typeof r.payload?.demand_request_id === "string"
            ? r.payload.demand_request_id
            : null,
        createdAt: r.created_at,
      })),
  };
}

/**
 * Operator intake overview. Real rows only; each source carries its own
 * honest availability state — nothing is faked when a read path is missing.
 */
export async function getLeadIntakeOverview(): Promise<LeadIntakeOverview> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      leads: { readable: false, reason: "needs_admin_read" },
      waitlist: { readable: false, reason: "needs_admin_read" },
      requests: { readable: false, reason: "needs_admin_read" },
      helpRequests: { readable: false, reason: "needs_admin_read" },
    };
  }

  const [leads, waitlist, requests, helpRequests] = await Promise.all([
    readLeads(supabase),
    readWaitlist(),
    readRequests(supabase),
    readHelpRequests(supabase),
  ]);
  return { leads, waitlist, requests, helpRequests };
}
