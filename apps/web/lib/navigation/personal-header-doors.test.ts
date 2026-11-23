import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { activeLocales } from "@/lib/i18n/config";
import { PERSONAL_HEADER_DOORS, personalHeaderDoors } from "./work-areas";

/**
 * Job search and offers are reachable from the header (coordinator 2026-11-22):
 * a worker in their own workspace finds "Žiūrėti galimybes" and "Rezervacijos"
 * in "More" (desktop) and the area sheet (phone) from every page.
 */
const web = join(__dirname, "..", "..");
const msg = (l: string) => JSON.parse(readFileSync(join(web, "messages", `${l}.json`), "utf8"));
const at = (o: unknown, key: string) => key.split(".").reduce<unknown>((n, k) => (n as Record<string, unknown>)?.[k], o);

describe("the person's own header doors", () => {
  it("job search and the incoming offers, by their existing routes", () => {
    expect(PERSONAL_HEADER_DOORS.map((d) => d.href)).toEqual(["/dashboard/opportunities", "/dashboard/bookings"]);
  });
  it("only for a worker, and only in their own workspace", () => {
    expect(personalHeaderDoors(["worker"], { kind: "personal" })).toHaveLength(2);
    expect(personalHeaderDoors(["worker"], null)).toHaveLength(2);
    expect(personalHeaderDoors(["worker"], { kind: "organization" })).toHaveLength(0);
    expect(personalHeaderDoors(["company"], { kind: "personal" })).toHaveLength(0);
  });
  for (const locale of activeLocales) {
    it(`${locale}: every door has a label`, () => {
      for (const d of PERSONAL_HEADER_DOORS) {
        const label = at(msg(locale), d.tabLabelKey);
        expect(typeof label === "string" && label.trim().length > 0, `${locale} ${d.tabLabelKey}`).toBe(true);
      }
    });
  }
  it("the header puts them first in More and the sheet; organizations keep their own", () => {
    const header = readFileSync(join(web, "components/app/conversation/chat/conversation-header.tsx"), "utf8");
    expect(header).toMatch(/const overflow = \[\.\.\.personalDoors, \.\.\.organizationAreas/);
    expect(header).toMatch(/actingRole === "company" \|\| actingRole === "agency" \? \[\] : personalHeaderDoors\(/);
  });
});
