import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard: every company action room (/dashboard/company, /candidates, /buyer,
 * /agency, /projects) has a consistent practical entry — a next-actions card,
 * a company-context breadcrumb, and a back-to-action-center link — and frames
 * itself as an ACTION under the company identity, never a separate top-level
 * system (no space/erdvė/пространство/workspace wording in the room context).
 */
const APP_ROOT = join(__dirname, "..", "..");
const ACTIVE = ["lt", "en", "ru"] as const;
// Direction A (2026-07-05): the agency room is a redirect stub into the
// canonical company workspace (agency = company_type 'staffing_agency'), so
// it left the rendered-rooms set. Its companyActionRooms.* copy stays in the
// catalogs until the owner-gated legacy cleanup, and stays pinned below.
const ROOMS = ["company", "candidates", "buyer", "projects"] as const;
const COPY_ROOMS = [...ROOMS, "agency"] as const;

function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}
function loadMessages(locale: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(APP_ROOT, "messages", `${locale}.json`), "utf8"),
  ) as Record<string, unknown>;
}
function str(root: Record<string, unknown>, path: string): string {
  let cur: unknown = root;
  for (const k of path.split(".")) {
    if (cur && typeof cur === "object") cur = (cur as Record<string, unknown>)[k];
    else return "";
  }
  return typeof cur === "string" ? cur : "";
}

const SILO = /\bspace\b|erdvė|пространств|workspace/i;
const COMPANY = /Įmonė|Company|Компани/i;

describe("company action rooms — consistent next-actions + framing", () => {
  for (const room of ROOMS) {
    const src = read(`app/[locale]/dashboard/${room}/page.tsx`);
    it(`${room}: mounts the shared next-actions card`, () => {
      expect(src).toMatch(/<CompanyActionNextActions\b/);
    });
    it(`${room}: has a company-context breadcrumb + back-to-action-center link`, () => {
      expect(src, `${room} company-context`).toMatch(/data-testid="company-context"/);
      expect(src, `${room} back link`).toMatch(/data-testid="back-to-action-center"/);
    });
  }

  it("the shared card component reads room copy + renders a primary action", () => {
    const comp = read("components/app/company-action-next-actions.tsx");
    expect(comp).toMatch(/companyActionRooms/);
    expect(comp).toMatch(/data-testid="company-action-primary"/);
  });

  it("the shared card renders a practical 3-step flow", () => {
    const comp = read("components/app/company-action-next-actions.tsx");
    expect(comp).toMatch(/data-testid="company-action-flow"/);
    expect(comp).toMatch(/flow\.\$\{step\}|flow\.step/);
  });
});

describe("company action room copy present + non-silo in every active locale", () => {
  for (const locale of ACTIVE) {
    const m = loadMessages(locale);
    it(`${locale}: backToActions exists`, () => {
      expect(str(m, "companyActionRooms.backToActions")).toBeTruthy();
    });
    for (const room of COPY_ROOMS) {
      it(`${locale}: ${room} has whatTitle/whatBody/primaryLabel/nextLine`, () => {
        for (const k of ["whatTitle", "whatBody", "primaryLabel", "nextLine"]) {
          expect(
            str(m, `companyActionRooms.${room}.${k}`),
            `${locale} ${room}.${k}`,
          ).toBeTruthy();
        }
      });
      it(`${locale}: ${room} has a 3-step practical flow`, () => {
        for (const s of ["step1", "step2", "step3"]) {
          expect(
            str(m, `companyActionRooms.${room}.flow.${s}`),
            `${locale} ${room}.flow.${s}`,
          ).toBeTruthy();
        }
      });
      it(`${locale}: ${room} context frames under the company, no silo`, () => {
        const ctx = str(m, `companyActionRooms.${room}.context`);
        expect(ctx, `${locale} ${room}.context`).toBeTruthy();
        expect(ctx).toMatch(COMPANY);
        expect(ctx).not.toMatch(SILO);
      });
    }
  }
});
