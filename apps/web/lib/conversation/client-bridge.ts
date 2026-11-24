"use server";

import "server-only";

import { listMyConnectionInvites, listSharedRequestsByClient } from "@/lib/agency/bridge-read";
import { requireEmployerCompany } from "@/lib/company/employer-company-context";
import { listCompanyDemands } from "@/lib/scouting/scouting";

import {
  CLIENT_BRIDGE_CHAT_LIMIT,
  type ClientBridgeChatResult,
  type ClientBridgeInvite,
  type ClientBridgeShareable,
} from "@/lib/conversation/client-bridge-contract";

/**
 * READ ONLY. The same three reads the partners page makes for a client:
 * invitations addressed to the caller's e-mail (`listMyConnectionInvites`),
 * the company's own open needs (`listCompanyDemands`, RLS) and what is
 * already shared on the active connections (`listSharedRequestsByClient`).
 * The chat then offers chips over the canonical bridge actions; it never
 * writes here (no-direct-write guard).
 */
export async function loadClientBridgeForChat(): Promise<ClientBridgeChatResult> {
  const company = await requireEmployerCompany();
  if (!company.ok) return { kind: "no-company" };
  try {
    const invitesState = await listMyConnectionInvites();
    if (invitesState.kind === "needs-migration") return { kind: "needs-migration" };
    if (invitesState.kind !== "ok") return { kind: "error" };

    const invites: ClientBridgeInvite[] = invitesState.rows
      .filter((r) => r.status === "pending")
      .slice(0, CLIENT_BRIDGE_CHAT_LIMIT)
      .map((r) => ({ connectionId: r.id, agencyName: r.agencyName, createdAt: r.createdAt }));

    const active = invitesState.rows.filter((r) => r.status === "active");
    let shareable: ClientBridgeShareable[] = [];
    if (active.length > 0) {
      const [demands, shares] = await Promise.all([
        listCompanyDemands(),
        listSharedRequestsByClient(active.map((a) => a.id)),
      ]);
      const open = demands.filter((d) => d.status !== "closed" && d.status !== "draft");
      const shared = new Set(
        shares.kind === "ok" ? shares.rows.map((s) => `${s.connectionId}:${s.requestId}`) : [],
      );
      // Bounded: at most the chat limit, newest connection first.
      for (const conn of active) {
        for (const d of open) {
          if (shareable.length >= CLIENT_BRIDGE_CHAT_LIMIT) break;
          if (shared.has(`${conn.id}:${d.id}`)) continue;
          shareable.push({
            connectionId: conn.id,
            agencyName: conn.agencyName,
            requestId: d.id,
            demandTitle: d.title,
          });
        }
      }
      shareable = shareable.slice(0, CLIENT_BRIDGE_CHAT_LIMIT);
    }
    return { kind: "ok", invites, shareable, activeConnections: active.length };
  } catch {
    return { kind: "error" };
  }
}
