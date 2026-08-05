import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Project/client create v1 — safety guard. Asserts the first real create flow
 * stays within the hard boundaries: company-scoped, server-validated, RLS-only,
 * no journal linking, no worker mutation, no billing/auth/env/outbound, no fake
 * data, and only the intended project/client context is created.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const action = read("lib/company/project-context-actions.ts");
const form = read("components/app/project-context-create-form.tsx");
const route = read("app/[locale]/dashboard/company/projects/new/page.tsx");
const actionCode = action.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("1 + 9 — create UI: no fake data, only project/client context", () => {
  it("form + route contain no fake/demo/mock/sample/placeholder-as-real data", () => {
    const blob = (form + route).toLowerCase();
    expect(blob).not.toMatch(/\b(demo|fake|mock|seed|sample)\b/);
  });
  it("the only mutation is createProjectContextAction (no other create/insert)", () => {
    expect(form).toMatch(/createProjectContextAction/);
    // The form references no other server action / write.
    expect(form).not.toMatch(/insert|delete|update|assignWorker|linkProject|matchProject/i);
  });
});

describe("2 — journal linking remains disabled / not introduced", () => {
  it("the create action never touches the journal tables (no journal linking)", () => {
    // project_clients.project_id is the legitimate client→project FK, not a
    // journal link; the journal-linking tables must be entirely absent.
    expect(actionCode).not.toMatch(/journal_entries|journal_entry_work_items/);
  });
  it("the form/route never link to the journal", () => {
    expect(form + route).not.toMatch(/journal_entries|journal_entry_work_items|linkJournal/i);
  });
});

describe("3 — no billing/payment/env/auth/outbound surfaces touched", () => {
  it("the action imports only db + the company-resolution helper", () => {
    expect(actionCode).not.toMatch(/stripe|billing|payment|invoice|process\.env|service_role|nodemailer|resend|telegram|whatsapp|fetch\(/i);
  });
});

describe("4 — create is scoped to the company/org context (server-resolved)", () => {
  it("resolves the company from the ACTIVE WORKSPACE and never trusts a client company id", () => {
    // M-P0-3: authority comes from the membership-validated active workspace
    // resolver — never from `companies.profile_id = auth.uid()`.
    expect(actionCode).toMatch(/requireEmployerCompany\(\)/);
    expect(actionCode).not.toMatch(/getOwnCompany/);
    // Rebuild W5: the insert itself moved into THE ONE create core; the
    // server-resolved company id is what gets handed to it.
    expect(actionCode).toMatch(/insertProjectForCompany\(supabase, company\.companyId/);
    // company_id is not read from formData.
    expect(actionCode).not.toMatch(/formData\.get\(["']company_id["']\)|formData\.get\(["']org/);
  });
});

describe("5 — unauthorized roles cannot create", () => {
  it("action fails closed when no valid company workspace is selected", () => {
    // Legitimate non-company contexts (personal workspace, no organization,
    // not-a-member, stale/revoked pointer) → no_company; infrastructure
    // failures → error — never rendered as "you have no organization".
    expect(actionCode).toMatch(/if \(!company\.ok\)/);
    expect(actionCode).toMatch(/isEmployerContextFailure\(company\.reason\)/);
    expect(actionCode).toMatch(/code: "no_company"/);
  });
  it("route is gated to the company role", () => {
    expect(route).toMatch(/requireRoleOrRedirect\(locale, "company"\)/);
  });
});

describe("6 — no worker-side project mutation introduced", () => {
  it("worker journal page has no project create/insert surface", () => {
    const journal = read("app/[locale]/dashboard/journal/page.tsx");
    expect(journal).not.toMatch(/createProjectContextAction|projects"\)\.insert|project_clients/i);
  });
});

describe("7 — server-side validation rejects a missing project name", () => {
  it("validates name length before any insert (action + shared core)", () => {
    expect(actionCode).toMatch(/name\.length < NAME_MIN/);
    expect(actionCode).toMatch(/code: "invalid_name"/);
    // Rebuild W5: the insert lives in the shared core, which validates the
    // title BEFORE the insert — one rule for every entry point.
    const core = read("lib/projects/create-project-core.ts");
    const validIdx = core.indexOf('"invalid_title"');
    const insertIdx = core.indexOf('.from("projects")');
    expect(validIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(validIdx);
  });
});

describe("8 — project count/read state uses real data only", () => {
  it("read helper performs no writes (real RLS-scoped count)", () => {
    const helper = read("lib/company/project-context.ts");
    expect(helper).toMatch(/\.from\("projects"\)/);
    expect(helper).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  });
});

describe("create writes ONLY projects (+ optional project_clients), no service_role", () => {
  it("inserts into projects (via the ONE core) and optionally project_clients, nothing else", () => {
    // Rebuild W5: the projects insert lives in the shared core; the action
    // itself touches only project_clients directly.
    const inserts = [...actionCode.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]);
    expect(new Set(inserts)).toEqual(new Set(["project_clients"]));
    expect(actionCode).toMatch(/insertProjectForCompany/);
    const core = read("lib/projects/create-project-core.ts");
    const coreInserts = [...core.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]);
    expect(new Set(coreInserts)).toEqual(new Set(["projects"]));
    expect(actionCode).not.toMatch(/service_role|createServiceClient|admin client/i);
    expect(core).not.toMatch(/service_role|createServiceClient/i);
  });
});

describe("i18n — create copy exists in LT + EN, no unsupported claims", () => {
  for (const locale of ["lt", "en"] as const) {
    const cp = (JSON.parse(read(`messages/${locale}.json`)) as {
      companyOps: { createProject: Record<string, string> };
    }).companyOps.createProject;
    it(`${locale} has all create keys`, () => {
      for (const k of [
        "entryCta", "title", "subtitle", "nameLabel", "namePlaceholder",
        "locationLabel", "clientLabel", "journalLinkingDisabled", "submit",
        "success", "backToDashboard", "errorName", "errorNoCompany", "error",
      ]) {
        expect(cp[k], `${locale} createProject.${k}`).toBeTruthy();
      }
    });
    it(`${locale} states journal linking is not enabled`, () => {
      expect(cp.journalLinkingDisabled.toLowerCase()).toMatch(/neįjungt|not enabled/);
    });
    it(`${locale} makes no unsupported verified/AI/matched/linked claim`, () => {
      const blob = Object.values(cp).join(" ").toLowerCase();
      expect(blob).not.toMatch(/verified|ai-ready|automatically linked|matched|journal connected|client approved/);
    });
  }
});
