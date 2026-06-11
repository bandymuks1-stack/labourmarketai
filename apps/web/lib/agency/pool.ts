import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  getOwnAgency,
  listActiveAgencyWorkers,
  type OwnAgency,
} from "@/lib/agency/agency-workers";

/**
 * S5 — Agency Worker Pool read service. UI/wiring sprint on the EXISTING
 * agency primitives (0025/0030–0033/0036 RPC chain) — no new model.
 *
 * Default-closed honesty (doctrine §4 + handoff S5):
 *   - the pool is ALWAYS the caller's own agency (getOwnAgency gate +
 *     owns_agency RLS behind every row) — a foreign pool reads as empty;
 *   - journal evidence (entries + manager confirmations) is readable ONLY
 *     through the engagement bridge the owner provisioned (manages_
 *     organization RLS). For an unlinked worker the evidence is reported as
 *     LOCKED (null) — never a fake zero;
 *   - worker documents are NEVER read here (owner-only RLS). Country
 *     readiness is an AGGREGATE of availability + declared countries only;
 *     document-level readiness waits for the consent switch (draft + gate);
 *   - demand positioning rides the S5 draft RPCs
 *     (list_open_demand_for_agencies / mark_agency_can_offer) and degrades
 *     to an honest needs-gate state until the owner applies the draft.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export interface PoolWorkerCard {
  readonly workerId: string;
  readonly profileId: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly invitedAt: string;
  readonly availabilityStatus: string | null;
  readonly locationCountry: string | null;
  readonly preferredCountries: readonly string[];
  readonly professionSlugs: readonly string[];
  /** Real engagement-bridge state (the existing visibility levers). */
  readonly engagementContextLinked: boolean;
  readonly journalReviewEnabled: boolean;
  /** Journal evidence via the bridge; null = NOT READABLE yet (locked),
   *  never a fabricated zero. */
  readonly journalEntries: number | null;
  readonly managerConfirmations: number | null;
}

export interface CountryReadinessRow {
  readonly country: string;
  readonly workers: number;
  readonly availableNow: number;
}

export interface OpenDemandRow {
  readonly id: string;
  readonly roleText: string | null;
  readonly country: string | null;
  readonly teamSize: number | null;
  readonly startPeriod: string | null;
  readonly duration: string | null;
  readonly createdAt: string;
  readonly canOfferMarked: boolean;
}

export type AgencyPoolResult =
  | {
      kind: "ok";
      agency: OwnAgency;
      workers: readonly PoolWorkerCard[];
      readiness: readonly CountryReadinessRow[];
      demand:
        | { kind: "ok"; rows: readonly OpenDemandRow[] }
        | { kind: "needs-gate" };
    }
  | { kind: "no-agency" }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

const RPC_NOT_FOUND = new Set(["42883", "PGRST202"]);

export async function getAgencyPool(): Promise<AgencyPoolResult> {
  const agency = await getOwnAgency();
  if (!agency) return { kind: "no-agency" };

  const linked = await listActiveAgencyWorkers(agency.id);
  if (linked.kind === "needs-migration") return { kind: "needs-migration" };
  if (linked.kind === "error") return { kind: "error", message: linked.message };

  const supabase = await createClient();
  const workerIds = linked.rows.map((r) => r.workerId);

  // Worker card columns + professions — RLS-scoped attempts; a closed read
  // degrades to empty (we render what the session may really see).
  const workerMeta = new Map<
    string,
    {
      availability: string | null;
      location: string | null;
      preferred: string[];
    }
  >();
  const professions = new Map<string, string[]>();
  if (workerIds.length > 0) {
    try {
      const [wRes, wpRes] = await Promise.all([
        asAny(supabase)
          .from("workers")
          .select(
            "id, availability_status, current_location_country, preferred_countries",
          )
          .in("id", workerIds),
        asAny(supabase)
          .from("worker_professions")
          .select("worker_id, professions(slug)")
          .in("worker_id", workerIds),
      ]);
      for (const w of (wRes.data ?? []) as {
        id: string;
        availability_status: string | null;
        current_location_country: string | null;
        preferred_countries: string[] | null;
      }[]) {
        workerMeta.set(w.id, {
          availability: w.availability_status ?? null,
          location: w.current_location_country ?? null,
          preferred: Array.isArray(w.preferred_countries)
            ? w.preferred_countries
            : [],
        });
      }
      for (const r of (wpRes.data ?? []) as {
        worker_id: string;
        professions: { slug: string | null } | null;
      }[]) {
        const slug = r.professions?.slug;
        if (!slug) continue;
        const list = professions.get(r.worker_id) ?? [];
        list.push(slug);
        professions.set(r.worker_id, list);
      }
    } catch {
      // closed reads stay empty — honest
    }
  }

  // Journal evidence ONLY for bridge-linked workers (manages_organization
  // RLS); unlinked workers stay null = locked, never a fake zero.
  const linkedIds = linked.rows
    .filter((r) => r.engagementContextLinked)
    .map((r) => r.workerId);
  const entriesByWorker = new Map<string, number>();
  const confirmationsByWorker = new Map<string, number>();
  if (linkedIds.length > 0) {
    try {
      const { data: entryRows } = await asAny(supabase)
        .from("journal_entries")
        .select("id, worker_id")
        .in("worker_id", linkedIds);
      const entryIds: string[] = [];
      const entryWorker = new Map<string, string>();
      for (const e of (entryRows ?? []) as { id: string; worker_id: string }[]) {
        entriesByWorker.set(
          e.worker_id,
          (entriesByWorker.get(e.worker_id) ?? 0) + 1,
        );
        entryIds.push(e.id);
        entryWorker.set(e.id, e.worker_id);
      }
      for (const id of linkedIds) {
        entriesByWorker.set(id, entriesByWorker.get(id) ?? 0);
        confirmationsByWorker.set(id, 0);
      }
      if (entryIds.length > 0) {
        const { data: confRows } = await asAny(supabase)
          .from("journal_entry_confirmations")
          .select("entry_id")
          .in("entry_id", entryIds);
        for (const c of (confRows ?? []) as { entry_id: string }[]) {
          const wid = entryWorker.get(c.entry_id);
          if (!wid) continue;
          confirmationsByWorker.set(
            wid,
            (confirmationsByWorker.get(wid) ?? 0) + 1,
          );
        }
      }
    } catch {
      // bridge reads failed → stay locked (null)
    }
  }

  const workers: PoolWorkerCard[] = linked.rows.map((r) => {
    const meta = workerMeta.get(r.workerId);
    return {
      workerId: r.workerId,
      profileId: r.profileId,
      name: r.displayName,
      email: r.email,
      invitedAt: r.createdAt,
      availabilityStatus: meta?.availability ?? null,
      locationCountry: meta?.location ?? null,
      preferredCountries: meta?.preferred ?? [],
      professionSlugs: professions.get(r.workerId) ?? [],
      engagementContextLinked: r.engagementContextLinked,
      journalReviewEnabled: r.journalReviewEnabled,
      journalEntries: entriesByWorker.get(r.workerId) ?? null,
      managerConfirmations: confirmationsByWorker.get(r.workerId) ?? null,
    };
  });

  // Country readiness — AGGREGATES ONLY (availability + declared countries);
  // never a document read (owner-only RLS; consent switch = draft + gate).
  const byCountry = new Map<string, { workers: Set<string>; available: Set<string> }>();
  for (const w of workers) {
    const targets = new Set(
      [w.locationCountry, ...w.preferredCountries]
        .filter((c): c is string => !!c)
        .map((c) => c.toUpperCase()),
    );
    for (const c of targets) {
      const cell = byCountry.get(c) ?? {
        workers: new Set<string>(),
        available: new Set<string>(),
      };
      cell.workers.add(w.workerId);
      if (w.availabilityStatus === "available") cell.available.add(w.workerId);
      byCountry.set(c, cell);
    }
  }
  const readiness: CountryReadinessRow[] = [...byCountry.entries()]
    .map(([country, cell]) => ({
      country,
      workers: cell.workers.size,
      availableNow: cell.available.size,
    }))
    .sort((a, b) => b.workers - a.workers || a.country.localeCompare(b.country));

  // Open demand via the S5 draft RPC — honest needs-gate state until applied.
  let demand: Extract<AgencyPoolResult, { kind: "ok" }>["demand"] = {
    kind: "needs-gate",
  };
  try {
    const { data, error } = await asAny(supabase).rpc(
      "list_open_demand_for_agencies",
    );
    if (!error && Array.isArray(data)) {
      demand = {
        kind: "ok",
        rows: (data as {
          id: string;
          role_text: string | null;
          country: string | null;
          team_size: number | null;
          start_period: string | null;
          duration: string | null;
          created_at: string;
          can_offer_marked: boolean;
        }[]).map((r) => ({
          id: r.id,
          roleText: r.role_text,
          country: r.country,
          teamSize: r.team_size,
          startPeriod: r.start_period,
          duration: r.duration,
          createdAt: r.created_at,
          canOfferMarked: Boolean(r.can_offer_marked),
        })),
      };
    } else if (error && !RPC_NOT_FOUND.has(error.code ?? "")) {
      demand = { kind: "needs-gate" };
    }
  } catch {
    demand = { kind: "needs-gate" };
  }

  return { kind: "ok", agency, workers, readiness, demand };
}

export type MarkCanOfferOutcome =
  | "marked"
  | "already_marked"
  | "not_agency"
  | "request_not_found"
  | "request_not_open"
  | "needs_gate"
  | "error";

/** "Galim pasiūlyti" — an agency PROPOSAL marker, never a match (the match
 *  decision stays human at the workbench/draft board). Draft RPC; honest
 *  needs_gate until applied. */
export async function markAgencyCanOffer(
  requestId: string,
  note: string | null,
): Promise<MarkCanOfferOutcome> {
  try {
    const supabase = await createClient();
    const { data, error } = await asAny(supabase).rpc("mark_agency_can_offer", {
      p_request_id: requestId,
      p_note: note,
    });
    if (error) {
      return RPC_NOT_FOUND.has(error.code ?? "") ? "needs_gate" : "error";
    }
    const out = String(data ?? "");
    if (
      ["marked", "already_marked", "not_agency", "request_not_found", "request_not_open"].includes(out)
    ) {
      return out as MarkCanOfferOutcome;
    }
    return "error";
  } catch {
    return "error";
  }
}
