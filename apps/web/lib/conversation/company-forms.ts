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
    }),
  },
] as const;

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

export function getCompanyForm(actionId: string): WorkerFormSpec | undefined {
  return (
    COMPANY_FORMS.find((f) => f.actionId === actionId) ??
    AGENCY_FORMS.find((f) => f.actionId === actionId)
  );
}
