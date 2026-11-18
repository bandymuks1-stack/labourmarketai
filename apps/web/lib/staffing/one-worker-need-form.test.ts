import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { COMPANY_NEED_ENTRY } from "@/lib/staffing/company-need-prefill";
import { buildWorkCategoryOptions } from "@/lib/taxonomy/work-categories";

/**
 * ONE WORKER NEED, ONE FORM (doctrine §17; employer path P0 2026-11-15, F5).
 *
 * The landing's worker-search door had its own short form, stored through the
 * same intake as /company-need but with other fields. It now opens /company-need,
 * and that form takes everything the door asked: nothing the door collected is
 * lost, and its privacy notice comes along.
 */

const read = (rel: string) => readFileSync(resolve(__dirname, "..", "..", rel), "utf8");
const door = read("components/marketing/landing-request-doors-form.tsx");
const form = read("components/app/company-need-form.tsx");
const page = read("app/[locale]/(marketing)/company-need/page.tsx");
const action = read("lib/staffing/company-need-form-actions.ts");

describe("the worker-search door opens the one need form", () => {
  it("in both layouts it is a link to /company-need, naming the door as `from`", () => {
    expect(door).toMatch(
      /const WORKER_SEARCH_FORM = \{ pathname: "\/company-need", query: \{ from: "request_worker_search" \} \} as const;/,
    );
    expect(door.match(/href=\{WORKER_SEARCH_FORM\}/g)).toHaveLength(2);
    expect(COMPANY_NEED_ENTRY.test("request_worker_search")).toBe(true);
  });

  it("its short form is gone from the landing; the B2B and project forms stay", () => {
    for (const field of ['name="profession"', 'name="workers"', 'name="start"', 'name="details"']) {
      expect(door, field).not.toContain(field);
    }
    expect(door).toMatch(/door === "b2b"/);
    expect(door).toMatch(/door === "project"/);
  });

  it("an older #request=worker-search link opens the one form too", () => {
    expect(door).toMatch(/if \(wanted === "worker-search"\) \{[\s\S]{0,200}window\.location\.assign\(/);
  });
});

describe("/company-need takes everything the door asked", () => {
  it("company or name, e-mail and the optional phone (stored as the contact phone)", () => {
    expect(form).toMatch(/name="company_name" required/);
    expect(form).toMatch(/name="contact_email" required/);
    expect(form).toMatch(/type="tel" name="contact_phone" maxLength=\{40\}/);
    expect(action).toMatch(/contactPhone: str\(formData\.get\("contact_phone"\)\)\?\.slice\(0, 40\) \|\| undefined/);
    // The phone's label and its "optional" mark are the door's own words.
    expect(page).toMatch(/phone=\{\{ label: tDoor\("phone"\), optional: tDoor\("optional"\) \}\}/);
  });

  it("the work: a category, and for work no category names, its own words", () => {
    expect(form).toMatch(/name="profession" required/);
    const slugs = buildWorkCategoryOptions("en").flatMap((g) => g.options.map((o) => o.slug));
    expect(slugs).toContain("other_general");
    expect(form).toMatch(/name="description" required rows=\{4\} maxLength=\{8000\}/);
  });

  it("as many workers as the door accepted, a start date, the country and the city", () => {
    expect(form).toMatch(/name="number_of_workers" min=\{1\} max=\{100000\}/);
    expect(form).toMatch(/type="date" name="start_date"/);
    expect(form).toMatch(/name="country" required/);
    expect(form).toMatch(/name="city_region" maxLength=\{160\}/);
  });

  it("the door's privacy notice is shown before sending, with its link", () => {
    expect(form).toMatch(/data-testid="company-need-privacy-notice">\{notice\}</);
    expect(page).toMatch(/const privacyNotice = tDoor\.rich\("notice", \{[\s\S]{0,200}href="\/legal\/privacy"/);
    expect(page).toMatch(/notice=\{privacyNotice\}/);
    for (const locale of ["en", "lt", "de", "nl", "pl", "ru", "sv"]) {
      const doors = (JSON.parse(read(`messages/${locale}.json`)) as {
        landing: { requestDoors: Record<string, string> };
      }).landing.requestDoors;
      expect(doors.notice, locale).toMatch(/<privacy>.+<\/privacy>/);
      expect(doors.phone, locale).toBeTruthy();
      expect(doors.optional, locale).toBeTruthy();
    }
  });
});
