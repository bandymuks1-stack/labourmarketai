import "server-only";

import { getWorkspaceContext } from "@/lib/company/active-organization";
import { createClient } from "@/lib/supabase/server";
import { untypedClient } from "./evidence-store";
import { livePeriods, type HistoryPeriodStatement } from "./business-history";

/**
 * THE ORGANIZATIONS A PERSON LEADS — read for their own profile and Living CV
 * (owner request 2026-10-09: "Personal profile → Organizations and leadership
 * → Vivat Rex → company history").
 *
 * Built from what is canonical, nothing new is stored:
 *   - the person's OWN organization memberships with a governing relationship
 *     (owner / manager) - the same list the workspace chip renders;
 *   - each organization's stated business periods (`organization_history_periods`,
 *     RLS: managers of that organization only), e.g. the earlier Vivat Rex
 *     period of a continuing business, with what the statement rests on.
 *
 * Leadership is a RELATIONSHIP to an organization, never personally performed
 * work: no hours are attributed to the person here.
 *
 * `unavailable` = a read failed (UNKNOWN, never "leads nothing").
 */

export type LedOrganization = {
  readonly organizationId: string;
  /** Empty when the organization has no name yet (never invented). */
  readonly name: string;
  readonly relationship: "owner" | "manager";
  readonly periods: readonly Pick<
    HistoryPeriodStatement,
    "id" | "periodLabel" | "legalEntityLabel" | "legalEntityRelation" | "basis" | "periodStart" | "periodEnd"
  >[];
};

export type MyOrganizationsRead =
  | { readonly kind: "ok"; readonly organizations: readonly LedOrganization[] }
  | { readonly kind: "unavailable" };

const LEADING = new Set(["owner", "manager"]);

export async function readMyLedOrganizations(): Promise<MyOrganizationsRead> {
  let ws: Awaited<ReturnType<typeof getWorkspaceContext>>;
  try {
    ws = await getWorkspaceContext();
  } catch {
    return { kind: "unavailable" };
  }
  const led = ws.workspaces.filter(
    (w) => w.kind === "organization" && w.relationship && LEADING.has(w.relationship),
  );
  if (led.length === 0) return { kind: "ok", organizations: [] };

  const supabase = await createClient();
  const res = await untypedClient(supabase)
    .from("organization_history_periods")
    .select(
      "id, organization_id, period_label, legal_entity_label, legal_entity_relation, basis, period_start, period_end, continuity, source_labels, basis_reference, statement, supersedes_id, created_at",
    )
    .in(
      "organization_id",
      led.map((w) => w.id),
    )
    .order("created_at", { ascending: true })
    .limit(200);
  if (res.error) return { kind: "unavailable" };
  type Row = {
    id: string;
    organization_id: string;
    period_label: string;
    legal_entity_label: string | null;
    legal_entity_relation: HistoryPeriodStatement["legalEntityRelation"];
    basis: HistoryPeriodStatement["basis"];
    period_start: string | null;
    period_end: string | null;
    continuity: HistoryPeriodStatement["continuity"];
    source_labels: string[] | null;
    basis_reference: string | null;
    statement: string | null;
    supersedes_id: string | null;
    created_at: string;
  };
  const rows = (res.data ?? []) as Row[];
  return {
    kind: "ok",
    organizations: led.map((w) => {
      const live = livePeriods(
        rows
          .filter((r) => r.organization_id === w.id)
          .map((r) => ({
            id: r.id,
            periodLabel: r.period_label,
            legalEntityLabel: r.legal_entity_label,
            sourceLabels: r.source_labels ?? [],
            periodStart: r.period_start,
            periodEnd: r.period_end,
            continuity: r.continuity,
            legalEntityRelation: r.legal_entity_relation,
            basis: r.basis,
            basisReference: r.basis_reference,
            statement: r.statement,
            createdAt: r.created_at,
            supersedesId: r.supersedes_id,
          })),
      );
      return {
        organizationId: w.id,
        name: w.name.trim(),
        relationship: w.relationship as LedOrganization["relationship"],
        periods: live.map((p) => ({
          id: p.id,
          periodLabel: p.periodLabel,
          legalEntityLabel: p.legalEntityLabel,
          legalEntityRelation: p.legalEntityRelation,
          basis: p.basis,
          periodStart: p.periodStart,
          periodEnd: p.periodEnd,
        })),
      };
    }),
  };
}
