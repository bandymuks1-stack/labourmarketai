import { z } from "zod";

import type { ExecResult } from "@/lib/conversation/executor-contract";
import {
  DASHBOARD_SEARCH_MAX_QUERY_CHARS,
  DASHBOARD_SEARCH_MIN_QUERY_CHARS,
  DASHBOARD_SEARCH_SOURCES,
  normalizeSearchQuery,
} from "@/lib/search/dashboard-search-model";

import type { CapabilityAnnotations, CapabilityCaller, CapabilityDescriptor } from "./contract";
import { scopedCallerRefusal } from "./conversation-action-bridge";

/**
 * ACCOUNT, HISTORY AND SEARCH READS — the three questions a person asks an
 * assistant that had no named tool (owner P0, chat as the one control layer):
 *
 *   "what is my work history?"            → work_history.get
 *   "what plan / subscription am I on?"   → billing.subscription.get
 *   "find that thing I did / wrote / got" → search.query
 *
 * NO NEW DOMAIN LOGIC AND NO NEW READ PATH. Each handler is ONE call to the
 * function the matching web surface already calls, run through the bearer
 * caller scope as the same person, under the same RLS, in the same
 * server-resolved active workspace:
 *
 *   work_history.get          `buildVerifiedCv()` — the ONE professional
 *                             experience reading (decision 0025), the same
 *                             object the CV page and Work in Numbers render.
 *   billing.subscription.get  `resolveBillingSubject()` +
 *                             `getEffectiveEntitlements()` +
 *                             `readOwnLmcAccount()` — the account page's own
 *                             three reads (/dashboard/account#account-plan).
 *   search.query              `getDashboardSearchReport()` — the dashboard
 *                             finder's own search over the caller's OWN
 *                             journal, projects, tasks, finance records,
 *                             conversations, bookings and documents.
 *
 * READ-ONLY, ALWAYS. Nothing here orders, pays, cancels, upgrades or opens a
 * checkout or a billing portal: money decisions stay the person's own click in
 * the web app (no autonomous commercial or financial operation). There is no
 * `execute`/`confirm` kind in this module and a guard test pins that.
 *
 * HONEST STATES. "Could not be read" is never "nothing" and never zero:
 * an unreadable ledger is `null` with the reason named, a search source that
 * was not read is listed in `notRead`, and no handler invents a row.
 */

const READ: CapabilityAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

function read<S extends z.ZodTypeAny>(
  id: string,
  title: string,
  description: string,
  inputSchema: S,
  load: (input: z.infer<S>, caller: CapabilityCaller) => Promise<ExecResult>,
): CapabilityDescriptor {
  return {
    id,
    kind: "read",
    title,
    description: `${description} Reads only what the caller may see in the web app (same read, same permissions, active workspace). Writes nothing.`,
    exposed: true,
    annotations: READ,
    inputSchema,
    run: async (caller, input): Promise<ExecResult> => {
      const refused = await scopedCallerRefusal(caller);
      if (refused) return refused;
      return load(inputSchema.parse(input), caller);
    },
  };
}

const none = z.object({}).strict();

const searchInput = z
  .object({
    query: z.string().trim().min(DASHBOARD_SEARCH_MIN_QUERY_CHARS).max(DASHBOARD_SEARCH_MAX_QUERY_CHARS),
    sources: z.array(z.enum(DASHBOARD_SEARCH_SOURCES)).min(1).max(DASHBOARD_SEARCH_SOURCES.length).optional(),
  })
  .strict();

export const ACCOUNT_HISTORY_READ_CAPABILITIES: readonly CapabilityDescriptor[] = [
  read(
    "work_history.get",
    "My work history",
    "The caller's ONE continuous professional history: all-time work hours (every hour once, whoever recorded it), broken down per organization (with roles, ownership and management, and the organization's earlier business periods), per project and per source, each line with its provenance and confirmation state, plus the organization-supplied history. A null total or section means it could not be read — never zero. The same reading the CV page and Work in Numbers show; for the whole CV use cv_verified_get.",
    none,
    async () => {
      const { buildVerifiedCv } = await import("@/lib/cv-export/verified-cv");
      const r = await buildVerifiedCv();
      if (!r.ok) {
        return r.code === "no_worker"
          ? { ok: false, code: "no_worker_profile", message: "The caller has no worker profile yet, so there is no work history to read. Nothing was read." }
          : { ok: false, code: "auth" };
      }
      const cv = r.cv;
      return {
        ok: true,
        data: {
          // null = the journal could not be read (UNKNOWN), never "no history".
          professionalExperience: cv.professionalExperience,
          // null = the organization ledger could not be read; [] = read, none.
          organizationHistory: cv.organizationHistory,
          organizationRecordedHours: cv.organizationRecordedHours,
          recordedHoursTotal: cv.recordedHoursTotal,
          recordedHoursConfirmed: cv.recordedHoursConfirmed,
          readState: {
            professionalExperience: cv.professionalExperience === null ? "unreadable" : "read",
            organizationHistory: cv.organizationHistory === null ? "unreadable" : "read",
          },
          screen: "/dashboard/work-in-numbers",
        },
      };
    },
  ),

  read(
    "billing.subscription.get",
    "My plan, subscription and credit balance (read-only)",
    "What the active workspace is on: whose billing it is (the organization the caller acts for, or the caller personally), the effective plan and where it comes from, the subscription status, whether it ends at the period end and when the paid period ends, whether payments are switched on at all, and the caller's own LMC credit balance with recent movements. READ-ONLY: this tool cannot order, pay, cancel, change a plan or open a checkout — those are the person's own click on the account page. Amounts are in cents; a null value means it is not recorded or could not be read — never zero.",
    none,
    async () => {
      const [{ resolveBillingSubject }, { getEffectiveEntitlements }, { getBillingConfigFor }, { readOwnLmcAccount }] =
        await Promise.all([
          import("@/lib/billing/billing-subject"),
          import("@/lib/billing/effective-entitlements"),
          import("@/lib/billing/config"),
          import("@/lib/lmc/lmc-account"),
        ]);
      const workspace = await resolveBillingSubject();
      if (!workspace.subject) return { ok: false, code: "auth" };
      const [ent, lmc] = await Promise.all([getEffectiveEntitlements(), readOwnLmcAccount()]);
      const config = getBillingConfigFor(workspace.subject.type === "organization" ? workspace.subject.id : null);
      const paymentsActive = config.state === "stripe_test" || config.state === "stripe_live";
      return {
        ok: true,
        data: {
          // Server-resolved: the organization the caller ACTS FOR (their own
          // governance membership) or the caller personally. Never an input.
          billingSubject:
            workspace.subject.type === "organization"
              ? { type: "organization", organizationId: workspace.subject.id }
              : { type: "personal" },
          // May the caller act on this subject's billing IN THE WEB APP. It
          // grants nothing here: this door has no billing write.
          callerMayManageBilling: workspace.billingAuthority,
          paymentsActive,
          plan: {
            effectivePlanKey: ent.effectivePlanKey,
            source: ent.source,
            entitled: ent.active,
            inGracePeriod: ent.grace,
            limitsEnforced: ent.enforced,
          },
          subscription: {
            // null = no subscription row was read for this subject (none
            // recorded, or the read failed) — not "cancelled".
            status: ent.subscriptionStatus,
            endsAtPeriodEnd: ent.cancelAtPeriodEnd,
            currentPeriodEnd: ent.currentPeriodEnd,
          },
          // The caller's OWN personal credit account. `unavailable` (the read
          // failed) and `no_account` (nothing ever happened) are not a zero balance.
          lmc:
            lmc.state === "ready"
              ? {
                  state: "ready",
                  unit: "LMC",
                  availableCents: lmc.availableCents,
                  purchasedCents: lmc.purchasedCents,
                  promotionalCents: lmc.promotionalCents,
                  expiredRemainderCents: lmc.expiredRemainderCents,
                  recentMovements: lmc.movements,
                }
              : { state: lmc.state },
          readOnly: true,
          screen: "/dashboard/account#account-plan",
        },
      };
    },
  ),

  read(
    "search.query",
    "Search my past work, conversations and documents",
    "Finds the caller's OWN records by words: work-journal entries (past actions), projects, tasks, finance records, conversations (by subject), bookings and documents (by type and country) — the same search as the web app's finder, with the same typo tolerance, at most 5 results per source. Each result has its id, its own label and the exact screen that shows it; open a conversation with conversation_get. It never searches people (use candidate_search) and never another person's or organization's records. `notRead` lists sources that could not be searched — an empty answer with a source in `notRead` is NOT 'nothing exists'. Conversation message bodies and document file contents are not searched.",
    searchInput,
    async ({ query, sources }) => {
      const nq = normalizeSearchQuery(query);
      if (nq === null) {
        return { ok: false, code: "query_too_short", message: `Give at least ${DASHBOARD_SEARCH_MIN_QUERY_CHARS} letters or digits to search for. Nothing was read.` };
      }
      const { getDashboardSearchReport } = await import("@/lib/search/dashboard-search");
      const report = await getDashboardSearchReport(nq);
      const wanted = new Set<string>(sources ?? DASHBOARD_SEARCH_SOURCES);
      const groups = report.groups.filter((g) => wanted.has(g.source));
      const notRead = report.notRead.filter((s) => wanted.has(s));
      const total = groups.reduce((n, g) => n + g.results.length, 0);
      return {
        ok: true,
        data: {
          query: nq,
          total,
          groups,
          searched: [...wanted].filter((s) => !notRead.includes(s as (typeof notRead)[number])),
          notRead,
          ...(total === 0 && notRead.length > 0
            ? { note: "Nothing matched in the sources that were read. The sources in notRead were not searched — that is not the same as 'nothing exists'." }
            : {}),
        },
      };
    },
  ),
];
