import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ONE "MANAGE THE SERVICES YOU OFFER" LINK (owner P0 2026-11-24, decision
 * 0032). The empty marketplace page showed it three times: in the empty
 * discover list, in the empty incoming list and as a quiet line below. Now
 * exactly one shows: the discover list's when that list is empty; otherwise
 * the incoming list's when the caller has no active service; otherwise the
 * quiet line.
 */
const page = readFileSync(join(__dirname, "..", "..", "app/[locale]/dashboard/service-requests/page.tsx"), "utf8");

describe("the services link shows once", () => {
  it("each placement yields to the one before it", () => {
    expect(page).toMatch(/const discoverCarriesServicesLink = discoverable\.length === 0 && !filter\.active;/);
    expect(page).toMatch(/incomingEmptyCta: ownActive === 0 && !discoverCarriesServicesLink \? t\("linkToServices"\) : null/);
    expect(page).toMatch(/\{!discoverCarriesServicesLink && ownActive > 0 \? \(\s*<Link\s+href=\{"\/dashboard\/services"/);
  });
});
