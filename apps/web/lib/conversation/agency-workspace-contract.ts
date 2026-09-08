/**
 * Agency chat-workspace READ contract (real recruiter pilot, 2026-09-04).
 *
 * PURE types shared by the server adapter (`agency-workspace.ts`) and the
 * chat component. Bounded, presentation-ready rows: the chat lists them and
 * offers chips; every id is re-verified by the RPC the chip's action calls.
 */

export type AgencyChatSharedRequest = {
  readonly shareId: string;
  readonly requestId: string;
  readonly title: string;
};

export type AgencyChatRosterWorker = {
  readonly workerId: string;
  /** Display name, else the e-mail's local part, else a short id — the same
   *  rule the agency bridge section uses for its roster select. */
  readonly label: string;
};

export type AgencyChatProgressRow = {
  readonly offerId: string;
  readonly requestId: string;
  readonly title: string;
  readonly workerLabel: string;
  /** Localized review stage (resolved server-side from the bridge namespace). */
  readonly stageLabel: string;
  /** Localized client decision when one exists; null while still open. */
  readonly decisionLabel: string | null;
  readonly offerStatus: string;
};

export type AgencyChatConnection = {
  readonly id: string;
  readonly invitedEmail: string;
  readonly status: string;
};

export type AgencyBridgeChatResult =
  | {
      readonly kind: "ok";
      readonly agencyCompanyId: string;
      readonly connections: readonly AgencyChatConnection[];
      readonly shared: readonly AgencyChatSharedRequest[];
      readonly roster: readonly AgencyChatRosterWorker[];
      readonly progress: readonly AgencyChatProgressRow[];
    }
  /** The active workspace has no company the caller governs. */
  | { readonly kind: "no-company" }
  /** The governed company is not a staffing agency. */
  | { readonly kind: "not-agency" }
  | { readonly kind: "needs-migration" }
  | { readonly kind: "error" };

/** Chat lists stay short — the full surface is one chip away. */
export const AGENCY_CHAT_LIST_LIMIT = 6;
