import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Market Map — OWNER-SCOPED availability + capability signals.
 *
 * Reads ONLY the caller's own worker row and its skills/journal evidence via the
 * RLS-scoped client (workers.profile_id = auth.uid(); worker_skills /
 * journal_entry_skills are owns_worker-gated). No cross-user read, no public
 * aggregate, no privileged key, no coordinates. "confirmed" is set ONLY from a
 * real platform verification (worker_skills.verified); never a fake claim.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const COUNTRY_RE = /^[A-Z]{2}$/;
function normCountry(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const c = v.trim().toUpperCase();
  return COUNTRY_RE.test(c) ? c : null;
}

export type AvailabilityState = "available" | "busy" | "unavailable" | "unknown";

export interface OwnAvailability {
  /** Whether the caller has a worker profile at all. */
  hasWorker: boolean;
  state: AvailabilityState;
  /** ISO date the worker becomes available, when in the future; else null. */
  availableFrom: string | null;
  /** Where the worker is now (mobility origin). */
  currentCountry: string | null;
  /** Countries the worker is willing to work in (mobility). */
  preferredCountries: string[];
}

async function ownWorkerId(supabase: SupabaseClient, uid: string): Promise<string | null> {
  const { data } = await asAny(supabase)
    .from("workers")
    .select("id")
    .eq("profile_id", uid)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** The caller's own availability + mobility, or an empty "no worker" shape. */
export async function getOwnAvailability(): Promise<OwnAvailability> {
  const empty: OwnAvailability = {
    hasWorker: false,
    state: "unknown",
    availableFrom: null,
    currentCountry: null,
    preferredCountries: [],
  };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return empty;

  const { data } = await asAny(supabase)
    .from("workers")
    .select("id, availability_status, available_from, current_location_country, preferred_countries")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!data) return empty;

  const rawState = String(data.availability_status ?? "");
  const state: AvailabilityState =
    rawState === "available" || rawState === "busy" || rawState === "unavailable"
      ? rawState
      : "unknown";

  // available_from only matters when it's in the future (else "available now").
  const from = typeof data.available_from === "string" ? data.available_from.slice(0, 10) : null;
  const todayIso = new Date().toISOString().slice(0, 10);
  const availableFrom = from && from > todayIso ? from : null;

  const preferred = Array.isArray(data.preferred_countries)
    ? (data.preferred_countries as unknown[]).map(normCountry).filter((c): c is string => !!c)
    : [];

  return {
    hasWorker: true,
    state,
    availableFrom,
    currentCountry: normCountry(data.current_location_country),
    preferredCountries: preferred,
  };
}

export type CapabilityStatus = "confirmed" | "suggested" | "self_declared";

export interface CapabilitySignal {
  skillId: string;
  /** Catalogue slug (the canonical skill name source; ESCO dropped name_* cols). */
  slug: string | null;
  category: string | null;
  status: CapabilityStatus;
  // NOTE (consolidation slice 1, 2026-08-17): `selfRatedLevel` was removed.
  // worker_skills.self_rated_level has never held a value in production
  // (0 of 48 rows, zero writers) and a numeric self-score conflicts with the
  // evidence-tier doctrine ("record count, never a competence score"). The
  // column stays frozen, undropped —
  // docs/audits/duplication-freeze-register-2026-08-17.md.
}

export interface OwnCapabilities {
  hasWorker: boolean;
  signals: CapabilitySignal[];
  counts: Record<CapabilityStatus, number>;
}

/**
 * The caller's own capability signals, each tagged self_declared / suggested /
 * confirmed. "confirmed" requires a real verification flag; "suggested" means
 * the skill carries real journal-work evidence but isn't verified.
 */
export async function getOwnCapabilities(limit = 18): Promise<OwnCapabilities> {
  const empty: OwnCapabilities = {
    hasWorker: false,
    signals: [],
    counts: { confirmed: 0, suggested: 0, self_declared: 0 },
  };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return empty;
  const workerId = await ownWorkerId(supabase, user.id);
  if (!workerId) return empty;

  // Skills the worker has self-listed (with verification flag + skill slug).
  const { data: ws } = await asAny(supabase)
    .from("worker_skills")
    .select("skill_id, verified, skills(slug, category)")
    .eq("worker_id", workerId);

  // Skills evidenced by real journal work (distinct skill ids).
  const { data: jes } = await asAny(supabase)
    .from("journal_entry_skills")
    .select("skill_id")
    .eq("worker_id", workerId);
  const evidenced = new Set(
    (Array.isArray(jes) ? jes : []).map((r: Record<string, unknown>) => String(r.skill_id)),
  );

  const byId = new Map<string, CapabilitySignal>();
  for (const r of Array.isArray(ws) ? ws : []) {
    const id = String(r.skill_id);
    const skill = (r.skills ?? {}) as Record<string, unknown>;
    const verified = r.verified === true;
    const status: CapabilityStatus = verified
      ? "confirmed"
      : evidenced.has(id)
        ? "suggested"
        : "self_declared";
    byId.set(id, {
      skillId: id,
      slug: (skill.slug as string | null) ?? null,
      category: (skill.category as string | null) ?? null,
      status,
    });
  }

  // Skills that ONLY appear as journal evidence (not self-listed) → suggested.
  const journalOnly = [...evidenced].filter((id) => !byId.has(id));
  if (journalOnly.length > 0) {
    const { data: extra } = await asAny(supabase)
      .from("skills")
      .select("id, slug, category")
      .in("id", journalOnly);
    for (const s of Array.isArray(extra) ? extra : []) {
      const id = String(s.id);
      byId.set(id, {
        skillId: id,
        slug: (s.slug as string | null) ?? null,
        category: (s.category as string | null) ?? null,
        status: "suggested",
      });
    }
  }

  const order: Record<CapabilityStatus, number> = { confirmed: 0, suggested: 1, self_declared: 2 };
  const all = [...byId.values()].sort((a, b) => order[a.status] - order[b.status]);
  const counts: Record<CapabilityStatus, number> = { confirmed: 0, suggested: 0, self_declared: 0 };
  for (const s of all) counts[s.status] += 1;

  return { hasWorker: true, signals: all.slice(0, limit), counts };
}
