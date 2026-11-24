import "server-only";

import { z } from "zod";

import { endEngagementAction } from "@/lib/engagements/end-engagement";
import {
  ENGAGEMENT_ACTION_SCHEMAS,
  type EngagementActionId,
} from "@/lib/engagements/engagement-schemas";
import type { ExecCtx, ExecResult } from "@/lib/conversation/executor-contract";

/**
 * Relationship-side executors (§7.1). ONE entry, and ONE is the design.
 *
 * ─── WHY THIS LIVES IN lib/engagements AND NOT lib/conversation ─────────────
 * The Product Gate's A-01 rule refuses a new `lib/conversation/*-executors.ts`:
 * "behavior must be a binding on an entity, not a module per type". It fired on
 * the first draft of this file, and it was RIGHT — not because this module is
 * per-actor-type (it is the exact opposite; that is the whole point of
 * `engagement.end`), but because that FAMILY is. `worker-executors.ts` and
 * `company-executors.ts` are per-actor-type aggregations of many actions across
 * many domains, and a third file beside them reads as a third actor type
 * whatever its contents say.
 *
 * The gate was not weakened to let this through. The module moved to where it
 * actually belongs: beside the server action and the reader it adapts, in its
 * own domain. Its location now states what it is — one domain's one action —
 * instead of implying membership in a family it does not belong to.
 *
 * Same contract as the worker and employer executor maps: a THIN adapter that
 * validates nothing new of its own — the dispatcher already parsed the input
 * with the id's schema, re-checked held roles through `dispatch-core`, and
 * verified a fresh one-time confirmation token — and delegates to the EXISTING
 * canonical server action, then normalizes its result into `ExecResult`.
 *
 *   engagement.end → lib/engagements/end-engagement
 *                    → end_company_worker_engagement_v2 (owner-gated)
 *
 * ─── ONE EXECUTOR FOR BOTH SIDES ────────────────────────────────────────────
 * The employer and the worker reach this same function, with the same input
 * shape, over the same RPC. Nothing here branches on who is asking, because
 * nothing here KNOWS who is asking: the side is re-derived in SQL from the
 * row's own relationships and comes back in the outcome. A branch here would
 * be a second authorization model competing with the one in the database.
 *
 * ─── NO OUTCOME IS INVENTED ─────────────────────────────────────────────────
 * `already_ended` is mapped as a FAILURE code rather than as success, and that
 * is deliberate: `ok: true` in this contract means "this call wrote
 * something", and an already-ended engagement was not written by this call.
 * Reporting it as success would let a surface say "ended" twice for one real
 * transition. It is not an ERROR either — the panel renders it as its own
 * neutral state — so it travels as its own code and keeps the server's real
 * timestamp with it.
 */

type Infer<Id extends EngagementActionId> = z.infer<
  (typeof ENGAGEMENT_ACTION_SCHEMAS)[Id]
>;

export const ENGAGEMENT_EXECUTORS: {
  readonly [Id in EngagementActionId]: (
    input: Infer<Id>,
    ctx: ExecCtx,
  ) => Promise<ExecResult>;
} = Object.freeze({
  "engagement.end": async (input, ctx): Promise<ExecResult> => {
    const r = await endEngagementAction(ctx.locale, input.engagementId);
    switch (r.kind) {
      case "ended":
        return {
          ok: true,
          data: {
            engagementId: r.engagementId,
            endedAt: r.endedAt,
            actorSide: r.actorSide,
            // F2: `true` obliges the surface to say the company still sees
            // the profile via an active project assignment. `null` (unknown)
            // and `false` both add nothing — only a POSITIVE finding is
            // spoken, never a guess.
            companyStillSeesProfile: r.companyStillSeesProfile,
          },
        };
      case "already_ended":
        return {
          ok: false,
          code: "already_ended",
          // The ORIGINAL timestamp, so the surface can show when it really
          // ended instead of implying this call did it.
          existing: r.endedAt ?? undefined,
        };
      case "not_found":
        // Absence and refusal are the SAME answer here, exactly as the
        // migration decided. Splitting them at this layer would rebuild the
        // oracle the SQL deliberately closed.
        return { ok: false, code: "not_found" };
      case "conflict":
        return { ok: false, code: "conflict" };
      case "needs_migration":
        return { ok: false, code: "needs_migration" };
      default:
        // An outcome this map does not recognise collapses to `error` — never
        // to success. `endEngagementAction` already refuses to invent one.
        return { ok: false, code: "error" };
    }
  },
});
