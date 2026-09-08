/**
 * CLIENT side of the agency bridge, in the chat (owner contract 2026-09-04
 * §4A/§15 — AGENCY real business journey): the offers an agency made on the
 * company's OWN demands, and the client's decision on each.
 *
 * Types + constants only (a "use server" module may export async functions
 * alone — see `education-workspace-contract.ts` for the same split).
 */

/** Display cap for the chat list; the scouting page carries the full list. */
export const CLIENT_OFFERS_CHAT_LIMIT = 6;

/** How many of the company's open demands the chat read looks at. */
export const CLIENT_OFFERS_DEMAND_SCAN_LIMIT = 10;

export interface ClientChatOffer {
  readonly offerId: string;
  readonly requestId: string;
  readonly demandTitle: string;
  readonly agencyName: string;
  readonly note: string | null;
  readonly createdAt: string;
}

export type ClientOffersChatResult =
  | { readonly kind: "ok"; readonly offers: readonly ClientChatOffer[]; readonly openDemands: number }
  | { readonly kind: "no-company" }
  | { readonly kind: "error" };
