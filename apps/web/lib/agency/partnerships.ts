import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  commissionFromRow,
  partnershipFromRow,
  proposalFromRow,
  type CandidateProposal,
  type Commission,
  type Partnership,
} from "./partnerships-model";

/**
 * THE AGENCY'S PARTNERSHIPS AND COMMISSIONS (register 4.30, migration
 * 20261118100000, RED, owner-gated). Reads only, under the caller's own
 * session; every rule is the database's.
 *
 * Until the migration is applied every read answers "unavailable" and the
 * section says so in one line — it never invents a partnership or an amount.
 */
export type PassedToMe = {
  readonly partnerShareId: string;
  readonly partnershipId: string;
  readonly leadName: string;
  readonly requestId: string;
  readonly title: string;
  readonly roleText: string | null;
  readonly country: string | null;
  readonly partnerSharePercent: number;
};

export type MyPass = {
  readonly partnerShareId: string;
  readonly partnershipId: string;
  readonly clientShareId: string;
};

export type AgencyCooperation =
  | {
      readonly kind: "ok";
      readonly partnerships: readonly Partnership[];
      readonly passedToMe: readonly PassedToMe[];
      readonly myPasses: readonly MyPass[];
      /** Partner candidates: for the lead to review, or the partner's own to follow. */
      readonly proposals: readonly CandidateProposal[];
      readonly commissions: readonly Commission[];
    }
  | { readonly kind: "unavailable" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (supabase: unknown): any => supabase;
type Rows = Record<string, unknown>[];

export async function readAgencyCooperation(): Promise<AgencyCooperation> {
  const supabase = await createClient();
  const [p, passed, mine, proposals, commissions] = await Promise.all([
    db(supabase).rpc("list_agency_partnerships_v1"),
    db(supabase).rpc("list_partner_shared_requests_v1"),
    db(supabase)
      .from("agency_partner_request_shares")
      .select("id, partnership_id, client_share_id")
      .eq("status", "active")
      .limit(500),
    db(supabase).rpc("list_partner_candidate_proposals_v1"),
    db(supabase).rpc("list_agency_commissions_v1"),
  ]);
  const errors = [p.error, passed.error, mine.error, proposals.error, commissions.error].filter(Boolean);
  // Not applied (or refused): one honest "unavailable", never a partial picture.
  if (errors.length > 0) return { kind: "unavailable" };
  return {
    kind: "ok",
    partnerships: ((p.data ?? []) as Rows).map(partnershipFromRow).filter((x): x is Partnership => x !== null),
    passedToMe: ((passed.data ?? []) as Rows).flatMap((r) => {
      const id = typeof r.partner_share_id === "string" ? r.partner_share_id : null;
      const pid = typeof r.partnership_id === "string" ? r.partnership_id : null;
      const req = typeof r.request_id === "string" ? r.request_id : null;
      const share = Number(r.partner_share_percent);
      if (!id || !pid || !req || !Number.isFinite(share)) return [];
      return [
        {
          partnerShareId: id,
          partnershipId: pid,
          leadName: typeof r.lead_name === "string" ? r.lead_name : "",
          requestId: req,
          title: typeof r.title === "string" ? r.title : "",
          roleText: typeof r.role_text === "string" ? r.role_text : null,
          country: typeof r.country === "string" ? r.country : null,
          partnerSharePercent: share,
        },
      ];
    }),
    myPasses: ((mine.data ?? []) as Rows).flatMap((r) =>
      typeof r.id === "string" && typeof r.partnership_id === "string" && typeof r.client_share_id === "string"
        ? [{ partnerShareId: r.id, partnershipId: r.partnership_id, clientShareId: r.client_share_id }]
        : [],
    ),
    proposals: ((proposals.data ?? []) as Rows)
      .map(proposalFromRow)
      .filter((x): x is CandidateProposal => x !== null),
    commissions: ((commissions.data ?? []) as Rows)
      .map(commissionFromRow)
      .filter((x): x is Commission => x !== null),
  };
}
