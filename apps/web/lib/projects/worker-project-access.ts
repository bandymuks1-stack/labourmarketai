import "server-only";

import { createClient } from "@/lib/supabase/server";
import { listMyDocuments } from "@/lib/documents/readiness";
import { listWorkerInstructions } from "@/lib/instructions/instructions";
import { deriveWorkerProjectAsks, type WorkerProjectAsk } from "@/lib/projects/worker-project-asks";

/**
 * Worker-side project access (F11 / RC2 — role-aware project routing).
 *
 * Production finding: a worker who opened a project card landed on a dead
 * "Ši lenta skirta įmonės ar agentūros vadovui." page. The manager surfaces
 * (stadium / operations) stay manager-gated, but an ASSIGNED worker must get
 * a real, permission-scoped view of their own project instead of a dead end.
 *
 * Everything here reads only rows the session's RLS already allows:
 *   - `workers` — the caller's own worker row (profile_id = auth.uid()).
 *   - `project_worker_assignments` — pwa_select lets a worker read exactly
 *     their own assignment rows (owns_worker), never teammates'.
 *   - `projects` — projects_select exposes live projects to any
 *     authenticated user; draft/paused/closed stay manager-only, and the
 *     view degrades honestly when the row is not readable.
 *
 * No migration, no new grant, no fake team data: a worker cannot read
 * teammates' assignments under RLS, so the worker view deliberately does
 * NOT show a team list it could only fake.
 */

export interface WorkerAssignment {
  readonly assignmentId: string;
  readonly status: "active" | "ended";
  readonly assignedAt: string;
  readonly endedAt: string | null;
}

export interface WorkerProjectView {
  readonly assignment: WorkerAssignment;
  /** Null when the project row is not RLS-readable (e.g. no longer live). */
  readonly project: {
    readonly id: string;
    readonly title: string | null;
    readonly status: string | null;
    readonly city: string | null;
    readonly country: string | null;
    readonly startDate: string | null;
    readonly endDate: string | null;
  } | null;
}

export interface WorkerProjectListItem {
  readonly projectId: string;
  readonly title: string | null;
  readonly status: string | null;
  readonly city: string | null;
  readonly country: string | null;
  readonly assignmentStatus: "active" | "ended";
  readonly assignedAt: string;
}

/** The caller's own worker id, or null when they have no worker row. */
export async function getOwnWorkerId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * The caller's own assignment on this project + the project facts their
 * session may read. Null when the caller is not assigned to the project.
 */
export async function getWorkerProjectView(
  projectId: string,
): Promise<WorkerProjectView | null> {
  const workerId = await getOwnWorkerId();
  if (!workerId) return null;

  const supabase = await createClient();
  const { data: assignment } = await supabase
    .from("project_worker_assignments")
    .select("id, status, assigned_at, ended_at")
    .eq("project_id", projectId)
    .eq("worker_id", workerId)
    .maybeSingle();
  if (!assignment) return null;

  const { data: project } = await supabase
    .from("projects")
    .select("id, title, status, city, country, start_date, end_date")
    .eq("id", projectId)
    .maybeSingle();

  return {
    assignment: {
      assignmentId: assignment.id as string,
      status: (assignment.status as "active" | "ended") ?? "active",
      assignedAt: assignment.assigned_at as string,
      endedAt: (assignment.ended_at as string | null) ?? null,
    },
    project: project
      ? {
          id: project.id as string,
          title: (project.title as string | null) ?? null,
          status: (project.status as string | null) ?? null,
          city: (project.city as string | null) ?? null,
          country: (project.country as string | null) ?? null,
          startDate: (project.start_date as string | null) ?? null,
          endDate: (project.end_date as string | null) ?? null,
        }
      : null,
  };
}

/** All projects the caller is or was assigned to (own assignments only). */
export async function listWorkerProjects(): Promise<WorkerProjectListItem[]> {
  const workerId = await getOwnWorkerId();
  if (!workerId) return [];

  const supabase = await createClient();
  const { data: assignments } = await supabase
    .from("project_worker_assignments")
    .select("project_id, status, assigned_at")
    .eq("worker_id", workerId)
    .order("assigned_at", { ascending: false });
  if (!assignments || assignments.length === 0) return [];

  const ids = assignments.map((a) => a.project_id as string);
  const { data: projects } = await supabase
    .from("projects")
    .select("id, title, status, city, country")
    .in("id", ids);
  const byId = new Map(
    (projects ?? []).map((p) => [p.id as string, p] as const),
  );

  return assignments.map((a) => {
    const p = byId.get(a.project_id as string);
    return {
      projectId: a.project_id as string,
      title: (p?.title as string | null) ?? null,
      status: (p?.status as string | null) ?? null,
      city: (p?.city as string | null) ?? null,
      country: (p?.country as string | null) ?? null,
      assignmentStatus: (a.status as "active" | "ended") ?? "active",
      assignedAt: a.assigned_at as string,
    };
  });
}

/**
 * The manager's checklist rows for the PERSON on their own projects (owner
 * contract §11/§12: "what does the project still need from me?"). `pwri_select`
 * admits exactly the caller's own rows (owns_worker), so a worker reads their
 * own asks and never a teammate's. Only the still-open rows (needed / missing /
 * rejected / expired), bounded; the checklist page's own table, no write.
 *
 * Scale (owner constraint §1b): indexed by `worker_id`
 * (idx_project_worker_readiness_items_worker_id) and the caller's own project
 * ids; hard limit; never a project's whole checklist.
 */
export interface OwnReadinessItem {
  readonly projectId: string;
  readonly itemKey: string;
  readonly label: string;
  readonly status: "needed" | "missing" | "rejected" | "expired";
  readonly updatedAt: string;
}

export const OWN_READINESS_ITEMS_LIMIT = 40;
const OPEN_READINESS_STATUSES = ["needed", "missing", "rejected", "expired"] as const;
/** Every status the manager can hold a row in except `not_required` — the
 *  requirement ledger (lib/player-card/requirement-ledger) reads these so the
 *  person's "N of M" also counts the rows the manager already received /
 *  checked. The default (open rows only) is unchanged for the asks. */
export const LEDGER_READINESS_STATUSES = ["needed", "missing", "received", "checked", "rejected", "expired"] as const;

export interface OwnReadinessLedgerItem extends Omit<OwnReadinessItem, "status"> {
  readonly status: (typeof LEDGER_READINESS_STATUSES)[number];
}

export async function listOwnReadinessItems(
  workerId: string,
  projectIds: readonly string[],
): Promise<OwnReadinessItem[]>;
export async function listOwnReadinessItems(
  workerId: string,
  projectIds: readonly string[],
  options: { readonly statuses: typeof LEDGER_READINESS_STATUSES },
): Promise<OwnReadinessLedgerItem[]>;
export async function listOwnReadinessItems(
  workerId: string,
  projectIds: readonly string[],
  options?: { readonly statuses: readonly string[] },
): Promise<OwnReadinessItem[] | OwnReadinessLedgerItem[]> {
  if (!workerId || projectIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_worker_readiness_items")
    .select("project_id, item_key, label, status, updated_at")
    .eq("worker_id", workerId)
    .in("project_id", projectIds.slice(0, 10))
    .in("status", [...(options?.statuses ?? OPEN_READINESS_STATUSES)])
    .order("updated_at", { ascending: false })
    .limit(OWN_READINESS_ITEMS_LIMIT);
  if (error || !data) return [];
  return data.map((r) => ({
    projectId: r.project_id as string,
    itemKey: r.item_key as string,
    label: r.label as string,
    status: r.status as OwnReadinessLedgerItem["status"],
    updatedAt: r.updated_at as string,
  }));
}

/**
 * WHAT MY PROJECTS STILL NEED FROM ME — the ONE domain read both the chat
 * ("mano projektai") and the instructions page render (owner contract §11 /
 * §12 / §16; chat-first, not chat-only — no chat-specific business workflow).
 * Composes three existing canonical reads under the caller's RLS: the
 * person's own open checklist rows (`listOwnReadinessItems`), the person's
 * own documents (`listMyDocuments`, the documents page's read; an
 * unanswered read is UNKNOWN, never "no documents"), and the manager's
 * latest instruction per project (`listWorkerInstructions`, the instructions
 * page's read — only threads the person is in). A manager never reads a
 * person's documents through this path (§4 default-closed).
 */
export interface OwnProjectAsks {
  readonly asks: readonly WorkerProjectAsk[];
  readonly instruction: { readonly conversationId: string; readonly authorName: string | null; readonly text: string } | null;
}

export async function loadOwnProjectAsks(projectIds: readonly string[]): Promise<Map<string, OwnProjectAsks>> {
  const out = new Map<string, OwnProjectAsks>();
  const ids = [...new Set(projectIds)].slice(0, 10);
  if (ids.length === 0) return out;
  const workerId = await getOwnWorkerId();
  if (!workerId) return out;
  const [items, docs, read] = await Promise.all([listOwnReadinessItems(workerId, ids), listMyDocuments(), listWorkerInstructions()]);
  const asks = items.length > 0 ? deriveWorkerProjectAsks(items, docs.kind === "ok" ? docs.documents : null, new Date()) : new Map<string, WorkerProjectAsk[]>();
  const instructions = new Map<string, OwnProjectAsks["instruction"]>();
  if (read.kind === "ok") {
    for (const ins of read.instructions) {
      if (ins.projectId && !instructions.has(ins.projectId)) {
        instructions.set(ins.projectId, { conversationId: ins.conversationId, authorName: ins.authorName, text: ins.originalText.split("\n")[0].slice(0, 160) });
      }
    }
  }
  for (const id of ids) {
    const a = asks.get(id) ?? [];
    const ins = instructions.get(id) ?? null;
    if (a.length > 0 || ins) out.set(id, { asks: a, instruction: ins });
  }
  return out;
}
