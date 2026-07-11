import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { listMyBookings } from "@/lib/booking/booking-actions";
import { listMyDocuments } from "@/lib/documents/readiness";
import { listMyFinanceRecords } from "@/lib/finance/finance";
import { listManagedProjects } from "@/lib/projects/projects";
import { listMyTasks } from "@/lib/tasks/tasks";
import { createClient } from "@/lib/supabase/server";
import {
  boundSearchGroups,
  buildSearchGroup,
  type DashboardSearchCandidate,
  type DashboardSearchGroup,
} from "@/lib/search/dashboard-search-model";

/**
 * Universal dashboard search — server composition (control room PR K,
 * capability gap map §11).
 *
 * Searches ONLY object types the caller can ALREADY read, through the SAME
 * RLS-scoped read helpers their pages use (no second read path, no new
 * privilege, NO admin client anywhere in this layer):
 *
 *  - projects       → listManagedProjects()      (owns_company RLS)
 *  - tasks          → listMyTasks()              (assignee/creator; degrades
 *                                                 until the D2 migration)
 *  - finance        → listMyFinanceRecords()     (creator/company owner;
 *                                                 degrades until I2)
 *  - conversations  → the communication page's own bounded participant-scoped
 *                     read (id + subject only — RLS limits rows to threads
 *                     the caller participates in)
 *  - bookings       → listMyBookings()           (owner or subject)
 *  - documents      → listMyDocuments()          (worker's OWN records;
 *                                                 disabled/no-worker → absent)
 *
 * DELIBERATELY ABSENT: any people search. No profiles table, no workers
 * table, no scouting/matching import — finding people stays the deterministic
 * scouting flow. Results return the caller's OWN row labels only, so nothing
 * here can leak another user's existence (RLS scopes every read anyway).
 *
 * Every source degrades independently to an absent group — an error or an
 * unapplied migration never fakes a result and never breaks the finder.
 * Read-only: no insert/update/delete/upsert, no RPC, no outbound call.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

/** Bounded fallback label for a row whose title/subject is empty. */
function fallbackLabel(id: string): string {
  return id.slice(0, 8);
}

async function searchOwnProjects(
  nq: string,
): Promise<DashboardSearchGroup | null> {
  try {
    const projects = await listManagedProjects();
    const candidates: DashboardSearchCandidate[] = projects.map((p) => ({
      id: p.id,
      label: p.title?.trim() ? p.title : fallbackLabel(p.id),
      href: `/dashboard/projects/${p.id}`,
      haystacks: [p.title, p.city],
    }));
    return buildSearchGroup("projects", candidates, nq);
  } catch {
    return null;
  }
}

async function searchOwnTasks(nq: string): Promise<DashboardSearchGroup | null> {
  try {
    const result = await listMyTasks();
    if (result.status !== "ok") return null; // needs-migration → honest absence
    const candidates: DashboardSearchCandidate[] = result.tasks.map((t) => ({
      id: t.id,
      label: t.title?.trim() ? t.title : fallbackLabel(t.id),
      href: "/dashboard/tasks",
      haystacks: [t.title],
    }));
    return buildSearchGroup("tasks", candidates, nq);
  } catch {
    return null;
  }
}

async function searchOwnFinance(
  nq: string,
): Promise<DashboardSearchGroup | null> {
  try {
    const result = await listMyFinanceRecords();
    if (result.status !== "ok") return null; // needs-migration → honest absence
    const candidates: DashboardSearchCandidate[] = result.records.map((r) => ({
      id: r.id,
      label: r.title?.trim() ? r.title : fallbackLabel(r.id),
      href: "/dashboard/finance",
      haystacks: [r.title, r.counterpartyName],
    }));
    return buildSearchGroup("finance", candidates, nq);
  } catch {
    return null;
  }
}

/** The communication page's own bounded list read (id + subject only). RLS
 *  limits rows to conversations the caller participates in. */
async function searchOwnConversations(
  nq: string,
): Promise<DashboardSearchGroup | null> {
  try {
    const supabase = await createClient();
    const res = await asAny(supabase)
      .from("conversations")
      .select("id, subject")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (res.error) return null;
    type Row = { id: string; subject: string | null };
    const candidates: DashboardSearchCandidate[] = (
      (res.data ?? []) as Row[]
    ).map((c) => ({
      id: c.id,
      label: c.subject?.trim() ? c.subject : fallbackLabel(c.id),
      href: `/dashboard/communication/${c.id}`,
      haystacks: [c.subject],
    }));
    return buildSearchGroup("conversations", candidates, nq);
  } catch {
    return null;
  }
}

async function searchOwnBookings(
  nq: string,
): Promise<DashboardSearchGroup | null> {
  try {
    const result = await listMyBookings();
    if (result.kind !== "ok") return null;
    const rows = [...result.incoming, ...result.outgoing];
    const candidates: DashboardSearchCandidate[] = rows.map((b) => ({
      id: b.id,
      label: b.roleText?.trim()
        ? b.roleText
        : b.note?.trim()
          ? b.note
          : fallbackLabel(b.id),
      href: "/dashboard/bookings",
      haystacks: [b.roleText, b.note],
    }));
    return buildSearchGroup("bookings", candidates, nq);
  } catch {
    return null;
  }
}

/** The worker's OWN document records (metadata only). The documents page's
 *  own ?type= filter is the exact destination. Non-workers / disabled /
 *  needs-migration → honest absence. */
async function searchOwnDocuments(
  nq: string,
): Promise<DashboardSearchGroup | null> {
  try {
    const result = await listMyDocuments();
    if (result.kind !== "ok") return null;
    const candidates: DashboardSearchCandidate[] = result.documents.map(
      (d) => ({
        id: d.id,
        label: d.country
          ? `${d.documentTypeSlug} — ${d.country}`
          : d.documentTypeSlug,
        href: `/dashboard/documents?type=${encodeURIComponent(d.documentTypeSlug)}`,
        haystacks: [d.documentTypeSlug, d.country],
      }),
    );
    return buildSearchGroup("documents", candidates, nq);
  } catch {
    return null;
  }
}

/**
 * All grouped results for one normalized query — each source independently,
 * bounded by the model's per-source and total caps.
 */
export async function getDashboardSearchGroups(
  nq: string,
): Promise<readonly DashboardSearchGroup[]> {
  const groups = await Promise.all([
    searchOwnProjects(nq),
    searchOwnTasks(nq),
    searchOwnFinance(nq),
    searchOwnConversations(nq),
    searchOwnBookings(nq),
    searchOwnDocuments(nq),
  ]);
  return boundSearchGroups(
    groups.filter((g): g is DashboardSearchGroup => g !== null),
  );
}
