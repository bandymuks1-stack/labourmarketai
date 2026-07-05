import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard (no-schema UX follow-up): roles are NOT separate products.
 *
 *  1. The agency / buyer "space" labels + role-dashboard titles must use
 *     action / capability framing, never silo-product framing
 *     ("space" / "erdvė" / "пространство" / "workspace"). Agency = a company
 *     capability (partner services); buyer = an action (my requests).
 *  2. The skills review banner copy exists in every active locale and is
 *     honestly "needs review" — never "verified".
 */
const APP_ROOT = join(__dirname, "..", "..");
const ACTIVE = ["lt", "en", "ru"] as const;

function loadMessages(locale: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(APP_ROOT, "messages", `${locale}.json`), "utf8"),
  ) as Record<string, unknown>;
}
function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}

/** Read a dotted path, returning "" when any segment is missing/non-string. */
function str(root: Record<string, unknown>, path: string): string {
  let cur: unknown = root;
  for (const k of path.split(".")) {
    if (cur && typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[k];
    } else {
      return "";
    }
  }
  return typeof cur === "string" ? cur : "";
}

const SILO = /\bspace\b|erdvė|пространств|workspace/i;
const VERIFIED = /verified|patvirtin|подтвержд/i;

describe("agency / buyer are framed as capability/action, not silos", () => {
  for (const locale of ACTIVE) {
    const m = loadMessages(locale);
    it(`${locale}: spaces.agency.name has no silo framing`, () => {
      expect(str(m, "spaces.agency.name")).not.toMatch(SILO);
    });
    it(`${locale}: spaces.buyer.name has no silo framing`, () => {
      expect(str(m, "spaces.buyer.name")).not.toMatch(SILO);
    });
    it(`${locale}: roleDashboards.agency.title has no silo framing`, () => {
      expect(str(m, "roleDashboards.agency.title")).not.toMatch(SILO);
    });
    it(`${locale}: roleDashboards.buyer.title has no silo framing`, () => {
      expect(str(m, "roleDashboards.buyer.title")).not.toMatch(SILO);
    });
  }
});

describe("skills review banner copy is present + honest in every active locale", () => {
  for (const locale of ACTIVE) {
    const m = loadMessages(locale);
    it(`${locale}: skills.reviewBanner has title/body/cta`, () => {
      expect(str(m, "skills.reviewBanner.title"), `${locale} title`).toBeTruthy();
      expect(str(m, "skills.reviewBanner.body"), `${locale} body`).toBeTruthy();
      expect(str(m, "skills.reviewBanner.cta"), `${locale} cta`).toBeTruthy();
    });
    it(`${locale}: review banner title says "needs review", not "verified"`, () => {
      expect(str(m, "skills.reviewBanner.title")).not.toMatch(VERIFIED);
    });
  }
});

describe("two-identity / action model (Asmuo vs Įmonė)", () => {
  const SILO_DESC = /\bspace\b|erdvė|пространств|workspace/i;
  const PERSON = /person|asmuo|человек/i;
  const WORKSPACE_VIEW = /workspace view|darbo erdvės vaizdą|вид рабочего пространства/i;
  for (const locale of ACTIVE) {
    const m = loadMessages(locale);
    it(`${locale}: roles.agency.description has no silo framing`, () => {
      expect(str(m, "roles.agency.description")).not.toMatch(SILO_DESC);
    });
    it(`${locale}: roles.customer.description has no silo framing`, () => {
      expect(str(m, "roles.customer.description")).not.toMatch(SILO_DESC);
    });
    it(`${locale}: onboarding presents the PERSON identity (not a "worker" silo)`, () => {
      expect(str(m, "auth.onboarding.rolePicker.worker.title")).toMatch(PERSON);
    });
    it(`${locale}: role-switch clarity note is account/action framed, not "workspace view"`, () => {
      expect(str(m, "auth.roleSwitcher.clarityNote")).not.toMatch(WORKSPACE_VIEW);
    });
  }
});

describe("company action rooms (buyer/agency) read as actions under Įmonė", () => {
  const buyer = read("app/[locale]/dashboard/buyer/page.tsx");
  const agency = read("app/[locale]/dashboard/agency/page.tsx");
  const COMPANY = /Įmonė|Company|Компани/i;

  it("buyer page shows a company-context breadcrumb + a back-to-action-center link", () => {
    for (const [name, src] of [["buyer", buyer]] as const) {
      expect(src, `${name} company-context`).toMatch(/data-testid="company-context"/);
      expect(src, `${name} back link`).toMatch(/data-testid="back-to-action-center"/);
      expect(src, `${name} backToActions copy`).toMatch(/companyContext|backToActions/);
    }
  });

  it("agency room is no silo at all — a redirect stub under the company (Direction A)", () => {
    // The strongest anti-silo statement: the agency route renders nothing of
    // its own; it folds into the canonical company workspace.
    expect(agency).toMatch(/redirect\(`\/\$\{locale\}\/dashboard\/company`\)/);
  });

  for (const locale of ACTIVE) {
    const m = loadMessages(locale);
    for (const room of ["buyer", "agency"] as const) {
      it(`${locale}: roleDashboards.${room}.companyContext frames it under the company, no silo`, () => {
        const ctx = str(m, `roleDashboards.${room}.companyContext`);
        expect(ctx, `${locale} ${room} companyContext`).toBeTruthy();
        expect(ctx).toMatch(COMPANY);
        expect(ctx).not.toMatch(SILO);
      });
      it(`${locale}: roleDashboards.${room}.backToActions exists`, () => {
        expect(str(m, `roleDashboards.${room}.backToActions`)).toBeTruthy();
      });
    }
  }
});

describe("skills review banner is wired into the profile page", () => {
  const page = read("app/[locale]/dashboard/profile/page.tsx");
  it("imports + renders SkillsReviewBanner with reviewBanner copy", () => {
    expect(page).toMatch(/SkillsReviewBanner/);
    expect(page).toMatch(/reviewBanner\.title/);
  });
  it("the banner component hides itself when count is 0", () => {
    const comp = read("components/app/skills-review-banner.tsx");
    expect(comp).toMatch(/count\s*<=\s*0/);
  });
});
