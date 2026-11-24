"use server";

import "server-only";

import { getSessionProfile } from "@/lib/auth/session-profile";
import { baseIdentityForRole } from "@/lib/config/roles";
import {
  loadCompanyStarterContext,
  loadPersonStarterFacts,
  personStarterContext,
} from "@/lib/conversation/starter-signals";
import { listMyEngagements } from "@/lib/invitations/network";
import {
  CAPABILITY_ANSWER_UNREADABLE,
  resolveCapabilityAnswer,
  type CapabilityAnswer,
} from "@/lib/conversation/capability-answer";

/**
 * THE SERVER BOUNDARY for "what can I do here?".
 *
 * REUSE, NOT A SECOND PROJECTION. Every fact comes from the loaders the
 * suggestion chips already use (`lib/conversation/starter-signals.ts`), which
 * in turn use the canonical resolvers the company page uses — membership
 * validated employer context, then the capability read over
 * `organization_roles`. The chips and this answer therefore cannot describe
 * two different workspaces, and no new query, table or RPC is introduced.
 *
 * WHY IT IS READ AT ASK TIME, NOT PAGE LOAD. The existing capability sentence
 * is composed once in `app/[locale]/dashboard/page.tsx` and frozen into a
 * prop. Context switching is a CONVERSATION act ("perjunk į įmonę X"), so a
 * page-load snapshot answers about the workspace the person has already left.
 * This reads the ACTIVE context each time the question is asked.
 *
 * HONESTY. `unreadable` is returned when the identity itself cannot be
 * resolved, or when the whole read throws. It is never turned into an empty
 * outcome list: "you have nothing available" is a claim about the person's
 * account, and our own failure may not make it.
 *
 * Read-only. Nothing here writes, dispatches or confirms. Every export in a
 * "use server" module must be an async function, which is why the resolver
 * and its types live in the sibling pure module.
 */
export async function readCapabilityAnswer(): Promise<CapabilityAnswer> {
  try {
    const session = await getSessionProfile();
    if (!session.user) return CAPABILITY_ANSWER_UNREADABLE;
    // A FAILED profile read is not a person (W6 honesty, #1314). Before that
    // distinction existed, a company owner whose row timed out was greeted as
    // a worker; answering "what can I do here" from the same guess would
    // describe the wrong workspace with full confidence.
    if (session.profileRead === "failed") return CAPABILITY_ANSWER_UNREADABLE;

    // The ACTIVE workspace, resolved server-side at ASK time, so a stale
    // client prop cannot answer for a context the person has switched away
    // from. `active_role` is the same field `decideDashboardRole` treats as
    // its primary input.
    const activeRole = session.profile?.active_role ?? null;
    const identity = activeRole ? baseIdentityForRole(activeRole) : "person";

    if (identity === "company") {
      const ctx = await loadCompanyStarterContext();
      return resolveCapabilityAnswer(ctx.signals, ctx.organizationName);
    }

    // Person. Both reads degrade on their own rather than throwing, so a
    // failed learner read costs the learning line and nothing else.
    //
    // The learner link is the SAME read the dashboard's own greeting uses
    // (`listMyEngagements`, relationship `student` — the row an accepted
    // learner invitation creates). No second notion of "is this person a
    // learner" is introduced.
    const [facts, learnerLinked] = await Promise.all([
      loadPersonStarterFacts(),
      listMyEngagements()
        .then((rows) => rows.some((e) => e.relationshipSlug === "student"))
        .catch(() => false),
    ]);
    const ctx = personStarterContext(learnerLinked, facts);
    return resolveCapabilityAnswer(ctx.signals, null);
  } catch {
    return CAPABILITY_ANSWER_UNREADABLE;
  }
}
