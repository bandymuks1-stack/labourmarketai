import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import { requireEmployerCompanyForCaller } from "@/lib/company/employer-company-context";
import { listActiveCompanyWorkers } from "@/lib/company/company-workers";
import { hasOrganizationCapability } from "@/lib/company/role-capabilities";
import { isDemandKind } from "@/lib/demand/market-direction";
import { readDuplicateProjectIds } from "@/lib/projects/projects";
import { closeDemand, reopenDemand } from "@/lib/demand/demand-lifecycle";
import { canCloseFrom, canReopenFrom } from "@/lib/demand/demand-lifecycle-model";
import {
  insertProjectForCompany,
  PROJECT_TITLE_MAX,
  PROJECT_TITLE_MIN,
} from "@/lib/projects/create-project-core";
import {
  canTransition,
  isTerminalStatus,
  nextStatuses,
  PROJECT_STATUSES,
} from "@/lib/projects/project-lifecycle-model";
import {
  currentReceiptCollisions,
  keepOverrideCore,
  reservationVerdictFor,
} from "@/lib/projects/override-keep-core";
import { OVERRIDE_REASON_CODES } from "@/lib/projects/override-receipt-model";
import type { ExecResult } from "@/lib/conversation/executor-contract";

import {
  mintCapabilityConfirmation,
  verifyCapabilityConfirmation,
} from "./confirmable";
import type { CapabilityCaller, CapabilityDescriptor } from "./contract";
import { demandContextRefusal } from "./employer-context-refusal";

/**
 * EMPLOYER OPERATIONS — the company side of the work graph for an authorized
 * assistant: what this organization needs (demand), who it has (roster),
 * where they work (projects + assignments), and what waits for its review
 * (journal entries its people wrote).
 *
 * Nothing here is a second implementation. Every read is the SAME query the
 * web surface runs, on the caller's own RLS-scoped client, behind the SAME
 * employer gate (`requireEmployerCompanyForCaller` — the bearer twin of the
 * cookie chain). Every write goes through the SAME core or RPC the web form
 * calls (`insertProjectForCompany`, `assign_worker_to_project`,
 * `end_worker_project_assignment`), whose database gates
 * (`can_manage_project`, roster/booking authority) still decide. The
 * organization is always the caller's ACTIVE workspace, re-resolved at
 * confirm time — never an id a client supplies.
 *
 * Writes are draft → confirm. The draft reads, validates and names the exact
 * organization, project and person in its preview, and mints a one-time
 * token bound to that organization and the current assignment state; only
 * the confirm writes.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: CapabilityCaller["supabase"]): any {
  return c;
}

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const PG_UNDEFINED = new Set(["42883", "42P01", "42703", "PGRST202"]);

function rpcFailure(error: { code?: string; message?: string } | null): ExecResult {
  const code = error?.code;
  if (code && PG_UNDEFINED.has(code)) {
    return { ok: false, code: "needs_migration", message: "This operation is not enabled on this environment." };
  }
  if (code === "42501") {
    return {
      ok: false,
      code: "not_authorized",
      message:
        "The database refused: the caller must manage this project AND the person must be on this organization's active roster (or hold an accepted booking for this project).",
    };
  }
  if (code === "P0002") return { ok: false, code: "not_found", message: "No such worker." };
  if (code === "22023") {
    return { ok: false, code: "invalid", message: error?.message ?? "Invalid project or worker." };
  }
  return { ok: false, code: "unavailable", message: "The write failed." };
}

async function employerOrRefusal(caller: CapabilityCaller) {
  const employer = await requireEmployerCompanyForCaller(caller);
  return employer;
}

// ── demand.list ────────────────────────────────────────────────────────────

const demandListInput = z
  .object({
    includeClosed: z.boolean().optional(),
  })
  .strict();

const demandList: CapabilityDescriptor = {
  id: "demand.list",
  kind: "read",
  title: "This organization's worker needs",
  description:
    "Lists the worker-needs (demand) of the organization the caller is ACTING " +
    "FOR — the caller's own plus colleagues' needs stamped with that " +
    "organization — newest first, at most 50. Each carries its status and two " +
    "counts read from real rows: people who expressed interest, and shortlist " +
    "entries. An agency's own supply offer is never listed as a need. Closed " +
    "needs are omitted unless includeClosed is true. Writes nothing.",
  exposed: true,
  annotations: readOnly,
  inputSchema: demandListInput,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = demandListInput.parse(input);
    const employer = await employerOrRefusal(caller);
    if (!employer.ok) return demandContextRefusal(employer.reason);

    // THE same read as `listCompanyDemands` (scouting) — own rows plus rows
    // stamped with the active organization; the SELECT policy decides.
    const { data, error } = await asAny(caller.supabase)
      .from("customer_requests")
      .select(
        "id, title, status, kind, country, location, role_or_work_type, team_size, start_period, duration, created_at",
      )
      .or(`profile_id.eq.${caller.userId},organization_id.eq.${employer.organizationId}`)
      .order("created_at", { ascending: false })
      .limit(50);
    // FAILED ≠ EMPTY (SEP-7).
    if (error) return { ok: false, code: "unavailable", message: "The demand read failed." };

    type Row = {
      id: string;
      title: string | null;
      status: string | null;
      kind: string | null;
      country: string | null;
      location: string | null;
      role_or_work_type: string | null;
      team_size: number | null;
      start_period: string | null;
      duration: string | null;
      created_at: string;
    };
    const rows = ((data ?? []) as Row[])
      // DIRECTION (SEP-4): classified, never guessed — an unrecognised kind
      // is dropped, exactly as the scouting read does.
      .filter((r) => isDemandKind(r.kind))
      .filter((r) => parsed.includeClosed || r.status !== "closed");

    const ids = rows.map((r) => r.id);
    let countsKnown = true;
    const interest = new Map<string, number>();
    const shortlist = new Map<string, number>();
    if (ids.length > 0) {
      const [sig, sl] = await Promise.all([
        asAny(caller.supabase)
          .from("demand_interest_signals")
          .select("request_id, status")
          .in("request_id", ids),
        asAny(caller.supabase).from("demand_shortlist").select("request_id").in("request_id", ids),
      ]);
      if (sig.error || sl.error) countsKnown = false;
      for (const r of (sig.data ?? []) as { request_id: string; status: string | null }[]) {
        if (r.status === "withdrawn") continue;
        interest.set(r.request_id, (interest.get(r.request_id) ?? 0) + 1);
      }
      for (const r of (sl.data ?? []) as { request_id: string }[]) {
        shortlist.set(r.request_id, (shortlist.get(r.request_id) ?? 0) + 1);
      }
    }

    return {
      ok: true,
      data: {
        actingFor: employer.organizationName,
        needs: rows.map((r) => ({
          id: r.id,
          title: r.title,
          status: r.status,
          kind: r.kind,
          role: r.role_or_work_type,
          country: r.country,
          location: r.location,
          headcount: r.team_size,
          startPeriod: r.start_period,
          duration: r.duration,
          createdAt: r.created_at,
          // UNKNOWN ≠ ZERO: a count that could not be read is null.
          interestedPeople: countsKnown ? (interest.get(r.id) ?? 0) : null,
          shortlisted: countsKnown ? (shortlist.get(r.id) ?? 0) : null,
        })),
        countsKnown,
        structuredDestination: "/dashboard/company/scouting",
      },
    };
  },
};

// ── demand.close_* / demand.reopen_* ──────────────────────────────────────
//
// The SAME lifecycle the scouting page and the chat run (`closeDemand` /
// `reopenDemand` → the gated `close_demand_v1` / `reopen_demand_v1`: the
// creator, an admin, or a colleague with demand access on the need's
// organization). Reopening passes the SAME open-needs plan ceiling as creating.

const demandLifecycleFields = z.object({ requestId: z.string().uuid() }).strict();

async function readNeedForLifecycle(
  caller: CapabilityCaller,
  organizationId: string,
  requestId: string,
): Promise<{ id: string; title: string | null; status: string | null; kind: string | null } | null> {
  const { data } = await asAny(caller.supabase)
    .from("customer_requests")
    .select("id, title, status, kind")
    .eq("id", requestId)
    .or(`profile_id.eq.${caller.userId},organization_id.eq.${organizationId}`)
    .maybeSingle();
  return (data as { id: string; title: string | null; status: string | null; kind: string | null } | null) ?? null;
}

function makeDemandLifecyclePair(op: "close" | "reopen"): [CapabilityDescriptor, CapabilityDescriptor] {
  const draftId = `demand.${op}_draft`;
  const confirmId = `demand.${op}_confirm`;
  const actionId = op === "close" ? "company.close-demand" : "company.reopen-demand";
  const confirmInput = demandLifecycleFields.extend({ confirmationToken: z.string().min(10) });
  const allowed = (status: string | null) => (op === "close" ? canCloseFrom(status) : canReopenFrom(status));

  const draft: CapabilityDescriptor = {
    id: draftId,
    kind: "draft",
    conversationActionId: actionId,
    title: op === "close" ? "Draft closing a worker need" : "Draft reopening a closed worker need",
    description:
      (op === "close"
        ? "Previews closing one need of the organization the caller is acting for: it leaves the worker board; its candidates and shortlist stay as history. Reversible with demand.reopen_*. "
        : "Previews reopening a closed need: it returns to the worker board, subject to the SAME active-positions plan ceiling as creating one. ") +
      `Returns a one-time token bound to the need's CURRENT status. NOTHING is written. Confirm with ${confirmId}.`,
    exposed: true,
    annotations: readOnly,
    inputSchema: demandLifecycleFields,
    run: async (caller, input): Promise<ExecResult> => {
      const { requestId } = demandLifecycleFields.parse(input);
      const employer = await employerOrRefusal(caller);
      if (!employer.ok) return demandContextRefusal(employer.reason);
      const need = await readNeedForLifecycle(caller, employer.organizationId, requestId);
      if (!need || !isDemandKind(need.kind)) {
        return { ok: false, code: "not_found", message: "No such need in the organization the caller is acting for." };
      }
      if (!allowed(need.status)) {
        return {
          ok: false,
          code: "invalid_transition",
          message: op === "close" ? `A need in status ${need.status} cannot be closed.` : `A need in status ${need.status} cannot be reopened.`,
        };
      }
      const token = mintCapabilityConfirmation({
        actionId: confirmId,
        input: { requestId },
        userId: caller.userId,
        stateFingerprint: `demand-${op}:${employer.organizationId}:${requestId}:${need.status}`,
      });
      return {
        ok: true,
        data: {
          preview: {
            actingFor: employer.organizationName,
            need: { id: need.id, title: need.title },
            from: need.status,
            to: op === "close" ? "closed" : "submitted",
          },
          confirmationToken: token,
          note: `Nothing was written. Confirming requires ${confirmId} with this exact input and token.`,
        },
      };
    },
  };

  const confirm: CapabilityDescriptor = {
    id: confirmId,
    kind: "confirm",
    conversationActionId: actionId,
    title: op === "close" ? "Confirm closing the need" : "Confirm reopening the need",
    description:
      "Verifies the token against the need's CURRENT status and the caller's CURRENT organization, runs the same lifecycle the web page and chat use, and reads the need back.",
    exposed: true,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: confirmInput,
    run: async (caller, input): Promise<ExecResult> => {
      const { confirmationToken, requestId } = confirmInput.parse(input);
      const employer = await employerOrRefusal(caller);
      if (!employer.ok) return demandContextRefusal(employer.reason);
      const need = await readNeedForLifecycle(caller, employer.organizationId, requestId);
      if (!need) return { ok: false, code: "not_found", message: "No such need in the organization the caller is acting for." };
      const verdict = verifyCapabilityConfirmation({
        actionId: confirmId,
        token: confirmationToken,
        input: { requestId },
        userId: caller.userId,
        currentStateFingerprint: `demand-${op}:${employer.organizationId}:${requestId}:${need.status}`,
      });
      if (!verdict.ok) {
        return { ok: false, code: "confirmation_rejected", message: `Confirmation token rejected (${verdict.reason}). Draft again.` };
      }
      const lifecycleCaller = { supabase: caller.supabase, userId: caller.userId, organizationId: employer.organizationId };
      const res = op === "close" ? await closeDemand(requestId, lifecycleCaller) : await reopenDemand(requestId, lifecycleCaller);
      if (res.kind !== "ok") {
        if (res.kind === "over-limit") {
          return {
            ok: false,
            code: "over_open_need_limit",
            message:
              res.next === "individual_plan"
                ? `This organization already has ${res.limit} active positions (the Organization plan ceiling). Nothing was reopened or charged.`
                : `This organization's plan allows ${res.limit} active position(s). Close one or activate the Organization plan. Nothing was reopened or charged.`,
          };
        }
        return {
          ok: false,
          code: res.kind === "not-owner" ? "not_authorized" : res.kind === "invalid" ? "invalid_transition" : "unavailable",
          message: "The need's status did not change.",
        };
      }
      const back = await readNeedForLifecycle(caller, employer.organizationId, requestId);
      return {
        ok: true,
        data: {
          status: op === "close" ? "closed" : "reopened",
          actingFor: employer.organizationName,
          requestId,
          readBack: back ? { id: back.id, title: back.title, status: back.status } : null,
          structuredDestination: "/dashboard/company/scouting",
        },
      };
    },
  };
  return [draft, confirm];
}

const [demandCloseDraft, demandCloseConfirm] = makeDemandLifecyclePair("close");
const [demandReopenDraft, demandReopenConfirm] = makeDemandLifecyclePair("reopen");

// ── roster.list ────────────────────────────────────────────────────────────

const rosterListInput = z.object({}).strict();

const rosterList: CapabilityDescriptor = {
  id: "roster.list",
  kind: "read",
  title: "People on this organization's roster",
  description:
    "The active roster of the organization the caller is acting for — the " +
    "platform people linked to it — with each person's `workerProfileId`, the " +
    "id assignment.create_draft takes. The same roster the web company " +
    "workspace shows, under the caller's own RLS. Contact details are not " +
    "returned. (People known to the organization but not yet on the platform " +
    "are listed by evidence.people.list.) Writes nothing.",
  exposed: true,
  annotations: readOnly,
  inputSchema: rosterListInput,
  run: async (caller): Promise<ExecResult> => {
    const employer = await employerOrRefusal(caller);
    if (!employer.ok) return demandContextRefusal(employer.reason);
    const roster = await listActiveCompanyWorkers(employer.companyId, caller);
    if (roster.kind === "needs-migration") {
      return { ok: false, code: "needs_migration", message: "The roster store is not enabled on this environment." };
    }
    if (roster.kind !== "ok") {
      return { ok: false, code: "unavailable", message: "The roster read failed." };
    }
    return {
      ok: true,
      data: {
        actingFor: employer.organizationName,
        people: roster.rows.map((w) => ({
          workerProfileId: w.profileId,
          name: w.displayName,
          status: w.status,
          operationsRole: w.operationsRole,
          journalReviewEnabled: w.journalReviewEnabled,
        })),
        structuredDestination: "/dashboard/company/people",
      },
    };
  },
};

// ── projects.list ──────────────────────────────────────────────────────────

const projectsListInput = z.object({}).strict();

type ProjectRow = {
  id: string;
  title: string;
  status: string | null;
  country: string | null;
  city: string | null;
  start_date: string | null;
  end_date: string | null;
  company_id: string | null;
  organization_id: string | null;
};

async function readOrgProjects(
  caller: CapabilityCaller,
  employer: { companyId: string; organizationId: string },
): Promise<{ ok: true; rows: ProjectRow[] } | { ok: false }> {
  const { data, error } = await asAny(caller.supabase)
    .from("projects")
    .select("id, title, status, country, city, start_date, end_date, company_id, organization_id")
    .or(`organization_id.eq.${employer.organizationId},company_id.eq.${employer.companyId}`)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return { ok: false };
  // A DUPLICATE project (record fact, 20260930120000) leaves the working list
  // — the same one reader the web list uses.
  const rows = (data ?? []) as ProjectRow[];
  const duplicates = await readDuplicateProjectIds(caller.supabase, rows.map((r) => r.id));
  return { ok: true, rows: rows.filter((r) => !duplicates.has(r.id)) };
}

const projectsList: CapabilityDescriptor = {
  id: "projects.list",
  kind: "read",
  title: "This organization's projects and who is assigned",
  description:
    "Lists the projects of the organization the caller is acting for (at most " +
    "100, newest first) with status, place and dates, and for each project the " +
    "people actively assigned to it (name + workerProfileId). Only projects the " +
    "caller's own access admits are returned. Writes nothing.",
  exposed: true,
  annotations: readOnly,
  inputSchema: projectsListInput,
  run: async (caller): Promise<ExecResult> => {
    const employer = await employerOrRefusal(caller);
    if (!employer.ok) return demandContextRefusal(employer.reason);
    const projects = await readOrgProjects(caller, employer);
    if (!projects.ok) return { ok: false, code: "unavailable", message: "The project read failed." };

    const ids = projects.rows.map((p) => p.id);
    const byProject = new Map<string, { workerProfileId: string | null; name: string | null; assignedAt: string }[]>();
    let assignmentsKnown = true;
    if (ids.length > 0) {
      const { data, error } = await asAny(caller.supabase)
        .from("project_worker_assignments")
        .select("project_id, status, assigned_at, workers(profile_id, display_name)")
        .in("project_id", ids)
        .eq("status", "active");
      if (error) assignmentsKnown = false;
      for (const r of (data ?? []) as {
        project_id: string;
        assigned_at: string;
        workers: { profile_id: string | null; display_name: string | null } | null;
      }[]) {
        const list = byProject.get(r.project_id) ?? [];
        list.push({
          workerProfileId: r.workers?.profile_id ?? null,
          name: r.workers?.display_name ?? null,
          assignedAt: r.assigned_at,
        });
        byProject.set(r.project_id, list);
      }
    }

    return {
      ok: true,
      data: {
        actingFor: employer.organizationName,
        projects: projects.rows.map((p) => ({
          id: p.id,
          title: p.title,
          status: p.status,
          country: p.country,
          city: p.city,
          startDate: p.start_date,
          endDate: p.end_date,
          // null = the assignment read failed (UNKNOWN), [] = nobody assigned.
          activeAssignments: assignmentsKnown ? (byProject.get(p.id) ?? []) : null,
        })),
        assignmentsKnown,
        structuredDestination: "/dashboard/projects",
      },
    };
  },
};

// ── project.create_draft / project.create_confirm ─────────────────────────

const projectCreateFields = z
  .object({
    title: z.string().trim().min(PROJECT_TITLE_MIN).max(PROJECT_TITLE_MAX),
    city: z.string().trim().min(1).max(200).nullish(),
  })
  .strict();

function normalizedProject(d: z.infer<typeof projectCreateFields>): Record<string, unknown> {
  return { title: d.title.trim(), city: d.city?.trim() || null };
}

const projectFingerprint = (organizationId: string) => `project-create:${organizationId}`;

function manageProjectsRefusal(): ExecResult {
  return {
    ok: false,
    code: "not_authorized",
    message:
      "The caller's role in this organization does not include managing projects (owner, admin, manager or external manager).",
  };
}

const projectCreateDraft: CapabilityDescriptor = {
  id: "project.create_draft",
  kind: "draft",
  title: "Draft a new project",
  description:
    "Validates a new project (title, optional city) for the organization the " +
    "caller is acting for and returns a preview naming that organization plus " +
    "a one-time confirmation token. NOTHING is created. The project starts as " +
    "a draft; confirming requires project.create_confirm with this exact input " +
    "and token.",
  exposed: true,
  annotations: readOnly,
  inputSchema: projectCreateFields,
  run: async (caller, input): Promise<ExecResult> => {
    const draft = projectCreateFields.parse(input);
    const employer = await employerOrRefusal(caller);
    if (!employer.ok) return demandContextRefusal(employer.reason);
    if (!hasOrganizationCapability(employer.role, "manage-projects")) return manageProjectsRefusal();
    const token = mintCapabilityConfirmation({
      actionId: "project.create_confirm",
      input: normalizedProject(draft),
      userId: caller.userId,
      stateFingerprint: projectFingerprint(employer.organizationId),
    });
    return {
      ok: true,
      data: {
        preview: { actingFor: employer.organizationName, ...normalizedProject(draft), status: "draft" },
        confirmationToken: token,
        note: "Nothing was created. Confirming requires project.create_confirm with this exact input and token.",
      },
    };
  },
};

const projectCreateConfirmInput = projectCreateFields.extend({
  confirmationToken: z.string().min(10),
});

const projectCreateConfirm: CapabilityDescriptor = {
  id: "project.create_confirm",
  kind: "confirm",
  title: "Confirm creating the project",
  description:
    "Verifies the token against the exact draft and the caller's CURRENT " +
    "organization (a workspace switch in between invalidates it), then creates " +
    "the project through the same core the web form uses and reads it back. " +
    "Not idempotent by nature — the one-time token prevents a replay.",
  exposed: true,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: projectCreateConfirmInput,
  run: async (caller, input): Promise<ExecResult> => {
    const { confirmationToken, ...draft } = projectCreateConfirmInput.parse(input);
    const employer = await employerOrRefusal(caller);
    if (!employer.ok) return demandContextRefusal(employer.reason);
    if (!hasOrganizationCapability(employer.role, "manage-projects")) return manageProjectsRefusal();
    const verdict = verifyCapabilityConfirmation({
      actionId: "project.create_confirm",
      token: confirmationToken,
      input: normalizedProject(draft),
      userId: caller.userId,
      currentStateFingerprint: projectFingerprint(employer.organizationId),
    });
    if (!verdict.ok) {
      return { ok: false, code: "confirmation_rejected", message: `Confirmation token rejected (${verdict.reason}). Draft again.` };
    }
    const n = normalizedProject(draft);
    const created = await insertProjectForCompany(caller.supabase, employer.companyId, {
      title: n.title as string,
      city: (n.city as string | null) ?? null,
    });
    if (!created.ok) {
      if (created.code && PG_UNDEFINED.has(created.code)) {
        return { ok: false, code: "needs_migration", message: "Projects are not enabled on this environment." };
      }
      return { ok: false, code: created.reason === "invalid_title" ? "invalid" : "unavailable", message: "The project was not created." };
    }
    // READ-BACK: the canonical row as the caller's own access sees it.
    const { data: row } = await asAny(caller.supabase)
      .from("projects")
      .select("id, title, city, status, organization_id, created_at")
      .eq("id", created.id)
      .maybeSingle();
    return {
      ok: true,
      data: {
        status: "created",
        projectId: created.id,
        actingFor: employer.organizationName,
        readBack: row ?? null,
        structuredDestination: `/dashboard/projects/${created.id}`,
      },
    };
  },
};

// ── project.status_set_draft / project.status_set_confirm ─────────────────
//
// THE one lifecycle write (`set_project_status_v1`, W11): draft → live,
// live ⇄ paused, live/paused → completed. Completing is terminal and ends the
// project's active assignments inside the RPC (audited) — the preview says so.

const projectStatusFields = z
  .object({
    projectId: z.string().uuid(),
    toStatus: z.enum(PROJECT_STATUSES),
  })
  .strict();

async function readProjectForStatus(
  caller: CapabilityCaller,
  employer: { companyId: string; organizationId: string },
  projectId: string,
): Promise<{ ok: true; project: ProjectRow; activeAssignments: number | null } | { ok: false; result: ExecResult }> {
  const { data, error } = await asAny(caller.supabase)
    .from("projects")
    .select("id, title, status, country, city, start_date, end_date, company_id, organization_id")
    .eq("id", projectId)
    .maybeSingle();
  if (error) return { ok: false, result: { ok: false, code: "unavailable", message: "The project read failed." } };
  const p = data as ProjectRow | null;
  if (!p || (p.organization_id !== employer.organizationId && p.company_id !== employer.companyId)) {
    return {
      ok: false,
      result: { ok: false, code: "not_found", message: "No such project in the organization the caller is acting for." },
    };
  }
  const { data: a, error: aErr } = await asAny(caller.supabase)
    .from("project_worker_assignments")
    .select("id")
    .eq("project_id", p.id)
    .eq("status", "active");
  return { ok: true, project: p, activeAssignments: aErr ? null : ((a ?? []) as unknown[]).length };
}

const projectStatusDraft: CapabilityDescriptor = {
  id: "project.status_set_draft",
  kind: "draft",
  title: "Draft changing a project's status",
  description:
    "Previews a project lifecycle change for a project of the organization " +
    "the caller is acting for: draft → live (start), live ⇄ paused, " +
    "live/paused → completed. COMPLETED IS TERMINAL and ends every active " +
    "assignment on the project (kept as history) — the preview names how many. " +
    "Returns a one-time token bound to the project's CURRENT status. NOTHING is written.",
  exposed: true,
  annotations: readOnly,
  inputSchema: projectStatusFields,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = projectStatusFields.parse(input);
    const employer = await employerOrRefusal(caller);
    if (!employer.ok) return demandContextRefusal(employer.reason);
    if (!hasOrganizationCapability(employer.role, "manage-projects")) return manageProjectsRefusal();
    const read = await readProjectForStatus(caller, employer, parsed.projectId);
    if (!read.ok) return read.result;
    const from = read.project.status;
    if (!canTransition(from, parsed.toStatus)) {
      return {
        ok: false,
        code: "invalid_transition",
        message: isTerminalStatus(from)
          ? "This project is completed; a completed project is never reopened."
          : `A project cannot go from ${from} to ${parsed.toStatus}. Allowed next: ${nextStatuses(from).join(", ") || "none"}.`,
      };
    }
    const token = mintCapabilityConfirmation({
      actionId: "project.status_set_confirm",
      input: parsed,
      userId: caller.userId,
      stateFingerprint: `project-status:${employer.organizationId}:${read.project.id}:${from}`,
    });
    return {
      ok: true,
      data: {
        preview: {
          actingFor: employer.organizationName,
          project: { id: read.project.id, title: read.project.title },
          from,
          to: parsed.toStatus,
          endsActiveAssignments: parsed.toStatus === "completed" ? read.activeAssignments : 0,
          terminal: isTerminalStatus(parsed.toStatus),
        },
        confirmationToken: token,
        note: "Nothing was written. Confirming requires project.status_set_confirm with this exact input and token.",
      },
    };
  },
};

const projectStatusConfirmInput = projectStatusFields.extend({ confirmationToken: z.string().min(10) });

const projectStatusConfirm: CapabilityDescriptor = {
  id: "project.status_set_confirm",
  kind: "confirm",
  title: "Confirm the project status change",
  description:
    "Verifies the token against the exact input, the caller's CURRENT " +
    "organization and the project's CURRENT status, then performs the one " +
    "canonical lifecycle write (the same the project page uses; the database " +
    "decides authority and records the audit) and reads the project back.",
  exposed: true,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: projectStatusConfirmInput,
  run: async (caller, input): Promise<ExecResult> => {
    const { confirmationToken, ...parsed } = projectStatusConfirmInput.parse(input);
    const employer = await employerOrRefusal(caller);
    if (!employer.ok) return demandContextRefusal(employer.reason);
    if (!hasOrganizationCapability(employer.role, "manage-projects")) return manageProjectsRefusal();
    const read = await readProjectForStatus(caller, employer, parsed.projectId);
    if (!read.ok) return read.result;
    const verdict = verifyCapabilityConfirmation({
      actionId: "project.status_set_confirm",
      token: confirmationToken,
      input: parsed,
      userId: caller.userId,
      currentStateFingerprint: `project-status:${employer.organizationId}:${read.project.id}:${read.project.status}`,
    });
    if (!verdict.ok) {
      return { ok: false, code: "confirmation_rejected", message: `Confirmation token rejected (${verdict.reason}). Draft again.` };
    }
    const { data, error } = await asAny(caller.supabase).rpc("set_project_status_v1", {
      p_project_id: parsed.projectId,
      p_status: parsed.toStatus,
    });
    if (error) return rpcFailure(error);
    const outcome = String((data as { outcome?: string } | null)?.outcome ?? "");
    if (outcome !== "transitioned" && outcome !== "already_in_state") {
      return {
        ok: false,
        code: outcome === "not_authorized" ? "not_authorized" : outcome === "not_found" ? "not_found" : "invalid_transition",
        message: `The lifecycle write answered: ${outcome || "unknown"}. Nothing changed.`,
      };
    }
    const back = await readProjectForStatus(caller, employer, parsed.projectId);
    return {
      ok: true,
      data: {
        status: outcome,
        actingFor: employer.organizationName,
        readBack: back.ok
          ? { id: back.project.id, title: back.project.title, status: back.project.status, activeAssignments: back.activeAssignments }
          : null,
        structuredDestination: `/dashboard/projects/${parsed.projectId}/operations`,
      },
    };
  },
};

// ── assignment.* ───────────────────────────────────────────────────────────

const assignmentFields = z
  .object({
    projectId: z.string().uuid(),
    workerProfileId: z.string().uuid(),
  })
  .strict();

type AssignmentSubject = {
  project: ProjectRow;
  workerName: string | null;
  workerId: string | null;
  currentStatus: string | null;
};

/** Resolve the project (must be this organization's, visible to the caller)
 *  and the person, and read the current assignment state the token binds. */
async function resolveAssignmentSubject(
  caller: CapabilityCaller,
  employer: { companyId: string; organizationId: string },
  input: z.infer<typeof assignmentFields>,
): Promise<{ ok: true; subject: AssignmentSubject } | { ok: false; result: ExecResult }> {
  const { data: project, error: pErr } = await asAny(caller.supabase)
    .from("projects")
    .select("id, title, status, country, city, start_date, end_date, company_id, organization_id")
    .eq("id", input.projectId)
    .maybeSingle();
  if (pErr) return { ok: false, result: { ok: false, code: "unavailable", message: "The project read failed." } };
  const p = project as ProjectRow | null;
  if (!p || (p.organization_id !== employer.organizationId && p.company_id !== employer.companyId)) {
    return {
      ok: false,
      result: { ok: false, code: "not_found", message: "No such project in the organization the caller is acting for." },
    };
  }
  const { data: worker } = await asAny(caller.supabase)
    .from("workers")
    .select("id, display_name")
    .eq("profile_id", input.workerProfileId)
    .maybeSingle();
  let currentStatus: string | null = null;
  if (worker?.id) {
    const { data: a } = await asAny(caller.supabase)
      .from("project_worker_assignments")
      .select("status")
      .eq("project_id", p.id)
      .eq("worker_id", worker.id)
      .maybeSingle();
    currentStatus = (a?.status as string | null) ?? null;
  }
  return {
    ok: true,
    subject: {
      project: p,
      workerName: (worker?.display_name as string | null) ?? null,
      workerId: (worker?.id as string | null) ?? null,
      currentStatus,
    },
  };
}

const assignmentFingerprint = (
  op: "assign" | "end",
  organizationId: string,
  s: AssignmentSubject,
) => `${op}:${organizationId}:${s.project.id}:${s.workerId ?? "?"}:${s.currentStatus ?? "none"}`;

/**
 * CAL-7 for the MCP door: the SAME reservation verdict the project page and the
 * chat show (`reservationVerdictFor`, the one core), as the model-facing facts
 * it needs: kind + shared days (+ the place for a trip / project title; an
 * absence NEVER carries a label). null = the check could not run (never read as
 * "clear"). Absent the explicit caller the cookie session would be read, so the
 * caller's OWN RLS-scoped client is always passed.
 */
async function clashFor(caller: CapabilityCaller, projectId: string, workerProfileId: string) {
  try {
    const r = await reservationVerdictFor(caller.supabase, projectId, workerProfileId, {
      supabase: caller.supabase,
      userId: caller.userId,
    });
    if (!r) return null;
    return {
      state: r.verdict.state,
      collisions: r.verdict.collisions.map((c) => ({
        kind: c.source as string,
        label: c.source === "absence" ? null : c.label,
        overlapStart: c.overlapStart,
        overlapEnd: c.overlapEnd,
      })),
      unreadable: r.verdict.gaps.length,
    };
  } catch {
    return null;
  }
}

/** What the person is told after an assignment that stands over a clash. The
 *  decision is PENDING - exactly the state the project page leaves it in
 *  (keep / undo / swap controls visible, no receipt yet). */
const KEEP_NEXT =
  "The assignment stands; nothing blocked it. To keep it KNOWINGLY, call assignment.keep_draft then assignment.keep_confirm " +
  "with the same projectId and workerProfileId and an optional closed reasonCode " +
  `(${OVERRIDE_REASON_CODES.join(" | ")}). Until then no override receipt exists. To undo, use assignment.end_draft.`;

function makeAssignmentPair(op: "assign" | "end"): [CapabilityDescriptor, CapabilityDescriptor] {
  const draftId = op === "assign" ? "assignment.create_draft" : "assignment.end_draft";
  const confirmId = op === "assign" ? "assignment.create_confirm" : "assignment.end_confirm";
  const rpc = op === "assign" ? "assign_worker_to_project" : "end_worker_project_assignment";
  const confirmInput = assignmentFields.extend({ confirmationToken: z.string().min(10) });

  const draft: CapabilityDescriptor = {
    id: draftId,
    kind: "draft",
    title: op === "assign" ? "Draft assigning a person to a project" : "Draft ending a person's project assignment",
    description:
      (op === "assign"
        ? "Checks that the project belongs to the organization the caller is acting for and names the project and the person (workerProfileId from roster.list). "
        : "Checks that the person is actively assigned to this project of the caller's organization and names both. ") +
      "Returns a preview and a one-time token bound to the CURRENT assignment state. NOTHING is written. " +
      (op === "assign"
        ? "The database still decides at confirm: the caller must manage the project and the person must be on the active roster (or hold an accepted booking for this project)."
        : "Ending keeps the assignment as history (status 'ended'); nothing is deleted."),
    exposed: true,
    annotations: readOnly,
    inputSchema: assignmentFields,
    run: async (caller, input): Promise<ExecResult> => {
      const parsed = assignmentFields.parse(input);
      const employer = await employerOrRefusal(caller);
      if (!employer.ok) return demandContextRefusal(employer.reason);
      const resolved = await resolveAssignmentSubject(caller, employer, parsed);
      if (!resolved.ok) return resolved.result;
      const s = resolved.subject;
      if (!s.workerId) return { ok: false, code: "not_found", message: "No such worker." };
      if (op === "assign" && s.currentStatus === "active") {
        return { ok: false, code: "already_assigned", message: "This person is already actively assigned to this project." };
      }
      if (op === "assign" && s.project.status === "completed") {
        return { ok: false, code: "invalid", message: "This project is completed; nobody can be assigned to it." };
      }
      if (op === "end" && s.currentStatus !== "active") {
        return { ok: false, code: "not_assigned", message: "This person is not actively assigned to this project." };
      }
      const token = mintCapabilityConfirmation({
        actionId: confirmId,
        input: parsed,
        userId: caller.userId,
        stateFingerprint: assignmentFingerprint(op, employer.organizationId, s),
      });
      // Advisory only (checked now, not re-checked at confirm): the same
      // verdict the page's pre-check shows. It never blocks (SEP-2).
      const calendar = op === "assign" ? await clashFor(caller, parsed.projectId, parsed.workerProfileId) : undefined;
      return {
        ok: true,
        data: {
          ...(op === "assign"
            ? {
                calendar: calendar ?? { state: "unknown", collisions: [], unreadable: 1 },
                calendarNote:
                  calendar?.state === "collides"
                    ? "This person is already committed on some of these dates. Confirming still assigns (a warning never blocks); " +
                      "you will then be asked to keep it knowingly or undo it."
                    : calendar?.state === "clear"
                      ? "No clash found."
                      : "The calendar could not be fully checked. Unknown is not the same as free.",
              }
            : {}),
          preview: {
            actingFor: employer.organizationName,
            project: { id: s.project.id, title: s.project.title, status: s.project.status, city: s.project.city },
            person: { workerProfileId: parsed.workerProfileId, name: s.workerName },
            change: op === "assign" ? "assign (status becomes active)" : "end (status becomes ended; kept as history)",
          },
          confirmationToken: token,
          note: `Nothing was written. Confirming requires ${confirmId} with this exact input and token.`,
        },
      };
    },
  };

  const confirm: CapabilityDescriptor = {
    id: confirmId,
    kind: "confirm",
    title: op === "assign" ? "Confirm assigning the person to the project" : "Confirm ending the assignment",
    description:
      "Verifies the token against the exact input, the caller's CURRENT organization and the CURRENT assignment state " +
      "(anything changed in between invalidates it), then calls the same database operation the web project page uses " +
      "and reads the assignment back.",
    exposed: true,
    annotations: {
      readOnlyHint: false,
      // Ending keeps the row (status → ended); nothing is destroyed.
      destructiveHint: false,
      // A replayed token is rejected because the state it was bound to moved.
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: confirmInput,
    run: async (caller, input): Promise<ExecResult> => {
      const { confirmationToken, ...parsed } = confirmInput.parse(input);
      const employer = await employerOrRefusal(caller);
      if (!employer.ok) return demandContextRefusal(employer.reason);
      const resolved = await resolveAssignmentSubject(caller, employer, parsed);
      if (!resolved.ok) return resolved.result;
      const s = resolved.subject;
      const verdict = verifyCapabilityConfirmation({
        actionId: confirmId,
        token: confirmationToken,
        input: parsed,
        userId: caller.userId,
        currentStateFingerprint: assignmentFingerprint(op, employer.organizationId, s),
      });
      if (!verdict.ok) {
        return { ok: false, code: "confirmation_rejected", message: `Confirmation token rejected (${verdict.reason}). Draft again.` };
      }
      const { error } = await asAny(caller.supabase).rpc(rpc, {
        p_project_id: parsed.projectId,
        p_worker_profile_id: parsed.workerProfileId,
      });
      if (error) return rpcFailure(error);
      const { data: row } = await asAny(caller.supabase)
        .from("project_worker_assignments")
        .select("id, status, assigned_at, ended_at")
        .eq("project_id", parsed.projectId)
        .eq("worker_id", s.workerId)
        .maybeSingle();
      // CAL-7 AFTER the write (a reservation warns, it never prohibits) - the
      // same order and the same verdict as assignWorkerToProjectAction.
      const calendar = op === "assign" ? await clashFor(caller, parsed.projectId, parsed.workerProfileId) : undefined;
      return {
        ok: true,
        data: {
          status: op === "assign" ? "assigned" : "ended",
          actingFor: employer.organizationName,
          project: { id: s.project.id, title: s.project.title },
          person: { workerProfileId: parsed.workerProfileId, name: s.workerName },
          readBack: row ?? null,
          structuredDestination: `/dashboard/projects/${s.project.id}`,
          ...(op === "assign"
            ? {
                calendar: calendar ?? { state: "unknown", collisions: [], unreadable: 1 },
                ...(calendar?.state === "collides"
                  ? { override: { status: "pending", reasonCodes: [...OVERRIDE_REASON_CODES], next: KEEP_NEXT } }
                  : {}),
              }
            : {}),
        },
      };
    },
  };
  return [draft, confirm];
}

// ── assignment.keep_* — the MCP door of "keep knowingly" ───────────────────
//
// J-TIME-FREEDOM (clash -> authorized override -> immutable receipt) had one
// door, the web page. This is the SAME decision for an authorized assistant:
// draft -> confirm like every other consequential write, over the SAME core
// (`keepOverrideCore`, which keepAssignmentAction and the chat action
// `company.keep-assignment` also call). The collisions are NEVER an input: the
// draft recomputes them server-side and binds the token to them, so a model
// cannot assert a clash that is not there (and the database independently
// verifies each listed clash against its source row). BASIS-AGNOSTIC: the
// person may hold a person assignment or be a member of an active TEAM
// assignment on the project - the database resolves which; the team tools
// reuse this pair unchanged.

const keepFields = z
  .object({
    projectId: z.string().uuid(),
    workerProfileId: z.string().uuid(),
    reasonCode: z.enum(OVERRIDE_REASON_CODES).optional(),
  })
  .strict();

const keepConfirmInput = keepFields.extend({ confirmationToken: z.string().min(10) });

const keepFingerprint = (organizationId: string, s: AssignmentSubject, collisions: unknown) =>
  `keep:${organizationId}:${s.project.id}:${s.workerId ?? "?"}:` +
  createHash("sha256").update(JSON.stringify(collisions)).digest("hex").slice(0, 24);

const assignmentKeepDraft: CapabilityDescriptor = {
  id: "assignment.keep_draft",
  kind: "draft",
  title: "Draft keeping an assignment knowingly despite a calendar clash",
  description:
    "For a person assigned to the project - by a person assignment OR as a member of an active team assignment - who is " +
    "already committed on some of the project's dates. Recomputes the clash SERVER-SIDE now (never taken from you), names it, and returns a " +
    "one-time token bound to that exact clash. NOTHING is written. The reason is optional and CLOSED " +
    `(${OVERRIDE_REASON_CODES.join(" | ")}); there is no free text. Confirming records an immutable, privacy-minimal receipt.`,
  exposed: true,
  annotations: readOnly,
  inputSchema: keepFields,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = keepFields.parse(input);
    const employer = await employerOrRefusal(caller);
    if (!employer.ok) return demandContextRefusal(employer.reason);
    const resolved = await resolveAssignmentSubject(caller, employer, parsed);
    if (!resolved.ok) return resolved.result;
    const s = resolved.subject;
    if (!s.workerId) return { ok: false, code: "not_found", message: "No such worker." };
    const current = await currentReceiptCollisions(caller.supabase, parsed.projectId, parsed.workerProfileId, {
      supabase: caller.supabase,
      userId: caller.userId,
    });
    if (!current) {
      return { ok: false, code: "unavailable", message: "The calendar could not be checked, so nothing can be recorded blind." };
    }
    if (current.state !== "collides" || current.collisions.length === 0) {
      return { ok: false, code: "no_clash", message: "There is no calendar clash now, so there is nothing to keep knowingly." };
    }
    const token = mintCapabilityConfirmation({
      actionId: "assignment.keep_confirm",
      input: parsed,
      userId: caller.userId,
      stateFingerprint: keepFingerprint(employer.organizationId, s, current.collisions),
    });
    return {
      ok: true,
      data: {
        preview: {
          actingFor: employer.organizationName,
          project: { id: s.project.id, title: s.project.title },
          person: { workerProfileId: parsed.workerProfileId, name: s.workerName },
          // kind + shared days only (an absence never carries more).
          clashes: current.collisions.map((c) => ({ kind: c.kind, overlapStart: c.overlapStart, overlapEnd: c.overlapEnd })),
          reasonCode: parsed.reasonCode ?? null,
          change: "records an immutable override receipt; assigns and ends nothing",
        },
        confirmationToken: token,
        note: "Nothing was written. Confirming requires assignment.keep_confirm with this exact input and token.",
      },
    };
  },
};

const assignmentKeepConfirm: CapabilityDescriptor = {
  id: "assignment.keep_confirm",
  kind: "confirm",
  title: "Confirm keeping the assignment knowingly",
  description:
    "Verifies the token against the exact input, the caller's CURRENT organization and the clash as it stands NOW (a changed calendar voids it), " +
    "then calls the same core the project page uses. Reports 'kept' ONLY when the receipt exists; any failure means NOTHING was saved and the decision is not made.",
  exposed: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: keepConfirmInput,
  run: async (caller, input): Promise<ExecResult> => {
    const { confirmationToken, ...parsed } = keepConfirmInput.parse(input);
    const employer = await employerOrRefusal(caller);
    if (!employer.ok) return demandContextRefusal(employer.reason);
    const resolved = await resolveAssignmentSubject(caller, employer, parsed);
    if (!resolved.ok) return resolved.result;
    const s = resolved.subject;
    const current = await currentReceiptCollisions(caller.supabase, parsed.projectId, parsed.workerProfileId, {
      supabase: caller.supabase,
      userId: caller.userId,
    });
    if (!current) {
      return { ok: false, code: "unavailable", message: "The calendar could not be checked. NOTHING was saved; the decision is not made." };
    }
    const verdict = verifyCapabilityConfirmation({
      actionId: "assignment.keep_confirm",
      token: confirmationToken,
      input: parsed,
      userId: caller.userId,
      currentStateFingerprint: keepFingerprint(employer.organizationId, s, current.collisions),
    });
    if (!verdict.ok) {
      return { ok: false, code: "confirmation_rejected", message: `Confirmation token rejected (${verdict.reason}). Draft again.` };
    }
    const r = await keepOverrideCore(caller.supabase, {
      projectId: parsed.projectId,
      workerProfileId: parsed.workerProfileId,
      reasonCode: parsed.reasonCode ?? null,
      caller: { supabase: caller.supabase, userId: caller.userId },
    });
    if (!r.ok) {
      const code =
        r.code === "not_authorized" ? "not_authorized" : r.code === "needs_migration" ? "needs_migration" : r.code === "invalid" ? "invalid" : "unavailable";
      return { ok: false, code, message: "The override receipt could not be recorded. NOTHING was saved; the decision is not made." };
    }
    return {
      ok: true,
      data: {
        status: r.receipt === "recorded" ? "kept" : "not_needed",
        actingFor: employer.organizationName,
        project: { id: s.project.id, title: s.project.title },
        person: { workerProfileId: parsed.workerProfileId, name: s.workerName },
        reasonCode: parsed.reasonCode ?? null,
        ...(r.receiptId ? { receiptId: r.receiptId } : {}),
        structuredDestination: `/dashboard/projects/${s.project.id}`,
      },
    };
  },
};

const [assignmentCreateDraft, assignmentCreateConfirm] = makeAssignmentPair("assign");
const [assignmentEndDraft, assignmentEndConfirm] = makeAssignmentPair("end");

// ── journal.review_queue.get ───────────────────────────────────────────────

const reviewQueueInput = z.object({}).strict();

const journalReviewQueueGet: CapabilityDescriptor = {
  id: "journal.review_queue.get",
  kind: "read",
  title: "Work entries waiting for my confirmation",
  description:
    "The Work Journal entries the caller may review and that nobody has " +
    "confirmed yet — the same set the web review inbox shows " +
    "(`reviewable_journal_entry_ids`: entries in organizations the caller " +
    "manages, with journal review enabled, not superseded or deleted). Each " +
    "carries the person, the text as written, the project if linked, and when. " +
    "UNCONFIRMED IS NOT REJECTED and NOT VERIFIED: these are the person's own " +
    "records awaiting a human decision. Writes nothing.",
  exposed: true,
  annotations: readOnly,
  inputSchema: reviewQueueInput,
  run: async (caller): Promise<ExecResult> => {
    const { data: idRows, error: idErr } = await asAny(caller.supabase).rpc("reviewable_journal_entry_ids");
    if (idErr) {
      if (idErr.code && PG_UNDEFINED.has(idErr.code)) {
        return { ok: false, code: "needs_migration", message: "Journal review is not enabled on this environment." };
      }
      return { ok: false, code: "unavailable", message: "The review queue read failed." };
    }
    const ids = (Array.isArray(idRows) ? idRows : [])
      .map((r: unknown) =>
        typeof r === "string"
          ? r
          : ((r as { reviewable_journal_entry_ids?: string; id?: string } | null)?.reviewable_journal_entry_ids ??
            (r as { id?: string } | null)?.id ??
            null),
      )
      .filter((v: unknown): v is string => typeof v === "string");
    if (ids.length === 0) return { ok: true, data: { pending: [], total: 0 } };

    const { data: rows, error } = await asAny(caller.supabase)
      .from("journal_entries")
      .select("id, original_text, created_at, project_id, workers!inner(profile_id, display_name)")
      .in("id", ids.slice(0, 200))
      // LIVE ENTRIES ONLY — the RPC already excludes superseded and deleted
      // rows; asked again here so this read never depends on that.
      .is("superseded_by", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    // FAILED ≠ EMPTY: a failed read is named, never "nothing to review".
    if (error) return { ok: false, code: "unavailable", message: "The review queue read failed." };
    return {
      ok: true,
      data: {
        total: ids.length,
        pending: ((rows ?? []) as {
          id: string;
          original_text: string | null;
          created_at: string;
          project_id: string | null;
          workers: { profile_id: string | null; display_name: string | null } | null;
        }[]).map((r) => ({
          entryId: r.id,
          person: { workerProfileId: r.workers?.profile_id ?? null, name: r.workers?.display_name ?? null },
          text: r.original_text,
          projectId: r.project_id,
          writtenAt: r.created_at,
        })),
        structuredDestination: "/dashboard/inbox/quick",
      },
    };
  },
};

/** One flow per line, in the order a company works: what it needs, who it
 *  has, where they work, what waits for its review. */
export const EMPLOYER_OPERATIONS_CAPABILITIES: readonly CapabilityDescriptor[] = [
  demandList,
  demandCloseDraft,
  demandCloseConfirm,
  demandReopenDraft,
  demandReopenConfirm,
  rosterList,
  projectsList,
  projectCreateDraft,
  projectCreateConfirm,
  projectStatusDraft,
  projectStatusConfirm,
  assignmentCreateDraft,
  assignmentCreateConfirm,
  assignmentEndDraft,
  assignmentEndConfirm,
  assignmentKeepDraft,
  assignmentKeepConfirm,
  journalReviewQueueGet,
];
