import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ReservationVerdict,
  ReservationWindow,
} from "@/lib/workforce/commitment-reservation";

/**
 * ASSIGNMENT PRE-CHECK (read-only) — "is this person already somewhere else on
 * this project's dates?", asked BEFORE the manager commits.
 *
 * ADVISORY ONLY, and honest about it:
 *   - It NEVER writes. It issues one RPC (`can_manage_project`, a boolean read)
 *     and reads; there is no insert/update/delete/assign call in this file.
 *   - It does not prohibit anything (SEP-2). The final assign is NOT re-checked
 *     server-side against this verdict: two managers can still race, and a
 *     verdict that was `clear` a minute ago is not a guarantee. The durable
 *     "assigned anyway" receipt and a transactional server-side re-check are a
 *     later RED PR that depends on #2079 — there is NO receipt yet.
 *   - `clear` only when every source answered; an undated project window, an
 *     unreadable project or worker, or a failed source is `unknown` (SEP-7).
 *
 * Dependencies are injected so the rule is testable without a database.
 */

export type AssignmentPrecheck = {
  readonly verdict: ReservationVerdict;
  /** Colleagues CONFIRMED free on the same dates — only when it collides. */
  readonly alternatives: readonly { profileId: string; name: string }[];
  readonly window: ReservationWindow;
  /** The caller holds the existing manage-projects capability, so "assign
   *  anyway" is offered. It only submits the ordinary assign; it grants and
   *  records nothing. */
  readonly canOverride: boolean;
};

export type AssignmentPrecheckResult =
  | ({ readonly ok: true } & AssignmentPrecheck)
  | {
      readonly ok: false;
      readonly code: "invalid" | "auth" | "no_company" | "not_authorized" | "error";
    };

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const UNREADABLE: ReservationVerdict = {
  state: "unknown",
  collisions: [],
  gaps: [{ reason: "source_unreadable", source: "project" }],
};

export interface PrecheckDeps {
  readonly supabase: SupabaseClient;
  readonly userId: string | null;
  /** The ACTIVE workspace resolved to a company (same gate as the assign). */
  readonly hasCompany: boolean;
  /** hasOrganizationCapability(role, "manage-projects"). */
  readonly canOverride: boolean;
  readonly checkReservation: (input: {
    workerId: string;
    window: ReservationWindow;
    exclude: readonly string[];
  }) => Promise<ReservationVerdict>;
  readonly freeColleagues: (
    supabase: SupabaseClient,
    assignedProfileId: string,
    projectId: string,
    window: ReservationWindow,
  ) => Promise<{ profileId: string; name: string }[]>;
}

export async function runAssignmentPrecheck(
  deps: PrecheckDeps,
  input: { projectId: string; workerProfileId: string },
): Promise<AssignmentPrecheckResult> {
  if (!deps.userId) return { ok: false, code: "auth" };
  const projectId = String(input.projectId ?? "").trim();
  const workerProfileId = String(input.workerProfileId ?? "").trim();
  if (!UUID_RX.test(projectId) || !UUID_RX.test(workerProfileId)) {
    return { ok: false, code: "invalid" };
  }
  if (!deps.hasCompany) return { ok: false, code: "no_company" };

  try {
    const { supabase } = deps;
    const { data: manages, error: manageError } = await asAny(supabase).rpc(
      "can_manage_project",
      { p_project_id: projectId },
    );
    if (manageError) return { ok: false, code: "error" };
    if (manages !== true) return { ok: false, code: "not_authorized" };

    const [{ data: worker, error: workerError }, { data: project, error: projectError }] =
      await Promise.all([
        asAny(supabase).from("workers").select("id").eq("profile_id", workerProfileId).maybeSingle(),
        asAny(supabase).from("projects").select("start_date, end_date").eq("id", projectId).maybeSingle(),
      ]);
    const window: ReservationWindow = {
      startDate: (project?.start_date as string | null) ?? null,
      endDate: (project?.end_date as string | null) ?? null,
    };
    // A row we could not read is not an empty schedule.
    if (workerError || projectError || !worker?.id || !project) {
      return { ok: true, verdict: UNREADABLE, alternatives: [], window, canOverride: deps.canOverride };
    }

    let verdict: ReservationVerdict;
    try {
      verdict = await deps.checkReservation({
        workerId: worker.id as string,
        window,
        exclude: [projectId],
      });
    } catch (error) {
      console.error("[projects] precheck reservation failed:", error);
      verdict = UNREADABLE;
    }

    const alternatives =
      verdict.state === "collides"
        ? await deps.freeColleagues(supabase, workerProfileId, projectId, window)
        : [];
    return { ok: true, verdict, alternatives, window, canOverride: deps.canOverride };
  } catch (error) {
    console.error("[projects] assignment precheck failed:", error);
    return { ok: false, code: "error" };
  }
}
