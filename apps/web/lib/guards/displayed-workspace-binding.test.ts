import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SELECTED WORKSPACE = ACTION CONTEXT for the form and button writes (#1849
 * residue, owner EXECUTION LOCK 2026-09-24 §A: selector = active context =
 * data = permissions = actions).
 *
 * #1849 bound the CHAT's writes to the workspace the screen displayed
 * (`dispatchWorkerAction(…, { expectedWorkspaceId })` → `stale_context`). The
 * server actions that write into "the active organization" still re-resolved
 * it at execution time, so a form opened in organization A and submitted
 * after a switch to B in another tab wrote into B. ONE root cause, ONE fix:
 * each such action's FIRST statement is `refuseStaleWorkspace(<displayed>)`,
 * the same `isStaleWorkspaceContext` comparison against the same resolver,
 * and every screen that calls it sends the displayed workspace.
 *
 * Scope rule (why an action is or is not listed): it is listed when its
 * TARGET organization comes from the active workspace (it creates a row
 * there, or writes "the active organization"). Actions that update a row BY
 * ID and first require that row to belong to the active organization are
 * already fail-closed after a switch (they refuse; they cannot write into the
 * other workspace). `saveCompanySetupAction` writes an EXPLICIT `company_id`
 * (or a new company) and is deliberately not bound. Reads are not bound: a
 * read of the workspace that IS active is correct.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

/** [module, exported action] — the actions whose target is the active org. */
const BOUND_ACTIONS: readonly (readonly [string, string])[] = [
  ["lib/agency/bridge-conversation.ts", "openAgencyConnectionConversationAction"],
  ["lib/agreements/agreements-actions.ts", "createAgreementAction"],
  ["lib/booking/booking-actions.ts", "proposeBookingAction"],
  ["lib/communication/request-worker-conversation.ts", "requestWorkerConversationAction"],
  ["lib/company/actions.ts", "inviteCompanyWorkerAction"],
  ["lib/company/actions.ts", "assignCompanyWorkerRoleAction"],
  ["lib/company/actions.ts", "provisionCompanyWorkerEngagementContextAction"],
  ["lib/company/actions.ts", "setCompanyWorkerJournalReviewAction"],
  ["lib/company/description-actions.ts", "saveOrganizationDescriptionAction"],
  ["lib/company/membership-actions.ts", "inviteMembershipAction"],
  ["lib/company/membership-actions.ts", "cancelMembershipInviteAction"],
  ["lib/company/membership-actions.ts", "changeMembershipRoleAction"],
  ["lib/company/membership-actions.ts", "revokeMembershipAction"],
  ["lib/company/membership-actions.ts", "setMembershipInvitationManagerAction"],
  ["lib/company/membership-actions.ts", "leaveOrganizationAction"],
  ["lib/company/project-context-actions.ts", "createProjectContextAction"],
  ["lib/company/team-brigade-actions.ts", "createTeamAction"],
  ["lib/decisions/decisions-actions.ts", "createManagementDecisionAction"],
  ["lib/documents/org-document-actions.ts", "createOrgDocumentAction"],
  ["lib/objects/objects-actions.ts", "saveWorkObjectAction"],
  ["lib/organization-evidence/import-actions.ts", "startEvidenceImportAction"],
  ["lib/organization-people/ingest-actions.ts", "commitPeopleIngestAction"],
  ["lib/privacy/contact-disclosure-actions.ts", "requestContactDisclosureAction"],
  ["lib/projects/actions.ts", "createProjectAction"],
  ["lib/reviews/reviews-actions.ts", "createReviewCycleAction"],
  ["lib/timesheet-import/import-confirm-actions.ts", "confirmTimesheetImportAction"],
  ["lib/training/training-actions.ts", "createTrainingProgramAction"],
  ["lib/work-hours/allocations-actions.ts", "recordAllocationAction"],
  ["lib/workspace/pins-actions.ts", "pinAction"],
  ["lib/workspace/pins-actions.ts", "unpinAction"],
  ["lib/workspace/pins-actions.ts", "reorderPinsAction"],
];

/** The body's first statement, or null when the action is not found. */
function firstStatementOf(src: string, fn: string): string | null {
  const start = src.indexOf(`export async function ${fn}(`);
  if (start < 0) return null;
  const body = /\)\s*:\s*Promise<[^\n]*>\s*\{\n/.exec(src.slice(start));
  if (!body) return null;
  const after = src.slice(start + body.index + body[0].length);
  return after.split("\n").find((l) => l.trim().length > 0)?.trim() ?? null;
}

const refusesFirst = (src: string, fn: string): boolean =>
  /^await refuseStaleWorkspace\(.+\);$/.test(firstStatementOf(src, fn) ?? "");

describe("every write into the active organization refuses a stale screen FIRST", () => {
  it.each(BOUND_ACTIONS)("%s · %s", (file, fn) => {
    const src = read(file);
    expect(firstStatementOf(src, fn), `${fn} not found`).not.toBeNull();
    // FIRST: before anything reads the active workspace to pick the target,
    // and outside every try/catch (a caught NEXT_REDIRECT would be swallowed).
    expect(refusesFirst(src, fn)).toBe(true);
    expect(src).toContain('from "@/lib/company/stale-workspace"');
  });

  it("NEGATIVE CONTROL: the detector fails an action whose refusal is missing or not first", () => {
    const [file, fn] = BOUND_ACTIONS[1]!;
    const src = read(file);
    const without = src.replace(/\n\s*await refuseStaleWorkspace\([^\n]*\);/, "");
    expect(refusesFirst(without, fn)).toBe(false);
    const later = src.replace(
      /(\n)(\s*)(await refuseStaleWorkspace\([^\n]*\);)/,
      "$1$2const locale = readLocale(formData);\n$2$3",
    );
    expect(refusesFirst(later, fn)).toBe(false);
  });

  it("the explicit-target setup action is NOT bound (it names its own company)", () => {
    const setup = read("lib/company/setup-actions.ts");
    expect(setup).not.toContain("refuseStaleWorkspace");
    expect(setup).toContain('formData.get("company_id")');
  });
});

describe("refuseStaleWorkspace is the dispatcher's comparison, not a second one", () => {
  const helper = read("lib/company/stale-workspace.ts");

  it("compares with isStaleWorkspaceContext against the ONE resolver's active id", () => {
    expect(helper).toContain('import { isStaleWorkspaceContext } from "@/lib/conversation/dispatch-core"');
    expect(helper).toContain("const workspace = await getWorkspaceContext();");
    expect(helper).toContain("isStaleWorkspaceContext(expected, workspace.activeWorkspaceId)");
    // Never authority: it only refuses — no write, no pointer move, no role read.
    expect(helper).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
    expect(helper).not.toContain("switchActiveWorkspace");
  });

  it("refuses to the home with the closed stale-context token", () => {
    expect(helper).toContain("redirect(`/${locale}/dashboard?notice=${STALE_CONTEXT_NOTICE}`)");
    const switchModule = read("lib/company/organization-switch.ts");
    expect(switchModule).toContain('export const DISPLAYED_WORKSPACE_FIELD = "expectedWorkspaceId";');
    expect(switchModule).toContain('export const STALE_CONTEXT_NOTICE = "stale_context";');
  });

  it("the home renders the chat's own stale-context line ONLY for that exact token", () => {
    const page = read("app/[locale]/dashboard/page.tsx");
    expect(page).toContain("noticeParam === STALE_CONTEXT_NOTICE ? (");
    expect(page).toContain('labels={{ body: tChat("staleContext"), setupCta: null }}');
  });
});

/** The opening tag of the `<form>` whose `action=` starts with `binding`, and
 *  the first element inside it. */
function firstChildOfForms(src: string, binding: string): string[] {
  const out: string[] = [];
  let pos = 0;
  for (;;) {
    const k = src.indexOf(`action={${binding}`, pos);
    if (k < 0) return out;
    const open = src.lastIndexOf("<form", k);
    let depth = 0;
    let end = -1;
    for (let i = open; i < src.length; i++) {
      const c = src[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0 && src[i - 1] !== "=") {
        end = i;
        break;
      }
    }
    if (open >= 0 && end > k) out.push(src.slice(end + 1).trimStart().split("\n")[0]!.trim());
    pos = k + 1;
  }
}

/** [component, the `action={…}` binding of each bound form, expected count]. */
const BOUND_FORMS: readonly (readonly [string, string, number])[] = [
  ["components/app/client-agency-bridge-section.tsx", "openAgencyConnectionConversationAction}", 1],
  ["components/app/agency-bridge-section.tsx", "openAgencyConnectionConversationAction}", 1],
  ["components/app/agreements-register.tsx", "createAgreementAction}", 1],
  ["components/app/company-workers-section.tsx", "(fd) => {", 1],
  ["components/app/worker-operations-role-form.tsx", "formAction}", 1],
  ["components/app/worker-operations-role-form.tsx", "provisionFormAction}", 1],
  ["components/app/worker-operations-role-form.tsx", "reviewFormAction}", 1],
  ["components/app/organization-members-section.tsx", "rowAction}", 4],
  ["components/app/organization-members-section.tsx", "inviteAction}", 1],
  ["components/app/project-context-create-form.tsx", "action}", 1],
  ["components/app/management-decisions-section.tsx", "createManagementDecisionAction}", 1],
  ["components/app/org-documents-register.tsx", "createOrgDocumentAction}", 1],
  ["components/app/work-objects-section.tsx", "saveAction}", 2],
  ["components/app/evidence-import-forms.tsx", "submit}", 1],
  ["components/app/project-assignment-manager.tsx", "createAction}", 1],
  ["components/app/development-reviews-section.tsx", "createReviewCycleAction}", 1],
  ["components/app/timesheet-import-review.tsx", "confirmAction}", 1],
  ["components/app/training-register.tsx", "createTrainingProgramAction}", 1],
  ["components/app/work-hours-quick-entry.tsx", "action}", 1],
];

describe("every screen that calls a bound action sends the workspace it displayed", () => {
  it.each(BOUND_FORMS)("%s · form action={%s", (file, binding, count) => {
    const src = read(file);
    const firsts = firstChildOfForms(src, binding);
    const bound = firsts.filter((l) => l === "<DisplayedWorkspaceField />");
    expect(bound.length).toBeGreaterThanOrEqual(count);
  });

  it("the evidence source form is the one bound in evidence-import-forms (start of an import)", () => {
    const src = read("components/app/evidence-import-forms.tsx");
    expect(src).toMatch(/data-testid="evidence-source-form"\n\s*>\n\s*<DisplayedWorkspaceField \/>/);
  });

  it.each([
    ["components/app/propose-booking-button.tsx", /proposeBookingAction\(\{[^}]*expectedWorkspaceId,/],
    ["components/app/request-communication-button.tsx", /requestWorkerConversationAction\(\{[^}]*expectedWorkspaceId,/],
    ["components/app/request-contact-details-button.tsx", /requestContactDisclosureAction\(\{[^}]*expectedWorkspaceId,/],
    ["components/app/people-import-panel.tsx", /commitPeopleIngestAction\(\{[^}]*expectedWorkspaceId,/],
    ["components/app/business-public-profile-panel.tsx", /saveOrganizationDescriptionAction\(description, locale, expectedWorkspaceId\)/],
    ["components/app/team-brigades-panel.tsx", /createTeamAction\(trimmed, expectedWorkspaceId\)/],
    ["components/app/conversation/chat/conversation-chat.tsx", /pinAction\(\{ ref, label, expectedWorkspaceId \}\)/],
    ["components/app/conversation/chat/conversation-chat.tsx", /unpinAction\(\{ ref, expectedWorkspaceId \}\)/],
  ] as const)("%s passes the displayed workspace", (file, rx) => {
    expect(read(file)).toMatch(rx);
  });

  it("the displayed workspace is the shell's own value — the one the chat already sends", () => {
    const field = read("components/app/workspace/displayed-workspace-field.tsx");
    expect(field).toContain("useAuthOptional()?.activeWorkspaceId ?? undefined");
    expect(field).toContain("name={DISPLAYED_WORKSPACE_FIELD}");
    const form = read("components/app/conversation/inline-action-form.tsx");
    expect(form).toContain("useAuthOptional()?.activeWorkspaceId ?? undefined");
  });

  it("NEGATIVE CONTROL: a form without the field is not counted", () => {
    const src = read("components/app/agreements-register.tsx").replace(
      /(action=\{createAgreementAction\}[\s\S]*?>)\s*<DisplayedWorkspaceField \/>/,
      "$1",
    );
    expect(firstChildOfForms(src, "createAgreementAction}")).not.toContain(
      "<DisplayedWorkspaceField />",
    );
  });
});
