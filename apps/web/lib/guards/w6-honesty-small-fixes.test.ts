import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard — W6 SMALL HONESTY FIXES (2026-09-06), three defects measured on
 * production `a4bebd9e` with the bounded E2E identities:
 *
 *   1. the dashboard root resolved its role as `profile?.active_role ?? "worker"`,
 *      so a FAILED profiles read landed a company owner in the personal space
 *      as a person — silently. Now: the read state is explicit
 *      (`profileRead`), the pure `decideDashboardRole` decides, and a failed
 *      read with no durable pointer renders a NAMED degrade state (the real
 *      workspace chooser + retry); the layout no longer mistakes a failed
 *      read for "not onboarded";
 *   2. the learner's compass named the institution only from a
 *      `worker_education.is_current` row — never from the active student
 *      engagement (institution↔learner link, #1301) whose name was already
 *      loaded. Now `studyingAt` is derived from the link first;
 *   3. the learner's first screen said "Mokotės su X" twice (the page's own
 *      intro line AND the opening brief). Now the brief is the one source.
 *
 * Source pins only; the pure decisions are tested beside their modules
 * (`lib/auth/dashboard-role-decision.test.ts`, `lib/learning/learning-compass-model.test.ts`).
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf8");

const PAGE = read("app/[locale]/dashboard/page.tsx");
const LAYOUT = read("app/[locale]/dashboard/layout.tsx");
const SESSION = read("lib/auth/session-profile.ts");
const LOCALES = ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"] as const;

describe("1. a failed profile read never silently picks a workspace", () => {
  it("the session reader exposes the read state, distinct from 'no row'", () => {
    expect(SESSION).toMatch(/profileRead:\s*"ok"\s*\|\s*"failed"/);
    expect(SESSION).toMatch(/profileRead:\s*read\.ok\s*\?\s*"ok"\s*:\s*"failed"/);
  });

  it("the dashboard root decides through the pure decision — no `?? \"worker\"` fallback", () => {
    expect(PAGE).not.toMatch(/\?\?\s*"worker"/);
    expect(PAGE).toMatch(/decideDashboardRole\(\{/);
    expect(PAGE).toMatch(/profileRead:\s*session\.profileRead/);
    // the durable pointer is classified against REAL memberships, never trusted raw
    expect(PAGE).toMatch(/classifyDurablePointer\(/);
    expect(PAGE).toMatch(/w\.kind === "organization"/);
  });

  it("the read-failed branch renders the NAMED degrade state with the real chooser and a retry", () => {
    expect(PAGE).toMatch(/decision\.kind === "read-failed"/);
    expect(PAGE).toMatch(/data-testid="dashboard-profile-read-failed"/);
    expect(PAGE).toMatch(/<WorkspaceChip \/>/);
    expect(PAGE).toMatch(/getTranslations\("workspace\.readFailed"\)/);
    expect(PAGE).toMatch(/tRead\("retry"\)/);
  });

  it("the layout does not send a person to onboarding because a read failed", () => {
    expect(LAYOUT).toMatch(/session\.profileRead !== "failed" && !profile\?\.onboarded_at/);
    expect(LAYOUT).not.toMatch(/if \(!profile\?\.onboarded_at\) redirect/);
  });

  it.each(LOCALES)("%s carries workspace.readFailed.{body,choose,retry} as real copy", (loc) => {
    const ws = (JSON.parse(read(`messages/${loc}.json`)) as { workspace: { readFailed?: Record<string, string> } }).workspace.readFailed;
    expect(ws, `${loc}: workspace.readFailed`).toBeTruthy();
    for (const k of ["body", "choose", "retry"] as const) {
      expect(typeof ws?.[k], `${loc}: ${k}`).toBe("string");
      expect(ws?.[k].length, `${loc}: ${k} empty`).toBeGreaterThan(0);
      expect(ws?.[k], `${loc}: ${k} untranslated`).not.toMatch(/\[EN\]/);
    }
  });
});

describe("2. the learner's compass names the institution from the student link", () => {
  const READER = read("lib/learning/learning-compass.ts");
  const SECTION = read("components/app/learning-compass-section.tsx");
  const WORKFLOWS = read("lib/ai-workspace/workflows.ts");

  it("the reader passes the engagement's organization name (same rows, no second read)", () => {
    expect(READER).toMatch(/relationshipSlug === "student" && e\.organizationName\?\.trim\(\)/);
    expect(READER).toMatch(/studentInstitutionName,/);
  });

  it("both renderers read the ONE derived `studyingAt`, not the education row alone", () => {
    expect(SECTION).toMatch(/becoming\.studyingAt \?/);
    expect(SECTION).toMatch(/institution: becoming\.studyingAt/);
    expect(SECTION).not.toMatch(/institution: becoming\.currentEducation\.institutionName/);
    expect(WORKFLOWS).toMatch(/institution: becoming\.studyingAt/);
    expect(WORKFLOWS).not.toMatch(/institution: becoming\.currentEducation\.institutionName/);
  });
});

describe("3. the learner's first screen names the institution once", () => {
  it("the page no longer composes its own learner intro line; the brief is the source", () => {
    expect(PAGE).not.toMatch(/learnerGreetingContext/);
    expect(PAGE).not.toMatch(/learnerContextLine=/);
    expect(read("lib/conversation/opening-brief.ts")).toMatch(/"briefLearner"/);
  });
});
