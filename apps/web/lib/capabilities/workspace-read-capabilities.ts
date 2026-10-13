import { z } from "zod";

import type { ExecResult } from "@/lib/conversation/executor-contract";

import type { CapabilityAnnotations, CapabilityCaller, CapabilityDescriptor } from "./contract";
import { scopedCallerRefusal } from "./conversation-action-bridge";

/**
 * WORKSPACE READS — what the web chat already ANSWERS, for an authorized
 * assistant.
 *
 * The web chat answers "show my calendar", "who is free this week", "which
 * tasks are open", "what does the agency offer us" from read loaders under
 * `lib/conversation/*` (and the planning reads they sit on). Each is a thin
 * adapter over the canonical read the matching web page renders. They resolve
 * the caller from `createClient()`, so — like the conversation-action bridge
 * — they run here through the bearer caller scope as the same person, under
 * the same RLS, in the same active workspace. This module adds no read of its
 * own and no rule of its own: every handler is one call to an existing loader
 * plus an honest mapping of its result states.
 *
 * HONEST STATES (SEP-7, #1314). A loader's "could not read" is never an empty
 * answer: `error` / `blocked` / `unavailable` → `unavailable`; a missing
 * organization context → `no_organization_context` with what to do;
 * `needs-migration` → `needs_migration`. `empty` stays an ok, empty answer —
 * the loader established that there is nothing.
 */

const READ: CapabilityAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const NO_ORG =
  "The caller is not acting for an organization they manage. Use context_list and context_switch to choose one. Nothing was read.";

/** Map a loader's `kind` result to the capability envelope. */
function fromLoader(result: unknown): ExecResult {
  const r = (result ?? {}) as { kind?: unknown };
  switch (r.kind) {
    case "no-company":
    case "no-company-context":
      return { ok: false, code: "no_organization_context", message: NO_ORG };
    case "needs-migration":
      return { ok: false, code: "needs_migration", message: "This part of the platform is not enabled yet. Nothing was read." };
    case "error":
    case "blocked":
    case "unavailable":
      return {
        ok: false,
        code: "unavailable",
        message: "This could not be read right now. That is not the same as 'nothing' — try again.",
      };
    case "no-worker":
      return { ok: false, code: "no_worker_profile", message: "The caller has no worker profile yet. Nothing was read." };
    default:
      return { ok: true, data: { ...(result as Record<string, unknown>) } };
  }
}

type Loader<I> = (input: I, caller: CapabilityCaller) => Promise<ExecResult>;

function read<S extends z.ZodTypeAny>(
  id: string,
  title: string,
  description: string,
  inputSchema: S,
  load: Loader<z.infer<S>>,
): CapabilityDescriptor {
  return {
    id,
    kind: "read",
    title,
    description: `${description} Reads only what the caller may see in the web app (same loader, same RLS, active workspace). Writes nothing.`,
    exposed: true,
    annotations: READ,
    inputSchema,
    run: async (caller, input): Promise<ExecResult> => {
      const refused = await scopedCallerRefusal(caller);
      if (refused) return refused;
      return load(inputSchema.parse(input), caller);
    },
  };
}

const none = z.object({}).strict();
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const uuid = z.string().uuid();

export const WORKSPACE_READ_CAPABILITIES: readonly CapabilityDescriptor[] = [
  // ── TIME: calendar, conflicts, capacity ────────────────────────────────
  read(
    "calendar.agenda.get",
    "My calendar and next steps",
    "The caller's plan for the coming days from the ONE calendar (/dashboard/planning): planned and committed work, approved leave, real conflicts stated plainly, overdue tasks and the nearest deadline, as a short summary in the caller's language plus the conflict count.",
    none,
    async (_i, caller) => {
      const { loadContextBrief } = await import("@/lib/conversation/agenda-summary");
      return fromLoader(await loadContextBrief(caller.locale));
    },
  ),
  read(
    "calendar.conflicts.get",
    "Calendar conflicts in my organization",
    "Who in the organization the caller manages has a planning conflict, and which commitments collide: two commitments of one person on the same days, or a commitment/plan colliding with approved leave — the SAME rules and window as the company home's conflict count and the workforce planning timeline. A conflict is a warning, never a prohibition.",
    z.object({ days: z.number().int().min(7).max(120).optional() }).strict(),
    async ({ days }) => {
      // The roster read below is the caller's OWN projects and cannot tell
      // "manages no organization" from "a source failed" — both came back as
      // `unknown` → `unavailable`, telling a worker the platform was down
      // (prod MCP read sweep 2026-10-13, #2349). The organization context is
      // established first, exactly as capacity.available.get does.
      const { requireEmployerCompany } = await import("@/lib/company/employer-company-context");
      if (!(await requireEmployerCompany()).ok) return fromLoader({ kind: "no-company" });
      const { readRosterConflicts } = await import("@/lib/planning/roster-conflicts");
      const r = await readRosterConflicts(days);
      if (r.status === "unknown") return fromLoader({ kind: "unavailable" });
      if (r.status === "empty") return { ok: true, data: { peopleWithConflicts: 0, people: [], note: "The roster has nobody on it." } };
      const byWorker = new Map<string, { workerId: string; name: string | null; collisions: unknown[] }>();
      const entry = (workerId: string, name: string | null) => {
        let e = byWorker.get(workerId);
        if (!e) byWorker.set(workerId, (e = { workerId, name, collisions: [] }));
        return e;
      };
      for (const row of r.view.rows) {
        const clashing = row.commitments.filter((c) => c.conflict);
        if (row.overlaps > 0 && clashing.length > 0) {
          entry(row.workerId, row.workerName).collisions.push(
            ...clashing.map((c) => ({ rule: "overlapping_commitments", kind: c.kind, label: c.label, startDate: c.startDate, endDate: c.endDate })),
          );
        }
      }
      for (const p of r.timeline.people) {
        const bars = p.bars.filter((b) => b.conflict);
        if (bars.length === 0) continue;
        entry(p.workerId, p.name).collisions.push(
          ...bars.map((b) => ({ rule: "timeline", kind: b.kind, label: b.label, startDate: b.startDate, endDate: b.endDate })),
        );
      }
      const people = [...byWorker.values()];
      return {
        ok: true,
        data: {
          window: { from: r.timeline.from, to: r.timeline.to },
          peopleWithConflicts: people.length,
          people,
          screen: "/dashboard/company/planning#roster-timeline",
        },
      };
    },
  ),
  read(
    "capacity.available.get",
    "Who is free (people and brigades)",
    "Who on the organization's roster is free to take work in the next 7 days (or on one named day): per person whether they are free, committed elsewhere or under a hard constraint (leave), from the SAME capacity read the web chat and workforce page use. Free means 'nothing recorded against it', never a promise.",
    z.object({ day: isoDay.optional() }).strict(),
    async ({ day }) => {
      const { loadWhoIsAvailableForChat } = await import("@/lib/conversation/capacity");
      return fromLoader(await loadWhoIsAvailableForChat(undefined, day ?? null));
    },
  ),
  read(
    "organization.today.get",
    "Today in my organization",
    "Today's operational facts for the organization: roster size, who is absent today and in the next 7 days, absence decisions waiting, work entries logged today, entries awaiting review and client reviews to decide. A null number means it could not be read — never zero.",
    none,
    async () => {
      const { getOrganizationToday } = await import("@/lib/planning/organization-today");
      const t = await getOrganizationToday();
      if (!t.applied) return t.reason === "not-authed" ? { ok: false, code: "auth" } : fromLoader({ kind: "error" });
      return { ok: true, data: { ...t } };
    },
  ),

  // ── PROJECTS, SITES, STAGES, TASKS ─────────────────────────────────────
  read(
    "tasks.open.list",
    "Open tasks",
    "Open work tasks assigned to or visible to the caller (project work packages with their status and due date), from the same read as the tasks surface.",
    none,
    async () => {
      const { loadOpenTasksForChat } = await import("@/lib/conversation/company-tasks");
      return fromLoader(await loadOpenTasksForChat());
    },
  ),
  read(
    "project.stages.list",
    "Project stages",
    "The stages of the organization's projects with their real status (planned, in progress, done, blocked).",
    none,
    async () => {
      const { loadCompanyStagesForChat } = await import("@/lib/conversation/company-stages");
      return fromLoader(await loadCompanyStagesForChat());
    },
  ),
  read(
    "project.risk.get",
    "Projects at risk",
    "Which of the organization's projects carry a real risk signal (overdue work, missing people, blocked stages), from the same read the project pages use.",
    none,
    async () => {
      const { loadProjectRiskForChat } = await import("@/lib/conversation/project-risk");
      return fromLoader(await loadProjectRiskForChat());
    },
  ),
  read(
    "project.readiness.get",
    "Project readiness checklist",
    "One project's readiness: per worker, which checklist items (documents, instructions) are needed, received or checked, and the people's answers. Give projectId, or projectName to pick by name; with several projects and no choice, the answer lists them to choose from.",
    z.object({ projectId: uuid.optional(), projectName: z.string().max(200).optional() }).strict(),
    async ({ projectId, projectName }) => {
      const { loadProjectReadinessForChat } = await import("@/lib/conversation/project-readiness");
      return fromLoader(await loadProjectReadinessForChat({ projectId: projectId ?? null, sentence: projectName ?? "" }));
    },
  ),
  read(
    "project.move.options",
    "Who can be moved between projects",
    "The workers and projects a move can be planned between (the input for project_move_what_if and company_move-worker_prepare).",
    none,
    async () => {
      const { loadProjectMoveOptionsForChat } = await import("@/lib/conversation/project-move");
      return fromLoader(await loadProjectMoveOptionsForChat());
    },
  ),
  read(
    "project.move.what_if",
    "What if I move this person",
    "Before moving a worker from one project to another: what the move would change and which calendar clashes it would create — the same what-if the web shows before the move. Nothing is moved.",
    z.object({ workerProfileId: uuid, fromProjectId: uuid, toProjectId: uuid }).strict(),
    async (input) => {
      const { loadProjectMoveWhatIfForChat } = await import("@/lib/conversation/project-move");
      return fromLoader(await loadProjectMoveWhatIfForChat(input));
    },
  ),

  // ── ORGANIZATIONS, AGENCIES, CLIENTS, INVITATIONS ──────────────────────
  read(
    "invitations.list",
    "Invitations addressed to me",
    "Pending invitations addressed to the caller (to join an organization, a roster, a cohort), with who sent them. Accept with worker_respond-invitation_prepare / _confirm.",
    none,
    async () => {
      const { loadInvitationsForChat } = await import("@/lib/conversation/invitations-chat");
      return fromLoader(await loadInvitationsForChat());
    },
  ),
  read(
    "agency.clients.get",
    "My agency's clients",
    "For an agency: the client companies connected to it, pending client invitations, and the needs clients shared with it.",
    none,
    async () => {
      const { loadAgencyBridgeForChat } = await import("@/lib/conversation/agency-workspace");
      return fromLoader(await loadAgencyBridgeForChat());
    },
  ),
  read(
    "client.agency_connections.get",
    "Agencies connected to my company",
    "For a company: the agencies it is connected to and the agency invitations waiting for an answer (accept/decline with company_accept-connection_prepare / company_decline-connection_prepare).",
    none,
    async () => {
      const { loadClientBridgeForChat } = await import("@/lib/conversation/client-bridge");
      return fromLoader(await loadClientBridgeForChat());
    },
  ),
  read(
    "client.agency_offers.get",
    "Candidates agencies offered us",
    "For a company: the candidates and teams agencies offered for its needs and the state of each offer (answer with company_respond-offer_prepare / company_respond-team-offer_prepare).",
    none,
    async () => {
      const { loadClientOffersForChat } = await import("@/lib/conversation/client-offers");
      return fromLoader(await loadClientOffersForChat());
    },
  ),
  read(
    "education.workspace.get",
    "My institution's programmes",
    "For an education organization: its programmes, cohorts and learners, as the education workspace shows them.",
    none,
    async () => {
      const { loadEducationWorkspaceForChat } = await import("@/lib/conversation/education-workspace");
      return fromLoader(await loadEducationWorkspaceForChat());
    },
  ),

  // ── PERSON: work, CV, documents, opportunities ─────────────────────────
  read(
    "worker.projects.list",
    "Projects I work on",
    "The projects the caller is assigned to, with the organization and dates.",
    none,
    async () => {
      const { loadWorkerProjectsForChat } = await import("@/lib/conversation/worker-projects");
      return fromLoader(await loadWorkerProjectsForChat());
    },
  ),
  read(
    "worker.engagements.list",
    "Who I work with",
    "The caller's work relationships (engagements) with organizations — the contexts a work entry can be logged under.",
    none,
    async () => {
      const { listWorkLogEngagements } = await import("@/lib/conversation/worklog-engagements");
      return fromLoader(await listWorkLogEngagements());
    },
  ),
  read(
    "worker.documents.gap",
    "Documents I am missing",
    "Which documents the caller's work direction and real opportunities ask for, which are recorded, and which are missing or expiring. Readiness, not a gate.",
    none,
    async () => {
      const { loadWorkerDocumentGap } = await import("@/lib/conversation/documents-gap-server");
      return fromLoader(await loadWorkerDocumentGap());
    },
  ),
  read(
    "cv.state.get",
    "My Living CV state",
    "The state of the caller's Living CV: what is recorded, what is confirmed, and what is still missing — the same classification the CV screen uses.",
    none,
    async () => {
      const { readMyCvState } = await import("@/lib/conversation/cv-state-server");
      return { ok: true, data: { ...(await readMyCvState()) } };
    },
  ),
  read(
    "work.find",
    "Find work for me",
    "Work opportunities matching the caller's profile, through the ONE ranking path of the opportunity board. Optional filters narrow it (profession = work-type slug, country = ISO-2, opportunityType e.g. internship).",
    z
      .object({
        profession: z.string().max(64).optional(),
        country: z.string().length(2).optional(),
        start: z.string().max(32).optional(),
        accommodation: z.string().max(32).optional(),
        transport: z.string().max(32).optional(),
        tool: z.string().max(64).optional(),
        opportunityType: z.string().max(64).optional(),
      })
      .strict(),
    async (f) => {
      const { findWorkForChat } = await import("@/lib/conversation/find-work");
      const any = Object.values(f).some((v) => v !== undefined);
      return fromLoader(
        await findWorkForChat(
          any
            ? {
                profession: f.profession ?? null,
                country: f.country?.toUpperCase() ?? null,
                start: f.start ?? null,
                accommodation: f.accommodation ?? null,
                transport: f.transport ?? null,
                tool: f.tool ?? null,
                opportunityType: f.opportunityType ?? null,
              }
            : undefined,
        ),
      );
    },
  ),
  read(
    "opportunities.saved.list",
    "Opportunities I saved",
    "The opportunities the caller saved on the board.",
    none,
    async () => {
      const { loadSavedOpportunitiesForChat } = await import("@/lib/conversation/saved-opportunities");
      return fromLoader(await loadSavedOpportunitiesForChat());
    },
  ),
  read(
    "jobs.new.list",
    "New jobs for me",
    "Opportunities that appeared since the caller last looked.",
    none,
    async () => {
      const { loadNewJobsForChat } = await import("@/lib/conversation/new-jobs");
      return fromLoader(await loadNewJobsForChat());
    },
  ),
];
