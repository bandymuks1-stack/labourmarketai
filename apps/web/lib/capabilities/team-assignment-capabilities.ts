import "server-only";

import { z } from "zod";

import { requireEmployerCompanyForCaller } from "@/lib/company/employer-company-context";
import { hasOrganizationCapability } from "@/lib/company/role-capabilities";
import type { ExecResult } from "@/lib/conversation/executor-contract";
import {
  assignTeamToWork,
  endTeamAssignment,
  previewTeamAssignmentCalendar,
  type TeamAssignmentCaller,
} from "@/lib/projects/team-assignment";
import { membersNeedingNotice, type TeamAssignRefusal } from "@/lib/projects/team-assignment-model";

import { mintCapabilityConfirmation, verifyCapabilityConfirmation } from "./confirmable";
import type { CapabilityCaller, CapabilityDescriptor } from "./contract";
import { demandContextRefusal } from "./employer-context-refusal";
import { manageProjectsRefusal } from "./employer-operations-capabilities";

/**
 * TEAM ASSIGNMENT - the assistant / MCP door for putting a TEAM on a project,
 * work object or task as ONE relationship, replacing it, and ending it (WRK-6).
 *
 * NOT a second implementation. The writes call the SAME server core the web UI
 * calls (`assignTeamToWork` / `endTeamAssignment` in lib/projects/team-assignment,
 * which the UI actions `assignTeamToWorkAction` / `endTeamAssignmentAction`
 * wrap) with the caller's own RLS-scoped client, i.e. the SAME RPCs
 * `assign_team_to_work_v1` / `end_team_assignment_v1`, whose database gates
 * (can_manage_project AND manages the team) decide. A team assignment writes ONE
 * row and no per-person assignment (never a fan-out).
 *
 * Writes are draft -> confirm, exactly like assignment.create_* (person):
 *  - the caller is the authenticated session (`caller.userId`); an identity is
 *    NEVER an argument; the organization is the caller's ACTIVE workspace,
 *    re-resolved at confirm time;
 *  - schemas are strict;
 *  - the draft reads, validates and names the project, the team and the scope,
 *    returns the CLASH VERDICT (each member's calendar check, advisory per SEP-2:
 *    it informs and never blocks) and mints a one-time token bound to the
 *    organization and the CURRENT team-assignment state; only the confirm writes;
 *  - a replayed token is refused because the state it was bound to moved.
 * Override receipts for a chat assignment over a clash belong to the #2146 lane,
 * which extends these tools through the draft's `memberCalendar` payload.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: CapabilityCaller["supabase"]): any {
  return c;
}

const draftAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const confirmAnnotations = {
  readOnlyHint: false,
  // Ending keeps the row (status -> ended); nothing is destroyed.
  destructiveHint: false,
  // A replayed token is rejected because the state it was bound to moved.
  idempotentHint: true,
  openWorldHint: false,
} as const;

const ProjectId = z.string().uuid();

const assignBase = z
  .object({
    teamId: z.string().uuid(),
    projectId: ProjectId,
    workObjectId: z.string().uuid().optional(),
    taskId: z.string().uuid().optional(),
  })
  .strict();
const oneScope = (v: { workObjectId?: string | undefined; taskId?: string | undefined }) =>
  !(v.workObjectId && v.taskId);
const ONE_SCOPE = { message: "A team is assigned to ONE scope: the project, one work object OR one task." };

const assignFields = assignBase.refine(oneScope, ONE_SCOPE);
const replaceBase = assignBase.extend({ replaceAssignmentId: z.string().uuid() });
const replaceFields = replaceBase.refine(oneScope, ONE_SCOPE);
const endFields = z
  .object({ assignmentId: z.string().uuid(), reason: z.string().trim().min(1).max(500).optional() })
  .strict();

type AssignInput = z.infer<typeof assignFields>;
type ReplaceInput = z.infer<typeof replaceFields>;
type EndInput = z.infer<typeof endFields>;

/** The NORMALIZED shapes (null-vs-absent decided) both sides of a token hash. */
const normAssign = (p: AssignInput) => ({
  teamId: p.teamId,
  projectId: p.projectId,
  workObjectId: p.workObjectId ?? null,
  taskId: p.taskId ?? null,
});
const normReplace = (p: ReplaceInput) => ({ ...normAssign(p), replaceAssignmentId: p.replaceAssignmentId });
const normEnd = (p: EndInput) => ({ assignmentId: p.assignmentId, reason: p.reason ?? null });

type Employer = { companyId: string; organizationId: string; organizationName: string; role: Parameters<typeof hasOrganizationCapability>[0] };

type ProjectRow = {
  id: string;
  title: string | null;
  status: string | null;
  city: string | null;
  company_id: string | null;
  organization_id: string | null;
};

type ActiveAssignment = {
  id: string;
  team_org_id: string;
  project_id: string;
  work_object_id: string | null;
  task_id: string | null;
  ended_at: string | null;
};

const refusalCode: Record<TeamAssignRefusal, { code: string; message: string }> = {
  not_authorized: {
    code: "not_authorized",
    message:
      "The database refused: the caller must manage this project AND manage the team (or be an admin). Nothing changed.",
  },
  not_a_team: { code: "invalid", message: "That organization is not a team." },
  team_has_no_members: { code: "invalid", message: "That team has no active members; there is nobody to assign." },
  project_completed: { code: "invalid", message: "This project is completed; nobody can be assigned to it." },
  task_not_assignable: { code: "invalid", message: "That task is not an open task of this project." },
  object_not_assignable: { code: "invalid", message: "That work object is not an active object of this project." },
  one_scope_only: { code: "invalid", message: "A team is assigned to ONE scope: the project, one work object OR one task." },
  replace_target_not_active: { code: "invalid", message: "The assignment to replace is not active on this project." },
  team_and_project_required: { code: "invalid", message: "A team and a project are required." },
  needs_migration: { code: "needs_migration", message: "Team assignment is not enabled on this environment." },
  not_authed: { code: "not_authorized", message: "Not authenticated." },
  error: { code: "unavailable", message: "The write failed." },
};

function refusal(r: TeamAssignRefusal): ExecResult {
  const x = refusalCode[r];
  return { ok: false, code: x.code, message: x.message };
}

async function employerForTeamWork(
  caller: CapabilityCaller,
): Promise<{ ok: true; employer: Employer } | { ok: false; result: ExecResult }> {
  const employer = await requireEmployerCompanyForCaller(caller);
  if (!employer.ok) return { ok: false, result: demandContextRefusal(employer.reason) };
  if (!hasOrganizationCapability(employer.role, "manage-projects")) {
    return { ok: false, result: manageProjectsRefusal() };
  }
  return { ok: true, employer };
}

async function readProject(
  caller: CapabilityCaller,
  employer: Employer,
  projectId: string,
): Promise<{ ok: true; project: ProjectRow } | { ok: false; result: ExecResult }> {
  const { data, error } = await asAny(caller.supabase)
    .from("projects")
    .select("id, title, status, city, company_id, organization_id")
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
  return { ok: true, project: p };
}

/** The ACTIVE team assignments on a project (RLS-scoped). null = the read failed
 *  (UNKNOWN is never reported as "none"). */
async function readActiveOnProject(caller: CapabilityCaller, projectId: string): Promise<ActiveAssignment[] | null> {
  const { data, error } = await asAny(caller.supabase)
    .from("team_assignments")
    .select("id, team_org_id, project_id, work_object_id, task_id, ended_at")
    .eq("project_id", projectId)
    .is("ended_at", null)
    .limit(200);
  if (error) return null;
  return (data ?? []) as ActiveAssignment[];
}

async function readTeamName(caller: CapabilityCaller, teamId: string): Promise<{ ok: true; name: string | null } | { ok: false; result: ExecResult }> {
  const { data, error } = await asAny(caller.supabase)
    .from("organizations")
    .select("id, organization_type, display_name, legal_name")
    .eq("id", teamId)
    .maybeSingle();
  if (error) return { ok: false, result: { ok: false, code: "unavailable", message: "The team read failed." } };
  const t = data as { organization_type: string | null; display_name: string | null; legal_name: string | null } | null;
  if (!t) return { ok: false, result: { ok: false, code: "not_found", message: "No such team the caller can see." } };
  if (t.organization_type !== "team") return { ok: false, result: refusal("not_a_team") };
  return { ok: true, name: t.display_name?.trim() || t.legal_name?.trim() || null };
}

function scopeKey(workObjectId: string | null, taskId: string | null): string {
  return taskId ? `task:${taskId}` : workObjectId ? `object:${workObjectId}` : "project";
}
const sameScope = (a: ActiveAssignment, workObjectId: string | null, taskId: string | null) =>
  (a.work_object_id ?? null) === workObjectId && (a.task_id ?? null) === taskId;

/** The draft's CLASH VERDICT: each member's calendar check, summarised. Advisory
 *  (SEP-2): never blocks; unknown is never reported as clear. */
async function clashVerdict(caller: CapabilityCaller, teamId: string, projectId: string) {
  const preview = await previewTeamAssignmentCalendar({ teamId, projectId }, caller as TeamAssignmentCaller);
  const { conflicts, unknown } = membersNeedingNotice(preview.members);
  return {
    known: preview.known,
    members: preview.members.length,
    clear: preview.members.filter((m) => m.verdict.state === "clear").length,
    collides: conflicts.map((m) => ({
      profileId: m.profileId,
      collisions: m.verdict.collisions.map((c) => ({
        source: c.source,
        label: c.label,
        overlapStart: c.overlapStart,
        overlapEnd: c.overlapEnd,
      })),
    })),
    unknown: unknown.map((m) => ({ profileId: m.profileId, gaps: m.verdict.gaps.map((g) => g.reason) })),
    advisory: "Advisory only - a clash informs the decision and never blocks the assignment.",
  };
}

function rejected(reason: string): ExecResult {
  return { ok: false, code: "confirmation_rejected", message: `Confirmation token rejected (${reason}). Draft again.` };
}

// ── create / replace ──────────────────────────────────────────────────────

function makeAssignPair(op: "create" | "replace"): [CapabilityDescriptor, CapabilityDescriptor] {
  const draftId = op === "create" ? "team_assignment.create_draft" : "team_assignment.replace_draft";
  const confirmId = op === "create" ? "team_assignment.create_confirm" : "team_assignment.replace_confirm";
  const draftSchema = op === "create" ? assignFields : replaceFields;
  const confirmSchema = (op === "create" ? assignBase : replaceBase)
    .extend({ confirmationToken: z.string().min(10) })
    .refine(oneScope, ONE_SCOPE);

  /** Everything both sides bind: the project, the team, and the CURRENT active
   *  team-assignment state for this scope (and the replace target). */
  async function resolve(caller: CapabilityCaller, parsed: ReplaceInput | AssignInput) {
    const gate = await employerForTeamWork(caller);
    if (!gate.ok) return gate;
    const { employer } = gate;
    const proj = await readProject(caller, employer, parsed.projectId);
    if (!proj.ok) return proj;
    const team = await readTeamName(caller, parsed.teamId);
    if (!team.ok) return team;
    const active = await readActiveOnProject(caller, parsed.projectId);
    if (active === null) {
      return { ok: false as const, result: { ok: false, code: "unavailable", message: "The team-assignment read failed." } as ExecResult };
    }
    const workObjectId = parsed.workObjectId ?? null;
    const taskId = parsed.taskId ?? null;
    const existing = active.find((a) => a.team_org_id === parsed.teamId && sameScope(a, workObjectId, taskId)) ?? null;
    const replaceId = op === "replace" ? (parsed as ReplaceInput).replaceAssignmentId : null;
    const target = replaceId ? (active.find((a) => a.id === replaceId) ?? null) : null;
    const fingerprint = [
      op === "create" ? "team-assign" : "team-replace",
      employer.organizationId,
      parsed.projectId,
      parsed.teamId,
      scopeKey(workObjectId, taskId),
      existing?.id ?? "none",
      replaceId ? `${replaceId}:${target ? "active" : "gone"}` : "-",
    ].join(":");
    return { ok: true as const, employer, project: proj.project, teamName: team.name, existing, target, replaceId, workObjectId, taskId, fingerprint };
  }

  const draft: CapabilityDescriptor = {
    id: draftId,
    kind: "draft",
    title: op === "create" ? "Draft assigning a team to a project, work object or task" : "Draft replacing a team assignment",
    description:
      (op === "create"
        ? "Checks that the project belongs to the organization the caller is acting for and that teamId is a team (an organization of type team), and names the project, the team and the scope. "
        : "Same as team_assignment.create_draft, and the assignment to replace (replaceAssignmentId) must be ACTIVE on this project: it is ENDED (kept as history, reason 'replaced') in the same transaction as the new one is created. ") +
      "A team is ONE relationship: no per-person assignment is ever written. Returns a preview with the CLASH VERDICT (each current member's calendar check - advisory, never blocking) and a one-time token bound to the CURRENT team-assignment state. NOTHING is written. " +
      "The database still decides at confirm: the caller must manage the project AND the team.",
    exposed: true,
    annotations: draftAnnotations,
    inputSchema: draftSchema,
    run: async (caller, input): Promise<ExecResult> => {
      const parsed = draftSchema.parse(input) as ReplaceInput;
      const r = await resolve(caller, parsed);
      if (!r.ok) return r.result;
      if (r.project.status === "completed") return refusal("project_completed");
      if (op === "create" && r.existing) {
        return { ok: false, code: "already_assigned", message: "This team is already actively assigned to this scope." };
      }
      if (op === "replace" && !r.target) return refusal("replace_target_not_active");
      const normalized = op === "create" ? normAssign(parsed) : normReplace(parsed);
      const memberCalendar = await clashVerdict(caller, parsed.teamId, parsed.projectId);
      const token = mintCapabilityConfirmation({
        actionId: confirmId,
        input: normalized,
        userId: caller.userId,
        stateFingerprint: r.fingerprint,
      });
      return {
        ok: true,
        data: {
          preview: {
            actingFor: r.employer.organizationName,
            project: { id: r.project.id, title: r.project.title, status: r.project.status, city: r.project.city },
            team: { id: parsed.teamId, name: r.teamName },
            scope: scopeKey(r.workObjectId, r.taskId),
            change: op === "create" ? "assign the team as ONE relationship (no per-person rows)" : "replace the active assignment with this team (the old one is ended, kept as history)",
            ...(op === "replace" ? { replacing: { assignmentId: (parsed as ReplaceInput).replaceAssignmentId } } : {}),
            memberCalendar,
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
    title: op === "create" ? "Confirm assigning the team" : "Confirm replacing the team assignment",
    description:
      "Verifies the token against the exact input, the caller's CURRENT organization and the CURRENT team-assignment state " +
      "(anything changed in between invalidates it, so a token cannot be replayed), then calls the same server core the web project page uses " +
      "(assign_team_to_work_v1) and reads the assignment back.",
    exposed: true,
    annotations: confirmAnnotations,
    inputSchema: confirmSchema,
    run: async (caller, input): Promise<ExecResult> => {
      const { confirmationToken, ...rest } = confirmSchema.parse(input);
      const parsed = rest as ReplaceInput;
      const r = await resolve(caller, parsed);
      if (!r.ok) return r.result;
      const verdict = verifyCapabilityConfirmation({
        actionId: confirmId,
        token: confirmationToken,
        input: op === "create" ? normAssign(parsed) : normReplace(parsed),
        userId: caller.userId,
        currentStateFingerprint: r.fingerprint,
      });
      if (!verdict.ok) return rejected(verdict.reason);
      const result = await assignTeamToWork(
        {
          teamId: parsed.teamId,
          projectId: parsed.projectId,
          workObjectId: r.workObjectId,
          taskId: r.taskId,
          replaceAssignmentId: r.replaceId,
        },
        caller as TeamAssignmentCaller,
      );
      if (result.status !== "ok") return refusal(result.status);
      const { conflicts, unknown } = membersNeedingNotice(result.memberCalendar);
      return {
        ok: true,
        data: {
          status: result.outcome,
          actingFor: r.employer.organizationName,
          project: { id: r.project.id, title: r.project.title },
          team: { id: parsed.teamId, name: r.teamName },
          assignmentId: result.assignmentId,
          memberCalendar: { collides: conflicts.length, unknown: unknown.length, members: result.memberCalendar.length },
          structuredDestination: `/dashboard/projects/${r.project.id}`,
        },
      };
    },
  };
  return [draft, confirm];
}

// ── end ───────────────────────────────────────────────────────────────────

async function resolveEnd(caller: CapabilityCaller, parsed: EndInput) {
  const gate = await employerForTeamWork(caller);
  if (!gate.ok) return gate;
  const { employer } = gate;
  const { data, error } = await asAny(caller.supabase)
    .from("team_assignments")
    .select("id, team_org_id, project_id, work_object_id, task_id, ended_at")
    .eq("id", parsed.assignmentId)
    .maybeSingle();
  if (error) return { ok: false as const, result: { ok: false, code: "unavailable", message: "The team-assignment read failed." } as ExecResult };
  const a = data as ActiveAssignment | null;
  if (!a) return { ok: false as const, result: { ok: false, code: "not_found", message: "No such team assignment the caller can see." } as ExecResult };
  const proj = await readProject(caller, employer, a.project_id);
  if (!proj.ok) return proj;
  const team = await readTeamName(caller, a.team_org_id);
  const fingerprint = ["team-end", employer.organizationId, a.id, a.ended_at ? "ended" : "active"].join(":");
  return { ok: true as const, employer, assignment: a, project: proj.project, teamName: team.ok ? team.name : null, fingerprint };
}

const endConfirmSchema = endFields.extend({ confirmationToken: z.string().min(10) });

const teamAssignmentEndDraft: CapabilityDescriptor = {
  id: "team_assignment.end_draft",
  kind: "draft",
  title: "Draft ending a team assignment",
  description:
    "Checks that the team assignment (assignmentId from projects.list / the project page) is ACTIVE on a project of the organization the caller is acting for and names the project and the team. " +
    "Ending keeps the assignment as history (status 'ended', with the optional reason); nothing is deleted, and entries the members already wrote stay attributed to them. " +
    "Returns a preview and a one-time token bound to the CURRENT state. NOTHING is written.",
  exposed: true,
  annotations: draftAnnotations,
  inputSchema: endFields,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = endFields.parse(input);
    const r = await resolveEnd(caller, parsed);
    if (!r.ok) return r.result;
    if (r.assignment.ended_at) {
      return { ok: false, code: "not_assigned", message: "This team assignment is already ended." };
    }
    const token = mintCapabilityConfirmation({
      actionId: "team_assignment.end_confirm",
      input: normEnd(parsed),
      userId: caller.userId,
      stateFingerprint: r.fingerprint,
    });
    return {
      ok: true,
      data: {
        preview: {
          actingFor: r.employer.organizationName,
          project: { id: r.project.id, title: r.project.title, status: r.project.status },
          team: { id: r.assignment.team_org_id, name: r.teamName },
          scope: scopeKey(r.assignment.work_object_id, r.assignment.task_id),
          change: "end (status becomes ended; kept as history; members' past entries are unchanged)",
          reason: parsed.reason ?? null,
        },
        confirmationToken: token,
        note: "Nothing was written. Confirming requires team_assignment.end_confirm with this exact input and token.",
      },
    };
  },
};

const teamAssignmentEndConfirm: CapabilityDescriptor = {
  id: "team_assignment.end_confirm",
  kind: "confirm",
  title: "Confirm ending the team assignment",
  description:
    "Verifies the token against the exact input, the caller's CURRENT organization and the CURRENT assignment state (a replay is rejected), " +
    "then calls the same server core the web project page uses (end_team_assignment_v1) and reads the outcome back.",
  exposed: true,
  annotations: confirmAnnotations,
  inputSchema: endConfirmSchema,
  run: async (caller, input): Promise<ExecResult> => {
    const { confirmationToken, ...rest } = endConfirmSchema.parse(input);
    const parsed = rest as EndInput;
    const r = await resolveEnd(caller, parsed);
    if (!r.ok) return r.result;
    const verdict = verifyCapabilityConfirmation({
      actionId: "team_assignment.end_confirm",
      token: confirmationToken,
      input: normEnd(parsed),
      userId: caller.userId,
      currentStateFingerprint: r.fingerprint,
    });
    if (!verdict.ok) return rejected(verdict.reason);
    const result = await endTeamAssignment(
      { assignmentId: parsed.assignmentId, reason: parsed.reason ?? null },
      caller as TeamAssignmentCaller,
    );
    if (result.status !== "ok") return refusal(result.status);
    return {
      ok: true,
      data: {
        status: result.outcome,
        actingFor: r.employer.organizationName,
        project: { id: r.project.id, title: r.project.title },
        team: { id: r.assignment.team_org_id, name: r.teamName },
        assignmentId: parsed.assignmentId,
        structuredDestination: `/dashboard/projects/${r.project.id}`,
      },
    };
  },
};

const [teamAssignmentCreateDraft, teamAssignmentCreateConfirm] = makeAssignPair("create");
const [teamAssignmentReplaceDraft, teamAssignmentReplaceConfirm] = makeAssignPair("replace");

export const TEAM_ASSIGNMENT_CAPABILITIES: readonly CapabilityDescriptor[] = [
  teamAssignmentCreateDraft,
  teamAssignmentCreateConfirm,
  teamAssignmentReplaceDraft,
  teamAssignmentReplaceConfirm,
  teamAssignmentEndDraft,
  teamAssignmentEndConfirm,
];
