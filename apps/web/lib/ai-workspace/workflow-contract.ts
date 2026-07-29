/**
 * AI workspace workflow contract (W4) — PURE.
 *
 * Lives outside the `"use server"` module because a server-action file may only
 * export async functions. These are the shapes the conversation renders.
 *
 * ONE RULE SHOWS UP IN EVERY SHAPE: `why`. The owner's requirement is that all
 * recommendations explain WHY, so the explanation is a REQUIRED field of the
 * result, not an optional extra a caller may forget. A workflow that cannot say
 * what it read has nothing to say.
 */

import type { FindWorkResult } from "@/lib/conversation/find-work-contract";
import type { EntityRef } from "@/lib/world-state/world-state";

/** An existing conversation chip id (`logwork`, `profile`, `f:worker.*`, …).
 *  Workflows never invent an affordance — they offer the ones the chat has. */
export type WorkflowChip = { readonly id: string; readonly label: string };

export interface WorkflowExplanation {
  /** What the AI understood and what it read — one honest sentence. */
  readonly why: string;
  /** The dimensions it recognised but cannot act on, named out loud. */
  readonly unsupported?: readonly string[];
}

export type WorkflowResult =
  /** A plain answer built from real rows. */
  | {
      readonly kind: "answer";
      readonly text: string;
      readonly explanation: WorkflowExplanation;
      readonly chips?: readonly WorkflowChip[];
    }
  /** The canonical opportunity search, optionally narrowed by World State. */
  | {
      readonly kind: "matches";
      readonly result: FindWorkResult;
      readonly explanation: WorkflowExplanation;
      /** Filters actually applied, as `dimension: matched words` — the AI says
       *  what it changed about the world, in the person's own words. */
      readonly appliedFilters: readonly { readonly label: string; readonly matchedText: string }[];
    }
  /** The AI opens an entity in the workspace instead of navigating (W3 panel). */
  | {
      readonly kind: "open-entity";
      readonly ref: EntityRef;
      readonly text: string;
      readonly explanation: WorkflowExplanation;
    }
  /** The workflow cannot run, and says exactly why. Never a silent no-op. */
  | {
      readonly kind: "blocked";
      readonly text: string;
      readonly explanation: WorkflowExplanation;
    };
