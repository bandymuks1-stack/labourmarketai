/**
 * Agency client management — pure model (canonical journey P5).
 *
 * Direction A (owner decision 2026-07-05): an agency IS the canonical company
 * profile with companies.company_type='staffing_agency'. A "client" here is a
 * private CRM record the agency keeps about who it staffs FOR — never a third
 * identity, never a login, never a parallel candidate or demand model.
 *
 * Reuse facts (investigated 2026-07-13, see migration
 * 20260713160000_agency_clients_v1.sql for the full record):
 *   - public.customers (0026) is a SELF-owned buyer identity with
 *     `unique (profile_id)` — one row per profile, ownership direction
 *     inverted from what an agency needs. It CANNOT hold N client records.
 *   - customer_requests.customer_id is auto-resolved to the caller's own
 *     customers row inside save_customer_request only; save_demand_draft /
 *     submit_demand_request never write it. Not usable as a client link.
 *   - Therefore client records + the demand→client link live behind the
 *     OWNER-GATED draft migration; until applied the UI degrades honestly.
 *
 * This module is pure (no server imports) so the validation and grouping
 * logic is unit-testable.
 */

export interface AgencyClient {
  readonly id: string;
  readonly name: string;
  readonly contactName: string | null;
  readonly contactEmail: string | null;
  readonly note: string | null;
  readonly createdAt: string;
}

/** One of the agency's own demands on the canonical customer_requests table. */
export interface AgencyDemandRow {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  /** Null when unlinked OR when the link column does not exist yet. */
  readonly agencyClientId: string | null;
  readonly createdAt: string;
}

export type AgencyClientsState =
  | { kind: "ok"; rows: readonly AgencyClient[] }
  | { kind: "needs-migration" }
  | { kind: "error" };

export type AgencyDemandsState =
  | {
      kind: "ok";
      /** False while the owner-gated migration is unapplied — demands render
       *  as "not yet linkable", never as fake linked state. */
      linkable: boolean;
      rows: readonly AgencyDemandRow[];
    }
  | { kind: "error" };

/** Postgres/PostgREST codes meaning "the owner-gated schema is not applied". */
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);
const MISSING_COLUMN_CODES = new Set(["42703"]);
const MISSING_RPC_CODES = new Set(["42883", "PGRST202"]);

export function isMissingTableCode(code: string | null | undefined): boolean {
  return typeof code === "string" && MISSING_TABLE_CODES.has(code);
}

export function isMissingColumnCode(code: string | null | undefined): boolean {
  return typeof code === "string" && MISSING_COLUMN_CODES.has(code);
}

export function isMissingRpcCode(code: string | null | undefined): boolean {
  return typeof code === "string" && MISSING_RPC_CODES.has(code);
}

export interface AgencyClientInput {
  readonly name: string;
  readonly contactName?: string | null;
  readonly contactEmail?: string | null;
  readonly note?: string | null;
}

export type AgencyClientValidation =
  | {
      ok: true;
      value: {
        name: string;
        contactName: string | null;
        contactEmail: string | null;
        note: string | null;
      };
    }
  | { ok: false; reason: "name" | "contactName" | "contactEmail" | "note" };

/** Mirrors the server-side checks in save_agency_client_v1 exactly. */
export function validateAgencyClientInput(
  input: AgencyClientInput,
): AgencyClientValidation {
  const name = (input.name ?? "").trim();
  if (name.length < 2 || name.length > 160) return { ok: false, reason: "name" };

  const contactName = (input.contactName ?? "").trim() || null;
  if (contactName && contactName.length > 120) {
    return { ok: false, reason: "contactName" };
  }

  const contactEmail = (input.contactEmail ?? "").trim() || null;
  if (contactEmail && (contactEmail.length > 200 || contactEmail.indexOf("@") < 1)) {
    return { ok: false, reason: "contactEmail" };
  }

  const note = (input.note ?? "").trim() || null;
  if (note && note.length > 500) return { ok: false, reason: "note" };

  return { ok: true, value: { name, contactName, contactEmail, note } };
}

export interface DemandsByClient {
  /** clientId → that client's linked demands (input order preserved). */
  readonly byClient: ReadonlyMap<string, readonly AgencyDemandRow[]>;
  /** Demands with no client link (or an unknown/stale client id). */
  readonly unassigned: readonly AgencyDemandRow[];
}

export function groupDemandsByClient(
  clients: readonly AgencyClient[],
  demands: readonly AgencyDemandRow[],
): DemandsByClient {
  const known = new Set(clients.map((c) => c.id));
  const byClient = new Map<string, AgencyDemandRow[]>();
  const unassigned: AgencyDemandRow[] = [];
  for (const d of demands) {
    if (d.agencyClientId && known.has(d.agencyClientId)) {
      const list = byClient.get(d.agencyClientId) ?? [];
      list.push(d);
      byClient.set(d.agencyClientId, list);
    } else {
      unassigned.push(d);
    }
  }
  return { byClient, unassigned };
}

/** Visual tone per canonical customer_requests status — display only. */
export function demandStatusTone(
  status: string,
): "muted" | "info" | "warning" | "success" {
  switch (status) {
    case "approved":
      return "success";
    case "submitted":
    case "in_review":
      return "info";
    case "needs_followup":
      return "warning";
    default:
      // draft, closed, anything unknown — quiet.
      return "muted";
  }
}
