import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { classifyIntent } from "@/lib/conversation/intent-router";
import { INTENT_REGISTRY } from "@/lib/conversation/intent-registry";
import { CONVERSATION_ACTIONS } from "@/lib/conversation/action-registry";
import { COMPANY_ACTION_SCHEMAS } from "@/lib/conversation/company-schemas";
import {
  EDUCATION_FORMS,
  educationAssignLearnerForm,
  educationCreateCohortForm,
  getCompanyForm,
} from "@/lib/conversation/company-forms";
import { roleContextForAction } from "@/lib/conversation/action-role-context";

/**
 * Owner Master Execution Contract 2026-09-04 §15 — a real education
 * institution is waiting. Before this slice its commands (programme, cohort,
 * learner assignment, learner invitation) existed only as page forms; the
 * chat could route to the page. Now they are sentences over the ONE
 * dispatcher, built from the institution's real rows.
 */

const APP = join(__dirname, "..", "..");
const CHAT = readFileSync(join(APP, "components", "app", "conversation", "chat", "conversation-chat.tsx"), "utf8");
const EXECUTORS = readFileSync(join(__dirname, "company-executors.ts"), "utf8");
const ADAPTER = readFileSync(join(__dirname, "education-workspace.ts"), "utf8");

const EDU_IDS = [
  "company.create-programme",
  "company.create-cohort",
  "company.assign-learner",
  "company.invite-learner",
] as const;

describe("the four institution commands are registered canonical actions", () => {
  it.each(EDU_IDS)("%s — company role, important write, executor + schema", (id) => {
    const entry = CONVERSATION_ACTIONS.find((a) => a.id === id);
    expect(entry).toBeDefined();
    expect(entry!.subject).toBe("company");
    expect(entry!.allowedRoles).toEqual(["company"]);
    expect(entry!.confirmation).toBe("important_write");
    expect(entry!.handler.kind).toBe("server_action");
    expect(COMPANY_ACTION_SCHEMAS[id]).toBeDefined();
    expect(EXECUTORS).toContain(`"${id}": async`);
    expect(roleContextForAction(id)).toBe("company");
  });

  it("the executors resolve the organization from the ACTIVE workspace and emit the institution's first real action", () => {
    expect(EXECUTORS).toMatch(/"company\.create-programme": async \(input, ctx\) => \{\s*const org = await requireEmployerCompany\(\)/);
    expect(EXECUTORS).toMatch(/relationshipSlug: "student"/);
    expect(EXECUTORS).toMatch(/invitationType: "join_organization"/);
    expect(EXECUTORS).toMatch(/emitServerFunnelEvent\(FUNNEL_EVENTS\.firstRealAction/);
    for (const step of ["programme_created", "cohort_created", "learner_assigned", "learner_invited"]) {
      expect(EXECUTORS).toContain(`"${step}"`);
    }
    // A forbidden RPC answer is the dispatcher's not_authorized — never a guess.
    expect(EXECUTORS).toMatch(/if \(r\.status === "forbidden"\) return \{ ok: false, code: "not_authorized" \}/);
  });
});

describe("schemas gate the shape; the closed sets stay in the RPCs", () => {
  it("programme: a name is enough; cohort: needs its programme; assign: two uuids; invite: an e-mail", () => {
    expect(COMPANY_ACTION_SCHEMAS["company.create-programme"].safeParse({ name: "Suvirintojų kursas" }).success).toBe(true);
    expect(COMPANY_ACTION_SCHEMAS["company.create-programme"].safeParse({ name: "S" }).success).toBe(false);
    expect(
      COMPANY_ACTION_SCHEMAS["company.create-cohort"].safeParse({
        programId: "11111111-1111-4111-8111-111111111111",
        name: "2026 ruduo",
        startsOn: "2026-09-15",
        endsOn: null,
      }).success,
    ).toBe(true);
    expect(COMPANY_ACTION_SCHEMAS["company.create-cohort"].safeParse({ programId: "x", name: "a" }).success).toBe(false);
    expect(
      COMPANY_ACTION_SCHEMAS["company.assign-learner"].safeParse({
        cohortId: "11111111-1111-4111-8111-111111111111",
        profileId: "22222222-2222-4222-8222-222222222222",
      }).success,
    ).toBe(true);
    expect(COMPANY_ACTION_SCHEMAS["company.invite-learner"].safeParse({ email: "studentas@pastas.lt" }).success).toBe(true);
    expect(COMPANY_ACTION_SCHEMAS["company.invite-learner"].safeParse({ email: "not-an-email" }).success).toBe(false);
  });

  it("every form's build output parses against the dispatch schema", () => {
    const programme = getCompanyForm("company.create-programme")!;
    expect(COMPANY_ACTION_SCHEMAS["company.create-programme"].safeParse(programme.build({ name: "Kursas", description: "" })).success).toBe(true);
    const invite = getCompanyForm("company.invite-learner")!;
    expect(COMPANY_ACTION_SCHEMAS["company.invite-learner"].safeParse(invite.build({ email: "a@b.lt", name: "" })).success).toBe(true);
    const cohort = educationCreateCohortForm("11111111-1111-4111-8111-111111111111");
    expect(COMPANY_ACTION_SCHEMAS["company.create-cohort"].safeParse(cohort.build({ name: "Ruduo", startsOn: "", endsOn: "" })).success).toBe(true);
    const assign = educationAssignLearnerForm(
      [{ id: "11111111-1111-4111-8111-111111111111", label: "Kursas — Ruduo" }],
      [{ profileId: "22222222-2222-4222-8222-222222222222", label: "Jonas" }],
    );
    expect(
      COMPANY_ACTION_SCHEMAS["company.assign-learner"].safeParse(
        assign.build({ cohortId: "11111111-1111-4111-8111-111111111111", profileId: "22222222-2222-4222-8222-222222222222" }),
      ).success,
    ).toBe(true);
    expect(EDUCATION_FORMS.every((f) => f.requiresConfirmation)).toBe(true);
  });
});

describe("the sentences reach the commands (five locales)", () => {
  it("invite a learner", () => {
    for (const text of ["Pakviesk studentą", "Invite a learner", "Пригласить студента", "Leerling uitnodigen", "Schüler einladen"]) {
      expect(classifyIntent(text).intent, text).toBe("invite-student");
    }
    expect(INTENT_REGISTRY["invite-student"].access).toBe("write");
  });
  it("create a programme / cohort, assign a learner, list programmes — all land on the programmes handler", () => {
    for (const text of [
      "Sukurk programą",
      "Create a cohort",
      "Создать программу",
      "Nieuwe opleiding aanmaken",
      "Programm anlegen",
      "priskirk studentą grupei",
      "assign the learner to a cohort",
      "parodyk programas",
      "show my programmes",
    ]) {
      expect(classifyIntent(text).intent, text).toBe("programmes");
    }
    expect(INTENT_REGISTRY.programmes.access).toBe("write");
  });
  it("the chat reads the verb to pick the form, and reads real rows for cohorts and learners", () => {
    expect(CHAT).toMatch(/programmes: \(\) => runEducationProgrammes\(educationModeFromText\(text\)\)/);
    expect(CHAT).toMatch(/inviteStudent: \(\) => startEducationInvite\(text\)/);
    expect(CHAT).toMatch(/loadEducationWorkspaceForChat\(\)/);
    expect(CHAT).toMatch(/educationCreateCohortForm\(programId\)/);
    expect(CHAT).toMatch(/educationAssignLearnerForm\(cohorts, res\.assignable\)/);
    // The one missing question is measured, never the sentence.
    expect(CHAT).toMatch(/step: "company\.invite-learner"/);
    expect(CHAT).toMatch(/step: "company\.create-cohort"/);
    // Readback states the REAL delivery: sent vs created-without-e-mail.
    expect(CHAT).toMatch(/res\.data\?\.outcome === "sent" \? labels\.eduInviteDone : labels\.eduInviteCreatedNoEmail/);
  });
  it("the read adapter is the SAME canonical read the programmes section renders, and names a non-institution honestly", () => {
    expect(ADAPTER).toMatch(/readInstitutionPrograms\(organizationId\)/);
    expect(ADAPTER).toMatch(/kind: "not-institution"/);
    expect(ADAPTER).toMatch(/capabilities\.includes\("training_provider"\)/);
    expect(ADAPTER).not.toMatch(/\.from\(|\.rpc\(/);
  });
});

describe("copy exists in all 11 catalogs (no [EN] debt)", () => {
  const locales = ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"];
  it("chat labels, action labels and form fields", () => {
    for (const locale of locales) {
      const cat = JSON.parse(readFileSync(join(APP, "messages", `${locale}.json`), "utf8"));
      for (const key of ["eduInviteAsk", "eduProgrammesNone", "eduCohortPick", "eduAssignDone", "eduNotInstitution", "chipCreateProgramme", "chipCreateCohort", "chipAssignLearner"]) {
        expect(cat.conversation.chat[key], `${locale}.chat.${key}`).toBeTypeOf("string");
        expect(cat.conversation.chat[key]).not.toMatch(/^\[EN\]/);
      }
      for (const key of ["createProgramme", "createCohort", "assignLearner", "inviteLearner"]) {
        expect(cat.conversation.actions.education[key].label, `${locale}.actions.${key}`).toBeTypeOf("string");
        expect(cat.conversation.actions.education[key].description).toBeTypeOf("string");
      }
      for (const key of ["programmeName", "learnerEmail", "cohortName", "cohortStarts", "cohortEnds", "cohort", "learner"]) {
        expect(cat.conversation.forms.fields[key], `${locale}.fields.${key}`).toBeTypeOf("string");
      }
    }
  });
});
