"use server";

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  ENGAGEMENTS_RESULT_LIMIT,
  type EngagementRow,
  type EngagementsContext,
  type EngagementsResult,
  type EngagementStatus,
} from "@/lib/engagements/engagements-result-contract";

/**
 * §7.1 — the `engagements` result's ONE read path, for BOTH sides.
 *
 * ─── WHY NOT `listBookingEngagementWorkers` ─────────────────────────────────
 * That reader exists to populate the project-assign PICKER: it returns worker
 * id / profile / display name and nothing else, is company-bound, and carries
 * no state at all — no status, no started_at, no ended_at. A result that has
 * to say "active since 3 March" or "ended on 12 May", and that has to hide its
 * CTA on an ended row, cannot be built on it. This module therefore has its
 * own explicit contract. It does not replace the picker and the picker is
 * untouched.
 *
 * ─── ROLE-AWARENESS COMES FROM RLS, NOT FROM A FLAG ─────────────────────────
 * `company_worker_engagements_select` is already
 *   `owns_company(company_id) OR (the row's own worker) OR is_admin()`
 * so ONE query returns the right rows for whoever is asking. The caller never
 * says which side it is on and never supplies a company, a worker or a role —
 * the database decides. What the CONTEXT changes is only which rows we then
 * keep (below) and how the panel words itself, never who is allowed to see
 * what.
 *
 * ─── NO PROJECT JOIN, DELIBERATELY ──────────────────────────────────────────
 * There is no foreign-key path from an engagement to a project:
 * `source_booking_id → booking_requests.request_id → customer_requests`
 * carries no `project_id` at any hop (established by the W11 audit). Showing
 * an engagement under a project would be inventing a relationship the data
 * does not have, so this module never joins to, filters by, or mentions a
 * project.
 *
 * ─── "use server", AND THE SHAPES LIVE NEXT DOOR ────────────────────────────
 * This module is reached from the CLIENT renderer, so it is a server-action
 * module rather than a plain `server-only` one. Such a module may export only
 * async functions, which is why `ENGAGEMENTS_RESULT_LIMIT` and every type now
 * live in `engagements-result-contract.ts` — the same split
 * `project-result-contract.ts` and `employer-workspace-contract.ts` already
 * use. The contract is pure, so the renderer and the guards can name the same
 * shapes without dragging supabase into the client bundle.
 */

/** RPC/relation-absent signatures — the owner gate is not yet given. */
const ABSENT = new Set(["42883", "42P01", "PGRST202", "PGRST205"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

function toStatus(value: unknown): EngagementStatus | null {
  return value === "active" || value === "ended" ? value : null;
}

function trimmedOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * The engagements this person may see, in the context they are standing in.
 *
 * `context` selects WHICH of the viewer's own rows are meaningful here, not
 * what they are permitted to read:
 *
 *   "organization" — rows where the viewer is the owning company. Standing in
 *                    a workspace, "my engagements" means the company's roster.
 *   "personal"     — rows where the viewer IS the engaged worker. Standing in
 *                    Personal space, it means the work I personally do.
 *
 * Both slices come out of the SAME RLS-scoped query, so neither can widen what
 * the database already refuses.
 */
export async function loadEngagementsForResult(
  context: EngagementsContext,
): Promise<EngagementsResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { kind: "blocked" };

    const res = await asAny(supabase)
      .from("company_worker_engagements")
      .select(
        "id, status, started_at, ended_at, company_id, worker_id, " +
          "companies(display_name, legal_name), workers(profile_id, display_name)",
      )
      // Active first, then most recently started — a stable, deterministic
      // order, so the same data never renders in two different sequences.
      .order("status", { ascending: true })
      .order("started_at", { ascending: false })
      .limit(ENGAGEMENTS_RESULT_LIMIT);

    if (res.error) {
      return ABSENT.has(res.error.code ?? "")
        ? { kind: "needs-migration" }
        : { kind: "blocked" };
    }

    type Row = {
      id: string;
      status: string | null;
      started_at: string | null;
      ended_at: string | null;
      company_id: string | null;
      worker_id: string | null;
      companies: { display_name: string | null; legal_name: string | null } | null;
      workers: { profile_id: string | null; display_name: string | null } | null;
    };

    const rows: EngagementRow[] = [];
    for (const r of (res.data ?? []) as Row[]) {
      const status = toStatus(r.status);
      // A row whose status or start we cannot read is not rendered at all —
      // better absent than shown in a state we had to guess.
      if (!status || !r.started_at) continue;

      // WHICH SIDE IS THIS VIEWER ON. The worker branch requires a LIVE worker
      // link: a GDPR-detached row (`worker_id is null`, the erasure model from
      // 20260723120000) must never be presented as the current worker's
      // engagement. Such a row can still be the COMPANY's row, and the company
      // may still end it.
      const isOwnWorker =
        r.worker_id !== null && r.workers?.profile_id === user.id;
      const viewerSide: "company" | "worker" = isOwnWorker ? "worker" : "company";

      if (context === "personal" && !isOwnWorker) continue;
      if (context === "organization" && isOwnWorker) continue;

      rows.push({
        engagementId: r.id,
        status,
        counterpartyName:
          viewerSide === "worker"
            ? trimmedOrNull(r.companies?.display_name) ??
              trimmedOrNull(r.companies?.legal_name)
            : trimmedOrNull(r.workers?.display_name),
        startedAt: r.started_at,
        endedAt: r.ended_at,
        viewerSide,
      });
    }

    return rows.length > 0 ? { kind: "engagements", rows } : { kind: "empty" };
  } catch {
    // A thrown read is never rendered as "you have no engagements".
    return { kind: "blocked" };
  }
}
