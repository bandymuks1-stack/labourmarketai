/**
 * Commercial CRM — client-safe model (Wagon 10). Proposals + contracts over the
 * canonical demand/project facts. Invoices + payments live in the finance layer.
 */

export const PROPOSAL_STATUSES = ["draft", "sent", "accepted", "rejected", "withdrawn"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const CONTRACT_STATUSES = ["draft", "active", "completed", "cancelled"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export interface Proposal {
  readonly id: string;
  readonly number: string | null;
  readonly title: string;
  readonly amountCents: number;
  readonly status: ProposalStatus;
  readonly validityUntil: string | null;
}

export interface Contract {
  readonly id: string;
  readonly number: string | null;
  readonly title: string;
  readonly parties: string | null;
  readonly valueCents: number;
  readonly status: ContractStatus;
  readonly signedDocumentRef: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
}

export type CommercialData =
  | { applied: false }
  | { applied: true; proposals: Proposal[]; contracts: Contract[] };

export function isProposalStatus(v: unknown): v is ProposalStatus {
  return typeof v === "string" && (PROPOSAL_STATUSES as readonly string[]).includes(v);
}
export function isContractStatus(v: unknown): v is ContractStatus {
  return typeof v === "string" && (CONTRACT_STATUSES as readonly string[]).includes(v);
}
