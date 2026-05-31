import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sanitizeDemandTitle } from "@/lib/demand/sanitize-demand-title";

/**
 * Guard for the invitation / membership-context / admin-mode / legacy-title
 * reality fix.
 *   A — invite UI says "created", never fakes "sent" (no email is wired).
 *   C — worker journal distinguishes the real no-context reason.
 *   D — admin chrome is hidden when the admin opts to work as a normal user
 *       (display-only; permissions untouched).
 *   E — legacy "Pilot request — …" titles are sanitized at display.
 */

const APP = join(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP, rel), "utf8");
}
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

describe("A — invitation copy is truthful (created, not sent)", () => {
  for (const locale of ["en", "lt"] as const) {
    it(`${locale}.json invite copy makes no false 'sent' claim`, () => {
      const raw = read(`messages/${locale}.json`);
      expect(/Invitation sent|Pakvietimas išsiųstas|pakvietimas išsiųstas/.test(raw)).toBe(false);
      const company = (
        JSON.parse(raw) as {
          roleDashboards?: { company?: { workers?: { statusInvited?: string } } };
        }
      ).roleDashboards?.company?.workers;
      expect(company?.statusInvited, `${locale} statusInvited`).toBeTruthy();
      expect(/sent|išsiųst/i.test(company!.statusInvited!)).toBe(false);
    });
  }
});

describe("E — legacy pilot demand titles are sanitized at display", () => {
  it("maps known legacy titles to the de-piloted form", () => {
    expect(sanitizeDemandTitle("Pilot request — hiring workers")).toBe("Hiring workers — demand");
    expect(sanitizeDemandTitle("Pilot request — agency partnership")).toBe("Agency partnership — offer");
  });
  it("strips any unmapped 'Pilot request — …' prefix", () => {
    expect(sanitizeDemandTitle("Pilot request — something else")).toBe("something else");
  });
  it("leaves clean titles untouched", () => {
    expect(sanitizeDemandTitle("Hiring workers — demand")).toBe("Hiring workers — demand");
  });
  it("the product display surfaces run titles through the sanitizer", () => {
    for (const rel of [
      "components/app/demand-requests-readback.tsx",
      "components/app/buyer-requests-section.tsx",
    ]) {
      const src = read(rel);
      expect(src).toMatch(/from\s+["']@\/lib\/demand\/sanitize-demand-title["']/);
      expect(src).toMatch(/sanitizeDemandTitle\(r\.title\)/);
    }
  });
});

describe("D — admin UI is a display toggle, not a permission change", () => {
  it("the header admin badge is gated on the display preference", () => {
    const src = read("components/app/role-switcher.tsx");
    expect(src).toMatch(/isAdmin && !adminUiHidden &&/);
  });
  it("the preference is cookie/display-only (no auth/permission write)", () => {
    const code = stripComments(read("lib/auth/admin-ui-actions.ts"));
    expect(code).toMatch(/cookies\(\)/);
    expect(code).not.toMatch(/profile_roles|active_role|\bis_admin\b|grant|rpc\(/);
  });
});

describe("C — worker journal explains the real no-context reason", () => {
  const page = read("app/[locale]/dashboard/journal/page.tsx");
  it("distinguishes pending / roster / none states", () => {
    expect(page).toMatch(/listMyPendingWorkerInvitations/);
    expect(page).toMatch(/company_workers/);
    expect(page).toMatch(/noContext\.\$\{contextState\}/);
  });
  for (const locale of ["en", "lt"] as const) {
    it(`${locale}/journal.json has the noContext states`, () => {
      const json = JSON.parse(read(`messages/${locale}/journal.json`)) as {
        noContext?: Record<string, string>;
      };
      for (const k of ["none", "pending", "roster"]) {
        expect(json.noContext?.[k], `${locale} noContext.${k}`).toBeTruthy();
      }
    });
  }
});
