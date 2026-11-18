/**
 * GUARD — the native app runs an education organization's programmes, cohorts
 * and learners through the web chat's own capabilities (owner order
 * 2026-11-16: one shared client, no parallel backend), sends each confirm with
 * the prepare's own input, and words every line exactly as the web chat does.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");

const LOCALES = ["en", "lt", "ru", "nl", "de", "pl", "sv"] as const;

const FROM_CHAT: Record<string, string> = {
  "education.title": "chipProgrammes",
  "education.none": "eduProgrammesNone",
  "education.membersNotForRole": "eduMembersNotForRole",
  "education.noLearners": "eduAssignNoLearners",
  "education.createProgramme": "chipCreateProgramme",
  "education.createCohort": "chipCreateCohort",
  "education.assignLearner": "chipAssignLearner",
  "education.inviteLearner": "chipEduInviteLearner",
  "education.programmeCreated": "eduProgrammeCreated",
  "education.cohortCreated": "eduCohortCreated",
  "education.assignDone": "eduAssignDone",
  "education.inviteDone": "eduInviteDone",
};

const FROM_FIELDS: Record<string, string> = {
  "education.programmeName": "programmeName",
  "education.programmeNamePlaceholder": "programmeNamePlaceholder",
  "education.cohortName": "cohortName",
  "education.cohortNamePlaceholder": "cohortNamePlaceholder",
  "education.cohortStarts": "cohortStarts",
  "education.cohortEnds": "cohortEnds",
  "education.learnerEmail": "learnerEmail",
  "education.learnerEmailPlaceholder": "learnerEmailPlaceholder",
  "education.learnerName": "learnerName",
};

describe("mobile education workspace", () => {
  const screen = read("apps/mobile/src/screens/education.tsx");

  it("reads and writes through the canonical capabilities only", () => {
    expect(screen).toContain('useCapability<EducationWorkspaceData>("education.workspace.get", NO_ARGS)');
    for (const id of [
      "company.create-programme",
      "company.create-cohort",
      "company.assign-learner",
      "company.invite-learner",
    ]) {
      expect(screen, id).toContain(`capability: "${id}"`);
    }
    expect(screen).toContain("name: `${write.capability}.prepare`");
    expect(screen).toContain("name: `${write.capability}.confirm`");
    expect(screen).not.toMatch(/supabase\s*\.\s*from\(/);
  });

  it("confirms with the prepare's own input and token", () => {
    expect(screen).toMatch(/args: \{ input: prepared\.input, confirmationToken: prepared\.confirmationToken \}/);
  });

  it("offers assigning only to a role that may see membership", () => {
    expect(screen).toContain("data.membersVisible ?");
  });

  it("uses the web chat's own words in every locale", () => {
    const messages = read("apps/mobile/src/i18n/messages.ts");
    for (const locale of LOCALES) {
      const web = JSON.parse(read(`apps/web/messages/${locale}.json`)).conversation as {
        chat: Record<string, string>;
        forms: { fields: Record<string, string> };
      };
      const start = messages.indexOf(locale === "en" ? "const en = {" : `const ${locale}: Catalogue = {`);
      const end = messages.indexOf(locale === "en" ? "\n} as const;" : "\n};", start);
      const block = messages.slice(start, end);
      for (const [k, w] of Object.entries(FROM_CHAT)) {
        expect(block, `${locale} ${k}`).toContain(`"${k}": ${JSON.stringify(web.chat[w])}`);
      }
      for (const [k, w] of Object.entries(FROM_FIELDS)) {
        expect(block, `${locale} ${k}`).toContain(`"${k}": ${JSON.stringify(web.forms.fields[w])}`);
      }
    }
  });
});
