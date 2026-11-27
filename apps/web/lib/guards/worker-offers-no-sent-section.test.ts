import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A WORKER'S OFFERS PAGE CARRIES NO EMPLOYER SECTION (design audit
 * 2026-11-22). Only an organization proposes bookings; a person with no
 * organization saw "Offers you sent — workers you offered work to" with an
 * empty box. The section shows when it has rows, when the person holds an
 * organization, or when the memberships could not be read in full.
 */
const page = readFileSync(join(__dirname, "..", "..", "app/[locale]/dashboard/bookings/page.tsx"), "utf8");

describe("the sent-offers section is an organization's", () => {
  it("is drawn only when there are rows or the person may have sent one", () => {
    expect(page).toMatch(/\{result\.outgoing\.length > 0 \|\| mayHaveSent \? \(\s*<Section\s+title=\{t\("outgoing\.title"\)\}/);
  });
  it("'may have sent' is an organization membership, or memberships unknown", () => {
    expect(page).toMatch(/workspace === null \|\|\s*workspace\.membershipsComplete === false \|\|\s*workspace\.workspaces\.some\(\(w\) => w\.kind === "organization"\)/);
  });
  it("the incoming offers are always shown", () => {
    expect(page).toMatch(/<Section\s+title=\{t\("incoming\.title"\)\}/);
  });
});
