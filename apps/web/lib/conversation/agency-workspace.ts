"use server";

import "server-only";

import { getTranslations } from "next-intl/server";

import { requireEmployerCompany } from "@/lib/company/employer-company-context";
import { getOwnedCompanyById } from "@/lib/company/company-setup";
import { listActiveCompanyWorkers } from "@/lib/company/company-workers";
import {
  listAgencyConnections,
  listAgencyOfferProgress,
  listSharedRequestsForAgency,
} from "@/lib/agency/bridge-read";

import {
  AGENCY_CHAT_LIST_LIMIT,
  type AgencyBridgeChatResult,
  type AgencyChatProgressRow,
  type AgencyChatRosterWorker,
  type AgencyChatSharedRequest,
} from "@/lib/conversation/agency-workspace-contract";

/**
 * Agency chat-workspace READ adapter (real recruiter pilot, 2026-09-04).
 *
 * ─── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 * The first real recruiter typed "noriu pakviesti klientą" and the chat had
 * nothing to say: the agency bridge (connections, shared requests, roster,
 * offer progress) existed only as a dashboard section. Chat-first doctrine
 * makes the sentence the entry point, so the chat needs the SAME rows the
 * section renders — read through the SAME canonical adapters, never a second
 * projection.
 *
 * Deliberately the thinnest thing that can be: the employer resolver (M-P0-3,
 * membership-validated — the same one every employer write uses), the
 * creator-or-governing-member company read, and the three bridge reads +
 * the roster read the company page already performs. No ranking, no
 * filtering beyond a display cap, no write.
 *
 * ─── WHAT IT MAY NEVER DO ───────────────────────────────────────────────────
 * No PII beyond what the bridge section itself shows the same caller (client
 * invitation e-mails and roster labels are already on that page under RLS).
 * Every degraded state is a named kind, never an empty list pretending to be
 * "no data".
 */
export async function loadAgencyBridgeForChat(): Promise<AgencyBridgeChatResult> {
  const company = await requireEmployerCompany();
  if (!company.ok) return { kind: "no-company" };
  const companyRead = await getOwnedCompanyById(company.companyId);
  if (companyRead.kind === "needs-migration") return { kind: "needs-migration" };
  if (companyRead.kind !== "ok" || !companyRead.row) return { kind: "no-company" };
  if (companyRead.row.companyType !== "staffing_agency") return { kind: "not-agency" };
  const agencyCompanyId = companyRead.row.id;

  const [connections, shared, progress, roster, tBridge, tChat] = await Promise.all([
    listAgencyConnections(agencyCompanyId),
    listSharedRequestsForAgency(),
    listAgencyOfferProgress(),
    listActiveCompanyWorkers(agencyCompanyId),
    getTranslations("agencyBridge"),
    // P2 object language (L1): a person or a need the rows cannot name is
    // said in ordinary words, never as a raw id fragment.
    getTranslations("conversation.chat"),
  ]);

  if (
    connections.kind === "needs-migration" ||
    shared.kind === "needs-migration" ||
    progress.kind === "needs-migration" ||
    roster.kind === "needs-migration"
  ) {
    return { kind: "needs-migration" };
  }
  if (connections.kind !== "ok" || shared.kind !== "ok" || progress.kind !== "ok" || roster.kind !== "ok") {
    return { kind: "error" };
  }

  const rosterRows: AgencyChatRosterWorker[] = roster.rows
    .filter((w) => w.status === "active")
    .map((w) => ({
      workerId: w.workerId,
      label: w.displayName ?? (w.email ? w.email.split("@")[0] : tChat("unnamedPerson")),
    }));
  const rosterLabel = new Map(rosterRows.map((w) => [w.workerId, w.label]));

  // `SharedRequestRow.status` is the REQUEST's lifecycle status (submitted /
  // in_review / needs_followup / closed) — the share and the connection are
  // already filtered to `active` inside the RPC. Filtering here on
  // `status === "active"` (a value a request never has) hid EVERY shared
  // need from the chat: found on production 2026-09-04 when a client had
  // shared a submitted request and "pasiūlyk kandidatą" answered "no client
  // shared a need yet". A closed request is the one thing not to propose on.
  const sharedRows: AgencyChatSharedRequest[] = shared.rows
    .filter((s) => s.status !== "closed")
    .slice(0, AGENCY_CHAT_LIST_LIMIT)
    .map((s) => ({ shareId: s.shareId, requestId: s.requestId, title: s.title }));
  const titleByRequest = new Map(shared.rows.map((s) => [s.requestId, s.title]));

  const stage = (slug: string) => (tBridge.has(`stage.${slug}` as never) ? tBridge(`stage.${slug}` as never) : slug);
  const progressRows: AgencyChatProgressRow[] = progress.rows.slice(0, AGENCY_CHAT_LIST_LIMIT).map((p) => ({
    offerId: p.offerId,
    requestId: p.requestId,
    title: titleByRequest.get(p.requestId) ?? tChat("unnamedNeed"),
    workerLabel: rosterLabel.get(p.workerId) ?? tChat("unnamedPerson"),
    stageLabel: stage(p.reviewStage),
    decisionLabel:
      p.offerStatus === "accepted" || p.offerStatus === "declined"
        ? stage(`decision_${p.offerStatus}`)
        : null,
    offerStatus: p.offerStatus,
  }));

  return {
    kind: "ok",
    agencyCompanyId,
    connections: connections.rows
      .slice(0, AGENCY_CHAT_LIST_LIMIT)
      .map((c) => ({ id: c.id, invitedEmail: c.invitedEmail, status: c.status })),
    shared: sharedRows,
    roster: rosterRows,
    progress: progressRows,
  };
}
