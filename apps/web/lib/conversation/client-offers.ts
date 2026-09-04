"use server";

import "server-only";

import { listOfferedCandidatesForRequest } from "@/lib/agency/bridge-read";
import { requireEmployerCompany } from "@/lib/company/employer-company-context";
import { listCompanyDemands } from "@/lib/scouting/scouting";

import {
  CLIENT_OFFERS_CHAT_LIMIT,
  CLIENT_OFFERS_DEMAND_SCAN_LIMIT,
  type ClientChatOffer,
  type ClientOffersChatResult,
} from "@/lib/conversation/client-offers-contract";

/**
 * CLIENT-side chat read of the agency bridge (owner contract 2026-09-04 §15,
 * AGENCY real business journey — the client's half).
 *
 * The agency's chain by sentence was prod-proven (#1466/#1473): invite client
 * → share → propose a candidate → offer `offered`. The CLIENT's decision on
 * that offer existed only as buttons on the scouting page. This read gives
 * the chat the SAME rows that page renders — through the SAME canonical
 * reads (`listCompanyDemands`, the offered-candidates RPC), never a second
 * projection — so "kokius kandidatus pasiūlė agentūra?" can be answered and
 * decided inside the conversation.
 *
 * Reads only OPEN offers (`offerStatus === "offered"`) on the company's open
 * demands, capped for display. No worker name leaves the RPC (it does not
 * return one); the note is the agency's own wording, shown to the client the
 * RPC already authorizes. Every degraded state is a named kind.
 */
export async function loadClientOffersForChat(): Promise<ClientOffersChatResult> {
  const company = await requireEmployerCompany();
  if (!company.ok) return { kind: "no-company" };
  try {
    const demands = (await listCompanyDemands()).filter(
      (d) => d.status !== "closed" && d.status !== "draft",
    );
    const scanned = demands.slice(0, CLIENT_OFFERS_DEMAND_SCAN_LIMIT);
    const perDemand = await Promise.all(
      scanned.map(async (d) => {
        const rows = await listOfferedCandidatesForRequest(d.id);
        return rows
          .filter((r) => r.offerStatus === "offered")
          .map<ClientChatOffer>((r) => ({
            offerId: r.offerId,
            requestId: d.id,
            demandTitle: d.title,
            agencyName: r.agencyName,
            note: r.note,
            createdAt: r.createdAt,
          }));
      }),
    );
    const offers = perDemand
      .flat()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
      .slice(0, CLIENT_OFFERS_CHAT_LIMIT);
    return { kind: "ok", offers, openDemands: demands.length };
  } catch {
    return { kind: "error" };
  }
}
