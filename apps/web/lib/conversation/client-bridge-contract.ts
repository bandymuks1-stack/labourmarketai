/**
 * The CLIENT's side of the agency bridge, as the chat reads it (2026-09-19).
 * Pure types + limits, importable by the client component; the server read
 * lives in `client-bridge.ts`. Nothing here is a second model: every row is
 * the partners page's own row, keyed by the same ids the RPCs re-check.
 */

export const CLIENT_BRIDGE_CHAT_LIMIT = 3;

export interface ClientBridgeInvite {
  readonly connectionId: string;
  readonly agencyName: string;
  readonly createdAt: string;
}

export interface ClientBridgeShareable {
  readonly connectionId: string;
  readonly agencyName: string;
  readonly requestId: string;
  readonly demandTitle: string;
}

export type ClientBridgeChatResult =
  | {
      readonly kind: "ok";
      /** Invitations still waiting for THIS company's answer. */
      readonly invites: readonly ClientBridgeInvite[];
      /** Active connections × open needs not yet shared with that agency. */
      readonly shareable: readonly ClientBridgeShareable[];
      readonly activeConnections: number;
    }
  | { readonly kind: "no-company" }
  | { readonly kind: "needs-migration" }
  | { readonly kind: "error" };
