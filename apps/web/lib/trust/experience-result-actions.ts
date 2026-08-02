"use server";

import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  getExperienceCounts,
  listExperiencesForViewer,
  type ExperienceCountsState,
  type ExperienceRow,
} from "./experience-records";

/**
 * W6 slice 3 — the read behind the `experiences` Workspace Result.
 *
 * WHY THIS EXISTS AT ALL. Slice 3B first put this read in a page component at
 * `/dashboard/experiences`. The Product Gate refused that screen (A-09): the
 * workspace is chat-first, an answer belongs in the result panel, and a 73rd
 * route is the failure mode the whole unified-product work was undoing. The
 * panel is a client tree, so the read moved here — one server action, called
 * by one client result, reading the SAME `lib/trust/experience-records.ts`
 * functions the deleted page called. No second data path was created.
 *
 * FAIL-CLOSED IS PRESERVED EXACTLY. `needs_migration` stays a distinct state
 * all the way to the panel; it is never flattened into "empty", never turned
 * into a zero count, and never falls back to legacy review notes. The three
 * ways there can be nothing to show — not signed in, domain unavailable, read
 * failed — stay three different answers, because to the person waiting on a
 * result they mean three different things.
 *
 * NOTHING IS COMPUTED HERE. Counts come from `get_experience_counts` (the ONE
 * aggregation rule, in SQL); rows come from the RLS-scoped select. This layer
 * shapes, it does not decide. It also writes nothing: every write in this
 * domain is an RPC behind its own action in `experience-actions.ts`.
 */

export type ExperiencesResultView =
  | { readonly kind: "not-authenticated" }
  /** The domain migration is owner-gated and unapplied in this environment. */
  | { readonly kind: "unavailable" }
  | { readonly kind: "error" }
  | {
      readonly kind: "ready";
      readonly counts: ExperienceCountsState;
      readonly mine: readonly ExperienceRow[];
      readonly aboutMe: readonly ExperienceRow[];
    };

export async function loadExperiencesResultAction(): Promise<ExperiencesResultView> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // The panel renders a sign-in prompt rather than an empty list: "we do not
  // know who you are" is not the same answer as "nobody wrote about you".
  if (!user) return { kind: "not-authenticated" };

  const list = await listExperiencesForViewer(user.id);
  if (list.state === "needs_migration") return { kind: "unavailable" };
  if (list.state === "error") return { kind: "error" };

  // Counts are read separately and are allowed to degrade on their own: the
  // rows can be readable while the aggregate RPC is not. `ExperienceCountsBlock`
  // renders each of its states honestly, so the state is passed through
  // untouched rather than collapsed here.
  const counts = await getExperienceCounts("worker", user.id);

  return { kind: "ready", counts, mine: list.mine, aboutMe: list.aboutMe };
}
