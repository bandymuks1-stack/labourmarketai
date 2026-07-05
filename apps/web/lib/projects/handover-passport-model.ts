/**
 * Pure handover-passport model (branch 19, §8.8) — shared by the server read
 * service, the server action and the client panel. No server-only imports.
 *
 * The status set is deliberately DECLARATION-shaped: 'handover_declared'
 * records that the manager stated the handover happened — the platform never
 * verifies or certifies it (no 'completed', no 'verified').
 */

export const HANDOVER_STATUSES = [
  "preparation",
  "in_progress",
  "handover_declared",
  "closed",
] as const;
export type HandoverStatus = (typeof HANDOVER_STATUSES)[number];

export type HandoverEntry = {
  readonly id: string;
  readonly entryType: "note" | "status";
  /** Declared stage for status entries; null for notes. Never a platform
   *  verification — the value set is deliberately declaration-shaped. */
  readonly statusValue: HandoverStatus | null;
  readonly body: string | null;
  readonly createdAt: string;
};

export type HandoverPassportData =
  | { readonly applied: false }
  | {
      readonly applied: true;
      /** Newest first, real rows only (never fabricated). */
      readonly entries: readonly HandoverEntry[];
      /** Latest manager-DECLARED stage, or null when none was declared. */
      readonly declaredStatus: HandoverStatus | null;
      readonly error: string | null;
    };
