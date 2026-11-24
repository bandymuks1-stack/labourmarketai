import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ORGANIZATION_DOOR_ROUTES } from "@/lib/company/organization-doors";

/**
 * EVERY DOOR KEEPS THE DOORS (carousel navigation spec N7a,
 * docs/design/CAROUSEL_NAVIGATION_SPEC.md §8.2, finding M2).
 *
 * `app/[locale]/dashboard/company/layout.tsx` promises "a person never loses
 * the doors while standing inside one of them". Two doors led outside that
 * layout and lost the strip: the calendar (`/dashboard/planning`) and the
 * marketplace (`/dashboard/service-requests`). Every door's target now
 * renders `OrganizationDoorsServer`, either through the company layout or on
 * the page itself; a new door that leads elsewhere must mount it too.
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const MOUNT = /<OrganizationDoorsServer\b/;

describe("every organization door's page shows the doors", () => {
  it("the company layout mounts the strip for every /dashboard/company route", () => {
    expect(read("app/[locale]/dashboard/company/layout.tsx")).toMatch(MOUNT);
  });

  for (const [door, route] of Object.entries(ORGANIZATION_DOOR_ROUTES)) {
    it(`door "${door}" (${route})`, () => {
      if (route === "/dashboard/company" || route.startsWith("/dashboard/company/")) {
        // Covered by the company layout above.
        return;
      }
      const page = `app/[locale]${route}/page.tsx`;
      expect(existsSync(join(WEB, page)), page).toBe(true);
      expect(read(page), page).toMatch(MOUNT);
    });
  }
});
