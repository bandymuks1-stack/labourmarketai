import type { FormState, WorkerFormSpec } from "@/lib/conversation/worker-forms";
import { OPPORTUNITY_TYPES } from "@/lib/demand/structured-demand-v2";

/**
 * Declarative inline-form specs for the EMPLOYER-side conversation actions
 * (rebuild W4). Same contract as `worker-forms.ts`: pure/client-safe specs the
 * ONE `InlineActionForm` renders, dispatched through the ONE canonical
 * dispatcher — no second entry point, no parallel intake.
 *
 * v1 scope: `company.create-demand` — the only employer action whose input is
 * fully self-contained (every other executor needs a real request/worker id,
 * which belongs to the scouting/demand surfaces' pickers; wiring those into
 * chat is a follow-up read-model slice, documented in the audit).
 *
 * The form writes to the SOLE canonical demand intake (`customer_requests`,
 * doctrine §17) via the existing draft/submit chain — exactly what the
 * /dashboard demand form calls. `create-demand` is an IMPORTANT-tier action,
 * so the spec carries `requiresConfirmation` and the form mints a one-time
 * confirmation token before dispatch (no silent important writes).
 */

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const numOrNull = (v: unknown) => {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : null;
};

export const COMPANY_FORMS: readonly WorkerFormSpec[] = [
  {
    actionId: "company.create-demand",
    titleKey: "conversation.actions.company.createDemand.label",
    requiresConfirmation: true,
    fields: [
      {
        name: "description",
        kind: "textarea",
        labelKey: "conversation.forms.fields.demandDescription",
        placeholderKey: "conversation.forms.fields.demandDescriptionPlaceholder",
        required: true,
        maxLength: 4000,
      },
      {
        name: "role",
        kind: "text",
        labelKey: "conversation.forms.fields.demandRole",
        placeholderKey: "conversation.forms.fields.demandRolePlaceholder",
        maxLength: 120,
      },
      {
        name: "location",
        kind: "text",
        labelKey: "conversation.forms.fields.demandLocation",
        placeholderKey: "conversation.forms.fields.demandLocationPlaceholder",
        maxLength: 120,
      },
      {
        name: "teamSize",
        kind: "number",
        labelKey: "conversation.forms.fields.teamSize",
        min: 1,
        max: 100000,
      },
      {
        // WHEN the work starts, as a day (owner contract 2026-09-04 §9:
        // "from 5 October" is a date, not an urgency bucket). Prefilled from
        // the sentence when it stated one; otherwise optional.
        name: "startDate",
        kind: "text",
        labelKey: "conversation.forms.fields.startDate",
        placeholderKey: "conversation.forms.fields.startDatePlaceholder",
        maxLength: 10,
      },
      {
        // WHEN the work ends — stated as a date ("iki spalio 20") or a
        // duration ("3 savaitėms"), prefilled from the sentence; optional.
        name: "endDate",
        kind: "text",
        labelKey: "conversation.forms.fields.endDate",
        placeholderKey: "conversation.forms.fields.startDatePlaceholder",
        maxLength: 10,
      },
      {
        name: "urgency",
        kind: "select",
        labelKey: "conversation.forms.fields.urgency",
        options: [
          { value: "", labelKey: "conversation.forms.fields.notStated" },
          { value: "flexible", labelKey: "conversation.forms.urgency.flexible" },
          { value: "this_week", labelKey: "conversation.forms.urgency.thisWeek" },
          { value: "urgent", labelKey: "conversation.forms.urgency.urgent" },
        ],
      },
      {
        // What KIND of opportunity this is — internship, apprenticeship,
        // temporary assignment … A declared value only; "not stated" writes
        // nothing (the structured cluster omits the key).
        name: "opportunityType",
        kind: "select",
        labelKey: "conversation.forms.fields.opportunityType",
        options: [
          { value: "", labelKey: "conversation.forms.fields.notStated" },
          ...OPPORTUNITY_TYPES.map((v) => ({
            value: v,
            labelKey: `structuredDemand.opportunityType.${v}`,
          })),
        ],
      },
      { name: "asDraft", kind: "checkbox", labelKey: "conversation.forms.fields.saveAsDraft" },
    ],
    build: (st: FormState) => ({
      intent: "hire_workers",
      mode: st.asDraft === true ? "draft" : "submit",
      description: s(st.description),
      role: s(st.role) || null,
      location: s(st.location) || null,
      teamSize: numOrNull(st.teamSize),
      urgency: s(st.urgency) || null,
      opportunityType: s(st.opportunityType) || null,
      startDate: s(st.startDate) || null,
      endDate: s(st.endDate) || null,
      // Derived by the structurer from the person's own sentence (never
      // typed): the taxonomy slug and the ISO market. They ride the form
      // state so the canonical columns (`role_or_work_type`, `country`) are
      // set — before this the chat intake stored only the free-text label.
      workType: s(st.workType) || null,
      country: s(st.country) || null,
    }),
  },
] as const;

/**
 * THE SUPPLY SIDE OF THE SAME INTAKE (owner window 7 §4, 2026-09-06).
 *
 * "Turime 20 suvirintojų ir ieškome jiems darbo Nyderlanduose." is not a
 * need — it is capacity offered to the market. The canonical object for it
 * already exists and is already written by the agency's own dashboard form:
 * a `customer_requests` row with `kind = 'agency_offer'`, which the
 * `company.create-demand` schema has always accepted as `intent: "partner"`.
 *
 * What was missing was only the DOOR: the sentence had nowhere to go, so an
 * agency stating capacity was read as a person hunting for a job.
 *
 * So this is the same action id, the same fields, the same zod schema, the
 * same confirmation token, the same dispatcher and the same executor — one
 * intake, not a second one. Exactly two things differ, and both are what the
 * person READS:
 *
 *   * the labels say "offer" rather than "need" (asking an agency to
 *     "describe the need" for twenty welders it HAS is the same inversion in
 *     the copy that the router had in its patterns);
 *   * `build` stamps `intent: "partner"`, so the row lands as `agency_offer`
 *     and is never mistaken for demand.
 *
 * A draft is not offered: the draft payload shape is defined for the
 * `company_request` kind only (see `companyCreateDemandSchema`), so the
 * supply form submits or does nothing.
 */
export function supplyOfferFormSpec(): WorkerFormSpec {
  const base = COMPANY_FORMS.find((f) => f.actionId === "company.create-demand");
  if (!base) throw new Error("company.create-demand form spec missing");
  return {
    ...base,
    titleKey: "conversation.actions.company.offerCapacity.label",
    fields: base.fields
      // The draft checkbox has no meaning for this kind — see above.
      .filter((f) => f.name !== "asDraft")
      .map((f) =>
        f.name === "description"
          ? {
              ...f,
              labelKey: "conversation.forms.fields.supplyDescription",
              placeholderKey: "conversation.forms.fields.supplyDescriptionPlaceholder",
            }
          : f.name === "role"
            ? {
                ...f,
                labelKey: "conversation.forms.fields.supplyRole",
                placeholderKey: "conversation.forms.fields.supplyRolePlaceholder",
              }
            : f.name === "teamSize"
              ? { ...f, labelKey: "conversation.forms.fields.supplyTeamSize" }
              : f.name === "location"
                ? { ...f, labelKey: "conversation.forms.fields.supplyLocation" }
                : f,
      ),
    build: (st: FormState) => ({
      ...base.build(st),
      intent: "partner",
      // `mode` is fixed: the draft shape is defined for company_request only.
      mode: "submit",
    }),
  };
}

/**
 * AGENCY — real recruiter pilot (2026-09-04). "Noriu pakviesti klientą" needs
 * exactly ONE missing fact (the client's e-mail); "pakviesk darbuotoją" the
 * same plus an optional note. Both are important-tier canonical writes, so
 * the inline form is the ONE missing question AND the confirmation.
 */
export const AGENCY_FORMS: readonly WorkerFormSpec[] = [
  {
    actionId: "agency.invite-client",
    titleKey: "conversation.actions.agency.inviteClient.label",
    requiresConfirmation: true,
    fields: [
      {
        name: "email",
        kind: "text",
        labelKey: "conversation.forms.fields.clientEmail",
        placeholderKey: "conversation.forms.fields.clientEmailPlaceholder",
        required: true,
        maxLength: 254,
      },
    ],
    build: (st: FormState) => ({ email: s(st.email) }),
  },
  {
    actionId: "company.invite-worker",
    titleKey: "conversation.actions.company.inviteWorker.label",
    requiresConfirmation: true,
    fields: [
      {
        name: "email",
        kind: "text",
        labelKey: "conversation.forms.fields.workerEmail",
        placeholderKey: "conversation.forms.fields.workerEmailPlaceholder",
        required: true,
        maxLength: 254,
      },
      {
        name: "note",
        kind: "text",
        labelKey: "conversation.forms.fields.inviteNote",
        placeholderKey: "conversation.forms.fields.inviteNotePlaceholder",
        maxLength: 500,
      },
    ],
    build: (st: FormState) => ({ email: s(st.email), note: s(st.note) || null }),
  },
  {
    // F2 — the SITE as a project object, by sentence; the city the sentence
    // named is pre-filled by the chat (visible, editable, still confirmed).
    actionId: "company.create-project",
    titleKey: "conversation.actions.company.createProject.label",
    requiresConfirmation: true,
    fields: [
      {
        name: "title",
        kind: "text",
        labelKey: "conversation.forms.fields.projectTitle",
        placeholderKey: "conversation.forms.fields.projectTitlePlaceholder",
        required: true,
        maxLength: 120,
      },
      {
        name: "city",
        kind: "text",
        labelKey: "conversation.forms.fields.projectCity",
        placeholderKey: "conversation.forms.fields.projectCityPlaceholder",
        maxLength: 120,
      },
    ],
    build: (st: FormState) => ({ title: s(st.title), city: s(st.city) || null }),
  },
] as const;

/**
 * "Pasiūlyk kandidatą" — the offer needs a real shared request AND a real
 * roster worker. Both lists come from the agency bridge read adapter at the
 * moment of asking, so the spec is BUILT per conversation turn: the select
 * offers only workers the agency really has, the share id is the one the
 * person just picked. Still the same InlineActionForm + dispatcher; the RPC
 * re-verifies both ids (share active, worker on THIS agency's roster).
 */
export function agencyProposeCandidateForm(
  shareId: string,
  roster: ReadonlyArray<{ workerId: string; label: string }>,
): WorkerFormSpec {
  return {
    actionId: "agency.propose-candidate",
    titleKey: "conversation.actions.agency.proposeCandidate.label",
    requiresConfirmation: true,
    fields: [
      {
        name: "workerId",
        kind: "select",
        labelKey: "conversation.forms.fields.rosterWorker",
        required: true,
        options: roster.map((w) => ({ value: w.workerId, label: w.label })),
      },
      {
        name: "note",
        kind: "text",
        labelKey: "conversation.forms.fields.inviteNote",
        placeholderKey: "conversation.forms.fields.proposalNotePlaceholder",
        maxLength: 500,
      },
    ],
    build: (st: FormState) => ({ shareId, workerId: s(st.workerId), note: s(st.note) || null }),
  };
}

/**
 * EDUCATION (owner contract 2026-09-04 §15). "Sukurk programą" needs a name
 * (everything else is optional); "pakviesk studentą" needs ONE e-mail. Both
 * are important-tier canonical writes over the same InlineActionForm +
 * dispatcher. Cohort and assignment forms are BUILT per turn (below) from
 * the institution's real programmes / cohorts / accepted learners.
 */
export const EDUCATION_FORMS: readonly WorkerFormSpec[] = [
  {
    actionId: "company.create-programme",
    titleKey: "conversation.actions.education.createProgramme.label",
    requiresConfirmation: true,
    fields: [
      {
        name: "name",
        kind: "text",
        labelKey: "conversation.forms.fields.programmeName",
        placeholderKey: "conversation.forms.fields.programmeNamePlaceholder",
        required: true,
        maxLength: 160,
      },
      {
        name: "description",
        kind: "textarea",
        labelKey: "conversation.forms.fields.programmeDescription",
        maxLength: 2000,
      },
    ],
    build: (st: FormState) => ({
      name: s(st.name),
      description: s(st.description) || null,
      // Recognised from the sentence when it named a trade (structurer);
      // never typed as a slug.
      targetProfessionSlug: s(st.targetProfessionSlug) || null,
      educationTypeSlug: s(st.educationTypeSlug) || null,
    }),
  },
  {
    actionId: "company.invite-learner",
    titleKey: "conversation.actions.education.inviteLearner.label",
    requiresConfirmation: true,
    fields: [
      {
        name: "email",
        kind: "text",
        labelKey: "conversation.forms.fields.learnerEmail",
        placeholderKey: "conversation.forms.fields.learnerEmailPlaceholder",
        required: true,
        maxLength: 254,
      },
      {
        name: "name",
        kind: "text",
        labelKey: "conversation.forms.fields.learnerName",
        maxLength: 120,
      },
    ],
    build: (st: FormState) => ({ email: s(st.email), name: s(st.name) || null }),
  },
] as const;

/** "Sukurk grupę" — a cohort belongs to ONE real programme, picked by the
 *  person (or the only one). Dates are optional ISO days. */
export function educationCreateCohortForm(programId: string): WorkerFormSpec {
  return {
    actionId: "company.create-cohort",
    titleKey: "conversation.actions.education.createCohort.label",
    requiresConfirmation: true,
    fields: [
      {
        name: "name",
        kind: "text",
        labelKey: "conversation.forms.fields.cohortName",
        placeholderKey: "conversation.forms.fields.cohortNamePlaceholder",
        required: true,
        maxLength: 120,
      },
      {
        name: "startsOn",
        kind: "text",
        labelKey: "conversation.forms.fields.cohortStarts",
        placeholderKey: "conversation.forms.fields.startDatePlaceholder",
        maxLength: 10,
      },
      {
        name: "endsOn",
        kind: "text",
        labelKey: "conversation.forms.fields.cohortEnds",
        placeholderKey: "conversation.forms.fields.startDatePlaceholder",
        maxLength: 10,
      },
    ],
    build: (st: FormState) => ({
      programId,
      name: s(st.name),
      startsOn: s(st.startsOn) || null,
      endsOn: s(st.endsOn) || null,
    }),
  };
}

/** "Priskirk studentą grupei" — both selects list only what the institution
 *  really has: its cohorts and the learners who accepted its invitation. */
export function educationAssignLearnerForm(
  cohorts: ReadonlyArray<{ id: string; label: string }>,
  learners: ReadonlyArray<{ profileId: string; label: string }>,
): WorkerFormSpec {
  return {
    actionId: "company.assign-learner",
    titleKey: "conversation.actions.education.assignLearner.label",
    requiresConfirmation: true,
    fields: [
      {
        name: "cohortId",
        kind: "select",
        labelKey: "conversation.forms.fields.cohort",
        required: true,
        options: cohorts.map((c) => ({ value: c.id, label: c.label })),
      },
      {
        name: "profileId",
        kind: "select",
        labelKey: "conversation.forms.fields.learner",
        required: true,
        options: learners.map((l) => ({ value: l.profileId, label: l.label })),
      },
    ],
    build: (st: FormState) => ({ cohortId: s(st.cohortId), profileId: s(st.profileId) }),
  };
}

/** "Pridėk užduotį" — BUILT per turn from the company's real projects (the
 *  same list the "projects" chip reads); priority from the closed set. */
export function companyCreateTaskForm(
  projects: ReadonlyArray<{ value: string; label: string }>,
): WorkerFormSpec {
  return {
    actionId: "company.create-task",
    titleKey: "conversation.actions.company.createTask.label",
    fields: [
      { name: "title", kind: "text", labelKey: "conversation.forms.fields.taskTitle", placeholderKey: "conversation.forms.fields.taskTitlePlaceholder", required: true, maxLength: 160 },
      { name: "projectId", kind: "select", labelKey: "conversation.forms.fields.taskProject", options: [{ value: "", label: "—" }, ...projects.map((p) => ({ value: p.value, label: p.label }))] },
      { name: "dueDate", kind: "text", labelKey: "conversation.forms.fields.taskDue", placeholderKey: "conversation.forms.fields.validUntilPlaceholder", maxLength: 10 },
      { name: "priority", kind: "select", labelKey: "conversation.forms.fields.taskPriority", options: ["low", "normal", "high"].map((v) => ({ value: v, labelKey: `tasks.priority.${v}` })) },
    ],
    build: (st: FormState) => ({
      title: s(st.title),
      projectId: s(st.projectId) || null,
      dueDate: s(st.dueDate) || null,
      priority: (s(st.priority) || "normal") as "low" | "normal" | "high",
    }),
  };
}

export function getCompanyForm(actionId: string): WorkerFormSpec | undefined {
  return (
    COMPANY_FORMS.find((f) => f.actionId === actionId) ??
    AGENCY_FORMS.find((f) => f.actionId === actionId) ??
    EDUCATION_FORMS.find((f) => f.actionId === actionId)
  );
}
