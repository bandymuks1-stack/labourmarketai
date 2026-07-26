/**
 * Conversation profile-summary contract — PURE.
 *
 * Split from the `"use server"` module for the same reason as
 * `find-work-contract.ts`: a server-action file may only export async
 * functions, so the shapes live here and are importable from the action, the
 * chat UI and tests alike.
 *
 * Nothing here reads or derives anything. The canonical worker read model
 * (`lib/conversation/worker-activity.ts`) owns every fact; this file only
 * describes how the conversation renders them.
 */

import type { WorkerProfileStep } from "@/lib/conversation/worker-activity";

/** Which question the summary is answering. The FACTS are identical in all
 *  three cases — only the opening line differs, because "show my profile",
 *  "what's left to do" and "where did I stop" are the same real state seen
 *  from three angles. */
export type ProfileSummaryVariant = "profile" | "next" | "resume";

export type ChatProfileSummary =
  | {
      kind: "summary";
      intro: string;
      /** Localized names of the checkpoints that are really saved. */
      done: string[];
      /** Localized names of the checkpoints still missing — named concretely,
       *  never reduced to a bare percentage. */
      missing: string[];
      /** The SAME missing checkpoints as stable keys, in canonical order.
       *
       *  Carried so a surface can mark the action that fixes the first real gap
       *  as its recommended one. This is the server's own ordering of the
       *  worker's own rows — nothing here is a heuristic, and a surface with no
       *  matching action simply offers no recommendation rather than inventing
       *  one. */
      missingKeys: WorkerProfileStep[];
      /** Checkpoints really saved, straight from the read model.
       *
       *  Sent explicitly rather than left for the UI to derive from
       *  `done.length`: two places computing the same number is exactly how a
       *  progress bar starts disagreeing with the server it is reporting. The
       *  UI renders these; it never counts. */
      stepsDone: number;
      stepsTotal: number;
      /** Honest last-activity line, or null when there is no activity yet. */
      lastActivity: string | null;
    }
  | { kind: "blocked"; message: string };
